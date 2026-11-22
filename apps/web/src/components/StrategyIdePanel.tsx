import { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Code2,
  FileCode2,
  Layers,
  Play,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Terminal as TerminalIcon,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import {
  SAMPLE_CUSTOM_STRATEGIES,
  type Candle,
  type CustomStrategyLanguage,
  type Timeframe,
  type VisualRuleCondition,
  type VisualStrategyDefinition,
} from '@dollarino/core';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { CandlestickChart, type CustomStrategyChartOverlay } from './CandlestickChart';
import { AreaChart } from './DollarinoViz';
import { SymbolPicker, type ExchangeMarket } from './SymbolPickerModal';

export interface SavedUserStrategy {
  id: string;
  name: string;
  description: string;
  language: CustomStrategyLanguage;
  code: string;
  timeframe: string;
  updated_at: string;
}

const DEFAULT_VISUAL_DEF: VisualStrategyDefinition = {
  name: 'Visual EMA Cross + RSI',
  logic: 'ALL',
  slAtrMult: 1.8,
  tp1R: 1.4,
  tp2R: 2.5,
  tp3R: 3.8,
  longRules: [
    { id: 'l1', kind: 'EMA_CROSS_ABOVE', param1: 9, param2: 21 },
    { id: 'l2', kind: 'RSI_ABOVE', param1: 45 },
  ],
  shortRules: [
    { id: 's1', kind: 'EMA_CROSS_BELOW', param1: 9, param2: 21 },
    { id: 's2', kind: 'RSI_BELOW', param1: 55 },
  ],
};

const VISUAL_RULE_OPTIONS: Array<{ kind: VisualRuleCondition['kind']; labelFa: string; labelEn: string }> = [
  { kind: 'EMA_CROSS_ABOVE', labelFa: 'تقاطع رو به بالای EMA سریع و کند', labelEn: 'EMA Fast Crosses Above Slow' },
  { kind: 'EMA_CROSS_BELOW', labelFa: 'تقاطع رو به پایین EMA سریع و کند', labelEn: 'EMA Fast Crosses Below Slow' },
  { kind: 'PRICE_ABOVE_EMA', labelFa: 'قیمت بالای EMA روند', labelEn: 'Price Above Trend EMA' },
  { kind: 'PRICE_BELOW_EMA', labelFa: 'قیمت پایین EMA روند', labelEn: 'Price Below Trend EMA' },
  { kind: 'RSI_BELOW', labelFa: 'RSI زیر آستانه (اشباع فروش)', labelEn: 'RSI Below Threshold' },
  { kind: 'RSI_ABOVE', labelFa: 'RSI بالای آستانه', labelEn: 'RSI Above Threshold' },
  { kind: 'MACD_CROSS_UP', labelFa: 'تقاطع صعودی MACD', labelEn: 'MACD Bullish Crossover' },
  { kind: 'MACD_CROSS_DOWN', labelFa: 'تقاطع نزولی MACD', labelEn: 'MACD Bearish Crossunder' },
  { kind: 'BB_LOWER_TOUCH', labelFa: 'برخورد به باند پایین بولینگر', labelEn: 'Bollinger Lower Band Touch' },
  { kind: 'BB_UPPER_TOUCH', labelFa: 'برخورد به باند بالای بولینگر', labelEn: 'Bollinger Upper Band Touch' },
  { kind: 'SUPERTREND_BULL', labelFa: 'سوپرترند صعودی', labelEn: 'SuperTrend Bullish' },
  { kind: 'SUPERTREND_BEAR', labelFa: 'سوپرترند نزولی', labelEn: 'SuperTrend Bearish' },
  { kind: 'VOLUME_SPIKE', labelFa: 'جهش حجم معاملات', labelEn: 'Volume Spike Multiplier' },
];

export function StrategyIdePanel({
  lang,
  markets,
  defaultSymbol = 'BTCUSDT',
  activeCustomStrategyId,
  onAppliedToChart,
  onActivatedOnBot,
}: {
  lang: Lang;
  markets: ExchangeMarket[];
  defaultSymbol?: string;
  activeCustomStrategyId?: string | null;
  onAppliedToChart?: (overlay: CustomStrategyChartOverlay) => void;
  onActivatedOnBot?: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [samples, setSamples] = useState(SAMPLE_CUSTOM_STRATEGIES);
  const [savedList, setSavedList] = useState<SavedUserStrategy[]>([]);

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('Dollarino EMA 9/21 + RSI Momentum');
  const [language, setLanguage] = useState<CustomStrategyLanguage>('pine');
  const [code, setCode] = useState(SAMPLE_CUSTOM_STRATEGIES[0]!.code);
  const [visualDef, setVisualDef] = useState<VisualStrategyDefinition>(DEFAULT_VISUAL_DEF);

  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [evalRes, setEvalRes] = useState<{
    valid: boolean;
    title: string;
    errors: string[];
    warnings: string[];
    plots: CustomStrategyChartOverlay['plots'];
    markers: CustomStrategyChartOverlay['markers'];
    candles: Candle[];
    latestSignal: { signal: string; price: number; rsi: number } | null;
    backtestSummary: {
      metrics: {
        netReturnPct: number;
        totalTrades: number;
        winRatePct: number;
        profitFactor: number;
        sharpeEstimate: number;
        maxDrawdownPct: number;
      };
      equityCurve: Array<{ time: number; equity: number }>;
    } | null;
  } | null>(null);

  const loadLibrary = async () => {
    try {
      const r = await apiFetch<{ samples: typeof SAMPLE_CUSTOM_STRATEGIES; userStrategies: SavedUserStrategy[] }>(
        '/api/trading/strategies'
      );
      if (r.samples?.length) setSamples(r.samples);
      if (r.userStrategies) setSavedList(r.userStrategies);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void loadLibrary();
  }, []);

  const effectiveCode = language === 'visual' ? JSON.stringify({ ...visualDef, name }, null, 2) : code;

  const runOnChart = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<NonNullable<typeof evalRes>>('/api/trading/strategies/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          language,
          code: effectiveCode,
          symbol,
          timeframe,
        }),
      });
      setEvalRes(res);
      if (res.valid) {
        onAppliedToChart?.({
          id: editingId,
          title: res.title || name,
          language,
          plots: res.plots,
          markers: res.markers,
        });
        setMsg({
          ok: true,
          text: isFa
            ? `استراتژی «${res.title}» با ${res.plots.length} اندیکاتور و ${res.markers.length} سیگنال روی چارت اجرا شد.`
            : `"${res.title}" compiled with ${res.plots.length} plots & ${res.markers.length} chart signals.`,
        });
      } else {
        setMsg({ ok: false, text: res.errors[0] || 'Compile error' });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Evaluation failed' });
    } finally {
      setBusy(false);
    }
  };

  const saveStrategy = async (andActivate = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const saved = await apiFetch<{ ok: boolean; strategy: SavedUserStrategy }>('/api/trading/strategies', {
        method: 'POST',
        body: JSON.stringify({
          id: editingId,
          name: name.trim() || 'My Strategy',
          language,
          code: effectiveCode,
          timeframe,
        }),
      });
      setEditingId(saved.strategy.id);

      if (andActivate) {
        await apiFetch(`/api/trading/strategies/${saved.strategy.id}/activate`, { method: 'POST' });
        setMsg({
          ok: true,
          text: isFa
            ? `استراتژی «${saved.strategy.name}» ذخیره و به عنوان موتور فعال ربات خودکار تنظیم شد.`
            : `Saved & deployed "${saved.strategy.name}" to Autonomous Bot.`,
        });
        await onActivatedOnBot?.();
      } else {
        setMsg({
          ok: true,
          text: isFa ? `استراتژی «${saved.strategy.name}» در کتابخانه ذخیره شد.` : `Saved "${saved.strategy.name}".`,
        });
      }
      await loadLibrary();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  const deleteStrategy = async (id: string) => {
    await apiFetch(`/api/trading/strategies/${id}`, { method: 'DELETE' });
    if (editingId === id) setEditingId(undefined);
    await loadLibrary();
    await onActivatedOnBot?.();
  };

  const loadSample = (s: (typeof SAMPLE_CUSTOM_STRATEGIES)[number]) => {
    setEditingId(undefined);
    setLanguage(s.language);
    setName(isFa ? s.nameFa : s.nameEn);
    setCode(s.code);
    setMsg(null);
  };

  const loadUserStrategy = (u: SavedUserStrategy) => {
    setEditingId(u.id);
    setLanguage(u.language);
    setName(u.name);
    setTimeframe((u.timeframe || '15m') as Timeframe);
    if (u.language === 'visual') {
      try {
        setVisualDef(JSON.parse(u.code) as VisualStrategyDefinition);
      } catch {
        setVisualDef(DEFAULT_VISUAL_DEF);
      }
    } else {
      setCode(u.code);
    }
    setMsg(null);
  };

  const chartOverlayObj: CustomStrategyChartOverlay | null =
    evalRes && evalRes.valid
      ? {
          id: editingId,
          title: evalRes.title || name,
          language,
          plots: evalRes.plots,
          markers: evalRes.markers,
        }
      : null;

  return (
    <div className="space-y-5">
      {/* Header & Language Switch */}
      <div className="panel rounded-[26px] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-widest uppercase text-goldsoft">
              {isFa ? 'محیط توسعه استراتژی کوانت (Pro Quant IDE)' : 'PRO QUANT STRATEGY IDE'}
            </p>
            <h3 className="font-display font-bold text-xl text-main flex items-center gap-2 mt-0.5">
              <Code2 className="w-5 h-5" style={{ color: 'var(--gold)' }} />
              <span>{isFa ? 'اجرای کد TradingView Pine Script، پایتون و استراتژی‌ساز بصری' : 'Pine Script, Python & Visual Strategy Engine'}</span>
            </h3>
            <p className="text-xs text-dim mt-1">
              {isFa
                ? 'کد Pine Script یا Python خودتان را بنویسید یا از قالب‌های آماده انتخاب کنید؛ خطوط اندیکاتور مستقیماً روی چارت زنده رسم و روی ربات خودکار فعال می‌شوند.'
                : 'Author or paste TradingView Pine Script v5, Python strategies, or Visual rules — overlay directly onto live charts and deploy 24/7.'}
            </p>
          </div>

          <div className="ios-segmented">
            {[
              { id: 'pine' as const, icon: FileCode2, l: 'Pine Script v5' },
              { id: 'python' as const, icon: TerminalIcon, l: 'Python Quant' },
              { id: 'visual' as const, icon: Layers, l: isFa ? 'سازنده بصری' : 'Visual Builder' },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setLanguage(t.id);
                    if (t.id === 'pine' && !code.includes('strategy(') && !code.includes('indicator(')) {
                      setCode(SAMPLE_CUSTOM_STRATEGIES[0]!.code);
                    }
                    if (t.id === 'python' && !code.includes('def ') && !code.includes('df[')) {
                      setCode(SAMPLE_CUSTOM_STRATEGIES[3]!.code);
                    }
                  }}
                  className={`px-3.5 py-2 rounded-full text-xs font-black inline-flex items-center gap-1.5 transition ${
                    language === t.id ? 'ios-pill-active' : 'text-dim hover:text-main'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.l}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sample Built-in Library + Saved Strategies */}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="surface-soft rounded-2xl p-3.5 space-y-2.5">
            <p className="text-[11px] font-black text-main flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-jade" />
              <span>{isFa ? 'کتابخانه نمونه‌کدهای آماده (کلیک برای بارگذاری)' : 'Built-in Sample Templates (Click to Load)'}</span>
            </p>
            <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pe-1">
              {samples.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => loadSample(s)}
                  className="p-2.5 rounded-xl bg-[var(--panel)] border hairline hover:border-[var(--gold)] text-start transition"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-black text-main truncate">{isFa ? s.nameFa : s.nameEn}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand/15 text-brand font-bold uppercase shrink-0">
                      {s.language}
                    </span>
                  </div>
                  <p className="text-[10px] text-dim mt-1 line-clamp-2">{isFa ? s.descriptionFa : s.descriptionEn}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="surface-soft rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black text-main flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
                <span>{isFa ? `استراتژی‌های ذخیره‌شده من (${savedList.length})` : `My Saved Strategies (${savedList.length})`}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingId(undefined);
                  setName(language === 'python' ? 'New Python Strategy' : 'New Pine Strategy');
                }}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg btn-ghost inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>{isFa ? 'جدید' : 'New'}</span>
              </button>
            </div>
            {savedList.length === 0 ? (
              <div className="py-8 text-center text-[11px] text-dim">
                {isFa
                  ? 'هنوز استراتژی اختصاصی ذخیره نکرده‌اید. از نمونه‌ها انتخاب یا کدتان را بنویسید و ذخیره کنید.'
                  : 'No saved custom strategies yet. Load a sample or write your own code and save.'}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pe-1">
                {savedList.map((u) => {
                  const isActive = activeCustomStrategyId === u.id;
                  return (
                    <div
                      key={u.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                        isActive ? 'badge-signal' : 'bg-[var(--panel)] hairline'
                      }`}
                    >
                      <button type="button" onClick={() => loadUserStrategy(u)} className="text-start min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-main truncate">{u.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 uppercase font-bold">{u.language}</span>
                          {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded-full btn-lime">ACTIVE BOT</span>}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/trading/strategies/${u.id}/activate`, { method: 'POST' });
                            setMsg({ ok: true, text: isFa ? `استراتژی «${u.name}» روی ربات خودکار فعال شد.` : `Activated "${u.name}" on bot.` });
                            await onActivatedOnBot?.();
                          }}
                          className="px-2 py-1 rounded-lg btn-gold text-[10px]"
                        >
                          {isFa ? 'فعال‌سازی' : 'Deploy'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteStrategy(u.id)}
                          className="p-1.5 rounded-lg text-loss hover:bg-rose-500/15"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Name + Symbol + Timeframe + Code Editor / Visual Builder */}
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-dim block mb-1">{isFa ? 'نام استراتژی' : 'Strategy Name'}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="field py-2.5 text-xs font-bold" />
          </div>
          <div>
            <label className="text-dim block mb-1">{isFa ? 'نماد تست روی چارت' : 'Chart / Test Symbol'}</label>
            <SymbolPicker lang={lang} markets={markets} value={symbol} provider="paper" onChange={setSymbol} />
          </div>
          <div>
            <label className="text-dim block mb-1">{isFa ? 'تایم‌فریم' : 'Timeframe'}</label>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)} className="field py-2.5 text-xs">
              {(['5m', '15m', '30m', '1h', '4h'] as const).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {language !== 'visual' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-dim">
              <span className="font-mono font-bold">
                {language === 'pine'
                  ? 'TradingView Pine Script v4/v5 (ta.ema, ta.sma, ta.rsi, ta.bb, ta.supertrend, ta.macd, plot, strategy.entry)'
                  : 'Python Strategy Sandbox (df["close"], ta.ema, ta.rsi, ta.bbands, ta.supertrend, crossover, plot, df.loc[..., "signal"])'}
              </span>
            </div>
            <textarea
              dir="ltr"
              spellCheck={false}
              rows={13}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-2xl p-4 font-mono text-xs leading-relaxed bg-[#060d20] text-[#e2ecff] border border-blue-500/30 outline-none focus:border-blue-400"
            />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 text-xs">
            {(['longRules', 'shortRules'] as const).map((sideKey) => {
              const isLong = sideKey === 'longRules';
              const list = visualDef[sideKey];
              return (
                <div key={sideKey} className="surface-soft rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`font-black ${isLong ? 'text-jade' : 'text-loss'}`}>
                      {isLong ? (isFa ? 'شروط ورود خرید (LONG)' : 'LONG Entry Conditions') : isFa ? 'شروط ورود فروش (SHORT)' : 'SHORT Entry Conditions'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setVisualDef((prev) => ({
                          ...prev,
                          [sideKey]: [
                            ...prev[sideKey],
                            { id: String(Date.now()), kind: isLong ? 'RSI_BELOW' : 'RSI_ABOVE', param1: isLong ? 35 : 65 },
                          ],
                        }))
                      }
                      className="btn-ghost px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> {isFa ? 'شرط جدید' : 'Add Rule'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {list.map((rule, idx) => (
                      <div key={rule.id} className="p-2.5 rounded-xl bg-[var(--panel)] border hairline grid grid-cols-[1fr_70px_70px_auto] gap-1.5 items-center">
                        <select
                          value={rule.kind}
                          onChange={(e) => {
                            const nextKind = e.target.value as VisualRuleCondition['kind'];
                            setVisualDef((prev) => ({
                              ...prev,
                              [sideKey]: prev[sideKey].map((r, i) => (i === idx ? { ...r, kind: nextKind } : r)),
                            }));
                          }}
                          className="field py-1.5 px-2 text-[11px]"
                        >
                          {VISUAL_RULE_OPTIONS.map((opt) => (
                            <option key={opt.kind} value={opt.kind}>
                              {isFa ? opt.labelFa : opt.labelEn}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={rule.param1}
                          onChange={(e) =>
                            setVisualDef((prev) => ({
                              ...prev,
                              [sideKey]: prev[sideKey].map((r, i) => (i === idx ? { ...r, param1: Number(e.target.value) } : r)),
                            }))
                          }
                          className="field py-1.5 px-2 text-[11px] font-num"
                        />
                        <input
                          type="number"
                          value={rule.param2 ?? 21}
                          onChange={(e) =>
                            setVisualDef((prev) => ({
                              ...prev,
                              [sideKey]: prev[sideKey].map((r, i) => (i === idx ? { ...r, param2: Number(e.target.value) } : r)),
                            }))
                          }
                          className="field py-1.5 px-2 text-[11px] font-num"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setVisualDef((prev) => ({
                              ...prev,
                              [sideKey]: prev[sideKey].filter((_, i) => i !== idx),
                            }))
                          }
                          className="p-1 text-loss"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runOnChart()}
              className="btn-cobalt px-5 py-3 rounded-2xl text-xs inline-flex items-center gap-1.5"
            >
              <Play className="w-4 h-4" />
              <span>{busy ? '...' : isFa ? 'اجرا روی چارت + بک‌تست زنده' : 'Run on Live Chart & Backtest'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveStrategy(false)}
              className="btn-ghost px-4 py-3 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{isFa ? 'ذخیره در کتابخانه' : 'Save to Library'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveStrategy(true)}
              className="btn-lime px-5 py-3 rounded-2xl text-xs inline-flex items-center gap-1.5"
            >
              <Rocket className="w-4 h-4" />
              <span>{isFa ? 'ذخیره و معامله خودکار ۲۴/۷ با این استراتژی' : 'Save & Auto-Trade 24/7'}</span>
            </button>
          </div>
          {evalRes?.warnings?.length ? (
            <span className="text-[11px] text-amber font-bold">{evalRes.warnings[0]}</span>
          ) : null}
        </div>

        {msg && (
          <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${msg.ok ? 'badge-signal' : 'bg-rose-500/15 text-loss border border-rose-500/30'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Activity className="w-4 h-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}
      </div>

      {/* Live Candlestick Overlay + Backtest Performance */}
      {evalRes && evalRes.valid && evalRes.candles.length > 0 && (
        <div className="panel rounded-[26px] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-display font-bold text-lg text-main flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-jade" />
                <span>{isFa ? `پیش‌نمایش زنده روی چارت: ${symbol} (${timeframe})` : `Live Chart Preview: ${symbol} (${timeframe})`}</span>
              </h4>
            </div>
            {evalRes.latestSignal && (
              <span className={`px-3 py-1 rounded-full text-xs font-black ${
                evalRes.latestSignal.signal === 'LONG' ? 'badge-signal' : evalRes.latestSignal.signal === 'SHORT' ? 'bg-rose-500/15 text-loss' : 'surface-soft text-dim'
              }`}>
                {isFa ? 'آخرین وضعیت:' : 'Latest Bar:'} {evalRes.latestSignal.signal}
              </span>
            )}
          </div>

          <CandlestickChart candles={evalRes.candles} customOverlays={chartOverlayObj} height={390} />

          {evalRes.backtestSummary && (
            <div className="space-y-4 pt-3 border-t hairline">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-center">
                {[
                  {
                    l: isFa ? 'بازده خالص' : 'Net Return',
                    v: `${evalRes.backtestSummary.metrics.netReturnPct >= 0 ? '+' : ''}${evalRes.backtestSummary.metrics.netReturnPct.toFixed(2)}%`,
                    c: evalRes.backtestSummary.metrics.netReturnPct >= 0 ? 'text-jade' : 'text-loss',
                  },
                  { l: isFa ? 'کل معاملات' : 'Trades', v: String(evalRes.backtestSummary.metrics.totalTrades), c: 'text-main' },
                  { l: isFa ? 'نرخ برد' : 'Win Rate', v: `${evalRes.backtestSummary.metrics.winRatePct.toFixed(1)}%`, c: 'text-goldsoft' },
                  { l: 'Profit Factor', v: evalRes.backtestSummary.metrics.profitFactor.toFixed(2), c: 'text-jade' },
                  { l: 'Sharpe', v: evalRes.backtestSummary.metrics.sharpeEstimate.toFixed(2), c: 'text-brand' },
                  { l: isFa ? 'حداکثر افت' : 'Max DD', v: `${evalRes.backtestSummary.metrics.maxDrawdownPct.toFixed(2)}%`, c: 'text-loss' },
                ].map((m) => (
                  <div key={m.l} className="surface-soft rounded-2xl p-3">
                    <p dir="ltr" className={`font-num font-bold text-base ${m.c}`}>{m.v}</p>
                    <p className="text-[10px] text-dim mt-0.5">{m.l}</p>
                  </div>
                ))}
              </div>
              {evalRes.backtestSummary.equityCurve.length > 2 && (
                <div className="h-36 rounded-2xl bg-black/20 border hairline p-3">
                  <AreaChart values={evalRes.backtestSummary.equityCurve.map((p) => p.equity)} height={116} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
