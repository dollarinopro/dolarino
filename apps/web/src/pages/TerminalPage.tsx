import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellRing,
  BrainCircuit,
  Calculator,
  CandlestickChart as CandleIcon,
  CheckCircle2,
  Code2,
  Edit3,
  Eye,
  History,
  Layers,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Scale,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import {
  SAMPLE_CUSTOM_STRATEGIES,
  type Candle,
  type CustomStrategyLanguage,
  type Timeframe,
} from '@dollarino/core';
import {
  CandlestickChart,
  type ChartLevels,
  type ChartOverlays,
  type CustomStrategyChartOverlay,
  type KbosChartOverlays,
} from '../components/CandlestickChart';
import { CoinIcon } from '../components/CoinIcon';
import { ConfirmTradeSheet, type PendingTradeConfirmation } from '../components/ConfirmTradeSheet';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import { coinDisplayName, formatTomanEq } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import type { DashboardPayload, OpenTradeRow } from '../lib/types';

interface OverviewResponse {
  market24h: {
    symbol: string;
    lastPrice: string;
    changePct24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    fundingRate: string;
  };
  orderBook: { bids: [string, string][]; asks: [string, string][] };
  spreadPct: string;
  imbalancePct: string;
  candles: Candle[];
  indicators: {
    ema20: Array<{ time: number; value: number }>;
    ema50: Array<{ time: number; value: number }>;
    ema200: Array<{ time: number; value: number }>;
  };
  kbosOverlays?: KbosChartOverlays;
  customOverlays?: CustomStrategyChartOverlay | null;
}

interface ChartAIResult {
  summary: string;
  bias?: 'LONG' | 'SHORT' | 'NEUTRAL';
  direction?: 'LONG' | 'SHORT';
  confidence?: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  rrRatio?: number;
  supports?: number[];
  resistances?: number[];
}

interface PriceAlertItem {
  id: string;
  symbol: string;
  condition: 'ABOVE' | 'BELOW';
  target_price: number;
  note?: string | null;
  is_active: number;
  triggered_at?: string | null;
  created_at: string;
}

function fmtPx(v?: number | string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '$0';
  return '$' + Math.round(v).toLocaleString('en-US');
}

export function TerminalPage({
  lang,
  uiMode = 'pro',
  onToggleUiMode,
  symbol,
  setSymbol,
  marketType = 'FUTURES',
  onChangeMarketType,
  data,
  markets,
  onRefresh,
}: {
  lang: Lang;
  uiMode?: 'simple' | 'pro';
  onToggleUiMode?: (m: 'simple' | 'pro') => void;
  symbol: string;
  setSymbol: (sym: string) => void;
  marketType?: 'SPOT' | 'FUTURES';
  onChangeMarketType?: (next: 'SPOT' | 'FUTURES') => Promise<void>;
  data: DashboardPayload;
  markets: ExchangeMarket[];
  onRefresh: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [tf, setTf] = useState<Timeframe>('15m');
  const [showSimpleChart, setShowSimpleChart] = useState(false);
  const [rightIntel, setRightIntel] = useState<'positions' | 'ai' | 'book' | 'script' | 'tools'>('ai');
  const [snap, setSnap] = useState<OverviewResponse | null>(null);
  const [loadingSymbol, setLoadingSymbol] = useState(false);
  const [showEma, setShowEma] = useState(true);
  const [showKbos, setShowKbos] = useState(true);
  const [customChartOverlay, setCustomChartOverlay] = useState<CustomStrategyChartOverlay | null>(null);
  const [scriptLang, setScriptLang] = useState<CustomStrategyLanguage>('pine');
  const [scriptName, setScriptName] = useState('Dollarino EMA 9/21 + RSI Momentum');
  const [scriptCode, setScriptCode] = useState(SAMPLE_CUSTOM_STRATEGIES[0]!.code);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptFeedback, setScriptFeedback] = useState<{ ok: boolean; text: string; retPct?: number; wr?: number } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingTradeConfirmation | null>(null);

  // Price Alerts state
  const [alerts, setAlerts] = useState<PriceAlertItem[]>([]);
  const [alertTarget, setAlertTarget] = useState('');
  const [alertCond, setAlertCond] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [alertNote, setAlertNote] = useState('');
  const [alertBusy, setAlertBusy] = useState(false);

  // Order ticket state
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const effectiveSide: 'LONG' | 'SHORT' = marketType === 'SPOT' ? 'LONG' : side;
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [marginMode, setMarginMode] = useState<'ISOLATED' | 'CROSS'>(data.config.margin_mode || 'ISOLATED');
  const [limitPrice, setLimitPrice] = useState('');
  const [lev, setLev] = useState(10);
  const effectiveLev = marketType === 'SPOT' ? 1 : lev;
  const [marginPct, setMarginPct] = useState<number>(Math.max(1, Math.min(100, Number(data.config.margin_pct || 10))));
  const [stopLoss, setStopLoss] = useState('');
  const [tp1, setTp1] = useState('');
  const [tp2, setTp2] = useState('');
  const [tp3, setTp3] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderMsg, setOrderMsg] = useState('');

  // Inline Edit TP/SL modal
  const [editPos, setEditPos] = useState<OpenTradeRow | null>(null);
  const [editForm, setEditForm] = useState({ stopLoss: '', tp1: '', tp2: '', tp3: '' });

  // Chart AI state + persistent saved chat loader
  const [prompt, setPrompt] = useState(
    isFa
      ? 'ساختار چارت، حمایت و مقاومت‌ها، و ستاپ ورود همراه با حد ضرر و ۳ تارگت را مشخص کن.'
      : 'Analyze trend structure, S/R zones, and draw Entry / SL / TP1-TP3 levels.'
  );
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [chatHistory, setChatHistory] = useState<Array<{ id: string; title: string; symbol: string; timeframe: string }>>([]);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [aiAnalysis, setAiAnalysis] = useState<ChartAIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const applyAutoLevels = (px: number, dir: 'LONG' | 'SHORT', alsoResetLimit = false) => {
    if (!Number.isFinite(px) || px <= 0) return;
    const dec = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
    if (alsoResetLimit) {
      setLimitPrice(px.toFixed(dec));
    }
    setStopLoss((dir === 'LONG' ? px * 0.985 : px * 1.015).toFixed(dec));
    setTp1((dir === 'LONG' ? px * 1.02 : px * 0.98).toFixed(dec));
    setTp2((dir === 'LONG' ? px * 1.035 : px * 0.965).toFixed(dec));
    setTp3((dir === 'LONG' ? px * 1.055 : px * 0.945).toFixed(dec));
  };

  const loadAlerts = async () => {
    const res = await apiFetch<{ alerts: PriceAlertItem[] }>('/api/trading/alerts').catch(() => ({ alerts: [] }));
    setAlerts(res.alerts || []);
  };

  const loadMarket = async (forceResetLevels = false, targetSym = symbol, targetTf = tf, targetSide = effectiveSide) => {
    const [ov, chats] = await Promise.all([
      apiFetch<OverviewResponse>(`/api/trading/market/overview?symbol=${targetSym}&timeframe=${targetTf}`).catch(() => null),
      apiFetch<{ chats: Array<{ id: string; title: string; symbol: string; timeframe: string }> }>('/api/chart-ai/chats').catch(() => ({
        chats: [],
      })),
    ]);
    if (ov && ov.market24h?.symbol === targetSym) {
      setSnap(ov);
      setLoadingSymbol(false);
      const px = Number(ov.market24h.lastPrice || 0);
      if (forceResetLevels && px > 0) {
        applyAutoLevels(px, targetSide, true);
        setAlertTarget((px * 1.01).toFixed(px >= 1000 ? 2 : px >= 1 ? 4 : 6));
      }
    }
    setChatHistory(chats.chats);
  };

  // Strict reset on symbol switch so stale BTC/SOL prices, SL, TP, or AI never bleed into the new market
  useEffect(() => {
    let active = true;
    setLoadingSymbol(true);
    setSnap(null);
    setStopLoss('');
    setTp1('');
    setTp2('');
    setTp3('');
    setLimitPrice('');
    setAiAnalysis(null);
    setChatId(undefined);
    setMessages([]);
    setCustomChartOverlay(null);
    setOrderMsg('');

    const run = async (resetLevels: boolean) => {
      const ov = await apiFetch<OverviewResponse>(`/api/trading/market/overview?symbol=${symbol}&timeframe=${tf}`).catch(() => null);
      if (!active) return;
      if (ov) {
        setSnap(ov);
        const px = Number(ov.market24h.lastPrice || 0);
        if (resetLevels && px > 0) {
          applyAutoLevels(px, effectiveSide, true);
          setAlertTarget((px * 1.01).toFixed(px >= 1000 ? 2 : px >= 1 ? 4 : 6));
        }
      }
      setLoadingSymbol(false);
    };

    void run(true);
    void loadAlerts();
    void apiFetch<{ chats: Array<{ id: string; title: string; symbol: string; timeframe: string }> }>('/api/chart-ai/chats')
      .then((c) => { if (active) setChatHistory(c.chats || []); })
      .catch(() => {});

    const iv = setInterval(() => void run(false), 10_000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [symbol, tf]);

  const createPriceAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const tPx = Number(alertTarget);
    if (!Number.isFinite(tPx) || tPx <= 0) return;
    setAlertBusy(true);
    try {
      await apiFetch('/api/trading/alerts', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          condition: alertCond,
          targetPrice: tPx,
          note: alertNote.trim() || undefined,
        }),
      });
      setAlertNote('');
      await loadAlerts();
    } finally {
      setAlertBusy(false);
    }
  };

  const deletePriceAlert = async (id: string) => {
    await apiFetch(`/api/trading/alerts/${id}`, { method: 'DELETE' }).catch(() => {});
    await loadAlerts();
  };

  const askChartAI = async (customPrompt?: string) => {
    const q = customPrompt ?? prompt;
    setAiLoading(true);
    setOrderMsg('');
    try {
      const res = await apiFetch<{
        chatId: string;
        analysis: ChartAIResult;
        messages: Array<{ role: string; content: string }>;
      }>('/api/chart-ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ chatId, symbol, timeframe: tf, prompt: q }),
      });
      setChatId(res.chatId);
      setAiAnalysis(res.analysis);
      setMessages(res.messages);
      await loadMarket(false);
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : 'Chart AI error');
    } finally {
      setAiLoading(false);
    }
  };

  const loadSavedChat = async (id: string) => {
    try {
      const d = await apiFetch<{
        chat: { id: string; symbol: string; timeframe: Timeframe; messages_json: string; annotations_json: string };
      }>(`/api/chart-ai/chats/${id}`);
      setChatId(d.chat.id);
      if (d.chat.symbol) setSymbol(d.chat.symbol);
      if (d.chat.timeframe) setTf(d.chat.timeframe);
      try {
        setMessages(JSON.parse(d.chat.messages_json || '[]') as Array<{ role: string; content: string }>);
      } catch {
        setMessages([]);
      }
      try {
        const ann = JSON.parse(d.chat.annotations_json || 'null') as ChartAIResult | null;
        if (ann) setAiAnalysis(ann);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  };

  const copyAiLevelsToTicket = () => {
    if (!aiAnalysis) return;
    const dir = marketType === 'SPOT' ? 'LONG' : aiAnalysis.direction ?? (aiAnalysis.bias === 'SHORT' ? 'SHORT' : 'LONG');
    setSide(dir);
    if (aiAnalysis.stopLoss) setStopLoss(String(aiAnalysis.stopLoss));
    if (aiAnalysis.tp1) setTp1(String(aiAnalysis.tp1));
    if (aiAnalysis.tp2) setTp2(String(aiAnalysis.tp2));
    if (aiAnalysis.tp3) setTp3(String(aiAnalysis.tp3));
    setOrderMsg(isFa ? 'سطوح پیشنهادی چارت AI به فرم سفارش منتقل شد' : 'AI levels copied to order ticket');
  };

  const prepareOrderConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    tgHaptic('medium');
    setOrderMsg('');
    setPendingConfirm({
      symbol,
      direction: effectiveSide,
      orderType,
      entryPrice: orderType === 'LIMIT' ? limitPrice : snap?.market24h.lastPrice,
      leverage: effectiveLev,
      amountUsd: marginEst,
      stopLoss,
      tp1,
      tp2: tp2 || undefined,
      tp3: tp3 || undefined,
      tradingMode: data.config.trading_mode,
    });
  };

  const placeOrder = async () => {
    setSubmitting(true);
    setOrderMsg('');
    try {
      const res = await apiFetch<{ ok: boolean; error?: string; pendingOrderId?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          direction: effectiveSide,
          orderType,
          marketType,
          marginPct,
          limitPrice: orderType === 'LIMIT' ? limitPrice : undefined,
          leverage: effectiveLev,
          marginMode,
          stopLoss,
          tp1,
          tp2: tp2 || undefined,
          tp3: tp3 || undefined,
        }),
      });
      setPendingConfirm(null);
      if (res.ok) tgNotifyHaptic('success');
      else tgNotifyHaptic('error');
      setOrderMsg(
        res.ok
          ? res.pendingOrderId
            ? isFa ? 'سفارش لیمیت ثبت شد' : 'Limit order queued'
            : isFa ? 'معامله با موفقیت باز شد' : 'Position opened'
          : res.error || 'Rejected'
      );
      await onRefresh();
    } catch (err) {
      setPendingConfirm(null);
      tgNotifyHaptic('error');
      setOrderMsg(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  const closePosition = async (id: string) => {
    await apiFetch(`/api/trading/positions/${id}/close`, { method: 'POST' });
    await onRefresh();
  };

  const cancelPending = async (id: string) => {
    await apiFetch(`/api/trading/pending/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  const saveEditTpSl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPos) return;
    await apiFetch(`/api/trading/positions/${editPos.id}/tpsl`, {
      method: 'PATCH',
      body: JSON.stringify({
        stopLoss: editForm.stopLoss,
        tp1: editForm.tp1,
        tp2: editForm.tp2 || undefined,
        tp3: editForm.tp3 || undefined,
      }),
    });
    setEditPos(null);
    await onRefresh();
  };

  const lastPx = Number(snap?.market24h.lastPrice || 0);
  const chg24 = Number(snap?.market24h.changePct24h || 0);
  const freeCash = Number(data.balance.free || 0);
  const marginEst = (freeCash * marginPct) / 100;

  const chartOverlays: ChartOverlays | undefined = useMemo(() => {
    if (!showEma || !snap?.indicators) return undefined;
    return snap.indicators;
  }, [snap?.indicators, showEma]);

  const chartLevels: ChartLevels = useMemo(() => {
    const pos = data.openTrades.find((p) => p.symbol === symbol);
    if (aiAnalysis && (aiAnalysis.entry || aiAnalysis.stopLoss || aiAnalysis.tp1)) {
      return {
        entry: aiAnalysis.entry,
        stopLoss: aiAnalysis.stopLoss,
        tp1: aiAnalysis.tp1,
        tp2: aiAnalysis.tp2,
        tp3: aiAnalysis.tp3,
        supports: aiAnalysis.supports,
        resistances: aiAnalysis.resistances,
      };
    }
    return {
      entry: pos ? Number(pos.entry_price) : undefined,
      stopLoss: pos ? Number(pos.current_stop_loss) : undefined,
      tp1: pos ? Number(pos.tp1) : undefined,
      tp2: pos?.tp2 ? Number(pos.tp2) : undefined,
      tp3: pos?.tp3 ? Number(pos.tp3) : undefined,
    };
  }, [aiAnalysis, data.openTrades, symbol]);

  if (uiMode === 'simple') {
    const coinBase = symbol.replace('USDT', '');
    const coinFaTitle = coinDisplayName(coinBase, isFa);
    const usdAmountStr = marginEst > 0 ? marginEst.toFixed(0) : '0';
    const tomanAmountStr = marginEst > 0 ? Math.round(marginEst * 70000).toLocaleString('en-US') : '0';

    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {/* 1. Screenshot 4 Top Segmented Switch: معامله آسان | معامله حرفه‌ای */}
        {onToggleUiMode && (
          <div className="flex justify-center">
            <div className="panel rounded-full p-1 inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleUiMode('simple')}
                className="px-5 py-2 rounded-full text-xs font-black bg-[#1E293B] text-white shadow-sm transition"
              >
                {isFa ? 'معامله آسان' : 'Easy Trade'}
              </button>
              <button
                type="button"
                onClick={() => onToggleUiMode('pro')}
                className="px-5 py-2 rounded-full text-xs font-bold text-dim hover:text-main transition"
              >
                {isFa ? 'معامله حرفه‌ای' : 'Pro Trade'}
              </button>
            </div>
          </div>
        )}

        {/* 2. Kifpool image-3.png Clean Open Coin Strip + Live Price + Candle Toggle */}
        <div className="px-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SymbolPicker
              lang={lang}
              compact
              value={symbol}
              markets={markets}
              provider={data.activeExchange?.provider || 'paper'}
              marketType={marketType}
              onChangeMarketType={(m) => void onChangeMarketType?.(m)}
              onChange={(sym) => setSymbol(sym)}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-end leading-tight">
              <span className="block text-[10px] font-bold text-dim">{isFa ? 'قیمت لحظه‌ای' : 'Live Price'}</span>
              <span dir="ltr" className="font-num font-black text-sm text-[#0D9455]">
                ${fmtPx(lastPx)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowSimpleChart((v) => !v)}
              className={`p-2 rounded-xl transition inline-flex items-center gap-1 text-xs font-bold ${
                showSimpleChart ? 'bg-[#1652F0] text-white' : 'panel text-main'
              }`}
              title={isFa ? 'نمودار کندلی' : 'Candlestick Chart'}
            >
              <CandleIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {onChangeMarketType && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-dim">{isFa ? 'نوع بازار معامله:' : 'Market Type:'}</span>
            <div className="ios-segmented p-0.5">
              <button
                type="button"
                onClick={() => void onChangeMarketType('FUTURES')}
                className={`px-3 py-1 rounded-full text-[10px] font-black transition ${marketType === 'FUTURES' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? 'فیوچرز' : 'Futures'}
              </button>
              <button
                type="button"
                onClick={() => void onChangeMarketType('SPOT')}
                className={`px-3 py-1 rounded-full text-[10px] font-black transition ${marketType === 'SPOT' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? 'اسپات' : 'Spot'}
              </button>
            </div>
          </div>
        )}

        {/* Expandable Interactive Candlestick Chart */}
        {showSimpleChart && (
          <div className="panel rounded-[22px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm text-main">{coinFaTitle}</span>
                <span dir="ltr" className="font-num font-bold text-sm text-main">${fmtPx(lastPx)}</span>
              </div>
              <div className="flex gap-1">
                {(['15m', '1h', '4h', '1d'] as Timeframe[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTf(t)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${tf === t ? 'ios-pill-active' : 'surface-soft text-dim'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <CandlestickChart candles={snap?.candles ?? []} height={260} />
          </div>
        )}

        {/* 3. Kifpool image-3.png Open-Canvas Buy / Sell Form */}
        <form onSubmit={prepareOrderConfirmation} className="space-y-3">
          {/* Full-Width Emerald/White Buy & Sell Pills */}
          <div className={marketType === 'SPOT' ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2.5'}>
            <button
              type="button"
              onClick={() => {
                setSide('LONG');
                if (lastPx > 0) applyAutoLevels(lastPx, 'LONG');
              }}
              className={`py-3 rounded-[16px] text-sm font-black transition shadow-xs ${
                effectiveSide === 'LONG'
                  ? 'bg-[#0D9455] text-white shadow-sm'
                  : 'panel text-main hover:bg-[var(--soft)]'
              }`}
            >
              {marketType === 'SPOT' ? (isFa ? `خرید ${coinFaTitle}` : `Buy ${coinBase}`) : isFa ? 'خرید' : 'Buy'}
            </button>
            {marketType === 'FUTURES' && (
              <button
                type="button"
                onClick={() => {
                  setSide('SHORT');
                  if (lastPx > 0) applyAutoLevels(lastPx, 'SHORT');
                }}
                className={`py-3 rounded-[16px] text-sm font-black transition shadow-xs ${
                  effectiveSide === 'SHORT'
                    ? 'bg-[#EF4444] text-white shadow-sm'
                    : 'panel text-main hover:bg-[var(--soft)]'
                }`}
              >
                {isFa ? 'فروش' : 'Sell'}
              </button>
            )}
          </div>

          {/* Twin Clean White Input Boxes matching image-3.png */}
          <div className="space-y-2.5">
            <div className="panel rounded-[18px] px-4 py-3.5 flex items-center justify-between gap-3 border hairline focus-within:border-[#1652F0]">
              <div className="flex items-center gap-2 shrink-0 border-e hairline pe-3">
                <span className="text-xs font-black text-main">USD</span>
              </div>
              <input
                type="number"
                min={1}
                max={Math.max(10, freeCash)}
                value={Math.round(marginEst)}
                onChange={(e) => {
                  const usd = Math.max(1, Number(e.target.value) || 0);
                  const pct = Math.min(100, Math.max(1, Math.round((usd / Math.max(1, freeCash)) * 100)));
                  setMarginPct(pct);
                }}
                dir="ltr"
                className="bg-transparent text-end font-num font-black text-base text-main outline-none flex-1 min-w-0"
              />
            </div>

            {isFa && (
              <div className="panel rounded-[18px] px-4 py-3.5 flex items-center justify-between gap-3 border hairline">
                <span className="text-xs font-bold text-main shrink-0 border-e hairline pe-3">تومان</span>
                <span dir="ltr" className="font-num font-bold text-sm text-main flex-1 text-end">
                  {tomanAmountStr}
                </span>
              </div>
            )}
          </div>

          {/* 4 Dashed Percentage Chips matching image-3.png */}
          <div className="grid grid-cols-4 gap-2 pt-0.5">
            {[10, 25, 50, 100].map((pct) => {
              const active = Math.abs(marginPct - pct) <= 2;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setMarginPct(pct)}
                  className={`py-2 rounded-full text-xs font-num font-black border border-dashed transition ${
                    active
                      ? 'border-[#0D9455] bg-[#0D9455]/10 text-[#0D9455]'
                      : 'border-[var(--line-strong)] bg-[var(--panel)] text-sub hover:text-main'
                  }`}
                >
                  {pct}%
                </button>
              );
            })}
          </div>

          {/* Futures Comfort Leverage Pills */}
          {marketType === 'FUTURES' && (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-bold text-dim">{isFa ? 'اهرم محافظت‌شده:' : 'Leverage:'}</span>
              <div className="flex gap-1.5">
                {[
                  { v: 3, l: isFa ? 'امن ۳×' : '3×' },
                  { v: 5, l: isFa ? 'متعادل ۵×' : '5×' },
                  { v: 10, l: isFa ? 'سریع ۱۰×' : '10×' },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setLev(opt.v)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-black transition ${
                      lev === opt.v ? 'ios-pill-active' : 'panel text-dim'
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {orderMsg && <div className="p-3 rounded-2xl badge-signal text-xs font-bold">{orderMsg}</div>}

          {/* Full-Width Emerald / Rose Execution CTA */}
          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3.5 rounded-[16px] text-sm font-black text-white shadow-md transition inline-flex items-center justify-center gap-2 ${
              effectiveSide === 'LONG' ? 'bg-[#0D9455] hover:bg-[#059669]' : 'bg-[#EF4444] hover:bg-[#DC2626]'
            }`}
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>
              {submitting ? (
                '...'
              ) : effectiveSide === 'LONG' ? (
                <>
                  {isFa ? `خرید ${coinFaTitle}` : `Buy ${coinBase}`} <span dir="ltr" className="font-num">(${usdAmountStr})</span>
                </>
              ) : (
                <>
                  {isFa ? `فروش ${coinFaTitle}` : `Sell ${coinBase}`} <span dir="ltr" className="font-num">(${usdAmountStr})</span>
                </>
              )}
            </span>
          </button>

          {/* Meta Row Right Under CTA matching image-3.png */}
          <div className="flex items-center justify-between text-[11px] px-1 pt-0.5">
            <button
              type="button"
              onClick={() => setMarginPct(100)}
              className="text-dim font-bold hover:text-[#1652F0] transition inline-flex items-center gap-1"
            >
              <span>{isFa ? 'موجودی در دسترس:' : 'Available:'}</span>
              <strong dir="ltr" className="text-[#F59E0B] font-num">${freeCash.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
            </button>
            <span className="text-dim font-bold">
              {isFa ? 'حدضرر / تارگت:' : 'SL / TP1:'}{' '}
              <strong dir="ltr" className="text-main font-num">${stopLoss || '—'} / ${tp1 || '—'}</strong>
            </span>
          </div>
        </form>

        {/* 4. Kifpool image-3.png Outlined 4-Row Market Info Card */}
        <div className="rounded-[20px] border hairline bg-[var(--panel)]/65 px-4 py-2 divide-y hairline text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-dim font-semibold">{isFa ? 'قیمت تومانی' : 'Price (IRT)'}</span>
            <span dir="ltr" className="font-num font-bold text-main">
              {isFa ? `${formatTomanEq(lastPx)} تومان` : `$${fmtPx(lastPx)}`}
            </span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-dim font-semibold">{isFa ? 'بالاترین قیمت روز' : '24h High'}</span>
            <span dir="ltr" className="font-num font-bold text-main">${fmtPx(snap?.market24h.high24h)}</span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-dim font-semibold">{isFa ? 'پایین‌ترین قیمت روز' : '24h Low'}</span>
            <span dir="ltr" className="font-num font-bold text-main">${fmtPx(snap?.market24h.low24h)}</span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-dim font-semibold">{isFa ? 'تغییرات ۲۴ ساعت' : '24h Change'}</span>
            <span dir="ltr" className={`font-num font-black ${chg24 >= 0 ? 'text-jade' : 'text-loss'}`}>
              {chg24 >= 0 ? '+' : ''}
              {chg24.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* 5. Outlined Safety Notice Box matching image-3.png */}
        <div className="rounded-[18px] border hairline bg-[var(--panel)]/50 px-4 py-3 flex items-center justify-center gap-2 text-[11px] text-sub text-center leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-[#0D9455] shrink-0" />
          <span>
            {isFa
              ? 'تمامی معاملات دلارینو با سپر حدضرر و تارگت سود خودکار محافظت می‌شوند.'
              : 'All Dollarino trades are protected by automated Stop-Loss & TP1 risk guard.'}
          </span>
        </div>

        <ConfirmTradeSheet
          open={Boolean(pendingConfirm)}
          lang={lang}
          order={pendingConfirm}
          busy={submitting}
          onConfirm={placeOrder}
          onCancel={() => setPendingConfirm(null)}
        />
      </div>
    );
  }

  // Computed Risk / Reward & Liquidation metrics for the Order Ticket
  const refEntry = orderType === 'LIMIT' && Number(limitPrice) > 0 ? Number(limitPrice) : lastPx;
  const slNum = Number(stopLoss);
  const tp1Num = Number(tp1);
  const tp2Num = Number(tp2);
  const slConflict =
    refEntry > 0 &&
    Number.isFinite(slNum) &&
    slNum > 0 &&
    ((effectiveSide === 'LONG' && slNum >= refEntry) || (effectiveSide === 'SHORT' && slNum <= refEntry));
  const riskDistPct = refEntry > 0 && slNum > 0 ? Math.abs(refEntry - slNum) / refEntry : 0;
  const riskUsdEst = marginEst * effectiveLev * riskDistPct;
  const rewardRef = tp2Num > 0 ? tp2Num : tp1Num;
  const rewardDistPct = refEntry > 0 && rewardRef > 0 ? Math.abs(rewardRef - refEntry) / refEntry : 0;
  const rrPreview = riskDistPct > 0 && rewardDistPct > 0 ? (rewardDistPct / riskDistPct).toFixed(2) : '—';
  const estLiqPx =
    refEntry > 0 && marketType === 'FUTURES'
      ? effectiveSide === 'LONG'
        ? refEntry * (1 - 0.9 / Math.max(1, effectiveLev))
        : refEntry * (1 + 0.9 / Math.max(1, effectiveLev))
      : 0;

  const bestBidPx = snap?.orderBook.bids?.[0]?.[0];
  const bestAskPx = snap?.orderBook.asks?.[0]?.[0];
  const imbalanceVal = Number(snap?.imbalancePct ?? 50);

  return (
    <div className="space-y-4">
      {/* Compact Pro Exchange Ticker Strip (Single cohesive bar, zero dead whitespace) */}
      <div className="panel rounded-[22px] px-3.5 sm:px-5 py-2.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Pair + Market Switch + Live Mark Price */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5">
            <SymbolPicker
              lang={lang}
              markets={markets}
              value={symbol}
              provider={data.activeExchange?.provider || 'paper'}
              marketType={marketType}
              onChangeMarketType={(m) => void onChangeMarketType?.(m)}
              onChange={(sym) => setSymbol(sym)}
              compact
            />

            {onChangeMarketType && (
              <div className="ios-segmented p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void onChangeMarketType('FUTURES')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black transition ${marketType === 'FUTURES' ? 'ios-pill-active' : 'text-dim'}`}
                >
                  {isFa ? 'فیوچرز' : 'Futures'}
                </button>
                <button
                  type="button"
                  onClick={() => void onChangeMarketType('SPOT')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black transition ${marketType === 'SPOT' ? 'ios-pill-active' : 'text-dim'}`}
                >
                  {isFa ? 'اسپات' : 'Spot'}
                </button>
              </div>
            )}

            <div className="flex items-baseline gap-2 ps-1">
              <span dir="ltr" className={`font-num font-black text-lg sm:text-xl leading-none ${chg24 >= 0 ? 'text-jade' : 'text-loss'}`}>
                {loadingSymbol && !lastPx ? '...' : `$${fmtPx(lastPx)}`}
              </span>
              <span
                dir="ltr"
                className={`font-num text-[11px] font-black px-2 py-0.5 rounded-lg ${
                  chg24 >= 0 ? 'bg-[#0D9455]/15 text-jade' : 'bg-rose-500/15 text-loss'
                }`}
              >
                {chg24 >= 0 ? '+' : ''}
                {chg24.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* 24h Metrics + Quick Chips + Alerts */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
            <div className="hidden md:flex items-center gap-4 text-[11px] border-e hairline pe-3">
              <div>
                <span className="text-dim block text-[9.5px]">{isFa ? 'سقف / کف ۲۴س' : '24h High / Low'}</span>
                <span dir="ltr" className="font-num font-bold text-main">
                  ${fmtPx(snap?.market24h.high24h)} / ${fmtPx(snap?.market24h.low24h)}
                </span>
              </div>
              <div>
                <span className="text-dim block text-[9.5px]">{isFa ? 'فاندینگ ریت' : 'Funding'}</span>
                <span dir="ltr" className="font-num font-bold text-main">{snap?.market24h.fundingRate ?? '0.008%'}</span>
              </div>
            </div>

            <div className="hidden xl:flex items-center gap-1">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'TONUSDT'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSymbol(s)}
                  className={`px-2 py-1 rounded-lg text-[10.5px] font-black transition inline-flex items-center gap-1 shrink-0 ${
                    symbol === s ? 'btn-gold shadow-sm' : 'surface-soft text-dim hover:text-main'
                  }`}
                >
                  <CoinIcon symbol={s} size={13} />
                  <span>{s.replace('USDT', '')}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setRightIntel('tools')}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 transition ${
                rightIntel === 'tools' ? 'btn-gold' : 'surface-soft text-sub hover:text-main'
              }`}
              title={isFa ? 'هشدار قیمت و ماشین‌حساب R:R' : 'Price Alerts & R:R Calculator'}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>{isFa ? `هشدار (${alerts.filter((a) => a.is_active).length})` : `Alerts (${alerts.filter((a) => a.is_active).length})`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Equal-Height Pro Grid: 8 Columns Chart + Live Depth Strip | 4 Columns Order Ticket */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left 8 Columns: Candlestick Chart + Live Bid/Ask Pressure Strip */}
        <div className="xl:col-span-8 panel rounded-[26px] p-4 flex flex-col justify-between gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <CoinIcon symbol={symbol} size={22} showPair />
              <span className="font-bold text-main">
                {symbol} · {marketType === 'SPOT' ? 'Spot' : 'Perpetual'} · {tf}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex gap-1 me-1 bg-[var(--soft)] p-0.5 rounded-xl border hairline">
                {(['1m', '5m', '15m', '1h', '4h'] as Timeframe[]).map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setTf(x)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${tf === x ? 'btn-gold' : 'text-dim hover:text-main'}`}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowEma((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 ${showEma ? 'badge-signal' : 'btn-ghost text-dim'}`}
              >
                <Eye className="w-3 h-3" /> EMA
              </button>
              <button
                type="button"
                onClick={() => setShowKbos((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 ${showKbos ? 'badge-signal' : 'btn-ghost text-dim'}`}
              >
                <Eye className="w-3 h-3" /> KBOS
              </button>
              <button
                type="button"
                onClick={() => setRightIntel('script')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 ${rightIntel === 'script' || customChartOverlay ? 'btn-lime' : 'btn-ghost text-dim'}`}
              >
                <Code2 className="w-3 h-3" /> Pine/Py
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightIntel('ai');
                  void askChartAI();
                }}
                disabled={aiLoading}
                className="btn-gold px-3 py-1.5 rounded-xl text-[11px] inline-flex items-center gap-1.5"
              >
                <BrainCircuit className="w-3.5 h-3.5" />
                <span>{aiLoading ? '...' : isFa ? 'تحلیل هوشمند AI' : 'AI Analyze'}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[470px]">
            {snap?.candles?.length ? (
              <CandlestickChart
                candles={snap.candles}
                overlays={chartOverlays}
                kbosOverlays={showKbos ? snap.kbosOverlays : undefined}
                customOverlays={customChartOverlay ?? snap.customOverlays}
                levels={chartLevels}
                height={500}
              />
            ) : (
              <div className="h-[500px] grid place-items-center text-xs text-dim">
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-[var(--gold)]" />
                  <span>{isFa ? `در حال دریافت کندل‌های زنده ${symbol}...` : `Loading live ${symbol} chart...`}</span>
                </div>
              </div>
            )}
          </div>

          {/* Live Orderbook Micro-Pulse & Quick Limit Fill Strip (keeps Chart column aligned with Order Ticket) */}
          <div className="rounded-2xl surface-soft border hairline px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (bestBidPx) {
                    setOrderType('LIMIT');
                    setLimitPrice(bestBidPx);
                  }
                }}
                className="inline-flex items-center gap-1.5 hover:underline"
                title={isFa ? 'کلیک برای پر کردن قیمت لیمیت خرید' : 'Click to fill Buy Limit'}
              >
                <span className="text-dim">{isFa ? 'بهترین خرید:' : 'Best Bid:'}</span>
                <span dir="ltr" className="font-num font-black text-jade">${fmtPx(bestBidPx)}</span>
              </button>
              <span className="text-dim">·</span>
              <button
                type="button"
                onClick={() => {
                  if (bestAskPx) {
                    setOrderType('LIMIT');
                    setLimitPrice(bestAskPx);
                  }
                }}
                className="inline-flex items-center gap-1.5 hover:underline"
                title={isFa ? 'کلیک برای پر کردن قیمت لیمیت فروش' : 'Click to fill Sell Limit'}
              >
                <span className="text-dim">{isFa ? 'بهترین فروش:' : 'Best Ask:'}</span>
                <span dir="ltr" className="font-num font-black text-loss">${fmtPx(bestAskPx)}</span>
              </button>
              <span className="hidden sm:inline text-dim">
                · {isFa ? 'اسپرد:' : 'Spread:'}{' '}
                <strong dir="ltr" className="font-num text-main">{snap?.spreadPct ?? '0.02'}%</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 min-w-[190px] flex-1 max-w-xs">
              <span dir="ltr" className="font-num font-black text-[10px] text-jade">{imbalanceVal.toFixed(0)}%</span>
              <div className="flex-1 h-2 rounded-full bg-rose-500/30 overflow-hidden flex">
                <div
                  className="h-full bg-[#0D9455] transition-all duration-300"
                  style={{ width: `${Math.max(8, Math.min(92, imbalanceVal))}%` }}
                />
              </div>
              <span dir="ltr" className="font-num font-black text-[10px] text-loss">{(100 - imbalanceVal).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Clean, Equal-Height Pro Order Ticket */}
        <form onSubmit={prepareOrderConfirmation} className="xl:col-span-4 panel rounded-[26px] p-4 sm:p-5 flex flex-col justify-between gap-3 text-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CoinIcon symbol={symbol} size={22} />
                <span className="font-display font-bold text-base text-main">{isFa ? `معامله ${symbol.replace('USDT', '')}` : `Trade ${symbol}`}</span>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full badge-signal">
                {data.config.trading_mode} · {marketType}
              </span>
            </div>

            <div className={marketType === 'SPOT' ? 'grid grid-cols-1 p-1 rounded-xl bg-black/15 dark:bg-black/30 border hairline' : 'grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/15 dark:bg-black/30 border hairline'}>
              {(['LONG', ...(marketType === 'FUTURES' ? (['SHORT'] as const) : [])] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSide(s);
                    applyAutoLevels(lastPx, s, orderType === 'LIMIT');
                  }}
                  className={`py-2.5 rounded-lg font-black transition flex items-center justify-center gap-1.5 ${
                    effectiveSide === s ? (s === 'LONG' ? 'bg-jade text-black shadow-sm' : 'bg-rose-500 text-white shadow-sm') : 'text-dim hover:text-main'
                  }`}
                >
                  {s === 'LONG' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>{marketType === 'SPOT' ? (isFa ? 'خرید اسپات SPOT' : 'SPOT BUY') : s === 'LONG' ? (isFa ? 'خرید LONG' : 'LONG') : isFa ? 'فروش SHORT' : 'SHORT'}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(['MARKET', 'LIMIT'] as const).map((ot) => (
                <button
                  key={ot}
                  type="button"
                  onClick={() => {
                    setOrderType(ot);
                    if (ot === 'LIMIT' && !limitPrice && lastPx > 0) {
                      const dec = lastPx >= 1000 ? 2 : lastPx >= 1 ? 4 : 6;
                      setLimitPrice(lastPx.toFixed(dec));
                    }
                  }}
                  className={`py-2 rounded-xl font-bold ${orderType === ot ? 'btn-gold' : 'btn-ghost text-dim'}`}
                >
                  {ot === 'MARKET' ? (isFa ? 'مارکت لحظه‌ای' : 'Market') : isFa ? 'سفارش لیمیت' : 'Limit'}
                </button>
              ))}
            </div>

            {marketType === 'FUTURES' && (
              <div className="grid grid-cols-2 gap-1.5">
                {(['ISOLATED', 'CROSS'] as const).map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    onClick={() => setMarginMode(mm)}
                    className={`py-1.5 rounded-lg text-[10px] font-bold ${
                      marginMode === mm ? 'banner-cobalt-soft text-main border border-[var(--gold)]' : 'btn-ghost text-dim'
                    }`}
                  >
                    {mm}
                  </button>
                ))}
              </div>
            )}

            {orderType === 'LIMIT' && (
              <div>
                <label className="text-[10px] text-dim block mb-1">{isFa ? `قیمت ورود لیمیت (${symbol})` : 'Limit Entry Price'}</label>
                <input
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder={lastPx ? fmtPx(lastPx) : 'USDT'}
                  className="field font-num text-xs py-2"
                />
              </div>
            )}

            {/* Margin % Quick Selector */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-dim">{isFa ? 'درصد سرمایه درگیر' : 'Margin Allocation'}</span>
                <span dir="ltr" className="font-num font-bold text-main">{marginPct}% ({fmtUsd(marginEst)})</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[5, 10, 25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setMarginPct(pct)}
                    className={`py-1.5 rounded-lg text-[10px] font-black transition ${
                      marginPct === pct ? 'btn-gold' : 'btn-ghost text-dim'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {marketType === 'FUTURES' && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-dim">{isFa ? 'اهرم معاملاتی' : 'Leverage'}</span>
                  <span dir="ltr" className="font-num font-bold" style={{ color: 'var(--gold)' }}>{lev}×</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={lev}
                  onChange={(e) => setLev(Number(e.target.value))}
                  className="w-full"
                  style={{ ['--fill' as string]: `${((lev - 1) / 49) * 100}%` }}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-sub">{isFa ? 'حد ضرر و تارگت‌های سود' : 'Stop Loss & Take Profits'}</span>
                <button
                  type="button"
                  onClick={() => applyAutoLevels(lastPx, effectiveSide, orderType === 'LIMIT')}
                  className="text-[10px] font-bold text-[var(--gold)] hover:underline inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{isFa ? 'محاسبه خودکار' : 'Auto Reset'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-dim block mb-0.5">{isFa ? 'حد ضرر SL' : 'Stop Loss'}</label>
                  <input
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className={`field font-num text-xs py-1.5 ${slConflict ? '!border-rose-500' : ''}`}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-dim block mb-0.5">{isFa ? 'تارگت ۱' : 'TP 1'}</label>
                  <input value={tp1} onChange={(e) => setTp1(e.target.value)} className="field font-num text-xs py-1.5" />
                </div>
                <div>
                  <label className="text-[10px] text-dim block mb-0.5">{isFa ? 'تارگت ۲' : 'TP 2'}</label>
                  <input value={tp2} onChange={(e) => setTp2(e.target.value)} className="field font-num text-xs py-1.5" />
                </div>
                <div>
                  <label className="text-[10px] text-dim block mb-0.5">{isFa ? 'تارگت ۳' : 'TP 3'}</label>
                  <input value={tp3} onChange={(e) => setTp3(e.target.value)} className="field font-num text-xs py-1.5" />
                </div>
              </div>
              {slConflict && (
                <div className="text-[10px] text-loss font-bold flex items-center justify-between bg-rose-500/10 rounded-lg px-2.5 py-1.5">
                  <span>
                    {isFa
                      ? `حد ضرر با جهت ${effectiveSide} هم‌خوانی ندارد!`
                      : `SL is on the wrong side for ${effectiveSide}!`}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyAutoLevels(lastPx, effectiveSide, false)}
                    className="underline font-black"
                  >
                    {isFa ? 'اصلاح فوری' : 'Fix'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="rounded-2xl bg-[var(--soft)] border hairline p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'مارجین تخمینی' : 'Est. Margin'}</span>
                <span dir="ltr" className="font-num font-bold text-main">{fmtUsd(marginEst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'حجم کل پوزیشن' : 'Position Notional'}</span>
                <span dir="ltr" className="font-num font-bold text-main">{fmtUsd(marginEst * effectiveLev)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim inline-flex items-center gap-1">
                  <Calculator className="w-3 h-3" /> {isFa ? 'نسبت ریسک به ریوارد' : 'Risk : Reward'}
                </span>
                <span dir="ltr" className="font-num font-bold text-jade">
                  {rrPreview !== '—' ? `1 : ${rrPreview}` : '—'} {riskUsdEst > 0 ? `(Risk ${fmtUsd(riskUsdEst)})` : ''}
                </span>
              </div>
              {estLiqPx > 0 && (
                <div className="flex justify-between">
                  <span className="text-dim">{isFa ? 'لیکویید شدن تقریبی' : 'Est. Liq Price'}</span>
                  <span dir="ltr" className="font-num font-bold text-amber-400">${fmtPx(estLiqPx)}</span>
                </div>
              )}
            </div>

            {orderMsg && (
              <div className="text-[11px] font-bold inline-flex items-center gap-1" style={{ color: 'var(--gold)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{orderMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 ${
                effectiveSide === 'LONG' ? 'btn-gold' : 'bg-rose-500 text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>{submitting ? '...' : isFa ? 'دلارینو ترید کن برام' : 'Execute Protected Trade'}</span>
            </button>

            <p className="text-[10px] text-dim flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-jade shrink-0" />
              <span>{isFa ? 'هیچ سفارشی بدون حد ضرر باز نمی‌شود.' : 'Protected by mandatory stop-loss guard.'}</span>
            </p>
          </div>
        </form>
      </div>

      {/* Full-Width 12-Column Unified Pro Workbench: Positions | Order Book | Chart AI | Pine/Py | Alerts & R:R */}
      <div className="panel rounded-[26px] p-4 sm:p-5 space-y-4 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 rounded-2xl bg-[var(--soft)] border hairline">
          <button
            type="button"
            onClick={() => setRightIntel('positions')}
            className={`py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'positions' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isFa
                ? `پوزیشن‌ها و سفارش‌ها (${data.openTrades.length + (data.pendingOrders?.length || 0)})`
                : `Positions (${data.openTrades.length})`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRightIntel('book')}
            className={`py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'book' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Scale className="w-3.5 h-3.5 shrink-0" />
            <span>{isFa ? 'دفتر سفارش‌ها و عمق' : 'Order Book'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRightIntel('ai')}
            className={`py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'ai' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5 shrink-0" />
            <span>{isFa ? 'چارت AI و ستاپ' : 'Chart AI'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRightIntel('script')}
            className={`py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'script' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 shrink-0" />
            <span>{isFa ? 'اسکریپت Pine/Py' : 'Pine / Python'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRightIntel('tools')}
            className={`col-span-2 sm:col-span-1 py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'tools' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span>{isFa ? `هشدار قیمت (${alerts.filter((a) => a.is_active).length})` : 'Alerts & R:R'}</span>
          </button>
        </div>

        {rightIntel === 'positions' ? (
          <div className="space-y-3">
            {data.openTrades.length === 0 ? (
              <div className="py-8 text-center text-xs text-dim surface-soft rounded-2xl">
                {isFa ? 'پوزیشن بازی در این حساب ثبت نشده است.' : 'No open positions.'}
              </div>
            ) : (
              <div className="space-y-2">
                {data.openTrades.map((p) => {
                  const u = Number(p.unrealized_pnl || 0);
                  return (
                    <div key={p.id} className="rounded-2xl bg-[var(--soft)] border hairline px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${p.direction === 'LONG' ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                        {p.direction} {p.leverage}×
                      </span>
                      <button type="button" onClick={() => setSymbol(p.symbol)} className="font-bold text-main hover:underline">
                        {p.symbol}
                      </button>
                      <span dir="ltr" className="text-dim tabular">
                        Entry ${p.entry_price} → Now ${p.mark_price ?? p.entry_price}
                      </span>
                      <span dir="ltr" className="text-dim tabular">
                        SL ${p.current_stop_loss} · TP1 ${p.tp1}
                      </span>
                      <span dir="ltr" className={`ms-auto font-num font-bold ${u >= 0 ? 'text-jade' : 'text-loss'}`}>
                        {u >= 0 ? '+' : ''}${u.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditPos(p);
                          setEditForm({ stopLoss: p.current_stop_loss || '', tp1: p.tp1 || '', tp2: p.tp2 || '', tp3: p.tp3 || '' });
                        }}
                        className="btn-ghost px-2.5 py-1.5 rounded-xl font-bold inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> TP/SL
                      </button>
                      <button
                        type="button"
                        onClick={() => void closePosition(p.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white font-black transition"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{isFa ? 'بستن' : 'Close'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {data.pendingOrders && data.pendingOrders.length > 0 && (
              <div className="pt-2 border-t hairline space-y-1.5">
                {data.pendingOrders.map((po) => (
                  <div key={po.id} className="surface-soft rounded-xl px-3.5 py-2 flex items-center justify-between text-xs">
                    <span><strong>{po.symbol}</strong> · {po.direction} Limit @ ${po.limit_price}</span>
                    <button type="button" onClick={() => void cancelPending(po.id)} className="text-loss font-bold hover:underline">
                      {isFa ? 'لغو' : 'Cancel'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : rightIntel === 'ai' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 space-y-3">
              {aiAnalysis ? (
                <div className="rounded-2xl bg-[var(--soft)] border hairline p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={`font-black text-sm ${aiAnalysis.direction === 'SHORT' || aiAnalysis.bias === 'SHORT' ? 'text-loss' : 'text-jade'}`}>
                      {aiAnalysis.direction ?? aiAnalysis.bias ?? 'NEUTRAL'} · {aiAnalysis.confidence ?? 0}%
                    </span>
                    {aiAnalysis.rrRatio && (
                      <span dir="ltr" className="font-num font-bold text-dim">R:R 1:{aiAnalysis.rrRatio}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-sub leading-relaxed whitespace-pre-wrap">{aiAnalysis.summary}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-num" dir="ltr">
                    <div className="surface-soft rounded-lg px-2 py-1.5">EN: ${fmtPx(aiAnalysis.entry)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1.5 text-loss">SL: ${fmtPx(aiAnalysis.stopLoss)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1.5 text-jade">TP1: ${fmtPx(aiAnalysis.tp1)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1.5 text-jade">TP2: ${fmtPx(aiAnalysis.tp2)}</div>
                  </div>
                  {(aiAnalysis.stopLoss || aiAnalysis.tp1) && (
                    <button
                      type="button"
                      onClick={copyAiLevelsToTicket}
                      className="btn-emerald w-full py-2 rounded-xl text-[11px] flex items-center justify-center gap-1.5"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انتقال دقیق سطوح AI به فرم سفارش' : 'Copy AI Levels to Ticket'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-[var(--soft)] border hairline p-4 text-center space-y-2">
                  <Sparkles className="w-5 h-5 text-[var(--gold)] mx-auto" />
                  <p className="text-[11px] text-sub">
                    {isFa
                      ? `روی «تحلیل هوشمند AI» کلیک کنید تا سطوح ورود، حد ضرر و اهداف سود برای ${symbol} روی چارت رسم شوند.`
                      : `Click "AI Analyze" to draw smart Entry, SL, and TP levels for ${symbol} directly on the chart.`}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {[
                  isFa ? 'ستاپ ورود + استاپ و ۳ تارگت' : 'Entry + SL + 3 TPs setup',
                  isFa ? 'نواحی حمایت و مقاومت کلیدی' : 'Key Support / Resistance',
                  isFa ? 'هم‌راستایی ۱۵دقیقه و ۴ساعته' : '15m & 4h trend alignment',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void askChartAI(q)}
                    className="text-[10px] px-2.5 py-1.5 rounded-xl btn-ghost font-semibold text-start"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-2.5">
              <div className="min-h-[120px] max-h-[200px] overflow-y-auto space-y-2 rounded-2xl bg-[var(--soft)] border hairline p-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-xl p-2 text-[11px] leading-relaxed ${
                      m.role === 'user' ? 'banner-cobalt-soft text-main' : 'surface-soft text-sub'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-[11px] text-dim text-center py-6">
                    {isFa ? 'گفتگوی زنده با دستیار چارت آماده است.' : 'Ask any question about this chart.'}
                  </p>
                )}
              </div>

              {chatHistory.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <History className="w-3.5 h-3.5 text-dim shrink-0" />
                  {chatHistory.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void loadSavedChat(c.id)}
                      className="px-2 py-1 rounded-lg surface-soft text-[10px] font-bold shrink-0 hover:border-[var(--gold)]"
                    >
                      {c.symbol} · {c.timeframe}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-1.5">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void askChartAI()}
                  placeholder={isFa ? 'سوال از چارت...' : 'Ask chart AI...'}
                  className="field text-xs py-2"
                />
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => void askChartAI()}
                  className="btn-gold px-3.5 rounded-xl shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : rightIntel === 'book' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-dim pb-2 border-b hairline">
              <span>{isFa ? `اسپرد لحظه‌ای: ${snap?.spreadPct ?? '0.02'}%` : `Spread: ${snap?.spreadPct ?? '0.02'}%`}</span>
              <span>{isFa ? `نسبت فشار خریداران: ${snap?.imbalancePct ?? '50'}%` : `Bid Imbalance: ${snap?.imbalancePct ?? '50'}%`}</span>
              <span className="text-[10px]">{isFa ? 'کلیک روی هر ردیف قیمت را در سفارش لیمیت قرار می‌دهد' : 'Click any level to fill Limit Price'}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-num text-[11px]" dir="ltr">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-jade uppercase pb-1 px-2">
                  <span>Bid Price (USD)</span>
                  <span>Qty</span>
                </div>
                {(() => {
                  const rows = (snap?.orderBook.bids ?? []).slice(0, 10);
                  const maxQ = Math.max(0.001, ...rows.map((r) => Number(r[1] || 0)));
                  return rows.map(([p, s], idx) => {
                    const w = Math.min(100, Math.round((Number(s) / maxQ) * 100));
                    return (
                      <button
                        type="button"
                        key={`b-${idx}`}
                        onClick={() => {
                          setOrderType('LIMIT');
                          setLimitPrice(p);
                        }}
                        className="relative w-full overflow-hidden flex justify-between text-jade bg-jade/5 hover:bg-jade/15 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <span className="absolute inset-y-0 right-0 bg-jade/12 pointer-events-none" style={{ width: `${w}%` }} />
                        <span className="relative font-bold">${fmtPx(p)}</span>
                        <span className="relative text-dim">{Number(s).toFixed(3)}</span>
                      </button>
                    );
                  });
                })()}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-loss uppercase pb-1 px-2">
                  <span>Ask Price (USD)</span>
                  <span>Qty</span>
                </div>
                {(() => {
                  const rows = (snap?.orderBook.asks ?? []).slice(0, 10);
                  const maxQ = Math.max(0.001, ...rows.map((r) => Number(r[1] || 0)));
                  return rows.map(([p, s], idx) => {
                    const w = Math.min(100, Math.round((Number(s) / maxQ) * 100));
                    return (
                      <button
                        type="button"
                        key={`a-${idx}`}
                        onClick={() => {
                          setOrderType('LIMIT');
                          setLimitPrice(p);
                        }}
                        className="relative w-full overflow-hidden flex justify-between text-loss bg-rose-500/5 hover:bg-rose-500/15 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <span className="absolute inset-y-0 left-0 bg-rose-500/12 pointer-events-none" style={{ width: `${w}%` }} />
                        <span className="relative font-bold">${fmtPx(p)}</span>
                        <span className="relative text-dim">{Number(s).toFixed(3)}</span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        ) : rightIntel === 'script' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-4 space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                {(['pine', 'python'] as const).map((lng) => (
                  <button
                    key={lng}
                    type="button"
                    onClick={() => {
                      setScriptLang(lng);
                      const sample = SAMPLE_CUSTOM_STRATEGIES.find((s) => s.language === lng);
                      if (sample) {
                        setScriptName(isFa ? sample.nameFa : sample.nameEn);
                        setScriptCode(sample.code);
                      }
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-black uppercase ${scriptLang === lng ? 'btn-lime' : 'btn-ghost text-dim'}`}
                  >
                    {lng === 'pine' ? 'Pine v5' : 'Python'}
                  </button>
                ))}
              </div>

              <select
                value=""
                onChange={(e) => {
                  const found = SAMPLE_CUSTOM_STRATEGIES.find((s) => s.id === e.target.value);
                  if (found) {
                    setScriptLang(found.language);
                    setScriptName(isFa ? found.nameFa : found.nameEn);
                    setScriptCode(found.code);
                  }
                }}
                className="field py-1.5 px-2.5 text-[11px]"
              >
                <option value="">{isFa ? 'بارگذاری از کتابخانه نمونه...' : 'Load sample script...'}</option>
                {SAMPLE_CUSTOM_STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isFa ? s.nameFa : s.nameEn}
                  </option>
                ))}
              </select>

              <input
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder={isFa ? 'نام اسکریپت' : 'Script name'}
                className="field py-1.5 px-2.5 text-[11px] font-bold"
              />

              {scriptFeedback && (
                <div className={`p-2.5 rounded-xl text-[10px] font-bold ${scriptFeedback.ok ? 'badge-signal' : 'bg-rose-500/15 text-loss'}`}>
                  <div>{scriptFeedback.text}</div>
                  {scriptFeedback.retPct !== undefined && (
                    <div dir="ltr" className="font-num mt-0.5">
                      Return: {scriptFeedback.retPct >= 0 ? '+' : ''}{scriptFeedback.retPct.toFixed(2)}% · WR: {scriptFeedback.wr?.toFixed(1)}%
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={scriptBusy}
                  onClick={async () => {
                    setScriptBusy(true);
                    setScriptFeedback(null);
                    try {
                      const ev = await apiFetch<{
                        valid: boolean;
                        title: string;
                        errors: string[];
                        plots: CustomStrategyChartOverlay['plots'];
                        markers: CustomStrategyChartOverlay['markers'];
                        backtestSummary?: { metrics: { netReturnPct: number; winRatePct: number } };
                      }>('/api/trading/strategies/evaluate', {
                        method: 'POST',
                        body: JSON.stringify({ language: scriptLang, code: scriptCode, symbol, timeframe: tf }),
                      });
                      if (ev.valid) {
                        setCustomChartOverlay({
                          title: ev.title || scriptName,
                          language: scriptLang,
                          plots: ev.plots,
                          markers: ev.markers,
                        });
                        setScriptFeedback({
                          ok: true,
                          text: isFa ? `روی چارت رسم شد (${ev.plots.length} خط، ${ev.markers.length} سیگنال)` : `Plotted (${ev.plots.length} lines, ${ev.markers.length} signals)`,
                          retPct: ev.backtestSummary?.metrics.netReturnPct,
                          wr: ev.backtestSummary?.metrics.winRatePct,
                        });
                      } else {
                        setScriptFeedback({ ok: false, text: ev.errors[0] || 'Invalid script' });
                      }
                    } catch (err) {
                      setScriptFeedback({ ok: false, text: err instanceof Error ? err.message : 'Error' });
                    } finally {
                      setScriptBusy(false);
                    }
                  }}
                  className="btn-cobalt py-2 rounded-xl text-[11px] inline-flex items-center justify-center gap-1"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{scriptBusy ? '...' : isFa ? 'اجرا روی چارت' : 'Plot Chart'}</span>
                </button>
                <button
                  type="button"
                  disabled={scriptBusy}
                  onClick={async () => {
                    setScriptBusy(true);
                    try {
                      const saved = await apiFetch<{ strategy: { id: string } }>('/api/trading/strategies', {
                        method: 'POST',
                        body: JSON.stringify({ name: scriptName, language: scriptLang, code: scriptCode, timeframe: tf }),
                      });
                      await apiFetch(`/api/trading/strategies/${saved.strategy.id}/activate`, { method: 'POST' });
                      setScriptFeedback({ ok: true, text: isFa ? 'ذخیره و روی ربات خودکار فعال شد' : 'Saved & deployed to auto bot' });
                      await onRefresh();
                    } catch (err) {
                      setScriptFeedback({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
                    } finally {
                      setScriptBusy(false);
                    }
                  }}
                  className="btn-emerald py-2 rounded-xl text-[11px] inline-flex items-center justify-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isFa ? 'فعال‌سازی ربات' : 'Deploy Bot'}</span>
                </button>
              </div>
            </div>
            <textarea
              dir="ltr"
              spellCheck={false}
              rows={10}
              value={scriptCode}
              onChange={(e) => setScriptCode(e.target.value)}
              className="lg:col-span-8 w-full rounded-2xl p-3 font-mono text-[11px] leading-relaxed bg-[#060d20] text-[#dce8ff] border border-blue-500/30 outline-none"
            />
          </div>
        ) : (
          /* Clean 12-Col Spacious Live Price Alerts + R:R Summary */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <form onSubmit={createPriceAlert} className="lg:col-span-6 surface-soft rounded-2xl p-4 space-y-3 border hairline">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-main flex items-center gap-1.5 text-xs">
                  <BellRing className="w-4 h-4 text-[var(--gold)]" />
                  <span>{isFa ? `ثبت هشدار قیمت زنده برای ${symbol}` : `Live Price Alert · ${symbol}`}</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full badge-signal font-bold">
                  {isFa ? 'اطلاع فوری در وب و تلگرام' : 'Web + Telegram'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="text-[10px] text-dim font-bold block mb-1">{isFa ? 'شرط عبور قیمت' : 'Condition'}</label>
                  <select
                    value={alertCond}
                    onChange={(e) => setAlertCond(e.target.value as 'ABOVE' | 'BELOW')}
                    className="field w-full text-xs h-10 px-3"
                  >
                    <option value="ABOVE">{isFa ? 'بالاتر از (≥)' : 'Crosses Above (≥)'}</option>
                    <option value="BELOW">{isFa ? 'پایین‌تر از (≤)' : 'Drops Below (≤)'}</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="text-[10px] text-dim font-bold block mb-1">{isFa ? 'قیمت هدف (USDT)' : 'Target Price ($)'}</label>
                  <input
                    value={alertTarget}
                    onChange={(e) => setAlertTarget(e.target.value)}
                    placeholder={lastPx ? fmtPx(lastPx) : 'Target $'}
                    className="field w-full font-num text-xs h-10 px-3"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] text-dim font-bold block mb-1">{isFa ? 'یادداشت اختیاری' : 'Optional Note'}</label>
                  <input
                    value={alertNote}
                    onChange={(e) => setAlertNote(e.target.value)}
                    placeholder={isFa ? 'مثلاً: شکست مقاومت کلیدی یا نقطه ورود...' : 'e.g. Breakout level...'}
                    className="field w-full text-xs h-10 px-3"
                  />
                </div>
                <button type="submit" disabled={alertBusy} className="btn-gold h-10 px-5 rounded-xl text-xs font-black shrink-0">
                  {alertBusy ? '...' : isFa ? 'ثبت هشدار' : 'Set Alert'}
                </button>
              </div>
            </form>

            <div className="lg:col-span-6 space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-main">{isFa ? `هشدارهای ثبت‌شده (${alerts.length})` : `Active & Recent Alerts (${alerts.length})`}</span>
                <span className="text-[10px] text-dim">{isFa ? 'پایش لحظه‌ای قیمت ۲۴/۷' : '24/7 Live Watch'}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim border hairline">
                    {isFa
                      ? 'هنوز هشدار قیمتی ثبت نکرده‌اید. به محض رسیدن قیمت به هدف، در تلگرام و پنل به شما اطلاع می‌دهیم.'
                      : 'No price alerts set yet. Alerts notify you on Web & Telegram.'}
                  </div>
                ) : (
                  alerts.map((al) => (
                    <div key={al.id} className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs border hairline">
                      <div className="flex items-center gap-2.5">
                        <CoinIcon symbol={al.symbol} size={20} />
                        <div>
                          <div className="font-bold text-main font-num">
                            {al.symbol} {al.condition === 'ABOVE' ? '≥' : '≤'} ${al.target_price}
                          </div>
                          {al.note && <div className="text-[10px] text-dim">{al.note}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${al.is_active ? 'bg-jade/15 text-jade' : 'bg-white/10 text-dim'}`}>
                          {al.is_active ? (isFa ? 'فعال' : 'Active') : isFa ? 'عمل‌کرده' : 'Triggered'}
                        </span>
                        <button type="button" onClick={() => void deletePriceAlert(al.id)} className="text-dim hover:text-loss">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Summary Bar for Open Positions when viewing other Workbench tabs */}
      {rightIntel !== 'positions' && data.openTrades.length > 0 && (
        <div className="panel rounded-[22px] p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-main">
            <span className="h-2 w-2 rounded-full bg-jade live-dot" />
            <span>
              {isFa
                ? `${data.openTrades.length} پوزیشن باز فعال در حساب دارید`
                : `You have ${data.openTrades.length} active open position(s)`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRightIntel('positions')}
            className="btn-gold px-3.5 py-1.5 rounded-xl text-[11px] font-black"
          >
            {isFa ? 'مشاهده و مدیریت پوزیشن‌ها' : 'Manage Positions'}
          </button>
        </div>
      )}

      {editPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm grid place-items-center p-4"
            onClick={() => setEditPos(null)}
          >
            <form onSubmit={saveEditTpSl} className="pop-in panel !bg-[var(--panel)] rounded-[26px] w-full max-w-sm p-6 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main">{isFa ? `ویرایش TP/SL · ${editPos.symbol}` : `Edit TP/SL · ${editPos.symbol}`}</h3>
                <button type="button" onClick={() => setEditPos(null)}><X className="w-4 h-4" /></button>
              </div>
              <input value={editForm.stopLoss} onChange={(e) => setEditForm((f) => ({ ...f, stopLoss: e.target.value }))} placeholder="Stop Loss" className="field font-num" required />
              <input value={editForm.tp1} onChange={(e) => setEditForm((f) => ({ ...f, tp1: e.target.value }))} placeholder="TP1" className="field font-num" required />
              <div className="grid grid-cols-2 gap-2">
                <input value={editForm.tp2} onChange={(e) => setEditForm((f) => ({ ...f, tp2: e.target.value }))} placeholder="TP2" className="field font-num" />
                <input value={editForm.tp3} onChange={(e) => setEditForm((f) => ({ ...f, tp3: e.target.value }))} placeholder="TP3" className="field font-num" />
              </div>
              <button type="submit" className="btn-gold w-full py-3 rounded-xl font-black">{isFa ? 'ذخیره TP/SL' : 'Save TP/SL'}</button>
            </form>
          </div>,
          document.body
        )}

      <ConfirmTradeSheet
        open={Boolean(pendingConfirm)}
        lang={lang}
        order={pendingConfirm}
        busy={submitting}
        onConfirm={placeOrder}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
