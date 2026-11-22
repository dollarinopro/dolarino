import { Hono } from 'hono';
import {
  atr,
  computeKbosV11Detailed,
  computeStrategySignals,
  DEFAULT_KBOS_PARAMS,
  DEFAULT_MIXER_WEIGHTS,
  ema,
  evaluateCustomStrategy,
  evaluateSignalMixerAtBar,
  formatDollarinoSignal,
  mergeKbosParams,
  parseDollarinoSignal,
  resolveEngineDisplayLabel,
  rsi,
  runBacktest,
  SAMPLE_CUSTOM_STRATEGIES,
  selectClosedCandles,
  strategyOutputToDollarinoSignal,
  type CustomStrategyLanguage,
  type Direction,
  type DirectionMode,
  type MarginMode,
  type MarketType,
  type SignalMixerWeights,
  type StrategyKey,
  type Timeframe,
} from '@dollarino/core';
import { requireAuth, type AppVariables } from '../auth.js';
import { getPlatformAISummary, resolveAIEnsemble, runAutonomousAITrader } from '../ai/providers.js';
import { buildProfitCardSvg, renderProfitCardPng } from '../cards/renderer.js';
import { decryptVaultJson, hmacSha256Hex, randomId, sha256Hex } from '../crypto.js';
import { enforceRateLimit } from '../security.js';
import {
  activateExclusiveTradingEngine,
  getActiveEngineState,
  type TradingEngineChoice,
} from '../engine/exclusive-engine.js';
import { requirePaidEntitlement, resolveUserEntitlement } from './subscriptions.js';
import {
  executeSignalForUser,
  logAudit,
  reconcileOpenPositionsForUser,
  type UserBotConfigRow,
} from '../engine/executor.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { getExchangeMarkets, MAJOR_LIQUID_COINS, normalizeCanonicalSymbol } from '../exchanges/markets.js';
import { publishProfitCardToTelegram, publishSignalClosedCard } from '../telegram/publisher.js';
import type { ExchangeProviderId } from '@dollarino/core';

export const tradingRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
tradingRoutes.use('*', requireAuth);

tradingRoutes.get('/overview', async (c) => {
  const user = c.get('user');
  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id)
    .first<UserBotConfigRow>();

  const activeRow = await c.env.DB.prepare(
    `SELECT provider, label FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first<{ provider: ExchangeProviderId; label: string }>();

  const effectiveProvider: ExchangeProviderId =
    activeRow?.provider === 'kcex'
      ? 'kcex'
      : cfg?.trading_mode === 'PAPER'
        ? 'paper'
        : activeRow?.provider ?? 'paper';

  const { adapter, provider, label } = await resolveUserExchangeAdapter(c.env, user.id, effectiveProvider);

  const [balance, openTradesRaw, unreadNotifications, stats] = await Promise.all([
    adapter.getBalance(cfg?.market_type ?? 'FUTURES').catch(() => ({ free: '0.00', used: '0.00', total: '0.00', currency: 'USDT' })),
    c.env.DB.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 25`).bind(user.id).all<{
      id: string;
      symbol: string;
      direction: Direction;
      entry_price: string;
      remaining_quantity: string;
      leverage: number;
      margin_used: string;
      current_stop_loss: string;
      tp1: string;
      realized_pnl: string;
      mode: string;
      opened_at: string;
    }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`).bind(user.id).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total_trades,
              SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END) as winning_trades,
              SUM(CAST(realized_pnl AS REAL)) as total_realized_pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED'`
    ).bind(user.id).first<{ total_trades: number; winning_trades: number | null; total_realized_pnl: number | null }>(),
  ]);

  const openTrades = [];
  for (const pos of openTradesRaw.results) {
    const rawMark = await adapter.getTickerPrice(pos.symbol).catch(() => null);
    const mark = rawMark ? Number(rawMark) : Number(pos.entry_price);
    const entry = Number(pos.entry_price);
    const qty = Number(pos.remaining_quantity);
    const uPnl = pos.direction === 'LONG' ? (mark - entry) * qty : (entry - mark) * qty;
    openTrades.push({
      ...pos,
      mark_price: mark.toFixed(mark >= 100 ? 2 : 4),
      unrealized_pnl: uPnl.toFixed(2),
    });
  }

  const totalClosed = Number(stats?.total_trades || 0);
  const wins = Number(stats?.winning_trades || 0);
  return c.json({
    config: cfg,
    activeExchange: { provider, label },
    balance,
    openTrades,
    unreadNotifications: Number(unreadNotifications?.cnt || 0),
    stats: {
      totalTrades: totalClosed,
      winRatePct: totalClosed > 0 ? Number(((wins / totalClosed) * 100).toFixed(1)) : 0,
      totalRealizedPnlUsd: Number((stats?.total_realized_pnl || 0).toFixed(2)),
    },
  });
});

tradingRoutes.get('/dashboard', async (c) => {
  const user = c.get('user');
  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<UserBotConfigRow & {
      margin_mode?: string;
      mixer_threshold?: number;
      mixer_weights_json?: string;
      strategy_flow_json?: string;
      kbos_params_json?: string;
      risk_profile_json?: string;
      trailing_stop_enabled?: number;
      trailing_stop_pct?: number;
      trail_after_tp1?: number;
      started_at?: string | null;
    }>();

  if (cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE') {
    const doId = c.env.TRADING_BOT_DO.idFromName('global-coordinator');
    const doStub = c.env.TRADING_BOT_DO.get(doId);
    const keepTick = doStub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {});
    try {
      c.executionCtx.waitUntil(keepTick);
    } catch {
      void keepTick;
    }
  }

  const activeRow = await c.env.DB.prepare(
    `SELECT provider, label FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first<{ provider: ExchangeProviderId; label: string }>();

  const effectiveProvider: ExchangeProviderId =
    activeRow?.provider === 'kcex'
      ? 'kcex'
      : cfg?.trading_mode === 'PAPER'
        ? 'paper'
        : activeRow?.provider ?? 'paper';

  const { adapter, provider, label } = await resolveUserExchangeAdapter(c.env, user.id, effectiveProvider);

  const [balance, openTradesRaw, pendingOrders, closedTrades, recentSignals, stats, periodStats, walletRow, ledgerRows, aiRow, recentAiDecisions, entitlement, platformAI, activeEngine] = await Promise.all([
    adapter.getBalance(cfg?.market_type ?? 'FUTURES').catch(() => ({ free: '0.00', used: '0.00', total: '0.00', currency: 'USDT' })),
    c.env.DB.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC`).bind(user.id).all<{
      id: string;
      symbol: string;
      direction: Direction;
      market_type?: MarketType;
      entry_price: string;
      remaining_quantity: string;
      leverage: number;
      margin_used: string;
      current_stop_loss: string;
      tp1: string;
      tp2: string | null;
      tp3: string | null;
      tp1_hit: number;
      tp2_hit: number;
      risk_free_active: number;
      trailing_active?: number;
      realized_pnl: string;
      mode: string;
      exchange_provider: string;
      opened_at: string;
    }>(),
    c.env.DB.prepare(`SELECT * FROM pending_orders WHERE user_id = ? AND status = 'PENDING' ORDER BY created_at DESC`).bind(user.id).all(),
    c.env.DB.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT 60`).bind(user.id).all(),
    c.env.DB.prepare(`SELECT * FROM signals WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 24`).bind(user.id).all(),
    c.env.DB.prepare(
      `SELECT
        COUNT(*) as total_trades,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as total_pnl,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as gross_wins,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) < 0 THEN ABS(CAST(realized_pnl AS REAL)) ELSE 0 END), 0) as gross_losses,
        COALESCE(SUM(CASE WHEN date(closed_at) = date('now') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as today_pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED'`
    ).bind(user.id).first<{
      total_trades: number;
      wins: number;
      total_pnl: number;
      gross_wins: number;
      gross_losses: number;
      today_pnl: number;
    }>(),
    c.env.DB.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN closed_at >= datetime('now', '-24 hours') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as last_24h_pnl,
        COALESCE(SUM(CASE WHEN closed_at >= datetime('now', '-7 days') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as last_7d_pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED'`
    ).bind(user.id).first<{ last_24h_pnl: number; last_7d_pnl: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN event_type IN ('DEPOSIT','TOPUP') THEN amount_usd ELSE 0 END), 0) as deposited
       FROM wallet_ledger WHERE user_id = ? AND mode = ?`
    ).bind(user.id, cfg?.trading_mode ?? 'PAPER').first<{ deposited: number }>().catch(() => ({ deposited: 0 })),
    c.env.DB.prepare(
      `SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT provider, model FROM ai_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
      .bind(user.id).first<{ provider: string; model: string }>(),
    c.env.DB.prepare(
      `SELECT id, level, symbol, message, details_json, created_at FROM audit_logs WHERE user_id = ? AND category IN ('AI_AGENT', 'SIGNAL', 'ORDER', 'SYSTEM') ORDER BY created_at DESC LIMIT 12`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    resolveUserEntitlement(c.env.DB, user),
    getPlatformAISummary(c.env),
    getActiveEngineState(c.env.DB, user.id),
  ]);

  const totalEq = Math.max(1, Number(balance.total) || Number(cfg?.paper_balance ?? 10000));

  // Enrich open positions with live mark price, ROE %, sparkline, and unrealized PnL
  const priceCache = new Map<string, number>();
  const sparkCache = new Map<string, number[]>();
  const openTrades = [];
  let totalUnrealizedPnl = 0;

  for (const pos of openTradesRaw.results) {
    let mark = priceCache.get(pos.symbol);
    let spark = sparkCache.get(pos.symbol);
    if (mark === undefined) {
      const k = await adapter.getKlines(pos.symbol, '5m', 24).catch(() => []);
      mark = k.length ? k[k.length - 1]!.close : Number(await adapter.getTickerPrice(pos.symbol).catch(() => pos.entry_price));
      spark = k.length ? k.map((c) => c.close) : [Number(pos.entry_price), mark];
      priceCache.set(pos.symbol, mark);
      sparkCache.set(pos.symbol, spark);
    }
    const entry = Number(pos.entry_price);
    const qty = Number(pos.remaining_quantity);
    const margin = Math.max(0.01, Number(pos.margin_used));
    const uPnl = pos.direction === 'LONG' ? (mark - entry) * qty : (entry - mark) * qty;
    totalUnrealizedPnl += uPnl;
    const roePct = (uPnl / margin) * 100;
    const capitalPct = (margin / totalEq) * 100;
    const liqEst = pos.direction === 'LONG'
      ? entry * (1 - 0.9 / Math.max(1, pos.leverage))
      : entry * (1 + 0.9 / Math.max(1, pos.leverage));
    openTrades.push({
      ...pos,
      mark_price: mark.toFixed(mark >= 100 ? 2 : 4),
      unrealized_pnl: uPnl.toFixed(2),
      roe_pct: Number(roePct.toFixed(2)),
      capital_pct: Number(capitalPct.toFixed(1)),
      funding_usd: Number((-(margin * pos.leverage * 0.0001)).toFixed(3)),
      liq_price_est: liqEst.toFixed(liqEst >= 100 ? 2 : 4),
      sparkline: spark ?? [entry, mark],
    });
  }

  // Hourly, Daily (30d cumulative), & 7-day weekly breakdown
  const [hourlyAgg, dailyAgg, weeklyAgg] = await Promise.all([
    c.env.DB.prepare(
      `SELECT substr(closed_at, 1, 13) || ':00' as bucket, SUM(CAST(realized_pnl AS REAL)) as pnl, COUNT(*) as trades
       FROM trades WHERE user_id = ? AND status = 'CLOSED' AND closed_at IS NOT NULL
       GROUP BY bucket ORDER BY bucket DESC LIMIT 24`
    ).bind(user.id).all<{ bucket: string; pnl: number; trades: number }>(),
    c.env.DB.prepare(
      `SELECT date(closed_at) as bucket, SUM(CAST(realized_pnl AS REAL)) as pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED' AND closed_at >= date('now', '-30 days') AND closed_at IS NOT NULL
       GROUP BY bucket ORDER BY bucket ASC`
    ).bind(user.id).all<{ bucket: string; pnl: number }>(),
    c.env.DB.prepare(
      `SELECT date(closed_at) as day, COUNT(*) as count,
              SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END) as wins,
              SUM(CAST(realized_pnl AS REAL)) as pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED' AND closed_at >= date('now', '-7 days')
       GROUP BY day ORDER BY day ASC`
    ).bind(user.id).all<{ day: string; count: number; wins: number; pnl: number }>(),
  ]);

  let runningCum = 0;
  const cumulative30d = dailyAgg.results.map((d) => {
    runningCum += Number(d.pnl || 0);
    return { date: d.bucket, dailyPnl: Number(d.pnl || 0), cumulativePnl: Number(runningCum.toFixed(2)) };
  });

  // Live 8-channel Signal Mixer snapshot on active symbol using real HTF trend
  let mixerSnapshot = null;
  if (cfg) {
    const [klines, htfKlines] = await Promise.all([
      adapter.getKlines(cfg.symbol, cfg.entry_timeframe, 240).catch(() => []),
      adapter.getKlines(cfg.symbol, cfg.higher_timeframe || '1h', 120).catch(() => []),
    ]);
    if (klines.length >= 35) {
      let realHtfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      if (htfKlines.length >= 25) {
        const hc = htfKlines.map((k) => k.close);
        const h20 = ema(hc, 20);
        const h50 = ema(hc, 50);
        const f = h20[htfKlines.length - 1];
        const s = h50[htfKlines.length - 1];
        if (Number.isFinite(f) && Number.isFinite(s)) {
          realHtfTrend = f! > s! ? 'BULLISH' : f! < s! ? 'BEARISH' : 'NEUTRAL';
        }
      }
      const weights: SignalMixerWeights = cfg.mixer_weights_json
        ? (JSON.parse(cfg.mixer_weights_json) as SignalMixerWeights)
        : DEFAULT_MIXER_WEIGHTS;
      mixerSnapshot = evaluateSignalMixerAtBar(klines, klines.length - 1, realHtfTrend, weights, cfg.mixer_threshold ?? 65);
    }
  }

  const profitFactor =
    stats && stats.gross_losses > 0
      ? stats.gross_wins / stats.gross_losses
      : stats && stats.gross_wins > 0
        ? 99
        : 0;

  let kbosParams = DEFAULT_KBOS_PARAMS;
  try {
    if (cfg?.kbos_params_json) kbosParams = mergeKbosParams(JSON.parse(cfg.kbos_params_json));
  } catch { /* default */ }

  let riskProfile: Record<string, unknown> = {
    preset: 'balanced',
    marketBias: 'neutral',
    preferredSession: 'automatic',
    entryStyle: 'balanced',
    maxSpread: 0.5,
    cooldownMinutes: 10,
    trailingStop: true,
    trailingDistance: 2.0,
    allocatedAmount: Math.round(totalEq * ((cfg?.margin_pct ?? 50) / 100)),
  };
  try {
    if (cfg?.risk_profile_json) riskProfile = { ...riskProfile, ...JSON.parse(cfg.risk_profile_json) };
  } catch { /* default */ }

  const totalDeposited = (walletRow?.deposited ?? 0) > 0 ? walletRow!.deposited : 10000;
  const totalPnl = stats?.total_pnl ?? 0;
  const tfSecs: Record<string, number> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1d': 86400 };
  const cyclePeriod = tfSecs[cfg?.entry_timeframe ?? '15m'] ?? 900;
  const nextCycleInSec = cyclePeriod - (Math.floor(Date.now() / 1000) % cyclePeriod);

  return c.json({
    config: cfg,
    activeEngine,
    kbosParams,
    riskProfile,
    activeExchange: { provider, label },
    activeAI: aiRow || null,
    platformAI,
    entitlement,
    balance,
    openTrades,
    pendingOrders: pendingOrders.results,
    closedTrades: closedTrades.results,
    recentSignals: recentSignals.results,
    recentAiDecisions: recentAiDecisions.results,
    walletLedger: ledgerRows.results,
    nextCycleInSec,
    stats: {
      totalTrades: stats?.total_trades ?? 0,
      winRate: stats?.total_trades ? (stats.wins / stats.total_trades) * 100 : 0,
      totalPnl,
      todayPnl: stats?.today_pnl ?? 0,
      last24hPnl: periodStats?.last_24h_pnl ?? 0,
      last7dPnl: periodStats?.last_7d_pnl ?? 0,
      unrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
      allTimePct: totalDeposited > 0 ? Number(((totalPnl / totalDeposited) * 100).toFixed(2)) : 0,
      totalDeposited,
      profitFactor,
    },
    charts: {
      hourlyPnl: [...hourlyAgg.results].reverse(),
      dailyPnl: [...dailyAgg.results],
      cumulative30d,
      weeklyResults: weeklyAgg.results,
    },
    mixerSnapshot,
  });
});

tradingRoutes.get('/wallet/ledger', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(user.id).all();
  return c.json({ ledger: rows.results });
});

tradingRoutes.post('/wallet/topup', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) return c.json({ error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  const body = await c.req.json<{ amountUsd?: number; note?: string }>();
  const amount = Number(body.amountUsd ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return c.json({ error: 'Amount must be between $1 and $1,000,000' }, 400);
  }
  const cfg = await c.env.DB.prepare('SELECT trading_mode, paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ trading_mode: string; paper_balance: string }>();

  const nextBal = Number(cfg?.paper_balance ?? 10000) + amount;
  await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ?, updated_at = datetime(\'now\') WHERE user_id = ?')
    .bind(nextBal.toFixed(2), user.id).run();

  await c.env.DB.prepare(
    `INSERT INTO wallet_ledger (id, user_id, mode, event_type, amount_usd, balance_after, note)
     VALUES (?, ?, ?, 'TOPUP', ?, ?, ?)`
  ).bind(randomId('wl'), user.id, cfg?.trading_mode ?? 'PAPER', amount, nextBal, body.note ?? 'Instant Simulation Credit Top-Up').run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Wallet topped up +$${amount.toFixed(2)} (Balance: $${nextBal.toFixed(2)})`);
  return c.json({ ok: true, balanceAfter: nextBal });
});

tradingRoutes.post('/wallet/reset', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) return c.json({ error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  const targetBal = 10000;
  await c.env.DB.prepare(`UPDATE bot_configs SET paper_balance = '10000.00', updated_at = datetime('now') WHERE user_id = ?`)
    .bind(user.id).run();
  await c.env.DB.prepare(
    `INSERT INTO wallet_ledger (id, user_id, mode, event_type, amount_usd, balance_after, note)
     VALUES (?, ?, 'PAPER', 'TOPUP', ?, ?, 'Reset Simulation Balance to $10,000')`
  ).bind(randomId('wl'), user.id, targetBal, targetBal).run().catch(() => {});
  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', 'Simulation balance reset to $10,000.00');
  return c.json({ ok: true, balanceAfter: targetBal });
});

tradingRoutes.on(['PATCH', 'PUT'], '/config', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Record<string, unknown>>();

  const allowedFields: Record<string, string> = {
    trading_mode: 'trading_mode',
    market_type: 'market_type',
    direction_mode: 'direction_mode',
    hedge_mode: 'hedge_mode',
    trade_execution_mode: 'trade_execution_mode',
    margin_mode: 'margin_mode',
    notifications_enabled: 'notifications_enabled',
    symbol: 'symbol',
    auto_scan_top: 'auto_scan_top',
    scan_scope: 'scan_scope',
    allow_auto_flip: 'allow_auto_flip',
    allow_pyramiding: 'allow_pyramiding',
    watchlist_json: 'watchlist_json',
    strategy_key: 'strategy_key',
    active_custom_strategy_id: 'active_custom_strategy_id',
    entry_timeframe: 'entry_timeframe',
    higher_timeframe: 'higher_timeframe',
    margin_pct: 'margin_pct',
    use_signal_leverage: 'use_signal_leverage',
    max_leverage: 'max_leverage',
    tp1_close_pct: 'tp1_close_pct',
    tp2_close_pct: 'tp2_close_pct',
    tp3_close_pct: 'tp3_close_pct',
    auto_breakeven_on_tp1: 'auto_breakeven_on_tp1',
    move_sl_to_tp1_on_tp2: 'move_sl_to_tp1_on_tp2',
    daily_max_loss_pct: 'daily_max_loss_pct',
    max_open_positions: 'max_open_positions',
    block_weekends: 'block_weekends',
    macro_blackout: 'macro_blackout',
    ai_gate_enabled: 'ai_gate_enabled',
    ai_min_confidence: 'ai_min_confidence',
    signal_channel_handle: 'signal_channel_handle',
    mixer_threshold: 'mixer_threshold',
    mixer_weights_json: 'mixer_weights_json',
    strategy_flow_json: 'strategy_flow_json',
    kbos_params_json: 'kbos_params_json',
    risk_profile_json: 'risk_profile_json',
    trailing_stop_enabled: 'trailing_stop_enabled',
    trailing_stop_pct: 'trailing_stop_pct',
    trail_after_tp1: 'trail_after_tp1',
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.trading_mode === 'LIVE') {
    const ent = await resolveUserEntitlement(c.env.DB, user);
    if (!ent.allowLiveTrading) {
      return c.json({
        error: 'Active paid subscription required to switch to Live Trading (Toobit / Bitunix / KCEX).',
        code: 'SUBSCRIPTION_REQUIRED',
      }, 402);
    }
    const liveEx = await c.env.DB.prepare(
      `SELECT id FROM exchange_connections WHERE user_id = ? AND provider IN ('toobit', 'bitunix', 'kcex') LIMIT 1`
    ).bind(user.id).first();
    if (!liveEx) {
      return c.json({
        error: 'ابتدا در صفحه «صرافی»، حساب Toobit، Bitunix یا KCEX خود را متصل کنید تا بتوانید معامله واقعی را روشن کنید.',
        code: 'NO_LIVE_EXCHANGE',
      }, 400);
    }
  }
  for (const [k, col] of Object.entries(allowedFields)) {
    if (body[k] !== undefined) {
      let val = typeof body[k] === 'object' && body[k] !== null ? JSON.stringify(body[k]) : body[k];
      if (k === 'hedge_mode') val = body[k] ? 1 : 0;
      if (k === 'market_type') val = String(body[k]).toUpperCase() === 'SPOT' ? 'SPOT' : 'FUTURES';
      if (k === 'direction_mode') {
        const d = String(body[k]).toUpperCase();
        val = d === 'LONG_ONLY' || d === 'SHORT_ONLY' ? d : 'BOTH';
      }
      sets.push(`${col} = ?`);
      vals.push(val);
    }
  }
  if (body.market_type === 'SPOT') {
    sets.push(`max_leverage = 1`, `hedge_mode = 0`);
    if (body.direction_mode === 'SHORT_ONLY') {
      return c.json({ error: 'اسپات از معاملات Short مارجین پشتیبانی نمی‌کند. جهت اسپات باید LONG_ONLY یا BOTH باشد.' }, 400);
    }
  }

  if (!sets.length) return c.json({ error: 'No fields to update' }, 400);
  sets.push(`updated_at = datetime('now')`);
  vals.push(user.id);

  let engineSwitchResult: Awaited<ReturnType<typeof activateExclusiveTradingEngine>> | null = null;
  if (typeof body.strategy_key === 'string' && body.strategy_key.trim()) {
    const sk = body.strategy_key.trim();
    const targetChoice: TradingEngineChoice =
      sk === 'ai_autonomous_agent'
        ? 'CENTRAL_AI'
        : sk === 'my_custom_ai'
          ? 'MY_AI'
          : sk === 'copy_trade'
            ? 'COPY_TRADE'
            : 'STRATEGY';
    engineSwitchResult = await activateExclusiveTradingEngine(c.env.DB, user.id, targetChoice, {
      strategyKey: sk,
      auditSource: 'config_update',
    });
  }

  await c.env.DB.prepare(`UPDATE bot_configs SET ${sets.join(', ')} WHERE user_id = ?`).bind(...vals).run();
  const [updated, activeEngine] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(user.id).first(),
    getActiveEngineState(c.env.DB, user.id),
  ]);
  return c.json({ ok: true, config: updated, activeEngine, switchedFrom: engineSwitchResult });
});

tradingRoutes.post('/bot/start', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    marginPct?: number;
    strategyKey?: StrategyKey;
    symbol?: string;
    marketType?: MarketType;
    directionMode?: DirectionMode;
    hedgeMode?: boolean;
    autoScanTop?: boolean;
    scanScope?: 'SINGLE' | 'TOP_COINS' | 'ALL_MARKET';
    maxOpenPositions?: number;
    allowAutoFlip?: boolean;
    riskPreset?: string;
    maxLeverage?: number;
    dailyMaxLossPct?: number;
    trailingStopEnabled?: boolean;
    trailingStopPct?: number;
    allocatedAmount?: number;
    customStrategyId?: string;
  }>().catch(() => ({} as Record<string, unknown>));

  const [cfg, ensemble, entitlement] = await Promise.all([
    c.env.DB.prepare('SELECT trading_mode, market_type, strategy_key, risk_profile_json FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trading_mode: string; market_type?: MarketType; strategy_key: string; risk_profile_json?: string }>(),
    resolveAIEnsemble(c.env, user.id),
    resolveUserEntitlement(c.env.DB, user),
  ]);

  const targetStrategy = typeof body.strategyKey === 'string' ? body.strategyKey : (cfg?.strategy_key || 'dollarino_v01');
  if (!entitlement.hasPaidPlan && entitlement.subscriptionRequired) {
    return c.json({
      error: 'برای روشن کردن ربات و معامله در دلارینو، ابتدا یکی از پلن‌های اشتراک را فعال کنید.',
      code: 'SUBSCRIPTION_REQUIRED',
    }, 402);
  }
  if (cfg?.trading_mode === 'LIVE' && !entitlement.allowLiveTrading) {
    return c.json({
      error: 'Active paid subscription required for Live Trading (Toobit / KCEX).',
      code: 'SUBSCRIPTION_REQUIRED',
    }, 402);
  }
  if (targetStrategy === 'ai_autonomous_agent' && !entitlement.allowAiTrading) {
    return c.json({
      error: 'برای ترید با «هوش مصنوعی دلارینو»، اشتراک فعال لازم است.',
      code: 'SUBSCRIPTION_REQUIRED',
    }, 402);
  }
  if (targetStrategy === 'ai_autonomous_agent' && ensemble.engines.length === 0) {
    return c.json({
      error: ensemble.capExceeded
        ? 'سقف درخواست روزانه موتور «هوش مصنوعی دلارینو» پر شده است. لطفاً در پنل مدیریت سقف روزانه موتور را افزایش دهید.'
        : 'موتور «هوش مصنوعی دلارینو» هنوز توسط مدیریت فعال نشده است. تا فعال‌سازی می‌توانید از «هوش مصنوعی من» یا استراتژی‌های کوانت استفاده کنید.',
      code: ensemble.capExceeded ? 'AI_DAILY_CAP_REACHED' : 'NO_ACTIVE_AI_KEY',
    }, 400);
  }

  const { provider: activeExProvider } = await resolveUserExchangeAdapter(
    c.env,
    user.id,
    cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
  );
  const nextState = cfg?.trading_mode === 'LIVE' && activeExProvider !== 'paper' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';

  const sets = [
    `bot_state = ?`,
    `trade_execution_mode = 'AUTO'`,
    `started_at = datetime('now')`,
    `updated_at = datetime('now')`,
  ];
  const vals: unknown[] = [nextState];

  if (typeof body.marginPct === 'number') {
    sets.push(`margin_pct = ?`);
    vals.push(body.marginPct);
  }
  if (typeof body.strategyKey === 'string') {
    sets.push(`strategy_key = ?`);
    vals.push(body.strategyKey);
  }
  if (typeof body.customStrategyId === 'string') {
    sets.push(`active_custom_strategy_id = ?`);
    vals.push(body.customStrategyId || null);
  }
  if (typeof body.symbol === 'string' && body.symbol.trim()) {
    sets.push(`symbol = ?`);
    vals.push(normalizeCanonicalSymbol(body.symbol));
  }
  const resolvedMarketType: MarketType = body.marketType === 'SPOT' ? 'SPOT' : body.marketType === 'FUTURES' ? 'FUTURES' : (cfg?.market_type ?? 'FUTURES');
  if (body.marketType === 'SPOT' || body.marketType === 'FUTURES') {
    sets.push(`market_type = ?`);
    vals.push(resolvedMarketType);
  }
  if (body.directionMode === 'BOTH' || body.directionMode === 'LONG_ONLY' || body.directionMode === 'SHORT_ONLY') {
    if (resolvedMarketType === 'SPOT' && body.directionMode === 'SHORT_ONLY') {
      return c.json({ error: 'اسپات تنها از خرید (Long) پشتیبانی می‌کند.' }, 400);
    }
    sets.push(`direction_mode = ?`);
    vals.push(body.directionMode);
  }
  if (typeof body.hedgeMode === 'boolean') {
    sets.push(`hedge_mode = ?`);
    vals.push(resolvedMarketType === 'SPOT' ? 0 : body.hedgeMode ? 1 : 0);
  }
  if (resolvedMarketType === 'SPOT') {
    sets.push(`max_leverage = 1`, `hedge_mode = 0`);
  }
  if (typeof body.autoScanTop === 'boolean') {
    sets.push(`auto_scan_top = ?`);
    vals.push(body.autoScanTop ? 1 : 0);
  }
  if (body.scanScope === 'SINGLE' || body.scanScope === 'TOP_COINS' || body.scanScope === 'ALL_MARKET') {
    sets.push(`scan_scope = ?`, `auto_scan_top = ?`);
    vals.push(body.scanScope, body.scanScope === 'SINGLE' ? 0 : 1);
  }
  if (typeof body.maxOpenPositions === 'number') {
    sets.push(`max_open_positions = ?`);
    vals.push(Math.max(1, Math.min(20, Math.round(body.maxOpenPositions))));
  }
  if (typeof body.allowAutoFlip === 'boolean') {
    sets.push(`allow_auto_flip = ?`);
    vals.push(body.allowAutoFlip ? 1 : 0);
  }
  if (typeof body.maxLeverage === 'number' && resolvedMarketType !== 'SPOT') {
    sets.push(`max_leverage = ?`);
    vals.push(Math.max(1, Math.min(50, Math.round(body.maxLeverage))));
  }
  if (typeof body.dailyMaxLossPct === 'number') {
    sets.push(`daily_max_loss_pct = ?`);
    vals.push(body.dailyMaxLossPct);
  }
  if (typeof body.trailingStopEnabled === 'boolean') {
    sets.push(`trailing_stop_enabled = ?`);
    vals.push(body.trailingStopEnabled ? 1 : 0);
  }
  if (typeof body.trailingStopPct === 'number') {
    sets.push(`trailing_stop_pct = ?`);
    vals.push(body.trailingStopPct);
  }
  if (body.riskPreset || body.allocatedAmount) {
    let rp: Record<string, unknown> = {};
    try { rp = cfg?.risk_profile_json ? JSON.parse(cfg.risk_profile_json) : {}; } catch { rp = {}; }
    if (body.riskPreset) rp.preset = body.riskPreset;
    if (body.allocatedAmount) rp.allocatedAmount = body.allocatedAmount;
    sets.push(`risk_profile_json = ?`);
    vals.push(JSON.stringify(rp));
  }

  vals.push(user.id);
  const startChoice: TradingEngineChoice =
    targetStrategy === 'ai_autonomous_agent'
      ? 'CENTRAL_AI'
      : targetStrategy === 'my_custom_ai'
        ? 'MY_AI'
        : targetStrategy === 'copy_trade'
          ? 'COPY_TRADE'
          : 'STRATEGY';
  const exclRes = await activateExclusiveTradingEngine(c.env.DB, user.id, startChoice, {
    strategyKey: targetStrategy,
    customStrategyId: typeof body.customStrategyId === 'string' ? (body.customStrategyId || null) : undefined,
    auditSource: 'bot_start',
  });
  await c.env.DB.prepare(`UPDATE bot_configs SET ${sets.join(', ')} WHERE user_id = ?`).bind(...vals).run();

  await logAudit(
    c.env.DB,
    user.id,
    'SYSTEM',
    'INFO',
    (targetStrategy === 'ai_autonomous_agent'
      ? 'ربات با «هوش مصنوعی دلارینو» روشن شد و اسکن کل بازار آغاز گردید'
      : 'ربات با «استراتژی منتخب دلارینو (موتور دُرنا V1)» روشن شد و اسکن کل بازار آغاز گردید') +
      (exclRes.cancelledCopyCount > 0 ? ` (${exclRes.cancelledCopyCount} کپی‌ترید غیرفعال شد)` : '')
  );

  const id = c.env.TRADING_BOT_DO.idFromName('global-coordinator');
  const stub = c.env.TRADING_BOT_DO.get(id);
  const runTick = Promise.all([
    stub.fetch('https://do/start').catch(() => {}),
    stub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {}),
  ]);
  try {
    c.executionCtx.waitUntil(runTick);
  } catch {
    void runTick;
  }
  await Promise.race([runTick, new Promise((resolve) => setTimeout(resolve, 4500))]);

  return c.json({
    ok: true,
    bot_state: nextState,
    strategy_key: targetStrategy,
    activeExchangeProvider: activeExProvider,
    warning:
      cfg?.trading_mode === 'LIVE' && activeExProvider === 'paper'
        ? 'صرافی واقعی فعال نیست (یا Toobit نیاز به پروکسی دارد)؛ ربات در حالت شبیه‌ساز Paper فعال شد.'
        : undefined,
  });
});

tradingRoutes.post('/bot/stop', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ settleOpen?: boolean }>().catch(() => ({ settleOpen: false }));
  const cfg = await c.env.DB.prepare('SELECT started_at, paper_balance, trading_mode FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ started_at: string | null; paper_balance: string; trading_mode: string }>();

  let closedOnStop = 0;
  let stopPnl = 0;
  if (body.settleOpen) {
    const openTrades = await c.env.DB.prepare(
      `SELECT id, mode, market_type, symbol, direction, entry_price, initial_quantity, remaining_quantity, margin_used, realized_pnl, leverage, signal_id, strategy_key, current_stop_loss, tp1, tp1_hit, tp2_hit, tp3_hit, risk_free_active, opened_at FROM trades WHERE user_id = ? AND status = 'OPEN'`
    ).bind(user.id).all<{
      id: string;
      mode: string;
      market_type?: MarketType;
      symbol: string;
      direction: Direction;
      entry_price: string;
      initial_quantity: string;
      remaining_quantity: string;
      margin_used: string;
      realized_pnl: string;
      leverage?: number;
      signal_id?: string | null;
      strategy_key?: string | null;
      current_stop_loss?: string;
      tp1?: string;
      tp1_hit?: number;
      tp2_hit?: number;
      tp3_hit?: number;
      risk_free_active?: number;
      opened_at?: string;
    }>();

    for (const t of openTrades.results) {
      const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
      const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `stop_settle_${Date.now()}`, t.market_type ?? 'FUTURES');
      const exitPx = Number(cls.filledPrice);
      const entryPx = Number(t.entry_price);
      const qty = Number(t.remaining_quantity);
      const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
      const totalRealized = Number(t.realized_pnl) + pnl - Number(cls.fee);
      stopPnl += pnl - Number(cls.fee);

      if (t.mode === 'PAPER') {
        const curCfg = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
          .bind(user.id).first<{ paper_balance: string }>();
        const remMargin = Number(t.margin_used) * (qty / Math.max(1e-9, Number(t.initial_quantity)));
        const restored = Number(curCfg?.paper_balance ?? 0) + remMargin + pnl - Number(cls.fee);
        await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
          .bind(restored.toFixed(2), user.id).run();
      }
      await c.env.DB.prepare(
        `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'BOT_STOP_SETTLE', closed_at = datetime('now') WHERE id = ?`
      ).bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();
      if (t.signal_id) {
        const roePct = (totalRealized / Math.max(0.01, Number(t.margin_used || 1))) * 100;
        await publishSignalClosedCard(c.env, {
          tradeId: t.id,
          userId: user.id,
          signalId: t.signal_id,
          symbol: t.symbol,
          direction: t.direction,
          leverage: Number(t.leverage || 10),
          mode: t.mode === 'LIVE' ? 'LIVE' : 'PAPER',
          strategyKey: t.strategy_key,
          entryPrice: t.entry_price,
          exitPrice: cls.filledPrice,
          stopLoss: t.current_stop_loss || '0',
          tp1: t.tp1 || '0',
          tp1Hit: Boolean(t.tp1_hit),
          tp2Hit: Boolean(t.tp2_hit),
          tp3Hit: Boolean(t.tp3_hit),
          trailingActive: Boolean(t.risk_free_active),
          pnlUsd: totalRealized,
          pnlPct: roePct,
          reason: 'BOT_STOP_SETTLE',
          openedAt: t.opened_at,
        }).catch(() => {});
      }
      closedOnStop++;
    }
  }

  const sessionStats = cfg?.started_at
    ? await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as pnl FROM trades WHERE user_id = ? AND status = 'CLOSED' AND closed_at >= ?`
      ).bind(user.id, cfg.started_at).first<{ cnt: number; pnl: number }>()
    : { cnt: closedOnStop, pnl: stopPnl };

  const afterCfg = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ paper_balance: string }>();

  await c.env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`)
    .bind(user.id).run();

  const startedIso = cfg?.started_at ? (cfg.started_at.includes('T') ? cfg.started_at : cfg.started_at.replace(' ', 'T')) + 'Z' : '';
  const durationSec = startedIso ? Math.max(0, Math.floor((Date.now() - Date.parse(startedIso)) / 1000)) : 0;

  if (closedOnStop > 0 || (sessionStats?.pnl ?? 0) !== 0) {
    await c.env.DB.prepare(
      `INSERT INTO wallet_ledger (id, user_id, mode, event_type, amount_usd, balance_after, note)
       VALUES (?, ?, ?, 'STOP_SETTLE', ?, ?, ?)`
    ).bind(
      randomId('wl'),
      user.id,
      cfg?.trading_mode ?? 'PAPER',
      sessionStats?.pnl ?? stopPnl,
      Number(afterCfg?.paper_balance ?? 0),
      `Session stop settlement (${closedOnStop} settled)`
    ).run().catch(() => {});
  }

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', 'Bot stopped by user');
  return c.json({
    ok: true,
    bot_state: 'STOPPED',
    settlement: {
      durationSec,
      tradesClosed: sessionStats?.cnt ?? closedOnStop,
      positionsSettledOnStop: closedOnStop,
      netSessionPnl: Number((sessionStats?.pnl ?? stopPnl).toFixed(2)),
      finalBalance: Number(afterCfg?.paper_balance ?? 0),
    },
  });
});

tradingRoutes.post('/bot/kill-switch', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED' WHERE user_id = ?`).bind(user.id).run();
  await c.env.DB.prepare(`UPDATE pending_orders SET status = 'CANCELLED' WHERE user_id = ? AND status = 'PENDING'`)
    .bind(user.id).run();

  const openTrades = await c.env.DB.prepare(
    `SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN'`
  ).bind(user.id).all<{
    id: string;
    mode: string;
    symbol: string;
    direction: Direction;
    entry_price: string;
    remaining_quantity: string;
    margin_used: string;
    realized_pnl: string;
    leverage?: number;
    signal_id?: string | null;
    strategy_key?: string | null;
    current_stop_loss?: string;
    tp1?: string;
    tp1_hit?: number;
    tp2_hit?: number;
    tp3_hit?: number;
    risk_free_active?: number;
    opened_at?: string;
  }>();

  let closedCount = 0;
  for (const t of openTrades.results) {
    const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
    const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `kill_${Date.now()}`);
    const exitPx = Number(cls.filledPrice);
    const entryPx = Number(t.entry_price);
    const qty = Number(t.remaining_quantity);
    const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
    const totalRealized = Number(t.realized_pnl) + pnl - Number(cls.fee);

    if (t.mode === 'PAPER') {
      const cfg = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ paper_balance: string }>();
      const restored = Number(cfg?.paper_balance ?? 0) + Number(t.margin_used) + pnl - Number(cls.fee);
      await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
        .bind(restored.toFixed(2), user.id).run();
    }

    await c.env.DB.prepare(
      `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'KILL_SWITCH', closed_at = datetime('now') WHERE id = ?`
    ).bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();
    if (t.signal_id) {
      const roePct = (totalRealized / Math.max(0.01, Number(t.margin_used || 1))) * 100;
      await publishSignalClosedCard(c.env, {
        tradeId: t.id,
        userId: user.id,
        signalId: t.signal_id,
        symbol: t.symbol,
        direction: t.direction,
        leverage: Number(t.leverage || 10),
        mode: t.mode === 'LIVE' ? 'LIVE' : 'PAPER',
        strategyKey: t.strategy_key,
        entryPrice: t.entry_price,
        exitPrice: cls.filledPrice,
        stopLoss: t.current_stop_loss || '0',
        tp1: t.tp1 || '0',
        tp1Hit: Boolean(t.tp1_hit),
        tp2Hit: Boolean(t.tp2_hit),
        tp3Hit: Boolean(t.tp3_hit),
        trailingActive: Boolean(t.risk_free_active),
        pnlUsd: totalRealized,
        pnlPct: roePct,
        reason: 'KILL_SWITCH',
        openedAt: t.opened_at,
      }).catch(() => {});
    }
    closedCount++;
  }

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'WARN', `EMERGENCY KILL SWITCH activated — closed ${closedCount} positions`);
  return c.json({ ok: true, closedCount });
});

tradingRoutes.post('/positions/reconcile', async (c) => {
  const user = c.get('user');
  const updates = await reconcileOpenPositionsForUser(c.env, user.id);
  return c.json({ ok: true, updates });
});

tradingRoutes.patch('/positions/:id/tpsl', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ stopLoss?: string; tp1?: string; tp2?: string; tp3?: string }>();
  const row = await c.env.DB.prepare(`SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = 'OPEN'`)
    .bind(id, user.id).first<{ id: string; mode: string; market_type?: MarketType; symbol: string; direction: Direction; current_stop_loss: string; tp1: string }>();
  if (!row) return c.json({ error: 'Open trade not found' }, 404);

  const nextSl = body.stopLoss || row.current_stop_loss;
  const nextTp1 = body.tp1 || row.tp1;

  if (row.mode === 'LIVE' && (row.market_type ?? 'FUTURES') === 'FUTURES') {
    const { adapter } = await resolveUserExchangeAdapter(c.env, user.id);
    await adapter.updatePositionStopLoss(row.symbol, row.direction, nextSl, nextTp1).catch(() => {});
  }

  await c.env.DB.prepare(
    `UPDATE trades SET current_stop_loss = ?, tp1 = ?, tp2 = COALESCE(?, tp2), tp3 = COALESCE(?, tp3) WHERE id = ?`
  ).bind(nextSl, nextTp1, body.tp2 ?? null, body.tp3 ?? null, id).run();

  await logAudit(c.env.DB, user.id, 'ORDER', 'INFO', `Updated SL/TP for ${row.symbol} (SL=${nextSl}, TP1=${nextTp1})`, row.symbol);
  return c.json({ ok: true });
});

tradingRoutes.post('/positions/:id/close', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const t = await c.env.DB.prepare(`SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = 'OPEN'`)
    .bind(id, user.id).first<{
      id: string;
      signal_id?: string | null;
      strategy_key?: string | null;
      mode: string;
      market_type?: MarketType;
      symbol: string;
      direction: Direction;
      leverage: number;
      entry_price: string;
      initial_quantity: string;
      remaining_quantity: string;
      margin_used: string;
      current_stop_loss: string;
      initial_stop_loss?: string;
      tp1: string;
      tp1_hit?: number;
      tp2_hit?: number;
      tp3_hit?: number;
      trailing_active?: number;
      risk_free_active?: number;
      opened_at?: string;
      realized_pnl: string;
    }>();
  if (!t) return c.json({ error: 'Open position not found' }, 404);

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
  const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `man_cls_${Date.now()}`, t.market_type ?? 'FUTURES');
  const exitPx = Number(cls.filledPrice);
  const entryPx = Number(t.entry_price);
  const qty = Number(t.remaining_quantity);
  const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
  const totalRealized = Number(t.realized_pnl) + pnl - Number(cls.fee);

  if (t.mode === 'PAPER') {
    const cfg = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ paper_balance: string }>();
    const remMarginShare = Number(t.margin_used) * (qty / Math.max(1e-9, Number(t.initial_quantity)));
    const nextBal = Number(cfg?.paper_balance ?? 0) + remMarginShare + pnl - Number(cls.fee);
    await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
      .bind(nextBal.toFixed(2), user.id).run();
  }

  await c.env.DB.prepare(
    `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'MANUAL', closed_at = datetime('now') WHERE id = ?`
  ).bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();

  const pnlPct = Number(t.margin_used) > 0 ? (totalRealized / Number(t.margin_used)) * 100 : 0;
  await publishSignalClosedCard(c.env, {
    tradeId: t.id,
    userId: user.id,
    signalId: t.signal_id,
    symbol: t.symbol,
    direction: t.direction,
    leverage: t.leverage ?? 1,
    mode: t.mode === 'LIVE' ? 'LIVE' : 'PAPER',
    strategyKey: t.strategy_key,
    entryPrice: t.entry_price,
    exitPrice: cls.filledPrice,
    stopLoss: t.initial_stop_loss ?? t.current_stop_loss,
    tp1: t.tp1,
    tp1Hit: Boolean(t.tp1_hit || totalRealized > 0),
    tp2Hit: Boolean(t.tp2_hit),
    tp3Hit: Boolean(t.tp3_hit),
    trailingActive: Boolean(t.trailing_active || t.risk_free_active),
    trailingSl: t.current_stop_loss,
    pnlUsd: totalRealized,
    pnlPct,
    reason: 'MANUAL',
    openedAt: t.opened_at,
    closedAt: new Date().toISOString(),
  }).catch(() => {});

  await logAudit(c.env.DB, user.id, 'ORDER', 'INFO', `Manual close ${t.symbol} @ ${cls.filledPrice} (PnL ${totalRealized.toFixed(2)})`, t.symbol);
  return c.json({ ok: true, exitPrice: cls.filledPrice, realizedPnl: totalRealized });
});

tradingRoutes.post('/orders/manual', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `order:${user.id}`, 30, 60);
  if (!rl.allowed) {
    return c.json({ ok: false, error: `تعداد سفارش‌ها زیاد است. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) {
    return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  }
  const body = await c.req.json<{
    symbol: string;
    direction: Direction;
    orderType: 'MARKET' | 'LIMIT';
    marketType?: MarketType;
    marginMode?: MarginMode;
    marginPct?: number;
    limitPrice?: string;
    leverage: number;
    stopLoss: string;
    tp1: string;
    tp2?: string;
    tp3?: string;
    timeframe?: string;
  }>();

  const cfgRow = await c.env.DB.prepare('SELECT trading_mode, market_type, margin_pct, paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ trading_mode: string; market_type?: MarketType; margin_pct: number; paper_balance: string }>();
  const marketType: MarketType = body.marketType ?? cfgRow?.market_type ?? 'FUTURES';
  const effectiveLeverage = marketType === 'SPOT' ? 1 : Math.max(1, Number(body.leverage || 1));

  if (marketType === 'SPOT' && body.direction === 'SHORT') {
    return c.json({ ok: false, error: 'در بازار اسپات امکان باز کردن پوزیشن Short مارجین وجود ندارد؛ فقط خرید (Buy / Long) یا بستن موجودی مجاز است.' }, 400);
  }

  if (body.orderType === 'LIMIT' && body.limitPrice && Number(body.limitPrice) > 0) {
    const activeRow = await c.env.DB.prepare(
      `SELECT provider FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
    ).bind(user.id).first<{ provider: ExchangeProviderId }>();
    const bal = Number(cfgRow?.paper_balance ?? 10000);
    const pct = body.marginPct && Number.isFinite(body.marginPct) ? body.marginPct : (cfgRow?.margin_pct ?? 10);
    const rawQty = ((bal * (pct / 100)) * effectiveLeverage) / Number(body.limitPrice);
    const qty = rawQty >= 100 ? rawQty.toFixed(1) : rawQty >= 1 ? rawQty.toFixed(3) : rawQty.toFixed(5);
    const exProvider = cfgRow?.trading_mode === 'PAPER' ? 'paper' : (activeRow?.provider || 'paper');
    const id = randomId('ord');
    await c.env.DB.prepare(
      `INSERT INTO pending_orders (id, user_id, mode, exchange_provider, symbol, strategy_key, direction, order_type, price, quantity, leverage, stop_loss, tp1, tp2, tp3)
       VALUES (?, ?, ?, ?, ?, 'manual_limit', ?, 'LIMIT', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user.id,
      cfgRow?.trading_mode ?? 'PAPER',
      exProvider,
      body.symbol.toUpperCase(),
      body.direction,
      body.limitPrice,
      qty,
      effectiveLeverage,
      body.stopLoss,
      body.tp1,
      body.tp2 ?? null,
      body.tp3 ?? null
    ).run();
    await logAudit(c.env.DB, user.id, 'ORDER', 'INFO', `Queued ${marketType} LIMIT ${body.direction} ${body.symbol} @ ${body.limitPrice}`, body.symbol);
    return c.json({ ok: true, pendingOrderId: id });
  }

  const execRes = await executeSignalForUser(
    c.env,
    user.id,
    {
      symbol: body.symbol.toUpperCase(),
      direction: body.direction,
      timeframe: body.timeframe || '15m',
      price: body.limitPrice || '0',
      stopLoss: body.stopLoss,
      leverage: effectiveLeverage,
      tp1: body.tp1,
      tp2: body.tp2,
      tp3: body.tp3,
    },
    {
      forceBypassState: true,
      strategyKey: 'manual_terminal',
      marketType,
      orderType: body.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
      marginPctOverride: body.marginPct,
    }
  );
  return c.json(execRes);
});

tradingRoutes.delete('/pending/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE pending_orders SET status = 'CANCELLED' WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

tradingRoutes.post('/signals/execute', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) {
    return c.json(
      {
        error: 'برای اجرای سیگنال و معامله، ابتدا اشتراک دلارینو را خریداری و فعال کنید.',
        code: 'SUBSCRIPTION_REQUIRED',
      },
      402
    );
  }
  const body = await c.req.json<{ rawText?: string; signal?: Record<string, unknown>; executeNow?: boolean; source?: 'copytrade' | 'scanner' }>();
  const parsed = parseDollarinoSignal(body.signal ?? body.rawText ?? '');
  if (!parsed) return c.json({ error: 'Could not parse valid Dollarino signal' }, 400);

  const formatted = formatDollarinoSignal(parsed);
  const sigId = randomId('sig');
  const sigSource = body.source === 'scanner' ? 'strategy_scanner' : 'manual_test';
  await c.env.DB.prepare(
    `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, sl_pct, tp1_pct, tp2_pct, tp3_pct, raw_text, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
  ).bind(
    sigId,
    user.id,
    sigSource,
    parsed.symbol,
    parsed.direction,
    parsed.timeframe,
    parsed.price,
    parsed.stopLoss,
    parsed.leverage,
    parsed.tp1,
    parsed.tp2 ?? null,
    parsed.tp3 ?? null,
    parsed.slPct ?? null,
    parsed.tp1Pct ?? null,
    parsed.tp2Pct ?? null,
    parsed.tp3Pct ?? null,
    formatted
  ).run();

  if (body.executeNow === false) {
    return c.json({ ok: true, signalId: sigId, parsed, formatted });
  }

  const ent = await resolveUserEntitlement(c.env.DB, user);
  if (!ent.hasPaidPlan && ent.subscriptionRequired) {
    return c.json(
      {
        error: 'برای اجرای سیگنال و معامله، ابتدا اشتراک دلارینو را خریداری و فعال کنید.',
        code: 'SUBSCRIPTION_REQUIRED',
      },
      402
    );
  }

  const execRes = await executeSignalForUser(c.env, user.id, parsed, {
    signalId: sigId,
    forceBypassState: true,
    strategyKey: body.source === 'scanner' ? 'scanner_signal' : 'manual_signal',
  });

  if (execRes.ok) {
    await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
  }
  return c.json({ ok: execRes.ok, signalId: sigId, tradeId: execRes.tradeId, error: execRes.error, formatted });
});

tradingRoutes.get('/market/klines', async (c) => {
  const user = c.get('user');
  const symbol = (c.req.query('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = (c.req.query('timeframe') || '15m') as Timeframe;
  const limit = Math.min(1200, Math.max(30, Number(c.req.query('limit') || 200)));
  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');
  const [candles, ticker, orderBook] = await Promise.all([
    adapter.getKlines(symbol, timeframe, limit),
    adapter.getTickerPrice(symbol),
    adapter.getOrderBook(symbol, 15),
  ]);
  return c.json({ symbol, timeframe, ticker, candles, orderBook });
});

tradingRoutes.get('/market/overview', async (c) => {
  const user = c.get('user');
  const symbol = (c.req.query('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = (c.req.query('timeframe') || '15m') as Timeframe;
  const htfMap: Record<string, Timeframe> = { '1m': '15m', '3m': '15m', '5m': '15m', '15m': '1h', '30m': '4h', '1h': '4h', '2h': '4h', '4h': '1d', '1d': '1d' };
  const htfTf = htfMap[timeframe] ?? '4h';
  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');

  const [candles, candles4h, market24h, orderBook, cfg] = await Promise.all([
    adapter.getKlines(symbol, timeframe, 450),
    adapter.getKlines(symbol, htfTf, 200),
    adapter.getMarket24h(symbol),
    adapter.getOrderBook(symbol, 15),
    c.env.DB.prepare('SELECT mixer_weights_json, mixer_threshold, kbos_params_json, strategy_key, active_custom_strategy_id FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ mixer_weights_json?: string; mixer_threshold?: number; kbos_params_json?: string; strategy_key?: string; active_custom_strategy_id?: string | null }>(),
  ]);

  let customOverlays: {
    id: string;
    title: string;
    language: CustomStrategyLanguage;
    plots: Array<{ title: string; color: string; overlay: boolean; points: Array<{ time: number; value: number }> }>;
    markers: Array<{ time: number; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }>;
    latestSignal: unknown;
  } | null = null;

  const requestedCustomId = c.req.query('customStrategyId') || cfg?.active_custom_strategy_id;
  if (requestedCustomId) {
    const customRow = await c.env.DB.prepare(
      `SELECT id, name, language, code FROM user_strategies WHERE id = ? AND user_id = ? LIMIT 1`
    ).bind(requestedCustomId, user.id).first<{ id: string; name: string; language: CustomStrategyLanguage; code: string }>();
    if (customRow?.code) {
      const ev = evaluateCustomStrategy(customRow.language, customRow.code, candles, timeframe);
      if (ev.valid) {
        customOverlays = {
          id: customRow.id,
          title: customRow.name || ev.title,
          language: customRow.language,
          plots: ev.plots,
          markers: ev.markers,
          latestSignal: ev.latestSignal,
        };
      }
    }
  }

  let parsedKbos = DEFAULT_KBOS_PARAMS;
  try {
    if (cfg?.kbos_params_json) parsedKbos = mergeKbosParams(JSON.parse(cfg.kbos_params_json));
  } catch { /* default */ }
  const kbosDetailed = computeKbosV11Detailed(candles, timeframe, parsedKbos);

  const closes = candles.map((x) => x.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r14 = rsi(closes, 14);
  const a14 = atr(candles, 14);
  const lastIdx = candles.length - 1;

  const htfCloses = candles4h.map((x) => x.close);
  const htfE20 = ema(htfCloses, 20);
  const htfE50 = ema(htfCloses, 50);
  const htfTrend =
    (htfE20[candles4h.length - 1] ?? 0) > (htfE50[candles4h.length - 1] ?? 0)
      ? 'BULLISH'
      : (htfE20[candles4h.length - 1] ?? 0) < (htfE50[candles4h.length - 1] ?? 0)
        ? 'BEARISH'
        : 'NEUTRAL';

  const weights: SignalMixerWeights = cfg?.mixer_weights_json
    ? (JSON.parse(cfg.mixer_weights_json) as SignalMixerWeights)
    : DEFAULT_MIXER_WEIGHTS;
  const mixer = evaluateSignalMixerAtBar(candles, lastIdx, htfTrend, weights, cfg?.mixer_threshold ?? 65);

  const bidVol = orderBook.bids.reduce((s, [, q]) => s + Number(q), 0);
  const askVol = orderBook.asks.reduce((s, [, q]) => s + Number(q), 0);
  const imbalancePct = bidVol + askVol > 0 ? (((bidVol - askVol) / (bidVol + askVol)) * 100).toFixed(1) : '0.0';
  const bestBid = Number(orderBook.bids[0]?.[0] ?? market24h.bestBid);
  const bestAsk = Number(orderBook.asks[0]?.[0] ?? market24h.bestAsk);
  const spreadPct = bestBid > 0 ? (((bestAsk - bestBid) / bestBid) * 100).toFixed(4) : '0.0000';

  return c.json({
    symbol,
    timeframe,
    candles,
    market24h,
    orderBook,
    spreadPct,
    imbalancePct,
    htfTrend,
    indicators: {
      ema20: e20.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: Number.isFinite(v) ? v : null })).filter((x) => x.value !== null),
      ema50: e50.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: Number.isFinite(v) ? v : null })).filter((x) => x.value !== null),
      ema200: e200.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: Number.isFinite(v) ? v : null })).filter((x) => x.value !== null),
      rsi14: Number((r14[lastIdx] ?? 50).toFixed(2)),
      atr14: Number((a14[lastIdx] ?? 0).toFixed(4)),
    },
    kbosOverlays: {
      closeSeriesAlt: kbosDetailed.closeSeriesAlt,
      openSeriesAlt: kbosDetailed.openSeriesAlt,
      demaAtr: kbosDetailed.demaAtr,
      almaRibbon: kbosDetailed.almaRibbon,
      markers: kbosDetailed.markers,
      latestSignal: kbosDetailed.outputs[kbosDetailed.outputs.length - 1] ?? null,
    },
    customOverlays,
    mixer,
  });
});

tradingRoutes.get('/markets', async (c) => {
  const user = c.get('user');
  const requestedProvider = c.req.query('provider') as ExchangeProviderId | undefined;
  const requestedMarketType = (c.req.query('marketType') || 'FUTURES').toUpperCase() === 'SPOT' ? 'SPOT' : 'FUTURES';
  const q = (c.req.query('q') || '').trim().toUpperCase();
  const sort = c.req.query('sort') || 'volume';
  const offset = Math.max(0, Number(c.req.query('offset') || 0) || 0);
  const limitParam = c.req.query('limit');
  const limit = limitParam && Number(limitParam) > 0 ? Math.min(2000, Number(limitParam)) : 0;

  const activeRow = await c.env.DB.prepare(
    `SELECT provider, label, encrypted_credentials FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first<{ provider: ExchangeProviderId; label: string; encrypted_credentials?: string }>();

  const provider: ExchangeProviderId = requestedProvider || activeRow?.provider || 'paper';
  let proxyConfig = c.env.TOOBIT_PROXY_URL
    ? { proxyUrl: c.env.TOOBIT_PROXY_URL, proxySecret: c.env.EXCHANGE_PROXY_SECRET }
    : undefined;
  if (!proxyConfig && provider === 'toobit') {
    const tbRow = activeRow?.provider === 'toobit'
      ? activeRow
      : await c.env.DB.prepare(
          `SELECT encrypted_credentials FROM exchange_connections WHERE user_id = ? AND provider = 'toobit' ORDER BY updated_at DESC LIMIT 1`
        ).bind(user.id).first<{ encrypted_credentials?: string }>();
    if (tbRow?.encrypted_credentials) {
      const creds = await decryptVaultJson<{ proxyUrl?: string; proxySecret?: string }>(
        tbRow.encrypted_credentials,
        c.env.MASTER_ENCRYPTION_KEY
      ).catch(() => ({ proxyUrl: undefined, proxySecret: undefined }));
      if (creds.proxyUrl) {
        proxyConfig = { proxyUrl: creds.proxyUrl, proxySecret: creds.proxySecret || c.env.EXCHANGE_PROXY_SECRET };
      }
    }
  }
  let markets = await getExchangeMarkets(provider, proxyConfig, requestedMarketType);

  if (q) {
    markets = markets.filter(
      (m) =>
        m.symbol.includes(q) ||
        m.base.includes(q) ||
        m.exchangeSymbol.toUpperCase().includes(q)
    );
  }

  if (sort === 'gainers') {
    markets = [...markets].sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));
  } else if (sort === 'losers') {
    markets = [...markets].sort((a, b) => Number(a.changePct24h) - Number(b.changePct24h));
  }

  const totalCount = markets.length;
  const sliced = limit > 0 ? markets.slice(offset, offset + limit) : markets;

  return c.json({
    provider,
    marketType: requestedMarketType,
    label: activeRow?.label || provider.toUpperCase(),
    totalCount,
    markets: sliced,
  });
});

tradingRoutes.post('/scanner', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) return c.json({ error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  const body = await c.req.json<{
    strategyKey?: StrategyKey;
    timeframe?: Timeframe;
    symbols?: string[];
    limit?: number;
  }>().catch(() => ({} as { strategyKey?: StrategyKey; timeframe?: Timeframe; symbols?: string[]; limit?: number }));
  const strategyKey = body.strategyKey === 'ai_autonomous_agent' ? 'signal_mixer' : (body.strategyKey || 'signal_mixer');
  const tf = body.timeframe || '15m';
  const htfMap: Record<string, Timeframe> = { '1m': '15m', '3m': '15m', '5m': '15m', '15m': '1h', '30m': '4h', '1h': '4h', '2h': '4h', '4h': '1d', '1d': '1d' };
  const htfTf = htfMap[tf] ?? '1h';

  const [activeRow, cfgRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT provider FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
    ).bind(user.id).first<{ provider: ExchangeProviderId }>(),
    c.env.DB.prepare('SELECT kbos_params_json, mixer_weights_json, mixer_threshold, max_leverage FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ kbos_params_json?: string; mixer_weights_json?: string; mixer_threshold?: number; max_leverage?: number }>(),
  ]);
  const provider = activeRow?.provider || 'paper';

  let kbosParams = DEFAULT_KBOS_PARAMS;
  try {
    if (cfgRow?.kbos_params_json) kbosParams = mergeKbosParams(JSON.parse(cfgRow.kbos_params_json));
  } catch { /* default */ }

  let mixerWeights: SignalMixerWeights = DEFAULT_MIXER_WEIGHTS;
  try {
    if (cfgRow?.mixer_weights_json) mixerWeights = JSON.parse(cfgRow.mixer_weights_json) as SignalMixerWeights;
  } catch { /* default */ }
  const mixerThreshold = cfgRow?.mixer_threshold ?? 65;

  let symbols = body.symbols?.length ? body.symbols.map(normalizeCanonicalSymbol) : [];
  if (!symbols.length) {
    const proxyConfig = c.env.TOOBIT_PROXY_URL
      ? { proxyUrl: c.env.TOOBIT_PROXY_URL, proxySecret: c.env.EXCHANGE_PROXY_SECRET }
      : undefined;
    const allMarkets = await getExchangeMarkets(provider, proxyConfig);
    const count = Math.min(20, Math.max(6, body.limit ?? 14));
    const orderedPool = Array.from(new Set([...MAJOR_LIQUID_COINS, ...allMarkets.map((m) => m.symbol)]));
    symbols = orderedPool.slice(0, count);
  }

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');
  const now = Date.now();

  const results = await Promise.all(
    symbols.map(async (sym) => {
      const [candlesRaw, htfRaw] = await Promise.all([
        adapter.getKlines(sym, tf, 360),
        adapter.getKlines(sym, htfTf, 140),
      ]);
      const candles = selectClosedCandles(candlesRaw, tf, now);
      const htfCandles = selectClosedCandles(htfRaw, htfTf, now);
      const evalLtf = candles.length >= 40 ? candles : candlesRaw;
      const evalHtf = htfCandles.length >= 25 ? htfCandles : htfRaw;

      const outputs = computeStrategySignals(
        strategyKey,
        evalLtf,
        evalHtf,
        tf,
        htfTf,
        { kbosParams, mixerWeights, mixerThreshold }
      );
      const currentClose = evalLtf[evalLtf.length - 1]?.close ?? 0;
      let chosen = outputs[outputs.length - 1];
      let barsAgo = 0;

      if ((!chosen || chosen.signal === 'NONE') && outputs.length >= 6) {
        for (let lb = 2; lb <= 6; lb++) {
          const cand = outputs[outputs.length - lb];
          if (cand && cand.signal !== 'NONE' && cand.price > 0 && currentClose > 0 && cand.stopLoss && cand.tp1) {
            const driftPct = Math.abs(currentClose - cand.price) / cand.price;
            const slValid = cand.signal === 'LONG' ? currentClose > cand.stopLoss : currentClose < cand.stopLoss;
            const tp1NotHit = cand.signal === 'LONG' ? currentClose < cand.tp1 : currentClose > cand.tp1;
            if (driftPct <= 0.015 && slValid && tp1NotHit) {
              chosen = cand;
              barsAgo = lb - 1;
              break;
            }
          }
        }
      }

      let realHtfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = chosen?.trend ?? 'NEUTRAL';
      if (evalHtf.length >= 25) {
        const hc = evalHtf.map((k) => k.close);
        const h20 = ema(hc, 20);
        const h50 = ema(hc, 50);
        const f = h20[evalHtf.length - 1];
        const s = h50[evalHtf.length - 1];
        if (Number.isFinite(f) && Number.isFinite(s)) {
          realHtfTrend = f! > s! ? 'BULLISH' : f! < s! ? 'BEARISH' : 'NEUTRAL';
        }
      }
      const mix = evaluateSignalMixerAtBar(evalLtf, evalLtf.length - 1, realHtfTrend, mixerWeights, mixerThreshold);
      const signalCard = chosen && chosen.signal !== 'NONE'
        ? strategyOutputToDollarinoSignal(sym, tf, Math.max(1, cfgRow?.max_leverage ?? 5), chosen)
        : null;
      return {
        symbol: sym,
        price: currentClose,
        trend: realHtfTrend,
        rsi: Number((chosen?.rsi ?? 50).toFixed(1)),
        mixerConfidence: mix.confidence,
        mixerDirection: mix.direction,
        barsAgo: signalCard ? barsAgo : null,
        signal: signalCard,
        formatted: signalCard ? formatDollarinoSignal(signalCard) : null,
      };
    })
  );

  return c.json({ provider, strategyKey, timeframe: tf, results });
});

tradingRoutes.post('/ai-agent/run', async (c) => {
  const user = c.get('user');
  const entitlement = await resolveUserEntitlement(c.env.DB, user);
  if (!entitlement.allowAiTrading) {
    return c.json({
      ok: false,
      error: 'Active Pro or VIP subscription required for Autonomous AI Trading.',
      code: 'SUBSCRIPTION_REQUIRED',
    }, 402);
  }
  const body = await c.req.json<{
    symbol?: string;
    timeframe?: Timeframe;
    executeIfSignal?: boolean;
  }>().catch(() => ({} as { symbol?: string; timeframe?: Timeframe; executeIfSignal?: boolean }));

  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<UserBotConfigRow>();
  if (!cfg) return c.json({ error: 'Bot config not found' }, 404);

  const symbol = normalizeCanonicalSymbol(body.symbol || cfg.symbol);
  const timeframe = (body.timeframe || cfg.entry_timeframe || '15m') as Timeframe;
  const htfMap: Record<string, Timeframe> = { '1m': '15m', '3m': '15m', '5m': '15m', '15m': '1h', '30m': '4h', '1h': '4h', '2h': '4h', '4h': '1d', '1d': '1d' };
  const higherTimeframe = htfMap[timeframe] ?? '1h';

  const { adapter } = await resolveUserExchangeAdapter(
    c.env,
    user.id,
    cfg.trading_mode === 'PAPER' ? 'paper' : undefined
  );

  const [candles, htfCandles, orderBook, market24h, openOnSymbol] = await Promise.all([
    adapter.getKlines(symbol, timeframe, 300),
    adapter.getKlines(symbol, higherTimeframe, 140),
    adapter.getOrderBook(symbol, 15).catch(() => ({ bids: [], asks: [] })),
    adapter.getMarket24h(symbol).catch(() => null),
    c.env.DB.prepare(
      `SELECT id, direction, entry_price, current_stop_loss, tp1, remaining_quantity, margin_used, realized_pnl, mode FROM trades WHERE user_id = ? AND symbol = ? AND status = 'OPEN' LIMIT 1`
    ).bind(user.id, symbol).first<{
      id: string;
      direction: Direction;
      entry_price: string;
      current_stop_loss: string;
      tp1: string;
      remaining_quantity: string;
      margin_used: string;
      realized_pnl: string;
      mode: string;
    }>(),
  ]);

  const bidVol = orderBook.bids.reduce((s, [, q]) => s + Number(q), 0);
  const askVol = orderBook.asks.reduce((s, [, q]) => s + Number(q), 0);
  const imbalancePct = bidVol + askVol > 0 ? (((bidVol - askVol) / (bidVol + askVol)) * 100).toFixed(1) : '0.0';
  const bestBid = Number(orderBook.bids[0]?.[0] ?? 0);
  const bestAsk = Number(orderBook.asks[0]?.[0] ?? 0);
  const spreadPct = bestBid > 0 ? (((bestAsk - bestBid) / bestBid) * 100).toFixed(4) : '0.01';

  let kbosParams = mergeKbosParams();
  try { if (cfg.kbos_params_json) kbosParams = mergeKbosParams(JSON.parse(cfg.kbos_params_json)); } catch { /* fallback */ }
  let mixerWeights: SignalMixerWeights = DEFAULT_MIXER_WEIGHTS;
  try { if (cfg.mixer_weights_json) mixerWeights = JSON.parse(cfg.mixer_weights_json) as SignalMixerWeights; } catch { /* fallback */ }
  let riskPreset = 'balanced';
  try { if (cfg.risk_profile_json) riskPreset = (JSON.parse(cfg.risk_profile_json) as { preset?: string }).preset || 'balanced'; } catch { /* fallback */ }

  let decision;
  try {
    decision = await runAutonomousAITrader(c.env, user.id, {
      symbol,
      timeframe,
      higherTimeframe,
      candles,
      htfCandles,
      maxLeverage: Math.max(1, cfg.max_leverage),
      minConfidence: cfg.ai_min_confidence ?? 65,
      orderBookImbalancePct: imbalancePct,
      spreadPct,
      fundingRate: market24h?.fundingRate,
      openPosition: openOnSymbol
        ? {
            direction: openOnSymbol.direction,
            entryPrice: openOnSymbol.entry_price,
            currentStopLoss: openOnSymbol.current_stop_loss,
            tp1: openOnSymbol.tp1,
          }
        : null,
      riskPreset,
      kbosParams,
      mixerWeights,
      mixerThreshold: cfg.mixer_threshold ?? 65,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'AI Trader failed';
    await logAudit(c.env.DB, user.id, 'AI_AGENT', 'ERROR', `AI Trader error on ${symbol}: ${errMsg}`, symbol);
    return c.json({ ok: false, error: errMsg }, 400);
  }

  if (!decision.ok) {
    return c.json({ ok: false, error: decision.error || decision.thesis, decision }, 400);
  }

  await logAudit(
    c.env.DB,
    user.id,
    'AI_AGENT',
    'INFO',
    `[${(decision.provider || 'AI').toUpperCase()} · ${decision.model || ''}] ${decision.action} ${symbol} (${decision.confidence}% conf) — ${decision.thesis}`,
    symbol,
    decision
  );

  let executed: { ok: boolean; tradeId?: string; error?: string; closed?: boolean } | null = null;
  if (body.executeIfSignal) {
    if (decision.action === 'CLOSE' && openOnSymbol) {
      const cls = await adapter.closePositionPartialOrFull(symbol, openOnSymbol.direction, openOnSymbol.remaining_quantity, `ai_manual_exit_${Date.now()}`);
      const exitPx = Number(cls.filledPrice);
      const entryPx = Number(openOnSymbol.entry_price);
      const qty = Number(openOnSymbol.remaining_quantity);
      const pnl = openOnSymbol.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
      const totalRealized = Number(openOnSymbol.realized_pnl) + pnl - Number(cls.fee);
      if (openOnSymbol.mode === 'PAPER') {
        const restored = Number(cfg.paper_balance) + Number(openOnSymbol.margin_used) + pnl - Number(cls.fee);
        await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?').bind(restored.toFixed(2), user.id).run();
      }
      await c.env.DB.prepare(
        `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'AI_EXIT', closed_at = datetime('now') WHERE id = ?`
      ).bind(cls.filledPrice, totalRealized.toFixed(4), openOnSymbol.id).run();
      executed = { ok: true, tradeId: openOnSymbol.id, closed: true };
    } else if ((decision.action === 'LONG' || decision.action === 'SHORT') && decision.confidence >= (cfg.ai_min_confidence ?? 65)) {
      const sig = {
        symbol,
        direction: decision.action,
        timeframe,
        price: String(decision.entry),
        stopLoss: String(decision.stopLoss),
        leverage: decision.leverage,
        tp1: String(decision.tp1),
        tp2: String(decision.tp2),
        tp3: String(decision.tp3),
        channelHandle: cfg.signal_channel_handle,
        reason: decision.thesis,
      };
      const sigId = randomId('sig');
      await c.env.DB.prepare(
        `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status)
         VALUES (?, ?, 'ai_agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
      ).bind(sigId, user.id, sig.symbol, sig.direction, sig.timeframe, sig.price, sig.stopLoss, sig.leverage, sig.tp1, sig.tp2, sig.tp3, formatDollarinoSignal(sig)).run();

      executed = await executeSignalForUser(c.env, user.id, sig, {
        signalId: sigId,
        forceBypassState: true,
        strategyKey: 'ai_autonomous_agent',
        aiConfidence: decision.confidence,
        aiReasoning: decision.thesis,
      });
      if (executed.ok) {
        await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
      }
    }
  }

  return c.json({ ok: true, decision, executed });
});

tradingRoutes.get('/logs', async (c) => {
  const user = c.get('user');
  const category = c.req.query('category');
  const rows = category
    ? await c.env.DB.prepare(
        `SELECT * FROM audit_logs WHERE user_id = ? AND category = ? ORDER BY created_at DESC LIMIT 150`
      ).bind(user.id, category).all()
    : await c.env.DB.prepare(
        `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 150`
      ).bind(user.id).all();
  return c.json({ logs: rows.results });
});

tradingRoutes.get('/notifications', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(user.id).all().catch(() => ({ results: [] }));
  const unread = rows.results.filter((n) => (n as { is_read: number }).is_read === 0).length;
  return c.json({ notifications: rows.results, unread });
});

tradingRoutes.post('/notifications/read', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).bind(user.id).run().catch(() => {});
  return c.json({ ok: true });
});

tradingRoutes.get('/events/snapshot', async (c) => {
  const user = c.get('user');
  const [cfg, openCount, unreadNtf, latestSig] = await Promise.all([
    c.env.DB.prepare(`SELECT bot_state, trading_mode, paper_balance FROM bot_configs WHERE user_id = ?`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE user_id = ? AND status = 'OPEN'`).bind(user.id).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`).bind(user.id).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT id, symbol, direction, created_at FROM signals ORDER BY created_at DESC LIMIT 1`).first(),
  ]);
  return c.json({
    events: [
      { type: 'balance.updated', data: { paperBalance: (cfg as { paper_balance?: string } | null)?.paper_balance ?? '0' } },
      { type: 'position.updated', data: { openCount: openCount?.cnt ?? 0 } },
      { type: 'notification.created', data: { unread: unreadNtf?.cnt ?? 0 } },
      ...(latestSig ? [{ type: 'signal.received', data: latestSig }] : []),
    ],
    timestamp: new Date().toISOString(),
  });
});

// =========================================================================
// Tamper-Proof Server-Signed Profit Cards (backed strictly by settled D1 trades)
// =========================================================================

export function buildVerifiedCardCanonicalPayload(card: {
  id: string;
  userId: string;
  mode: string;
  period: string;
  startDate: string;
  endDate: string;
  tradesCount: number;
  winRate: number;
  netPnlUsd: number;
  roiPct: number;
  profitFactor: number;
  exchangeProvider: string;
  strategyName: string;
  tradesHash: string;
  issuedAt: string;
}): string {
  return [
    card.id,
    card.userId,
    card.mode,
    card.period,
    card.startDate,
    card.endDate,
    String(card.tradesCount),
    card.winRate.toFixed(2),
    card.netPnlUsd.toFixed(2),
    card.roiPct.toFixed(2),
    card.profitFactor.toFixed(2),
    card.exchangeProvider,
    card.strategyName,
    card.tradesHash,
    card.issuedAt,
  ].join('|');
}

tradingRoutes.get('/cards', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM verified_profit_cards WHERE user_id = ? ORDER BY issued_at DESC LIMIT 20`
  ).bind(user.id).all();
  return c.json({ cards: rows.results });
});

tradingRoutes.post('/cards/issue', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) return c.json({ error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  const body = await c.req.json<{
    mode?: 'LIVE' | 'PAPER';
    period?: '24H' | '7D' | '30D' | '1Y' | 'ALL' | 'TRADE';
    tradeId?: string;
    cardStyle?: 'dark' | 'gold' | 'emerald';
  }>().catch(() => ({} as { mode?: 'LIVE' | 'PAPER'; period?: '24H' | '7D' | '30D' | '1Y' | 'ALL' | 'TRADE'; tradeId?: string; cardStyle?: 'dark' | 'gold' | 'emerald' }));

  const requestedMode = body.mode === 'PAPER' ? 'PAPER' : 'LIVE';
  const period = body.period && ['24H', '7D', '30D', '1Y', 'ALL', 'TRADE'].includes(body.period) ? body.period : '7D';

  const whereClause = [`user_id = ?`, `status = 'CLOSED'`, `mode = ?`];
  const binds: unknown[] = [user.id, requestedMode];

  if (period === 'TRADE') {
    if (!body.tradeId) {
      return c.json({ error: 'شناسه معامله برای صدور کارت تک‌معامله الزامی است.' }, 400);
    }
    whereClause.push(`id = ?`);
    binds.push(body.tradeId);
  } else if (period === '24H') {
    whereClause.push(`closed_at >= datetime('now', '-24 hours')`);
  } else if (period === '7D') {
    whereClause.push(`closed_at >= datetime('now', '-7 days')`);
  } else if (period === '30D') {
    whereClause.push(`closed_at >= datetime('now', '-30 days')`);
  } else if (period === '1Y') {
    whereClause.push(`closed_at >= datetime('now', '-365 days')`);
  }

  const tradesRes = await c.env.DB.prepare(
    `SELECT id, symbol, direction, exchange_provider, strategy_key, realized_pnl, margin_used, closed_at
     FROM trades WHERE ${whereClause.join(' AND ')} ORDER BY closed_at ASC`
  ).bind(...binds).all<{
    id: string;
    symbol: string;
    direction: string;
    exchange_provider: string;
    strategy_key: string | null;
    realized_pnl: string;
    margin_used: string;
    closed_at: string;
  }>();

  const trades = tradesRes.results;
  if (!trades.length) {
    return c.json({
      error:
        requestedMode === 'LIVE'
          ? 'هنوز هیچ معامله واقعی (Live) بسته شده‌ای در این بازه زمانی برای حساب شما ثبت نشده است. کارت سود تاییدشده فقط بر اساس معاملات واقعی تسویه‌شده صادر می‌شود.'
          : 'هیچ معامله شبیه‌ساز بسته شده‌ای در این بازه زمانی ثبت نشده است.',
      code: 'NO_SETTLED_TRADES',
    }, 400);
  }

  let netPnlUsd = 0;
  let wins = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let totalMarginUsed = 0;
  const providerCounts = new Map<string, number>();
  const strategyCounts = new Map<string, number>();

  for (const t of trades) {
    const pnl = Number(t.realized_pnl || 0);
    const margin = Math.max(0, Number(t.margin_used || 0));
    netPnlUsd += pnl;
    totalMarginUsed += margin;
    if (pnl > 0) {
      wins++;
      grossWins += pnl;
    } else if (pnl < 0) {
      grossLosses += Math.abs(pnl);
    }
    const prov = (t.exchange_provider || 'TOOBIT').toUpperCase();
    providerCounts.set(prov, (providerCounts.get(prov) ?? 0) + 1);
    const strat = t.strategy_key || 'dollarino_v01';
    strategyCounts.set(strat, (strategyCounts.get(strat) ?? 0) + 1);
  }

  const tradesCount = trades.length;
  const winRate = Number(((wins / tradesCount) * 100).toFixed(2));
  const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : grossWins > 0 ? 99 : 0;

  let baseCapital = totalMarginUsed;
  if (requestedMode === 'PAPER') {
    const cfgRow = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ paper_balance: string }>();
    const currentPaper = Number(cfgRow?.paper_balance ?? 10000);
    baseCapital = Math.max(totalMarginUsed, Math.max(100, currentPaper - netPnlUsd));
  } else {
    const avgMargin = totalMarginUsed / Math.max(1, tradesCount);
    baseCapital = Math.max(avgMargin, totalMarginUsed);
  }
  const roiPct = baseCapital > 0 ? Number(((netPnlUsd / baseCapital) * 100).toFixed(2)) : 0;

  const topProvider = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'TOOBIT';
  const topStrategyRaw = Array.from(strategyCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'dollarino_v01';
  const topStrategy = resolveEngineDisplayLabel(topStrategyRaw);
  const startDate = trades[0]!.closed_at;
  const endDate = trades[trades.length - 1]!.closed_at;

  const tradesDigestInput = trades.map((t) => `${t.id}:${t.realized_pnl}:${t.closed_at}`).join(';');
  const tradesHash = await sha256Hex(tradesDigestInput);

  const cardId = `DLR-${randomId('').slice(0, 10).toUpperCase()}`;
  const issuedAt = new Date().toISOString();
  const cardSecret = c.env.SESSION_JWT_SECRET || c.env.MASTER_ENCRYPTION_KEY || 'dollarino-card-hmac-secret';

  const canonical = buildVerifiedCardCanonicalPayload({
    id: cardId,
    userId: user.id,
    mode: requestedMode,
    period,
    startDate,
    endDate,
    tradesCount,
    winRate,
    netPnlUsd: Number(netPnlUsd.toFixed(2)),
    roiPct,
    profitFactor,
    exchangeProvider: topProvider,
    strategyName: topStrategy,
    tradesHash,
    issuedAt,
  });
  const hmacSignature = await hmacSha256Hex(canonical, cardSecret);

  const payloadSnapshot = JSON.stringify({
    cardStyle: body.cardStyle || 'dark',
    symbol: period === 'TRADE' ? trades[0]!.symbol : undefined,
    direction: period === 'TRADE' ? trades[0]!.direction : undefined,
    isVerifiedReal: requestedMode === 'LIVE',
    grossWins: Number(grossWins.toFixed(2)),
    grossLosses: Number(grossLosses.toFixed(2)),
    tradesHash,
  });

  await c.env.DB.prepare(
    `INSERT INTO verified_profit_cards (
      id, user_id, mode, period, start_date, end_date,
      trades_count, win_rate, net_pnl_usd, roi_pct, profit_factor,
      exchange_provider, strategy_name, payload_json, hmac_signature, issued_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    cardId,
    user.id,
    requestedMode,
    period,
    startDate,
    endDate,
    tradesCount,
    winRate,
    Number(netPnlUsd.toFixed(2)),
    roiPct,
    profitFactor,
    topProvider,
    topStrategy,
    payloadSnapshot,
    hmacSignature,
    issuedAt
  ).run();

  return c.json({
    ok: true,
    card: {
      id: cardId,
      userId: user.id,
      displayName: user.username,
      mode: requestedMode,
      isVerifiedReal: requestedMode === 'LIVE',
      period,
      startDate,
      endDate,
      tradesCount,
      winRate,
      netPnlUsd: Number(netPnlUsd.toFixed(2)),
      roiPct,
      profitFactor,
      exchangeProvider: topProvider,
      strategyName: topStrategy,
      cardStyle: body.cardStyle || 'dark',
      symbol: period === 'TRADE' ? trades[0]!.symbol : undefined,
      direction: period === 'TRADE' ? trades[0]!.direction : undefined,
      hmacSignature,
      verifyPath: `/verify-card/${cardId}`,
      issuedAt,
    },
  });
});

tradingRoutes.get('/cards/:id/image', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const layout = c.req.query('layout') === 'vertical' ? 'vertical' : 'horizontal';
  const format = c.req.query('format') === 'svg' ? 'svg' : 'png';

  const row = await c.env.DB.prepare(
    `SELECT vpc.*, u.username FROM verified_profit_cards vpc JOIN users u ON u.id = vpc.user_id WHERE vpc.id = ? AND vpc.user_id = ? LIMIT 1`
  ).bind(id, user.id).first<{
    id: string;
    username: string;
    mode: 'LIVE' | 'PAPER';
    period: string;
    trades_count: number;
    win_rate: number;
    net_pnl_usd: number;
    roi_pct: number;
    profit_factor: number;
    exchange_provider: string;
    strategy_name: string;
    issued_at: string;
  }>();

  if (!row) return c.json({ error: 'Profit card not found' }, 404);

  const renderInput = {
    cardId: row.id,
    displayName: row.username || 'Dollarino Trader',
    mode: row.mode,
    period: row.period,
    tradesCount: row.trades_count,
    winRate: row.win_rate,
    netPnlUsd: row.net_pnl_usd,
    roiPct: row.roi_pct,
    profitFactor: row.profit_factor,
    exchangeProvider: row.exchange_provider,
    strategyName: row.strategy_name,
    issuedAt: row.issued_at,
    layout,
  } as const;

  if (format === 'png') {
    const png = await renderProfitCardPng(renderInput);
    if (png) {
      return new Response(png as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `inline; filename="dollarino-profit-${row.id}-${layout}.png"`,
          'Cache-Control': 'private, max-age=300',
        },
      });
    }
  }

  const svg = buildProfitCardSvg(renderInput);
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
});

tradingRoutes.post('/cards/:id/send-telegram', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ layout?: 'horizontal' | 'vertical' }>().catch(() => ({ layout: 'horizontal' as const }));
  if (!user.telegramId) {
    return c.json({ error: 'حساب شما هنوز به تلگرام متصل نیست.' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT vpc.*, u.username FROM verified_profit_cards vpc JOIN users u ON u.id = vpc.user_id WHERE vpc.id = ? AND vpc.user_id = ? LIMIT 1`
  ).bind(id, user.id).first<{
    id: string;
    username: string;
    mode: 'LIVE' | 'PAPER';
    period: string;
    trades_count: number;
    win_rate: number;
    net_pnl_usd: number;
    roi_pct: number;
    profit_factor: number;
    exchange_provider: string;
    strategy_name: string;
    issued_at: string;
  }>();

  if (!row) return c.json({ error: 'Card not found' }, 404);
  const ok = await publishProfitCardToTelegram(
    c.env,
    user.telegramId,
    {
      id: row.id,
      displayName: row.username || 'Dollarino Trader',
      mode: row.mode,
      period: row.period,
      tradesCount: row.trades_count,
      winRate: row.win_rate,
      netPnlUsd: row.net_pnl_usd,
      roiPct: row.roi_pct,
      profitFactor: row.profit_factor,
      exchangeProvider: row.exchange_provider,
      strategyName: row.strategy_name,
      issuedAt: row.issued_at,
    },
    body.layout === 'vertical' ? 'vertical' : 'horizontal'
  );
  return c.json({ ok });
});

// =========================================================================
// Pro Quant Strategy IDE: Pine Script, Python & Visual Strategy Endpoints
// =========================================================================

tradingRoutes.get('/strategies', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM user_strategies WHERE user_id = ? ORDER BY updated_at DESC`
  ).bind(user.id).all<{
    id: string;
    user_id: string;
    name: string;
    description: string;
    language: CustomStrategyLanguage;
    code: string;
    timeframe: string;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>().catch(() => ({ results: [] }));

  return c.json({
    samples: SAMPLE_CUSTOM_STRATEGIES,
    userStrategies: rows.results,
  });
});

tradingRoutes.post('/strategies/evaluate', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) return c.json({ error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  const body = await c.req.json<{
    language?: CustomStrategyLanguage;
    code?: string;
    symbol?: string;
    timeframe?: Timeframe;
  }>().catch(() => ({} as { language?: CustomStrategyLanguage; code?: string; symbol?: string; timeframe?: Timeframe }));

  const langMode: CustomStrategyLanguage =
    body.language === 'python' || body.language === 'visual' ? body.language : 'pine';
  const code = String(body.code || '');
  const symbol = normalizeCanonicalSymbol(body.symbol || 'BTCUSDT');
  const tf = (body.timeframe || '15m') as Timeframe;

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');
  const candles = await adapter.getKlines(symbol, tf, 360);
  const res = evaluateCustomStrategy(langMode, code, candles, tf);

  let backtestSummary = null;
  if (res.valid && candles.length >= 40) {
    const bt = runBacktest(candles, [], {
      symbol,
      strategyKey: langMode === 'pine' ? 'custom_pine' : langMode === 'python' ? 'custom_python' : 'custom_visual',
      timeframe: tf,
      initialBalance: 10000,
      marginPct: 10,
      leverage: 5,
      tp1ClosePct: 40,
      tp2ClosePct: 30,
      tp3ClosePct: 30,
      autoBreakevenOnTp1: true,
      moveSlToTp1OnTp2: true,
      customSignals: res.signals,
    });
    backtestSummary = {
      metrics: bt.metrics,
      equityCurve: bt.equityCurve,
      trades: bt.trades.slice(0, 40),
    };
  }

  return c.json({
    valid: res.valid,
    title: res.title,
    language: res.language,
    errors: res.errors,
    warnings: res.warnings,
    plots: res.plots,
    markers: res.markers,
    latestSignal: res.latestSignal,
    candles,
    backtestSummary,
  });
});

tradingRoutes.post('/strategies', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) return c.json({ error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  const body = await c.req.json<{
    id?: string;
    name?: string;
    description?: string;
    language?: CustomStrategyLanguage;
    code?: string;
    timeframe?: Timeframe;
  }>().catch(() => ({} as { id?: string; name?: string; description?: string; language?: CustomStrategyLanguage; code?: string; timeframe?: Timeframe }));

  const langMode: CustomStrategyLanguage =
    body.language === 'python' || body.language === 'visual' ? body.language : 'pine';
  const name = String(body.name || 'Custom Strategy').trim().slice(0, 80);
  const description = String(body.description || '').trim().slice(0, 240);
  const code = String(body.code || '');
  const tf = String(body.timeframe || '15m');

  if (!code.trim()) {
    return c.json({ error: 'کد استراتژی نمی‌تواند خالی باشد.' }, 400);
  }

  if (body.id) {
    const existing = await c.env.DB.prepare(
      `SELECT id FROM user_strategies WHERE id = ? AND user_id = ? LIMIT 1`
    ).bind(body.id, user.id).first<{ id: string }>();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE user_strategies SET name = ?, description = ?, language = ?, code = ?, timeframe = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
      ).bind(name, description, langMode, code, tf, existing.id, user.id).run();
      const row = await c.env.DB.prepare(`SELECT * FROM user_strategies WHERE id = ?`).bind(existing.id).first();
      return c.json({ ok: true, strategy: row });
    }
  }

  const id = randomId('strat');
  await c.env.DB.prepare(
    `INSERT INTO user_strategies (id, user_id, name, description, language, code, timeframe, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(id, user.id, name, description, langMode, code, tf).run();

  const row = await c.env.DB.prepare(`SELECT * FROM user_strategies WHERE id = ?`).bind(id).first();
  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Saved custom ${langMode.toUpperCase()} strategy: ${name}`);
  return c.json({ ok: true, strategy: row });
});

tradingRoutes.delete('/strategies/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM user_strategies WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  await c.env.DB.prepare(
    `UPDATE bot_configs SET active_custom_strategy_id = NULL, strategy_key = CASE WHEN active_custom_strategy_id = ? THEN 'dollarino_v01' ELSE strategy_key END WHERE user_id = ?`
  ).bind(id, user.id).run();
  return c.json({ ok: true });
});

tradingRoutes.post('/strategies/:id/activate', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) {
    return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  }
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, name, language, timeframe FROM user_strategies WHERE id = ? AND user_id = ? LIMIT 1`
  ).bind(id, user.id).first<{ id: string; name: string; language: CustomStrategyLanguage; timeframe: string }>();
  if (!row) return c.json({ error: 'Custom strategy not found' }, 404);

  const strategyKey = row.language === 'pine' ? 'custom_pine' : row.language === 'python' ? 'custom_python' : 'custom_visual';
  await activateExclusiveTradingEngine(c.env.DB, user.id, 'STRATEGY', {
    strategyKey,
    customStrategyId: row.id,
    auditSource: 'custom_strategy_activate',
  });
  await c.env.DB.prepare(
    `UPDATE bot_configs SET strategy_key = ?, active_custom_strategy_id = ?, entry_timeframe = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).bind(strategyKey, row.id, row.timeframe || '15m', user.id).run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Activated custom ${row.language.toUpperCase()} strategy "${row.name}" for autonomous execution`);
  return c.json({ ok: true, strategyKey, activeCustomStrategyId: row.id, name: row.name });
});

// =========================================================================
// Live AI Signal Scanner & Instant Autonomous Trigger
// =========================================================================
tradingRoutes.post('/ai-scan-now', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `aiscan:${user.id}`, 10, 180);
  if (!rl.allowed) {
    return c.json({ ok: false, error: `لطفاً برای اسکن مجدد هوشمند ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const body = await c.req.json<{
    symbol?: string;
    symbols?: string[];
    timeframe?: Timeframe;
    autoExecute?: boolean;
  }>().catch(() => ({} as { symbol?: string; symbols?: string[]; timeframe?: Timeframe; autoExecute?: boolean }));

  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<UserBotConfigRow>();

  const tf: Timeframe = (body.timeframe || cfg?.entry_timeframe || '15m') as Timeframe;
  const htf: Timeframe = cfg?.higher_timeframe || (tf === '5m' ? '15m' : tf === '15m' ? '1h' : '4h');
  const requestedList = Array.isArray(body.symbols) && body.symbols.length
    ? body.symbols.map((s) => normalizeCanonicalSymbol(s)).slice(0, 6)
    : body.symbol
      ? [normalizeCanonicalSymbol(body.symbol)]
      : [cfg?.symbol || 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];

  const uniqueSymbols = Array.from(new Set(requestedList));
  const { adapter } = await resolveUserExchangeAdapter(
    c.env,
    user.id,
    cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
  );

  let canExecute = false;
  if (body.autoExecute) {
    const gate = await requirePaidEntitlement(c.env.DB, user);
    canExecute = gate.ok;
  }

  const results = await Promise.all(
    uniqueSymbols.map(async (sym) => {
      try {
        const [ltfRaw, htfRaw] = await Promise.all([
          adapter.getKlines(sym, tf, 180),
          adapter.getKlines(sym, htf, 90).catch(() => []),
        ]);
        const ltfClosed = selectClosedCandles(ltfRaw, tf);
        const htfClosed = selectClosedCandles(htfRaw, htf);
        const decision = await runAutonomousAITrader(c.env, user.id, {
          symbol: sym,
          timeframe: tf,
          higherTimeframe: htf,
          candles: ltfClosed.length >= 35 ? ltfClosed : ltfRaw,
          htfCandles: htfClosed.length >= 25 ? htfClosed : htfRaw,
          maxLeverage: cfg?.market_type === 'SPOT' ? 1 : Math.max(1, cfg?.max_leverage ?? 10),
          minConfidence: cfg?.ai_min_confidence ?? 60,
          bypassCache: true,
        });

        let signalId: string | null = null;
        let executed = false;
        let executeNote = '';

        if (decision.ok && (decision.action === 'LONG' || decision.action === 'SHORT')) {
          signalId = randomId('sig');
          const sigObj = {
            symbol: sym,
            direction: decision.action as Direction,
            timeframe: tf,
            price: String(decision.entry),
            stopLoss: String(decision.stopLoss),
            leverage: cfg?.market_type === 'SPOT' ? 1 : decision.leverage,
            tp1: String(decision.tp1),
            tp2: String(decision.tp2),
            tp3: String(decision.tp3),
            channelHandle: '@Dollarino_official',
            engineKey: 'ai_autonomous_agent',
            engineLabel: resolveEngineDisplayLabel('ai_autonomous_agent'),
            reason: decision.thesis,
          };
          await c.env.DB.prepare(
            `INSERT INTO signals (id, user_id, symbol, direction, timeframe, price, stop_loss, tp1, tp2, tp3, leverage, raw_text, source, engine_source, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_agent', 'ai_autonomous_agent', 'NEW')`
          ).bind(
            signalId,
            user.id,
            sym,
            sigObj.direction,
            tf,
            sigObj.price,
            sigObj.stopLoss,
            sigObj.tp1,
            sigObj.tp2,
            sigObj.tp3,
            sigObj.leverage,
            formatDollarinoSignal(sigObj)
          ).run().catch(() => {});

          if (canExecute && decision.confidence >= (cfg?.ai_min_confidence ?? 60)) {
            const execRes = await executeSignalForUser(c.env, user.id, sigObj, {
              signalId,
              strategyKey: 'ai_autonomous_agent',
              aiConfidence: decision.confidence,
              aiReasoning: decision.thesis,
              marketType: cfg?.market_type ?? 'FUTURES',
            }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : 'Execution skipped' }));
            executed = Boolean(execRes.ok);
            executeNote = ('error' in execRes ? execRes.error : '') || ('tradeId' in execRes && execRes.tradeId ? `Trade #${execRes.tradeId}` : '');
            if (executed) {
              await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(signalId).run().catch(() => {});
            }
          }
        }

        await logAudit(
          c.env.DB,
          user.id,
          'AI_AGENT',
          decision.ok ? 'INFO' : 'WARN',
          `[اسکن فوری AI] ${sym} (${tf}): ${decision.action} (${decision.confidence}%) — ${decision.thesis}`,
          sym,
          decision
        ).catch(() => {});

        return {
          symbol: sym,
          timeframe: tf,
          signalId,
          executed,
          executeNote,
          ...decision,
        };
      } catch (err) {
        return {
          symbol: sym,
          timeframe: tf,
          ok: false,
          action: 'HOLD' as const,
          confidence: 0,
          entry: 0,
          stopLoss: 0,
          tp1: 0,
          tp2: 0,
          tp3: 0,
          leverage: 1,
          rrRatio: 0,
          thesis: err instanceof Error ? err.message : 'Scan failed',
          invalidation: 'Retry',
          executed: false,
        };
      }
    })
  );

  return c.json({ ok: true, results });
});

// =========================================================================
// Live Price Alerts (Web + Telegram Trigger via TradingBotCoordinator)
// =========================================================================
tradingRoutes.get('/alerts', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM price_alerts WHERE user_id = ? ORDER BY is_active DESC, created_at DESC LIMIT 40`
  ).bind(user.id).all().catch(() => ({ results: [] }));
  return c.json({ alerts: rows.results });
});

tradingRoutes.post('/alerts', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    symbol?: string;
    condition?: 'ABOVE' | 'BELOW';
    targetPrice?: number;
    note?: string;
  }>().catch(() => ({} as { symbol?: string; condition?: 'ABOVE' | 'BELOW'; targetPrice?: number; note?: string }));

  const symbol = normalizeCanonicalSymbol(body.symbol || 'BTCUSDT');
  const targetPrice = Number(body.targetPrice);
  const condition = body.condition === 'BELOW' ? 'BELOW' : 'ABOVE';
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    return c.json({ error: 'قیمت هدف معتبر نیست' }, 400);
  }

  const id = randomId('alrt');
  await c.env.DB.prepare(
    `INSERT INTO price_alerts (id, user_id, symbol, condition, target_price, note, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).bind(id, user.id, symbol, condition, targetPrice, (body.note || '').trim().slice(0, 140) || null).run();

  const doId = c.env.TRADING_BOT_DO.idFromName('global-coordinator');
  await c.env.TRADING_BOT_DO.get(doId).fetch('https://do/start').catch(() => {});

  const row = await c.env.DB.prepare(`SELECT * FROM price_alerts WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, alert: row }, 201);
});

tradingRoutes.delete('/alerts/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM price_alerts WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  return c.json({ ok: true });
});


