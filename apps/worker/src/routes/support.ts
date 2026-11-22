import { Hono } from 'hono';
import { callMultimodalChatAI, detectVisionSupport, resolveModelRecordById } from '../ai/assistant.js';
import { generateSupportAIReply } from '../ai/providers.js';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserEntitlement } from './subscriptions.js';
import { ANTI_SCAM_WARNING_FA, OFFICIAL_BOT_HANDLE, OFFICIAL_CHANNEL_HANDLE } from '../telegram/formatter.js';
import { notifyAllAdmins, notifyAllAdminsPhoto } from '../telegram/publisher.js';

export const supportRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
supportRoutes.use('*', requireAuth);

async function buildUserSupportContext(db: D1Database, user: AppVariables['user']): Promise<string> {
  const [cfg, ent, userRow, exRows] = await Promise.all([
    db.prepare(`SELECT bot_state, trading_mode, strategy_key, symbol FROM bot_configs WHERE user_id = ? LIMIT 1`)
      .bind(user.id)
      .first<{ bot_state: string; trading_mode: string; strategy_key: string; symbol: string }>()
      .catch(() => null),
    resolveUserEntitlement(db, user).catch(() => null),
    db.prepare(`SELECT trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, trust_wallet_verified, ui_mode FROM users WHERE id = ? LIMIT 1`)
      .bind(user.id)
      .first<{
        trust_wallet_address: string | null;
        trust_wallet_tron: string | null;
        trust_wallet_solana: string | null;
        trust_wallet_ton: string | null;
        trust_wallet_verified: number;
        ui_mode: string | null;
      }>()
      .catch(() => null),
    db.prepare(`SELECT provider, is_active FROM exchange_connections WHERE user_id = ? AND is_active = 1`)
      .bind(user.id)
      .all<{ provider: string }>()
      .catch(() => ({ results: [] })),
  ]);

  const plan = ent ? `${ent.planNameFa}${ent.daysRemaining ? ` (${ent.daysRemaining}d left)` : ''}` : 'Standard';
  const exchanges = exRows.results.map((r) => r.provider).join(', ') || 'paper';
  const twChains = [
    userRow?.trust_wallet_address ? `EVM(${userRow.trust_wallet_address.slice(0, 6)}..)` : '',
    userRow?.trust_wallet_solana ? 'SOL' : '',
    userRow?.trust_wallet_ton ? 'TON' : '',
    userRow?.trust_wallet_tron ? 'TRON' : '',
  ].filter(Boolean);
  const tw = twChains.length ? `Connected [${twChains.join(', ')}]` : 'Not linked';
  return `Plan: ${plan} | Bot: ${cfg?.bot_state || 'STOPPED'} (${cfg?.trading_mode || 'PAPER'}, strategy: ${cfg?.strategy_key || 'dollarino_v01'}) | Exchanges: ${exchanges} | TrustWallet: ${tw}`;
}

supportRoutes.get('/tickets', async (c) => {
  const user = c.get('user');

  const [ticketsRes, msgsRes, tgSetting, antiScamSetting] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM support_tickets WHERE user_id = ? ORDER BY last_message_at DESC LIMIT 20`
    ).bind(user.id).all<{
      id: string;
      user_id: string;
      subject: string;
      status: string;
      channel: string;
      support_mode?: string;
      last_message_at: string;
      created_at: string;
    }>().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT sm.*
       FROM support_messages sm
       JOIN support_tickets st ON st.id = sm.ticket_id
       WHERE st.user_id = ?
       ORDER BY sm.created_at ASC LIMIT 200`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'telegram_support'`)
      .first<{ value: string }>().catch(() => null),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'anti_scam_notice_fa'`)
      .first<{ value: string }>().catch(() => null),
  ]);

  const rawSupport = tgSetting?.value || OFFICIAL_BOT_HANDLE;
  const telegramSupport = /Dollarino_admin/i.test(rawSupport) ? OFFICIAL_BOT_HANDLE : rawSupport;

  return c.json({
    tickets: ticketsRes.results,
    messages: msgsRes.results,
    telegramSupport,
    officialChannel: OFFICIAL_CHANNEL_HANDLE,
    antiScamNotice: antiScamSetting?.value || ANTI_SCAM_WARNING_FA,
  });
});

supportRoutes.post('/message', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    ticketId?: string;
    subject?: string;
    message?: string;
    imageDataUrl?: string | null;
    mode?: 'AI' | 'HUMAN' | 'ESCALATE';
  }>().catch(() => ({} as { ticketId?: string; subject?: string; message?: string; imageDataUrl?: string | null; mode?: 'AI' | 'HUMAN' | 'ESCALATE' }));

  const rawText = String(body.message || '').trim();
  const rawImg = body.imageDataUrl ? String(body.imageDataUrl).trim() : '';
  if (rawImg && (!rawImg.startsWith('data:image/') || rawImg.length > 4_500_000)) {
    return c.json({ error: 'فرمت تصویر نامعتبر است یا حجم آن بیش از حد مجاز (۴ مگابایت) است.' }, 400);
  }
  const imageDataUrl = rawImg || null;
  if (!rawText && !imageDataUrl) {
    return c.json({ error: 'متن پیام یا تصویر پشتیبانی نمی‌تواند خالی باشد.' }, 400);
  }
  const text = rawText || '📷 تصویر پیوست‌شده در پشتیبانی';

  let ticketId = (body.ticketId || '').trim();
  let currentMode = 'AI_ASSISTANT';
  if (ticketId) {
    const own = await c.env.DB.prepare(
      `SELECT id, COALESCE(support_mode, 'AI_ASSISTANT') as support_mode FROM support_tickets WHERE id = ? AND user_id = ? LIMIT 1`
    ).bind(ticketId, user.id).first<{ id: string; support_mode: string }>();
    if (!own) ticketId = '';
    else currentMode = own.support_mode || 'AI_ASSISTANT';
  }

  if (!ticketId) {
    const openExisting = await c.env.DB.prepare(
      `SELECT id, COALESCE(support_mode, 'AI_ASSISTANT') as support_mode FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
    ).bind(user.id).first<{ id: string; support_mode: string }>();
    if (openExisting) {
      ticketId = openExisting.id;
      currentMode = openExisting.support_mode || 'AI_ASSISTANT';
    } else {
      ticketId = randomId('tkt');
      const initMode = body.mode === 'HUMAN' || body.mode === 'ESCALATE' ? 'HUMAN_ADMIN' : 'AI_ASSISTANT';
      currentMode = initMode;
      await c.env.DB.prepare(
        `INSERT INTO support_tickets (id, user_id, subject, status, channel, support_mode) VALUES (?, ?, ?, 'OPEN', 'WEB', ?)`
      ).bind(ticketId, user.id, (body.subject || 'پشتیبانی آنلاین دلارینو').trim().slice(0, 100), initMode).run();
    }
  }

  const wantsHuman = body.mode === 'HUMAN' || body.mode === 'ESCALATE' || currentMode === 'HUMAN_ADMIN';
  const msgId = randomId('smsg');
  await c.env.DB.prepare(
    `INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message, image_data_url)
     VALUES (?, ?, ?, 'user', ?, ?, ?)`
  ).bind(msgId, ticketId, user.id, user.username || user.email, text.slice(0, 2000), imageDataUrl).run();

  if (wantsHuman) {
    await c.env.DB.prepare(
      `UPDATE support_tickets SET status = 'OPEN', support_mode = 'HUMAN_ADMIN', escalated_at = COALESCE(escalated_at, datetime('now')), last_message_at = datetime('now') WHERE id = ?`
    ).bind(ticketId).run();

    const alert = [
      `💬 درخواست پشتیبانی مستقیم با مدیران (وب)`,
      `کاربر: ${user.username} (${user.email})`,
      `تیکت: ${ticketId}`,
      ``,
      text.slice(0, 750),
    ].join('\n');

    const adminOpts = {
      inlineKeyboard: [
        [{ text: '✍️ پاسخ آنلاین به این تیکت', callback_data: `adm:sup_reply:${ticketId}`, style: 'primary' as const }],
      ],
    };
    if (imageDataUrl) {
      await notifyAllAdminsPhoto(c.env, imageDataUrl, alert, adminOpts).catch(() => {});
    } else {
      await notifyAllAdmins(c.env, alert, adminOpts).catch(() => {});
    }

    return c.json({ ok: true, ticketId, messageId: msgId, imageDataUrl, supportMode: 'HUMAN_ADMIN', aiReply: null }, 201);
  }

  // AI Support Mode: answer immediately while keeping option to escalate to humans
  const recentRows = await c.env.DB.prepare(
    `SELECT sender_role, message FROM support_messages WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 8`
  ).bind(ticketId).all<{ sender_role: string; message: string }>().catch(() => ({ results: [] }));

  const contextSummary = await buildUserSupportContext(c.env.DB, user);
  let aiReplyText = '';
  let usedModelLabel = 'Dollarino AI Support Core';

  if (imageDataUrl) {
    const resolved = await resolveModelRecordById(c.env, user.id, null).catch(() => null);
    if (resolved && detectVisionSupport(resolved.record.provider, resolved.record.model, resolved.record.label)) {
      try {
        const visionAns = await callMultimodalChatAI(
          resolved.record,
          `شما دستیار پشتیبانی رسمی پلتفرم دلارینو هستید. کاربر اسکرین‌شات خطا، رسید یا صفحه پلتفرم را فرستاده است. تصویر را دقیق بررسی کنید و با زبان فارسی محترمانه و روشن راهنمایی کنید. اطلاعات حساب: ${contextSummary}`,
          [],
          text,
          imageDataUrl
        );
        if (visionAns?.trim()) {
          aiReplyText = visionAns.trim().slice(0, 1800);
          usedModelLabel = resolved.meta.label;
        }
      } catch {
        // fallback to text support AI below
      }
    }
  }

  if (!aiReplyText) {
    const aiRes = await generateSupportAIReply(c.env, {
      userId: user.id,
      username: user.username || user.email,
      question: imageDataUrl
        ? `${text}\n\n[کاربر یک تصویر اسکرین‌شات هم پیوست کرده است؛ در صورت نیاز به بررسی تصویری توسط پشتیبان انسانی، راهنمایی کن دکمه «گفتگو با مدیران انسانی» را بزند تا عکس مستقیم به مدیران مخابره شود.]`
        : text,
      contextSummary,
      recentMessages: recentRows.results.reverse(),
    });
    aiReplyText = aiRes.reply;
    usedModelLabel = aiRes.usedModel;
  }

  const aiMsgId = randomId('smsg');
  await c.env.DB.prepare(
    `INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message)
     VALUES (?, ?, ?, 'ai', ?, ?)`
  ).bind(aiMsgId, ticketId, user.id, `دستیار هوشمند دلارینو (${usedModelLabel})`, aiReplyText).run();

  await c.env.DB.prepare(
    `UPDATE support_tickets SET status = 'OPEN', support_mode = 'AI_ASSISTANT', last_message_at = datetime('now') WHERE id = ?`
  ).bind(ticketId).run();

  return c.json(
    {
      ok: true,
      ticketId,
      messageId: msgId,
      imageDataUrl,
      supportMode: 'AI_ASSISTANT',
      aiReply: {
        id: aiMsgId,
        sender_role: 'ai',
        sender_name: `دستیار هوشمند دلارینو (${usedModelLabel})`,
        message: aiReplyText,
      },
    },
    201
  );
});

supportRoutes.post('/escalate', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ ticketId?: string; reason?: string }>().catch(
    () => ({} as { ticketId?: string; reason?: string })
  );

  let ticketId = (body.ticketId || '').trim();
  if (!ticketId) {
    const openExisting = await c.env.DB.prepare(
      `SELECT id FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
    ).bind(user.id).first<{ id: string }>();
    ticketId = openExisting?.id || '';
  }

  if (!ticketId) {
    ticketId = randomId('tkt');
    await c.env.DB.prepare(
      `INSERT INTO support_tickets (id, user_id, subject, status, channel, support_mode, escalated_at) VALUES (?, ?, 'ارتباط مستقیم با مدیران', 'OPEN', 'WEB', 'HUMAN_ADMIN', datetime('now'))`
    ).bind(ticketId, user.id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE support_tickets SET support_mode = 'HUMAN_ADMIN', escalated_at = datetime('now'), status = 'OPEN', last_message_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).bind(ticketId, user.id).run();
  }

  const sysMsgId = randomId('smsg');
  const note = body.reason?.trim()
    ? `درخواست ارتباط مستقیم با مدیران پشتیبانی ثبت شد. پیام شما: «${body.reason.trim()}»`
    : 'تیکت شما با اولویت به پنل مدیران انسانی دلارینو ارجاع داده شد. پاسخ مدیریت به‌زودی در همین گفتگو و ربات تلگرام برایتان ارسال می‌شود.';
  await c.env.DB.prepare(
    `INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message) VALUES (?, ?, ?, 'system', 'سیستم پشتیبانی', ?)`
  ).bind(sysMsgId, ticketId, user.id, note).run();

  const lastUserMsg = await c.env.DB.prepare(
    `SELECT message FROM support_messages WHERE ticket_id = ? AND sender_role = 'user' ORDER BY created_at DESC LIMIT 1`
  ).bind(ticketId).first<{ message: string }>().catch(() => null);

  await notifyAllAdmins(
    c.env,
    `👨‍💼 درخواست گفتگوی مستقیم کاربر با مدیران (وب)\nکاربر: ${user.username} (${user.email})\nتیکت: ${ticketId}\nآخرین پیام: ${lastUserMsg?.message || body.reason || 'درخواست ارتباط مستقیم'}`,
    {
      inlineKeyboard: [
        [{ text: '✍️ پاسخ آنلاین به این تیکت', callback_data: `adm:sup_reply:${ticketId}`, style: 'primary' }],
      ],
    }
  ).catch(() => {});

  return c.json({ ok: true, ticketId, supportMode: 'HUMAN_ADMIN', systemMessage: note });
});

supportRoutes.post('/switch-ai', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ ticketId?: string }>().catch(() => ({} as { ticketId?: string }));
  const ticketId = (body.ticketId || '').trim();
  if (ticketId) {
    await c.env.DB.prepare(
      `UPDATE support_tickets SET support_mode = 'AI_ASSISTANT', last_message_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).bind(ticketId, user.id).run();
  }
  return c.json({ ok: true, supportMode: 'AI_ASSISTANT' });
});
