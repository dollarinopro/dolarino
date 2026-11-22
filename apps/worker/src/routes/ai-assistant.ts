import { Hono } from 'hono';
import {
  DOLLARINO_CREATOR_INFO,
  listSelectableAIModels,
  runDedicatedAIChat,
} from '../ai/assistant.js';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';

export const aiAssistantRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
aiAssistantRoutes.use('*', requireAuth);

aiAssistantRoutes.get('/models', async (c) => {
  const user = c.get('user');
  const data = await listSelectableAIModels(c.env, user.id);
  return c.json({
    ...data,
    creator: DOLLARINO_CREATOR_INFO,
  });
});

aiAssistantRoutes.post('/select-model', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ modelId?: string }>().catch(() => ({ modelId: '' }));
  const modelId = String(body.modelId || '').trim();
  const { models } = await listSelectableAIModels(c.env, user.id);
  const found = models.find((m) => m.id === modelId);
  if (!found) {
    return c.json({ error: 'مدل انتخاب‌شده یافت نشد یا فعال نیست.' }, 404);
  }
  await c.env.DB.prepare(`UPDATE users SET preferred_ai_model_id = ? WHERE id = ?`)
    .bind(found.id, user.id)
    .run();
  return c.json({ ok: true, selectedModelId: found.id, model: found });
});

aiAssistantRoutes.get('/sessions', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT id, title, model_id, created_at, updated_at
     FROM ai_chat_sessions
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT 30`
  )
    .bind(user.id)
    .all<{ id: string; title: string; model_id: string | null; created_at: string; updated_at: string }>()
    .catch(() => ({ results: [] }));
  return c.json({ sessions: rows.results });
});

aiAssistantRoutes.post('/sessions', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ title?: string; modelId?: string }>().catch(() => ({} as { title?: string; modelId?: string }));
  const id = randomId('aichat');
  const title = (body.title || 'گفتگوی جدید هوش مصنوعی').trim().slice(0, 60);
  await c.env.DB.prepare(
    `INSERT INTO ai_chat_sessions (id, user_id, title, model_id) VALUES (?, ?, ?, ?)`
  )
    .bind(id, user.id, title, body.modelId || null)
    .run();
  return c.json({
    session: {
      id,
      title,
      model_id: body.modelId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
});

aiAssistantRoutes.get('/sessions/:id', async (c) => {
  const user = c.get('user');
  const sid = c.req.param('id');
  const session = await c.env.DB.prepare(
    `SELECT id, title, model_id, created_at, updated_at FROM ai_chat_sessions WHERE id = ? AND user_id = ? LIMIT 1`
  )
    .bind(sid, user.id)
    .first();
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const msgs = await c.env.DB.prepare(
    `SELECT id, role, content, has_image, model_id, model_label, setup_json, created_at
     FROM ai_chat_messages
     WHERE session_id = ? AND user_id = ?
     ORDER BY created_at ASC
     LIMIT 150`
  )
    .bind(sid, user.id)
    .all<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      has_image: number;
      model_id: string | null;
      model_label: string | null;
      setup_json: string | null;
      created_at: string;
    }>()
    .catch(() => ({ results: [] }));

  const messages = msgs.results.map((m) => {
    let setup = null;
    if (m.setup_json) {
      try {
        setup = JSON.parse(m.setup_json);
      } catch {
        setup = null;
      }
    }
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      hasImage: Boolean(m.has_image),
      modelId: m.model_id,
      modelLabel: m.model_label,
      setup,
      createdAt: m.created_at,
    };
  });

  return c.json({ session, messages });
});

aiAssistantRoutes.delete('/sessions/:id', async (c) => {
  const user = c.get('user');
  const sid = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM ai_chat_sessions WHERE id = ? AND user_id = ?`).bind(sid, user.id).run();
  return c.json({ ok: true });
});

aiAssistantRoutes.post('/chat', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    sessionId?: string | null;
    modelId?: string | null;
    message?: string;
    imageDataUrl?: string | null;
  }>().catch(() => ({} as { sessionId?: string; modelId?: string; message?: string; imageDataUrl?: string }));

  const message = String(body.message || '').trim();
  const imageDataUrl = body.imageDataUrl ? String(body.imageDataUrl).trim() : null;

  if (!message && !imageDataUrl) {
    return c.json({ error: 'لطفاً پیام متنی یا تصویر چارت ارسال کنید.' }, 400);
  }
  if (imageDataUrl) {
    if (!imageDataUrl.startsWith('data:image/')) {
      return c.json({ error: 'فرمت تصویر نامعتبر است.' }, 400);
    }
    if (imageDataUrl.length > 6_500_000) {
      return c.json({ error: 'حجم تصویر بیش از حد مجاز است (حداکثر ۴ مگابایت).' }, 400);
    }
  }

  if (body.modelId) {
    await c.env.DB.prepare(`UPDATE users SET preferred_ai_model_id = ? WHERE id = ?`)
      .bind(body.modelId, user.id)
      .run()
      .catch(() => {});
  }

  const res = await runDedicatedAIChat(c.env, {
    userId: user.id,
    sessionId: body.sessionId || null,
    modelId: body.modelId || null,
    message,
    imageDataUrl,
  });

  return c.json(res);
});
