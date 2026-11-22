import type { Direction, DollarinoSignal } from './types.js';

function cleanNumeric(raw: string): string {
  return raw.replace(/[,$\s%]/g, '').trim();
}

function calcLeveragedPct(entry: number, target: number, leverage: number, direction: Direction): string {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(target)) return '0.00';
  const sign = direction === 'SHORT' ? -1 : 1;
  const pct = ((target - entry) / entry) * 100 * leverage * sign;
  return pct.toFixed(2);
}

export function resolveEngineDisplayLabel(engineKey?: string | null, explicitLabel?: string | null): string {
  if (explicitLabel && explicitLabel.trim()) return explicitLabel.trim();
  const key = (engineKey || '').toLowerCase();
  switch (key) {
    case 'ai_autonomous_agent':
    case 'ai_agent':
      return '🧠 هوش مصنوعی دلارینو';
    case 'my_custom_ai':
      return '🤖 هوش مصنوعی خام (شخصی)';
    case 'copy_trade':
    case 'copy_trader':
      return '🏆 کپی‌ترید تاییدشده دلارینو';
    case 'dollarino_v01':
      return '🎯 استراتژی شکار · دُرنا V1';
    case 'kbos_v11':
      return '🎯 استراتژی شکار · KBOS Super v11';
    case 'sp2l':
      return '🎯 استراتژی شکار · شکار نقدینگی (SP2L)';
    case 'ema_trend_pullback':
      return '🎯 استراتژی شکار · روند EMA';
    case 'signal_mixer':
      return '🎯 استراتژی شکار · میکسر ۸ کاناله';
    case 'custom_pine':
    case 'custom_python':
    case 'custom_visual':
      return '🎯 استراتژی شکار · استراتژی شخصی کاربر';
    case 'tradingview_webhook':
      return '📡 وب‌هوک TradingView';
    case 'telegram_channel':
      return '📡 کانال رسمی دلارینو';
    case 'manual_terminal':
    case 'manual_test':
      return '⚡️ ترمینال دستی دلارینو';
    default:
      return key ? `🎯 استراتژی شکار (${engineKey})` : '🎯 استراتژی منتخب دلارینو';
  }
}

/**
 * Parses both classic & extended Dollarino Telegram/TradingView signal text OR JSON webhook payloads.
 */
export function parseDollarinoSignal(input: string | Record<string, unknown>): DollarinoSignal | null {
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    const rawSide = String(obj.direction ?? obj.side ?? obj.action ?? '').toUpperCase();
    const direction: Direction | null =
      rawSide.includes('BUY') || rawSide.includes('LONG') ? 'LONG'
        : rawSide.includes('SELL') || rawSide.includes('SHORT') ? 'SHORT'
        : null;
    const symbol = String(obj.symbol ?? obj.ticker ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const price = cleanNumeric(String(obj.price ?? obj.entry ?? obj.close ?? ''));
    const stopLoss = cleanNumeric(String(obj.stopLoss ?? obj.stop ?? obj.sl ?? ''));
    const tp1 = cleanNumeric(String(obj.tp1 ?? obj.TP1 ?? obj.takeProfit1 ?? ''));
    if (!direction || !symbol || !price || !stopLoss || !tp1) return null;

    const leverage = Math.max(1, Math.round(Number(obj.leverage ?? 1)));
    const tp2 = obj.tp2 || obj.TP2 ? cleanNumeric(String(obj.tp2 ?? obj.TP2)) : undefined;
    const tp3 = obj.tp3 || obj.TP3 ? cleanNumeric(String(obj.tp3 ?? obj.TP3)) : undefined;
    const timeframe = String(obj.timeframe ?? obj.interval ?? obj.tf ?? '15m').trim();
    const channelHandle = String(obj.channelHandle ?? '@Dollarino_official').trim();
    const engineKey = obj.engineKey ? String(obj.engineKey) : undefined;
    const engineLabel = obj.engineLabel ? String(obj.engineLabel) : undefined;

    return enrichSignalPercentages({
      symbol,
      direction,
      timeframe,
      price,
      stopLoss,
      leverage,
      tp1,
      tp2,
      tp3,
      channelHandle,
      engineKey,
      engineLabel,
      reason: obj.reason ? String(obj.reason) : undefined,
    });
  }

  const text = String(input).trim();
  if (!text) return null;

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return parseDollarinoSignal(parsed);
    } catch {
      // fall through to text parser
    }
  }

  let direction: Direction | null = null;
  if (/buy\s*(?:\/\s*long)?\s*signal|🟢|\blong\b|\bbuy\b|خرید|لانگ/i.test(text)) {
    direction = 'LONG';
  }
  if (/sell\s*(?:\/\s*short)?\s*signal|🔴|\bshort\b|\bsell\b|فروش|شورت/i.test(text)) {
    if (!direction || !/buy\s*signal|🟢\s*buy/i.test(text)) {
      direction = 'SHORT';
    }
  }
  if (!direction) return null;

  const symbolMatch =
    text.match(/symbol\s*[:：]\s*#?([A-Za-z0-9._/-]+)/i) ||
    text.match(/#([A-Za-z]{2,12}[/_-]?USDT?)\b/i) ||
    text.match(/\b([A-Za-z]{2,10}USDT)\b/i);

  const tfMatch =
    text.match(/time\s*frame\s*[:：]\s*([A-Za-z0-9]+)/i) ||
    text.match(/\|\s*([0-9]+[mhdw]?)\b/i);

  const engineMatch = text.match(/(?:engine|موتور)\s*[:：]\s*([^\n]+)/i);
  const priceMatch = text.match(/(?:^|\n)[^\n]*?(?:\bprice|\bentry(?:\s*price)?|نقطه\s*ورود|ورود)\s*[:：]\s*\$?([0-9.,]+|market|مارکت|لحظه‌ای|لحظه\s*ای)/i);
  const stopMatch = text.match(/(?:^|\n)[^\n]*?(?:\bstop(?:\s*loss)?|\bsl\b|حد\s*ضرر|استاپ)\s*[:：]\s*\$?([0-9.,]+)/i);
  const levMatch = text.match(/(?:\bleverage|\blev|اهرم)\s*[:：]?\s*(\d+)x?/i) || text.match(/(\d+)\s*x\b/i);
  const tp1Match = text.match(/(?:\btp\s*1|\btake\s*profit\s*1|تارگت\s*1)\s*[:：]\s*\$?([0-9.,]+)/i);
  const tp2Match = text.match(/(?:\btp\s*2|\btake\s*profit\s*2|تارگت\s*2)\s*[:：]\s*\$?([0-9.,]+)/i);
  const tp3Match = text.match(/(?:\btp\s*3|\btake\s*profit\s*3|تارگت\s*3)\s*[:：]\s*\$?([0-9.,]+)/i);
  const slPctMatch = text.match(/🧨\s*SL\s*[:：]\s*%?\s*([-+]?[0-9.]+)/i);
  const tp1PctMatch = text.match(/🎯\s*TP\s*1\s*[:：]\s*%?\s*([-+]?[0-9.]+)/i);
  const tp2PctMatch = text.match(/🎯\s*TP\s*2\s*[:：]\s*%?\s*([-+]?[0-9.]+)/i);
  const tp3PctMatch = text.match(/🎯\s*TP\s*3\s*[:：]\s*%?\s*([-+]?[0-9.]+)/i);
  const handleMatch = text.match(/(@[A-Za-z0-9_]+)/);

  if (!symbolMatch?.[1] || !stopMatch?.[1] || !tp1Match?.[1]) {
    return null;
  }

  let symbol = symbolMatch[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!symbol.endsWith('USDT') && !symbol.endsWith('USD') && symbol.length <= 6) {
    symbol = `${symbol}USDT`;
  }

  const rawPrice = priceMatch?.[1] ?? '0';
  const normalizedPrice = /^(market|مارکت|لحظه‌ای|لحظه\s*ای)$/i.test(rawPrice) ? '0' : cleanNumeric(rawPrice);

  const signal: DollarinoSignal = {
    symbol,
    direction,
    timeframe: tfMatch?.[1]?.trim() ?? '15m',
    price: normalizedPrice,
    stopLoss: cleanNumeric(stopMatch[1]),
    leverage: Math.max(1, Number(levMatch?.[1] ?? '1')),
    tp1: cleanNumeric(tp1Match[1]),
    tp2: tp2Match?.[1] ? cleanNumeric(tp2Match[1]) : undefined,
    tp3: tp3Match?.[1] ? cleanNumeric(tp3Match[1]) : undefined,
    slPct: slPctMatch?.[1],
    tp1Pct: tp1PctMatch?.[1],
    tp2Pct: tp2PctMatch?.[1],
    tp3Pct: tp3PctMatch?.[1],
    engineLabel: engineMatch?.[1]?.trim(),
    channelHandle: handleMatch?.[1] ?? '@Dollarino_official',
  };

  return enrichSignalPercentages(signal);
}

export function enrichSignalPercentages(signal: DollarinoSignal): DollarinoSignal {
  const entry = Number(signal.price);
  const sl = Number(signal.stopLoss);
  const tp1 = Number(signal.tp1);
  const lev = Math.max(1, signal.leverage);

  return {
    ...signal,
    slPct: signal.slPct ?? calcLeveragedPct(entry, sl, lev, signal.direction),
    tp1Pct: signal.tp1Pct ?? calcLeveragedPct(entry, tp1, lev, signal.direction),
    tp2Pct: signal.tp2Pct ?? (signal.tp2 ? calcLeveragedPct(entry, Number(signal.tp2), lev, signal.direction) : undefined),
    tp3Pct: signal.tp3Pct ?? (signal.tp3 ? calcLeveragedPct(entry, Number(signal.tp3), lev, signal.direction) : undefined),
    channelHandle: signal.channelHandle ?? '@Dollarino_official',
  };
}

/**
 * Formats a signal in the exact Dollarino Channel & Bot specification (with Engine badge).
 */
export function formatDollarinoSignal(rawSignal: DollarinoSignal): string {
  const sig = enrichSignalPercentages(rawSignal);
  const divider = '------------------------------------------------';
  const header = sig.direction === 'LONG' ? '🟢 Buy signal' : '🔴 Sell signal';
  const engineLine = sig.engineLabel || (sig.engineKey ? resolveEngineDisplayLabel(sig.engineKey) : null);

  const lines = [header, divider];
  if (engineLine) {
    lines.push(`⚙️ Engine: ${engineLine}`, divider);
  }
  lines.push(
    `💲 Symbol: ${sig.symbol}`,
    divider,
    `⌛️ Time Frame: ${sig.timeframe}`,
    divider,
    `🔔 Price: ${sig.price === '0' ? 'Market' : sig.price}`,
    divider,
    `⛔️ Stop: ${sig.stopLoss}`,
    divider,
    `🔘 Leverage: ${sig.leverage}`,
    divider,
    `🟢 TP1: ${sig.tp1}`,
  );

  if (sig.tp2) lines.push(`🟡 TP2: ${sig.tp2}`);
  if (sig.tp3) lines.push(`🟠 TP3: ${sig.tp3}`);

  lines.push(divider);
  lines.push(`🧨 SL: %${sig.slPct ?? '0.00'}`);
  lines.push(`🎯 TP1: %${sig.tp1Pct ?? '0.00'}`);
  if (sig.tp2 && sig.tp2Pct !== undefined) lines.push(`🎯 TP2: %${sig.tp2Pct}`);
  if (sig.tp3 && sig.tp3Pct !== undefined) lines.push(`🎯 TP3: %${sig.tp3Pct}`);
  lines.push(divider);
  lines.push(`🆔 ${sig.channelHandle ?? '@Dollarino_official'}`);

  return lines.join('\n');
}
