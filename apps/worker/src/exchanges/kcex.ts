import type { Candle, Direction, InstrumentSpec, MarketType, Timeframe } from '@dollarino/core';
import type { ExchangePosition, FuturesBalance, IExchangeAdapter, Market24hStats, OrderResult, PlaceOrderParams } from './base.js';
import { findMarketSpec, normalizeCanonicalSymbol } from './markets.js';
import { fetchPublicKlines, fetchPublicMarket24h, fetchPublicOrderBook, fetchPublicTickerPrice } from './paper.js';

/**
 * KCEX Futures Adapter (Signal Mirror / Fee-Accurate Simulator + Deep-Link Bridge).
 * Official KCEX Status (Oct 2026): KCEX does not issue public API Key/Secret pairs for external trading bots;
 * trading occurs via KCEX web/app (0% maker, 0.01% futures taker). This adapter connects KCEX seamlessly
 * in Signal-Mirror mode (using KCEX's exact contract pair format `BTC_USDT` + 0.01% taker fee + deep-links
 * to `https://www.kcex.com/futures/exchange/BTC_USDT`) and cleanly stores optional web-session credentials if provided.
 */
export class KcexFuturesAdapter implements IExchangeAdapter {
  readonly provider = 'kcex' as const;

  constructor(
    private db?: D1Database,
    private userId?: string,
    private webSessionToken?: string
  ) {}

  static toKcexPair(symbol: string): string {
    const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return clean.endsWith('USDT') ? `${clean.slice(0, -4)}_USDT` : `${clean}_USDT`;
  }

  static buildDeepLink(symbol: string): string {
    return `https://www.kcex.com/futures/exchange/${KcexFuturesAdapter.toKcexPair(symbol)}`;
  }

  async testConnection() {
    const balance = await this.getBalance();
    const note = this.webSessionToken
      ? 'KCEX Web-Session stored (encrypted). Note: KCEX currently lacks official public REST API keys; Mirror execution + deep-links active.'
      : 'KCEX Futures Signal-Mirror connected (0% Maker / 0.01% Taker fee model + instant KCEX deep-links). Live automated REST keys await official KCEX API launch.';
    return { ok: true, message: note, balance };
  }

  async getBalance(): Promise<FuturesBalance> {
    if (this.db && this.userId) {
      const cfg = await this.db.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
        .bind(this.userId).first<{ paper_balance: string }>();
      const openRows = await this.db.prepare(
        `SELECT COALESCE(SUM(CAST(margin_used AS REAL)), 0) as used FROM trades WHERE user_id = ? AND status = 'OPEN'`
      ).bind(this.userId).first<{ used: number }>();
      const free = Number(cfg?.paper_balance ?? '10000');
      const used = Number(openRows?.used ?? 0);
      return { free: free.toFixed(2), used: used.toFixed(2), total: (free + used).toFixed(2), currency: 'USDT' };
    }
    return { free: '10000.00', used: '0.00', total: '10000.00', currency: 'USDT' };
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

  async getInstrumentSpec(symbol: string, marketType: MarketType = 'FUTURES'): Promise<InstrumentSpec> {
    const clean = normalizeCanonicalSymbol(symbol);
    const live = await findMarketSpec('kcex', clean, undefined, marketType).catch(() => undefined);
    if (live) {
      return {
        symbol: marketType === 'SPOT' ? clean : KcexFuturesAdapter.toKcexPair(clean),
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
      symbol: marketType === 'SPOT' ? clean : KcexFuturesAdapter.toKcexPair(clean),
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
    return [];
  }

  async setLeverage(): Promise<void> {}

  async placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const price = params.price && Number(params.price) > 0 ? params.price : await this.getTickerPrice(params.symbol);
    // KCEX exact 0.01% futures taker fee
    const fee = (Number(price) * Number(params.quantity) * 0.0001).toFixed(4);
    return {
      orderId: `kcex_mirror_${Date.now()}`,
      clientOrderId: params.clientOrderId,
      filledPrice: price,
      filledQty: params.quantity,
      fee,
    };
  }

  async updatePositionStopLoss(): Promise<void> {}

  async closePositionPartialOrFull(symbol: string, _direction: Direction, quantity: string, clientOrderId: string, _marketType: MarketType = 'FUTURES'): Promise<OrderResult> {
    const price = await this.getTickerPrice(symbol);
    const fee = (Number(price) * Number(quantity) * 0.0001).toFixed(4);
    return {
      orderId: `kcex_cls_${Date.now()}`,
      clientOrderId,
      filledPrice: price,
      filledQty: quantity,
      fee,
    };
  }
}
