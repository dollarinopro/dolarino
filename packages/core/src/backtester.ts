import { buildBacktestMatrices } from './kiya-bot.js';
import { computeStrategySignals, type StrategyParams } from './strategies.js';
import type { BacktestMetrics, BacktestResult, BacktestTrade, Candle, StrategyKey, StrategySignalOutput, Timeframe } from './types.js';

export interface BacktestOptions {
  symbol: string;
  strategyKey: StrategyKey;
  timeframe: Timeframe;
  higherTimeframe?: Timeframe;
  initialBalance: number;
  marginPct: number;
  leverage: number;
  tp1ClosePct: number;
  tp2ClosePct: number;
  tp3ClosePct: number;
  autoBreakevenOnTp1: boolean;
  moveSlToTp1OnTp2: boolean;
  useTrailingStop?: boolean;
  trailPct?: number;
  trailAfterTp1?: boolean;
  feeRateBps?: number;      // default 5 bps (0.05%) taker
  slippageBps?: number;     // default 3 bps (0.03%)
  params?: StrategyParams;
  customSignals?: StrategySignalOutput[];
}

/**
 * Deterministic no-lookahead sequential backtester with 3-TP partial exits + Risk-Free + Trailing Stop.
 * Conservative policy: if both SL and TP are touched inside the same bar, Stop Loss wins.
 */
export function runBacktest(
  ltfCandles: Candle[],
  htfCandles: Candle[],
  opts: BacktestOptions
): BacktestResult {
  const feeRate = (opts.feeRateBps ?? 5) / 10_000;
  const slipRate = (opts.slippageBps ?? 3) / 10_000;
  const signals =
    opts.customSignals && opts.customSignals.length === ltfCandles.length
      ? opts.customSignals
      : computeStrategySignals(
          opts.strategyKey,
          ltfCandles,
          htfCandles,
          opts.timeframe,
          opts.higherTimeframe ?? '1h',
          opts.params
        );

  const signalByTs = new Map(signals.map((s) => [s.timestamp, s]));

  let balance = opts.initialBalance;
  let peakEquity = balance;
  let troughEquity = balance;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;
  let maxRunupUsd = 0;
  let maxRunupPct = 0;

  interface ActivePos {
    id: string;
    direction: 'LONG' | 'SHORT';
    entryTime: number;
    entryPrice: number;
    initialQty: number;
    remQty: number;
    marginUsed: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    tp1Hit: boolean;
    tp2Hit: boolean;
    tp3Hit: boolean;
    riskFreeTriggered: boolean;
    trailingTriggered: boolean;
    highSince: number;
    lowSince: number;
    realizedPnl: number;
    fees: number;
  }

  let active: ActivePos | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ time: number; equity: number; drawdownPct: number }> = [];

  for (let i = 0; i < ltfCandles.length; i++) {
    const c = ltfCandles[i]!;

    // 1. Evaluate open position on current bar
    if (active) {
      const isLong = active.direction === 'LONG';
      active.highSince = Math.max(active.highSince, c.high);
      active.lowSince = Math.min(active.lowSince, c.low);

      const slHit = isLong ? c.low <= active.sl : c.high >= active.sl;
      const tp3HitNow = !active.tp3Hit && (isLong ? c.high >= active.tp3 : c.low <= active.tp3);
      const tp2HitNow = !active.tp2Hit && (isLong ? c.high >= active.tp2 : c.low <= active.tp2);
      const tp1HitNow = !active.tp1Hit && (isLong ? c.high >= active.tp1 : c.low <= active.tp1);

      const closePartial = (qty: number, rawExitPrice: number) => {
        const q = Math.min(qty, active!.remQty);
        if (q <= 0) return;
        const fill = isLong ? rawExitPrice * (1 - slipRate) : rawExitPrice * (1 + slipRate);
        const grossPnl = isLong ? (fill - active!.entryPrice) * q : (active!.entryPrice - fill) * q;
        const fee = fill * q * feeRate;
        active!.realizedPnl += grossPnl - fee;
        active!.fees += fee;
        active!.remQty -= q;
        balance += grossPnl - fee;
      };

      const finalizeTrade = (exitPrice: number, exitReason: string) => {
        if (!active) return;
        const net = active.realizedPnl;
        const pnlPct = active.marginUsed > 0 ? (net / active.marginUsed) * 100 : 0;
        trades.push({
          id: active.id,
          symbol: opts.symbol,
          direction: active.direction,
          entryTime: active.entryTime,
          exitTime: c.timestamp,
          entryPrice: active.entryPrice,
          exitPrice,
          quantity: active.initialQty,
          leverage: opts.leverage,
          marginUsed: active.marginUsed,
          pnlUsd: net,
          pnlPct,
          feesUsd: active.fees,
          exitReason,
          tp1Hit: active.tp1Hit,
          tp2Hit: active.tp2Hit,
          tp3Hit: active.tp3Hit,
          riskFreeTriggered: active.riskFreeTriggered,
          trailingTriggered: active.trailingTriggered,
        });
        active = null;
      };

      // Conservative policy: Stop Loss evaluated first on intra-bar conflicts
      if (slHit) {
        const reason = active.trailingTriggered
          ? 'TRAILING_SL'
          : active.riskFreeTriggered
            ? 'RISK_FREE_SL'
            : 'SL';
        const exitPx = active.sl;
        closePartial(active.remQty, exitPx);
        finalizeTrade(exitPx, reason);
      } else {
        if (tp1HitNow && active.remQty > 0) {
          active.tp1Hit = true;
          const q1 = active.initialQty * (opts.tp1ClosePct / 100);
          closePartial(q1, active.tp1);
          if (opts.autoBreakevenOnTp1 && active.remQty > 0) {
            active.sl = isLong ? Math.max(active.sl, active.entryPrice) : Math.min(active.sl, active.entryPrice);
            active.riskFreeTriggered = true;
          }
        }
        if (tp2HitNow && active && active.remQty > 0) {
          active.tp2Hit = true;
          const q2 = active.initialQty * (opts.tp2ClosePct / 100);
          closePartial(q2, active.tp2);
          if (opts.moveSlToTp1OnTp2 && active.remQty > 0) {
            active.sl = isLong ? Math.max(active.sl, active.tp1) : Math.min(active.sl, active.tp1);
          }
        }
        if (tp3HitNow && active && active.remQty > 0) {
          active.tp3Hit = true;
          closePartial(active.remQty, active.tp3);
        }
        if (active && active.remQty <= 1e-10) {
          finalizeTrade(active.tp3Hit ? active.tp3 : active.tp2Hit ? active.tp2 : active.tp1, 'TP3');
        } else if (active && opts.useTrailingStop && (opts.trailPct ?? 0) > 0) {
          const canTrail = active.tp1Hit || opts.trailAfterTp1 === false;
          if (canTrail) {
            const pct = (opts.trailPct ?? 2.0) / 100;
            const trailStop = isLong ? active.highSince * (1 - pct) : active.lowSince * (1 + pct);
            const tightened = isLong ? trailStop > active.sl : trailStop < active.sl;
            if (tightened) {
              active.sl = trailStop;
              active.trailingTriggered = true;
            }
          }
        }
      }
    }

    // 2. Open new position strictly on CLOSED bar signal (next candle open simulation)
    if (!active && i + 1 < ltfCandles.length) {
      const sig = signalByTs.get(c.timestamp);
      if (sig && sig.signal !== 'NONE' && sig.stopLoss && sig.tp1 && sig.tp2 && sig.tp3) {
        const nextBar = ltfCandles[i + 1]!;
        const isLong = sig.signal === 'LONG';
        const entryPrice = isLong ? nextBar.open * (1 + slipRate) : nextBar.open * (1 - slipRate);
        const marginUsed = Math.max(0, balance * (opts.marginPct / 100));
        if (marginUsed >= 1 && entryPrice > 0) {
          const qty = (marginUsed * opts.leverage) / entryPrice;
          const openFee = entryPrice * qty * feeRate;
          balance -= openFee;
          active = {
            id: `bt-${trades.length + 1}`,
            direction: sig.signal,
            entryTime: nextBar.timestamp,
            entryPrice,
            initialQty: qty,
            remQty: qty,
            marginUsed,
            sl: sig.stopLoss,
            tp1: sig.tp1,
            tp2: sig.tp2,
            tp3: sig.tp3,
            tp1Hit: false,
            tp2Hit: false,
            tp3Hit: false,
            riskFreeTriggered: false,
            trailingTriggered: false,
            highSince: nextBar.high,
            lowSince: nextBar.low,
            realizedPnl: -openFee,
            fees: openFee,
          };
        }
      }
    }

    // Mark-to-market equity
    let unrealized = 0;
    if (active) {
      unrealized = active.direction === 'LONG'
        ? (c.close - active.entryPrice) * active.remQty
        : (active.entryPrice - c.close) * active.remQty;
    }
    const equity = balance + unrealized;
    if (equity > peakEquity) peakEquity = equity;
    if (equity < troughEquity) troughEquity = equity;
    const ddUsd = Math.max(0, peakEquity - equity);
    const ddPct = peakEquity > 0 ? (ddUsd / peakEquity) * 100 : 0;
    const ruUsd = Math.max(0, equity - troughEquity);
    const ruPct = troughEquity > 0 ? (ruUsd / troughEquity) * 100 : 0;
    if (ddUsd > maxDrawdownUsd) maxDrawdownUsd = ddUsd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    if (ruUsd > maxRunupUsd) maxRunupUsd = ruUsd;
    if (ruPct > maxRunupPct) maxRunupPct = ruPct;
    equityCurve.push({ time: c.timestamp, equity, drawdownPct: ddPct });
  }

  // Close open position at end of data
  if (active && ltfCandles.length > 0) {
    const last = ltfCandles[ltfCandles.length - 1]!;
    const isLong = active.direction === 'LONG';
    const gross = isLong ? (last.close - active.entryPrice) * active.remQty : (active.entryPrice - last.close) * active.remQty;
    const fee = last.close * active.remQty * feeRate;
    balance += gross - fee;
    const net = active.realizedPnl + gross - fee;
    trades.push({
      id: active.id,
      symbol: opts.symbol,
      direction: active.direction,
      entryTime: active.entryTime,
      exitTime: last.timestamp,
      entryPrice: active.entryPrice,
      exitPrice: last.close,
      quantity: active.initialQty,
      leverage: opts.leverage,
      marginUsed: active.marginUsed,
      pnlUsd: net,
      pnlPct: active.marginUsed > 0 ? (net / active.marginUsed) * 100 : 0,
      feesUsd: active.fees + fee,
      exitReason: 'EOD',
      tp1Hit: active.tp1Hit,
      tp2Hit: active.tp2Hit,
      tp3Hit: active.tp3Hit,
      riskFreeTriggered: active.riskFreeTriggered,
      trailingTriggered: active.trailingTriggered,
    });
  }

  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd < 0);
  const grossWins = wins.reduce((s, t) => s + t.pnlUsd, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));

  let curW = 0;
  let maxW = 0;
  let curL = 0;
  let maxL = 0;
  for (const t of trades) {
    if (t.pnlUsd > 0) {
      curW++;
      curL = 0;
      if (curW > maxW) maxW = curW;
    } else if (t.pnlUsd < 0) {
      curL++;
      curW = 0;
      if (curL > maxL) maxL = curL;
    }
  }

  const returns = trades.map((t) => (opts.initialBalance > 0 ? t.pnlUsd / opts.initialBalance : 0));
  const meanRet = returns.length ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / (returns.length - 1)
    : 0;
  const stdRet = Math.sqrt(variance);
  const sharpeEstimate = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(returns.length) : 0;

  const netReturnUsd = balance - opts.initialBalance;
  const metrics: BacktestMetrics = {
    initialBalance: opts.initialBalance,
    finalEquity: balance,
    netReturnUsd,
    netReturnPct: opts.initialBalance > 0 ? (netReturnUsd / opts.initialBalance) * 100 : 0,
    totalTrades: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRatePct: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0,
    grossProfitUsd: grossWins,
    grossLossUsd: grossLosses,
    maxDrawdownUsd,
    maxDrawdownPct,
    maxRunupUsd,
    maxRunupPct,
    expectancyUsd: trades.length > 0 ? netReturnUsd / trades.length : 0,
    avgWinUsd: wins.length > 0 ? grossWins / wins.length : 0,
    avgLossUsd: losses.length > 0 ? -(grossLosses / losses.length) : 0,
    totalFeesUsd: trades.reduce((s, t) => s + t.feesUsd, 0),
    longTrades: trades.filter((t) => t.direction === 'LONG').length,
    shortTrades: trades.filter((t) => t.direction === 'SHORT').length,
    maxConsecutiveWins: maxW,
    maxConsecutiveLosses: maxL,
    riskFreeCount: trades.filter((t) => t.riskFreeTriggered).length,
    sharpeEstimate,
  };

  const { monthlyBreakdown, dayOfWeekStats } = buildBacktestMatrices(trades, opts.initialBalance);

  return { metrics, trades, equityCurve, monthlyBreakdown, dayOfWeekStats };
}
