import { Hono } from 'hono';
import { callBYOAI, getPlatformAISummary, resolveUserActiveAI } from '../ai/providers.js';
import { requireAuth, type AppVariables } from '../auth.js';
import { decryptVaultJson, encryptVaultJson, maskSecret, randomId } from '../crypto.js';
import { executeSignalForUser } from '../engine/executor.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { normalizeProxyBaseUrl } from '../exchanges/proxy.js';
import { TelegramBotClient } from '../telegram/client.js';
import { requirePaidEntitlement, resolveUserEntitlement } from './subscriptions.js';

export const connectionRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
connectionRoutes.use('*', requireAuth);

connectionRoutes.get('/platform-ai', async (c) => {
  const summary = await getPlatformAISummary(c.env);
  return c.json({ platformAI: summary });
});

connectionRoutes.get('/exchanges', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status, last_tested_at, updated_at
     FROM exchange_connections WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC`
  ).bind(user.id).all<{
    id: string;
    provider: string;
    label: string;
    is_testnet: number;
    is_active: number;
    api_key_masked: string;
    encrypted_credentials: string;
    last_test_status: string;
    last_tested_at: string;
    updated_at: string;
  }>();

  const connections = await Promise.all(
    rows.results.map(async (r) => {
      let proxyUrl = '';
      if (r.provider === 'toobit' && r.encrypted_credentials) {
        const creds = await decryptVaultJson<{ proxyUrl?: string }>(
          r.encrypted_credentials,
          c.env.MASTER_ENCRYPTION_KEY
        ).catch(() => ({ proxyUrl: undefined }));
        proxyUrl = creds.proxyUrl ?? '';
      }
      return {
        id: r.id,
        provider: r.provider,
        label: r.label,
        is_testnet: r.is_testnet,
        is_active: r.is_active,
        api_key_masked: r.api_key_masked,
        proxy_url: proxyUrl,
        has_global_proxy: Boolean(c.env.TOOBIT_PROXY_URL),
        last_test_status: r.last_test_status,
        last_tested_at: r.last_tested_at,
        updated_at: r.updated_at,
      };
    })
  );
  return c.json({ connections });
});

connectionRoutes.post('/exchanges', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    provider: 'paper' | 'toobit' | 'bitunix' | 'kcex' | string;
    label?: string;
    apiKey?: string;
    apiSecret?: string;
    webSessionToken?: string;
    proxyUrl?: string;
    proxySecret?: string;
    activate?: boolean;
  }>();

  if (!body.provider) return c.json({ error: 'Provider is required' }, 400);
  if (body.provider !== 'paper' && body.provider !== 'toobit' && body.provider !== 'bitunix' && body.provider !== 'kcex') {
    return c.json({ error: 'Only Toobit, Bitunix, KCEX, and Simulation Account are supported in Dollarino.' }, 400);
  }

  const provider = body.provider as 'paper' | 'toobit' | 'bitunix' | 'kcex';
  if ((provider === 'toobit' || provider === 'bitunix') && (!body.apiKey || !body.apiSecret)) {
    return c.json({ error: `API Key and API Secret are required for ${provider === 'bitunix' ? 'Bitunix' : 'Toobit'}` }, 400);
  }

  const ent = await resolveUserEntitlement(c.env.DB, user);
  const canActivateNow = !ent.subscriptionRequired || ent.hasPaidPlan;
  if (body.activate === true && !canActivateNow) {
    return c.json(
      {
        error: 'برای فعال‌سازی اتصال صرافی و ترید، اشتراک فعال لازم است.',
        code: 'SUBSCRIPTION_REQUIRED',
      },
      402
    );
  }
  const shouldActivate = body.activate !== false && canActivateNow;

  let normalizedProxy: string | undefined;
  if (body.proxyUrl?.trim()) {
    normalizedProxy = normalizeProxyBaseUrl(body.proxyUrl);
    if (!normalizedProxy) {
      return c.json({ error: 'Relay Proxy URL must be a valid http:// or https:// URL' }, 400);
    }
  }

  const id = randomId('ex');
  const encrypted = await encryptVaultJson(
    {
      apiKey: body.apiKey?.trim() ?? '',
      apiSecret: body.apiSecret?.trim() ?? '',
      webSessionToken: body.webSessionToken?.trim() ?? '',
      ...(normalizedProxy ? { proxyUrl: normalizedProxy } : {}),
      ...(body.proxySecret?.trim() ? { proxySecret: body.proxySecret.trim() } : {}),
    },
    c.env.MASTER_ENCRYPTION_KEY
  );
  const masked =
    provider === 'paper'
      ? 'PAPER-MODE'
      : provider === 'kcex'
        ? body.webSessionToken?.trim()
          ? maskSecret(body.webSessionToken)
          : 'KCEX-MIRROR-0%'
        : maskSecret(body.apiKey!);

  if (shouldActivate) {
    await c.env.DB.prepare('UPDATE exchange_connections SET is_active = 0 WHERE user_id = ?').bind(user.id).run();
  }

  const label =
    body.label?.trim() ||
    (provider === 'kcex'
      ? 'KCEX Futures (0% Maker / Mirror)'
      : provider === 'bitunix'
        ? 'Bitunix Futures'
        : provider === 'paper'
          ? 'Simulation Account'
          : 'Toobit Futures');

  await c.env.DB.prepare(
    `INSERT INTO exchange_connections (id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    provider,
    label,
    provider === 'paper' || provider === 'kcex' ? 1 : 0,
    shouldActivate ? 1 : 0,
    masked,
    encrypted
  ).run();

  if (shouldActivate) {
    await c.env.DB.prepare('UPDATE bot_configs SET trading_mode = ? WHERE user_id = ?')
      .bind(provider === 'paper' || provider === 'kcex' ? 'PAPER' : 'LIVE', user.id).run();
  }

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, provider);
  const test = await adapter.testConnection();
  await c.env.DB.prepare(
    `UPDATE exchange_connections SET last_test_status = ?, last_tested_at = datetime('now') WHERE id = ?`
  ).bind(test.ok ? 'OK' : test.message.slice(0, 240), id).run();

  return c.json({ id, test, activated: shouldActivate, requiresSubscription: !canActivateNow });
});

connectionRoutes.patch('/exchanges/:id/proxy', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ proxyUrl?: string; proxySecret?: string }>();
  const row = await c.env.DB.prepare(
    `SELECT id, provider, encrypted_credentials FROM exchange_connections WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).first<{ id: string; provider: 'paper' | 'toobit' | 'bitunix' | 'kcex'; encrypted_credentials: string }>();
  if (!row) return c.json({ error: 'Connection not found' }, 404);

  let normalizedProxy: string | undefined;
  if (body.proxyUrl?.trim()) {
    normalizedProxy = normalizeProxyBaseUrl(body.proxyUrl);
    if (!normalizedProxy) {
      return c.json({ error: 'Relay Proxy URL must be a valid http:// or https:// URL' }, 400);
    }
  }

  const creds = await decryptVaultJson<Record<string, string>>(
    row.encrypted_credentials,
    c.env.MASTER_ENCRYPTION_KEY
  ).catch(() => ({} as Record<string, string>));

  if (normalizedProxy) creds.proxyUrl = normalizedProxy;
  else delete creds.proxyUrl;
  if (body.proxySecret?.trim()) creds.proxySecret = body.proxySecret.trim();
  else if (body.proxySecret === '') delete creds.proxySecret;

  const updatedEnc = await encryptVaultJson(creds, c.env.MASTER_ENCRYPTION_KEY);
  await c.env.DB.prepare(
    `UPDATE exchange_connections SET encrypted_credentials = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(updatedEnc, id).run();

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, row.provider);
  const test = await adapter.testConnection();
  await c.env.DB.prepare(
    `UPDATE exchange_connections SET last_test_status = ?, last_tested_at = datetime('now') WHERE id = ?`
  ).bind(test.ok ? 'OK' : test.message.slice(0, 240), id).run();

  return c.json({ ok: true, test });
});

connectionRoutes.post('/exchanges/:id/activate', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id, provider FROM exchange_connections WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<{ id: string; provider: string }>();
  if (!row) return c.json({ error: 'Connection not found' }, 404);

  const ent = await resolveUserEntitlement(c.env.DB, user);
  if (ent.subscriptionRequired && !ent.hasPaidPlan) {
    return c.json({
      error: 'برای فعال‌سازی صرافی و شروع ترید، اشتراک فعال لازم است.',
      code: 'SUBSCRIPTION_REQUIRED',
    }, 402);
  }

  await c.env.DB.prepare('UPDATE exchange_connections SET is_active = 0 WHERE user_id = ?').bind(user.id).run();
  await c.env.DB.prepare('UPDATE exchange_connections SET is_active = 1 WHERE id = ?').bind(id).run();
  await c.env.DB.prepare('UPDATE bot_configs SET trading_mode = ? WHERE user_id = ?')
    .bind(row.provider === 'paper' || row.provider === 'kcex' ? 'PAPER' : 'LIVE', user.id).run();

  return c.json({ ok: true, provider: row.provider });
});

connectionRoutes.post('/exchanges/:id/test', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT provider FROM exchange_connections WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<{ provider: 'paper' | 'toobit' | 'bitunix' | 'kcex' }>();
  if (!row) return c.json({ error: 'Not found' }, 404);

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, row.provider);
  const test = await adapter.testConnection();
  await c.env.DB.prepare(
    `UPDATE exchange_connections SET last_test_status = ?, last_tested_at = datetime('now') WHERE id = ?`
  ).bind(test.ok ? 'OK' : test.message.slice(0, 240), id).run();
  return c.json(test);
});

connectionRoutes.post('/exchanges/test-order', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) {
    return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  }
  const body = await c.req.json<{ symbol?: string; direction?: 'LONG' | 'SHORT' }>().catch(() => ({} as { symbol?: string; direction?: 'LONG' | 'SHORT' }));
  const symbol = (body.symbol || 'BTCUSDT').toUpperCase();
  const direction = body.direction || 'LONG';
  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id);
  const price = Number(await adapter.getTickerPrice(symbol));
  const risk = price * 0.01;
  const dp = price >= 1000 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 5 : 8;

  const res = await executeSignalForUser(
    c.env,
    user.id,
    {
      symbol,
      direction,
      timeframe: '15m',
      price: String(price),
      stopLoss: String((direction === 'LONG' ? price - risk : price + risk).toFixed(dp)),
      leverage: 5,
      tp1: String((direction === 'LONG' ? price + risk * 2 : price - risk * 2).toFixed(dp)),
      tp2: String((direction === 'LONG' ? price + risk * 3 : price - risk * 3).toFixed(dp)),
      tp3: String((direction === 'LONG' ? price + risk * 4 : price - risk * 4).toFixed(dp)),
      reason: 'Dollarino Select (Dorna V1) 1-shot guarded diagnostic order',
    },
    { forceBypassState: true, strategyKey: 'test_strategy' }
  );

  return c.json(res);
});

connectionRoutes.delete('/exchanges/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM exchange_connections WHERE id = ? AND user_id = ? AND provider != 'paper'`)
    .bind(id, user.id).run();
  return c.json({ ok: true });
});

connectionRoutes.get('/ai', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT id, provider, label, model, base_url, is_active, api_key_masked, temperature, max_tokens, daily_call_cap, calls_today, updated_at
     FROM ai_connections WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC`
  ).bind(user.id).all();
  return c.json({ connections: rows.results });
});

connectionRoutes.post('/ai', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    provider: 'deepseek' | 'anthropic' | 'openai' | 'gemini' | 'openai_compatible';
    label?: string;
    model: string;
    baseUrl?: string;
    apiKey: string;
    temperature?: number;
    maxTokens?: number;
    dailyCallCap?: number;
  }>();

  if (!body.provider || !body.apiKey || !body.model) {
    return c.json({ error: 'Provider, model, and API key are required' }, 400);
  }

  const id = randomId('ai');
  const defaultBaseUrl = body.provider === 'deepseek' ? 'https://api.deepseek.com' : null;
  const encrypted = await encryptVaultJson({ apiKey: body.apiKey.trim() }, c.env.MASTER_ENCRYPTION_KEY);
  await c.env.DB.prepare('UPDATE ai_connections SET is_active = 0 WHERE user_id = ?').bind(user.id).run();
  await c.env.DB.prepare(
    `INSERT INTO ai_connections (id, user_id, provider, label, model, base_url, is_active, api_key_masked, encrypted_api_key, temperature, max_tokens, daily_call_cap)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    body.provider,
    body.label?.trim() || `${body.provider.toUpperCase()} (${body.model})`,
    body.model.trim(),
    body.baseUrl?.trim() || defaultBaseUrl,
    maskSecret(body.apiKey),
    encrypted,
    body.temperature ?? 0.15,
    body.maxTokens ?? 1536,
    body.dailyCallCap ?? 120
  ).run();

  return c.json({ id, ok: true });
});

connectionRoutes.post('/ai/:id/activate', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id FROM ai_connections WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<{ id: string }>();
  if (!row) return c.json({ error: 'AI connection not found' }, 404);
  await c.env.DB.prepare('UPDATE ai_connections SET is_active = 0 WHERE user_id = ?').bind(user.id).run();
  await c.env.DB.prepare('UPDATE ai_connections SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
    .bind(id, user.id).run();
  return c.json({ ok: true });
});

connectionRoutes.post('/ai/test', async (c) => {
  const user = c.get('user');
  try {
    const ai = await resolveUserActiveAI(c.env, user.id);
    if (!ai) return c.json({ ok: false, error: 'No active BYO AI key connected' }, 404);
    const reply = await callBYOAI(
      ai,
      'Reply with 1 short sentence confirming connection.',
      'Ping test from Dollarino AI Trading Desk.',
      { fastJson: true }
    );
    return c.json({ ok: true, provider: ai.provider, model: ai.model, reply });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message || 'AI test failed' }, 400);
  }
});

connectionRoutes.delete('/ai/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM ai_connections WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

connectionRoutes.get('/telegram-bots', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT id, bot_username, bot_token_masked, signal_channel_id, is_active, created_at
     FROM telegram_bots WHERE user_id = ? ORDER BY created_at DESC`
  ).bind(user.id).all();
  return c.json({ bots: rows.results });
});

connectionRoutes.post('/telegram-bots', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ botToken: string; signalChannelId?: string; publicBaseUrl?: string }>();
  const token = (body.botToken ?? '').trim();
  if (!/^\d{6,14}:[A-Za-z0-9_-]{25,}$/.test(token)) {
    return c.json({ error: 'Invalid Telegram Bot Token format' }, 400);
  }

  const client = new TelegramBotClient(token);
  const me = await client.getMe();
  const botId = randomId('tgbot');
  const webhookSecret = randomId('wh');
  const encrypted = await encryptVaultJson({ botToken: token }, c.env.MASTER_ENCRYPTION_KEY);

  await c.env.DB.prepare(
    `INSERT INTO telegram_bots (id, user_id, bot_username, bot_token_masked, encrypted_bot_token, webhook_secret, signal_channel_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(botId, user.id, me.username, maskSecret(token), encrypted, webhookSecret, body.signalChannelId?.trim() || null).run();

  let webhookConfigured = false;
  const baseUrl = body.publicBaseUrl?.trim() || new URL(c.req.url).origin;
  if (baseUrl.startsWith('https://')) {
    await client.setWebhook(`${baseUrl.replace(/\/$/, '')}/api/telegram/webhook/${botId}`, webhookSecret)
      .then(() => { webhookConfigured = true; })
      .catch(() => {});
  }
  await client.setMyCommands([
    { command: 'start', description: 'شروع و منوی اصلی دلارینو' },
    { command: 'app', description: 'باز کردن مینی‌اپ معاملاتی دلارینو' },
    { command: 'positions', description: 'مشاهده و مدیریت معاملات باز' },
    { command: 'balance', description: 'نمایش موجودی لحظه‌ای حساب' },
    { command: 'settings', description: 'تنظیمات بازار و جهت' },
  ]).catch(() => {});
  const webAppUrl = (c.env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  if (webAppUrl.startsWith('https://')) {
    await client.setChatMenuButton(webAppUrl, 'پنل دلارینو').catch(() => {});
  }

  return c.json({
    id: botId,
    username: me.username,
    webhookPath: `/api/telegram/webhook/${botId}`,
    webhookConfigured,
  });
});

connectionRoutes.delete('/telegram-bots/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM telegram_bots WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

connectionRoutes.post('/telegram-bots/:id/sync-webhook', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ publicBaseUrl: string }>();
  const row = await c.env.DB.prepare(
    'SELECT encrypted_bot_token, webhook_secret FROM telegram_bots WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first<{ encrypted_bot_token: string; webhook_secret: string }>();
  if (!row) return c.json({ error: 'Bot not found' }, 404);

  const { botToken } = await decryptVaultJson<{ botToken: string }>(row.encrypted_bot_token, c.env.MASTER_ENCRYPTION_KEY);
  const client = new TelegramBotClient(botToken);
  const url = `${body.publicBaseUrl.replace(/\/$/, '')}/api/telegram/webhook/${id}`;
  await client.setWebhook(url, row.webhook_secret);
  return c.json({ ok: true, webhookUrl: url });
});
