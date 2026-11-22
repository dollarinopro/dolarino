import type { DollarinoSignal } from '@dollarino/core';
import { Hono } from 'hono';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import { confirmAndMirrorCopyTrade } from '../engine/copy-mirror.js';
import { executeSignalForUser, logAudit } from '../engine/executor.js';
import type { Env } from '../env.js';
import { requirePaidEntitlement } from './subscriptions.js';

export interface CopyTraderRow {
  id: string;
  user_id?: string | null;
  telegram_id?: string | null;
  auto_ask_publish?: number;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  bio_fa: string | null;
  bio_en: string | null;
  specialty: string;
  win_rate: number;
  roi_30d_pct: number;
  max_drawdown_pct: number;
  followers_count: number;
  min_allocation_usd: number;
  risk_level: string;
  is_verified: number;
  is_active: number;
  created_at: string;
}

export interface CopyTraderTradeRow {
  id: string;
  trader_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  entry_price: string;
  exit_price: string | null;
  stop_loss: string | null;
  tp1: string | null;
  tp2?: string | null;
  tp3?: string | null;
  status: 'OPEN' | 'CLOSED';
  publish_status?: string;
  pnl_pct: number;
  note: string | null;
  opened_at: string;
  closed_at: string | null;
}

export const copyTradeRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
copyTradeRoutes.use('*', requireAuth);

copyTradeRoutes.get('/traders', async (c) => {
  const user = c.get('user');

  const [tradersRes, tradesRes, mySubsRes, pendingOwnRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM copy_traders WHERE is_active = 1 AND is_verified = 1 ORDER BY roi_30d_pct DESC, followers_count DESC`
    ).all<CopyTraderRow>().catch(() => ({ results: [] as CopyTraderRow[] })),
    c.env.DB.prepare(
      `SELECT * FROM copy_trader_trades WHERE COALESCE(publish_status, 'PUBLISHED') = 'PUBLISHED' ORDER BY opened_at DESC LIMIT 80`
    ).all<CopyTraderTradeRow>().catch(() => ({ results: [] as CopyTraderTradeRow[] })),
    c.env.DB.prepare(
      `SELECT * FROM copy_subscriptions WHERE user_id = ? AND is_active = 1`
    ).bind(user.id).all<{
      id: string;
      trader_id: string;
      allocation_usd: number;
      risk_multiplier: number;
      auto_mirror: number;
      is_active: number;
    }>().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT ctt.*, ct.display_name AS trader_name
       FROM copy_trader_trades ctt
       JOIN copy_traders ct ON ct.id = ctt.trader_id
       WHERE ct.user_id = ? AND ctt.publish_status = 'PENDING_CONFIRM'
       ORDER BY ctt.opened_at DESC LIMIT 10`
    ).bind(user.id).all<CopyTraderTradeRow & { trader_name: string }>().catch(() => ({ results: [] })),
  ]);

  const tradesByTrader = new Map<string, CopyTraderTradeRow[]>();
  for (const t of tradesRes.results) {
    const arr = tradesByTrader.get(t.trader_id) ?? [];
    if (arr.length < 8) arr.push(t);
    tradesByTrader.set(t.trader_id, arr);
  }

  const subByTrader = new Map(mySubsRes.results.map((s) => [s.trader_id, s]));

  const traders = tradersRes.results.map((t) => {
    const mySub = subByTrader.get(t.id) ?? null;
    return {
      ...t,
      trades: tradesByTrader.get(t.id) ?? [],
      following: Boolean(mySub),
      mySubscription: mySub,
      isMe: t.user_id === user.id,
    };
  });

  return c.json({
    traders,
    pendingConfirmations: pendingOwnRes.results,
  });
});

copyTradeRoutes.post('/follow', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    traderId?: string;
    follow?: boolean;
    allocationUsd?: number;
    riskMultiplier?: number;
    autoMirror?: boolean;
  }>().catch(() => ({} as Record<string, unknown>));

  const traderId = String(body.traderId || '').trim();
  const follow = body.follow !== false;
  if (!traderId) return c.json({ error: 'شناسه تریدر الزامی است.' }, 400);

  const trader = await c.env.DB.prepare(
    `SELECT * FROM copy_traders WHERE id = ? AND is_active = 1 AND is_verified = 1 LIMIT 1`
  ).bind(traderId).first<CopyTraderRow>();
  if (!trader) return c.json({ error: 'تریدر تاییدشده یافت نشد.' }, 404);

  if (follow) {
    const gate = await requirePaidEntitlement(c.env.DB, user);
    if (!gate.ok) {
      return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
    }

    const alloc = Math.max(trader.min_allocation_usd || 20, Number(body.allocationUsd || 100));
    const mult = Math.max(0.2, Math.min(5, Number(body.riskMultiplier || 1)));
    const autoMirror = body.autoMirror !== false ? 1 : 0;

    const existing = await c.env.DB.prepare(
      `SELECT id, is_active FROM copy_subscriptions WHERE user_id = ? AND trader_id = ? LIMIT 1`
    ).bind(user.id, traderId).first<{ id: string; is_active: number }>();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE copy_subscriptions SET allocation_usd = ?, risk_multiplier = ?, auto_mirror = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?`
      ).bind(alloc, mult, autoMirror, existing.id).run();
      if (!existing.is_active) {
        await c.env.DB.prepare(`UPDATE copy_traders SET followers_count = followers_count + 1 WHERE id = ?`).bind(traderId).run();
      }
    } else {
      await c.env.DB.prepare(
        `INSERT INTO copy_subscriptions (id, user_id, trader_id, allocation_usd, risk_multiplier, auto_mirror, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      ).bind(randomId('csub'), user.id, traderId, alloc, mult, autoMirror).run();
      await c.env.DB.prepare(`UPDATE copy_traders SET followers_count = followers_count + 1 WHERE id = ?`).bind(traderId).run();
    }

    await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Subscribed to verified copy trader ${trader.display_name} ($${alloc})`);
    return c.json({ ok: true, following: true });
  } else {
    const existing = await c.env.DB.prepare(
      `SELECT id, is_active FROM copy_subscriptions WHERE user_id = ? AND trader_id = ? LIMIT 1`
    ).bind(user.id, traderId).first<{ id: string; is_active: number }>();

    if (existing && existing.is_active) {
      await c.env.DB.prepare(
        `UPDATE copy_subscriptions SET is_active = 0, updated_at = datetime('now') WHERE id = ?`
      ).bind(existing.id).run();
      await c.env.DB.prepare(`UPDATE copy_traders SET followers_count = MAX(0, followers_count - 1) WHERE id = ?`).bind(traderId).run();
    }
    return c.json({ ok: true, following: false });
  }
});

copyTradeRoutes.post('/trades/:tradeId/confirm-publish', async (c) => {
  const user = c.get('user');
  const tradeId = c.req.param('tradeId');
  const body = await c.req.json<{ approve?: boolean }>().catch(() => ({ approve: true }));

  const row = await c.env.DB.prepare(
    `SELECT ctt.id, ct.user_id AS trader_user_id
     FROM copy_trader_trades ctt
     JOIN copy_traders ct ON ct.id = ctt.trader_id
     WHERE ctt.id = ? LIMIT 1`
  ).bind(tradeId).first<{ id: string; trader_user_id: string | null }>();

  if (!row) return c.json({ error: 'معامله یافت نشد.' }, 404);
  const isAdmin = user.role === 'owner' || user.role === 'admin';
  if (!isAdmin && row.trader_user_id !== user.id) {
    return c.json({ error: 'شما مجاز به تایید انتشار این معامله نیستید.' }, 403);
  }

  const res = await confirmAndMirrorCopyTrade(c.env, tradeId, body.approve !== false);
  return c.json(res);
});

copyTradeRoutes.post('/copy-now/:tradeId', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) {
    return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  }

  const tradeId = c.req.param('tradeId');
  const trade = await c.env.DB.prepare(
    `SELECT ctt.*, ct.display_name
     FROM copy_trader_trades ctt
     JOIN copy_traders ct ON ct.id = ctt.trader_id
     WHERE ctt.id = ? AND ct.is_active = 1 AND ct.is_verified = 1 LIMIT 1`
  ).bind(tradeId).first<CopyTraderTradeRow & { display_name: string }>();

  if (!trade) return c.json({ error: 'معامله تاییدشده یافت نشد.' }, 404);
  if (trade.status !== 'OPEN') return c.json({ error: 'این معامله بسته شده است؛ فقط معاملات باز قابل کپی فوری هستند.' }, 400);

  const entry = Number(trade.entry_price);
  const sl = Number(trade.stop_loss || (trade.direction === 'LONG' ? entry * 0.975 : entry * 1.025));
  const tp1 = Number(trade.tp1 || (trade.direction === 'LONG' ? entry * 1.03 : entry * 0.97));
  const dist = Math.max(entry * 0.015, Math.abs(tp1 - entry));
  const tp2 = trade.tp2 ? Number(trade.tp2) : (trade.direction === 'LONG' ? entry + dist * 1.7 : entry - dist * 1.7);
  const tp3 = trade.tp3 ? Number(trade.tp3) : (trade.direction === 'LONG' ? entry + dist * 2.5 : entry - dist * 2.5);

  const sig: DollarinoSignal = {
    symbol: trade.symbol,
    direction: trade.direction,
    timeframe: 'Copy',
    price: trade.entry_price,
    stopLoss: String(sl),
    leverage: Math.max(1, trade.leverage || 5),
    tp1: String(tp1),
    tp2: String(Number(tp2.toFixed(4))),
    tp3: String(Number(tp3.toFixed(4))),
    channelHandle: '@Dollarino_official',
    engineKey: 'copy_trade',
    engineLabel: `🏆 کپی‌ترید تاییدشده · ${trade.display_name}`,
    reason: `کپی معامله از تریدر تاییدشده ${trade.display_name}`,
  };

  const sigId = randomId('sig');
  await c.env.DB.prepare(
    `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status, engine_source, engine_label)
     VALUES (?, ?, 'copy_trader', ?, ?, 'Copy', ?, ?, ?, ?, ?, ?, ?, 'NEW', 'copy_trade', ?)`
  ).bind(
    sigId,
    user.id,
    sig.symbol,
    sig.direction,
    sig.price,
    sig.stopLoss,
    sig.leverage,
    sig.tp1,
    sig.tp2,
    sig.tp3,
    trade.note || sig.reason,
    sig.engineLabel
  ).run();

  const execRes = await executeSignalForUser(c.env, user.id, sig, {
    signalId: sigId,
    forceBypassState: true,
    strategyKey: 'copy_trade',
  });

  if (execRes.ok) {
    await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
    return c.json({ ok: true, tradeId: execRes.tradeId, message: `معامله ${trade.symbol} با موفقیت کپی شد!` });
  }
  return c.json({ ok: false, error: execRes.error || 'خطا در اجرای کپی‌ترید' }, 400);
});
