import type { Candle, Direction, InstrumentSpec, MarketType, Timeframe } from '@dollarino/core';
import { hmacSha256Hex } from '../crypto.js';
import type { ExchangePosition, FuturesBalance, IExchangeAdapter, Market24hStats, OrderResult, PlaceOrderParams } from './base.js';
import { findMarketSpec, normalizeCanonicalSymbol } from './markets.js';
import { fetchPublicKlines, fetchPublicMarket24h, fetchPublicOrderBook, fetchPublicTickerPrice } from './paper.js';
import { buildToobitRequest, formatToobitHttpError, type ToobitProxyConfig } from './proxy.js';

export interface ToobitCredentials {
  apiKey: string;
  apiSecret: string;
  proxyUrl?: string;
  proxySecret?: string;
}

/**
 * Official Toobit USDT-M Futures REST API v1/v2 adapter (https://api.toobit.com).
 * Auth: header `X-BB-APIKEY` + lowercase hex HMAC-SHA256 over queryString / form body.
 * Supports optional non-Cloudflare Relay (`proxyUrl`) so Cloudflare Workers avoid `2a06:98c0:3600::103` geo-403.
 */
export class ToobitFuturesAdapter implements IExchangeAdapter {
  readonly provider = 'toobit' as const;
  private readonly proxyConfig: ToobitProxyConfig;

  constructor(private creds: ToobitCredentials) {
    this.proxyConfig = {
      proxyUrl: creds.proxyUrl,
      proxySecret: creds.proxySecret,
    };
  }

  static toContractSymbol(symbol: string): string {
    if (symbol.toUpperCase().includes('-SWAP-')) return symbol.toUpperCase();
    const clean = normalizeCanonicalSymbol(symbol);
    if (clean.endsWith('USDT')) return `${clean.slice(0, -4)}-SWAP-USDT`;
    return `${clean}-SWAP-USDT`;
  }

  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string | number | undefined> = {}
  ): Promise<T> {
    const allParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') allParams[k] = String(v);
    }
    allParams.timestamp = String(Date.now());
    allParams.recvWindow = '5000';

    const queryString = new URLSearchParams(allParams).toString();
    const signature = await hmacSha256Hex(queryString, this.creds.apiSecret);
    const fullQuery = `${queryString}&signature=${signature}`;

    const useBody = method === 'POST' || method === 'DELETE';
    const pathAndQuery = useBody ? path : `${path}?${fullQuery}`;
    const { url, headers, proxied } = buildToobitRequest(pathAndQuery, this.proxyConfig, {
      'X-BB-APIKEY': this.creds.apiKey,
      ...(useBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    });

    const res = await fetch(url, {
      method,
      headers,
      body: useBody ? fullQuery : undefined,
      signal: AbortSignal.timeout(12_000),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(formatToobitHttpError(res.status, text, proxied));
    }
    if (!res.ok) {
      const errObj = json as { msg?: string; code?: number };
      throw new Error(`Toobit API Error ${errObj.code ?? res.status}: ${errObj.msg ?? text.slice(0, 200)}`);
    }
    return json as T;
  }

  async testConnection() {
    try {
      const balance = await this.getBalance();
      return {
        ok: true,
        message: this.proxyConfig.proxyUrl
          ? 'Connected to Toobit USDT-M Futures API (via Relay)'
          : 'Connected to Toobit USDT-M Futures API',
        balance,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Toobit connection failed' };
    }
  }

  async getBalance(marketType: MarketType = 'FUTURES'): Promise<FuturesBalance> {
    if (marketType === 'SPOT') {
      const acct = await this.signedRequest<{
        balances?: Array<{ coin?: string; asset?: string; free?: string; locked?: string; total?: string }>;
      }>('GET', '/api/v1/account');
      const list = Array.isArray(acct?.balances) ? acct.balances : [];
      const usdt = list.find((r) => (r.coin ?? r.asset ?? '').toUpperCase() === 'USDT');
      const free = Number(usdt?.free ?? 0);
      const used = Number(usdt?.locked ?? 0);
      const total = Number(usdt?.total ?? free + used);
      return {
        free: free.toFixed(2),
        used: used.toFixed(2),
        total: total.toFixed(2),
        currency: 'USDT',
      };
    }

    const rows = await this.signedRequest<
      Array<{
        asset?: string;
        coin?: string;
        availableBalance?: string;
        available?: string;
        balance?: string;
        total?: string;
        positionMargin?: string;
        orderMargin?: string;
      }>
    >('GET', '/api/v1/futures/balance');

    const list = Array.isArray(rows) ? rows : [];
    const usdt = list.find((r) => (r.asset ?? r.coin ?? '').toUpperCase() === 'USDT') ?? list[0];
    const free = Number(usdt?.availableBalance ?? usdt?.available ?? 0);
    const used = Number(usdt?.positionMargin ?? 0) + Number(usdt?.orderMargin ?? 0);
    const total = Number(usdt?.balance ?? usdt?.total ?? free + used);

    return {
      free: free.toFixed(2),
      used: used.toFixed(2),
      total: total.toFixed(2),
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

  async getOrderBook(symbol: string, limit = 15): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
    return fetchPublicOrderBook(symbol, limit, this.proxyConfig);
  }

  async getInstrumentSpec(symbol: string, marketType: MarketType = 'FUTURES'): Promise<InstrumentSpec> {
    const clean = normalizeCanonicalSymbol(symbol);
    const contract = marketType === 'SPOT' ? clean : ToobitFuturesAdapter.toContractSymbol(symbol);
    const live = await findMarketSpec('toobit', symbol, this.proxyConfig, marketType).catch(() => undefined);
    if (live) {
      return {
        symbol: live.exchangeSymbol || contract,
        basePrecision: live.basePrecision,
        quotePrecision: live.quotePrecision,
        minTradeVolume: live.minTradeVolume,
        maxMarketVolume: '1000000',
        minLeverage: 1,
        maxLeverage: marketType === 'SPOT' ? 1 : live.maxLeverage,
        contractMultiplier: '1',
        status: live.status === 'TRADING' || !live.status ? 'OPEN' : 'HALTED',
      };
    }
    return {
      symbol: contract,
      basePrecision: 3,
      quotePrecision: 2,
      minTradeVolume: '0.001',
      maxMarketVolume: '100',
      minLeverage: 1,
      maxLeverage: marketType === 'SPOT' ? 1 : 50,
      status: 'OPEN',
    };
  }

  async getPositions(symbol?: string): Promise<ExchangePosition[]> {
    const rows = await this.signedRequest<
      Array<{
        symbol: string;
        side: 'LONG' | 'SHORT';
        position: string;
        avgPrice: string;
        lastPrice?: string;
        markPrice?: string;
        unrealizedPnL?: string;
        unrealizedPnl?: string;
        leverage?: string | number;
      }>
    >('GET', '/api/v1/futures/positions', symbol ? { symbol: ToobitFuturesAdapter.toContractSymbol(symbol) } : {});

    return (Array.isArray(rows) ? rows : [])
      .filter((p) => Number(p.position ?? 0) > 0)
      .map((p) => ({
        symbol: p.symbol,
        direction: p.side,
        quantity: String(p.position),
        entryPrice: String(p.avgPrice),
        markPrice: String(p.lastPrice ?? p.markPrice ?? p.avgPrice),
        unrealizedPnl: String(p.unrealizedPnL ?? p.unrealizedPnl ?? '0'),
        leverage: Number(p.leverage ?? 1),
      }));
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedRequest('POST', '/api/v1/futures/leverage', {
      symbol: ToobitFuturesAdapter.toContractSymbol(symbol),
      leverage: String(leverage),
    });
  }

  async placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult> {
    if (params.marketType === 'SPOT') {
      const spotSym = normalizeCanonicalSymbol(params.symbol);
      const pxStr = params.price && Number(params.price) > 0 ? params.price : await this.getTickerPrice(spotSym);
      const isBuy = params.direction === 'LONG';
      // Official Toobit Spot Docs: when type=MARKET and side=BUY, `quantity` is quote asset (USDT) amount
      const quoteAmt = (Number(params.quantity) * Number(pxStr)).toFixed(2);
      const resp = await this.signedRequest<{
        orderId?: string | number;
        clientOrderId?: string;
        price?: string;
        executedQty?: string;
        origQty?: string;
      }>('POST', '/api/v1/spot/order', {
        symbol: spotSym,
        side: isBuy ? 'BUY' : 'SELL',
        type: params.type === 'LIMIT' ? 'LIMIT' : 'MARKET',
        ...(params.type === 'LIMIT' ? { timeInForce: 'GTC', price: params.price, quantity: params.quantity } : { quantity: isBuy ? quoteAmt : params.quantity }),
        newClientOrderId: params.clientOrderId,
      });
      const filledPrice = resp.price && Number(resp.price) > 0 ? resp.price : pxStr;
      return {
        orderId: String(resp.orderId ?? `tb_spot_${Date.now()}`),
        clientOrderId: resp.clientOrderId ?? params.clientOrderId,
        filledPrice,
        filledQty: params.quantity,
        fee: '0',
      };
    }

    const contract = ToobitFuturesAdapter.toContractSymbol(params.symbol);
    await this.setLeverage(params.symbol, params.leverage);
    const side = params.direction === 'LONG' ? 'BUY_OPEN' : 'SELL_OPEN';

    // Toobit USDT-M Futures API requires type='LIMIT' + priceType='MARKET' for market execution, or priceType='INPUT' for LIMIT
    const resp = await this.signedRequest<{
      orderId?: string | number;
      clientOrderId?: string;
      avgPrice?: string;
      executedQty?: string;
    }>('POST', '/api/v1/futures/order', {
      symbol: contract,
      side,
      type: 'LIMIT',
      priceType: params.type === 'MARKET' ? 'MARKET' : 'INPUT',
      quantity: params.quantity,
      price: params.type === 'LIMIT' ? params.price : undefined,
      ...(params.type === 'LIMIT' ? { timeInForce: 'GTC' } : {}),
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      newClientOrderId: params.clientOrderId,
    });

    const filledPrice = resp.avgPrice && Number(resp.avgPrice) > 0
      ? resp.avgPrice
      : await this.getTickerPrice(params.symbol);

    return {
      orderId: String(resp.orderId ?? `tb_${Date.now()}`),
      clientOrderId: resp.clientOrderId ?? params.clientOrderId,
      filledPrice,
      filledQty: resp.executedQty ?? params.quantity,
      fee: '0',
    };
  }

  async updatePositionStopLoss(symbol: string, direction: Direction, stopLoss: string, takeProfit?: string): Promise<void> {
    await this.signedRequest('POST', '/api/v1/futures/position/trading-stop', {
      symbol: ToobitFuturesAdapter.toContractSymbol(symbol),
      side: direction,
      stopLoss,
      takeProfit,
    });
  }

  async closePositionPartialOrFull(symbol: string, direction: Direction, quantity: string, clientOrderId: string, marketType: MarketType = 'FUTURES'): Promise<OrderResult> {
    if (marketType === 'SPOT') {
      const spotSym = normalizeCanonicalSymbol(symbol);
      const resp = await this.signedRequest<{ orderId?: string; price?: string; executedQty?: string }>(
        'POST',
        '/api/v1/spot/order',
        {
          symbol: spotSym,
          side: 'SELL',
          type: 'MARKET',
          quantity,
          newClientOrderId: clientOrderId,
        }
      );
      return {
        orderId: String(resp.orderId ?? `tb_spot_cls_${Date.now()}`),
        clientOrderId,
        filledPrice: resp.price && Number(resp.price) > 0 ? resp.price : await this.getTickerPrice(symbol),
        filledQty: resp.executedQty ?? quantity,
        fee: '0',
      };
    }

    const contract = ToobitFuturesAdapter.toContractSymbol(symbol);
    const side = direction === 'LONG' ? 'SELL_CLOSE' : 'BUY_CLOSE';
    const resp = await this.signedRequest<{ orderId?: string; avgPrice?: string; executedQty?: string }>(
      'POST',
      '/api/v1/futures/order',
      {
        symbol: contract,
        side,
        type: 'LIMIT',
        priceType: 'MARKET',
        quantity,
        newClientOrderId: clientOrderId,
      }
    );
    return {
      orderId: String(resp.orderId ?? `tb_cls_${Date.now()}`),
      clientOrderId,
      filledPrice: resp.avgPrice && Number(resp.avgPrice) > 0 ? resp.avgPrice : await this.getTickerPrice(symbol),
      filledQty: resp.executedQty ?? quantity,
      fee: '0',
    };
  }
}
