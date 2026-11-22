import type { Candle, Direction, ExchangeProviderId, InstrumentSpec, MarginMode, MarketType, Timeframe } from '@dollarino/core';

export interface FuturesBalance {
  free: string;
  used: string;
  total: string;
  currency: string;
}

export interface Market24hStats {
  symbol: string;
  lastPrice: string;
  changePct24h: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  fundingRate: string;
  bestBid: string;
  bestAsk: string;
}

export interface ExchangePosition {
  symbol: string;
  direction: Direction;
  quantity: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: number;
  stopLoss?: string;
  takeProfit?: string;
}

export interface PlaceOrderParams {
  symbol: string;
  direction: Direction;
  type: 'MARKET' | 'LIMIT';
  marketType?: MarketType;
  quantity: string;
  price?: string;
  leverage: number;
  marginMode?: MarginMode;
  stopLoss?: string;
  takeProfit?: string;
  clientOrderId: string;
}

export interface OrderResult {
  orderId: string;
  clientOrderId: string;
  filledPrice: string;
  filledQty: string;
  fee: string;
}

export interface IExchangeAdapter {
  readonly provider: ExchangeProviderId;
  testConnection(): Promise<{ ok: boolean; message: string; balance?: FuturesBalance }>;
  getBalance(marketType?: MarketType): Promise<FuturesBalance>;
  getTickerPrice(symbol: string): Promise<string>;
  getMarket24h(symbol: string): Promise<Market24hStats>;
  getKlines(symbol: string, timeframe: Timeframe, limit?: number): Promise<Candle[]>;
  getOrderBook(symbol: string, limit?: number): Promise<{ bids: [string, string][]; asks: [string, string][] }>;
  getInstrumentSpec(symbol: string, marketType?: MarketType): Promise<InstrumentSpec>;
  getPositions(symbol?: string): Promise<ExchangePosition[]>;
  setLeverage(symbol: string, leverage: number): Promise<void>;
  placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult>;
  updatePositionStopLoss(symbol: string, direction: Direction, stopLoss: string, takeProfit?: string): Promise<void>;
  closePositionPartialOrFull(symbol: string, direction: Direction, quantity: string, clientOrderId: string, marketType?: MarketType): Promise<OrderResult>;
}
