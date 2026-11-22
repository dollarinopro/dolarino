import type { Candle, Direction, InstrumentSpec, MarketType, Timeframe } from '@dollarino/core';
import type { ExchangePosition, FuturesBalance, IExchangeAdapter, Market24hStats, OrderResult, PlaceOrderParams } from './base.js';
import { fetchBitunixKlinesFallback, findMarketSpec, normalizeCanonicalSymbol } from './markets.js';
import { buildToobitRequest, normalizeProxyBaseUrl, type ToobitProxyConfig } from './proxy.js';

const FALLBACK_PRICES: Record<string, number> = {
  BTCUSDT: 72000,
  ETHUSDT: 1750,
  SOLUSDT: 115,
  BNBUSDT: 580,
  XRPUSDT: 1.45,
  TONUSDT: 1.75,
  DOGEUSDT: 0.14,
  ADAUSDT: 0.35,
  AVAXUSDT: 18,
};

function tfToMs(tf: Timeframe): number {
  const m: Record<Timeframe, number> = {
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

export async function fetchPublicMarket24h(symbol: string, proxyConfig?: ToobitProxyConfig): Promise<Market24hStats> {
  const clean = normalizeCanonicalSymbol(symbol);
  const toobitSym = clean.endsWith('USDT') ? `${clean.slice(0, -4)}-SWAP-USDT` : clean;
  const hasProxy = Boolean(normalizeProxyBaseUrl(proxyConfig?.proxyUrl));

  let fundingRate = '0.0001';
  if (hasProxy) {
    try {
      const fReq = buildToobitRequest(`/api/v1/futures/fundingRate?symbol=${toobitSym}`, proxyConfig);
      const fRes = await fetch(fReq.url, { headers: fReq.headers, signal: AbortSignal.timeout(3000) });
      if (fRes.ok) {
        const fJson = await fRes.json() as Array<{ rate?: string }> | { rate?: string };
        const item = Array.isArray(fJson) ? fJson[0] : fJson;
        if (item?.rate) fundingRate = String((Number(item.rate) * 100).toFixed(4));
      }
    } catch { /* ignore */ }

    try {
      const tReq = buildToobitRequest(`/quote/v1/contract/ticker/24hr?symbol=${toobitSym}`, proxyConfig);
      const res = await fetch(tReq.url, { headers: tReq.headers, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const arr = await res.json() as Array<{
          c?: string;
          h?: string;
          l?: string;
          o?: string;
          b?: string;
          a?: string;
          qv?: string;
          pcp?: string;
        }>;
        const item = Array.isArray(arr) ? arr[0] : undefined;
        if (item?.c) {
          const pct = item.pcp ? (Number(item.pcp) * 100).toFixed(2) : '0.00';
          return {
            symbol: clean,
            lastPrice: item.c,
            changePct24h: pct,
            high24h: item.h ?? item.c,
            low24h: item.l ?? item.c,
            volume24h: item.qv ? Math.round(Number(item.qv)).toLocaleString() : '0',
            fundingRate,
            bestBid: item.b ?? item.c,
            bestAsk: item.a ?? item.c,
          };
        }
      }
    } catch { /* fallback */ }
  }

  try {
    const res = await fetch(`https://fapi.bitunix.com/api/v1/futures/market/tickers?symbols=${clean}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = await res.json() as {
        code?: number;
        data?: Array<{ lastPrice?: string; last?: string; open?: string; high?: string; low?: string; quoteVol?: string }>;
      };
      const item = json.data?.[0];
      const last = Number(item?.lastPrice ?? item?.last ?? 0);
      if (last > 0) {
        const open = Number(item?.open ?? last);
        const pct = open > 0 ? (((last - open) / open) * 100).toFixed(2) : '0.00';
        return {
          symbol: clean,
          lastPrice: String(item?.lastPrice ?? item?.last),
          changePct24h: pct,
          high24h: item?.high ?? String(last),
          low24h: item?.low ?? String(last),
          volume24h: item?.quoteVol ? Math.round(Number(item.quoteVol)).toLocaleString() : '0',
          fundingRate,
          bestBid: String(last),
          bestAsk: String(last),
        };
      }
    }
  } catch { /* fallback */ }

  const spec = await findMarketSpec('paper', clean, proxyConfig).catch(() => undefined);
  if (spec && Number(spec.lastPrice) > 0) {
    return {
      symbol: clean,
      lastPrice: spec.lastPrice,
      changePct24h: spec.changePct24h,
      high24h: spec.high24h,
      low24h: spec.low24h,
      volume24h: Math.round(spec.volume24h).toLocaleString(),
      fundingRate,
      bestBid: spec.lastPrice,
      bestAsk: spec.lastPrice,
    };
  }

  const px = await fetchPublicTickerPrice(clean, proxyConfig);
  return {
    symbol: clean,
    lastPrice: px,
    changePct24h: '0.00',
    high24h: px,
    low24h: px,
    volume24h: '0',
    fundingRate,
    bestBid: px,
    bestAsk: px,
  };
}

export async function fetchPublicTickerPrice(symbol: string, proxyConfig?: ToobitProxyConfig): Promise<string> {
  const clean = normalizeCanonicalSymbol(symbol);
  const toobitSym = clean.endsWith('USDT') ? `${clean.slice(0, -4)}-SWAP-USDT` : clean;
  if (normalizeProxyBaseUrl(proxyConfig?.proxyUrl)) {
    try {
      const req = buildToobitRequest(`/quote/v1/contract/ticker/price?symbol=${toobitSym}`, proxyConfig);
      const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json() as Array<{ p?: string; price?: string }> | { p?: string; price?: string };
        const item = Array.isArray(data) ? data[0] : data;
        const p = item?.p ?? item?.price;
        if (p && Number(p) > 0) return String(p);
      }
    } catch { /* fall through */ }
  }

  try {
    const res = await fetch(`https://fapi.bitunix.com/api/v1/futures/market/tickers?symbols=${clean}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = await res.json() as { data?: Array<{ lastPrice?: string; last?: string }> };
      const p = json.data?.[0]?.lastPrice ?? json.data?.[0]?.last;
      if (p && Number(p) > 0) return String(p);
    }
  } catch { /* fall through */ }

  const spec = await findMarketSpec('paper', clean, proxyConfig).catch(() => undefined);
  if (spec && Number(spec.lastPrice) > 0) return spec.lastPrice;

  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${clean}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json() as { price?: string };
      if (data.price && Number(data.price) > 0) return String(data.price);
    }
  } catch { /* fall through */ }

  // Public OKX & Coinbase ticker fallbacks (high uptime on Cloudflare edge)
  try {
    const base = clean.replace(/USDT$/, '');
    const okxRes = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(`${base}-USDT`)}`, {
      signal: AbortSignal.timeout(3500),
    });
    if (okxRes.ok) {
      const json = await okxRes.json() as { data?: Array<{ last?: string }> };
      const p = json.data?.[0]?.last;
      if (p && Number(p) > 0) return String(p);
    }
  } catch { /* fall through */ }

  try {
    const base = clean.replace(/USDT$/, '');
    const cbRes = await fetch(`https://api.coinbase.com/v2/prices/${encodeURIComponent(base)}-USD/spot`, {
      signal: AbortSignal.timeout(3500),
    });
    if (cbRes.ok) {
      const json = await cbRes.json() as { data?: { amount?: string } };
      const p = json.data?.amount;
      if (p && Number(p) > 0) return String(p);
    }
  } catch { /* fall through */ }

  // Public Bitget USDT-Futures fallback (covers hundreds of altcoins & meme pairs)
  try {
    const bgRes = await fetch(
      `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${clean}&productType=USDT-FUTURES`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (bgRes.ok) {
      const json = (await bgRes.json()) as { data?: Array<{ symbol?: string; lastPr?: string; markPrice?: string }> };
      const item = json.data?.[0];
      const p = item?.symbol?.toUpperCase() === clean ? (item.lastPr ?? item.markPrice) : undefined;
      if (p && Number(p) > 0) return String(p);
    }
  } catch { /* fall through */ }

  // Never inject a hardcoded 100 price for arbitrary altcoins/memecoins
  return FALLBACK_PRICES[clean] ? String(FALLBACK_PRICES[clean]) : '0';
}

export async function fetchPublicOrderBook(symbol: string, limit = 15, proxyConfig?: ToobitProxyConfig): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
  const clean = normalizeCanonicalSymbol(symbol);
  const toobitSym = clean.endsWith('USDT') ? `${clean.slice(0, -4)}-SWAP-USDT` : clean;
  if (normalizeProxyBaseUrl(proxyConfig?.proxyUrl)) {
    try {
      const req = buildToobitRequest(`/quote/v1/depth?symbol=${toobitSym}&limit=${limit}`, proxyConfig);
      const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json() as { b?: [string, string][]; a?: [string, string][]; bids?: [string, string][]; asks?: [string, string][] };
        const bids = (data.b ?? data.bids ?? []).slice(0, limit);
        const asks = (data.a ?? data.asks ?? []).slice(0, limit);
        if (bids.length || asks.length) return { bids, asks };
      }
    } catch { /* fallback */ }
  }

  try {
    const res = await fetch(`https://fapi.bitunix.com/api/v1/futures/market/depth?symbol=${clean}&limit=${limit}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = await res.json() as { data?: { bids?: [string, string][]; asks?: [string, string][] } };
      const bids = (json.data?.bids ?? []).slice(0, limit);
      const asks = (json.data?.asks ?? []).slice(0, limit);
      if (bids.length || asks.length) return { bids, asks };
    }
  } catch { /* fallback */ }

  const price = Number(await fetchPublicTickerPrice(clean, proxyConfig));
  if (!Number.isFinite(price) || price <= 0) return { bids: [], asks: [] };
  const step = price * 0.00025;
  const bids: [string, string][] = [];
  const asks: [string, string][] = [];
  const dp = price >= 100 ? 2 : price >= 1 ? 4 : 6;
  for (let i = 1; i <= limit; i++) {
    bids.push([(price - step * i).toFixed(dp), (0.18 * i).toFixed(3)]);
    asks.push([(price + step * i).toFixed(dp), (0.16 * i).toFixed(3)]);
  }
  return { bids, asks };
}

export async function fetchPublicKlines(symbol: string, tf: Timeframe, limit = 200, proxyConfig?: ToobitProxyConfig): Promise<Candle[]> {
  const clean = normalizeCanonicalSymbol(symbol);
  const toobitSym = clean.endsWith('USDT') ? `${clean.slice(0, -4)}-SWAP-USDT` : clean;

  if (normalizeProxyBaseUrl(proxyConfig?.proxyUrl)) {
    try {
      const req = buildToobitRequest(`/quote/v1/klines?symbol=${toobitSym}&interval=${tf}&limit=${limit}`, proxyConfig);
      const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const rows = await res.json() as Array<[number, string, string, string, string, string]>;
        if (Array.isArray(rows) && rows.length > 5) {
          return rows.map((r) => ({
            timestamp: Number(r[0]),
            open: Number(r[1]),
            high: Number(r[2]),
            low: Number(r[3]),
            close: Number(r[4]),
            volume: Number(r[5]),
          }));
        }
      }
    } catch { /* fall through */ }
  }

  const bitunixRows = await fetchBitunixKlinesFallback(clean, tf, limit);
  if (bitunixRows.length > 5) return bitunixRows;

  try {
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${clean}&interval=${tf}&limit=${limit}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const rows = await res.json() as Array<[number, string, string, string, string, string]>;
      if (Array.isArray(rows) && rows.length > 5) {
        return rows.map((r) => ({
          timestamp: Number(r[0]),
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5]),
        }));
      }
    }
  } catch { /* fall through */ }

  // Verified Bitget USDT-Futures fallback (guard exact symbol match via ticker check)
  try {
    const tkRes = await fetch(
      `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${clean}&productType=USDT-FUTURES`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (tkRes.ok) {
      const tkJson = (await tkRes.json()) as { data?: Array<{ symbol?: string }> };
      if (tkJson.data?.[0]?.symbol?.toUpperCase() === clean) {
        const bgTfMap: Record<string, string> = {
          '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
          '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '1d': '1D',
        };
        const gran = bgTfMap[tf] ?? '15m';
        const klRes = await fetch(
          `https://api.bitget.com/api/v2/mix/market/candles?symbol=${clean}&productType=USDT-FUTURES&granularity=${gran}&limit=${Math.min(1000, limit)}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (klRes.ok) {
          const klJson = (await klRes.json()) as { data?: Array<[string, string, string, string, string, string, string?]> };
          const rows = Array.isArray(klJson.data) ? klJson.data : [];
          if (rows.length > 5) {
            return rows
              .map((r) => ({
                timestamp: Number(r[0]),
                open: Number(r[1]),
                high: Number(r[2]),
                low: Number(r[3]),
                close: Number(r[4]),
                volume: Number(r[6] ?? r[5] ?? 0),
              }))
              .sort((a, b) => a.timestamp - b.timestamp);
          }
        }
      }
    }
  } catch { /* fall through */ }

  const spec = await findMarketSpec('paper', clean, proxyConfig).catch(() => undefined);
  const base = spec && Number(spec.lastPrice) > 0 ? Number(spec.lastPrice) : (FALLBACK_PRICES[clean] ?? 100);
  const stepMs = tfToMs(tf);
  const now = Math.floor(Date.now() / stepMs) * stepMs;
  const candles: Candle[] = [];
  let px = base;
  for (let i = limit; i >= 1; i--) {
    const ts = now - i * stepMs;
    const delta = Math.sin(i * 0.27) * base * 0.004 + Math.cos(i * 0.11) * base * 0.002;
    const open = px;
    const close = Math.max(base * 0.2, open + delta);
    const high = Math.max(open, close) + base * 0.0025;
    const low = Math.min(open, close) - base * 0.0025;
    candles.push({ timestamp: ts, open, high, low, close, volume: 120 + (i % 35) * 18 });
    px = close;
  }
  return candles;
}

export class PaperExchangeAdapter implements IExchangeAdapter {
  readonly provider = 'paper' as const;

  constructor(
    private db: D1Database,
    private userId: string,
    private proxyConfig?: ToobitProxyConfig
  ) {}

  async testConnection() {
    const balance = await this.getBalance();
    return { ok: true, message: 'Paper Simulator connected to live perpetual market quotes', balance };
  }

  async getBalance(): Promise<FuturesBalance> {
    const cfg = await this.db.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
      .bind(this.userId)
      .first<{ paper_balance: string }>();
    const openRows = await this.db.prepare(
      `SELECT COALESCE(SUM(CAST(margin_used AS REAL)), 0) as used FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = 'PAPER'`
    ).bind(this.userId).first<{ used: number }>();

    const free = Number(cfg?.paper_balance ?? '10000');
    const used = Number(openRows?.used ?? 0);
    return {
      free: free.toFixed(2),
      used: used.toFixed(2),
      total: (free + used).toFixed(2),
      currency: 'USDT',
    };
  }

  async getTickerPrice(symbol: string): Promise<string> {
    return fetchPublicTickerPrice(symbol, this.proxyConfig);
  }

  async getMarket24h(symbol: string): Promise<Market24hStats> {
    return fetchPublicMarket24h(symbol, this.proxyConfig);
  }

  async getKlines(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    return fetchPublicKlines(symbol, timeframe, limit, this.proxyConfig);
  }

  async getOrderBook(symbol: string, limit = 15) {
    return fetchPublicOrderBook(symbol, limit, this.proxyConfig);
  }

  async getInstrumentSpec(symbol: string, marketType: MarketType = 'FUTURES'): Promise<InstrumentSpec> {
    const clean = normalizeCanonicalSymbol(symbol);
    const live = await findMarketSpec('paper', clean, this.proxyConfig, marketType).catch(() => undefined);
    if (live) {
      return {
        symbol: clean,
        basePrecision: live.basePrecision,
        quotePrecision: live.quotePrecision,
        minTradeVolume: live.minTradeVolume,
        maxMarketVolume: '1000000',
        minNotional: '5',
        minLeverage: 1,
        maxLeverage: marketType === 'SPOT' ? 1 : live.maxLeverage,
        status: 'OPEN',
      };
    }
    const isBtc = clean.startsWith('BTC');
    return {
      symbol: clean,
      basePrecision: isBtc ? 3 : 2,
      quotePrecision: 2,
      minTradeVolume: isBtc ? '0.001' : '0.01',
      maxMarketVolume: '100',
      minNotional: '5',
      minLeverage: 1,
      maxLeverage: marketType === 'SPOT' ? 1 : 100,
      status: 'OPEN',
    };
  }

  async getPositions(): Promise<ExchangePosition[]> {
    const rows = await this.db.prepare(
      `SELECT symbol, direction, remaining_quantity, entry_price, leverage, current_stop_loss, tp1
       FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = 'PAPER'`
    ).bind(this.userId).all<{
      symbol: string;
      direction: Direction;
      remaining_quantity: string;
      entry_price: string;
      leverage: number;
      current_stop_loss: string;
      tp1: string;
    }>();

    const out: ExchangePosition[] = [];
    for (const r of rows.results) {
      const mark = Number(await this.getTickerPrice(r.symbol));
      const entry = Number(r.entry_price);
      const qty = Number(r.remaining_quantity);
      const uPnl = r.direction === 'LONG' ? (mark - entry) * qty : (entry - mark) * qty;
      out.push({
        symbol: r.symbol,
        direction: r.direction,
        quantity: r.remaining_quantity,
        entryPrice: r.entry_price,
        markPrice: String(mark),
        unrealizedPnl: uPnl.toFixed(2),
        leverage: r.leverage,
        stopLoss: r.current_stop_loss,
        takeProfit: r.tp1,
      });
    }
    return out;
  }

  async setLeverage(): Promise<void> {}

  async placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const price = params.price && Number(params.price) > 0 ? params.price : await this.getTickerPrice(params.symbol);
    const notional = Number(price) * Number(params.quantity);
    const fee = (notional * 0.0005).toFixed(4);
    return {
      orderId: `paper_ord_${Date.now()}`,
      clientOrderId: params.clientOrderId,
      filledPrice: price,
      filledQty: params.quantity,
      fee,
    };
  }

  async updatePositionStopLoss(): Promise<void> {}

  async closePositionPartialOrFull(symbol: string, _dir: Direction, quantity: string, clientOrderId: string, _marketType: MarketType = 'FUTURES'): Promise<OrderResult> {
    let price = await this.getTickerPrice(symbol);
    if (!(Number(price) > 0)) {
      const klines = await this.getKlines(symbol, '5m', 3).catch(() => []);
      if (klines.length > 0 && klines[klines.length - 1]!.close > 0) {
        price = String(klines[klines.length - 1]!.close);
      } else {
        const openTrade = await this.db.prepare(
          `SELECT entry_price FROM trades WHERE user_id = ? AND symbol = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`
        ).bind(this.userId, symbol).first<{ entry_price: string }>().catch(() => null);
        price = openTrade?.entry_price && Number(openTrade.entry_price) > 0 ? openTrade.entry_price : '0';
      }
    }
    if (!(Number(price) > 0)) {
      throw new Error(`No reliable live price available to close ${symbol}`);
    }
    const fee = (Number(price) * Number(quantity) * 0.0005).toFixed(4);
    return {
      orderId: `paper_cls_${Date.now()}`,
      clientOrderId,
      filledPrice: price,
      filledQty: quantity,
      fee,
    };
  }
}
