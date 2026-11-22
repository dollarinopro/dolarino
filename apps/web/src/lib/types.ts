import type { SignalMixerResult, Timeframe } from '@dollarino/core';

export type NavTab =
  | 'overview'
  | 'aichat'
  | 'myai'
  | 'terminal'
  | 'markets'
  | 'dex'
  | 'radar'
  | 'copy'
  | 'portfolio'
  | 'services'
  | 'card'
  | 'pricing'
  | 'faq'
  | 'admin';

export interface SelectableAIModel {
  id: string;
  label: string;
  provider: string;
  model: string;
  source: 'PLATFORM' | 'USER';
  supportsVision: boolean;
  isDefault: boolean;
}

export interface ExtractedChartSetup {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  timeframe?: string;
  entry: string;
  stopLoss: string;
  tp1: string;
  tp2?: string;
  tp3?: string;
  leverage?: number;
  rrRatio?: string;
  confidence?: number;
  note?: string;
}

export interface AiChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  hasImage?: boolean;
  previewImageUrl?: string;
  modelId?: string | null;
  modelLabel?: string | null;
  usedVision?: boolean;
  visionFallbackNotice?: string;
  setup?: ExtractedChartSetup | null;
  createdAt?: string;
}

export interface AiChatSessionItem {
  id: string;
  title: string;
  model_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorInfo {
  nameFa: string;
  nameEn: string;
  telegram: string;
  telegramUrl: string;
  instagram: string;
  instagramUrl: string;
  twitter: string;
  twitterUrl: string;
}

export interface AuthUserInfo {
  id: string;
  email: string;
  username: string;
  role: string;
  telegram_id: string | null;
  telegram_username?: string | null;
  telegram_first_name?: string | null;
  avatar_url?: string | null;
  avatar_custom?: number | boolean;
  phone_number?: string | null;
  phone_verified?: boolean | number;
  has_custom_password?: boolean | number;
  display_bio?: string | null;
  referral_code?: string | null;
  trust_wallet_address?: string | null;
  trust_wallet_tron?: string | null;
  trust_wallet_solana?: string | null;
  trust_wallet_ton?: string | null;
  trust_wallet_verified?: boolean;
  ui_mode?: 'simple' | 'pro';
  mobile_widgets?: string[];
  extension_api_key?: string | null;
}

export interface EntitlementSummary {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  status: string;
  daysRemaining: number;
  subscriptionRequired: boolean;
}

export interface OpenTradeRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  market_type?: 'SPOT' | 'FUTURES';
  leverage: number;
  entry_price: string;
  mark_price?: string;
  quantity: string;
  margin_used: string;
  current_stop_loss: string;
  tp1: string;
  tp2?: string | null;
  tp3?: string | null;
  unrealized_pnl?: string;
  roe_pct?: string;
  risk_free_active?: number;
  strategy_key?: string;
  source?: string;
  sparkline?: number[];
  opened_at?: string;
}

export interface ClosedTradeRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  market_type?: 'SPOT' | 'FUTURES';
  leverage: number;
  entry_price: string;
  exit_price: string;
  realized_pnl: string;
  close_reason?: string;
  closed_at: string;
}

export interface VerifiedProfitCard {
  id: string;
  userId?: string;
  displayName?: string;
  mode: 'LIVE' | 'PAPER';
  isVerifiedReal: boolean;
  period: '24H' | '7D' | '30D' | '1Y' | 'ALL' | 'TRADE';
  startDate: string;
  endDate: string;
  tradesCount: number;
  winRate: number;
  netPnlUsd: number;
  roiPct: number;
  profitFactor: number;
  exchangeProvider: string;
  strategyName: string;
  cardStyle?: string;
  symbol?: string;
  direction?: string;
  hmacSignature?: string;
  signaturePrefix?: string;
  verifyPath?: string;
  issuedAt: string;
}

export interface PendingOrderRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  limit_price: string;
  leverage: number;
  stop_loss: string;
  tp1: string;
  status: string;
  created_at: string;
}

export interface RecentSignalRow {
  id: string;
  source: string;
  symbol: string;
  direction: string;
  price: string;
  status: string;
  raw_text: string;
  created_at: string;
}

export interface DashboardPayload {
  config: {
    bot_state: string;
    trading_mode: 'PAPER' | 'LIVE';
    market_type?: 'SPOT' | 'FUTURES';
    direction_mode?: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
    hedge_mode?: number;
    trade_execution_mode: 'AUTO' | 'MANUAL_CONFIRM';
    margin_mode: 'ISOLATED' | 'CROSS';
    symbol: string;
    strategy_key: string;
    entry_timeframe: Timeframe;
    higher_timeframe: Timeframe;
    margin_pct: number;
    max_leverage: number;
    max_open_positions: number;
    daily_max_loss_pct: number;
    ai_gate_enabled: number;
    ai_min_confidence: number;
    webhook_secret: string;
    signal_channel_handle: string;
    paper_balance: string;
    mixer_threshold?: number;
    mixer_weights_json?: string;
    strategy_flow_json?: string;
    kbos_params_json?: string;
    risk_profile_json?: string;
    trailing_stop_enabled?: number;
    trailing_stop_pct?: number;
    trail_after_tp1?: number;
    auto_scan_top?: number;
    scan_scope?: 'SINGLE' | 'TOP_COINS' | 'ALL_MARKET';
    allow_auto_flip?: number;
    allow_pyramiding?: number;
    watchlist_json?: string;
    tp1_close_pct?: number;
    tp2_close_pct?: number;
    tp3_close_pct?: number;
    auto_breakeven_on_tp1?: number;
    move_sl_to_tp1_on_tp2?: number;
    block_weekends?: number;
    macro_blackout?: number;
    use_signal_leverage?: number;
    notifications_enabled?: number;
    active_custom_strategy_id?: string | null;
  };
  balance: { free: string; used: string; total: string; currency: string };
  activeExchange: { provider: string; label: string };
  activeAI: { provider: string; model: string } | null;
  platformAI?: {
    configured: boolean;
    activeCount: number;
    totalCount: number;
    consensusMode: string;
    effectiveModeLabelFa: string;
    effectiveModeLabelEn: string;
    engines: Array<{
      id: string;
      slot_order: number;
      provider: string;
      label: string;
      model: string;
      weight: number;
      is_active: number;
    }>;
    latestSignals: Array<{
      id: string;
      symbol: string;
      timeframe: string;
      action: string;
      confidence: number;
      model_count: number;
      consensus_mode: string;
      thesis: string;
      created_at: string;
    }>;
  };
  entitlement?: EntitlementSummary | null;
  stats: {
    totalTrades: number;
    wins: number;
    winRate: number;
    totalPnl: number;
    todayPnl?: number;
    profitFactor: number;
  };
  openTrades: OpenTradeRow[];
  closedTrades: ClosedTradeRow[];
  pendingOrders?: PendingOrderRow[];
  recentLogs?: Array<{
    id: string;
    category: string;
    level: string;
    symbol: string | null;
    message: string;
    created_at: string;
  }>;
  charts: {
    dailyPnl: Array<{ day: string; pnl: number }>;
    weeklyResults: Array<{ day: string; pnl: number; count: number; wins?: number }>;
    equityCurve?: Array<{ time: string; equity: number }>;
  };
  mixerSnapshot?: SignalMixerResult | null;
  recentSignals: RecentSignalRow[];
}
