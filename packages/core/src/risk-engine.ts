import { decimalCmp, decimalDiv, decimalMul, quantizeDown } from './decimal.js';
import type { BotConfig, Direction, DollarinoSignal, InstrumentSpec } from './types.js';

export interface RiskGateInput {
  botState: 'STOPPED' | 'RUNNING_PAPER' | 'RUNNING_LIVE' | 'PAUSED_DAILY_LOSS';
  config: BotConfig;
  signal: DollarinoSignal;
  availableBalance: string;
  equity: string;
  todayRealizedPnl: string;
  openPositionsCount: number;
  instrument: InstrumentSpec;
  nowUtc?: Date;
}

export interface RiskGateDecision {
  approved: boolean;
  reasonCode: string;
  reasonMessage: string;
  effectiveLeverage: number;
  marginUsed: string;
  notionalValue: string;
  quantity: string;
  tp1Quantity: string;
  tp2Quantity: string;
  tp3Quantity: string;
}

export function validateSignalDirectionLevels(
  direction: Direction,
  entry: number,
  stopLoss: number,
  tp1: number,
  tp2?: number,
  tp3?: number
): { valid: boolean; error?: string } {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(stopLoss) || stopLoss <= 0 || !Number.isFinite(tp1) || tp1 <= 0) {
    return { valid: false, error: 'Entry, Stop Loss, and TP1 must be positive numbers' };
  }
  if (direction === 'LONG') {
    if (stopLoss >= entry) return { valid: false, error: 'LONG Stop Loss must be below entry price' };
    if (tp1 <= entry) return { valid: false, error: 'LONG TP1 must be above entry price' };
    if (tp2 !== undefined && tp2 <= tp1) return { valid: false, error: 'LONG TP2 must be above TP1' };
    if (tp3 !== undefined && tp2 !== undefined && tp3 <= tp2) return { valid: false, error: 'LONG TP3 must be above TP2' };
  } else {
    if (stopLoss <= entry) return { valid: false, error: 'SHORT Stop Loss must be above entry price' };
    if (tp1 >= entry) return { valid: false, error: 'SHORT TP1 must be below entry price' };
    if (tp2 !== undefined && tp2 >= tp1) return { valid: false, error: 'SHORT TP2 must be below TP1' };
    if (tp3 !== undefined && tp2 !== undefined && tp3 >= tp2) return { valid: false, error: 'SHORT TP3 must be below TP2' };
  }
  return { valid: true };
}

export function evaluateRiskGates(input: RiskGateInput): RiskGateDecision {
  const emptyReject = (code: string, msg: string): RiskGateDecision => ({
    approved: false,
    reasonCode: code,
    reasonMessage: msg,
    effectiveLeverage: 1,
    marginUsed: '0',
    notionalValue: '0',
    quantity: '0',
    tp1Quantity: '0',
    tp2Quantity: '0',
    tp3Quantity: '0',
  });

  if (input.botState === 'PAUSED_DAILY_LOSS') {
    return emptyReject('PAUSED_DAILY_LOSS', 'Bot is paused due to hitting daily max loss limit');
  }

  const now = input.nowUtc ?? new Date();
  if (input.config.blockWeekends) {
    const day = now.getUTCDay();
    if (day === 0 || day === 6) {
      return emptyReject('WEEKEND_BLACKOUT', 'Weekend trading blackout is enabled');
    }
  }
  if (input.config.macroBlackout) {
    return emptyReject('MACRO_BLACKOUT', 'Macro news blackout switch is active');
  }

  if (input.openPositionsCount >= input.config.maxOpenPositions) {
    return emptyReject('MAX_OPEN_POSITIONS', `Max open positions (${input.config.maxOpenPositions}) reached`);
  }

  const equityNum = Number(input.equity);
  const pnlNum = Number(input.todayRealizedPnl);
  if (equityNum > 0 && pnlNum < 0 && input.config.dailyMaxLossPct > 0 && input.config.dailyMaxLossPct < 100) {
    const lossPct = (Math.abs(pnlNum) / equityNum) * 100;
    if (lossPct >= input.config.dailyMaxLossPct) {
      return emptyReject('DAILY_MAX_LOSS', `Daily loss ${lossPct.toFixed(2)}% reached limit ${input.config.dailyMaxLossPct}%`);
    }
  }

  const entry = Number(input.signal.price);
  const sl = Number(input.signal.stopLoss);
  const tp1 = Number(input.signal.tp1);
  const tp2 = input.signal.tp2 ? Number(input.signal.tp2) : undefined;
  const tp3 = input.signal.tp3 ? Number(input.signal.tp3) : undefined;
  const levelCheck = validateSignalDirectionLevels(input.signal.direction, entry, sl, tp1, tp2, tp3);
  if (!levelCheck.valid) {
    return emptyReject('INVALID_LEVELS', levelCheck.error ?? 'Invalid price levels');
  }

  if (input.instrument.status !== 'OPEN') {
    return emptyReject('SYMBOL_HALTED', `Instrument ${input.instrument.symbol} is not open for trading`);
  }

  const marketType = input.config.marketType ?? 'FUTURES';
  const directionMode = input.config.directionMode ?? 'BOTH';

  if (directionMode === 'LONG_ONLY' && input.signal.direction === 'SHORT') {
    return emptyReject('DIRECTION_FILTERED', 'Bot direction mode is set to LONG_ONLY');
  }
  if (directionMode === 'SHORT_ONLY' && input.signal.direction === 'LONG') {
    return emptyReject('DIRECTION_FILTERED', 'Bot direction mode is set to SHORT_ONLY');
  }
  if (marketType === 'SPOT' && input.signal.direction === 'SHORT') {
    return emptyReject('SPOT_NO_MARGIN_SHORT', 'Spot market only opens BUY (LONG) positions and sells held inventory on TP/SL');
  }

  const requestedLev = input.config.useSignalLeverage ? input.signal.leverage : input.config.maxLeverage;
  const effectiveLeverage = marketType === 'SPOT'
    ? 1
    : Math.max(
        input.instrument.minLeverage,
        Math.min(requestedLev, input.config.maxLeverage, input.instrument.maxLeverage)
      );

  // Margin allocation: configurable % of available futures margin (default 10%)
  const marginPctDecimal = Math.max(0.5, Math.min(100, input.config.marginPct)) / 100;
  const marginUsed = quantizeDown(
    decimalMul(input.availableBalance, marginPctDecimal.toFixed(4), 6),
    input.instrument.quotePrecision
  );

  if (decimalCmp(marginUsed, '1') < 0) {
    return emptyReject('INSUFFICIENT_MARGIN', `Allocated margin (${marginUsed} USDT) is below minimum 1 USDT`);
  }

  const notionalValue = decimalMul(marginUsed, effectiveLeverage, input.instrument.quotePrecision);
  if (input.instrument.minNotional && decimalCmp(notionalValue, input.instrument.minNotional) < 0) {
    return emptyReject('MIN_NOTIONAL', `Notional ${notionalValue} is below exchange minimum ${input.instrument.minNotional}`);
  }

  const rawQty = decimalDiv(notionalValue, input.signal.price, input.instrument.basePrecision);
  const quantity = quantizeDown(rawQty, input.instrument.basePrecision);

  if (decimalCmp(quantity, input.instrument.minTradeVolume) < 0) {
    return emptyReject(
      'MIN_QUANTITY',
      `Calculated quantity (${quantity}) is below minimum trade size (${input.instrument.minTradeVolume})`
    );
  }

  const tp1Pct = input.config.tp1ClosePct / 100;
  const tp2Pct = input.signal.tp2 ? input.config.tp2ClosePct / 100 : 0;

  const tp1Quantity = quantizeDown(decimalMul(quantity, tp1Pct.toFixed(4), 8), input.instrument.basePrecision);
  const tp2Quantity = tp2Pct > 0
    ? quantizeDown(decimalMul(quantity, tp2Pct.toFixed(4), 8), input.instrument.basePrecision)
    : '0';

  const usedSoFar = Number(tp1Quantity) + Number(tp2Quantity);
  const rem = Math.max(0, Number(quantity) - usedSoFar);
  const tp3Quantity = quantizeDown(rem.toFixed(input.instrument.basePrecision + 2), input.instrument.basePrecision);

  return {
    approved: true,
    reasonCode: 'APPROVED',
    reasonMessage: 'All Dollarino risk gates passed',
    effectiveLeverage,
    marginUsed,
    notionalValue,
    quantity,
    tp1Quantity,
    tp2Quantity,
    tp3Quantity,
  };
}
