export type Direction = 'LONG' | 'SHORT';
export type MarketType = 'SPOT' | 'FUTURES';
export type DirectionMode = 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
export type OrderSide = 'BUY' | 'SELL';
export type TradingMode = 'PAPER' | 'LIVE';
export type ExecutionMode = 'AUTO' | 'MANUAL_CONFIRM';
export type MarginMode = 'ISOLATED' | 'CROSS';
export type ExchangeProviderId = 'paper' | 'toobit' | 'bitunix' | 'kcex';
export type AIProviderId = 'deepseek' | 'anthropic' | 'openai' | 'gemini' | 'openai_compatible';
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1d';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DollarinoSignal {
  symbol: string;
  direction: Direction;
  timeframe: string;
  price: string;
  stopLoss: string;
  leverage: number;
  tp1: string;
  tp2?: string;
  tp3?: string;
  slPct?: string;
  tp1Pct?: string;
  tp2Pct?: string;
  tp3Pct?: string;
  channelHandle?: string;
  engineKey?: string;
  engineLabel?: string;
  reason?: string;
}

export type StrategyKey =
  | 'dollarino_v01'
  | 'ai_autonomous_agent'
  | 'my_custom_ai'
  | 'copy_trade'
  | 'kbos_v11'
  | 'sp2l'
  | 'grid_strategy'
  | 'ema_trend_pullback'
  | 'vibe_4h_daily_breakout'
  | 'vibe_4h_candle_confirmation'
  | 'signal_mixer'
  | 'test_strategy'
  | 'dollarino_tv_hybrid'
  | 'custom_pine'
  | 'custom_python'
  | 'custom_visual';

export type MaVariantKind =
  | 'SMA'
  | 'EMA'
  | 'DEMA'
  | 'TEMA'
  | 'WMA'
  | 'VWMA'
  | 'SMMA'
  | 'HullMA'
  | 'LSMA'
  | 'ALMA'
  | 'TMA'
  | 'SSMA';

export interface KbosParams {
  basisType: MaVariantKind;
  basisLen: number;
  useRes: boolean;
  intRes: number;
  offsetSigma: number;
  offsetALMA: number;
  delayOffset: number;
  tradeType: 'LONG' | 'SHORT' | 'BOTH' | 'NONE';
  useAtr1: boolean;
  useAtr2: boolean;
  useVol: boolean;
  useEmaRsi: boolean;
  useEma200: boolean;
  useAdx: boolean;
  adxVariant: 'ORIGINAL' | 'MASANAKAMURA';
  adxThreshold: number;
  useRsiCustom: boolean;
  useBb: boolean;
  useDemaAtr: boolean;
  haCandles: boolean;
  periodDema: number;
  periodAtr: number;
  factorAtr: number;
  tp1Pct: number;
  tp2Pct: number;
  tp3Pct: number;
  useTrail: boolean;
  trailPct: number;
  trailAfterTp1: boolean;
  beAfterTp1: boolean;
  mainRibbonLen: number;
}

export interface SignalMixerWeights {
  trend: number;
  momentum: number;
  liquiditySweep: number;
  fvg: number;
  volatility: number;
  volume: number;
  structure: number;
  meanReversion: number;
}

export interface SignalMixerChannelScore {
  key: keyof SignalMixerWeights;
  label: string;
  score: number; // -100..+100
  weight: number;
}

export interface SignalMixerResult {
  compositeScore: number; // -100..+100
  confidence: number;     // 0..100
  direction: Direction | 'NONE';
  channels: SignalMixerChannelScore[];
}

export interface BotConfig {
  tradingMode: TradingMode;
  marketType?: MarketType;
  directionMode?: DirectionMode;
  hedgeMode?: boolean;
  executionMode: ExecutionMode;
  marginMode?: MarginMode;
  symbol: string;
  strategyKey: StrategyKey;
  entryTimeframe: Timeframe;
  higherTimeframe: Timeframe;
  marginPct: number;
  useSignalLeverage: boolean;
  maxLeverage: number;
  tp1ClosePct: number;
  tp2ClosePct: number;
  tp3ClosePct: number;
  autoBreakevenOnTp1: boolean;
  moveSlToTp1OnTp2: boolean;
  trailingStopEnabled?: boolean;
  trailingStopPct?: number;
  trailAfterTp1?: boolean;
  dailyMaxLossPct: number;
  maxOpenPositions: number;
  blockWeekends: boolean;
  macroBlackout: boolean;
  aiGateEnabled: boolean;
  aiMinConfidence: number;
  signalChannelHandle: string;
  mixerThreshold?: number;
  mixerWeights?: SignalMixerWeights;
  kbosParams?: Partial<KbosParams>;
}

export interface InstrumentSpec {
  symbol: string;
  basePrecision: number;
  quotePrecision: number;
  minTradeVolume: string;
  maxMarketVolume: string;
  minNotional?: string;
  minLeverage: number;
  maxLeverage: number;
  contractMultiplier?: string;
  status: 'OPEN' | 'HALTED';
}

export interface StrategySignalOutput {
  timestamp: number;
  closeTime: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signal: 'LONG' | 'SHORT' | 'NONE';
  reason: string;
  price: number;
  atr: number;
  rsi: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  entryLegs?: Array<{ label: string; price: number; weight: number }>;
}

export interface CustomIndicatorDefinition {
  id: string;
  name: string;
  description: string;
  defaultTimeframe: Timeframe;
  compute: (candles: Candle[], params?: Record<string, number>) => StrategySignalOutput[];
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  pnlUsd: number;
  pnlPct: number;
  feesUsd: number;
  exitReason: string;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  riskFreeTriggered: boolean;
  trailingTriggered?: boolean;
}

export interface BacktestMetrics {
  initialBalance: number;
  finalEquity: number;
  netReturnUsd: number;
  netReturnPct: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRatePct: number;
  profitFactor: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  maxRunupUsd: number;
  maxRunupPct: number;
  expectancyUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  totalFeesUsd: number;
  longTrades: number;
  shortTrades: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  riskFreeCount: number;
  sharpeEstimate: number;
}

export interface MonthlyPerformanceRow {
  year: number;
  months: Record<number, number>; // 1..12 -> % return
  yearPct: number;
}

export interface DayOfWeekStat {
  dayIndex: number; // 0=Sun..6=Sat
  dayName: string;
  openedTotal: number;
  openedWins: number;
  openedLosses: number;
  openedWinRate: number;
  closedTotal: number;
  closedWins: number;
  closedLosses: number;
  closedWinRate: number;
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: number; equity: number; drawdownPct: number }>;
  monthlyBreakdown: MonthlyPerformanceRow[];
  dayOfWeekStats: DayOfWeekStat[];
}
