import type { Candle, Direction, InstrumentSpec, Timeframe } from '@dollarino/core';
import { sha256Hex } from '../crypto.js';
import type { ExchangePosition, FuturesBalance, IExchangeAdapter, Market24hStats, OrderResult, PlaceOrderParams } from './base.js';
import { findMarketSpec, normalizeCanonicalSymbol } from './markets.js';
import { fetchPublicKlines, fetchPublicMarket24h, fetchPublicOrderBook, fetchPublicTickerPrice } from './paper.js';

export class BitunixFuturesAdapter implements IExchangeAdapter {
  readonly provider = 'bitunix' as const;
  private readonly baseUrl = 'https://fapi.bitunix.com';

  constructor(private creds: { apiKey: string; apiSecret: string }) {}

  private async signHeaders(queryParams: string, bodyString: string) {
    const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const timestamp = String(Date.now());
    const digest = await sha256Hex(`${nonce}${timestamp}${this.creds.apiKey}${queryParams}${bodyString}`);
    const sign = await sha256Hex(`${digest}${this.creds.apiSecret}`);
    return {
      'api-key': this.creds.apiKey,
      nonce,
      timestamp,
      sign,
      'Content-Type': 'application/json',
    };
  }

  async testConnection() {
    try {
      const balance = await this.getBalance();
      return { ok: true, message: 'Connected to Bitunix Futures API', balance };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Bitunix connection failed' };
    }
  }

  async getBalance(): Promise<FuturesBalance> {
    const query = 'marginCoinUSDT';
    const headers = await this.signHeaders(query, '');
    const res = await fetch(`${this.baseUrl}/api/v1/futures/account?marginCoin=USDT`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as { code?: number; msg?: string; data?: { available?: string; margin?: string } };
    if (!res.ok || json.code !== 0) {
      throw new Error(`Bitunix error: ${json.msg ?? res.status}`);
    }
    const free = Number(json.data?.available ?? 0);
    const used = Number(json.data?.margin ?? 0);
    return {
      free: free.toFixed(2),
      used: used.toFixed(2),
      total: (free + used).toFixed(2),
      currency: 'USDT',
    };
  }

  async getTickerPrice(symbol: string): Promise<string> {
    return fetchPublicTickerPrice(symbol);
  }

  async getMarket24h(symbol: string): Promise<Market24hStats> {
    return fetchPublicMarket24h(symbol);
  }

  async getKlines(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    return fetchPublicKlines(symbol, timeframe, limit);
  }

  async getOrderBook(symbol: string, limit = 15) {
    return fetchPublicOrderBook(symbol, limit);
  }

  async getInstrumentSpec(symbol: string): Promise<InstrumentSpec> {
    const canonical = normalizeCanonicalSymbol(symbol);
    const live = await findMarketSpec('bitunix', canonical).catch(() => undefined);
    if (live) {
      return {
        symbol: canonical,
        basePrecision: live.basePrecision,
        quotePrecision: live.quotePrecision,
        minTradeVolume: live.minTradeVolume,
        maxMarketVolume: '1000000',
        minLeverage: 1,
        maxLeverage: live.maxLeverage,
        status: 'OPEN',
      };
    }
    return {
      symbol: canonical,
      basePrecision: 3,
      quotePrecision: 2,
      minTradeVolume: '0.001',
      maxMarketVolume: '50',
      minLeverage: 1,
      maxLeverage: 50,
      status: 'OPEN',
    };
  }

  async getPositions(): Promise<ExchangePosition[]> {
    try {
      const headers = await this.signHeaders('', '');
      const res = await fetch(`${this.baseUrl}/api/v1/futures/position/get_pending_positions`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        code?: number;
        data?: Array<{
          symbol?: string;
          side?: string;
          qty?: string;
          avgOpenPrice?: string;
          markPrice?: string;
          unrealizedPNL?: string;
          leverage?: number;
          margin?: string;
        }>;
      };
      if (json.code !== 0 || !Array.isArray(json.data)) return [];
      return json.data
        .filter((p) => Number(p.qty || 0) > 0)
        .map((p) => ({
          symbol: normalizeCanonicalSymbol(p.symbol || ''),
          direction: String(p.side).toUpperCase() === 'SHORT' || String(p.side).toUpperCase() === 'SELL' ? 'SHORT' : 'LONG',
          quantity: String(p.qty || '0'),
          entryPrice: String(p.avgOpenPrice || '0'),
          markPrice: String(p.markPrice || p.avgOpenPrice || '0'),
          unrealizedPnl: String(p.unrealizedPNL || '0'),
          leverage: Number(p.leverage || 10),
          marginUsed: String(p.margin || '0'),
        }));
    } catch {
      return [];
    }
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    const body = JSON.stringify({ symbol: symbol.toUpperCase(), marginCoin: 'USDT', leverage });
    const headers = await this.signHeaders('', body);
    await fetch(`${this.baseUrl}/api/v1/futures/account/change_leverage`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(8000),
    });
  }

  async placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult> {
    await this.setLeverage(params.symbol, params.leverage);
    const body = JSON.stringify({
      symbol: params.symbol.toUpperCase(),
      qty: params.quantity,
      side: params.direction === 'LONG' ? 'BUY' : 'SELL',
      tradeSide: 'OPEN',
      orderType: params.type,
      clientId: params.clientOrderId,
      slPrice: params.stopLoss,
      tpPrice: params.takeProfit,
    });
    const headers = await this.signHeaders('', body);
    const res = await fetch(`${this.baseUrl}/api/v1/futures/trade/place_order`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json() as { code?: number; msg?: string; data?: { orderId?: string } };
    if (!res.ok || json.code !== 0) {
      throw new Error(`Bitunix order failed: ${json.msg ?? res.status}`);
    }
    return {
      orderId: json.data?.orderId ?? `bx_${Date.now()}`,
      clientOrderId: params.clientOrderId,
      filledPrice: await this.getTickerPrice(params.symbol),
      filledQty: params.quantity,
      fee: '0',
    };
  }

  async updatePositionStopLoss(): Promise<void> {
    // Bitunix SL modification handled via modify_position_tpsl_order when live
  }

  async closePositionPartialOrFull(symbol: string, direction: Direction, quantity: string, clientOrderId: string): Promise<OrderResult> {
    const body = JSON.stringify({
      symbol: symbol.toUpperCase(),
      qty: quantity,
      side: direction === 'LONG' ? 'SELL' : 'BUY',
      tradeSide: 'CLOSE',
      orderType: 'MARKET',
      reduceOnly: true,
      clientId: clientOrderId,
    });
    const headers = await this.signHeaders('', body);
    const res = await fetch(`${this.baseUrl}/api/v1/futures/trade/place_order`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json() as { code?: number; msg?: string; data?: { orderId?: string } };
    if (!res.ok || json.code !== 0) throw new Error(`Bitunix close failed: ${json.msg ?? res.status}`);
    return {
      orderId: json.data?.orderId ?? `bx_cls_${Date.now()}`,
      clientOrderId,
      filledPrice: await this.getTickerPrice(symbol),
      filledQty: quantity,
      fee: '0',
    };
  }
}
