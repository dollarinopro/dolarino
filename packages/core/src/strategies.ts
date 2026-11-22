import { atr, bollingerBands, causalSwingLevels, ema, getCustomIndicator, rsi } from './indicators.js';
import { computeKbosV11Detailed } from './kiya-bot.js';
import type {
  Candle,
  DollarinoSignal,
  KbosParams,
  SignalMixerChannelScore,
  SignalMixerResult,
  SignalMixerWeights,
  StrategyKey,
  StrategySignalOutput,
  Timeframe,
} from './types.js';

export const DEFAULT_MIXER_WEIGHTS: SignalMixerWeights = {
  trend: 20,
  momentum: 15,
  liquiditySweep: 20,
  fvg: 15,
  volatility: 10,
  volume: 10,
  structure: 5,
  meanReversion: 5,
};

export function timeframeToMs(tf: Timeframe | string): number {
  const map: Record<string, number> = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '30': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
  };
  return map[tf] ?? 900_000;
}

export function selectClosedCandles(candles: Candle[], tf: Timeframe | string, nowMs = Date.now()): Candle[] {
  const duration = timeframeToMs(tf);
  return candles.filter((c) => c.timestamp + duration <= nowMs);
}

export function alignHigherTimeframeTrends(
  ltfCandles: Candle[],
  ltfMs: number,
  htfCandles: Candle[],
  htfMs: number
): Array<'BULLISH' | 'BEARISH' | 'NEUTRAL'> {
  const htfCloses = htfCandles.map((c) => c.close);
  const fast = ema(htfCloses, 50);
  const slow = ema(htfCloses, 200);
  const fast20 = ema(htfCloses, 20);

  let hIdx = -1;
  return ltfCandles.map((ltf) => {
    const ltfCloseTime = ltf.timestamp + ltfMs;
    while (hIdx + 1 < htfCandles.length && htfCandles[hIdx + 1]!.timestamp + htfMs <= ltfCloseTime) {
      hIdx++;
    }
    if (hIdx < 0) return 'NEUTRAL';
    const f = Number.isFinite(slow[hIdx]) ? fast[hIdx] : fast20[hIdx];
    const s = Number.isFinite(slow[hIdx]) ? slow[hIdx] : fast[hIdx];
    if (!Number.isFinite(f) || !Number.isFinite(s)) return 'NEUTRAL';
    if (f! > s!) return 'BULLISH';
    if (f! < s!) return 'BEARISH';
    return 'NEUTRAL';
  });
}

function median(vals: number[]): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function computeAdx14(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(20);
  if (n < 20) return out;
  const len = 14;
  let smTr = 0;
  let smPlus = 0;
  let smMinus = 0;
  let adxSm = 20;
  for (let i = 1; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    const dmPlus = c.high - p.high > p.low - c.low ? Math.max(c.high - p.high, 0) : 0;
    const dmMinus = p.low - c.low > c.high - p.high ? Math.max(p.low - c.low, 0) : 0;
    smTr = smTr - smTr / len + tr;
    smPlus = smPlus - smPlus / len + dmPlus;
    smMinus = smMinus - smMinus / len + dmMinus;
    const dip = smTr > 0 ? (smPlus / smTr) * 100 : 0;
    const dim = smTr > 0 ? (smMinus / smTr) * 100 : 0;
    const sum = dip + dim;
    const dx = sum > 0 ? (Math.abs(dip - dim) / sum) * 100 : 0;
    adxSm = i < len ? dx : (adxSm * (len - 1) + dx) / len;
    out[i] = adxSm;
  }
  return out;
}

function build3TpLevels(direction: 'LONG' | 'SHORT', entry: number, riskDist: number) {
  const risk = Math.max(riskDist, entry * 0.0045);
  if (direction === 'LONG') {
    return {
      stopLoss: entry - risk,
      tp1: entry + risk * 1.2,
      tp2: entry + risk * 2.2,
      tp3: entry + risk * 3.5,
    };
  }
  return {
    stopLoss: entry + risk,
    tp1: entry - risk * 1.2,
    tp2: entry - risk * 2.2,
    tp3: entry - risk * 3.5,
  };
}

/**
 * Computes TimeTrade's 8-channel Weighted Signal Mixer at the latest closed bar index.
 * Continuous trend/momentum/volume/structure scoring + event catalysts (Liquidity Sweep / FVG)
 * so strong confluent setups cleanly exceed threshold=65 without being diluted by inactive event channels.
 */
export function evaluateSignalMixerAtBar(
  candles: Candle[],
  idx: number,
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  weights: SignalMixerWeights = DEFAULT_MIXER_WEIGHTS,
  threshold = 65
): SignalMixerResult {
  if (idx < 30 || idx >= candles.length) {
    return { compositeScore: 0, confidence: 0, direction: 'NONE', channels: [] };
  }
  const slice = candles.slice(Math.max(0, idx - 220), idx + 1);
  const localIdx = slice.length - 1;
  const closes = slice.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsiArr = rsi(closes, 14);
  const atrArr = atr(slice, 14);
  const bb = bollingerBands(closes, 20, 2);
  const swings = causalSwingLevels(slice, 3, 2);

  const c = slice[localIdx]!;
  const prev = slice[localIdx - 1]!;
  const prev2 = slice[localIdx - 2]!;
  const e20 = ema20[localIdx] ?? c.close;
  const e50 = ema50[localIdx] ?? c.close;
  const e20Prev = ema20[Math.max(0, localIdx - 3)] ?? e20;
  const r = rsiArr[localIdx] ?? 50;
  const rPrev = rsiArr[localIdx - 1] ?? 50;
  const a = atrArr[localIdx] ?? c.close * 0.006;

  // 1. Trend (-100..+100): HTF alignment + EMA20/50 + EMA20 slope
  const slopeSign = e20 > e20Prev ? 25 : e20 < e20Prev ? -25 : 0;
  const trendRaw =
    (htfTrend === 'BULLISH' ? 45 : htfTrend === 'BEARISH' ? -45 : 0) +
    (e20 > e50 ? 30 : e20 < e50 ? -30 : 0) +
    slopeSign;

  // 2. Momentum (-100..+100): healthy directional RSI & expansion
  let momentumRaw = 0;
  if (r >= 53 && r <= 70 && r >= rPrev - 1) momentumRaw = 85;
  else if (r <= 47 && r >= 30 && r <= rPrev + 1) momentumRaw = -85;
  else if (c.close > prev.high && r < 74) momentumRaw = 60;
  else if (c.close < prev.low && r > 26) momentumRaw = -60;

  // 3. Liquidity Sweep (check last 3 bars so sweep+followthrough aligns)
  let sweepRaw = 0;
  for (let k = localIdx; k >= Math.max(3, localIdx - 2); k--) {
    const bar = slice[k]!;
    const swLow = swings.confirmedLows[k - 1];
    const swHigh = swings.confirmedHighs[k - 1];
    if (Number.isFinite(swLow) && bar.low < swLow! && bar.close > swLow!) {
      sweepRaw = k === localIdx ? 95 : 65;
      break;
    }
    if (Number.isFinite(swHigh) && bar.high > swHigh! && bar.close < swHigh!) {
      sweepRaw = k === localIdx ? -95 : -65;
      break;
    }
  }

  // 4. Fair Value Gap / Imbalance (check last 2 bars)
  let fvgRaw = 0;
  if (c.low > prev2.high && prev.close > prev.open) fvgRaw = 90;
  else if (c.high < prev2.low && prev.close < prev.open) fvgRaw = -90;
  else if (c.close > prev.high && c.close > c.open && prev.close > prev.open) fvgRaw = 45;
  else if (c.close < prev.low && c.close < c.open && prev.close < prev.open) fvgRaw = -45;

  // 5. Volatility Regime (healthy ATR% 0.15% - 3.0% aligned with bar direction)
  const atrPct = (a / Math.max(1e-9, c.close)) * 100;
  const volRegimeRaw = atrPct >= 0.15 && atrPct <= 3.0 ? (c.close > c.open ? 75 : c.close < c.open ? -75 : 0) : 0;

  // 6. Volume Surge
  const recentVols = slice.slice(-20).map((x) => x.volume);
  const medVol = Math.max(1e-9, median(recentVols));
  const volRatio = c.volume / medVol;
  const volRaw =
    volRatio >= 1.25
      ? c.close >= c.open
        ? 90
        : -90
      : volRatio >= 0.9
        ? c.close >= c.open
          ? 55
          : -55
        : 0;

  // 7. Structure (Body Ratio & Close position)
  const range = Math.max(1e-9, c.high - c.low);
  const bodyRatio = Math.abs(c.close - c.open) / range;
  const closePos = (c.close - c.low) / range;
  const structureRaw =
    bodyRatio >= 0.5 && closePos >= 0.65 && c.close > c.open
      ? 85
      : bodyRatio >= 0.5 && closePos <= 0.35 && c.close < c.open
        ? -85
        : 0;

  // 8. Mean Reversion (Bollinger pullbacks — do not penalize strong aligned trend breakouts)
  const lower = bb.lower[localIdx];
  const upper = bb.upper[localIdx];
  const mid = bb.mid[localIdx];
  let mrRaw = 0;
  if (Number.isFinite(lower) && c.low <= lower! * 1.002 && c.close > c.open) mrRaw = 80;
  else if (Number.isFinite(upper) && c.high >= upper! * 0.998 && c.close < c.open) mrRaw = -80;
  else if (Number.isFinite(mid) && trendRaw >= 50 && c.low <= mid! && c.close > mid!) mrRaw = 65;
  else if (Number.isFinite(mid) && trendRaw <= -50 && c.high >= mid! && c.close < mid!) mrRaw = -65;

  const channels: SignalMixerChannelScore[] = [
    { key: 'trend', label: 'HTF & EMA Trend', score: trendRaw, weight: weights.trend },
    { key: 'momentum', label: 'RSI & Breakout Momentum', score: momentumRaw, weight: weights.momentum },
    { key: 'liquiditySweep', label: 'Liquidity Sweep', score: sweepRaw, weight: weights.liquiditySweep },
    { key: 'fvg', label: 'Fair Value Gap (FVG)', score: fvgRaw, weight: weights.fvg },
    { key: 'volatility', label: 'ATR Volatility Regime', score: volRegimeRaw, weight: weights.volatility },
    { key: 'volume', label: 'Volume Surge', score: volRaw, weight: weights.volume },
    { key: 'structure', label: 'Candle Body Structure', score: structureRaw, weight: weights.structure },
    { key: 'meanReversion', label: 'BB Pullback / Reversion', score: mrRaw, weight: weights.meanReversion },
  ];

  // Active-weighted normalization across core pillars + triggered catalysts
  // Continuous baseline pillars always count; event catalysts boost when active or gently dampen if completely absent.
  const activeWeight = channels.reduce(
    (s, ch) => s + (ch.score !== 0 ? ch.weight : ch.key === 'liquiditySweep' || ch.key === 'fvg' || ch.key === 'meanReversion' ? ch.weight * 0.25 : ch.weight),
    0
  );
  const denom = Math.max(1, activeWeight);
  const compositeScore = channels.reduce((s, ch) => s + ch.score * ch.weight, 0) / denom;
  const confidence = Math.min(100, Math.round(Math.abs(compositeScore)));
  // Respect HTF directional bias unless extraordinary counter-trend liquidity sweep + MR confluence occurs
  const htfConflict =
    (compositeScore > 0 && htfTrend === 'BEARISH' && !(sweepRaw > 0 && mrRaw > 0)) ||
    (compositeScore < 0 && htfTrend === 'BULLISH' && !(sweepRaw < 0 && mrRaw < 0));
  const direction = !htfConflict && confidence >= threshold ? (compositeScore > 0 ? 'LONG' : 'SHORT') : 'NONE';

  return { compositeScore, confidence, direction, channels };
}

export interface StrategyParams {
  kbosParams?: Partial<KbosParams>;
  mixerWeights?: SignalMixerWeights;
  mixerThreshold?: number;
  [key: string]: number | Partial<KbosParams> | SignalMixerWeights | undefined;
}

export function computeStrategySignals(
  strategyKey: StrategyKey,
  ltfCandles: Candle[],
  htfCandles: Candle[] = [],
  timeframe: Timeframe = '15m',
  higherTimeframe: Timeframe = '1h',
  params: StrategyParams = {}
): StrategySignalOutput[] {
  if (ltfCandles.length < 30) return [];

  if (strategyKey === 'kbos_v11') {
    return computeKbosV11Detailed(ltfCandles, timeframe, params.kbosParams ?? (params as Partial<KbosParams>)).outputs;
  }

  const custom = getCustomIndicator(strategyKey);
  if (custom) {
    return custom.compute(ltfCandles, params as Record<string, number>);
  }

  const closes = ltfCandles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema60 = ema(closes, 60);
  const ema200 = ema(closes, 200);
  const rsiVals = rsi(closes, Number(params.rsiPeriod ?? 14));
  const atrVals = atr(ltfCandles, Number(params.atrPeriod ?? 14));
  const adxVals = computeAdx14(ltfCandles);
  const bb = bollingerBands(closes, 20, 2);
  const swings = causalSwingLevels(ltfCandles, 3, 2);

  const ltfMs = timeframeToMs(timeframe);
  const htfMs = timeframeToMs(higherTimeframe);
  const htfTrend =
    htfCandles.length >= 25
      ? alignHigherTimeframeTrends(ltfCandles, ltfMs, htfCandles, htfMs)
      : ltfCandles.map((_, i) => {
          const f = ema20[i];
          const s = ema50[i];
          if (!Number.isFinite(f) || !Number.isFinite(s)) return 'NEUTRAL' as const;
          return f! > s! ? ('BULLISH' as const) : f! < s! ? ('BEARISH' as const) : ('NEUTRAL' as const);
        });

  const kbosDetailed = strategyKey === 'dollarino_v01'
    ? computeKbosV11Detailed(ltfCandles, timeframe, params.kbosParams ?? (params as Partial<KbosParams>))
    : null;

  const outputs: StrategySignalOutput[] = [];
  let testFired = false;
  let lastSignalBar = -10;

  for (let i = 0; i < ltfCandles.length; i++) {
    const c = ltfCandles[i]!;
    const prev = i > 0 ? ltfCandles[i - 1]! : c;
    const f20 = ema20[i] ?? c.close;
    const f50 = ema50[i] ?? c.close;
    const f60 = ema60[i] ?? f50;
    const f200 = ema200[i];
    const r = rsiVals[i] ?? 50;
    const a = Number.isFinite(atrVals[i]) ? atrVals[i]! : c.close * 0.008;
    const adx = adxVals[i] ?? 20;
    const trend = htfTrend[i] ?? 'NEUTRAL';
    const range = Math.max(1e-9, c.high - c.low);
    const body = Math.abs(c.close - c.open);
    const closePos = (c.close - c.low) / range;

    let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    let reason = 'No setup';
    let riskDist = a * 1.8;
    let entryLegs: StrategySignalOutput['entryLegs'];

    if (strategyKey === 'dollarino_v01' && i >= 35 && i - lastSignalBar >= 5) {
      // Dollarino V0.1 — Proprietary Multi-Pillar Master Strategy combining ALL engines:
      // 1) KBOs Super v11 + DEMA-ATR + 8-Band Golden-Ratio ALMA Ribbon
      // 2) SP2L Liquidity Sweep & Spike-2Leg Reclaim
      // 3) EMA 20/50/200 Pullback & Donchian Breakout + BB Mean Reversion
      // 4) 8-Channel Weighted Signal Mixer
      const kOut = kbosDetailed?.outputs[i];
      const demaTrend = kbosDetailed?.demaAtr[i]?.trend ?? 'NEUTRAL';
      const ribFast = kbosDetailed?.almaRibbon.series[7]?.[i];
      const ribMid = kbosDetailed?.almaRibbon.series[3]?.[i];
      const medVol = Math.max(1e-9, median(ltfCandles.slice(i - 20, i).map((x) => x.volume)));
      const volOk = c.volume >= medVol * 0.85;
      const atrPct = (a / Math.max(1e-9, c.close)) * 100;
      const healthyVolRegime = atrPct >= 0.12 && atrPct <= 3.5;

      const weights = params.mixerWeights ?? DEFAULT_MIXER_WEIGHTS;
      const mix = evaluateSignalMixerAtBar(ltfCandles, i, trend, weights, 55);

      const swLow = swings.confirmedLows[i - 1];
      const swHigh = swings.confirmedHighs[i - 1];
      const bullSweep = Number.isFinite(swLow) && c.low < swLow! && c.close > swLow! && c.close > c.open;
      const bearSweep = Number.isFinite(swHigh) && c.high > swHigh! && c.close < swHigh! && c.close < c.open;

      const lowerBb = bb.lower[i];
      const upperBb = bb.upper[i];
      const bullPullback =
        (Math.min(c.low, prev.low) <= f20 * 1.002 && c.close > f20 && c.close > c.open && closePos >= 0.55) ||
        (Number.isFinite(lowerBb) && Math.min(c.low, prev.low) <= lowerBb! * 1.002 && c.close > c.open && r <= 50);
      const bearPullback =
        (Math.max(c.high, prev.high) >= f20 * 0.998 && c.close < f20 && c.close < c.open && closePos <= 0.45) ||
        (Number.isFinite(upperBb) && Math.max(c.high, prev.high) >= upperBb! * 0.998 && c.close < c.open && r >= 50);

      const high20 = Math.max(...ltfCandles.slice(i - 20, i).map((x) => x.high));
      const low20 = Math.min(...ltfCandles.slice(i - 20, i).map((x) => x.low));
      const bullBreak = c.close > high20 && prev.close <= high20 && c.volume >= medVol * 1.15 && closePos >= 0.6;
      const bearBreak = c.close < low20 && prev.close >= low20 && c.volume >= medVol * 1.15 && closePos <= 0.4;

      const macroBull = !Number.isFinite(f200) || c.close >= f200! * 0.994;
      const macroBear = !Number.isFinite(f200) || c.close <= f200! * 1.006;
      const ribbonBull = Number.isFinite(ribFast) && Number.isFinite(ribMid) ? ribFast! >= ribMid! * 0.999 : f20 > f50;
      const ribbonBear = Number.isFinite(ribFast) && Number.isFinite(ribMid) ? ribFast! <= ribMid! * 1.001 : f20 < f50;

      let bullScore = 0;
      const bullTags: string[] = [];
      if (trend === 'BULLISH') { bullScore += 20; bullTags.push('HTF'); }
      if (demaTrend === 'BULL' && ribbonBull) { bullScore += 18; bullTags.push('DEMA-Ribbon'); }
      if (kOut?.signal === 'LONG') { bullScore += 28; bullTags.push('KBOs-v11'); }
      if (bullSweep) { bullScore += 24; bullTags.push('SP2L-Sweep'); }
      if (bullPullback) { bullScore += 20; bullTags.push('EMA/BB-Bounce'); }
      if (bullBreak) { bullScore += 18; bullTags.push('Breakout'); }
      if (mix.compositeScore >= 45) { bullScore += 20; bullTags.push(`Mixer(${mix.confidence}%)`); }

      let bearScore = 0;
      const bearTags: string[] = [];
      if (trend === 'BEARISH') { bearScore += 20; bearTags.push('HTF'); }
      if (demaTrend === 'BEAR' && ribbonBear) { bearScore += 18; bearTags.push('DEMA-Ribbon'); }
      if (kOut?.signal === 'SHORT') { bearScore += 28; bearTags.push('KBOs-v11'); }
      if (bearSweep) { bearScore += 24; bearTags.push('SP2L-Sweep'); }
      if (bearPullback) { bearScore += 20; bearTags.push('EMA/BB-Reject'); }
      if (bearBreak) { bearScore += 18; bearTags.push('Breakdown'); }
      if (mix.compositeScore <= -45) { bearScore += 20; bearTags.push(`Mixer(${mix.confidence}%)`); }

      const notOverExtendedLong = c.close - f20 <= a * 1.85 && r >= 34 && r <= 69;
      const notOverExtendedShort = f20 - c.close <= a * 1.85 && r >= 31 && r <= 66;

      if (
        healthyVolRegime &&
        volOk &&
        adx >= 17 &&
        macroBull &&
        bullScore >= 62 &&
        bullScore > bearScore + 20 &&
        notOverExtendedLong &&
        (bullPullback || bullSweep || bullBreak || kOut?.signal === 'LONG' || mix.direction === 'LONG')
      ) {
        signal = 'LONG';
        const swingStop = Number.isFinite(swLow) && c.close - swLow! <= a * 3.2 ? c.close - swLow! + a * 0.35 : 0;
        riskDist = Math.max(a * 1.9, swingStop);
        reason = `Dollarino V0.1 (${bullScore}pts: ${bullTags.join(' + ')})`;
      } else if (
        healthyVolRegime &&
        volOk &&
        adx >= 17 &&
        macroBear &&
        bearScore >= 62 &&
        bearScore > bullScore + 20 &&
        notOverExtendedShort &&
        (bearPullback || bearSweep || bearBreak || kOut?.signal === 'SHORT' || mix.direction === 'SHORT')
      ) {
        signal = 'SHORT';
        const swingStop = Number.isFinite(swHigh) && swHigh! - c.close <= a * 3.2 ? swHigh! - c.close + a * 0.35 : 0;
        riskDist = Math.max(a * 1.9, swingStop);
        reason = `Dollarino V0.1 (${bearScore}pts: ${bearTags.join(' + ')})`;
      }
    } else if (strategyKey === 'test_strategy') {
      if (i >= 20 && !testFired) {
        signal = params.testDirection === -1 ? 'SHORT' : 'LONG';
        reason = 'TestStrategy diagnostic 1-shot verified signal';
        testFired = true;
      }
    } else if ((strategyKey === 'sp2l' || strategyKey === 'dollarino_tv_hybrid') && i >= 26) {
      // Causal SP2L Spike-2Leg + Liquidity Sweep reclaim
      const b1 = ltfCandles[i - 3]!;
      const b2 = ltfCandles[i - 2]!;
      const b3 = ltfCandles[i - 1]!;
      const pre = ltfCandles[i - 4]!;
      const lookbackHigh = Math.max(...ltfCandles.slice(Math.max(0, i - 24), i - 3).map((x) => x.high));
      const lookbackLow = Math.min(...ltfCandles.slice(Math.max(0, i - 24), i - 3).map((x) => x.low));
      const spikeBody = Math.abs(b2.close - b2.open) / Math.max(1e-9, b2.high - b2.low);

      const bullSpike =
        b1.low <= b2.low &&
        b2.low <= b3.low &&
        b3.high - b1.low >= a * 1.4 &&
        b2.close > lookbackHigh &&
        spikeBody >= 0.55 &&
        b2.low > pre.high;

      const bearSpike =
        b1.high >= b2.high &&
        b2.high >= b3.high &&
        b1.high - b3.low >= a * 1.4 &&
        b2.close < lookbackLow &&
        spikeBody >= 0.55 &&
        b2.high < pre.low;

      if (bullSpike && c.low < b3.low && c.close > b1.low && c.close - f20 <= a * 1.75 && trend === 'BULLISH') {
        signal = 'LONG';
        riskDist = Math.max(a * 1.8, c.close - (b1.low - a * 0.3));
        entryLegs = [
          { label: 'Entry 1 (Retest)', price: b3.low, weight: 1 },
          { label: 'Entry 2 (EMA60)', price: f60, weight: 2 },
        ];
        reason = 'SP2L Spike-2Leg bullish breakout + pressure gap + pullback trigger';
      } else if (bearSpike && c.high > b3.high && c.close < b1.high && f20 - c.close <= a * 1.75 && trend === 'BEARISH') {
        signal = 'SHORT';
        riskDist = Math.max(a * 1.8, b1.high + a * 0.3 - c.close);
        entryLegs = [
          { label: 'Entry 1 (Retest)', price: b3.high, weight: 1 },
          { label: 'Entry 2 (EMA60)', price: f60, weight: 2 },
        ];
        reason = 'SP2L Spike-2Leg bearish breakdown + pressure gap + pullback trigger';
      } else {
        const swLow = swings.confirmedLows[i - 1];
        const swHigh = swings.confirmedHighs[i - 1];
        if (trend === 'BULLISH' && adx >= 18 && Number.isFinite(swLow) && c.low < swLow! && c.close > swLow! && c.close > f20 && c.close > c.open && r >= 40 && r <= 65) {
          signal = 'LONG';
          riskDist = Math.max(a * 2.0, c.close - c.low + a * 0.4);
          reason = 'SP2L liquidity sweep & close reclaim';
        } else if (trend === 'BEARISH' && adx >= 18 && Number.isFinite(swHigh) && c.high > swHigh! && c.close < swHigh! && c.close < f20 && c.close < c.open && r >= 35 && r <= 60) {
          signal = 'SHORT';
          riskDist = Math.max(a * 2.0, c.high - c.close + a * 0.4);
          reason = 'SP2L liquidity sweep & close rejection';
        }
      }
    } else if (strategyKey === 'grid_strategy' && i >= 35 && i - lastSignalBar >= 4) {
      // Bounded Bollinger + RSI Exhaustion Pullback (works cleanly with or without EMA200 warmup)
      const atrPct = (a / Math.max(1e-9, c.close)) * 100;
      const lower = bb.lower[i];
      const upper = bb.upper[i];
      const macroOkLong = !Number.isFinite(f200) || c.close >= f200! * 0.985 || adx < 26;
      const macroOkShort = !Number.isFinite(f200) || c.close <= f200! * 1.015 || adx < 26;

      if (atrPct >= 0.15 && atrPct <= 3.2 && Number.isFinite(lower) && Number.isFinite(upper)) {
        const touchedLower = prev.low <= lower! * 1.002 || c.low <= lower! * 1.002;
        const touchedUpper = prev.high >= upper! * 0.998 || c.high >= upper! * 0.998;
        if (touchedLower && c.close > c.open && closePos >= 0.55 && r >= 26 && r <= 48 && trend !== 'BEARISH' && macroOkLong) {
          signal = 'LONG';
          riskDist = Math.max(a * 2.0, c.close - Math.min(c.low, prev.low) + a * 0.4);
          entryLegs = [
            { label: 'Grid Layer 1', price: c.close, weight: 1 },
            { label: 'Grid Layer 2 (-1 ATR)', price: c.close - a, weight: 1 },
          ];
          reason = 'Grid BB lower band exhaustion bounce (RSI + ATR bounded)';
        } else if (touchedUpper && c.close < c.open && closePos <= 0.45 && r >= 52 && r <= 74 && trend !== 'BULLISH' && macroOkShort) {
          signal = 'SHORT';
          riskDist = Math.max(a * 2.0, Math.max(c.high, prev.high) - c.close + a * 0.4);
          entryLegs = [
            { label: 'Grid Layer 1', price: c.close, weight: 1 },
            { label: 'Grid Layer 2 (+1 ATR)', price: c.close + a, weight: 1 },
          ];
          reason = 'Grid BB upper band exhaustion rejection (RSI + ATR bounded)';
        }
      }
    } else if (strategyKey === 'ema_trend_pullback' && i >= 55 && i - lastSignalBar >= 4) {
      const slope50 = f50 - (ema50[i - 8] ?? f50);
      const medVol = median(ltfCandles.slice(i - 20, i).map((x) => x.volume));
      const macroBull = !Number.isFinite(f200) || c.close > f200!;
      const macroBear = !Number.isFinite(f200) || c.close < f200!;

      if (
        trend === 'BULLISH' &&
        macroBull &&
        f20 > f50 &&
        slope50 > 0 &&
        adx >= 18 &&
        Math.min(c.low, prev.low) <= f20 * 1.0015 &&
        c.close > f20 &&
        c.close > c.open &&
        closePos >= 0.58 &&
        c.volume >= medVol * 0.85 &&
        r >= 44 &&
        r <= 66
      ) {
        signal = 'LONG';
        riskDist = Math.max(a * 1.8, c.close - Math.min(c.low, prev.low) + a * 0.4);
        reason = 'EMA 20/50/200 aligned trend pullback bullish rejection';
      } else if (
        trend === 'BEARISH' &&
        macroBear &&
        f20 < f50 &&
        slope50 < 0 &&
        adx >= 18 &&
        Math.max(c.high, prev.high) >= f20 * 0.9985 &&
        c.close < f20 &&
        c.close < c.open &&
        closePos <= 0.42 &&
        c.volume >= medVol * 0.85 &&
        r >= 34 &&
        r <= 56
      ) {
        signal = 'SHORT';
        riskDist = Math.max(a * 1.8, Math.max(c.high, prev.high) - c.close + a * 0.4);
        reason = 'EMA 20/50/200 aligned trend pullback bearish rejection';
      }
    } else if (strategyKey === 'vibe_4h_daily_breakout' && i >= 25 && i - lastSignalBar >= 6) {
      const high20 = Math.max(...ltfCandles.slice(i - 20, i).map((x) => x.high));
      const low20 = Math.min(...ltfCandles.slice(i - 20, i).map((x) => x.low));
      const medVol = median(ltfCandles.slice(i - 20, i).map((x) => x.volume));
      if (trend === 'BULLISH' && f20 > f50 && c.close > high20 && prev.close <= high20 && c.volume >= medVol * 1.25 && adx >= 18 && closePos >= 0.6 && r >= 50 && r <= 70) {
        signal = 'LONG';
        riskDist = a * 2.3;
        reason = 'Donchian 20-bar bullish breakout + volume expansion';
      } else if (trend === 'BEARISH' && f20 < f50 && c.close < low20 && prev.close >= low20 && c.volume >= medVol * 1.25 && adx >= 18 && closePos <= 0.4 && r >= 30 && r <= 50) {
        signal = 'SHORT';
        riskDist = a * 2.3;
        reason = 'Donchian 20-bar bearish breakdown + volume expansion';
      }
    } else if (strategyKey === 'vibe_4h_candle_confirmation' && i >= 25 && i - lastSignalBar >= 5) {
      const medVol = median(ltfCandles.slice(i - 20, i).map((x) => x.volume));
      const high3 = Math.max(...ltfCandles.slice(i - 3, i).map((x) => x.high));
      const low3 = Math.min(...ltfCandles.slice(i - 3, i).map((x) => x.low));
      if (
        trend === 'BULLISH' &&
        f20 > f50 &&
        adx >= 18 &&
        body >= a * 0.75 &&
        c.close - f20 <= a * 1.6 &&
        c.close > high3 &&
        c.volume >= medVol * 1.15 &&
        closePos >= 0.68 &&
        r >= 50 &&
        r <= 67
      ) {
        signal = 'LONG';
        riskDist = a * 2.1;
        reason = 'Momentum displacement bullish confirmation';
      } else if (
        trend === 'BEARISH' &&
        f20 < f50 &&
        adx >= 18 &&
        body >= a * 0.75 &&
        f20 - c.close <= a * 1.6 &&
        c.close < low3 &&
        c.volume >= medVol * 1.15 &&
        closePos <= 0.32 &&
        r >= 33 &&
        r <= 50
      ) {
        signal = 'SHORT';
        riskDist = a * 2.1;
        reason = 'Momentum displacement bearish confirmation';
      }
    } else if (strategyKey === 'signal_mixer' && i >= 35 && i - lastSignalBar >= 6) {
      const weights = params.mixerWeights ?? DEFAULT_MIXER_WEIGHTS;
      const threshold = Number(params.mixerThreshold ?? 65);
      const mix = evaluateSignalMixerAtBar(ltfCandles, i, trend, weights, threshold);
      const notExtended =
        mix.direction === 'LONG'
          ? c.close - f20 <= a * 1.35 && r <= 67
          : mix.direction === 'SHORT'
            ? f20 - c.close <= a * 1.35 && r >= 33
            : false;
      if (mix.direction !== 'NONE' && adx >= 18 && notExtended) {
        signal = mix.direction;
        riskDist = a * 2.1;
        reason = `Weighted Signal Mixer (${mix.confidence}% confidence)`;
      }
    }

    if (signal !== 'NONE') {
      lastSignalBar = i;
    }

    const levels = signal !== 'NONE' ? build3TpLevels(signal, c.close, riskDist) : undefined;
    outputs.push({
      timestamp: c.timestamp,
      closeTime: c.timestamp + ltfMs,
      trend,
      signal,
      reason,
      price: c.close,
      atr: a,
      rsi: r,
      stopLoss: levels?.stopLoss,
      tp1: levels?.tp1,
      tp2: levels?.tp2,
      tp3: levels?.tp3,
      entryLegs,
    });
  }

  return outputs;
}

export function strategyOutputToDollarinoSignal(
  symbol: string,
  timeframe: string,
  leverage: number,
  output: StrategySignalOutput,
  channelHandle = '@Dollarino_official',
  engineKey?: string
): DollarinoSignal | null {
  if (output.signal === 'NONE' || !output.stopLoss || !output.tp1) return null;
  const decimals = output.price >= 1000 ? 2 : output.price >= 1 ? 4 : 6;
  return {
    symbol,
    direction: output.signal,
    timeframe,
    price: output.price.toFixed(decimals),
    stopLoss: output.stopLoss.toFixed(decimals),
    leverage,
    tp1: output.tp1.toFixed(decimals),
    tp2: output.tp2 ? output.tp2.toFixed(decimals) : undefined,
    tp3: output.tp3 ? output.tp3.toFixed(decimals) : undefined,
    channelHandle,
    engineKey,
    reason: output.reason,
  };
}
