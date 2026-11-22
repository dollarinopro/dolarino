import type { Candle, CustomIndicatorDefinition } from './types.js';

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i] ?? 0;
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const val = values[i] ?? prev;
    prev = (val - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (delta >= 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = (values[i] ?? 0) - (values[i - 1] ?? 0);
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;

  const tr = new Array<number>(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i === 0) {
      tr[i] = c.high - c.low;
    } else {
      const prevClose = candles[i - 1]!.close;
      tr[i] = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      );
    }
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i] ?? 0;
  let prev = sum / period;
  out[period] = prev;

  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + (tr[i] ?? 0)) / period;
    out[i] = prev;
  }
  return out;
}

export function bollingerBands(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i]!;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = (values[j] ?? m) - m;
      variance += diff * diff;
    }
    const std = Math.sqrt(variance / period);
    upper[i] = m + mult * std;
    lower[i] = m - mult * std;
  }
  return { upper, mid, lower };
}

/**
 * Strictly causal pivot detection: pivot at bar `i - rightBars` is ONLY confirmed
 * once bar `i` closes (never lookahead!).
 */
export function causalSwingLevels(candles: Candle[], leftBars = 3, rightBars = 2) {
  const confirmedHighs = new Array<number>(candles.length).fill(NaN);
  const confirmedLows = new Array<number>(candles.length).fill(NaN);
  let lastHigh = NaN;
  let lastLow = NaN;

  for (let i = leftBars + rightBars; i < candles.length; i++) {
    const pivotIdx = i - rightBars;
    const pivot = candles[pivotIdx]!;
    let isHigh = true;
    let isLow = true;
    for (let j = pivotIdx - leftBars; j <= i; j++) {
      if (j === pivotIdx) continue;
      if ((candles[j]?.high ?? -Infinity) >= pivot.high) isHigh = false;
      if ((candles[j]?.low ?? Infinity) <= pivot.low) isLow = false;
    }
    if (isHigh) lastHigh = pivot.high;
    if (isLow) lastLow = pivot.low;
    confirmedHighs[i] = lastHigh;
    confirmedLows[i] = lastLow;
  }

  return { confirmedHighs, confirmedLows };
}

/**
 * Extensible Registry for user-ported TradingView Pine Script indicators.
 */
const customIndicators = new Map<string, CustomIndicatorDefinition>();

export function registerCustomIndicator(def: CustomIndicatorDefinition): void {
  customIndicators.set(def.id, def);
}

export function listCustomIndicators(): CustomIndicatorDefinition[] {
  return Array.from(customIndicators.values());
}

export function getCustomIndicator(id: string): CustomIndicatorDefinition | undefined {
  return customIndicators.get(id);
}
