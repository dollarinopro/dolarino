import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bot,
  BrainCircuit,
  CandlestickChart,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Edit3,
  Eye,
  EyeOff,
  Flame,
  Globe,
  KeyRound,
  Layers,
  LayoutGrid,
  PauseCircle,
  PlusCircle,
  Power,
  Radar,
  RefreshCw,
  Rocket,
  RotateCcw,
  Scale,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  WandSparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Timeframe } from '@dollarino/core';
import { apiFetch } from '../lib/api';
import { formatTomanEq } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import type { AuthUserInfo, DashboardPayload, NavTab, OpenTradeRow } from '../lib/types';
import { ModeGraphicAI, ModeGraphicCodex, ModeGraphicTelegram } from '../components/BrandGraphics';
import { CoinIcon } from '../components/CoinIcon';
import { AnimatedNumber, AreaChart, ConsensusGauge, LiveDot, Sparkline } from '../components/DollarinoViz';
import { QuickWidgetsBar } from '../components/QuickWidgetsBar';
import { SetupWizardModal } from '../components/SetupWizardModal';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';

const RISK_PRESETS = [
  {
    id: 'conservative' as const,
    titleFa: 'کم‌ریسک (محافظ سرمایه)',
    titleEn: 'Conservative',
    descFa: '۲٪ مارجین · اهرم ۳x · سقف ضرر روزانه ۳٪',
    descEn: '2% margin · 3x lev · 3% daily cap',
    marginPct: 2,
    maxLev: 3,
    dailyLoss: 3,
    maxOpen: 4,
    color: '#10d9a3',
  },
  {
    id: 'balanced' as const,
    titleFa: 'متعادل (پیشنهاد دلارینو)',
    titleEn: 'Balanced (Recommended)',
    descFa: '۵٪ مارجین · اهرم ۱۰x · تا ۸ ارز همزمان',
    descEn: '5% margin · 10x lev · up to 8 coins',
    marginPct: 5,
    maxLev: 10,
    dailyLoss: 6,
    maxOpen: 8,
    color: '#2b74ff',
  },
  {
    id: 'aggressive' as const,
    titleFa: 'پُرقدرت (آزادی کامل تریدر)',
    titleEn: 'Aggressive Pro',
    descFa: '۱۰٪ مارجین · اهرم ۲۰x · تا ۲۰ ارز همزمان',
    descEn: '10% margin · 20x lev · up to 20 coins',
    marginPct: 10,
    maxLev: 20,
    dailyLoss: 12,
    maxOpen: 20,
    color: '#e8c15a',
  },
];

const ALL_STRATEGIES = [
  { key: 'ai_autonomous_agent', labelFa: 'هوش مصنوعی دلارینو (Multi-AI)', labelEn: 'Dollarino Multi-AI' },
  { key: 'my_custom_ai', labelFa: 'هوش مصنوعی شخصی (قابل آموزش)', labelEn: 'Raw Personal AI (Trainable)' },
  { key: 'dollarino_v01', labelFa: 'استراتژی شکار · دُرنا V1 (آماده)', labelEn: 'Hunting · Dorna V1 (Preset)' },
  { key: 'kbos_v11', labelFa: 'استراتژی شکار · KBOS Super v11', labelEn: 'Hunting · KBOS Super v11 (Preset)' },
  { key: 'sp2l', labelFa: 'استراتژی شکار · شکار نقدینگی SP2L', labelEn: 'Hunting · SP2L (Preset)' },
  { key: 'ema_trend_pullback', labelFa: 'استراتژی شکار · مومنتوم روند EMA', labelEn: 'Hunting · EMA Momentum' },
  { key: 'signal_mixer', labelFa: 'استراتژی شکار · میکسر ۸ کاناله', labelEn: 'Hunting · 8-Ch Mixer' },
  { key: 'copy_trade', labelFa: 'کپی‌ترید تاییدشده دلارینو', labelEn: 'Verified Copy Trade' },
] as const;

interface AiScanResultItem {
  symbol: string;
  timeframe: string;
  ok: boolean;
  action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
  confidence: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  leverage: number;
  rrRatio: number;
  thesis: string;
  executed?: boolean;
  executeNote?: string;
}

export function OverviewPage({
  lang,
  uiMode = 'simple',
  onToggleUiMode,
  user,
  data,
  markets,
  onNavigate,
  onSelectTerminalSymbol,
  onRefresh,
}: {
  lang: Lang;
  uiMode?: 'simple' | 'pro';
  onToggleUiMode?: (m: 'simple' | 'pro') => void;
  user: AuthUserInfo;
  data: DashboardPayload;
  markets: ExchangeMarket[];
  onNavigate: (tab: NavTab) => void;
  onSelectTerminalSymbol: (sym: string) => void;
  onRefresh: () => Promise<void>;
  onUpgradeUser?: (u: AuthUserInfo) => void;
}) {
  const isFa = lang === 'fa';
  const isRunning = data.config.bot_state.startsWith('RUNNING');
  void user;

  const [hideBal, setHideBal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  // Inline Edit TP/SL state
  const [editPos, setEditPos] = useState<OpenTradeRow | null>(null);
  const [editForm, setEditForm] = useState({ stopLoss: '', tp1: '', tp2: '', tp3: '' });

  const [simpleTradesTab, setSimpleTradesTab] = useState<'open' | 'closed'>('open');
  const [aiScanBusy, setAiScanBusy] = useState(false);
  const [aiScanResults, setAiScanResults] = useState<AiScanResultItem[]>([]);

  const runAiInstantScan = async (autoExecute = false) => {
    setAiScanBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; results: AiScanResultItem[] }>('/api/trading/ai-scan-now', {
        method: 'POST',
        body: JSON.stringify({
          timeframe: data.config.entry_timeframe || '15m',
          autoExecute,
        }),
      });
      setAiScanResults(res.results || []);
      const executedCount = (res.results || []).filter((r) => r.executed).length;
      const actionable = (res.results || []).filter((r) => r.action === 'LONG' || r.action === 'SHORT').length;
      setNotice(
        autoExecute && executedCount > 0
          ? isFa
            ? `${executedCount} معامله هوشمند با AI هم‌اکنون باز شد.`
            : `${executedCount} AI trade(s) executed live.`
          : isFa
            ? `اسکن هوش مصنوعی روی ۵ نماد اصلی انجام شد (${actionable} سیگنال فعال کشف شد).`
            : `AI scan finished across 5 top pairs (${actionable} actionable setups).`
      );
      if (autoExecute && executedCount > 0) await onRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'AI Scan Error');
    } finally {
      setAiScanBusy(false);
    }
  };

  const freeBal = Number(data.balance.free || 0);
  const usedBal = Number(data.balance.used || 0);
  const totalEq = Number(data.balance.total || freeBal + usedBal);
  const unrealized = data.openTrades.reduce((s, t) => s + Number(t.unrealized_pnl || 0), 0);
  const todayPnl = Number(data.stats.todayPnl ?? data.stats.totalPnl ?? 0) + unrealized;
  const activeStrategy = data.config.strategy_key || 'dollarino_v01';
  const scanScope = data.config.scan_scope || 'ALL_MARKET';

  const currentPresetId = useMemo(() => {
    try {
      const rp = data.config.risk_profile_json ? (JSON.parse(data.config.risk_profile_json) as { preset?: string }) : {};
      if (rp.preset === 'conservative' || rp.preset === 'balanced' || rp.preset === 'aggressive') return rp.preset;
    } catch {
      /* ignore */
    }
    if (data.config.margin_pct <= 3) return 'conservative';
    if (data.config.margin_pct >= 8) return 'aggressive';
    return 'balanced';
  }, [data.config.risk_profile_json, data.config.margin_pct]);

  const equitySeries = useMemo(() => {
    const raw = data.charts.equityCurve || [];
    if (raw.length >= 4) return raw.slice(-24).map((p) => Number(p.equity || 0));
    const base = Math.max(1000, totalEq);
    return [base * 0.94, base * 0.955, base * 0.95, base * 0.97, base * 0.985, base * 0.992, base];
  }, [data.charts.equityCurve, totalEq]);

  const btc = markets.find((m) => m.symbol === 'BTCUSDT');
  const longSigCount = data.recentSignals.filter((s) => String(s.direction).toUpperCase().includes('LONG')).length;
  const consensusPct = data.recentSignals.length ? Math.round((longSigCount / data.recentSignals.length) * 100) : 64;

  const toastMsg = (msg: string, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setNotice(null);
    } else {
      setNotice(msg);
      setErrorMsg(null);
    }
    setTimeout(() => {
      setNotice(null);
      setErrorMsg(null);
    }, 5000);
  };

  const patchConfig = async (payload: Record<string, unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      const res = await apiFetch<{ config?: unknown; error?: string }>('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res.error) toastMsg(res.error, true);
      else if (okMsg) toastMsg(okMsg);
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Update failed', true);
    } finally {
      setBusy(false);
    }
  };

  const handleStartStop = async () => {
    if (isRunning) {
      setStopConfirmOpen(true);
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/trading/bot/start', {
        method: 'POST',
        body: JSON.stringify({ scanScope }),
      });
      toastMsg(isFa ? 'ربات با موفقیت روشن شد و اسکن زنده آغاز گردید' : 'Bot started — scanning markets');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Start failed', true);
    } finally {
      setBusy(false);
    }
  };

  const handleKillSwitch = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/bot/kill-switch', { method: 'POST' });
      toastMsg(isFa ? 'توقف اضطراری (Kill Switch) اجرا و ربات متوقف شد' : 'Kill Switch activated');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Kill switch failed', true);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmStop = async (settleOpen: boolean) => {
    setStopConfirmOpen(false);
    setBusy(true);
    try {
      const res = await apiFetch<{ tradesClosed?: number; settlement?: { tradesClosed?: number; netSessionPnl?: number } }>(
        '/api/trading/bot/stop',
        { method: 'POST', body: JSON.stringify({ settleOpen }) }
      );
      const closedCnt = res.settlement?.tradesClosed ?? res.tradesClosed ?? 0;
      toastMsg(
        settleOpen
          ? isFa
            ? `ربات متوقف شد · ${closedCnt} معامله تسویه گردید`
            : `Stopped · ${closedCnt} trades settled`
          : isFa
            ? 'ربات متوقف شد'
            : 'Bot paused'
      );
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Stop failed', true);
    } finally {
      setBusy(false);
    }
  };

  const closePosition = async (tradeId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/trading/positions/${tradeId}/close`, { method: 'POST' });
      toastMsg(isFa ? 'معامله بسته و سود/زیان تسویه شد' : 'Position closed');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Close failed', true);
    } finally {
      setBusy(false);
    }
  };

  const cancelPendingOrder = async (orderId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/trading/pending/${orderId}`, { method: 'DELETE' });
      toastMsg(isFa ? 'سفارش لیمیت لغو شد' : 'Pending order canceled');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Cancel failed', true);
    } finally {
      setBusy(false);
    }
  };

  const reconcilePositions = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/positions/reconcile', { method: 'POST' });
      toastMsg(isFa ? 'همگام‌سازی پوزیشن‌ها با صرافی انجام شد' : 'Positions reconciled');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Reconcile failed', true);
    } finally {
      setBusy(false);
    }
  };

  const saveEditTpSl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPos) return;
    setBusy(true);
    try {
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
      toastMsg(isFa ? 'حد ضرر و تارگت‌های پوزیشن بروزرسانی شد' : 'Position TP/SL updated');
      await onRefresh();
    } catch (err) {
      toastMsg(err instanceof Error ? err.message : 'TP/SL update failed', true);
    } finally {
      setBusy(false);
    }
  };

  const renderSharedModals = () => (
    <>
      {wizardOpen && (
        <SetupWizardModal
          lang={lang}
          availableBalance={freeBal}
          onClose={() => setWizardOpen(false)}
          onCompleted={onRefresh}
        />
      )}

      {editPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setEditPos(null)}>
            <form onSubmit={saveEditTpSl} className="pop-in panel rounded-[26px] w-full max-w-sm p-6 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main">
                  {isFa ? `ویرایش TP/SL · ${editPos.symbol}` : `Edit TP/SL · ${editPos.symbol}`}
                </h3>
                <button type="button" onClick={() => setEditPos(null)}><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="text-dim block mb-1">Stop Loss</label>
                <input value={editForm.stopLoss} onChange={(e) => setEditForm((f) => ({ ...f, stopLoss: e.target.value }))} className="field font-num" required />
              </div>
              <div>
                <label className="text-dim block mb-1">TP 1</label>
                <input value={editForm.tp1} onChange={(e) => setEditForm((f) => ({ ...f, tp1: e.target.value }))} className="field font-num" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-dim block mb-1">TP 2</label>
                  <input value={editForm.tp2} onChange={(e) => setEditForm((f) => ({ ...f, tp2: e.target.value }))} className="field font-num" />
                </div>
                <div>
                  <label className="text-dim block mb-1">TP 3</label>
                  <input value={editForm.tp3} onChange={(e) => setEditForm((f) => ({ ...f, tp3: e.target.value }))} className="field font-num" />
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn-gold w-full py-3 rounded-xl font-black">
                {isFa ? 'ذخیره تغییرات TP/SL' : 'Save TP/SL'}
              </button>
            </form>
          </div>,
          document.body
        )}

      {stopConfirmOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setStopConfirmOpen(false)}>
            <div className="pop-in panel rounded-[26px] w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
                <Flame className="w-5 h-5 text-flame" />
                <span>{isFa ? 'توقف ربات' : 'Stop Bot'}</span>
              </h3>
              <p className="text-xs text-dim leading-relaxed">
                {isFa
                  ? 'آیا معاملات باز فعلی با حد ضرر خودشان ادامه پیدا کنند یا همین الان همگی بسته و تسویه شوند؟'
                  : 'Pause scanning only or close all open positions now?'}
              </p>
              <div className="space-y-2">
                <button type="button" onClick={() => void handleConfirmStop(false)} className="btn-gold w-full py-3 rounded-xl text-xs">
                  {isFa ? 'توقف اسکن جدید (بازها بمانند)' : 'Pause Bot Only'}
                </button>
                {data.openTrades.length > 0 && (
                  <button type="button" onClick={() => void handleConfirmStop(true)} className="w-full py-3 rounded-xl bg-rose-500 text-white text-xs font-black">
                    {isFa ? 'توقف و بستن همه معاملات باز' : 'Stop & Close Open Positions'}
                  </button>
                )}
                <button type="button" onClick={() => setStopConfirmOpen(false)} className="btn-ghost w-full py-2.5 rounded-xl text-xs font-bold">
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );

  if (uiMode === 'simple') {
    const useMyAi = activeStrategy === 'my_custom_ai';

    return (
      <div className="space-y-5 max-w-3xl mx-auto">
        {notice && (
          <div className="p-3.5 rounded-2xl badge-signal text-xs font-extrabold flex items-center justify-between">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{notice}</span>
            <button type="button" onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
          </div>
        )}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-xs font-extrabold text-loss flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* 1. Clean Balance & Live Status Hero */}
        <section className="pt-2 pb-1 text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2 text-xs text-dim font-bold">
            <span>{isFa ? 'مجموع دارایی ترید هوشمند' : 'AI Trading Equity'}</span>
            <button
              type="button"
              onClick={() => setHideBal((v) => !v)}
              className="p-1 rounded-full hover:bg-[var(--soft)] text-dim transition"
              aria-label="Toggle balance"
            >
              {hideBal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                isRunning ? 'bg-[#10B981]/12 text-[#0D9455]' : 'bg-[var(--soft)] text-sub'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-[#0D9455] live-dot' : 'bg-[#F59E0B]'}`} />
              <span>{isRunning ? (isFa ? 'هوش مصنوعی فعال' : 'AI Active') : isFa ? 'متوقف' : 'Paused'}</span>
            </span>
          </div>

          <div className="flex items-baseline justify-center gap-1.5">
            <span dir="ltr" className="font-display font-bold text-4xl sm:text-5xl tabular text-main tracking-tight font-num">
              {hideBal ? '••••••' : `$${totalEq.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            </span>
            <span className="text-xs font-bold text-dim">USD</span>
          </div>

          {!hideBal && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              {isFa && (
                <span className="text-dim font-semibold">
                  معادل {formatTomanEq(totalEq)} تومان
                </span>
              )}
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tabular inline-flex items-center gap-1 ${
                  todayPnl >= 0 ? 'bg-[#10B981]/12 text-[#0D9455]' : 'bg-rose-500/12 text-loss'
                }`}
              >
                <span dir="ltr" className="inline-block font-num">
                  {todayPnl >= 0 ? `+$${todayPnl.toFixed(2)}` : `-$${Math.abs(todayPnl).toFixed(2)}`}
                </span>
                <span>{isFa ? 'امروز' : 'today'}</span>
              </span>
            </div>
          )}
        </section>

        {/* 2. Strictly Automated AI Trading Main Controller */}
        <section className="panel glow-card-anim rounded-[28px] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl btn-cobalt grid place-items-center shrink-0">
                <BrainCircuit className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-main">
                  {isFa ? 'ترید هوشمند اتومات با هوش مصنوعی' : '100% Automated AI Trading'}
                </h2>
                <p className="text-xs text-dim">
                  {isFa
                    ? 'در حالت ساده نیازی به هیچ تنظیم پیچیده‌ای نیست — فقط ریسک‌پذیری را انتخاب کنید تا AI خودکار بازار را معامله کند.'
                    : 'No complex charts or manual work — pick your comfort level and let Dollarino AI trade automatically 24/7.'}
                </p>
              </div>
            </div>
          </div>

          {/* 1-Tap Main AI Power Button */}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              tgHaptic('medium');
              if (isRunning) {
                setStopConfirmOpen(true);
                return;
              }
              setBusy(true);
              try {
                const targetStrategy = useMyAi ? 'my_custom_ai' : 'ai_autonomous_agent';
                await apiFetch('/api/trading/config', {
                  method: 'PATCH',
                  body: JSON.stringify({
                    strategy_key: targetStrategy,
                    ai_gate_enabled: 1,
                    auto_scan_top: 1,
                    scan_scope: 'ALL_MARKET',
                  }),
                });
                await apiFetch('/api/trading/bot/start', {
                  method: 'POST',
                  body: JSON.stringify({ strategyKey: targetStrategy, scanScope: 'ALL_MARKET' }),
                });
                tgNotifyHaptic('success');
                toastMsg(isFa ? 'ترید هوشمند اتومات AI روشن شد!' : 'Automated AI Trading started!');
                await onRefresh();
              } catch (e) {
                toastMsg(e instanceof Error ? e.message : 'Subscription required', true);
              } finally {
                setBusy(false);
              }
            }}
            className={`w-full py-4 rounded-2xl text-sm font-black inline-flex items-center justify-center gap-2.5 shadow-xl transition ${
              isRunning ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'btn-emerald'
            }`}
          >
            <Power className="w-5 h-5" />
            <span>
              {busy
                ? '...'
                : isRunning
                  ? isFa
                    ? 'توقف ترید هوشمند اتومات (در حال معامله 24/7)'
                    : 'Stop Automated AI Trading (Running 24/7)'
                  : isFa
                    ? 'شروع ترید هوشمند اتومات با هوش مصنوعی'
                    : 'Start Automated AI Trading Now'}
            </span>
          </button>

          {/* Select 4 Core Dollarino Engines */}
          <div className="space-y-2">
            <p className="text-[11px] font-black text-dim">
              {isFa ? '۱. انتخاب از ۴ موتور اصلی دلارینو:' : '1. Choose Dollarino Engine:'}
            </p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void patchConfig(
                    { strategy_key: 'ai_autonomous_agent', ai_gate_enabled: 1 },
                    isFa ? 'هوش مصنوعی دلارینو انتخاب شد' : 'Dollarino AI selected'
                  )
                }
                className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
                  activeStrategy === 'ai_autonomous_agent' ? 'border-[#1652F0] bg-[#1652F0]/10' : 'surface-soft border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-main inline-flex items-center gap-1.5">
                    <BrainCircuit className="w-4 h-4 text-[#1652F0]" />
                    <span>{isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI'}</span>
                  </span>
                  {activeStrategy === 'ai_autonomous_agent' && <CheckCircle2 className="w-4 h-4 text-jade" />}
                </div>
                <p className="text-[11px] text-dim">
                  {isFa ? 'تحلیل چندمدله خودکار و شکار بهترین فرصت‌های کل بازار.' : 'Multi-LLM market consensus across all coins.'}
                </p>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void patchConfig(
                    { strategy_key: 'my_custom_ai', ai_gate_enabled: 1 },
                    isFa ? 'هوش مصنوعی شخصی فعال شد' : 'Raw Personal AI selected'
                  )
                }
                className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
                  useMyAi ? 'border-[#1652F0] bg-[#1652F0]/10' : 'surface-soft border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-main inline-flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span>{isFa ? 'هوش مصنوعی شخصی من' : 'Raw Personal AI'}</span>
                  </span>
                  {useMyAi && <CheckCircle2 className="w-4 h-4 text-jade" />}
                </div>
                <p className="text-[11px] text-dim">
                  {isFa ? 'معامله دقیقاً طبق قوانینی که در چت «هوش مصنوعی من» یاد داده‌اید.' : 'Trades strictly using your taught rules.'}
                </p>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void patchConfig(
                    { strategy_key: 'dollarino_v01', ai_gate_enabled: 0 },
                    isFa ? 'استراتژی شکار (دُرنا V1) فعال شد' : 'Hunting Strategy (Dorna V1) selected'
                  )
                }
                className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
                  activeStrategy !== 'ai_autonomous_agent' && !useMyAi && activeStrategy !== 'copy_trade'
                    ? 'border-[#10d9a3] bg-[#10d9a3]/10'
                    : 'surface-soft border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-main inline-flex items-center gap-1.5">
                    <Crosshair className="w-4 h-4 text-jade" />
                    <span>{isFa ? 'استراتژی شکار (آماده / شخصی)' : 'Hunting Strategy (Preset / Custom)'}</span>
                  </span>
                  {activeStrategy !== 'ai_autonomous_agent' && !useMyAi && activeStrategy !== 'copy_trade' && (
                    <CheckCircle2 className="w-4 h-4 text-jade" />
                  )}
                </div>
                <p className="text-[11px] text-dim">
                  {isFa ? 'شامل استراتژی‌های آماده ما (دُرنا، KBOS، SP2L) و استراتژی شخصی شما.' : 'Our preset hunters (Dorna, KBOS, SP2L) or your own custom code.'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('copy')}
                className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
                  activeStrategy === 'copy_trade' ? 'border-[#f59e0b] bg-[#f59e0b]/10' : 'surface-soft border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-main inline-flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>{isFa ? 'کپی‌ترید تاییدشده دلارینو' : 'Verified Copy Trade'}</span>
                  </span>
                  {activeStrategy === 'copy_trade' && <CheckCircle2 className="w-4 h-4 text-jade" />}
                </div>
                <p className="text-[11px] text-dim">
                  {isFa ? 'کپی خودکار معاملات تریدرهای احرازشده و تاییدشده توسط دلارینو.' : 'Mirror admin-verified copy traders automatically.'}
                </p>
              </button>
            </div>
          </div>

          {/* Live AI Connection Banner & Instant Signal Scan */}
          <div className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-600/10 via-transparent to-emerald-500/10 p-3.5 flex flex-col sm:flex-row items-center gap-3">
            <img
              src="/images/ai-consensus-brain.png"
              alt="Dollarino AI Core"
              className="w-full sm:w-28 h-20 rounded-xl object-cover shrink-0 border hairline"
            />
            <div className="flex-1 min-w-0 space-y-1 text-start">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-black text-jade">
                  <span className="h-2 w-2 rounded-full bg-jade live-dot" />
                  {isFa ? 'موتور هوش مصنوعی متصل و آماده ترید' : 'AI Engine Connected & Ready'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold">
                  {isFa ? data.platformAI?.effectiveModeLabelFa || 'Quant-AI + DeepSeek' : data.platformAI?.effectiveModeLabelEn || 'AI Active'}
                </span>
              </div>
              <p className="text-[11px] text-dim leading-relaxed">
                {isFa
                  ? 'تحلیل زنده بازار، تشخیص ستاپ ورود با حد ضرر اجباری و ارسال سیگنال به پایانه و ربات خودکار.'
                  : 'Real-time multi-pair scanning with mandatory SL and instant execution.'}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={aiScanBusy}
                  onClick={() => void runAiInstantScan(false)}
                  className="btn-cobalt px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5"
                >
                  <Radar className="w-3.5 h-3.5" />
                  <span>{aiScanBusy ? '...' : isFa ? 'اسکن لحظه‌ای با AI' : 'Scan Market with AI'}</span>
                </button>
                <button
                  type="button"
                  disabled={aiScanBusy}
                  onClick={() => void runAiInstantScan(true)}
                  className="btn-emerald px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isFa ? 'شکار و ترید فوری AI' : 'Scan & Auto-Trade'}</span>
                </button>
              </div>
            </div>
          </div>

          {aiScanResults.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {aiScanResults.map((r) => (
                <div key={r.symbol} className="surface-soft rounded-xl p-2.5 text-[11px] space-y-1 border hairline">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-black text-main">
                      <CoinIcon symbol={r.symbol} size={16} />
                      <span>{r.symbol}</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      r.action === 'LONG' ? 'bg-jade/15 text-jade' : r.action === 'SHORT' ? 'bg-rose-500/15 text-loss' : 'bg-white/10 text-dim'
                    }`}>
                      {r.action} · {r.confidence}%
                    </span>
                  </div>
                  <p className="text-[10px] text-dim line-clamp-2">{r.thesis}</p>
                  {(r.action === 'LONG' || r.action === 'SHORT') && (
                    <div className="flex items-center justify-between pt-0.5 text-[10px] font-num" dir="ltr">
                      <span className="text-main">EN ${r.entry} · SL ${r.stopLoss}</span>
                      <button
                        type="button"
                        onClick={() => onSelectTerminalSymbol(r.symbol)}
                        className="text-[var(--gold)] font-black hover:underline"
                      >
                        {isFa ? 'ترید در پایانه' : 'Terminal'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 3 Simple Risk Comfort Buttons */}
          <div className="space-y-2">
            <p className="text-[11px] font-black text-dim">
              {isFa ? '۲. میزان ریسک‌پذیری:' : '2. Comfort & Risk Level:'}
            </p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {RISK_PRESETS.map((p) => {
                const active = currentPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void patchConfig(
                        {
                          margin_pct: p.marginPct,
                          max_leverage: p.maxLev,
                          daily_max_loss_pct: p.dailyLoss,
                          max_open_positions: p.maxOpen,
                          risk_profile_json: { preset: p.id },
                        },
                        isFa ? `حالت ریسک ${p.titleFa} ذخیره شد` : `${p.titleEn} saved`
                      )
                    }
                    className={`p-3 rounded-2xl border text-start transition space-y-1 ${
                      active ? 'border-[#10d9a3] bg-jade/10' : 'surface-soft border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-main">{isFa ? p.titleFa : p.titleEn}</span>
                      {active && <CheckCircle2 className="w-3.5 h-3.5 text-jade" />}
                    </div>
                    <p className="text-[10px] text-dim">{isFa ? p.descFa : p.descEn}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => setWizardOpen(true)} className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
              <WandSparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isFa ? 'تنظیم دقیق سرمایه و صرافی' : 'Fine-tune Capital'}</span>
            </button>
            <button type="button" onClick={() => onNavigate('myai')} className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5 text-brand" />
              <span>{isFa ? 'آموزش هوش مصنوعی من' : 'Teach My AI'}</span>
            </button>
            <button type="button" onClick={() => onNavigate('copy')} className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-jade" />
              <span>{isFa ? 'اتصال صرافی Toobit / Bitunix / KCEX' : 'Connect Exchange'}</span>
            </button>
            <button type="button" onClick={() => onNavigate('dex')} className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border border-amber-500/30">
              <Wallet className="w-3.5 h-3.5 text-amber-400" />
              <span>{isFa ? 'Trust Wallet و رادار DEX' : 'Trust Wallet & DEX'}</span>
            </button>
          </div>
        </section>

        <QuickWidgetsBar
          lang={lang}
          uiMode={uiMode}
          user={user}
          dashboard={data}
          onToggleBot={handleStartStop}
          onKillSwitch={handleKillSwitch}
          onToggleUiMode={onToggleUiMode}
          onNavigate={onNavigate}
          onUserUpdated={onRefresh}
        />

        {/* 3. Open & Settled AI Trades Summary */}
        <section className="panel rounded-[26px] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="ios-segmented p-1">
              <button
                type="button"
                onClick={() => setSimpleTradesTab('open')}
                className={`px-3 py-1 rounded-full text-[11px] font-black ${simpleTradesTab === 'open' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? `معاملات باز (${data.openTrades.length})` : `Open (${data.openTrades.length})`}
              </button>
              <button
                type="button"
                onClick={() => setSimpleTradesTab('closed')}
                className={`px-3 py-1 rounded-full text-[11px] font-black ${simpleTradesTab === 'closed' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? `معاملات بسته‌شده (${data.closedTrades.length})` : `Closed (${data.closedTrades.length})`}
              </button>
            </div>
            <button type="button" onClick={() => onNavigate('portfolio')} className="text-xs font-black text-[#1652F0]">
              {isFa ? 'مشاهده کامل کیف پول' : 'Full Portfolio'}
            </button>
          </div>

          {simpleTradesTab === 'closed' ? (
            data.closedTrades.length === 0 ? (
              <p className="text-center py-5 text-xs text-dim">{isFa ? 'هنوز معامله بسته‌شده‌ای ثبت نشده است.' : 'No settled trades yet.'}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {data.closedTrades.slice(0, 6).map((t) => {
                  const pnl = Number(t.realized_pnl || 0);
                  const win = pnl >= 0;
                  return (
                    <div key={t.id} className="surface-soft rounded-2xl p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <CoinIcon symbol={t.symbol} size={30} />
                        <div>
                          <p className="font-bold text-xs text-main">{t.symbol.replace('USDT', '')} · {t.direction}</p>
                          <p className="text-[10px] text-dim">{new Date(t.closed_at).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</p>
                        </div>
                      </div>
                      <span dir="ltr" className={`font-num font-black text-xs ${win ? 'text-jade' : 'text-loss'}`}>
                        {win ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          ) : data.openTrades.length === 0 ? (
            <p className="text-center py-5 text-xs text-dim">
              {isRunning
                ? isFa
                  ? 'هوش مصنوعی در حال اسکن لحظه‌ای بازار برای شکار بهترین موقعیت است...'
                  : 'AI is scanning markets for the highest-probability entry...'
                : isFa
                  ? 'برای شروع خودکار معاملات، دکمه «شروع ترید هوشمند اتومات» را بزنید.'
                  : 'Press Start Automated AI Trading above to begin.'}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2.5">
              {data.openTrades.map((pos) => {
                const pnl = Number(pos.unrealized_pnl || 0);
                const isProfit = pnl >= 0;
                return (
                  <div key={pos.id} className="surface-soft rounded-2xl p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <CoinIcon symbol={pos.symbol} size={32} />
                      <div>
                        <p className="font-bold text-xs text-main">{pos.symbol.replace('USDT', '')} · {pos.direction}</p>
                        <p className={`text-[11px] font-black ${isProfit ? 'text-jade' : 'text-loss'}`}>
                          {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePosition(pos.id)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black ${isProfit ? 'btn-emerald' : 'bg-rose-500 text-white'}`}
                    >
                      {isProfit ? (isFa ? 'برداشت سود' : 'Take Profit') : isFa ? 'بستن' : 'Close'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 4. Compact Pro Mode Switcher */}
        <section className="grid sm:grid-cols-2 gap-3">
          <div className="panel rounded-[24px] p-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-dim">{isFa ? 'نرخ برد AI · کل معاملات' : 'Win Rate · Total Trades'}</p>
              <p dir="ltr" className="font-num font-black text-base text-jade">
                {data.stats.winRate.toFixed(1)}% <span className="text-dim font-bold text-xs">({data.stats.totalTrades})</span>
              </p>
            </div>
            <button type="button" onClick={() => onNavigate('pricing')} className="btn-gold px-3.5 py-2 rounded-xl text-[11px] font-black">
              {isFa ? 'مدیریت اشتراک' : 'Subscription'}
            </button>
          </div>

          {onToggleUiMode && (
            <button
              type="button"
              onClick={() => {
                tgHaptic('medium');
                onToggleUiMode('pro');
              }}
              className="panel panel-hover rounded-[24px] p-4 flex items-center justify-between gap-3 text-start"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl btn-cobalt grid place-items-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-display font-bold text-sm text-main">{isFa ? 'ورود به حالت حرفه‌ای (Pro)' : 'Open Pro Workspace'}</p>
                  <p className="text-[11px] text-dim">{isFa ? 'چارت زنده · هوش مصنوعی من · کپی‌ترید · IDE' : 'Charts · My AI · Copy Trade · Custom IDE'}</p>
                </div>
              </div>
              {isFa ? <ChevronLeft className="w-4 h-4 text-dim" /> : <ChevronRight className="w-4 h-4 text-dim" />}
            </button>
          )}
        </section>

        {renderSharedModals()}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {notice && (
        <div className="p-3.5 rounded-2xl badge-signal text-xs font-extrabold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-xs font-extrabold text-loss flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <QuickWidgetsBar
        lang={lang}
        uiMode={uiMode}
        user={user}
        dashboard={data}
        onToggleBot={handleStartStop}
        onKillSwitch={handleKillSwitch}
        onToggleUiMode={onToggleUiMode}
        onNavigate={onNavigate}
        onUserUpdated={onRefresh}
      />

      {/* 1. Signature Overview Hero + Live Equity Card */}
      <section className="grid lg:grid-cols-[1.05fr_1fr] gap-8 items-center">
        <div>
          <div className="inline-flex items-center gap-2 panel rounded-full px-4 py-1.5 text-[10px] font-black tracking-[0.12em] mb-4" style={{ color: 'var(--gold-soft)' }}>
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'live-dot bg-jade' : 'live-gold bg-gold'}`} />
            <span>
              {isRunning
                ? isFa
                  ? `ربات فعال · اسکن ${scanScope === 'ALL_MARKET' ? `کل بازار (${markets.length || '500+'})` : data.config.symbol}`
                  : `BOT LIVE · SCANNING ${scanScope === 'ALL_MARKET' ? `ALL ${markets.length || '500+'} PAIRS` : scanScope}`
                : isFa
                  ? 'میز آماده معامله خودکار · شبیه‌ساز و واقعی'
                  : 'AUTONOMOUS EXCHANGE DESK · READY'}
            </span>
          </div>

          <h1 className="font-display font-semibold tracking-tight leading-[1.1] text-3xl sm:text-5xl text-main">
            {isFa ? (
              <>
                همه بازارها را
                <br />
                <span className="text-gold-grad">خودکار معامله کن.</span>
              </>
            ) : (
              <>
                Trade every market.
                <br />
                <em className="text-gold-grad italic">Automatically.</em>
              </>
            )}
          </h1>

          <p className="mt-4 text-dim text-sm leading-relaxed max-w-lg">
            {isFa
              ? '۳ موتور هوشمند دُرّبین، دُرنا V1/KBOS و کپی‌ترید به‌صورت همزمان تا ۲۰ پوزیشن را با حد ضرر و ۳ تارگت خودکار مدیریت می‌کنند.'
              : 'Deploy autonomous strategies, analyze charts with AI, and manage up to 20 simultaneous futures positions with automated risk protection.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleStartStop()}
              className={`inline-flex items-center gap-2 font-black px-6 py-3.5 rounded-2xl text-xs sm:text-sm transition ${
                isRunning ? 'bg-[#FF8A00] hover:bg-[#ea7d00] text-white' : 'btn-gold'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{isRunning ? (isFa ? 'توقف ربات' : 'Stop Bot') : isFa ? 'شروع خودکار ربات' : 'Start Auto-Trading'}</span>
            </button>

            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="btn-emerald inline-flex items-center gap-2 font-black px-5 py-3.5 rounded-2xl text-xs sm:text-sm"
            >
              <WandSparkles className="w-4 h-4" />
              <span>{isFa ? 'راه‌اندازی ۴ مرحله‌ای (Wizard)' : 'Setup Wizard'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('terminal')}
              className="btn-ghost inline-flex items-center gap-2 font-bold px-5 py-3.5 rounded-2xl text-xs sm:text-sm"
            >
              <span>{isFa ? 'پایانه و چارت AI' : 'Pro Terminal'}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="mt-7 grid grid-cols-4 gap-2 max-w-lg">
            {[
              { v: `${markets.length || '800+'}`, l: isFa ? 'جفت‌ارز زنده' : 'Pairs' },
              { v: String(data.openTrades.length), l: isFa ? 'معامله باز' : 'Open Now' },
              { v: `${data.stats.winRate.toFixed(0)}%`, l: isFa ? 'وین‌ریت' : 'Win Rate' },
              { v: `${data.config.max_leverage}×`, l: isFa ? 'سقف اهرم' : 'Max Lev' },
            ].map((s) => (
              <div key={s.l} className="panel rounded-2xl px-2 py-3 text-center">
                <p dir="ltr" className="font-display font-bold text-lg sm:text-xl tabular" style={{ color: 'var(--gold-soft)' }}>
                  {s.v}
                </p>
                <p className="text-[10px] text-dim font-semibold mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Live Wallet & Equity Card */}
        <div className="relative">
          <div className="panel rounded-[28px] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-dim">
                <LiveDot size={7} color={isRunning ? '#10d9a3' : '#e8c15a'} />
                <span>{data.config.trading_mode === 'PAPER' ? (isFa ? 'حساب شبیه‌ساز' : 'SIMULATION DESK') : 'LIVE EXCHANGE'}</span>
              </div>

              <div className="inline-flex p-0.5 rounded-xl bg-black/25 border hairline text-[11px] font-bold">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchConfig({ trading_mode: 'PAPER' }, isFa ? 'حساب شبیه‌ساز فعال شد' : 'Simulated mode active')}
                  className={`px-3 py-1 rounded-lg transition ${
                    data.config.trading_mode === 'PAPER' ? 'btn-gold' : 'text-dim hover:text-main'
                  }`}
                >
                  {isFa ? 'شبیه‌ساز' : 'Sim'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchConfig({ trading_mode: 'LIVE' }, isFa ? 'حساب واقعی فعال شد' : 'Live mode active')}
                  className={`px-3 py-1 rounded-lg transition ${
                    data.config.trading_mode === 'LIVE' ? 'btn-emerald' : 'text-dim hover:text-main'
                  }`}
                >
                  {isFa ? 'حساب واقعی' : 'Live'}
                </button>
              </div>
            </div>

            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="flex items-center gap-2.5 text-xs text-dim font-semibold flex-wrap">
                  <span>{isFa ? 'ارزش کل حساب (Equity)' : 'Total Equity'}</span>
                  <button type="button" onClick={() => setHideBal((v) => !v)} className="text-dim hover:text-main">
                    {hideBal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div dir="ltr" className="font-display font-bold text-3xl sm:text-4xl tabular text-main mt-1 font-num">
                  {hideBal ? '••••••' : <AnimatedNumber value={totalEq} format={(n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />}
                </div>
              </div>

              <span
                dir="ltr"
                className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1.5 rounded-full tabular ${
                  todayPnl >= 0 ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}
              </span>
            </div>

            <div className="h-40 rounded-2xl bg-black/20 border hairline p-2">
              <AreaChart values={equitySeries} height={144} />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { icon: Wallet, l: isFa ? 'موجودی آزاد' : 'Free Cash', v: hideBal ? '•••' : `$${freeBal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, cls: 'text-jade' },
                { icon: Trophy, l: isFa ? 'سود کل' : 'Total PnL', v: `${data.stats.totalPnl >= 0 ? '+' : ''}$${data.stats.totalPnl.toFixed(0)}`, cls: 'text-goldsoft' },
                { icon: ShieldCheck, l: isFa ? 'اهرم فعلی' : 'Max Lev', v: `${data.config.max_leverage}×`, cls: 'text-brand' },
              ].map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.l} className="rounded-2xl bg-[var(--soft)] border hairline p-3">
                    <Icon className={`w-4 h-4 mb-1 ${c.cls}`} />
                    <p dir="ltr" className="font-num font-bold text-sm tabular text-main">{c.v}</p>
                    <p className="text-[10px] text-dim font-semibold mt-0.5">{c.l}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {btc && (
            <button
              type="button"
              onClick={() => {
                onSelectTerminalSymbol('BTCUSDT');
                onNavigate('terminal');
              }}
              className="hidden sm:flex items-center gap-3 panel rounded-2xl px-4 py-2.5 shadow-xl animate-floaty absolute -top-4 -end-3"
            >
              <CoinIcon symbol="BTCUSDT" size={28} />
              <div className="text-start">
                <p className="text-[10px] text-dim font-bold">BTC/USDT</p>
                <p dir="ltr" className="font-num font-bold text-xs tabular text-main">
                  ${Number(btc.lastPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* 2. Kifpool-inspired Quick Services Grid */}
      <section className="panel rounded-[26px] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-black text-main flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <span>{isFa ? 'دسترسی سریع ابزارهای پلتفرم' : 'Quick Desk Shortcuts'}</span>
          </p>
          <span className="text-[11px] text-dim">{data.activeExchange?.label || 'Paper Desk'}</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center text-[11px] font-bold">
          {[
            { icon: CandlestickChart, label: isFa ? 'پایانه و AI' : 'Terminal', onClick: () => onNavigate('terminal'), color: '#2b74ff' },
            { icon: WandSparkles, label: isFa ? 'راه‌اندازی ۴م' : 'Wizard', onClick: () => setWizardOpen(true), color: '#e8c15a' },
            { icon: Radar, label: isFa ? 'رادار زنده' : 'AI Radar', onClick: () => onNavigate('radar'), color: '#10d9a3' },
            { icon: BarChart3, label: isFa ? 'بک‌تست' : 'Backtest', onClick: () => onNavigate('radar'), color: '#38e1ff' },
            { icon: Bot, label: isFa ? 'کپی‌ترید' : 'Copy Trade', onClick: () => onNavigate('copy'), color: '#ff8a00' },
            { icon: KeyRound, label: isFa ? 'صرافی واقعی' : 'Exchanges', onClick: () => onNavigate('copy'), color: '#a855f7' },
            { icon: Wallet, label: isFa ? 'پورتفوی' : 'Portfolio', onClick: () => onNavigate('portfolio'), color: '#10d9a3' },
            { icon: Layers, label: isFa ? 'کارت هفته' : 'Card PNG', onClick: () => onNavigate('card'), color: '#e8c15a' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="surface-soft rounded-2xl py-3 px-1.5 flex flex-col items-center gap-1.5 hover:border-[var(--gold)] transition"
              >
                <span className="h-9 w-9 rounded-xl grid place-items-center" style={{ background: `${item.color}1a`, color: item.color }}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-main truncate w-full">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Autonomous Trading Team + Full Strategy & Timeframe Selector */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--gold)' }}>
              {isFa ? 'موتورها و استراتژی‌های معاملاتی' : 'AUTONOMOUS TRADING TEAM'}
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-main mt-1">
              {isFa ? '۱. انتخاب موتور و استراتژی فعال' : '1. Engine & Strategy Selection'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={activeStrategy}
              disabled={busy}
              onChange={(e) =>
                void patchConfig(
                  {
                    strategy_key: e.target.value,
                    ai_gate_enabled:
                      e.target.value === 'ai_autonomous_agent' || e.target.value === 'my_custom_ai' ? 1 : 0,
                  },
                  isFa ? 'استراتژی فعال تغییر کرد' : 'Strategy updated'
                )
              }
              className="field py-2 px-3 text-xs font-bold w-auto"
            >
              {ALL_STRATEGIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {isFa ? s.labelFa : s.labelEn}
                </option>
              ))}
            </select>

            <select
              value={data.config.entry_timeframe || '15m'}
              disabled={busy}
              onChange={(e) =>
                void patchConfig({ entry_timeframe: e.target.value as Timeframe }, isFa ? `تایم‌فریم روی ${e.target.value} تنظیم شد` : 'Timeframe updated')
              }
              className="field py-2 px-3 text-xs font-bold w-auto"
            >
              {(['1m', '5m', '15m', '1h', '4h'] as Timeframe[]).map((tf) => (
                <option key={tf} value={tf}>
                  TF: {tf}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live AI Core Connection & Instant Scan Strip (Pro Mode) */}
        <div className="panel rounded-[26px] p-4 sm:p-5 border border-blue-500/20 bg-gradient-to-br from-blue-600/10 via-transparent to-emerald-500/10 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <img
              src="/images/ai-consensus-brain.png"
              alt="Dollarino AI Core"
              className="w-full md:w-44 h-24 rounded-2xl object-cover shrink-0 border hairline"
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-black text-jade">
                  <span className="h-2 w-2 rounded-full bg-jade live-dot" />
                  {isFa ? 'موتور هوش مصنوعی متصل و آماده معامله خودکار' : 'Central AI Engine Connected & Trading Ready'}
                </span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold">
                  {isFa ? data.platformAI?.effectiveModeLabelFa || 'هوش مصنوعی دلارینو' : data.platformAI?.effectiveModeLabelEn || 'Dollarino AI'}
                </span>
              </div>
              <p className="text-xs text-sub leading-relaxed">
                {isFa
                  ? 'هوش مصنوعی مرکزی دلارینو ۲۴ ساعته کندل‌های کل بازار را پایش می‌کند. می‌توانید هم‌اکنون بازار را اسکن کنید یا اجرای فوری AI را بزنید.'
                  : 'Dollarino AI continuously scans all markets. Trigger an instant market scan or execute live AI signals now.'}
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={aiScanBusy}
                  onClick={() => void runAiInstantScan(false)}
                  className="btn-cobalt px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Radar className="w-4 h-4" />
                  <span>{aiScanBusy ? '...' : isFa ? 'اسکن لحظه‌ای کل بازار با AI' : 'Instant AI Market Scan'}</span>
                </button>
                <button
                  type="button"
                  disabled={aiScanBusy}
                  onClick={() => void runAiInstantScan(true)}
                  className="btn-emerald px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Zap className="w-4 h-4" />
                  <span>{isFa ? 'شکار و اجرای معامله فوری AI' : 'Scan & Auto-Execute Trade'}</span>
                </button>
              </div>
            </div>
          </div>

          {aiScanResults.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t hairline">
              {aiScanResults.map((r) => (
                <div key={r.symbol} className="surface-soft rounded-xl p-3 text-[11px] space-y-1.5 border hairline">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-black text-main">
                      <CoinIcon symbol={r.symbol} size={18} />
                      <span>{r.symbol.replace('USDT', '')}</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      r.action === 'LONG' ? 'bg-jade/15 text-jade' : r.action === 'SHORT' ? 'bg-rose-500/15 text-loss' : 'bg-white/10 text-dim'
                    }`}>
                      {r.action} · {r.confidence}%
                    </span>
                  </div>
                  <p className="text-[10px] text-dim line-clamp-2">{r.thesis}</p>
                  {(r.action === 'LONG' || r.action === 'SHORT') && (
                    <div className="flex items-center justify-between pt-1 text-[10px] font-num" dir="ltr">
                      <span className="text-main">EN ${r.entry} · SL ${r.stopLoss}</span>
                      <button
                        type="button"
                        onClick={() => onSelectTerminalSymbol(r.symbol)}
                        className="text-[var(--gold)] font-black hover:underline"
                      >
                        {isFa ? 'پایانه' : 'Trade'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[
            {
              id: 'ai' as const,
              active: activeStrategy === 'ai_autonomous_agent',
              art: <ModeGraphicAI />,
              icon: BrainCircuit,
              code: 'DOLLARINO AI',
              title: isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI',
              desc: isFa ? 'اجماع چند مدل هوش مصنوعی روی ساختار بازار بدون نیاز به کلید API شخصی.' : 'Consensus Multi-LLM engine managed centrally by Dollarino.',
              win: 74,
              color: '#e8c15a',
              onClick: () =>
                void patchConfig(
                  { strategy_key: 'ai_autonomous_agent', ai_gate_enabled: 1 },
                  isFa ? 'هوش مصنوعی دلارینو فعال شد' : 'Dollarino AI activated'
                ),
            },
            {
              id: 'myai' as const,
              active: activeStrategy === 'my_custom_ai',
              art: <ModeGraphicAI />,
              icon: Bot,
              code: 'RAW PERSONAL AI',
              title: isFa ? 'هوش مصنوعی خام (شخصی)' : 'Raw Personal AI',
              desc: isFa ? 'به زبان فارسی به ربات یاد بده چطور معامله کند و مستقیم روی چارت اجرا شود.' : 'Teach your personal AI rules in chat and execute 24/7.',
              win: 76,
              color: '#a855f7',
              onClick: () => onNavigate('myai'),
            },
            {
              id: 'dorna' as const,
              active: activeStrategy !== 'ai_autonomous_agent' && activeStrategy !== 'my_custom_ai' && activeStrategy !== 'copy_trade',
              art: <ModeGraphicCodex />,
              icon: Crosshair,
              code: 'HUNTING · ۲ بخش',
              title: isFa ? 'استراتژی شکار' : 'Hunting Strategy',
              desc: isFa
                ? 'دارای ۲ بخش: ۱) استراتژی‌های آماده ما (دُرنا V1، KBOS، SP2L) و ۲) استراتژی شخصی خودتان در آزمایشگاه کد.'
                : '2 sub-modes: Our preset hunters (Dorna V1, KBOS, SP2L) OR your own custom Pine/Python strategy.',
              win: 68,
              color: '#10d9a3',
              onClick: () =>
                void patchConfig(
                  { strategy_key: 'dollarino_v01', ai_gate_enabled: 0 },
                  isFa ? 'استراتژی شکار (دُرنا V1) فعال شد' : 'Hunting Strategy activated'
                ),
            },
            {
              id: 'copy' as const,
              active: activeStrategy === 'copy_trade',
              art: <ModeGraphicTelegram />,
              icon: Trophy,
              code: 'COPY TRADE',
              title: isFa ? 'کپی‌ترید تاییدشده دلارینو' : 'Verified Copy-Trade',
              desc: isFa ? 'کپی خودکار معاملات تریدرهای تاییدشده و سیگنال‌های کانال رسمی @Dollarino_official.' : 'Instant sub-second mirroring of verified traders & @Dollarino_official.',
              win: 79,
              color: '#38e1ff',
              onClick: () => onNavigate('copy'),
            },
          ].map((e) => {
            const Icon = e.icon;
            return (
            <div
              key={e.id}
              onClick={e.onClick}
              className={`cursor-pointer panel panel-hover rounded-[26px] p-5 space-y-3 relative overflow-hidden ${
                e.active ? 'ring-2 ring-[var(--gold)]' : ''
              }`}
            >
              {e.art}
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base text-main inline-flex items-center gap-2">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: e.color }} />
                  <span>{e.title}</span>
                </h3>
                <span dir="ltr" className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full shrink-0" style={{ background: `${e.color}20`, color: e.color }}>
                  {e.code}
                </span>
              </div>
              <p className="text-xs text-dim leading-relaxed">{e.desc}</p>
              {e.id === 'dorna' && (
                <div className="flex flex-wrap gap-1.5 pt-1" onClick={(ev) => ev.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => void patchConfig({ strategy_key: 'dollarino_v01', ai_gate_enabled: 0 }, isFa ? 'استراتژی آماده دُرنا V1 انتخاب شد' : 'Dorna V1 selected')}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-jade text-[10px] font-black hover:bg-emerald-500/25"
                  >
                    {isFa ? 'استراتژی‌های آماده ما' : 'Our Presets'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('radar')}
                    className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand text-[10px] font-black hover:opacity-85"
                  >
                    {isFa ? 'استراتژی شخصی شما' : 'Your Custom Code'}
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between text-xs font-black pt-1" style={{ color: e.color }}>
                <span className="inline-flex items-center gap-1">
                  {e.active && <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{e.active ? (isFa ? 'انتخاب‌شده و فعال' : 'Active Engine') : isFa ? 'انتخاب این موتور' : 'Activate'}</span>
                </span>
                <span>{e.win}% WR</span>
              </div>
            </div>
            );
          })}
        </div>
      </section>

      {/* 4. Risk Shield Preset + Market Scope */}
      <section className="grid lg:grid-cols-2 gap-4">
        <div className="panel rounded-[26px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-main">
              {isFa ? '۲. میزان ریسک و اهرم' : '2. Risk Shield Preset'}
            </h3>
            <button type="button" onClick={() => onNavigate('copy')} className="text-xs font-bold hover:underline" style={{ color: 'var(--gold)' }}>
              {isFa ? 'تنظیمات دقیق ریسک ←' : 'Fine-tune Risk →'}
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            {RISK_PRESETS.map((p) => {
              const on = currentPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void patchConfig(
                      {
                        margin_pct: p.marginPct,
                        max_leverage: p.maxLev,
                        daily_max_loss_pct: p.dailyLoss,
                        max_open_positions: p.maxOpen,
                        risk_profile_json: JSON.stringify({ preset: p.id }),
                      },
                      isFa ? `ریسک «${p.titleFa}» ذخیره شد` : `${p.titleEn} saved`
                    )
                  }
                  className={`p-3.5 rounded-2xl border text-start transition ${
                    on ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)]' : 'surface-soft hover:border-[var(--gold)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                    {on && <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--gold)' }} />}
                  </div>
                  <div className="text-xs font-black text-main mt-2">{isFa ? p.titleFa : p.titleEn}</div>
                  <div className="text-[11px] text-dim mt-1 leading-relaxed">{isFa ? p.descFa : p.descEn}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel rounded-[26px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-main">
              {isFa ? '۳. ارزها، نوع بازار و جهت ربات' : '3. Market Scope & Direction'}
            </h3>
            <SymbolPicker
              lang={lang}
              markets={markets}
              value={data.config.symbol}
              provider={data.activeExchange?.provider || 'paper'}
              marketType={data.config.market_type || 'FUTURES'}
              onChange={(sym) => void patchConfig({ scan_scope: 'SINGLE', symbol: sym }, isFa ? `نماد تک‌ارز روی ${sym} تنظیم شد` : `Symbol set to ${sym}`)}
              compact
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'ALL_MARKET' as const, icon: Globe, title: isFa ? `کل بازار (${markets.length || '500+'})` : `All Markets (${markets.length || '500+'})`, sub: isFa ? 'اسکن بدون محدودیت' : 'Uncapped rotation' },
              { id: 'TOP_COINS' as const, icon: Star, title: isFa ? 'ارزهای برتر' : 'Top Coins', sub: isFa ? 'نقدینگی بالا' : 'High volume' },
              { id: 'SINGLE' as const, icon: Crosshair, title: isFa ? 'تک‌ارز' : 'Single Coin', sub: data.config.symbol },
            ].map((s) => {
              const on = scanScope === s.id;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void patchConfig({ scan_scope: s.id }, isFa ? 'محدوده اسکن ربات بروزرسانی شد' : 'Scope updated')}
                  className={`p-3 rounded-2xl border text-start transition ${
                    on ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)]' : 'surface-soft hover:border-[var(--gold)]/50'
                  }`}
                >
                  <div className="text-xs font-black text-main inline-flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </div>
                  <div className="text-[11px] text-dim mt-1 truncate">{s.sub}</div>
                </button>
              );
            })}
          </div>

          {/* Spot vs Futures + Direction Mode (BOTH / LONG_ONLY / SHORT_ONLY) + Hedge Mode */}
          <div className="pt-2 border-t hairline grid sm:grid-cols-3 gap-2.5 text-xs">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-dim uppercase">{isFa ? 'نوع بازار' : 'Market Type'}</p>
              <div className="ios-segmented w-full flex">
                {(['FUTURES', 'SPOT'] as const).map((mt) => (
                  <button
                    key={mt}
                    type="button"
                    disabled={busy}
                    onClick={() => void patchConfig({ market_type: mt }, isFa ? `نوع بازار روی ${mt === 'SPOT' ? 'اسپات' : 'فیوچرز'} تنظیم شد` : `Market set to ${mt}`)}
                    className={`flex-1 py-1.5 rounded-full text-[11px] font-black transition ${(data.config.market_type || 'FUTURES') === mt ? 'ios-pill-active' : 'text-dim'}`}
                  >
                    {mt === 'FUTURES' ? (isFa ? 'فیوچرز' : 'Futures') : isFa ? 'اسپات' : 'Spot'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-dim uppercase">{isFa ? 'جهت معاملات ربات' : 'Bot Direction Mode'}</p>
                {(data.config.market_type || 'FUTURES') === 'FUTURES' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void patchConfig(
                        { hedge_mode: data.config.hedge_mode ? 0 : 1 },
                        data.config.hedge_mode
                          ? isFa ? 'حالت تک‌جهت (One-Way) فعال شد' : 'One-Way mode active'
                          : isFa ? 'حالت هج دوطرفه همزمان (Hedge Mode) فعال شد' : 'Hedge Mode active'
                      )
                    }
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition inline-flex items-center gap-1 ${
                      data.config.hedge_mode ? 'badge-signal' : 'btn-ghost text-dim'
                    }`}
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    <span>{isFa ? (data.config.hedge_mode ? 'Hedge فعال' : 'One-Way') : data.config.hedge_mode ? 'Hedge ON' : 'One-Way'}</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 'BOTH' as const, label: isFa ? 'دوطرفه (L+S)' : 'Both (L+S)' },
                  { id: 'LONG_ONLY' as const, label: isFa ? 'فقط لانگ' : 'Long Only' },
                  { id: 'SHORT_ONLY' as const, label: isFa ? 'فقط شورت' : 'Short Only' },
                ]).map((dm) => {
                  const disabledSpotShort = (data.config.market_type || 'FUTURES') === 'SPOT' && dm.id === 'SHORT_ONLY';
                  const activeDir = (data.config.direction_mode || 'BOTH') === dm.id;
                  return (
                    <button
                      key={dm.id}
                      type="button"
                      disabled={busy || disabledSpotShort}
                      onClick={() => void patchConfig({ direction_mode: dm.id }, isFa ? 'جهت معاملات ربات ذخیره شد' : 'Direction mode updated')}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition ${
                        activeDir ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                      } disabled:opacity-40`}
                    >
                      {dm.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Open Positions (with Inline Edit TP/SL & Reconcile) + Pending Limit Orders + Consensus */}
      <section className="grid lg:grid-cols-[1fr_300px] gap-4">
        <div className="panel rounded-[26px] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
              <Zap className="w-4 h-4 text-jade" />
              <span>{isFa ? `معاملات باز (${data.openTrades.length})` : `Open Positions (${data.openTrades.length})`}</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void reconcilePositions()}
                className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isFa ? 'همگام‌سازی' : 'Reconcile'}</span>
              </button>
              <button type="button" onClick={() => onNavigate('portfolio')} className="text-xs font-bold hover:underline" style={{ color: 'var(--gold)' }}>
                {isFa ? 'گزارش کامل ←' : 'Full Portfolio →'}
              </button>
            </div>
          </div>

          {data.openTrades.length === 0 ? (
            <div className="rounded-2xl border border-dashed hairline py-10 text-center text-xs text-dim space-y-2">
              <p className="font-bold text-main">
                {isRunning
                  ? isFa
                    ? `ربات در حال اسکن زنده کل بازار (${markets.length || '500+'} ارز) برای شکار بهترین نقطه ورود است...`
                    : `Bot is scanning all ${markets.length || '500+'} pairs for the next clean setup...`
                  : isFa
                    ? 'هنوز معامله بازی وجود ندارد.'
                    : 'No open positions yet.'}
              </p>
              <p>{isFa ? 'ویزارد ۴ مرحله‌ای را باز کنید یا از پایانه معامله دستی ثبت کنید.' : 'Launch the Setup Wizard or place a trade from Terminal.'}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.openTrades.map((pos) => {
                const uPnl = Number(pos.unrealized_pnl || 0);
                const up = uPnl >= 0;
                return (
                  <div key={pos.id} className="rounded-2xl border hairline bg-[var(--soft)] p-3.5 flex flex-wrap items-center gap-3">
                    <CoinIcon symbol={pos.symbol} size={32} />
                    <div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { onSelectTerminalSymbol(pos.symbol); onNavigate('terminal'); }} className="font-bold text-sm text-main hover:underline">
                          {pos.symbol}
                        </button>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-black ${pos.direction === 'LONG' ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                          {pos.direction} {pos.leverage}×
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Entry ${pos.entry_price} · SL ${pos.current_stop_loss} · TP1 ${pos.tp1}
                      </p>
                    </div>

                    {pos.sparkline && pos.sparkline.length >= 2 && (
                      <div className="w-16 h-6 hidden sm:block ms-auto">
                        <Sparkline values={pos.sparkline} height={24} color={up ? '#10d9a3' : '#ff4d6d'} />
                      </div>
                    )}

                    <div className="ms-auto text-end">
                      <p dir="ltr" className={`font-num font-bold text-sm tabular ${up ? 'text-jade' : 'text-loss'}`}>
                        {up ? '+' : ''}${uPnl.toFixed(2)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditPos(pos);
                        setEditForm({
                          stopLoss: pos.current_stop_loss || '',
                          tp1: pos.tp1 || '',
                          tp2: pos.tp2 || '',
                          tp3: pos.tp3 || '',
                        });
                      }}
                      className="px-2.5 py-1.5 rounded-xl btn-ghost text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>TP/SL</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePosition(pos.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white text-xs font-black transition inline-flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بستن' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {data.pendingOrders && data.pendingOrders.length > 0 && (
            <div className="pt-3 border-t hairline space-y-2">
              <p className="text-xs font-black text-dim">{isFa ? `سفارش‌های لیمیت در انتظار (${data.pendingOrders.length})` : `Pending Limit Orders (${data.pendingOrders.length})`}</p>
              {data.pendingOrders.map((po) => (
                <div key={po.id} className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs">
                  <span>
                    <strong className="text-main">{po.symbol}</strong> · {po.direction} @ ${po.limit_price}
                  </span>
                  <button type="button" onClick={() => void cancelPendingOrder(po.id)} className="text-loss font-bold hover:underline">
                    {isFa ? 'لغو سفارش' : 'Cancel'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel rounded-[26px] p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="font-display font-bold text-lg text-main mb-3">
              {isFa ? 'اجماع سیگنال‌های بازار' : 'Market Consensus'}
            </h3>
            <ConsensusGauge
              value={consensusPct}
              longLabel={isFa ? 'خرید' : 'Long'}
              shortLabel={isFa ? 'فروش' : 'Short'}
            />
          </div>
          <button
            type="button"
            onClick={() => onNavigate('card')}
            className="btn-ghost w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2"
          >
            <Layers className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <span>{isFa ? 'ساخت کارت سود دلارینو (PNG)' : 'Dollarino Profit Card (PNG)'}</span>
          </button>
        </div>
      </section>

      {renderSharedModals()}
    </div>
  );
}
