import { Hono } from 'hono';
import { formatDollarinoSignal, parseDollarinoSignal } from '@dollarino/core';
import { requireAuth, type AppVariables } from '../auth.js';
import { decryptVaultJson, encryptVaultJson, maskSecret, randomId } from '../crypto.js';
import { executeSignalForUser, logAudit, notifyUserTelegram } from '../engine/executor.js';
import type { Env } from '../env.js';
import { resolveUserEntitlement } from './subscriptions.js';
import { TelegramBotClient } from '../telegram/client.js';
import { handleTelegramUpdate } from '../telegram/handler.js';

export const webhookRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

export const DEFAULT_TG_COMMANDS = [
  { command: 'start', description: 'شروع، احراز هویت و منوی اصلی دلارینو' },
  { command: 'ai', description: 'چت با هوش مصنوعی اختصاصی + تحلیل عکس چارت' },
  { command: 'autostart', description: 'شروع خودکار ربات با یک کلیک' },
  { command: 'scan', description: 'شکار و ترید فوری با هوش مصنوعی' },
  { command: 'app', description: 'باز کردن مینی‌اپ معاملاتی دلارینو' },
  { command: 'weblogin', description: 'دریافت لینک ورود فوری با یک کلیک به سایت' },
  { command: 'wizard', description: 'راه‌اندازی ۴ مرحله‌ای ربات ترید' },
  { command: 'positions', description: 'مشاهده و مدیریت معاملات باز' },
  { command: 'balance', description: 'نمایش موجودی لحظه‌ای حساب' },
  { command: 'wallet', description: 'مدیریت کیف‌پول Trust Wallet DApp' },
  { command: 'dex', description: 'رادار توکن‌های داغ DexScreener' },
  { command: 'myai', description: 'آموزش و فعال‌سازی هوش مصنوعی من' },
  { command: 'copy', description: 'کپی‌ترید تاییدشده دلارینو' },
  { command: 'card', description: 'صدور و دریافت تصویر کارت سود دلارینو' },
  { command: 'settings', description: 'تنظیمات بازار (اسپات/فیوچرز) و جهت' },
  { command: 'support', description: 'پشتیبانی هوشمند ۲۴/۷ و گفتگو با مدیران' },
  { command: 'about', description: 'معرفی دلارینو و سازنده پروژه (آوید کیا)' },
  { command: 'help', description: 'راهنمای کامل و امنیت حساب' },
];

/**
 * TradingView Alert Webhook: accepts JSON or raw Dollarino signal text!
 * Routes the signal to Auto-Trade OR sends Manual-Trade inline button to Telegram!
 */
webhookRoutes.post('/tv/:secret', async (c) => {
  const secret = c.req.param('secret');
  const cfg = await c.env.DB.prepare(
    `SELECT bc.user_id, bc.trade_execution_mode, bc.signal_channel_handle, u.telegram_id, u.email, u.username, u.role
     FROM bot_configs bc JOIN users u ON bc.user_id = u.id
     WHERE bc.webhook_secret = ?`
  ).bind(secret).first<{
    user_id: string;
    trade_execution_mode: 'AUTO' | 'MANUAL_CONFIRM';
    signal_channel_handle: string;
    telegram_id: string | null;
    email: string;
    username: string;
    role: 'owner' | 'admin' | 'user';
  }>();

  if (!cfg) return c.json({ error: 'Invalid TradingView webhook secret' }, 404);

  const rawBody = await c.req.text();
  const signal = parseDollarinoSignal(rawBody);
  if (!signal) {
    return c.json({ error: 'Unrecognized signal payload. Provide Dollarino text or JSON with symbol/direction/price/stop/tp1.' }, 400);
  }

  const formatted = formatDollarinoSignal({
    ...signal,
    channelHandle: signal.channelHandle || cfg.signal_channel_handle || '@Dollarino_official',
  });

  const sigId = randomId('sig');
  await c.env.DB.prepare(
    `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, sl_pct, tp1_pct, tp2_pct, tp3_pct, raw_text, status)
     VALUES (?, ?, 'tradingview_webhook', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
  ).bind(
    sigId,
    cfg.user_id,
    signal.symbol,
    signal.direction,
    signal.timeframe,
    signal.price,
    signal.stopLoss,
    signal.leverage,
    signal.tp1,
    signal.tp2 ?? null,
    signal.tp3 ?? null,
    signal.slPct ?? null,
    signal.tp1Pct ?? null,
    signal.tp2Pct ?? null,
    signal.tp3Pct ?? null,
    formatted
  ).run();

  await logAudit(c.env.DB, cfg.user_id, 'SIGNAL', 'INFO', `TradingView Webhook received ${signal.direction} ${signal.symbol}`, signal.symbol);

  const ent = await resolveUserEntitlement(c.env.DB, {
    id: cfg.user_id,
    email: cfg.email,
    username: cfg.username,
    role: cfg.role,
    telegramId: cfg.telegram_id,
  });
  if (!ent.allowCopyTrade) {
    await logAudit(c.env.DB, cfg.user_id, 'RISK', 'WARN', 'TradingView webhook skipped: active paid subscription required', signal.symbol);
    return c.json({ ok: false, mode: cfg.trade_execution_mode, code: 'SUBSCRIPTION_REQUIRED', error: 'Active subscription required for TradingView webhooks' }, 402);
  }

  if (cfg.trade_execution_mode === 'AUTO') {
    const exec = await executeSignalForUser(c.env, cfg.user_id, signal, {
      signalId: sigId,
      forceBypassState: true,
      strategyKey: 'tradingview_webhook',
    });
    if (exec.ok) {
      await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
    }
    return c.json({ ok: exec.ok, mode: 'AUTO', signalId: sigId, tradeId: exec.tradeId, error: exec.error });
  }

  // Manual Confirm Mode: push Telegram inline card with exact 2-step confirmation flow
  await notifyUserTelegram(
    c.env,
    cfg.user_id,
    `📡 سیگنال جدید TradingView:\n\n${formatted}`,
    [
      [
        { text: 'دلارینو ترید کن برام 🤖', callback_data: `manual_trade:${sigId}`, style: 'success' },
        { text: 'تایید و اجرای فوری ✅', callback_data: `manual_confirm:${sigId}`, style: 'primary' },
      ],
    ]
  );
  return c.json({ ok: true, mode: 'MANUAL_CONFIRM', signalId: sigId, formatted });
});

/**
 * Global instance Telegram Bot Webhook
 */
webhookRoutes.post('/telegram', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured on this worker' }, 503);
  }
  if (c.env.TELEGRAM_WEBHOOK_SECRET) {
    const hdr = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    if (hdr !== c.env.TELEGRAM_WEBHOOK_SECRET) {
      return c.json({ error: 'Unauthorized webhook secret' }, 403);
    }
  }
  const update = await c.req.json();
  const result = await handleTelegramUpdate(c.env, c.env.TELEGRAM_BOT_TOKEN, update);
  return c.json(result);
});

/**
 * Personal user-registered Telegram Bot Webhook (/api/webhook/telegram/:botId or /api/telegram/webhook/:botId)
 */
webhookRoutes.post('/telegram/:botId', async (c) => {
  const botId = c.req.param('botId');
  const row = await c.env.DB.prepare(
    `SELECT encrypted_bot_token, webhook_secret, is_active FROM telegram_bots WHERE id = ?`
  ).bind(botId).first<{ encrypted_bot_token: string; webhook_secret: string; is_active: number }>();

  if (!row || !row.is_active) return c.json({ error: 'Bot inactive or not found' }, 404);
  const hdr = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (hdr && hdr !== row.webhook_secret) return c.json({ error: 'Forbidden' }, 403);

  const { botToken } = await decryptVaultJson<{ botToken: string }>(row.encrypted_bot_token, c.env.MASTER_ENCRYPTION_KEY);
  if (!botToken) return c.json({ error: 'Invalid bot token vault' }, 500);

  const update = await c.req.json();
  const result = await handleTelegramUpdate(c.env, botToken, update);
  return c.json(result);
});

/**
 * One-click global Telegram Bot provisioning: registers Webhook, Bot Commands, and Mini App Menu Button
 */
webhookRoutes.post('/telegram/setup', requireAuth, async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner' && user.role !== 'admin') {
    return c.json({ error: 'Admin role required' }, 403);
  }
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured in Worker secrets' }, 503);
  }
  const body = await c.req.json<{ webhookBaseUrl?: string; webAppUrl?: string }>().catch(
    () => ({} as { webhookBaseUrl?: string; webAppUrl?: string })
  );
  const webhookBase = (body.webhookBaseUrl || new URL(c.req.url).origin).replace(/\/$/, '');
  const webAppUrl = (body.webAppUrl || c.env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  const webhookUrl = `${webhookBase}/api/webhook/telegram`;

  const client = new TelegramBotClient(c.env.TELEGRAM_BOT_TOKEN);
  const me = await client.getMe();
  await client.setWebhook(webhookUrl, c.env.TELEGRAM_WEBHOOK_SECRET);
  await client.setMyCommands(DEFAULT_TG_COMMANDS);
  if (webAppUrl.startsWith('https://')) {
    await client.setChatMenuButton(webAppUrl, 'پنل دلارینو');
  }
  const info = await client.getWebhookInfo().catch(() => null);

  return c.json({
    ok: true,
    bot: me,
    webhookUrl,
    webAppUrl,
    commandsRegistered: DEFAULT_TG_COMMANDS.length,
    webhookInfo: info,
  });
});

let memSyncedVersion = '';

export async function syncTelegramBotAutoOnVersion(env: Env, targetVersion = '9.9.3'): Promise<void> {
  if (memSyncedVersion === targetVersion) return;

  if (env.HILINKUP_TEST_API_KEY?.trim() && env.MASTER_ENCRYPTION_KEY) {
    const testKey = env.HILINKUP_TEST_API_KEY.trim();
    const masked = maskSecret(testKey);
    const enc = await encryptVaultJson({ apiKey: testKey }, env.MASTER_ENCRYPTION_KEY).catch(() => null);
    if (enc) {
      await env.DB.prepare(
        `INSERT INTO platform_ai_engines (id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked, encrypted_api_key, updated_at)
         VALUES ('paie_hilinkup_test_slot', 9, 'deepseek', ?, 'baidu/deepseek-v4.1-flash-1017', 'https://api.hilinkup.com/v1', 50, 0, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET api_key_masked = excluded.api_key_masked, encrypted_api_key = excluded.encrypted_api_key, updated_at = datetime('now')`
      )
        .bind(`تست Hilinkup (${masked.slice(-4)})`, masked, enc)
        .run()
        .catch(() => {});
    }
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    memSyncedVersion = targetVersion;
    return;
  }
  const row = await env.DB.prepare(
    `SELECT value FROM system_settings WHERE key = 'tg_bot_synced_version' LIMIT 1`
  ).first<{ value: string }>().catch(() => null);
  if (row?.value === targetVersion) {
    memSyncedVersion = targetVersion;
    return;
  }

  const client = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
  const webAppUrl = (env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  const webhookUrl = `${webAppUrl}/api/webhook/telegram`;

  await client.setMyCommands(DEFAULT_TG_COMMANDS);
  if (webAppUrl.startsWith('https://')) {
    await client.setChatMenuButton(webAppUrl, 'پنل دلارینو');
    await client.setWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
  }
  await env.DB.prepare(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ('tg_bot_synced_version', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).bind(targetVersion).run().catch(() => {});
  memSyncedVersion = targetVersion;
}

