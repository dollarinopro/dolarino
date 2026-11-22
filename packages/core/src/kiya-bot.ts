import { atr, bollingerBands, ema, rsi, sma } from './indicators.js';
import type {
  BacktestTrade,
  Candle,
  DayOfWeekStat,
  KbosParams,
  MaVariantKind,
  MonthlyPerformanceRow,
  StrategySignalOutput,
  Timeframe,
} from './types.js';

export const DEFAULT_KBOS_PARAMS: KbosParams = {
  basisType: 'ALMA',
  basisLen: 3,
  useRes: true,
  intRes: 4,
  offsetSigma: 5,
  offsetALMA: 0.85,
  delayOffset: 0,
  tradeType: 'BOTH',
  useAtr1: false,
  useAtr2: false,
  useVol: false,
  useEmaRsi: false,
  useEma200: true,
  useAdx: true,
  adxVariant: 'ORIGINAL',
  adxThreshold: 18,
  useRsiCustom: false,
  useBb: false,
  useDemaAtr: true,
  haCandles: true,
  periodDema: 7,
  periodAtr: 14,
  factorAtr: 1.5,
  tp1Pct: 1.4,
  tp2Pct: 2.8,
  tp3Pct: 4.5,
  useTrail: true,
  trailPct: 1.2,
  trailAfterTp1: true,
  beAfterTp1: true,
  mainRibbonLen: 180,
};

export function mergeKbosParams(partial?: Partial<KbosParams> | Record<string, unknown>): KbosParams {
  if (!partial) return { ...DEFAULT_KBOS_PARAMS };
  const p = partial as Record<string, unknown>;
  // Auto-upgrade untouched legacy v1 DB defaults (migration 0003) without overwriting explicit user overrides
  const isUntouchedLegacyV1 =
    Number(p.intRes) === 18 &&
    Number(p.basisLen) === 2 &&
    p.useEma200 === false &&
    p.useAdx === false &&
    Number(p.adxThreshold) === 25 &&
    Number(p.factorAtr) === 1.7 &&
    Number(p.tp1Pct) === 1.5 &&
    Number(p.trailPct) === 2.0;
  if (isUntouchedLegacyV1) {
    return { ...DEFAULT_KBOS_PARAMS };
  }
  return {
    ...DEFAULT_KBOS_PARAMS,
    ...(partial as Partial<KbosParams>),
    basisLen: Math.max(1, Number(p.basisLen ?? DEFAULT_KBOS_PARAMS.basisLen)),
    intRes: Math.max(1, Number(p.intRes ?? DEFAULT_KBOS_PARAMS.intRes)),
    offsetSigma: Math.max(1, Number(p.offsetSigma ?? DEFAULT_KBOS_PARAMS.offsetSigma)),
    offsetALMA: Number(p.offsetALMA ?? DEFAULT_KBOS_PARAMS.offsetALMA),
    delayOffset: Math.max(0, Number(p.delayOffset ?? DEFAULT_KBOS_PARAMS.delayOffset)),
    tp1Pct: Number(p.tp1Pct ?? DEFAULT_KBOS_PARAMS.tp1Pct),
    tp2Pct: Number(p.tp2Pct ?? DEFAULT_KBOS_PARAMS.tp2Pct),
    tp3Pct: Number(p.tp3Pct ?? DEFAULT_KBOS_PARAMS.tp3Pct),
    trailPct: Number(p.trailPct ?? DEFAULT_KBOS_PARAMS.trailPct),
    mainRibbonLen: Math.max(21, Number(p.mainRibbonLen ?? DEFAULT_KBOS_PARAMS.mainRibbonLen)),
  };
}

export function wma(values: number[], period: number): number[] {
  const len = Math.max(1, Math.round(period));
  const out = new Array<number>(values.length).fill(NaN);
  const denom = (len * (len + 1)) / 2;
  for (let i = len - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < len; j++) {
      sum += (values[i - len + 1 + j] ?? 0) * (j + 1);
    }
    out[i] = sum / denom;
  }
  return out;
}

export function dema(values: number[], period: number): number[] {
  const e1 = ema(values, period);
  const cleanE1 = e1.map((v, i) => (Number.isFinite(v) ? v : values[i] ?? 0));
  const e2 = ema(cleanE1, period);
  return e1.map((v, i) => (Number.isFinite(v) && Number.isFinite(e2[i]) ? 2 * v - e2[i]! : NaN));
}

export function tema(values: number[], period: number): number[] {
  const e1 = ema(values, period);
  const c1 = e1.map((v, i) => (Number.isFinite(v) ? v : values[i] ?? 0));
  const e2 = ema(c1, period);
  const c2 = e2.map((v, i) => (Number.isFinite(v) ? v : c1[i] ?? 0));
  const e3 = ema(c2, period);
  return e1.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(e2[i]) && Number.isFinite(e3[i])
      ? 3 * (v - e2[i]!) + e3[i]!
      : NaN
  );
}

export function vwma(values: number[], volumes: number[], period: number): number[] {
  const len = Math.max(1, Math.round(period));
  const pv = values.map((v, i) => v * (volumes[i] ?? 1));
  const num = sma(pv, len);
  const den = sma(volumes, len);
  return num.map((n, i) => (Number.isFinite(n) && (den[i] ?? 0) > 0 ? n / den[i]! : NaN));
}

export function smma(values: number[], period: number): number[] {
  const len = Math.max(1, Math.round(period));
  const out = new Array<number>(values.length).fill(NaN);
  const base = sma(values, len);
  for (let i = 0; i < values.length; i++) {
    if (i < len - 1) continue;
    if (i === len - 1 || !Number.isFinite(out[i - 1])) {
      out[i] = base[i] ?? values[i] ?? 0;
    } else {
      out[i] = (out[i - 1]! * (len - 1) + (values[i] ?? 0)) / len;
    }
  }
  return out;
}

export function hullMa(values: number[], period: number): number[] {
  const len = Math.max(2, Math.round(period));
  const half = wma(values, Math.max(1, Math.round(len / 2)));
  const full = wma(values, len);
  const diff = values.map((_, i) =>
    Number.isFinite(half[i]) && Number.isFinite(full[i]) ? 2 * half[i]! - full[i]! : values[i] ?? 0
  );
  return wma(diff, Math.max(1, Math.round(Math.sqrt(len))));
}

export function lsma(values: number[], period: number, offset = 0): number[] {
  const len = Math.max(2, Math.round(period));
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = len - 1; i < values.length; i++) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let j = 0; j < len; j++) {
      const y = values[i - len + 1 + j] ?? 0;
      sumX += j;
      sumY += y;
      sumXY += j * y;
      sumXX += j * j;
    }
    const denom = len * sumXX - sumX * sumX;
    const slope = denom === 0 ? 0 : (len * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / len;
    out[i] = intercept + slope * (len - 1 - offset);
  }
  return out;
}

/**
 * Arnaud Legoux Moving Average (exact TradingView Pine formula)
 */
export function alma(values: number[], period: number, offset = 0.85, sigma = 6): number[] {
  const len = Math.max(1, Math.round(period));
  const out = new Array<number>(values.length).fill(NaN);
  if (len === 1) return [...values];
  const sig = Math.max(0.1, sigma);
  const m = offset * (len - 1);
  const s = len / sig;
  const weights = new Array<number>(len);
  let wSum = 0;
  for (let j = 0; j < len; j++) {
    const w = Math.exp(-((j - m) * (j - m)) / (2 * s * s));
    weights[j] = w;
    wSum += w;
  }
  for (let i = len - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < len; j++) {
      acc += (values[i - len + 1 + j] ?? 0) * weights[j]!;
    }
    out[i] = wSum > 0 ? acc / wSum : values[i]!;
  }
  return out;
}

/**
 * John F. Ehlers 2-pole SuperSmoother (SSMA)
 */
export function superSmoother(values: number[], period: number): number[] {
  const len = Math.max(2, Math.round(period));
  const out = new Array<number>(values.length).fill(0);
  const a1 = Math.exp((-1.414 * Math.PI) / len);
  const b1 = 2 * a1 * Math.cos((1.414 * Math.PI) / len);
  const c2 = b1;
  const c3 = -a1 * a1;
  const c1 = 1 - c2 - c3;
  for (let i = 0; i < values.length; i++) {
    const cur = values[i] ?? 0;
    const prev = values[Math.max(0, i - 1)] ?? cur;
    const prev1 = out[Math.max(0, i - 1)] ?? cur;
    const prev2 = out[Math.max(0, i - 2)] ?? cur;
    out[i] = i < 2 ? cur : c1 * ((cur + prev) / 2) + c2 * prev1 + c3 * prev2;
  }
  return out;
}

export function maVariant(
  kind: MaVariantKind,
  src: number[],
  len: number,
  offSig = 5,
  offALMA = 0.85,
  volumes?: number[]
): number[] {
  switch (kind) {
    case 'EMA':
      return ema(src, len);
    case 'DEMA':
      return dema(src, len);
    case 'TEMA':
      return tema(src, len);
    case 'WMA':
      return wma(src, len);
    case 'VWMA':
      return vwma(src, volumes ?? src.map(() => 1), len);
    case 'SMMA':
      return smma(src, len);
    case 'HullMA':
      return hullMa(src, len);
    case 'LSMA':
      return lsma(src, len, offSig);
    case 'ALMA':
      return alma(src, len, offALMA, offSig);
    case 'TMA': {
      const s1 = sma(src, len);
      return sma(s1.map((v, i) => (Number.isFinite(v) ? v : src[i] ?? 0)), len);
    }
    case 'SSMA':
      return superSmoother(src, len);
    case 'SMA':
    default:
      return sma(src, len);
  }
}

export function computeHeikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (out[i - 1]!.open + out[i - 1]!.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({
      timestamp: c.timestamp,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    });
  }
  return out;
}

/**
 * DEMA Adjusted ATR [BackQuant] (stateful SuperTrend ratchet so flat consolidations preserve trend)
 */
export function computeDemaAtr(
  candles: Candle[],
  opts: { haCandles?: boolean; periodDema?: number; periodAtr?: number; factorAtr?: number } = {}
): Array<{ time: number; value: number; trend: 'BULL' | 'BEAR' }> {
  if (!candles.length) return [];
  const ha = opts.haCandles !== false ? computeHeikinAshi(candles) : candles;
  const src = ha.map((c) => c.close);
  const demaOut = dema(src, opts.periodDema ?? 7);
  const atrVals = atr(candles, opts.periodAtr ?? 14);
  const factor = opts.factorAtr ?? 1.5;

  const out: Array<{ time: number; value: number; trend: 'BULL' | 'BEAR' }> = [];
  const d0 = Number.isFinite(demaOut[0]) ? demaOut[0]! : src[0]!;
  const a0 = Number.isFinite(atrVals[0]) ? atrVals[0]! : d0 * 0.006;
  let prevUpper = d0 + a0 * factor;
  let prevLower = d0 - a0 * factor;
  let prevDema = d0;
  let trend: 'BULL' | 'BEAR' = 'BULL';

  for (let i = 0; i < candles.length; i++) {
    const d = Number.isFinite(demaOut[i]) ? demaOut[i]! : src[i]!;
    const a = Number.isFinite(atrVals[i]) ? atrVals[i]! : d * 0.006;
    const tr = a * factor;
    const rawUpper = d + tr;
    const rawLower = d - tr;

    const upper = i === 0 ? rawUpper : (rawUpper < prevUpper || prevDema > prevUpper ? rawUpper : prevUpper);
    const lower = i === 0 ? rawLower : (rawLower > prevLower || prevDema < prevLower ? rawLower : prevLower);

    if (i > 0) {
      if (trend === 'BEAR' && d > prevUpper) trend = 'BULL';
      else if (trend === 'BULL' && d < prevLower) trend = 'BEAR';
    }

    const band = trend === 'BULL' ? lower : upper;
    prevUpper = upper;
    prevLower = lower;
    prevDema = d;

    out.push({
      time: Math.floor(candles[i]!.timestamp / 1000),
      value: band,
      trend,
    });
  }
  return out;
}

/**
 * Golden-Ratio 8-Band ALMA Moving Average Ribbon (RLA MA by D.Martinez)
 */
export function computeAlmaRibbon(
  candles: Candle[],
  opts: { mainLen?: number; offsetAlma?: number; sigmaAlma?: number } = {}
) {
  if (candles.length < 15) return { bands: [] as Array<{ label: string; color: string; points: Array<{ time: number; value: number }> }>, series: [] as number[][], bullCross: false, bearCross: false };
  const PHI = 1.61803398875;
  const maxSafe = Math.max(21, Math.min(opts.mainLen ?? 180, Math.floor(candles.length * 0.85)));
  const off = opts.offsetAlma ?? 0.85;
  const sig = opts.sigmaAlma ?? 6;
  const closes = candles.map((c) => c.close);

  const lengths: number[] = [maxSafe];
  for (let k = 1; k < 8; k++) {
    lengths.push(Math.max(3, Math.round(lengths[k - 1]! / PHI)));
  }

  const series = lengths.map((len) => alma(closes, len, off, sig));
  const palette = ['#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
  const bands = series.map((arr, idx) => ({
    label: `ALMA #${idx + 1} (${lengths[idx]})`,
    color: palette[idx] ?? '#3b82f6',
    points: arr
      .map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: v }))
      .filter((p) => Number.isFinite(p.value)),
  }));

  const s8 = series[7]!;
  const s7 = series[6]!;
  const last = candles.length - 1;
  const prev = Math.max(0, last - 1);
  const bullCross = Number.isFinite(s8[last]) && Number.isFinite(s7[last]) && s8[prev]! <= s7[prev]! && s8[last]! > s7[last]!;
  const bearCross = Number.isFinite(s8[last]) && Number.isFinite(s7[last]) && s8[prev]! >= s7[prev]! && s8[last]! < s7[last]!;

  return { bands, series, bullCross, bearCross };
}

function calcAdxSeries(
  candles: Candle[],
  diLen: number,
  smoothing: number,
  variant: 'ORIGINAL' | 'MASANAKAMURA'
): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(20);
  if (n < diLen + 5) return out;

  let smTr = 0;
  let smPlus = 0;
  let smMinus = 0;
  const dx = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    const dmPlus = c.high - p.high > p.low - c.low ? Math.max(c.high - p.high, 0) : 0;
    const dmMinus = p.low - c.low > c.high - p.high ? Math.max(p.low - c.low, 0) : 0;
    smTr = smTr - smTr / diLen + tr;
    smPlus = smPlus - smPlus / diLen + dmPlus;
    smMinus = smMinus - smMinus / diLen + dmMinus;
    const dip = smTr > 0 ? (smPlus / smTr) * 100 : 0;
    const dim = smTr > 0 ? (smMinus / smTr) * 100 : 0;
    const sumDi = dip + dim;
    dx[i] = sumDi > 0 ? (Math.abs(dip - dim) / sumDi) * 100 : 0;
  }

  if (variant === 'MASANAKAMURA') {
    const s = sma(dx, diLen);
    return s.map((v) => (Number.isFinite(v) ? v : 20));
  }
  const s = smma(dx, smoothing);
  return s.map((v) => (Number.isFinite(v) ? v : 20));
}

function tfMs(tf: Timeframe | string): number {
  const m: Record<string, number> = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
  };
  return m[tf] ?? 900_000;
}

export interface KbosDetailedResult {
  outputs: StrategySignalOutput[];
  closeSeriesAlt: Array<{ time: number; value: number }>;
  openSeriesAlt: Array<{ time: number; value: number }>;
  demaAtr: Array<{ time: number; value: number; trend: 'BULL' | 'BEAR' }>;
  almaRibbon: ReturnType<typeof computeAlmaRibbon>;
  markers: Array<{
    time: number;
    position: 'belowBar' | 'aboveBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown';
    text: string;
  }>;
}

/**
 * KIYA BOT ORG - super v11 (KBOs v11) Full Non-Repainting Strategy Engine
 */
export function computeKbosV11Detailed(
  candles: Candle[],
  timeframe: Timeframe = '15m',
  rawParams?: Partial<KbosParams> | Record<string, unknown>
): KbosDetailedResult {
  const params = mergeKbosParams(rawParams);
  if (candles.length < 25) {
    return {
      outputs: [],
      closeSeriesAlt: [],
      openSeriesAlt: [],
      demaAtr: [],
      almaRibbon: { bands: [], series: [], bullCross: false, bearCross: false },
      markers: [],
    };
  }

  const ltfMs = tfMs(timeframe);
  const delay = params.delayOffset;
  const closesDelayed = candles.map((_, i) => candles[Math.max(0, i - delay)]!.close);
  const opensDelayed = candles.map((_, i) => candles[Math.max(0, i - delay)]!.open);
  const volumes = candles.map((c) => c.volume);

  const ltfCloseSeries = maVariant(params.basisType, closesDelayed, params.basisLen, params.offsetSigma, params.offsetALMA, volumes);
  const ltfOpenSeries = maVariant(params.basisType, opensDelayed, params.basisLen, params.offsetSigma, params.offsetALMA, volumes);

  // Build non-repainting HTF resolution series (`stratRes = timeframe * intRes`)
  let altCloseSeries = [...ltfCloseSeries];
  let altOpenSeries = [...ltfOpenSeries];

  if (params.useRes && params.intRes > 1) {
    // Aggregate into closed synthetic HTF candles of `intRes` bars (or time buckets)
    // Using exact bar-bucket aggregation guarantees smooth HTF steps even on 200-450 API candles!
    const effectiveStep = Math.min(params.intRes, Math.max(2, Math.floor(candles.length / Math.max(4, params.basisLen + 2))));
    const htfBuckets: Array<{ closeTimeIdx: number; open: number; close: number; volume: number }> = [];

    for (let start = 0; start + effectiveStep - 1 < candles.length; start += effectiveStep) {
      const end = start + effectiveStep - 1;
      let vol = 0;
      for (let k = start; k <= end; k++) vol += candles[k]!.volume;
      htfBuckets.push({
        closeTimeIdx: end,
        open: candles[Math.max(0, start - delay)]!.open,
        close: candles[Math.max(0, end - delay)]!.close,
        volume: vol,
      });
    }

    if (htfBuckets.length >= params.basisLen + 1) {
      const hOpens = htfBuckets.map((b) => b.open);
      const hCloses = htfBuckets.map((b) => b.close);
      const hVols = htfBuckets.map((b) => b.volume);
      const hCloseMa = maVariant(params.basisType, hCloses, params.basisLen, params.offsetSigma, params.offsetALMA, hVols);
      const hOpenMa = maVariant(params.basisType, hOpens, params.basisLen, params.offsetSigma, params.offsetALMA, hVols);

      let bPtr = -1;
      for (let i = 0; i < candles.length; i++) {
        while (bPtr + 1 < htfBuckets.length && htfBuckets[bPtr + 1]!.closeTimeIdx <= i) {
          bPtr++;
        }
        if (bPtr >= 0 && Number.isFinite(hCloseMa[bPtr]) && Number.isFinite(hOpenMa[bPtr])) {
          altCloseSeries[i] = hCloseMa[bPtr]!;
          altOpenSeries[i] = hOpenMa[bPtr]!;
        }
      }
    }
  }

  // Confirmation filters from Pine Script
  const closes = candles.map((c) => c.close);
  const atr14 = atr(candles, 14);
  const rsi14 = rsi(closes, 14);
  const rsiEma20 = ema(rsi14.map((v) => (Number.isFinite(v) ? v : 50)), 20);
  const ema20 = ema(closes, 20);
  const ema200 = ema(closes, Math.min(200, Math.max(20, Math.floor(candles.length * 0.7))));
  const volSma14 = sma(volumes, 14);
  const bb = bollingerBands(closes, 20, 2);
  const adxVals = calcAdxSeries(candles, 14, 14, params.adxVariant);
  const demaAtr = computeDemaAtr(candles, {
    haCandles: params.haCandles,
    periodDema: params.periodDema,
    periodAtr: params.periodAtr,
    factorAtr: params.factorAtr,
  });
  const almaRibbon = computeAlmaRibbon(candles, {
    mainLen: params.mainRibbonLen,
    offsetAlma: params.offsetALMA,
    sigmaAlma: 6,
  });

  // Custom EMA-RSI (`xRSI`)
  const ups = closes.map((v, i) => (i > 0 ? Math.max(v - closes[i - 1]!, 0) : 0));
  const downs = closes.map((v, i) => (i > 0 ? Math.max(closes[i - 1]! - v, 0) : 0));
  const emaUp = ema(ups, 14);
  const emaDown = ema(downs, 14);
  const xRsi = closes.map((_, i) => {
    const u = emaUp[i] ?? 1;
    const d = emaDown[i] ?? 1;
    if (!Number.isFinite(u) || !Number.isFinite(d) || d <= 0) return 50;
    return 100 - 100 / (1 + u / d);
  });
  const xRsiEma30 = ema(xRsi, 30);

  const outputs: StrategySignalOutput[] = [];
  const closeSeriesAlt: Array<{ time: number; value: number }> = [];
  const openSeriesAlt: Array<{ time: number; value: number }> = [];
  const markers: KbosDetailedResult['markers'] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const timeSec = Math.floor(c.timestamp / 1000);
    const cAlt = altCloseSeries[i];
    const oAlt = altOpenSeries[i];
    const prevCAlt = i > 0 ? altCloseSeries[i - 1] : cAlt;
    const prevOAlt = i > 0 ? altOpenSeries[i - 1] : oAlt;

    if (Number.isFinite(cAlt) && Number.isFinite(oAlt)) {
      closeSeriesAlt.push({ time: timeSec, value: cAlt! });
      openSeriesAlt.push({ time: timeSec, value: oAlt! });
    }

    const a = Number.isFinite(atr14[i]) ? atr14[i]! : c.close * 0.008;
    const r = Number.isFinite(rsi14[i]) ? rsi14[i]! : 50;
    const da = demaAtr[i];

    // Cross triggers: ta.crossover(closeSeriesAlt, openSeriesAlt) / crossunder
    const crossOver =
      i > 1 &&
      Number.isFinite(cAlt) &&
      Number.isFinite(oAlt) &&
      Number.isFinite(prevCAlt) &&
      Number.isFinite(prevOAlt) &&
      prevCAlt! <= prevOAlt! &&
      cAlt! > oAlt!;
    const crossUnder =
      i > 1 &&
      Number.isFinite(cAlt) &&
      Number.isFinite(oAlt) &&
      Number.isFinite(prevCAlt) &&
      Number.isFinite(prevOAlt) &&
      prevCAlt! >= prevOAlt! &&
      cAlt! < oAlt!;

    // Apply all optional filters
    let okLong = crossOver && (params.tradeType === 'BOTH' || params.tradeType === 'LONG');
    let okShort = crossUnder && (params.tradeType === 'BOTH' || params.tradeType === 'SHORT');

    if (params.useAtr1 && i >= 20) {
      const windowAtr = atr14.slice(i - 19, i + 1).filter(Number.isFinite);
      const hiA = windowAtr.length ? Math.max(...windowAtr) : a;
      const loA = windowAtr.length ? Math.min(...windowAtr) : a;
      const normA = hiA > loA ? (a - loA) / (hiA - loA) : 0.5;
      if (normA <= 0.2) okLong = false;
      if (normA <= 0.5) okShort = false;
    }

    if (params.useAtr2 && i >= 2) {
      const atr2 = atr14[i - 2];
      if (Number.isFinite(atr2) && !(a > atr2!)) {
        okLong = false;
        okShort = false;
      }
    }

    if (params.useVol && Number.isFinite(volSma14[i])) {
      if (!(c.volume > volSma14[i]! * 1.5)) {
        okLong = false;
        okShort = false;
      }
    }

    if (params.useEmaRsi) {
      const e20 = ema20[i] ?? c.close;
      const re20 = rsiEma20[i] ?? 50;
      if (!(c.close > e20 && r > 60 && r > re20)) okLong = false;
      if (!(c.close < e20 && r < 40 && r < re20)) okShort = false;
    }

    if (params.useEma200) {
      const e200 = ema200[i];
      const e200Prev = ema200[Math.max(0, i - 4)];
      if (Number.isFinite(e200)) {
        if (!(c.close > e200! && (!Number.isFinite(e200Prev) || e200! >= e200Prev! * 0.9995))) okLong = false;
        if (!(c.close < e200! && (!Number.isFinite(e200Prev) || e200! <= e200Prev! * 1.0005))) okShort = false;
      }
    }

    if (params.useAdx && i >= 1) {
      if (adxVals[i]! < params.adxThreshold) {
        okLong = false;
        okShort = false;
      }
    }

    if (params.useRsiCustom) {
      const xr = xRsi[i] ?? 50;
      const xre = xRsiEma30[i] ?? 50;
      if (!(xr > 50 || xr > xre)) okLong = false;
      if (!(xr < 50 || xr < xre)) okShort = false;
    }

    if (params.useBb && i >= 1) {
      if (Number.isFinite(bb.upper[i]) && Number.isFinite(bb.upper[i - 1]) && !(bb.upper[i]! > bb.upper[i - 1]!)) {
        okLong = false;
      }
      if (Number.isFinite(bb.lower[i]) && Number.isFinite(bb.lower[i - 1]) && !(bb.lower[i]! < bb.lower[i - 1]!)) {
        okShort = false;
      }
    }

    if (params.useDemaAtr && da) {
      if (da.trend !== 'BULL') okLong = false;
      if (da.trend !== 'BEAR') okShort = false;
    }

    // Momentum, Ribbon & non-chasing equilibrium protection: avoid entering far overextended from EMA20
    const ribFast = almaRibbon.series[7]?.[i];
    const ribMid = almaRibbon.series[3]?.[i];
    const e20Val = ema20[i] ?? c.close;
    if (Number.isFinite(ribFast) && Number.isFinite(ribMid)) {
      if (okLong && ribFast! < ribMid! * 0.9985) okLong = false;
      if (okShort && ribFast! > ribMid! * 1.0015) okShort = false;
    }
    if (okLong && (r > 68 || c.close - e20Val > a * 1.6)) okLong = false;
    if (okShort && (r < 32 || e20Val - c.close > a * 1.6)) okShort = false;

    const signal: 'LONG' | 'SHORT' | 'NONE' = okLong ? 'LONG' : okShort ? 'SHORT' : 'NONE';
    const trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      Number.isFinite(cAlt) && Number.isFinite(oAlt)
        ? cAlt! > oAlt!
          ? 'BULLISH'
          : cAlt! < oAlt!
            ? 'BEARISH'
            : 'NEUTRAL'
        : 'NEUTRAL';

    // ATR-adaptive SL outside normal 1-bar wick noise, with TP levels scaled >= 1.2R / 2.2R / 3.5R
    const slDist = Math.max(a * 1.8, c.close * 0.0055);
    const tp1Dist = Math.max(slDist * 1.2, c.close * (params.tp1Pct / 100));
    const tp2Dist = Math.max(slDist * 2.2, c.close * (params.tp2Pct / 100));
    const tp3Dist = Math.max(slDist * 3.5, c.close * (params.tp3Pct / 100));
    const tp1 =
      signal === 'LONG'
        ? c.close + tp1Dist
        : signal === 'SHORT'
          ? c.close - tp1Dist
          : undefined;
    const tp2 =
      signal === 'LONG'
        ? c.close + tp2Dist
        : signal === 'SHORT'
          ? c.close - tp2Dist
          : undefined;
    const tp3 =
      signal === 'LONG'
        ? c.close + tp3Dist
        : signal === 'SHORT'
          ? c.close - tp3Dist
          : undefined;
    const stopLoss =
      signal === 'LONG'
        ? c.close - slDist
        : signal === 'SHORT'
          ? c.close + slDist
          : undefined;

    if (signal === 'LONG') {
      markers.push({ time: timeSec, position: 'belowBar', color: '#27cd86', shape: 'arrowUp', text: 'خرید / BUY' });
    } else if (signal === 'SHORT') {
      markers.push({ time: timeSec, position: 'aboveBar', color: '#eb493d', shape: 'arrowDown', text: 'فروش / SELL' });
    }

    outputs.push({
      timestamp: c.timestamp,
      closeTime: c.timestamp + ltfMs,
      trend,
      signal,
      reason:
        signal !== 'NONE'
          ? `KIYA BOT v11 (${params.basisType} HTF×${params.intRes}${params.useDemaAtr ? ' + DEMA ATR' : ''})`
          : 'No crossover',
      price: c.close,
      atr: a,
      rsi: r,
      stopLoss,
      tp1,
      tp2,
      tp3,
    });
  }

  return { outputs, closeSeriesAlt, openSeriesAlt, demaAtr, almaRibbon, markers };
}

/**
 * QuantNomad Monthly & Yearly Returns Heatmap Matrix + niceGear68734 Day-of-Week Breakdown
 */
export function buildBacktestMatrices(
  trades: BacktestTrade[],
  initialBalance: number
): { monthlyBreakdown: MonthlyPerformanceRow[]; dayOfWeekStats: DayOfWeekStat[] } {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = dayNames.map((dayName, dayIndex): DayOfWeekStat => ({
    dayIndex,
    dayName,
    openedTotal: 0,
    openedWins: 0,
    openedLosses: 0,
    openedWinRate: 0,
    closedTotal: 0,
    closedWins: 0,
    closedLosses: 0,
    closedWinRate: 0,
  }));

  const yearMonthPnl = new Map<number, Map<number, number>>();
  let runningEq = initialBalance;
  const yearStartEq = new Map<number, number>();
  const monthStartEq = new Map<string, number>();

  for (const t of trades) {
    const win = t.pnlUsd > 0;
    const dOpen = new Date(t.entryTime).getUTCDay();
    const dClose = new Date(t.exitTime).getUTCDay();
    const oRow = dow[dOpen]!;
    oRow.openedTotal++;
    if (win) oRow.openedWins++;
    else oRow.openedLosses++;

    const cRow = dow[dClose]!;
    cRow.closedTotal++;
    if (win) cRow.closedWins++;
    else cRow.closedLosses++;

    const dt = new Date(t.exitTime);
    const yr = dt.getUTCFullYear();
    const mo = dt.getUTCMonth() + 1;
    const key = `${yr}-${mo}`;
    if (!yearStartEq.has(yr)) yearStartEq.set(yr, Math.max(1, runningEq));
    if (!monthStartEq.has(key)) monthStartEq.set(key, Math.max(1, runningEq));

    if (!yearMonthPnl.has(yr)) yearMonthPnl.set(yr, new Map());
    const ym = yearMonthPnl.get(yr)!;
    ym.set(mo, (ym.get(mo) ?? 0) + t.pnlUsd);
    runningEq += t.pnlUsd;
  }

  for (const r of dow) {
    r.openedWinRate = r.openedTotal > 0 ? Number(((r.openedWins / r.openedTotal) * 100).toFixed(1)) : 0;
    r.closedWinRate = r.closedTotal > 0 ? Number(((r.closedWins / r.closedTotal) * 100).toFixed(1)) : 0;
  }

  const monthlyBreakdown: MonthlyPerformanceRow[] = [];
  for (const [year, mMap] of [...yearMonthPnl.entries()].sort((a, b) => a[0] - b[0])) {
    const months: Record<number, number> = {};
    let yearSum = 0;
    for (let m = 1; m <= 12; m++) {
      const p = mMap.get(m) ?? 0;
      yearSum += p;
      const base = monthStartEq.get(`${year}-${m}`) ?? Math.max(1, initialBalance);
      months[m] = mMap.has(m) ? Number(((p / base) * 100).toFixed(2)) : 0;
    }
    const yBase = yearStartEq.get(year) ?? Math.max(1, initialBalance);
    monthlyBreakdown.push({
      year,
      months,
      yearPct: Number(((yearSum / yBase) * 100).toFixed(2)),
    });
  }

  return { monthlyBreakdown, dayOfWeekStats: dow };
}
