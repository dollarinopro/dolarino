import { atr, bollingerBands, ema, rsi, sma } from './indicators.js';
import type { Candle, StrategySignalOutput, Timeframe } from './types.js';
import { timeframeToMs } from './strategies.js';

export type CustomStrategyLanguage = 'pine' | 'python' | 'visual';

export interface CustomPlotSeries {
  title: string;
  color: string;
  overlay: boolean;
  points: Array<{ time: number; value: number }>;
}

export interface CustomChartMarker {
  time: number;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

export interface CustomStrategyEvalResult {
  valid: boolean;
  language: CustomStrategyLanguage;
  title: string;
  overlay: boolean;
  errors: string[];
  warnings: string[];
  signals: StrategySignalOutput[];
  plots: CustomPlotSeries[];
  markers: CustomChartMarker[];
  latestSignal: StrategySignalOutput | null;
}

export interface VisualRuleCondition {
  id: string;
  kind:
    | 'EMA_CROSS_ABOVE'
    | 'EMA_CROSS_BELOW'
    | 'PRICE_ABOVE_EMA'
    | 'PRICE_BELOW_EMA'
    | 'RSI_BELOW'
    | 'RSI_ABOVE'
    | 'MACD_CROSS_UP'
    | 'MACD_CROSS_DOWN'
    | 'BB_LOWER_TOUCH'
    | 'BB_UPPER_TOUCH'
    | 'SUPERTREND_BULL'
    | 'SUPERTREND_BEAR'
    | 'VOLUME_SPIKE';
  param1: number;
  param2?: number;
}

export interface VisualStrategyDefinition {
  name: string;
  logic: 'ALL' | 'ANY';
  slAtrMult: number;
  tp1R: number;
  tp2R: number;
  tp3R: number;
  longRules: VisualRuleCondition[];
  shortRules: VisualRuleCondition[];
}

export interface SampleCustomStrategy {
  id: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  descriptionEn: string;
  language: CustomStrategyLanguage;
  category: string;
  code: string;
}

/* ============================================================================
 * Shared Technical Math Helpers (Causal, Deterministic, Worker-Safe)
 * ============================================================================ */

function rma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i] ?? 0;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const val = values[i] ?? prev;
    prev = (prev * (period - 1) + val) / period;
    out[i] = prev;
  }
  return out;
}

function wma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) {
      acc += (values[i - j] ?? 0) * (period - j);
    }
    out[i] = acc / denom;
  }
  return out;
}

function stdev(values: number[], period: number): number[] {
  const mean = sma(values, period);
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const m = mean[i]!;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = (values[j] ?? m) - m;
      sumSq += d * d;
    }
    out[i] = Math.sqrt(sumSq / period);
  }
  return out;
}

function highest(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mx = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j] ?? -Infinity;
      if (v > mx) mx = v;
    }
    out[i] = mx;
  }
  return out;
}

function lowest(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mn = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j] ?? Infinity;
      if (v < mn) mn = v;
    }
    out[i] = mn;
  }
  return out;
}

function macdSeries(values: number[], fast = 12, slow = 26, sig = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (Number.isFinite(f[i]) && Number.isFinite(s[i]) ? f[i]! - s[i]! : NaN));
  const validStart = line.findIndex((x) => Number.isFinite(x));
  const signalLine = new Array<number>(values.length).fill(NaN);
  if (validStart >= 0) {
    const slice = ema(line.slice(validStart), sig);
    for (let i = 0; i < slice.length; i++) signalLine[validStart + i] = slice[i]!;
  }
  const hist = line.map((l, i) => (Number.isFinite(l) && Number.isFinite(signalLine[i]) ? l - signalLine[i]! : NaN));
  return { line, signalLine, hist };
}

function supertrendSeries(candles: Candle[], factor = 3, atrLen = 10) {
  const atrArr = atr(candles, atrLen);
  const st = new Array<number>(candles.length).fill(NaN);
  const dir = new Array<number>(candles.length).fill(1); // 1 = bullish, -1 = bearish
  let finalUpper = 0;
  let finalLower = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const a = atrArr[i];
    if (!Number.isFinite(a)) continue;
    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + factor * a!;
    const basicLower = hl2 - factor * a!;

    if (i === 0 || !Number.isFinite(st[i - 1])) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      dir[i] = c.close >= hl2 ? 1 : -1;
      st[i] = dir[i] === 1 ? finalLower : finalUpper;
      continue;
    }

    const prevClose = candles[i - 1]!.close;
    finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
    finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;

    const prevDir = dir[i - 1]!;
    if (prevDir === -1 && c.close > finalUpper) {
      dir[i] = 1;
    } else if (prevDir === 1 && c.close < finalLower) {
      dir[i] = -1;
    } else {
      dir[i] = prevDir;
    }
    st[i] = dir[i] === 1 ? finalLower : finalUpper;
  }

  return { st, dir };
}

function vwapSeries(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  let cumPv = 0;
  let cumV = 0;
  let lastDay = -1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const day = Math.floor(c.timestamp / 86_400_000);
    if (day !== lastDay) {
      cumPv = 0;
      cumV = 0;
      lastDay = day;
    }
    const typ = (c.high + c.low + c.close) / 3;
    cumPv += typ * Math.max(c.volume, 1e-6);
    cumV += Math.max(c.volume, 1e-6);
    out[i] = cumV > 0 ? cumPv / cumV : c.close;
  }
  return out;
}

function stochasticSeries(candles: Candle[], kLen = 14, dLen = 3) {
  const k = new Array<number>(candles.length).fill(NaN);
  for (let i = kLen - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kLen + 1; j <= i; j++) {
      if (candles[j]!.high > hi) hi = candles[j]!.high;
      if (candles[j]!.low < lo) lo = candles[j]!.low;
    }
    const span = hi - lo;
    k[i] = span > 0 ? ((candles[i]!.close - lo) / span) * 100 : 50;
  }
  const d = sma(k.map((v) => (Number.isFinite(v) ? v : 50)), dLen);
  return { k, d };
}

function shiftSeries(arr: number[], offset: number): number[] {
  if (offset <= 0) return arr;
  return arr.map((_, i) => (i - offset >= 0 ? (arr[i - offset] ?? NaN) : NaN));
}

function crossoverSeries(a: number[], b: number[]): number[] {
  return a.map((_, i) => {
    if (i < 1) return 0;
    const a0 = a[i - 1]!;
    const a1 = a[i]!;
    const b0 = b[i - 1]!;
    const b1 = b[i]!;
    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(b0) || !Number.isFinite(b1)) return 0;
    return a0 <= b0 && a1 > b1 ? 1 : 0;
  });
}

function crossunderSeries(a: number[], b: number[]): number[] {
  return a.map((_, i) => {
    if (i < 1) return 0;
    const a0 = a[i - 1]!;
    const a1 = a[i]!;
    const b0 = b[i - 1]!;
    const b1 = b[i]!;
    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(b0) || !Number.isFinite(b1)) return 0;
    return a0 >= b0 && a1 < b1 ? 1 : 0;
  });
}

/* ============================================================================
 * Safe Recursive-Descent Expression Evaluator (Zero eval / Zero new Function)
 * ============================================================================ */

type Val = number[] | number | string | boolean;

function toSeries(v: Val, len: number): number[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'boolean') return new Array<number>(len).fill(v ? 1 : 0);
  if (typeof v === 'number') return new Array<number>(len).fill(v);
  const n = Number(v);
  return new Array<number>(len).fill(Number.isFinite(n) ? n : NaN);
}

function splitTopLevelArgs(argStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote && argStr[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function stripNamedArg(raw: string): { key?: string; expr: string } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === '=' && depth === 0 && raw[i + 1] !== '=' && raw[i - 1] !== '!' && raw[i - 1] !== '<' && raw[i - 1] !== '>') {
      const left = raw.slice(0, i).trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(left)) {
        return { key: left, expr: raw.slice(i + 1).trim() };
      }
    }
  }
  return { expr: raw };
}

function resolveColorToken(raw: string, fallback = '#2b74ff'): string {
  const clean = raw.replace(/['"]/g, '').trim().toLowerCase();
  const map: Record<string, string> = {
    'color.green': '#10d9a3',
    'color.lime': '#12e35d',
    'color.teal': '#14b8a6',
    'color.red': '#ff4d6d',
    'color.rose': '#fb7185',
    'color.blue': '#2b74ff',
    'color.aqua': '#38e1ff',
    'color.cyan': '#38e1ff',
    'color.yellow': '#e8c15a',
    'color.orange': '#ff8a00',
    'color.purple': '#a855f7',
    'color.white': '#e2e8f0',
    'color.gray': '#94a3b8',
    green: '#10d9a3',
    red: '#ff4d6d',
    blue: '#2b74ff',
    cyan: '#38e1ff',
    gold: '#e8c15a',
    yellow: '#e8c15a',
    orange: '#ff8a00',
    purple: '#a855f7',
  };
  if (clean.startsWith('#') && (clean.length === 4 || clean.length === 7)) return clean;
  return map[clean] ?? fallback;
}

interface ExecEnv {
  candles: Candle[];
  vars: Map<string, Val>;
  plots: CustomPlotSeries[];
  longFlags: number[];
  shortFlags: number[];
  closeFlags: number[];
  warnings: string[];
}

function callBuiltinFn(name: string, rawArgs: string[], env: ExecEnv): Val | Val[] {
  const n = name.toLowerCase();
  const len = env.candles.length;
  const closeArr = env.vars.get('close') as number[];
  const highArr = env.vars.get('high') as number[];
  const lowArr = env.vars.get('low') as number[];

  const evalArg = (idx: number, defVal?: Val): Val => {
    const item = rawArgs[idx];
    if (item === undefined) return defVal ?? 0;
    return evalExpr(stripNamedArg(item).expr, env);
  };
  const namedOrIdx = (key: string, idx: number, defVal?: Val): Val => {
    for (const r of rawArgs) {
      const parsed = stripNamedArg(r);
      if (parsed.key?.toLowerCase() === key.toLowerCase()) return evalExpr(parsed.expr, env);
    }
    return evalArg(idx, defVal);
  };
  const numArg = (idx: number, def: number): number => {
    const v = evalArg(idx, def);
    const num = typeof v === 'number' ? v : Array.isArray(v) ? (v[v.length - 1] ?? def) : Number(v);
    return Number.isFinite(num) ? Math.max(1, Math.round(num)) : def;
  };
  const floatArg = (idx: number, def: number): number => {
    const v = evalArg(idx, def);
    const num = typeof v === 'number' ? v : Array.isArray(v) ? (v[v.length - 1] ?? def) : Number(v);
    return Number.isFinite(num) ? num : def;
  };

  if (n === 'input.int' || n === 'input.float' || n === 'input' || n === 'input.bool') {
    return namedOrIdx('defval', 0, 14);
  }
  if (n === 'ta.sma' || n === 'sma') {
    const src = toSeries(evalArg(0, closeArr), len);
    return sma(src, numArg(1, 20));
  }
  if (n === 'ta.ema' || n === 'ema') {
    const src = toSeries(evalArg(0, closeArr), len);
    return ema(src, numArg(1, 20));
  }
  if (n === 'ta.rma' || n === 'rma') {
    const src = toSeries(evalArg(0, closeArr), len);
    return rma(src, numArg(1, 14));
  }
  if (n === 'ta.wma' || n === 'wma') {
    const src = toSeries(evalArg(0, closeArr), len);
    return wma(src, numArg(1, 14));
  }
  if (n === 'ta.rsi' || n === 'rsi') {
    if (rawArgs.length >= 2) {
      const src = toSeries(evalArg(0, closeArr), len);
      return rsi(src, numArg(1, 14));
    }
    return rsi(closeArr, numArg(0, 14));
  }
  if (n === 'ta.atr' || n === 'atr') {
    const period = rawArgs.length >= 2 ? numArg(1, 14) : numArg(0, 14);
    return atr(env.candles, period);
  }
  if (n === 'ta.stdev' || n === 'stdev') {
    const src = toSeries(evalArg(0, closeArr), len);
    return stdev(src, numArg(1, 20));
  }
  if (n === 'ta.highest' || n === 'highest') {
    if (rawArgs.length >= 2) {
      const src = toSeries(evalArg(0, highArr), len);
      return highest(src, numArg(1, 20));
    }
    return highest(highArr, numArg(0, 20));
  }
  if (n === 'ta.lowest' || n === 'lowest') {
    if (rawArgs.length >= 2) {
      const src = toSeries(evalArg(0, lowArr), len);
      return lowest(src, numArg(1, 20));
    }
    return lowest(lowArr, numArg(0, 20));
  }
  if (n === 'ta.vwap' || n === 'vwap') {
    return vwapSeries(env.candles);
  }
  if (n === 'ta.macd' || n === 'macd') {
    const src = toSeries(evalArg(0, closeArr), len);
    const f = numArg(1, 12);
    const s = numArg(2, 26);
    const sg = numArg(3, 9);
    const m = macdSeries(src, f, s, sg);
    return [m.line, m.signalLine, m.hist];
  }
  if (n === 'ta.bb' || n === 'ta.bbands' || n === 'bb' || n === 'bbands') {
    const src = toSeries(evalArg(0, closeArr), len);
    const period = numArg(1, 20);
    const mult = floatArg(2, 2);
    const b = bollingerBands(src, period, mult);
    return [b.mid, b.upper, b.lower];
  }
  if (n === 'ta.supertrend' || n === 'supertrend') {
    const hasDf = rawArgs[0] && stripNamedArg(rawArgs[0]).expr.trim() === 'df';
    const factor = floatArg(hasDf ? 1 : 0, 3);
    const atrLen = numArg(hasDf ? 2 : 1, 10);
    const s = supertrendSeries(env.candles, factor, atrLen);
    return [s.st, s.dir];
  }
  if (n === 'ta.stoch' || n === 'stoch') {
    const kLen = numArg(rawArgs.length >= 4 ? 3 : 0, 14);
    const s = stochasticSeries(env.candles, kLen, 3);
    return [s.k, s.d];
  }
  if (n === 'ta.crossover' || n === 'crossover') {
    return crossoverSeries(toSeries(evalArg(0), len), toSeries(evalArg(1), len));
  }
  if (n === 'ta.crossunder' || n === 'crossunder') {
    return crossunderSeries(toSeries(evalArg(0), len), toSeries(evalArg(1), len));
  }
  if (n === 'math.abs' || n === 'abs') {
    return toSeries(evalArg(0), len).map((x) => Math.abs(x));
  }
  if (n === 'math.max' || n === 'max' || n === 'np.maximum') {
    const a = toSeries(evalArg(0), len);
    const b = toSeries(evalArg(1), len);
    return a.map((x, i) => Math.max(x, b[i]!));
  }
  if (n === 'math.min' || n === 'min' || n === 'np.minimum') {
    const a = toSeries(evalArg(0), len);
    const b = toSeries(evalArg(1), len);
    return a.map((x, i) => Math.min(x, b[i]!));
  }
  if (n === 'nz') {
    const a = toSeries(evalArg(0), len);
    const d = floatArg(1, 0);
    return a.map((x) => (Number.isFinite(x) ? x : d));
  }
  if (n === 'np.where') {
    const cond = toSeries(evalArg(0), len);
    const a = toSeries(evalArg(1), len);
    const b = toSeries(evalArg(2), len);
    return cond.map((c, i) => (c && !Number.isNaN(c) ? a[i]! : b[i]!));
  }
  if (n === 'shift') {
    return shiftSeries(toSeries(evalArg(0), len), numArg(1, 1));
  }
  env.warnings.push(`Unsupported helper ${name}; defaulted safely.`);
  return new Array<number>(len).fill(NaN);
}

function evalExpr(exprRaw: string, env: ExecEnv): Val {
  const expr = exprRaw.trim();
  const len = env.candles.length;
  if (!expr) return NaN;
  if (expr === 'true' || expr === 'True') return 1;
  if (expr === 'false' || expr === 'False') return 0;
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);

  // Ternary operator: cond ? a : b (top-level)
  {
    let depth = 0;
    let qPos = -1;
    let cPos = -1;
    let quote: string | null = null;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i]!;
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (depth === 0 && ch === '?' && qPos === -1) qPos = i;
      else if (depth === 0 && ch === ':' && qPos !== -1 && cPos === -1) { cPos = i; break; }
    }
    if (qPos !== -1 && cPos !== -1) {
      const cond = toSeries(evalExpr(expr.slice(0, qPos), env), len);
      const a = toSeries(evalExpr(expr.slice(qPos + 1, cPos), env), len);
      const b = toSeries(evalExpr(expr.slice(cPos + 1), env), len);
      return cond.map((c, i) => (c && !Number.isNaN(c) ? a[i]! : b[i]!));
    }
  }

  // Binary operators ordered from lowest to highest precedence
  const opGroups: Array<Array<{ tok: string; isWord?: boolean }>> = [
    [{ tok: 'or', isWord: true }, { tok: '||', isWord: false }, { tok: '|', isWord: false }],
    [{ tok: 'and', isWord: true }, { tok: '&&', isWord: false }, { tok: '&', isWord: false }],
    [{ tok: '==', isWord: false }, { tok: '!=', isWord: false }, { tok: '>=', isWord: false }, { tok: '<=', isWord: false }, { tok: '>', isWord: false }, { tok: '<', isWord: false }],
    [{ tok: '+', isWord: false }, { tok: '-', isWord: false }],
    [{ tok: '*', isWord: false }, { tok: '/', isWord: false }],
  ];

  for (const ops of opGroups) {
    let depth = 0;
    let quote: string | null = null;
    // Scan right-to-left so left-associative ops split at rightmost operator
    for (let i = expr.length - 1; i >= 0; i--) {
      const ch = expr[i]!;
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === ')' || ch === ']') depth++;
      else if (ch === '(' || ch === '[') depth--;
      if (depth !== 0) continue;

      for (const op of ops) {
        const L = op.tok.length;
        const start = i - L + 1;
        if (start <= 0) continue;
        if (expr.slice(start, i + 1) !== op.tok) continue;
        if (op.isWord) {
          const prev = expr[start - 1] ?? ' ';
          const next = expr[i + 1] ?? ' ';
          if (!/\s|\)/.test(prev) || !/\s|\(/.test(next)) continue;
        }
        // Avoid matching unary +/- or double ops like == when scanning = or <=
        if (op.tok === '-' && /^[\s(*\/+\-><=!&|]$/.test(expr[start - 1] ?? ' ')) continue;
        if (op.tok === '>' && expr[start - 1] === '=') continue;
        if (op.tok === '<' && expr[start - 1] === '=') continue;
        if ((op.tok === '|' || op.tok === '&') && (expr[start - 1] === op.tok || expr[i + 1] === op.tok)) continue;

        const leftVal = evalExpr(expr.slice(0, start), env);
        const rightVal = evalExpr(expr.slice(i + 1), env);
        const a = toSeries(leftVal, len);
        const b = toSeries(rightVal, len);
        switch (op.tok) {
          case 'or':
          case '||':
          case '|':
            return a.map((x, idx) => ((x && !Number.isNaN(x)) || (b[idx] && !Number.isNaN(b[idx])) ? 1 : 0));
          case 'and':
          case '&&':
          case '&':
            return a.map((x, idx) => (x && !Number.isNaN(x) && b[idx] && !Number.isNaN(b[idx]) ? 1 : 0));
          case '==':
            return a.map((x, idx) => (x === b[idx] ? 1 : 0));
          case '!=':
            return a.map((x, idx) => (x !== b[idx] ? 1 : 0));
          case '>=':
            return a.map((x, idx) => (x >= b[idx]! ? 1 : 0));
          case '<=':
            return a.map((x, idx) => (x <= b[idx]! ? 1 : 0));
          case '>':
            return a.map((x, idx) => (x > b[idx]! ? 1 : 0));
          case '<':
            return a.map((x, idx) => (x < b[idx]! ? 1 : 0));
          case '+':
            return a.map((x, idx) => x + b[idx]!);
          case '-':
            return a.map((x, idx) => x - b[idx]!);
          case '*':
            return a.map((x, idx) => x * b[idx]!);
          case '/':
            return a.map((x, idx) => (b[idx] !== 0 ? x / b[idx]! : NaN));
        }
      }
    }
  }

  // Unary not / ~
  if (/^(not\s+|!|~)/i.test(expr)) {
    const inner = expr.replace(/^(not\s+|!|~)/i, '').trim();
    return toSeries(evalExpr(inner, env), len).map((x) => (x && !Number.isNaN(x) ? 0 : 1));
  }

  // Parenthesized expression
  if (expr.startsWith('(') && expr.endsWith(')')) {
    return evalExpr(expr.slice(1, -1), env);
  }

  // Pandas style chained methods: df['close'].ewm(span=9).mean(), df['close'].rolling(20).mean()/max()/min(), .shift(1)
  const ewmMatch = expr.match(/^(.+)\.ewm\(\s*(?:span\s*=\s*)?(\d+)[^)]*\)\.mean\(\)$/);
  if (ewmMatch) {
    const src = toSeries(evalExpr(ewmMatch[1]!, env), len);
    return ema(src, Math.max(1, Number(ewmMatch[2]!)));
  }
  const rollMatch = expr.match(/^(.+)\.rolling\(\s*(?:window\s*=\s*)?(\d+)[^)]*\)\.(mean|max|min|std)\(\)$/);
  if (rollMatch) {
    const src = toSeries(evalExpr(rollMatch[1]!, env), len);
    const p = Math.max(1, Number(rollMatch[2]!));
    if (rollMatch[3] === 'mean') return sma(src, p);
    if (rollMatch[3] === 'max') return highest(src, p);
    if (rollMatch[3] === 'min') return lowest(src, p);
    return stdev(src, p);
  }
  const shiftMatch = expr.match(/^(.+)\.shift\(\s*(\d+)\s*\)$/);
  if (shiftMatch) {
    return shiftSeries(toSeries(evalExpr(shiftMatch[1]!, env), len), Number(shiftMatch[2]!));
  }

  // df['col'] or df.col
  const dfBracket = expr.match(/^df\[['"]([A-Za-z0-9_]+)['"]\]$/);
  if (dfBracket) {
    return env.vars.get(dfBracket[1]!) ?? new Array<number>(len).fill(NaN);
  }
  const dfDot = expr.match(/^df\.([A-Za-z0-9_]+)$/);
  if (dfDot) {
    return env.vars.get(dfDot[1]!) ?? new Array<number>(len).fill(NaN);
  }

  // Function call: fnName(args...)
  const fnMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/);
  if (fnMatch) {
    const res = callBuiltinFn(fnMatch[1]!, splitTopLevelArgs(fnMatch[2]!), env);
    return Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as number[]) : (res as Val);
  }

  // Historical lookback: series[k]
  const histMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/);
  if (histMatch) {
    const s = env.vars.get(histMatch[1]!);
    if (s !== undefined) return shiftSeries(toSeries(s, len), Number(histMatch[2]!));
  }

  if (env.vars.has(expr)) return env.vars.get(expr)!;
  if (expr === 'ta.vwap') return vwapSeries(env.candles);
  return NaN;
}

function makeBaseEnv(candles: Candle[]): ExecEnv {
  const open = candles.map((c) => c.open);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const volume = candles.map((c) => c.volume);
  const hl2 = candles.map((c) => (c.high + c.low) / 2);
  const hlc3 = candles.map((c) => (c.high + c.low + c.close) / 3);
  const ohlc4 = candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
  const barIndex = candles.map((_, i) => i);

  const vars = new Map<string, Val>([
    ['open', open],
    ['high', high],
    ['low', low],
    ['close', close],
    ['volume', volume],
    ['hl2', hl2],
    ['hlc3', hlc3],
    ['ohlc4', ohlc4],
    ['bar_index', barIndex],
    ['strategy.long', 1],
    ['strategy.short', -1],
  ]);

  return {
    candles,
    vars,
    plots: [],
    longFlags: new Array<number>(candles.length).fill(0),
    shortFlags: new Array<number>(candles.length).fill(0),
    closeFlags: new Array<number>(candles.length).fill(0),
    warnings: [],
  };
}

function buildFinalSignalsAndMarkers(
  candles: Candle[],
  timeframe: Timeframe | string,
  env: ExecEnv,
  title: string,
  language: CustomStrategyLanguage,
  overlay: boolean,
  slAtrMult = 1.8,
  tp1R = 1.3,
  tp2R = 2.4,
  tp3R = 3.6
): CustomStrategyEvalResult {
  const tfMs = timeframeToMs(timeframe);
  const atrArr = atr(candles, 14);
  const rsiArr = rsi(candles.map((c) => c.close), 14);
  const signals: StrategySignalOutput[] = [];
  const markers: CustomChartMarker[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const a = Number.isFinite(atrArr[i]) && atrArr[i]! > 0 ? atrArr[i]! : c.close * 0.012;
    const r = Number.isFinite(rsiArr[i]) ? rsiArr[i]! : 50;
    const isLong = env.longFlags[i] === 1;
    const isShort = env.shortFlags[i] === 1;

    let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    if (isLong && !isShort) signal = 'LONG';
    else if (isShort && !isLong) signal = 'SHORT';

    const slDist = a * slAtrMult;
    const stopLoss = signal === 'LONG' ? c.close - slDist : signal === 'SHORT' ? c.close + slDist : undefined;
    const tp1 = signal === 'LONG' ? c.close + slDist * tp1R : signal === 'SHORT' ? c.close - slDist * tp1R : undefined;
    const tp2 = signal === 'LONG' ? c.close + slDist * tp2R : signal === 'SHORT' ? c.close - slDist * tp2R : undefined;
    const tp3 = signal === 'LONG' ? c.close + slDist * tp3R : signal === 'SHORT' ? c.close - slDist * tp3R : undefined;

    signals.push({
      timestamp: c.timestamp,
      closeTime: c.timestamp + tfMs,
      trend: signal === 'LONG' ? 'BULLISH' : signal === 'SHORT' ? 'BEARISH' : 'NEUTRAL',
      signal,
      reason: signal === 'NONE' ? title : `${title} (${language.toUpperCase()})`,
      price: c.close,
      atr: a,
      rsi: r,
      stopLoss,
      tp1,
      tp2,
      tp3,
    });

    if (signal !== 'NONE') {
      markers.push({
        time: Math.floor(c.timestamp / 1000),
        position: signal === 'LONG' ? 'belowBar' : 'aboveBar',
        color: signal === 'LONG' ? '#10d9a3' : '#ff4d6d',
        shape: signal === 'LONG' ? 'arrowUp' : 'arrowDown',
        text: signal === 'LONG' ? 'LONG' : 'SHORT',
      });
    }
  }

  return {
    valid: true,
    language,
    title,
    overlay,
    errors: [],
    warnings: env.warnings,
    signals,
    plots: env.plots,
    markers,
    latestSignal: signals[signals.length - 1] ?? null,
  };
}

/* ============================================================================
 * 1. Pine Script v4 / v5 Transpiler & Runtime
 * ============================================================================ */

export function evaluatePineStrategy(
  code: string,
  candles: Candle[],
  timeframe: Timeframe | string = '15m'
): CustomStrategyEvalResult {
  const env = makeBaseEnv(candles);
  const len = candles.length;
  let title = 'Custom Pine Strategy';
  let overlay = true;
  const errors: string[] = [];

  if (!code.trim()) {
    return {
      valid: false,
      language: 'pine',
      title,
      overlay,
      errors: ['Pine Script code cannot be empty.'],
      warnings: [],
      signals: [],
      plots: [],
      markers: [],
      latestSignal: null,
    };
  }

  const lines = code.split(/\r?\n/);
  const condStack: Array<{ indent: number; cond: number[] }> = [];

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln]!;
    const strippedComment = raw.replace(/\/\/.*$/, '');
    if (!strippedComment.trim()) continue;
    const indent = raw.search(/\S/);
    const trimmed = strippedComment.trim();

    while (condStack.length && indent <= condStack[condStack.length - 1]!.indent) {
      condStack.pop();
    }

    if (trimmed.startsWith('indicator(') || trimmed.startsWith('strategy(') || trimmed.startsWith('study(')) {
      const mTitle = trimmed.match(/["']([^"']+)["']/);
      if (mTitle?.[1]) title = mTitle[1];
      if (/overlay\s*=\s*false/i.test(trimmed)) overlay = false;
      continue;
    }

    // Tuple destructuring: [a, b, c] = ta.macd(...) or [mid, upper, lower] = ta.bb(...)
    const tupleMatch = trimmed.match(/^\[([^\]]+)\]\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/);
    if (tupleMatch) {
      const names = tupleMatch[1]!.split(',').map((s) => s.trim());
      const out = callBuiltinFn(tupleMatch[2]!, splitTopLevelArgs(tupleMatch[3]!), env);
      if (Array.isArray(out) && Array.isArray(out[0])) {
        names.forEach((nm, idx) => {
          if (nm && nm !== '_') env.vars.set(nm, (out as number[][])[idx] ?? new Array<number>(len).fill(NaN));
        });
      }
      continue;
    }

    // Conditional block header: if <cond>
    const ifMatch = trimmed.match(/^if\s+(.+)$/);
    if (ifMatch) {
      const condArr = toSeries(evalExpr(ifMatch[1]!, env), len);
      condStack.push({ indent, cond: condArr });
      continue;
    }

    // Variable assignment: var x = ... | x = ... | x := ...
    const assignMatch = trimmed.match(/^(?:(?:var|int|float|bool|string)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::=|=)\s*(.+)$/);
    if (assignMatch) {
      try {
        env.vars.set(assignMatch[1]!, evalExpr(assignMatch[2]!, env));
      } catch (err) {
        errors.push(`Line ${ln + 1}: ${err instanceof Error ? err.message : 'Expression error'}`);
      }
      continue;
    }

    // plot(series, title=..., color=...)
    const plotMatch = trimmed.match(/^plot\(([\s\S]+)\)$/);
    if (plotMatch) {
      const args = splitTopLevelArgs(plotMatch[1]!);
      const series = toSeries(evalExpr(stripNamedArg(args[0] ?? 'close').expr, env), len);
      let pTitle = `Plot ${env.plots.length + 1}`;
      let pColor = '#2b74ff';
      for (let idx = 1; idx < args.length; idx++) {
        const p = stripNamedArg(args[idx]!);
        if (p.key === 'title' || (idx === 1 && !p.key)) pTitle = p.expr.replace(/['"]/g, '').trim() || pTitle;
        if (p.key === 'color' || (idx === 2 && !p.key)) pColor = resolveColorToken(p.expr, pColor);
      }
      const points: Array<{ time: number; value: number }> = [];
      for (let i = 0; i < len; i++) {
        if (Number.isFinite(series[i])) {
          points.push({ time: Math.floor(candles[i]!.timestamp / 1000), value: series[i]! });
        }
      }
      env.plots.push({ title: pTitle, color: pColor, overlay, points });
      continue;
    }

    // plotshape(cond, ...) or alertcondition(cond, ...)
    const shapeMatch = trimmed.match(/^(?:plotshape|alertcondition)\(([\s\S]+)\)$/);
    if (shapeMatch) {
      const args = splitTopLevelArgs(shapeMatch[1]!);
      const condArr = toSeries(evalExpr(stripNamedArg(args[0] ?? 'false').expr, env), len);
      const lower = trimmed.toLowerCase();
      if (lower.includes('short') || lower.includes('sell') || lower.includes('below') || lower.includes('location.abovebar')) {
        for (let i = 0; i < len; i++) if (condArr[i] && !Number.isNaN(condArr[i])) env.shortFlags[i] = 1;
      } else if (lower.includes('long') || lower.includes('buy') || lower.includes('above') || lower.includes('location.belowbar')) {
        for (let i = 0; i < len; i++) if (condArr[i] && !Number.isNaN(condArr[i])) env.longFlags[i] = 1;
      }
      continue;
    }

    // strategy.entry("id", strategy.long|strategy.short, when=...)
    const entryMatch = trimmed.match(/^strategy\.entry\(([\s\S]+)\)$/);
    if (entryMatch) {
      const args = splitTopLevelArgs(entryMatch[1]!);
      const dirExpr = stripNamedArg(args[1] ?? '').expr;
      const isShort = dirExpr.includes('short') || stripNamedArg(args[0] ?? '').expr.toLowerCase().includes('short');
      let cond = new Array<number>(len).fill(1);
      for (const a of args) {
        const parsed = stripNamedArg(a);
        if (parsed.key === 'when') cond = toSeries(evalExpr(parsed.expr, env), len);
      }
      for (const frame of condStack) {
        cond = cond.map((v, i) => (v && frame.cond[i] ? 1 : 0));
      }
      for (let i = 0; i < len; i++) {
        if (cond[i]) {
          if (isShort) env.shortFlags[i] = 1;
          else env.longFlags[i] = 1;
        }
      }
      continue;
    }

    // strategy.close(...)
    if (trimmed.startsWith('strategy.close(') || trimmed.startsWith('strategy.exit(')) {
      continue;
    }
  }

  if (errors.length) {
    return {
      valid: false,
      language: 'pine',
      title,
      overlay,
      errors,
      warnings: env.warnings,
      signals: [],
      plots: env.plots,
      markers: [],
      latestSignal: null,
    };
  }

  return buildFinalSignalsAndMarkers(candles, timeframe, env, title, 'pine', overlay);
}

/* ============================================================================
 * 2. Python Algorithmic Strategy Sandbox Interpreter
 * ============================================================================ */

export function evaluatePythonStrategy(
  code: string,
  candles: Candle[],
  timeframe: Timeframe | string = '15m'
): CustomStrategyEvalResult {
  const env = makeBaseEnv(candles);
  const len = candles.length;
  let title = 'Custom Python Strategy';
  const errors: string[] = [];

  if (!code.trim()) {
    return {
      valid: false,
      language: 'python',
      title,
      overlay: true,
      errors: ['Python strategy code cannot be empty.'],
      warnings: [],
      signals: [],
      plots: [],
      markers: [],
      latestSignal: null,
    };
  }

  const lines = code.split(/\r?\n/);
  const palette = ['#2b74ff', '#10d9a3', '#e8c15a', '#38e1ff', '#a855f7'];
  const autoPlotKeys: Array<{ key: string; label: string }> = [];

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln]!;
    const commentMatch = raw.match(/#\s*title:\s*(.+)$/i);
    if (commentMatch?.[1]) title = commentMatch[1].trim();
    const cleaned = raw.replace(/#.*$/, '').trim();
    if (!cleaned) continue;
    if (
      cleaned.startsWith('import ') ||
      cleaned.startsWith('from ') ||
      cleaned.startsWith('def ') ||
      cleaned.startsWith('return ') ||
      cleaned === 'pass'
    ) {
      continue;
    }

    // Tuple assignment: upper, mid, lower = ta.bbands(...)
    const pyTuple = cleaned.match(/^([A-Za-z_][A-Za-z0-9_,\s]*)\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/);
    if (pyTuple && pyTuple[1]!.includes(',')) {
      const names = pyTuple[1]!.split(',').map((s) => s.trim());
      const out = callBuiltinFn(pyTuple[2]!, splitTopLevelArgs(pyTuple[3]!), env);
      if (Array.isArray(out) && Array.isArray(out[0])) {
        names.forEach((nm, idx) => {
          if (nm && nm !== '_') {
            const s = (out as number[][])[idx] ?? new Array<number>(len).fill(NaN);
            env.vars.set(nm, s);
            autoPlotKeys.push({ key: nm, label: nm });
          }
        });
      }
      continue;
    }

    // plot("Label", series, "#color")
    const plotCall = cleaned.match(/^plot\(([\s\S]+)\)$/);
    if (plotCall) {
      const args = splitTopLevelArgs(plotCall[1]!);
      const pTitle = stripNamedArg(args[0] ?? '').expr.replace(/['"]/g, '').trim() || `Py Plot ${env.plots.length + 1}`;
      const series = toSeries(evalExpr(stripNamedArg(args[1] ?? 'close').expr, env), len);
      const pColor = resolveColorToken(stripNamedArg(args[2] ?? '').expr, palette[env.plots.length % palette.length]!);
      const points: Array<{ time: number; value: number }> = [];
      for (let i = 0; i < len; i++) {
        if (Number.isFinite(series[i])) points.push({ time: Math.floor(candles[i]!.timestamp / 1000), value: series[i]! });
      }
      env.plots.push({ title: pTitle, color: pColor, overlay: true, points });
      continue;
    }

    // df.loc[cond, 'signal'] = 1 | -1 | 'LONG' | 'SHORT'
    const locMatch = cleaned.match(/^df\.loc\[(.+),\s*['"]signal['"]\]\s*=\s*(.+)$/);
    if (locMatch) {
      const cond = toSeries(evalExpr(locMatch[1]!, env), len);
      const rhsRaw = locMatch[2]!.trim().toUpperCase();
      const isLong = rhsRaw === '1' || rhsRaw.includes('LONG') || rhsRaw.includes('BUY');
      const isShort = rhsRaw === '-1' || rhsRaw.includes('SHORT') || rhsRaw.includes('SELL');
      for (let i = 0; i < len; i++) {
        if (cond[i] && !Number.isNaN(cond[i])) {
          if (isLong) env.longFlags[i] = 1;
          if (isShort) env.shortFlags[i] = 1;
        }
      }
      continue;
    }

    // df['col'] = ... OR var = ...
    const dfAssign = cleaned.match(/^df\[['"]([A-Za-z0-9_]+)['"]\]\s*=\s*(.+)$/);
    const varAssign = !dfAssign ? cleaned.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/) : null;
    if (dfAssign || varAssign) {
      const target = (dfAssign ? dfAssign[1] : varAssign![1])!;
      const rhs = (dfAssign ? dfAssign[2] : varAssign![2])!;
      try {
        const val = evalExpr(rhs, env);
        env.vars.set(target, val);
        if (target === 'signal') {
          const arr = toSeries(val, len);
          for (let i = 0; i < len; i++) {
            if (arr[i] === 1) env.longFlags[i] = 1;
            else if (arr[i] === -1) env.shortFlags[i] = 1;
          }
        } else if (/^(buy|long)/i.test(target)) {
          const arr = toSeries(val, len);
          for (let i = 0; i < len; i++) if (arr[i] && !Number.isNaN(arr[i])) env.longFlags[i] = 1;
        } else if (/^(sell|short)/i.test(target)) {
          const arr = toSeries(val, len);
          for (let i = 0; i < len; i++) if (arr[i] && !Number.isNaN(arr[i])) env.shortFlags[i] = 1;
        } else if (/^(ema|sma|bb|upper|lower|mid|supertrend|vwap|st)/i.test(target)) {
          autoPlotKeys.push({ key: target, label: target });
        }
      } catch (err) {
        errors.push(`Line ${ln + 1}: ${err instanceof Error ? err.message : 'Syntax error'}`);
      }
    }
  }

  // Auto-overlay price-scaled indicator lines if user didn't call plot() explicitly
  if (env.plots.length === 0 && autoPlotKeys.length > 0) {
    const refPx = candles[candles.length - 1]?.close || 1;
    for (const item of autoPlotKeys.slice(0, 4)) {
      const s = env.vars.get(item.key);
      if (!Array.isArray(s)) continue;
      const lastFinite = [...s].reverse().find((x) => Number.isFinite(x));
      if (lastFinite === undefined) continue;
      if (lastFinite > refPx * 0.25 && lastFinite < refPx * 4) {
        const points: Array<{ time: number; value: number }> = [];
        for (let i = 0; i < len; i++) {
          if (Number.isFinite(s[i])) points.push({ time: Math.floor(candles[i]!.timestamp / 1000), value: s[i]! });
        }
        env.plots.push({
          title: item.label,
          color: palette[env.plots.length % palette.length]!,
          overlay: true,
          points,
        });
      }
    }
  }

  if (errors.length) {
    return {
      valid: false,
      language: 'python',
      title,
      overlay: true,
      errors,
      warnings: env.warnings,
      signals: [],
      plots: env.plots,
      markers: [],
      latestSignal: null,
    };
  }

  return buildFinalSignalsAndMarkers(candles, timeframe, env, title, 'python', true);
}

/* ============================================================================
 * 3. Visual No-Code Rule Builder Evaluator
 * ============================================================================ */

function evalVisualRule(rule: VisualRuleCondition, candles: Candle[], env: ExecEnv): boolean[] {
  const len = candles.length;
  const close = candles.map((c) => c.close);
  const vol = candles.map((c) => c.volume);
  const res = new Array<boolean>(len).fill(false);

  switch (rule.kind) {
    case 'EMA_CROSS_ABOVE':
    case 'EMA_CROSS_BELOW': {
      const p1 = Math.max(2, rule.param1 || 9);
      const p2 = Math.max(p1 + 1, rule.param2 || 21);
      const e1 = ema(close, p1);
      const e2 = ema(close, p2);
      const cross = rule.kind === 'EMA_CROSS_ABOVE' ? crossoverSeries(e1, e2) : crossunderSeries(e1, e2);
      if (env.plots.length < 4) {
        env.plots.push({
          title: `EMA ${p1}`,
          color: '#38e1ff',
          overlay: true,
          points: e1.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: v })).filter((x) => Number.isFinite(x.value)),
        });
        env.plots.push({
          title: `EMA ${p2}`,
          color: '#e8c15a',
          overlay: true,
          points: e2.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: v })).filter((x) => Number.isFinite(x.value)),
        });
      }
      return cross.map((x) => x === 1);
    }
    case 'PRICE_ABOVE_EMA':
    case 'PRICE_BELOW_EMA': {
      const p = Math.max(5, rule.param1 || 50);
      const e = ema(close, p);
      return close.map((c, i) => Number.isFinite(e[i]) && (rule.kind === 'PRICE_ABOVE_EMA' ? c > e[i]! : c < e[i]!));
    }
    case 'RSI_BELOW':
    case 'RSI_ABOVE': {
      const r = rsi(close, 14);
      const thr = rule.param1 || (rule.kind === 'RSI_BELOW' ? 32 : 68);
      return r.map((v) => Number.isFinite(v) && (rule.kind === 'RSI_BELOW' ? v < thr : v > thr));
    }
    case 'MACD_CROSS_UP':
    case 'MACD_CROSS_DOWN': {
      const m = macdSeries(close, 12, 26, 9);
      const cross = rule.kind === 'MACD_CROSS_UP' ? crossoverSeries(m.line, m.signalLine) : crossunderSeries(m.line, m.signalLine);
      return cross.map((x) => x === 1);
    }
    case 'BB_LOWER_TOUCH':
    case 'BB_UPPER_TOUCH': {
      const b = bollingerBands(close, Math.max(5, rule.param1 || 20), rule.param2 || 2);
      return candles.map((c, i) =>
        rule.kind === 'BB_LOWER_TOUCH'
          ? Number.isFinite(b.lower[i]) && c.close <= b.lower[i]!
          : Number.isFinite(b.upper[i]) && c.close >= b.upper[i]!
      );
    }
    case 'SUPERTREND_BULL':
    case 'SUPERTREND_BEAR': {
      const s = supertrendSeries(candles, rule.param2 || 3, Math.max(5, rule.param1 || 10));
      return s.dir.map((d) => (rule.kind === 'SUPERTREND_BULL' ? d === 1 : d === -1));
    }
    case 'VOLUME_SPIKE': {
      const vAvg = sma(vol, 20);
      const mult = rule.param1 || 1.5;
      return vol.map((v, i) => Number.isFinite(vAvg[i]) && v >= vAvg[i]! * mult);
    }
  }
  return res;
}

export function evaluateVisualStrategy(
  codeOrDef: string | VisualStrategyDefinition,
  candles: Candle[],
  timeframe: Timeframe | string = '15m'
): CustomStrategyEvalResult {
  let def: VisualStrategyDefinition;
  try {
    def = typeof codeOrDef === 'string' ? (JSON.parse(codeOrDef) as VisualStrategyDefinition) : codeOrDef;
  } catch {
    return {
      valid: false,
      language: 'visual',
      title: 'Visual Strategy',
      overlay: true,
      errors: ['Invalid Visual Strategy JSON definition.'],
      warnings: [],
      signals: [],
      plots: [],
      markers: [],
      latestSignal: null,
    };
  }

  const env = makeBaseEnv(candles);
  const len = candles.length;
  const combine = (rules: VisualRuleCondition[]) => {
    if (!rules.length) return new Array<boolean>(len).fill(false);
    const mats = rules.map((r) => evalVisualRule(r, candles, env));
    return candles.map((_, i) => (def.logic === 'ANY' ? mats.some((m) => m[i]) : mats.every((m) => m[i])));
  };

  const longs = combine(def.longRules || []);
  const shorts = combine(def.shortRules || []);
  for (let i = 0; i < len; i++) {
    if (longs[i]) env.longFlags[i] = 1;
    if (shorts[i]) env.shortFlags[i] = 1;
  }

  return buildFinalSignalsAndMarkers(
    candles,
    timeframe,
    env,
    def.name || 'Visual Strategy',
    'visual',
    true,
    def.slAtrMult || 1.8,
    def.tp1R || 1.3,
    def.tp2R || 2.4,
    def.tp3R || 3.6
  );
}

export function evaluateCustomStrategy(
  language: CustomStrategyLanguage,
  code: string,
  candles: Candle[],
  timeframe: Timeframe | string = '15m'
): CustomStrategyEvalResult {
  if (language === 'pine') return evaluatePineStrategy(code, candles, timeframe);
  if (language === 'python') return evaluatePythonStrategy(code, candles, timeframe);
  return evaluateVisualStrategy(code, candles, timeframe);
}

/* ============================================================================
 * 4. Built-in Sample Pine Script & Python Strategy Library
 * ============================================================================ */

export const SAMPLE_CUSTOM_STRATEGIES: SampleCustomStrategy[] = [
  {
    id: 'pine_ema_rsi_momentum',
    nameFa: 'Pine: تقاطع EMA 9/21 + فیلتر RSI',
    nameEn: 'Pine: EMA 9/21 Cross + RSI Filter',
    descriptionFa: 'اسکریپت استاندارد TradingView با رسم دو میانگین نمایی روی چارت و فیلتر مومنتوم RSI.',
    descriptionEn: 'TradingView Pine v5 script plotting dual EMAs on chart with RSI momentum confirmation.',
    language: 'pine',
    category: 'Trend Momentum',
    code: `//@version=5
strategy("Dollarino EMA 9/21 + RSI Momentum", overlay=true)

fastLen = input.int(9, title="Fast EMA")
slowLen = input.int(21, title="Slow EMA")
rsiLen = input.int(14, title="RSI Length")

emaFast = ta.ema(close, fastLen)
emaSlow = ta.ema(close, slowLen)
rsiVal = ta.rsi(close, rsiLen)

plot(emaFast, title="EMA 9", color=color.aqua)
plot(emaSlow, title="EMA 21", color=color.yellow)

longCond = ta.crossover(emaFast, emaSlow) and rsiVal > 48
shortCond = ta.crossunder(emaFast, emaSlow) and rsiVal < 52

strategy.entry("Long", strategy.long, when=longCond)
strategy.entry("Short", strategy.short, when=shortCond)
`,
  },
  {
    id: 'pine_bb_mean_reversion',
    nameFa: 'Pine: برگشت از باندهای بولینگر',
    nameEn: 'Pine: Bollinger Mean Reversion',
    descriptionFa: 'شناسایی اشباع خرید و فروش روی باند بولینگر ۲۰ و RSI برای ورودهای دقیق برگشتی.',
    descriptionEn: 'Mean-reversion entries at Bollinger Bands extremes confirmed by RSI 14.',
    language: 'pine',
    category: 'Mean Reversion',
    code: `//@version=5
strategy("Bollinger + RSI Reversal", overlay=true)

len = input.int(20, title="BB Period")
mult = input.float(2.0, title="Multiplier")
[bbMid, bbUpper, bbLower] = ta.bb(close, len, mult)
rsiVal = ta.rsi(close, 14)

plot(bbUpper, title="BB Upper", color=color.red)
plot(bbMid, title="BB Basis", color=color.blue)
plot(bbLower, title="BB Lower", color=color.green)

longCond = ta.crossover(close, bbLower) and rsiVal < 40
shortCond = ta.crossunder(close, bbUpper) and rsiVal > 60

strategy.entry("BB Long", strategy.long, when=longCond)
strategy.entry("BB Short", strategy.short, when=shortCond)
`,
  },
  {
    id: 'pine_supertrend_breakout',
    nameFa: 'Pine: سوپرترند ATR + فیلتر EMA 200',
    nameEn: 'Pine: SuperTrend ATR + EMA 200',
    descriptionFa: 'تشخیص تغییر روند قطعی با سوپرترند و همسو کردن معاملات با میانگین ۲۰۰ کندلی.',
    descriptionEn: 'Captures directional SuperTrend flips filtered by macro EMA 200.',
    language: 'pine',
    category: 'Trend Following',
    code: `//@version=5
strategy("SuperTrend ATR + EMA 200", overlay=true)

[stLine, stDir] = ta.supertrend(3.0, 10)
ema200 = ta.ema(close, 200)

plot(stLine, title="SuperTrend", color=color.lime)
plot(ema200, title="EMA 200", color=color.orange)

longCond = stDir > 0 and stDir[1] < 0 and close > ema200
shortCond = stDir < 0 and stDir[1] > 0 and close < ema200

strategy.entry("ST Long", strategy.long, when=longCond)
strategy.entry("ST Short", strategy.short, when=shortCond)
`,
  },
  {
    id: 'py_dorna_ema_pullback',
    nameFa: 'Python: ربات روند EMA + ATR (سبک کوانت)',
    nameEn: 'Python: Quant EMA Pullback + Bollinger',
    descriptionFa: 'کد پایتون با ساختار Pandas-TA برای شکار پولبک روند و رسم خطوط روی چارت.',
    descriptionEn: 'Pandas-style Python strategy computing EMAs and RSI with live chart overlays.',
    language: 'python',
    category: 'Python Quant',
    code: `# title: Python Quant EMA Pullback
import pandas as pd

def generate_signals(df):
    df['ema_fast'] = df['close'].ewm(span=12).mean()
    df['ema_slow'] = df['close'].ewm(span=26).mean()
    df['ema_trend'] = df['close'].ewm(span=100).mean()
    df['rsi'] = ta.rsi(df['close'], 14)

    plot("EMA 12", df['ema_fast'], "#38e1ff")
    plot("EMA 26", df['ema_slow'], "#e8c15a")
    plot("EMA 100", df['ema_trend'], "#a855f7")

    long_cond = crossover(df['ema_fast'], df['ema_slow']) & (df['close'] > df['ema_trend']) & (df['rsi'] > 45)
    short_cond = crossunder(df['ema_fast'], df['ema_slow']) & (df['close'] < df['ema_trend']) & (df['rsi'] < 55)

    df.loc[long_cond, 'signal'] = 1
    df.loc[short_cond, 'signal'] = -1
    return df
`,
  },
  {
    id: 'py_rsi_bb_scalper',
    nameFa: 'Python: اسکلپر بولینگر و RSI',
    nameEn: 'Python: Bollinger + RSI Scalper',
    descriptionFa: 'اسکریپت پایتون برای شکار بازگشت قیمت از لبه‌های بولینگر در تایم‌فریم‌های سریع.',
    descriptionEn: 'Fast Bollinger Band + RSI reversion Python bot.',
    language: 'python',
    category: 'Python Scalper',
    code: `# title: Python Bollinger & RSI Scalper
def generate_signals(df):
    bb_mid, bb_upper, bb_lower = ta.bbands(df['close'], 20, 2.0)
    df['rsi'] = ta.rsi(df['close'], 14)

    plot("BB Upper", bb_upper, "#ff4d6d")
    plot("BB Mid", bb_mid, "#2b74ff")
    plot("BB Lower", bb_lower, "#10d9a3")

    df.loc[(df['close'] < bb_lower) & (df['rsi'] < 35), 'signal'] = 1
    df.loc[(df['close'] > bb_upper) & (df['rsi'] > 65), 'signal'] = -1
    return df
`,
  },
  {
    id: 'py_donchian_breakout',
    nameFa: 'Python: شکست کانال دونچیان (Breakout)',
    nameEn: 'Python: Donchian Channel Breakout',
    descriptionFa: 'استراتژی شکست سقف و کف ۲۰ کندل اخیر برای موج‌سواری روندهای قدرتمند.',
    descriptionEn: 'Classic Turtle-style 20-bar Donchian high/low breakout Python strategy.',
    language: 'python',
    category: 'Breakout',
    code: `# title: Python Donchian Channel Breakout
def generate_signals(df):
    df['upper_ch'] = df['high'].rolling(20).max().shift(1)
    df['lower_ch'] = df['low'].rolling(20).min().shift(1)
    df['mid_ch'] = (df['upper_ch'] + df['lower_ch']) / 2

    plot("Donchian High", df['upper_ch'], "#10d9a3")
    plot("Donchian Low", df['lower_ch'], "#ff4d6d")

    df.loc[df['close'] > df['upper_ch'], 'signal'] = 1
    df.loc[df['close'] < df['lower_ch'], 'signal'] = -1
    return df
`,
  },
];
