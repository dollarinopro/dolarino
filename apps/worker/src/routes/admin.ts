import { Hono } from 'hono';
import type { DollarinoSignal } from '@dollarino/core';
import {
  getPlatformAISummary,
  testAllPlatformAIEngines,
} from '../ai/providers.js';
import { requireAuth, type AppVariables } from '../auth.js';
import { encryptVaultJson, maskSecret, randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { fetchPublicMarket24h } from '../exchanges/paper.js';
import { TelegramBotClient } from '../telegram/client.js';
import {
  promptCopyTraderPublish,
  publishChannelNews,
  publishSignalBroadcast,
  resolveChannelAndBotConfig,
} from '../telegram/publisher.js';
import { confirmAndMirrorCopyTrade } from '../engine/copy-mirror.js';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
adminRoutes.use('*', requireAuth);

adminRoutes.use('*', async (c, next) => {
  const u = c.get('user');
  const ownerTg = c.env.OWNER_TELEGRAM_ID || '944021185';
  const isOwnerOrAdmin = u.role === 'owner' || u.role === 'admin' || (u.telegramId && u.telegramId === ownerTg);
  if (!isOwnerOrAdmin) return c.json({ error: 'Admin access required' }, 403);
  await next();
});

adminRoutes.get('/overview', async (c) => {
  const [users, trades, signals, bots, settings, aiSummary, plans, subs, openSupport, copyTraders, dexStats, revRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, email, username, role, is_blocked, telegram_id, telegram_username,
              phone_number, phone_verified, trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, trust_wallet_verified, ui_mode,
              wallet_balance_usdt, created_at, last_active_at
       FROM users ORDER BY created_at DESC LIMIT 250`
    ).all<{
      id: string;
      email: string;
      username: string;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      telegram_username: string | null;
      phone_number: string | null;
      phone_verified: number;
      trust_wallet_address: string | null;
      trust_wallet_tron: string | null;
      trust_wallet_solana: string | null;
      trust_wallet_ton: string | null;
      trust_wallet_verified: number;
      ui_mode: string | null;
      wallet_balance_usdt: number;
      created_at: string;
      last_active_at: string | null;
    }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_count,
              COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as total_pnl
       FROM trades`
    ).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM signals`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM telegram_bots`).first(),
    c.env.DB.prepare(`SELECT key, value FROM system_settings`).all<{ key: string; value: string }>(),
    getPlatformAISummary(c.env),
    c.env.DB.prepare(`SELECT * FROM subscription_plans ORDER BY sort_order ASC`).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT user_id, plan_code, expires_at FROM user_subscriptions WHERE status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY expires_at DESC`
    ).all<{ user_id: string; plan_code: string; expires_at: string | null }>().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM support_tickets WHERE status = 'OPEN'`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM copy_traders WHERE is_active = 1`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_count FROM dex_trades`).first<{ total: number; open_count: number }>().catch(() => ({ total: 0, open_count: 0 })),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount_usd), 0) as total_usd FROM user_subscriptions WHERE status = 'ACTIVE'`).first<{ total_usd: number }>().catch(() => ({ total_usd: 0 })),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settings.results) settingsMap[s.key] = s.value;

  const activeSubByUser = new Map<string, { plan_code: string; expires_at: string | null }>();
  for (const s of subs.results) {
    if (!activeSubByUser.has(s.user_id)) activeSubByUser.set(s.user_id, s);
  }

  const enrichedUsers = users.results.map((u) => {
    const sub = activeSubByUser.get(u.id);
    return {
      ...u,
      activePlan: sub?.plan_code || (u.role === 'owner' || u.role === 'admin' ? 'vip_owner' : null),
      subscriptionExpiresAt: sub?.expires_at || null,
    };
  });

  const phoneVerifiedCount = enrichedUsers.filter((u) => u.phone_verified === 1).length;
  const trustWalletConnectedCount = enrichedUsers.filter((u) => Boolean(u.trust_wallet_address || u.trust_wallet_tron || u.trust_wallet_solana || u.trust_wallet_ton)).length;

  return c.json({
    users: enrichedUsers,
    stats: {
      totalUsers: enrichedUsers.length,
      phoneVerifiedCount,
      trustWalletConnectedCount,
      activeSubscriptions: activeSubByUser.size,
      totalRevenueUsd: Number(revRow?.total_usd || 0),
      openSupportTickets: openSupport?.cnt ?? 0,
      copyTradersCount: copyTraders?.cnt ?? 0,
      dexTradesTotal: dexStats?.total ?? 0,
      dexTradesOpen: dexStats?.open_count ?? 0,
      trades,
      signalsCount: (signals as { total: number } | null)?.total ?? 0,
      botsCount: (bots as { total: number } | null)?.total ?? 0,
    },
    settings: settingsMap,
    platformAI: aiSummary,
    plans: plans.results,
  });
});

adminRoutes.get('/ai-engines', async (c) => {
  const [rows, summary] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked,
              temperature, max_tokens, daily_call_cap, calls_today, last_test_status, last_tested_at, updated_at
       FROM platform_ai_engines ORDER BY slot_order ASC, created_at ASC LIMIT 3`
    ).all<{
      id: string;
      slot_order: number;
      provider: string;
      label: string;
      model: string;
      base_url: string | null;
      weight: number;
      is_active: number;
      api_key_masked: string;
      temperature: number;
      max_tokens: number;
      daily_call_cap: number;
      calls_today: number;
      last_test_status: string;
      last_tested_at: string | null;
      updated_at: string;
    }>(),
    getPlatformAISummary(c.env),
  ]);
  const engines = [...(rows.results ?? [])];
  const secretKey = c.env.HILINKUP_API_KEY?.trim();
  if (secretKey && !engines.some((e) => e.is_active === 1)) {
    const masked = secretKey.length > 8 ? `${secretKey.slice(0, 4)}****${secretKey.slice(-4)}` : 'hlk_****';
    const freeSlot = engines.some((e) => e.slot_order === 1) ? (engines.some((e) => e.slot_order === 2) ? 3 : 2) : 1;
    engines.unshift({
      id: 'env-hilinkup-default',
      slot_order: freeSlot,
      provider: 'openai_compatible',
      label: 'Hilinkup DeepSeek v4.1 (Worker Secret)',
      model: c.env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017',
      base_url: c.env.HILINKUP_BASE_URL?.trim() || 'https://api.hilinkup.com/v1',
      weight: 100,
      is_active: 1,
      api_key_masked: masked,
      temperature: 0.25,
      max_tokens: 2048,
      daily_call_cap: 50000,
      calls_today: 0,
      last_test_status: 'ACTIVE (SECRET)',
      last_tested_at: null,
      updated_at: new Date().toISOString(),
    });
  }
  return c.json({
    engines,
    consensusMode: summary.consensusMode,
    cacheTtlSec: summary.cacheTtlSec,
    activeCount: summary.activeCount,
    latestSignals: summary.latestSignals,
    hilinkupSecretConfigured: Boolean(secretKey),
    hilinkupModel: c.env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017',
  });
});

adminRoutes.post('/ai-engines', async (c) => {
  const body = await c.req.json<{
    id?: string;
    slotOrder?: number;
    provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai_compatible';
    label?: string;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    weight?: number;
    temperature?: number;
    maxTokens?: number;
    dailyCallCap?: number;
    isActive?: boolean;
  }>();

  if (!body.provider || !body.model) {
    return c.json({ error: 'Provider and model are required' }, 400);
  }

  const slotOrder = Math.min(3, Math.max(1, Math.round(Number(body.slotOrder ?? 1))));
  const weight = Math.min(100, Math.max(10, Math.round(Number(body.weight ?? 100))));
  const defaultModelMap: Record<string, string> = {
    deepseek: 'deepseek-chat',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-2.0-flash',
    openai_compatible: body.model,
  };
  let model = body.model.trim() || defaultModelMap[body.provider] || 'gpt-4o-mini';
  const cleanBase = body.baseUrl?.trim() || null;
  if (
    cleanBase &&
    cleanBase.includes('hilinkup.com') &&
    ['deep', 'deepseek', 'دیپی', 'deepseek-v4', 'deepseek-chat'].includes(model.toLowerCase())
  ) {
    model = c.env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
  }
  const label = (body.label ?? '').trim() || `مدل ${slotOrder} (${body.provider.toUpperCase()})`;

  // Check if updating an existing slot or creating a new one (max 3 slots!)
  const existing = body.id
    ? await c.env.DB.prepare(`SELECT id FROM platform_ai_engines WHERE id = ?`).bind(body.id).first<{ id: string }>()
    : await c.env.DB.prepare(`SELECT id FROM platform_ai_engines WHERE slot_order = ?`).bind(slotOrder).first<{ id: string }>();

  if (!existing) {
    const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM platform_ai_engines`).first<{ cnt: number }>();
    if ((countRow?.cnt ?? 0) >= 3) {
      return c.json({ error: 'حداکثر ۳ مدل برای هوش مصنوعی دلارینو قابل ثبت است. یکی از اسلات‌ها را ویرایش یا حذف کنید.' }, 400);
    }
    if (!body.apiKey?.trim()) {
      return c.json({ error: 'API Key is required for a new platform AI engine' }, 400);
    }
    const id = randomId('paie');
    const encrypted = await encryptVaultJson({ apiKey: body.apiKey.trim() }, c.env.MASTER_ENCRYPTION_KEY);
    await c.env.DB.prepare(
      `INSERT INTO platform_ai_engines
       (id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked, encrypted_api_key, temperature, max_tokens, daily_call_cap, last_test_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAVED')`
    )
      .bind(
        id,
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        maskSecret(body.apiKey.trim()),
        encrypted,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 50000))
      )
      .run();
    return c.json({ ok: true, id, slotOrder }, 201);
  }

  // Update existing slot
  if (body.apiKey?.trim()) {
    const encrypted = await encryptVaultJson({ apiKey: body.apiKey.trim() }, c.env.MASTER_ENCRYPTION_KEY);
    await c.env.DB.prepare(
      `UPDATE platform_ai_engines
       SET slot_order = ?, provider = ?, label = ?, model = ?, base_url = ?, weight = ?, is_active = ?,
           api_key_masked = ?, encrypted_api_key = ?, temperature = ?, max_tokens = ?, daily_call_cap = ?,
           last_test_status = 'UPDATED', updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        maskSecret(body.apiKey.trim()),
        encrypted,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 50000)),
        existing.id
      )
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE platform_ai_engines
       SET slot_order = ?, provider = ?, label = ?, model = ?, base_url = ?, weight = ?, is_active = ?,
           temperature = ?, max_tokens = ?, daily_call_cap = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 50000)),
        existing.id
      )
      .run();
  }

  return c.json({ ok: true, id: existing.id, slotOrder });
});

adminRoutes.patch('/ai-engines/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ is_active?: boolean; weight?: number; label?: string; model?: string }>();
  if (body.is_active !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, id)
      .run();
  }
  if (body.weight !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET weight = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(Math.min(100, Math.max(10, Math.round(body.weight))), id)
      .run();
  }
  if (body.label !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET label = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.label.trim(), id)
      .run();
  }
  if (body.model !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET model = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.model.trim(), id)
      .run();
  }
  return c.json({ ok: true });
});

adminRoutes.delete('/ai-engines/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM platform_ai_engines WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post('/ai-engines/test', async (c) => {
  const result = await testAllPlatformAIEngines(c.env);
  return c.json(result, result.results.length === 0 ? 400 : 200);
});

adminRoutes.patch('/users/:id', async (c) => {
  const actor = c.get('user');
  const targetId = c.req.param('id');
  const body = await c.req.json<{ role?: 'user' | 'admin'; is_blocked?: boolean }>();

  if (body.role !== undefined && actor.role !== 'owner') {
    return c.json({ error: 'Only the primary instance owner can promote or demote admins' }, 403);
  }
  if (targetId === actor.id && body.is_blocked) {
    return c.json({ error: 'Cannot block yourself' }, 400);
  }

  if (body.role !== undefined) {
    await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ? AND role != \'owner\'').bind(body.role, targetId).run();
  }
  if (body.is_blocked !== undefined) {
    await c.env.DB.prepare('UPDATE users SET is_blocked = ? WHERE id = ? AND role != \'owner\'')
      .bind(body.is_blocked ? 1 : 0, targetId).run();
  }
  return c.json({ ok: true });
});

adminRoutes.put('/settings', async (c) => {
  const body = await c.req.json<Record<string, string>>();
  for (const [k, v] of Object.entries(body)) {
    await c.env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).bind(k, String(v)).run();
  }
  return c.json({ ok: true });
});

adminRoutes.post('/broadcast', async (c) => {
  const body = await c.req.json<{ message: string }>();
  if (!body.message?.trim()) return c.json({ error: 'Message required' }, 400);
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Global TELEGRAM_BOT_TOKEN not configured' }, 400);

  const client = new TelegramBotClient(c.env.TELEGRAM_BOT_TOKEN);
  const targets = await c.env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND is_blocked = 0')
    .all<{ telegram_id: string }>();
  let sent = 0;
  for (const t of targets.results) {
    await client.sendMessage(t.telegram_id, `📢 اطلاعیه دلارینو:\n\n${body.message}`).then(() => sent++).catch(() => {});
  }
  return c.json({ ok: true, sent, total: targets.results.length });
});

// =========================================================================
// Full Plan CRUD (Admin Panel)
// =========================================================================

adminRoutes.get('/plans', async (c) => {
  const res = await c.env.DB.prepare(`SELECT * FROM subscription_plans ORDER BY sort_order ASC`).all();
  return c.json({ plans: res.results });
});

adminRoutes.post('/plans', async (c) => {
  const body = await c.req.json<{
    code?: string;
    name_fa?: string;
    name_en?: string;
    description_fa?: string;
    description_en?: string;
    price_usd?: number;
    price_toman?: number;
    duration_days?: number;
    max_live_exchanges?: number;
    features?: string[];
    is_popular?: boolean;
    is_active?: boolean;
  }>();
  const code = (body.code || `plan_${Date.now()}`).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const priceUsd = Math.max(1, Number(body.price_usd ?? 29));
  const priceToman = Math.max(10000, Number(body.price_toman ?? priceUsd * 70000));
  const durationDays = Math.max(1, Number(body.duration_days ?? 30));

  await c.env.DB.prepare(
    `INSERT INTO subscription_plans
     (code, name_fa, name_en, description_fa, description_en, price_usd, price_toman, duration_days, max_live_exchanges,
      allow_ai_trading, allow_codexbot, allow_copy_trade, allow_live_trading, features_json, is_popular, is_active, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, ?, ?, ?, 10, datetime('now'))
     ON CONFLICT(code) DO UPDATE SET
      name_fa = excluded.name_fa,
      name_en = excluded.name_en,
      description_fa = excluded.description_fa,
      description_en = excluded.description_en,
      price_usd = excluded.price_usd,
      price_toman = excluded.price_toman,
      duration_days = excluded.duration_days,
      max_live_exchanges = excluded.max_live_exchanges,
      features_json = excluded.features_json,
      is_popular = excluded.is_popular,
      is_active = excluded.is_active,
      updated_at = datetime('now')`
  ).bind(
    code,
    (body.name_fa || 'پلن جدید').trim(),
    (body.name_en || 'Custom Plan').trim(),
    (body.description_fa || '').trim(),
    (body.description_en || '').trim(),
    priceUsd,
    priceToman,
    durationDays,
    Math.max(1, Number(body.max_live_exchanges ?? 3)),
    JSON.stringify(Array.isArray(body.features) && body.features.length ? body.features : ['دسترسی کامل ترید هوشمند، هوش مصنوعی من، کپی‌ترید و استراتژی شخصی']),
    body.is_popular ? 1 : 0,
    body.is_active !== false ? 1 : 0
  ).run();

  return c.json({ ok: true, code });
});

adminRoutes.patch('/plans/:code', async (c) => {
  const code = c.req.param('code');
  const body = await c.req.json<{
    name_fa?: string;
    name_en?: string;
    price_usd?: number;
    price_toman?: number;
    duration_days?: number;
    is_popular?: boolean;
    is_active?: boolean;
  }>();
  await c.env.DB.prepare(
    `UPDATE subscription_plans
     SET name_fa = COALESCE(?, name_fa),
         name_en = COALESCE(?, name_en),
         price_usd = COALESCE(?, price_usd),
         price_toman = COALESCE(?, price_toman),
         duration_days = COALESCE(?, duration_days),
         is_popular = COALESCE(?, is_popular),
         is_active = COALESCE(?, is_active),
         updated_at = datetime('now')
     WHERE code = ?`
  ).bind(
    body.name_fa ?? null,
    body.name_en ?? null,
    typeof body.price_usd === 'number' ? body.price_usd : null,
    typeof body.price_toman === 'number' ? body.price_toman : null,
    typeof body.duration_days === 'number' ? body.duration_days : null,
    body.is_popular !== undefined ? (body.is_popular ? 1 : 0) : null,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
    code
  ).run();
  return c.json({ ok: true });
});

// =========================================================================
// Admin Gift Codes List & User Wallet
// =========================================================================

adminRoutes.get('/gift-codes', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM gift_codes ORDER BY created_at DESC LIMIT 100`
  ).all().catch(() => ({ results: [] }));
  return c.json({ giftCodes: rows.results });
});

adminRoutes.delete('/gift-codes/:code', async (c) => {
  const code = c.req.param('code');
  await c.env.DB.prepare(`UPDATE gift_codes SET is_active = 0 WHERE code = ?`).bind(code).run();
  return c.json({ ok: true });
});

adminRoutes.post('/users/:id/wallet', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ amountUsdt: number }>();
  const amount = Number(body.amountUsdt);
  if (!Number.isFinite(amount)) return c.json({ error: 'Invalid amount' }, 400);
  await c.env.DB.prepare(
    `UPDATE users SET wallet_balance_usdt = MAX(0, wallet_balance_usdt + ?) WHERE id = ?`
  ).bind(amount, id).run();
  return c.json({ ok: true });
});

// =========================================================================
// Admin-Verified Copy Traders Management & Trade Publishing
// =========================================================================

adminRoutes.get('/copy-traders', async (c) => {
  const [traders, trades] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM copy_traders ORDER BY created_at DESC`).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT * FROM copy_trader_trades ORDER BY opened_at DESC LIMIT 100`).all().catch(() => ({ results: [] })),
  ]);
  return c.json({ traders: traders.results, trades: trades.results });
});

adminRoutes.post('/copy-traders', async (c) => {
  const body = await c.req.json<{
    display_name: string;
    handle?: string;
    user_id?: string;
    user_email?: string;
    telegram_id?: string;
    auto_ask_publish?: boolean;
    bio_fa?: string;
    bio_en?: string;
    specialty?: string;
    win_rate?: number;
    roi_30d_pct?: number;
    max_drawdown_pct?: number;
    min_allocation_usd?: number;
    risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    is_verified?: boolean;
  }>();
  const displayName = (body.display_name || '').trim();
  if (!displayName) return c.json({ error: 'نام نمایشی تریدر الزامی است.' }, 400);

  let resolvedUserId = body.user_id?.trim() || null;
  let resolvedTgId = body.telegram_id?.trim() || null;
  if (!resolvedUserId && body.user_email?.trim()) {
    const uRow = await c.env.DB.prepare(`SELECT id, telegram_id FROM users WHERE lower(email) = lower(?) LIMIT 1`)
      .bind(body.user_email.trim()).first<{ id: string; telegram_id: string | null }>().catch(() => null);
    if (uRow) {
      resolvedUserId = uRow.id;
      if (!resolvedTgId && uRow.telegram_id) resolvedTgId = uRow.telegram_id;
    }
  }

  const id = randomId('ct');
  await c.env.DB.prepare(
    `INSERT INTO copy_traders
     (id, user_id, telegram_id, auto_ask_publish, display_name, handle, bio_fa, bio_en, specialty, win_rate, roi_30d_pct, max_drawdown_pct, min_allocation_usd, risk_level, is_verified, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    id,
    resolvedUserId,
    resolvedTgId,
    body.auto_ask_publish !== false ? 1 : 0,
    displayName,
    (body.handle || `@${displayName.replace(/\s+/g, '_').toLowerCase()}`).slice(0, 40),
    (body.bio_fa || '').trim(),
    (body.bio_en || '').trim(),
    (body.specialty || 'AI & Futures').trim(),
    Number(body.win_rate ?? 75),
    Number(body.roi_30d_pct ?? 40),
    Number(body.max_drawdown_pct ?? 6),
    Number(body.min_allocation_usd ?? 50),
    body.risk_level || 'MEDIUM',
    body.is_verified !== false ? 1 : 0
  ).run();

  return c.json({ ok: true, id }, 201);
});

adminRoutes.patch('/copy-traders/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    display_name?: string;
    user_id?: string | null;
    telegram_id?: string | null;
    auto_ask_publish?: boolean;
    win_rate?: number;
    roi_30d_pct?: number;
    max_drawdown_pct?: number;
    is_verified?: boolean;
    is_active?: boolean;
    risk_level?: string;
  }>();

  await c.env.DB.prepare(
    `UPDATE copy_traders
     SET display_name = COALESCE(?, display_name),
         user_id = COALESCE(?, user_id),
         telegram_id = COALESCE(?, telegram_id),
         auto_ask_publish = COALESCE(?, auto_ask_publish),
         win_rate = COALESCE(?, win_rate),
         roi_30d_pct = COALESCE(?, roi_30d_pct),
         max_drawdown_pct = COALESCE(?, max_drawdown_pct),
         is_verified = COALESCE(?, is_verified),
         is_active = COALESCE(?, is_active),
         risk_level = COALESCE(?, risk_level),
         updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    body.display_name ?? null,
    body.user_id !== undefined ? body.user_id : null,
    body.telegram_id !== undefined ? body.telegram_id : null,
    body.auto_ask_publish !== undefined ? (body.auto_ask_publish ? 1 : 0) : null,
    typeof body.win_rate === 'number' ? body.win_rate : null,
    typeof body.roi_30d_pct === 'number' ? body.roi_30d_pct : null,
    typeof body.max_drawdown_pct === 'number' ? body.max_drawdown_pct : null,
    body.is_verified !== undefined ? (body.is_verified ? 1 : 0) : null,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
    body.risk_level ?? null,
    id
  ).run();

  return c.json({ ok: true });
});

adminRoutes.delete('/copy-traders/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM copy_traders WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post('/copy-traders/:id/trades', async (c) => {
  const traderId = c.req.param('id');
  const body = await c.req.json<{
    symbol: string;
    direction: 'LONG' | 'SHORT';
    leverage?: number;
    entry_price: string;
    stop_loss?: string;
    tp1?: string;
    tp2?: string;
    tp3?: string;
    status?: 'OPEN' | 'CLOSED';
    pnl_pct?: number;
    note?: string;
    askConfirm?: boolean;
    mirrorNow?: boolean;
  }>();
  const sym = (body.symbol || 'BTCUSDT').toUpperCase().trim();
  const dir = body.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const lev = Math.max(1, Number(body.leverage ?? 5));
  const id = randomId('ctt');
  const publishStatus = body.askConfirm ? 'PENDING_CONFIRM' : 'PUBLISHED';

  await c.env.DB.prepare(
    `INSERT INTO copy_trader_trades
     (id, trader_id, symbol, direction, leverage, entry_price, stop_loss, tp1, tp2, tp3, status, publish_status, pnl_pct, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    traderId,
    sym,
    dir,
    lev,
    String(body.entry_price || '0'),
    body.stop_loss ? String(body.stop_loss) : null,
    body.tp1 ? String(body.tp1) : null,
    body.tp2 ? String(body.tp2) : null,
    body.tp3 ? String(body.tp3) : null,
    body.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    publishStatus,
    Number(body.pnl_pct ?? 0),
    (body.note || '').trim() || null
  ).run();

  const trader = await c.env.DB.prepare(
    `SELECT ct.display_name, ct.telegram_id, u.telegram_id AS linked_tg_id
     FROM copy_traders ct LEFT JOIN users u ON u.id = ct.user_id WHERE ct.id = ? LIMIT 1`
  ).bind(traderId).first<{ display_name: string; telegram_id: string | null; linked_tg_id: string | null }>().catch(() => null);

  let mirrorResult = null;
  if (body.askConfirm && trader) {
    await promptCopyTraderPublish(c.env, {
      traderId,
      traderName: trader.display_name,
      traderTelegramId: trader.telegram_id || trader.linked_tg_id,
      copyTradeId: id,
      symbol: sym,
      direction: dir,
      leverage: lev,
      entryPrice: String(body.entry_price || '0'),
      stopLoss: body.stop_loss,
      tp1: body.tp1,
      tp2: body.tp2,
      tp3: body.tp3,
    });
  } else if (body.mirrorNow && body.status !== 'CLOSED') {
    mirrorResult = await confirmAndMirrorCopyTrade(c.env, id, true);
  }

  return c.json({ ok: true, id, publishStatus, mirrorResult }, 201);
});

adminRoutes.patch('/copy-traders/trades/:tradeId', async (c) => {
  const tradeId = c.req.param('tradeId');
  const body = await c.req.json<{ status?: 'OPEN' | 'CLOSED'; exit_price?: string; pnl_pct?: number }>();
  await c.env.DB.prepare(
    `UPDATE copy_trader_trades
     SET status = COALESCE(?, status),
         exit_price = COALESCE(?, exit_price),
         pnl_pct = COALESCE(?, pnl_pct),
         closed_at = CASE WHEN ? = 'CLOSED' THEN datetime('now') ELSE closed_at END
     WHERE id = ?`
  ).bind(body.status ?? null, body.exit_price ?? null, typeof body.pnl_pct === 'number' ? body.pnl_pct : null, body.status ?? null, tradeId).run();
  return c.json({ ok: true });
});

// =========================================================================
// Admin Online Support Ticket Desk (Synced Web + Telegram)
// =========================================================================

adminRoutes.get('/support', async (c) => {
  const [tickets, msgs] = await Promise.all([
    c.env.DB.prepare(
      `SELECT st.*, u.email, u.username, u.telegram_id
       FROM support_tickets st
       JOIN users u ON u.id = st.user_id
       ORDER BY CASE WHEN st.status = 'OPEN' THEN 0 ELSE 1 END, st.last_message_at DESC
       LIMIT 100`
    ).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT * FROM support_messages ORDER BY created_at ASC LIMIT 400`
    ).all().catch(() => ({ results: [] })),
  ]);
  return c.json({ tickets: tickets.results, messages: msgs.results });
});

adminRoutes.post('/support/:ticketId/reply', async (c) => {
  const actor = c.get('user');
  const ticketId = c.req.param('ticketId');
  const body = await c.req.json<{ message?: string; imageDataUrl?: string | null; close?: boolean }>();
  const text = String(body.message || '').trim();
  const imageDataUrl =
    body.imageDataUrl && String(body.imageDataUrl).startsWith('data:image/') && String(body.imageDataUrl).length < 4_500_000
      ? String(body.imageDataUrl)
      : null;
  if (!text && !imageDataUrl) return c.json({ error: 'پاسخ یا تصویر نمی‌تواند خالی باشد.' }, 400);

  const ticket = await c.env.DB.prepare(
    `SELECT st.id, st.user_id, u.telegram_id FROM support_tickets st JOIN users u ON u.id = st.user_id WHERE st.id = ? LIMIT 1`
  ).bind(ticketId).first<{ id: string; user_id: string; telegram_id: string | null }>();
  if (!ticket) return c.json({ error: 'تیکت یافت نشد.' }, 404);

  const displayMsg = text || '📷 تصویر پیوست پاسخ پشتیبانی';
  const msgId = randomId('smsg');
  await c.env.DB.prepare(
    `INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message, image_data_url)
     VALUES (?, ?, ?, 'admin', ?, ?, ?)`
  ).bind(msgId, ticketId, actor.id, actor.username || 'پشتیبانی دلارینو', displayMsg.slice(0, 2000), imageDataUrl).run();

  await c.env.DB.prepare(
    `UPDATE support_tickets SET status = ?, last_message_at = datetime('now') WHERE id = ?`
  ).bind(body.close ? 'CLOSED' : 'ANSWERED', ticketId).run();

  if (ticket.telegram_id && c.env.TELEGRAM_BOT_TOKEN) {
    const tg = new TelegramBotClient(c.env.TELEGRAM_BOT_TOKEN);
    const caption = `💬 <b>پاسخ پشتیبانی آنلاین دلارینو:</b>\n\n${displayMsg}`;
    if (imageDataUrl) {
      await tg.sendDataUrlPhoto(ticket.telegram_id, imageDataUrl, caption).catch(() => tg.sendMessage(ticket.telegram_id!, caption).catch(() => {}));
    } else {
      await tg.sendMessage(ticket.telegram_id, caption).catch(() => {});
    }
  }

  return c.json({ ok: true, messageId: msgId });
});

adminRoutes.patch('/support/:ticketId/status', async (c) => {
  const ticketId = c.req.param('ticketId');
  const body = await c.req.json<{ status: 'OPEN' | 'ANSWERED' | 'CLOSED' }>();
  await c.env.DB.prepare(`UPDATE support_tickets SET status = ? WHERE id = ?`).bind(body.status, ticketId).run();
  return c.json({ ok: true });
});

// =========================================================================
// Official @Dollarino_official Channel Signal & News Desk + Bot Admin Check
// =========================================================================

adminRoutes.get('/telegram/channel-status', async (c) => {
  const cfg = await resolveChannelAndBotConfig(c.env);
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ ok: false, channelHandle: cfg.channelHandle, error: 'TELEGRAM_BOT_TOKEN تنظیم نشده است.' });
  }
  const tg = new TelegramBotClient(c.env.TELEGRAM_BOT_TOKEN);
  const status = await tg.checkChannelAdminReadiness(cfg.channelHandle);
  return c.json({
    ...status,
    channelHandle: cfg.channelHandle,
    botUsername: status.botUsername || cfg.botUsername,
  });
});

adminRoutes.post('/channel/publish-signal', async (c) => {
  const body = await c.req.json<{
    symbol: string;
    direction: 'LONG' | 'SHORT';
    timeframe?: string;
    price?: string;
    entryPrice?: string;
    stopLoss: string;
    leverage?: number;
    tp1: string;
    tp2?: string;
    tp3?: string;
    engineKey?: string;
    engineLabel?: string;
    note?: string;
    notifySubscribers?: boolean;
  }>();

  const sym = (body.symbol || '').trim().toUpperCase();
  let priceVal = String(body.price || body.entryPrice || '').trim();
  if (!priceVal && sym) {
    const mkt = await fetchPublicMarket24h(sym).catch(() => null);
    if (mkt?.lastPrice) priceVal = String(mkt.lastPrice);
  }

  if (!sym || !priceVal || !body.stopLoss || !body.tp1) {
    return c.json({ error: 'نماد، قیمت ورود، حد ضرر و TP1 الزامی هستند.' }, 400);
  }

  const sig: DollarinoSignal = {
    symbol: sym,
    direction: body.direction === 'SHORT' ? 'SHORT' : 'LONG',
    timeframe: (body.timeframe || '15m').trim(),
    price: priceVal,
    stopLoss: String(body.stopLoss).trim(),
    leverage: Math.max(1, Number(body.leverage ?? 10)),
    tp1: String(body.tp1).trim(),
    tp2: body.tp2 ? String(body.tp2).trim() : undefined,
    tp3: body.tp3 ? String(body.tp3).trim() : undefined,
    engineKey: body.engineKey || 'ai_autonomous_agent',
    engineLabel: body.engineLabel,
    reason: body.note?.trim(),
  };

  const res = await publishSignalBroadcast(c.env, {
    signal: sig,
    source: 'ADMIN_CHANNEL',
    engineKey: sig.engineKey,
    engineLabel: sig.engineLabel,
    publishToChannel: true,
    notifySubscribers: body.notifySubscribers !== false,
  });

  return c.json({ ok: true, ...res });
});

adminRoutes.get('/channel/news', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM channel_news ORDER BY created_at DESC LIMIT 40`
  ).all().catch(() => ({ results: [] }));
  return c.json({ news: rows.results });
});

adminRoutes.post('/channel/publish-news', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json<{
    category?: 'NEWS' | 'ANALYSIS' | 'SIGNAL_UPDATE' | 'ANNOUNCEMENT';
    title: string;
    body: string;
    mediaUrl?: string;
    buttonLabel?: string;
    buttonUrl?: string;
  }>();

  if (!body.title?.trim() || !body.body?.trim()) {
    return c.json({ error: 'عنوان و متن خبر الزامی است.' }, 400);
  }

  const res = await publishChannelNews(c.env, {
    category: body.category || 'NEWS',
    title: body.title,
    body: body.body,
    mediaUrl: body.mediaUrl?.trim(),
    buttonLabel: body.buttonLabel?.trim(),
    buttonUrl: body.buttonUrl?.trim(),
    createdBy: actor.id,
  });

  return c.json({ ok: !res.error, ...res });
});

adminRoutes.get('/audit-logs', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.*, u.username, u.email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 120`
  ).all().catch(() => ({ results: [] }));
  return c.json({ logs: rows.results });
});

adminRoutes.get('/dex-trades', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT d.*, u.username, u.email
     FROM dex_trades d
     JOIN users u ON u.id = d.user_id
     ORDER BY d.opened_at DESC LIMIT 80`
  ).all().catch(() => ({ results: [] }));
  return c.json({ trades: rows.results });
});

adminRoutes.patch('/users/:id/kyc', async (c) => {
  const uid = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    phoneNumber?: string;
    phoneVerified?: boolean;
    trustWalletAddress?: string;
    trustWalletVerified?: boolean;
  };
  await c.env.DB.prepare(
    `UPDATE users SET
       phone_number = COALESCE(?, phone_number),
       phone_verified = COALESCE(?, phone_verified),
       phone_verified_at = CASE WHEN ? = 1 THEN datetime('now') ELSE phone_verified_at END,
       trust_wallet_address = COALESCE(?, trust_wallet_address),
       trust_wallet_verified = COALESCE(?, trust_wallet_verified)
     WHERE id = ?`
  ).bind(
    body.phoneNumber?.trim() || null,
    typeof body.phoneVerified === 'boolean' ? (body.phoneVerified ? 1 : 0) : null,
    body.phoneVerified ? 1 : 0,
    body.trustWalletAddress?.trim() || null,
    typeof body.trustWalletVerified === 'boolean' ? (body.trustWalletVerified ? 1 : 0) : null,
    uid
  ).run();
  return c.json({ ok: true });
});

adminRoutes.get('/referrals', async (c) => {
  const [referrals, withdrawals] = await Promise.all([
    c.env.DB.prepare(
      `SELECT r.*, u1.username as referrer_name, u1.email as referrer_email, u2.username as referred_name, u2.email as referred_email
       FROM referrals r
       LEFT JOIN users u1 ON u1.id = r.referrer_user_id
       LEFT JOIN users u2 ON u2.id = r.referred_user_id
       ORDER BY r.fraud_flag DESC, r.created_at DESC LIMIT 80`
    )
      .all()
      .catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT rw.*, u.username, u.email
       FROM referral_withdrawals rw
       JOIN users u ON u.id = rw.user_id
       ORDER BY CASE WHEN rw.status = 'PENDING' THEN 0 ELSE 1 END, rw.created_at DESC LIMIT 60`
    )
      .all()
      .catch(() => ({ results: [] })),
  ]);
  return c.json({ referrals: referrals.results, withdrawals: withdrawals.results });
});

adminRoutes.post('/referrals/withdrawals/:id/decide', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    decision: 'APPROVE' | 'REJECT';
    txHash?: string;
    adminNote?: string;
  };
  const wd = await c.env.DB.prepare(`SELECT * FROM referral_withdrawals WHERE id = ?`)
    .bind(id)
    .first<{ id: string; user_id: string; amount_usd: number; status: string }>();
  if (!wd) return c.json({ error: 'Withdrawal request not found' }, 404);
  if (wd.status !== 'PENDING') return c.json({ error: 'Withdrawal already processed' }, 409);

  if (body.decision === 'APPROVE') {
    await c.env.DB.prepare(
      `UPDATE referral_withdrawals
       SET status = 'APPROVED', tx_hash = ?, admin_note = ?, processed_at = datetime('now')
       WHERE id = ?`
    )
      .bind(body.txHash?.trim() || null, body.adminNote?.trim() || 'Paid', id)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE referral_withdrawals
       SET status = 'REJECTED', admin_note = ?, processed_at = datetime('now')
       WHERE id = ?`
    )
      .bind(body.adminNote?.trim() || 'Rejected by admin', id)
      .run();
    // Refund locked amount back to user's referral balance
    await c.env.DB.prepare(
      `UPDATE users SET referral_balance_usd = ROUND(COALESCE(referral_balance_usd, 0) + ?, 2) WHERE id = ?`
    )
      .bind(wd.amount_usd, wd.user_id)
      .run();
  }
  return c.json({ ok: true });
});
