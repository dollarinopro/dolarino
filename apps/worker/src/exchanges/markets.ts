import type { Candle, ExchangeProviderId, MarketType, Timeframe } from '@dollarino/core';
import { buildToobitRequest, normalizeProxyBaseUrl, type ToobitProxyConfig } from './proxy.js';

export const MAJOR_LIQUID_COINS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'AVAXUSDT', 'SUIUSDT', 'TONUSDT', 'LINKUSDT',
  'ADAUSDT', 'NEARUSDT', 'ARBUSDT', 'PEPEUSDT', 'TRXUSDT',
  'OPUSDT', 'LTCUSDT', 'INJUSDT', 'APTUSDT', 'WIFUSDT',
];

export interface ExchangeMarketInfo {
  symbol: string; // Canonical e.g. BTCUSDT
  exchangeSymbol: string; // Native e.g. BTC-SWAP-USDT (Toobit Futures), BTCUSDT (Toobit Spot)
  marketType?: MarketType;
  base: string;
  quote: string;
  lastPrice: string;
  changePct24h: string;
  high24h: string;
  low24h: string;
  volume24h: number;
  maxLeverage: number;
  basePrecision: number;
  quotePrecision: number;
  minTradeVolume: string;
  status: string;
}

const MARKET_CACHE = new Map<string, { ts: number; data: ExchangeMarketInfo[] }>();
const CACHE_TTL_MS = 60_000;

function countDecimals(stepStr?: string): number {
  if (!stepStr || !stepStr.includes('.')) return 0;
  const trimmed = stepStr.replace(/0+$/, '');
  const parts = trimmed.split('.');
  return parts[1]?.length ?? 0;
}

export function normalizeCanonicalSymbol(raw: string): string {
  const s = raw.toUpperCase().trim();
  if (s.includes('-SWAP-')) return s.replace('-SWAP-', '');
  if (s.includes('_')) return s.replace(/_/g, '');
  return s.replace(/[^A-Z0-9]/g, '');
}

function isStandardUsdtPerp(nativeSym: string): boolean {
  // Exclude Toobit internal broker/demo prefix pairs like TBV_BTC-SWAP-TBV_USDT
  if (!nativeSym || nativeSym.startsWith('TBV_') || nativeSym.includes('TBV_')) return false;
  return nativeSym.endsWith('-SWAP-USDT') || nativeSym.endsWith('USDT');
}

async function fetchToobitUniverse(proxyConfig?: ToobitProxyConfig): Promise<ExchangeMarketInfo[]> {
  const infoReq = buildToobitRequest('/api/v1/exchangeInfo', proxyConfig);
  const tickReq = buildToobitRequest('/quote/v1/contract/ticker/24hr', proxyConfig);
  const [infoRes, tickRes] = await Promise.all([
    fetch(infoReq.url, { headers: infoReq.headers, signal: AbortSignal.timeout(7000) }).catch(() => null),
    fetch(tickReq.url, { headers: tickReq.headers, signal: AbortSignal.timeout(7000) }).catch(() => null),
  ]);

  type ToobitContract = {
    symbol: string;
    status?: string;
    baseAssetPrecision?: string;
    quoteAsset?: string;
    filters?: Array<{ filterType?: string; tickSize?: string; stepSize?: string; minQty?: string }>;
  };
  type ToobitTicker = {
    s?: string;
    si?: string;
    c?: string;
    h?: string;
    l?: string;
    qv?: string;
    pcp?: string;
  };

  const infoMap = new Map<string, ToobitContract>();
  if (infoRes?.ok) {
    const infoJson = (await infoRes.json()) as { contracts?: ToobitContract[] };
    for (const c of infoJson.contracts ?? []) {
      if (c.symbol) infoMap.set(c.symbol.toUpperCase(), c);
    }
  }

  const out: ExchangeMarketInfo[] = [];
  if (tickRes?.ok) {
    const tickers = (await tickRes.json()) as ToobitTicker[];
    if (Array.isArray(tickers)) {
      for (const t of tickers) {
        const nativeSym = (t.s || t.si || '').toUpperCase();
        if (!isStandardUsdtPerp(nativeSym)) continue;
        const meta = infoMap.get(nativeSym);
        const priceFilter = meta?.filters?.find((f) => f.filterType === 'PRICE_FILTER');
        const lotFilter = meta?.filters?.find((f) => f.filterType === 'LOT_SIZE');
        const canonical = normalizeCanonicalSymbol(nativeSym);
        const base = canonical.endsWith('USDT') ? canonical.slice(0, -4) : canonical;
        const pct = t.pcp ? (Number(t.pcp) * 100).toFixed(2) : '0.00';
        out.push({
          symbol: canonical,
          exchangeSymbol: nativeSym,
          base,
          quote: 'USDT',
          lastPrice: t.c ?? '0',
          changePct24h: pct,
          high24h: t.h ?? t.c ?? '0',
          low24h: t.l ?? t.c ?? '0',
          volume24h: Number(t.qv ?? 0),
          maxLeverage: base === 'BTC' || base === 'ETH' ? 100 : 50,
          basePrecision: Math.max(0, countDecimals(lotFilter?.stepSize ?? meta?.baseAssetPrecision ?? '0.001')),
          quotePrecision: Math.max(1, countDecimals(priceFilter?.tickSize ?? '0.01')),
          minTradeVolume: lotFilter?.minQty ?? '0.001',
          status: meta?.status ?? 'TRADING',
        });
      }
    }
  }

  // Add any contract from exchangeInfo missing from ticker snapshot
  if (out.length === 0 && infoMap.size > 0) {
    for (const [nativeSym, meta] of infoMap.entries()) {
      if (!isStandardUsdtPerp(nativeSym)) continue;
      const canonical = normalizeCanonicalSymbol(nativeSym);
      const base = canonical.endsWith('USDT') ? canonical.slice(0, -4) : canonical;
      out.push({
        symbol: canonical,
        exchangeSymbol: nativeSym,
        base,
        quote: 'USDT',
        lastPrice: '0',
        changePct24h: '0.00',
        high24h: '0',
        low24h: '0',
        volume24h: 0,
        maxLeverage: 50,
        basePrecision: countDecimals(meta.baseAssetPrecision ?? '0.001'),
        quotePrecision: 2,
        minTradeVolume: '0.001',
        status: meta.status ?? 'TRADING',
      });
    }
  }

  return out.sort((a, b) => b.volume24h - a.volume24h);
}

async function fetchBitunixUniverse(): Promise<ExchangeMarketInfo[]> {
  const [pairsRes, tickRes] = await Promise.all([
    fetch('https://fapi.bitunix.com/api/v1/futures/market/trading_pairs', { signal: AbortSignal.timeout(7000) }).catch(() => null),
    fetch('https://fapi.bitunix.com/api/v1/futures/market/tickers', { signal: AbortSignal.timeout(7000) }).catch(() => null),
  ]);

  type BitunixPair = {
    symbol: string;
    base: string;
    quote: string;
    minTradeVolume?: string;
    basePrecision?: number;
    quotePrecision?: number;
    maxLeverage?: number;
    symbolStatus?: string;
  };
  type BitunixTicker = {
    symbol: string;
    lastPrice?: string;
    last?: string;
    open?: string;
    quoteVol?: string;
    high?: string;
    low?: string;
  };

  const tickMap = new Map<string, BitunixTicker>();
  if (tickRes?.ok) {
    const tj = (await tickRes.json()) as { code?: number; data?: BitunixTicker[] };
    for (const t of tj.data ?? []) {
      if (t.symbol) tickMap.set(t.symbol.toUpperCase(), t);
    }
  }

  const out: ExchangeMarketInfo[] = [];
  if (pairsRes?.ok) {
    const pj = (await pairsRes.json()) as { code?: number; data?: BitunixPair[] };
    for (const p of pj.data ?? []) {
      const sym = p.symbol.toUpperCase();
      const t = tickMap.get(sym);
      const last = Number(t?.lastPrice ?? t?.last ?? 0);
      const open = Number(t?.open ?? last);
      const chg = open > 0 && last > 0 ? (((last - open) / open) * 100).toFixed(2) : '0.00';
      out.push({
        symbol: sym,
        exchangeSymbol: sym,
        base: p.base || sym.replace(/USDT$/, ''),
        quote: p.quote || 'USDT',
        lastPrice: String(t?.lastPrice ?? t?.last ?? '0'),
        changePct24h: chg,
        high24h: t?.high ?? '0',
        low24h: t?.low ?? '0',
        volume24h: Number(t?.quoteVol ?? 0),
        maxLeverage: p.maxLeverage ?? 100,
        basePrecision: p.basePrecision ?? 3,
        quotePrecision: p.quotePrecision ?? 2,
        minTradeVolume: p.minTradeVolume ?? '0.001',
        status: p.symbolStatus ?? 'OPEN',
      });
    }
  }

  return out.sort((a, b) => b.volume24h - a.volume24h);
}

const FALLBACK_MARKETS: ExchangeMarketInfo[] = [
  { symbol: 'BTCUSDT', exchangeSymbol: 'BTC-SWAP-USDT', base: 'BTC', quote: 'USDT', lastPrice: '63000', changePct24h: '0.00', high24h: '63500', low24h: '62200', volume24h: 1_000_000_000, maxLeverage: 100, basePrecision: 3, quotePrecision: 2, minTradeVolume: '0.001', status: 'OPEN' },
  { symbol: 'ETHUSDT', exchangeSymbol: 'ETH-SWAP-USDT', base: 'ETH', quote: 'USDT', lastPrice: '1850', changePct24h: '0.00', high24h: '1890', low24h: '1810', volume24h: 500_000_000, maxLeverage: 100, basePrecision: 3, quotePrecision: 2, minTradeVolume: '0.001', status: 'OPEN' },
  { symbol: 'SOLUSDT', exchangeSymbol: 'SOL-SWAP-USDT', base: 'SOL', quote: 'USDT', lastPrice: '145', changePct24h: '0.00', high24h: '150', low24h: '140', volume24h: 250_000_000, maxLeverage: 75, basePrecision: 2, quotePrecision: 2, minTradeVolume: '0.01', status: 'OPEN' },
  { symbol: 'BNBUSDT', exchangeSymbol: 'BNB-SWAP-USDT', base: 'BNB', quote: 'USDT', lastPrice: '580', changePct24h: '0.00', high24h: '590', low24h: '570', volume24h: 150_000_000, maxLeverage: 75, basePrecision: 2, quotePrecision: 2, minTradeVolume: '0.01', status: 'OPEN' },
  { symbol: 'XRPUSDT', exchangeSymbol: 'XRP-SWAP-USDT', base: 'XRP', quote: 'USDT', lastPrice: '0.58', changePct24h: '0.00', high24h: '0.60', low24h: '0.56', volume24h: 120_000_000, maxLeverage: 50, basePrecision: 1, quotePrecision: 4, minTradeVolume: '1', status: 'OPEN' },
  { symbol: 'TONUSDT', exchangeSymbol: 'TON-SWAP-USDT', base: 'TON', quote: 'USDT', lastPrice: '4.80', changePct24h: '0.00', high24h: '5.00', low24h: '4.60', volume24h: 80_000_000, maxLeverage: 50, basePrecision: 1, quotePrecision: 3, minTradeVolume: '1', status: 'OPEN' },
];

async function fetchToobitSpotUniverse(proxyConfig?: ToobitProxyConfig): Promise<ExchangeMarketInfo[]> {
  const infoReq = buildToobitRequest('/api/v1/exchangeInfo', proxyConfig);
  const tickReq = buildToobitRequest('/quote/v1/ticker/24hr', proxyConfig);
  const [infoRes, tickRes] = await Promise.all([
    fetch(infoReq.url, { headers: infoReq.headers, signal: AbortSignal.timeout(7000) }).catch(() => null),
    fetch(tickReq.url, { headers: tickReq.headers, signal: AbortSignal.timeout(7000) }).catch(() => null),
  ]);

  type SpotSymbol = {
    symbol: string;
    baseAsset?: string;
    quoteAsset?: string;
    status?: string;
    baseAssetPrecision?: string;
    filters?: Array<{ filterType?: string; tickSize?: string; stepSize?: string; minQty?: string }>;
  };
  type SpotTicker = { s?: string; c?: string; h?: string; l?: string; qv?: string; pcp?: string };

  const infoMap = new Map<string, SpotSymbol>();
  if (infoRes?.ok) {
    const infoJson = (await infoRes.json()) as { symbols?: SpotSymbol[] };
    for (const s of infoJson.symbols ?? []) {
      if (s.symbol && s.symbol.toUpperCase().endsWith('USDT')) {
        infoMap.set(s.symbol.toUpperCase(), s);
      }
    }
  }

  const out: ExchangeMarketInfo[] = [];
  if (tickRes?.ok) {
    const tickers = (await tickRes.json()) as SpotTicker[];
    if (Array.isArray(tickers)) {
      for (const t of tickers) {
        const sym = (t.s || '').toUpperCase();
        if (!sym.endsWith('USDT') || sym.includes('-SWAP-') || sym.startsWith('TBV_')) continue;
        const meta = infoMap.get(sym);
        const priceFilter = meta?.filters?.find((f) => f.filterType === 'PRICE_FILTER');
        const lotFilter = meta?.filters?.find((f) => f.filterType === 'LOT_SIZE');
        const base = meta?.baseAsset || sym.slice(0, -4);
        const pct = t.pcp ? (Number(t.pcp) * 100).toFixed(2) : '0.00';
        out.push({
          symbol: sym,
          exchangeSymbol: sym,
          marketType: 'SPOT',
          base,
          quote: 'USDT',
          lastPrice: t.c ?? '0',
          changePct24h: pct,
          high24h: t.h ?? t.c ?? '0',
          low24h: t.l ?? t.c ?? '0',
          volume24h: Number(t.qv ?? 0),
          maxLeverage: 1,
          basePrecision: Math.max(0, countDecimals(lotFilter?.stepSize ?? meta?.baseAssetPrecision ?? '0.001')),
          quotePrecision: Math.max(1, countDecimals(priceFilter?.tickSize ?? '0.01')),
          minTradeVolume: lotFilter?.minQty ?? '0.001',
          status: meta?.status ?? 'TRADING',
        });
      }
    }
  }

  if (out.length === 0 && infoMap.size > 0) {
    for (const [sym, meta] of infoMap.entries()) {
      const base = meta.baseAsset || sym.slice(0, -4);
      out.push({
        symbol: sym,
        exchangeSymbol: sym,
        marketType: 'SPOT',
        base,
        quote: 'USDT',
        lastPrice: '0',
        changePct24h: '0.00',
        high24h: '0',
        low24h: '0',
        volume24h: 0,
        maxLeverage: 1,
        basePrecision: countDecimals(meta.baseAssetPrecision ?? '0.001'),
        quotePrecision: 2,
        minTradeVolume: '0.001',
        status: meta.status ?? 'TRADING',
      });
    }
  }
  return out.sort((a, b) => b.volume24h - a.volume24h);
}

async function fetchPublicSpotFallback(): Promise<ExchangeMarketInfo[]> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr', { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      symbol: string;
      lastPrice?: string;
      priceChangePercent?: string;
      highPrice?: string;
      lowPrice?: string;
      quoteVolume?: string;
    }>;
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r.symbol.endsWith('USDT') && Number(r.lastPrice ?? 0) > 0 && Number(r.quoteVolume ?? 0) > 100_000)
      .map((r) => ({
        symbol: r.symbol,
        exchangeSymbol: r.symbol,
        marketType: 'SPOT' as const,
        base: r.symbol.slice(0, -4),
        quote: 'USDT',
        lastPrice: r.lastPrice ?? '0',
        changePct24h: Number(r.priceChangePercent ?? 0).toFixed(2),
        high24h: r.highPrice ?? '0',
        low24h: r.lowPrice ?? '0',
        volume24h: Number(r.quoteVolume ?? 0),
        maxLeverage: 1,
        basePrecision: Number(r.lastPrice) >= 100 ? 3 : 2,
        quotePrecision: Number(r.lastPrice) >= 1 ? 2 : 5,
        minTradeVolume: Number(r.lastPrice) >= 100 ? '0.001' : '0.1',
        status: 'TRADING',
      }))
      .sort((a, b) => b.volume24h - a.volume24h);
  } catch {
    return [];
  }
}

export async function getExchangeMarkets(
  provider: ExchangeProviderId,
  proxyConfig?: ToobitProxyConfig,
  marketType: MarketType = 'FUTURES'
): Promise<ExchangeMarketInfo[]> {
  const proxyKey = normalizeProxyBaseUrl(proxyConfig?.proxyUrl) ?? 'direct';
  const cacheKey = `${provider}:${marketType}:${proxyKey}`;
  const cached = MARKET_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.data.length > 0) {
    return cached.data;
  }

  let list: ExchangeMarketInfo[] = [];

  if (marketType === 'SPOT') {
    if (proxyKey !== 'direct') {
      list = await fetchToobitSpotUniverse(proxyConfig);
    }
    if (list.length === 0) list = await fetchPublicSpotFallback();
    if (list.length === 0 && proxyKey === 'direct') list = await fetchToobitSpotUniverse(proxyConfig);
    if (list.length === 0) {
      const futs = await fetchBitunixUniverse();
      list = futs.map((m) => ({ ...m, marketType: 'SPOT', maxLeverage: 1 }));
    }
  } else if (provider === 'toobit') {
    if (proxyKey !== 'direct') {
      list = await fetchToobitUniverse(proxyConfig);
    }
    if (list.length === 0) list = await fetchBitunixUniverse();
    if (list.length === 0 && proxyKey === 'direct') list = await fetchToobitUniverse(proxyConfig);
  } else if (provider === 'bitunix') {
    list = await fetchBitunixUniverse();
    if (list.length === 0 && proxyKey !== 'direct') list = await fetchToobitUniverse(proxyConfig);
  } else {
    // KCEX Mirror & Paper Simulator: merge live perpetual universes
    const [tList, bList] = await Promise.all([
      proxyKey !== 'direct' ? fetchToobitUniverse(proxyConfig) : Promise.resolve([]),
      fetchBitunixUniverse(),
    ]);
    const merged = new Map<string, ExchangeMarketInfo>();
    for (const item of tList) merged.set(item.symbol, item);
    for (const item of bList) {
      if (!merged.has(item.symbol)) merged.set(item.symbol, item);
    }
    list = Array.from(merged.values()).map((item) => ({
      ...item,
      marketType: 'FUTURES',
      exchangeSymbol: provider === 'kcex' ? `${item.base}_${item.quote}` : item.symbol,
    }));
    list.sort((a, b) => b.volume24h - a.volume24h);
  }

  if (list.length === 0) {
    list = FALLBACK_MARKETS.map((m) => ({
      ...m,
      marketType,
      maxLeverage: marketType === 'SPOT' ? 1 : m.maxLeverage,
    }));
  }
  MARKET_CACHE.set(cacheKey, { ts: Date.now(), data: list });
  return list;
}

export async function findMarketSpec(
  provider: ExchangeProviderId,
  symbol: string,
  proxyConfig?: ToobitProxyConfig,
  marketType: MarketType = 'FUTURES'
): Promise<ExchangeMarketInfo | undefined> {
  const canonical = normalizeCanonicalSymbol(symbol);
  const all = await getExchangeMarkets(provider, proxyConfig, marketType);
  return all.find((m) => m.symbol === canonical || m.exchangeSymbol.toUpperCase() === symbol.toUpperCase());
}

function tfDurationMs(tf: Timeframe | string): number {
  const map: Record<string, number> = {
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
  return map[tf] ?? 900_000;
}

export async function fetchBitunixKlinesFallback(symbol: string, tf: Timeframe, limit = 200): Promise<Candle[]> {
  const clean = normalizeCanonicalSymbol(symbol);
  const target = Math.max(20, Math.min(limit, 1200));
  const stepMs = tfDurationMs(tf);
  const byTs = new Map<number, Candle>();
  let endTime: number | undefined;
  const maxBatches = Math.ceil(target / 200) + 1;

  for (let b = 0; b < maxBatches && byTs.size < target; b++) {
    try {
      const url = new URL('https://fapi.bitunix.com/api/v1/futures/market/kline');
      url.searchParams.set('symbol', clean);
      url.searchParams.set('interval', tf);
      url.searchParams.set('limit', '200');
      if (endTime !== undefined) url.searchParams.set('endTime', String(endTime));

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) break;
      const json = (await res.json()) as {
        code?: number;
        data?: Array<{ time: string; open: string; high: string; low: string; close: string; baseVol?: string; quoteVol?: string }>;
      };
      const rows = Array.isArray(json.data) ? json.data : [];
      if (rows.length === 0) break;

      let minTs = Infinity;
      let added = 0;
      for (const r of rows) {
        const ts = Number(r.time);
        const close = Number(r.close);
        if (!Number.isFinite(ts) || !Number.isFinite(close) || close <= 0) continue;
        if (ts < minTs) minTs = ts;
        if (!byTs.has(ts)) added++;
        byTs.set(ts, {
          timestamp: ts,
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close,
          volume: Number(r.quoteVol ?? r.baseVol ?? 0),
        });
      }

      if (rows.length < 180 || added === 0 || !Number.isFinite(minTs)) break;
      endTime = minTs - stepMs;
    } catch {
      break;
    }
  }

  return Array.from(byTs.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-target);
}
