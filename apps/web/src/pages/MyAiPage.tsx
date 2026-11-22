import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  Cpu,
  Lock,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { NavTab } from '../lib/types';
import { AreaChart } from '../components/DollarinoViz';

interface TrainedAIRules {
  style: string;
  timeframe: string;
  directionMode: string;
  symbols: string[];
  indicators: string[];
  rsiOversold: number;
  rsiOverbought: number;
  emaFast: number;
  emaSlow: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxLeverage: number;
}

interface MyAiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function MyAiPage({
  lang,
  hasPaidPlan,
  onNavigate,
  onRefresh,
}: {
  lang: Lang;
  hasPaidPlan: boolean;
  onNavigate: (tab: NavTab) => void;
  onRefresh: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [agentName, setAgentName] = useState('هوش مصنوعی شخصی من');
  const [rules, setRules] = useState<TrainedAIRules | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [messages, setMessages] = useState<MyAiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{
    symbol: string;
    timeframe: string;
    latestSignal: { signal: string; price: number; rsi: number } | null;
    markersCount: number;
    backtest: {
      metrics: { netReturnPct: number; totalTrades: number; winRatePct: number; profitFactor: number; maxDrawdownPct: number };
      equityCurve: Array<{ equity: number }>;
    } | null;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch<{
        agent: { name: string; is_active_for_trading: number; rules: TrainedAIRules };
        messages: MyAiMessage[];
      }>('/api/my-ai');
      setAgentName(res.agent.name);
      setRules(res.agent.rules);
      setIsActive(Boolean(res.agent.is_active_for_trading));
      setMessages(res.messages);
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Failed to load My AI' });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = async (customText?: string) => {
    const txt = (customText ?? input).trim();
    if (!txt) return;
    setBusy(true);
    setNotice(null);
    if (!customText) setInput('');
    try {
      const res = await apiFetch<{
        ok: boolean;
        reply: string;
        rules: TrainedAIRules;
      }>('/api/my-ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: txt, agentName }),
      });
      setRules(res.rules);
      await load();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Error teaching AI' });
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTestBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        symbol: string;
        timeframe: string;
        latestSignal: { signal: string; price: number; rsi: number } | null;
        markersCount: number;
        backtest: {
          metrics: { netReturnPct: number; totalTrades: number; winRatePct: number; profitFactor: number; maxDrawdownPct: number };
          equityCurve: Array<{ equity: number }>;
        } | null;
      }>('/api/my-ai/test', {
        method: 'POST',
        body: JSON.stringify({ symbol: rules?.symbols[0] || 'BTCUSDT' }),
      });
      setTestResult(res);
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setTestBusy(false);
    }
  };

  const toggleActivate = async (startBot: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const nextActive = startBot ? true : !isActive;
      await apiFetch('/api/my-ai/activate', {
        method: 'POST',
        body: JSON.stringify({ active: nextActive, startBot }),
      });
      setIsActive(nextActive);
      await onRefresh();
      setNotice({
        ok: true,
        text: nextActive
          ? isFa
            ? 'هوش مصنوعی شخصی شما فعال شد و الان مطابق قوانین آموزش‌داده‌شده ترید می‌کند!'
            : 'Your personal AI is active and trading autonomously!'
          : isFa
            ? 'هوش مصنوعی شخصی متوقف شد.'
            : 'Personal AI paused.',
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setNotice({
          ok: false,
          text: isFa ? 'برای فعال‌سازی ترید خودکار با هوش مصنوعی من، ابتدا اشتراک خود را فعال کنید.' : e.message,
        });
      } else {
        setNotice({ ok: false, text: e instanceof Error ? e.message : 'Activation error' });
      }
    } finally {
      setBusy(false);
    }
  };

  const resetAi = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch<{ ok: boolean; rules: TrainedAIRules }>('/api/my-ai/reset', { method: 'POST' });
      setRules(res.rules);
      setIsActive(false);
      setTestResult(null);
      await load();
      setNotice({ ok: true, text: isFa ? 'هوش مصنوعی به حالت خام اولیه برگشت.' : 'Reset to blank AI state.' });
    } finally {
      setBusy(false);
    }
  };

  const starterPrompts = isFa
    ? [
        'سبک اسکلپ ۱۵ دقیقه روی BTC و ETH با EMA 9/21 و RSI زیر ۳۵، حد ضرر ۱.۵٪ و حد سود ۴٪ و اهرم ۵x',
        'فقط معاملات لانگ در تایم‌فریم ۱ ساعته روی SOL و BNB با سوپرترند و مکدی، حد ضرر ۲٪ و حد سود ۶٪',
        'معامله دوطرفه با شکست باند بولینگر و جهش حجم روی تایم ۱۵ دقیقه با اهرم ۳x',
      ]
    : [
        '15m scalp on BTC and ETH with EMA 9/21 and RSI below 35, SL 1.5%, TP 4%, 5x leverage',
        'Long only 1h swing on SOL & BNB using SuperTrend + MACD, SL 2%, TP 6%',
      ];

  return (
    <div className="space-y-6">
      <div className="panel rounded-[28px] p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <img
            src="/images/my-ai-brain.png"
            alt="My Personal Trainable AI"
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl object-cover border hairline shadow-lg shrink-0 mx-auto sm:mx-0"
          />
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[11px] font-black">
              <Brain className="w-3.5 h-3.5" />
              <span>{isFa ? 'هوش مصنوعی خامِ اختصاصی شما (قابل آموزش)' : 'MY TRAINABLE RAW AI'}</span>
            </span>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
              {isFa ? 'هوش مصنوعی من — بهش یاد بده و بذار ترید کنه' : 'My AI — Teach Your Strategy, Let It Trade'}
            </h2>
            <p className="text-xs sm:text-sm text-dim max-w-2xl leading-relaxed">
              {isFa
                ? 'این هوش مصنوعی هیچ استراتژی از پیش‌تعیین‌شده‌ای ندارد! فقط با زبان ساده و چت فارسی استراتژی، تایم‌فریم، اندیکاتورها و مدیریت ریسک خودت را به او بگو تا یاد بگیرد و برایت ترید کند.'
                : 'Starts completely blank. Chat in plain language to teach your exact strategy, indicators, timeframe, SL/TP, and coins — test live and activate.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetAi()}
            className="btn-ghost px-4 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isFa ? 'ریست به هوش خام' : 'Reset Blank AI'}</span>
          </button>
          {!hasPaidPlan ? (
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="btn-gold px-5 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isFa ? 'خرید اشتراک برای فعال‌سازی' : 'Upgrade to Activate'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleActivate(true)}
              className={`px-5 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 ${
                isActive ? 'btn-emerald' : 'btn-lime'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>
                {isActive
                  ? isFa ? 'فعال روی ربات (اجرا مجدد)' : 'Active & Trading 24/7'
                  : isFa ? 'فعال‌سازی ترید با هوش مصنوعی من' : 'Activate & Start My AI'}
              </span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 ${
            notice.ok ? 'badge-signal' : 'bg-rose-500/15 text-loss border border-rose-500/30'
          }`}
        >
          <span>{notice.text}</span>
          {!hasPaidPlan && !notice.ok && (
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="btn-gold px-3.5 py-1.5 rounded-xl text-[11px] shrink-0"
            >
              {isFa ? 'مشاهده پلن‌ها' : 'View Plans'}
            </button>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.25fr_0.95fr] gap-5 items-start">
        {/* Conversational Training Chat */}
        <div className="panel rounded-[28px] overflow-hidden flex flex-col min-h-[520px] max-h-[680px]">
          <div className="px-5 py-3.5 border-b hairline flex items-center justify-between gap-2 bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#1652f0]/15 border border-[#1652f0]/30 grid place-items-center">
                <Bot className="w-4.5 h-4.5 text-brand" />
              </div>
              <div>
                <p className="text-xs font-black text-main">{agentName}</p>
                <p className="text-[11px] text-dim inline-flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {isActive
                    ? isFa ? 'در حال معامله با استراتژی شما' : 'Actively trading your rules'
                    : isFa ? 'آماده دریافت آموزش جدید' : 'Ready to learn'}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full surface-soft text-dim">
              {messages.length} {isFa ? 'پیام' : 'msgs'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            {messages.map((m) => {
              const isAssistant = m.role === 'assistant';
              return (
                <div key={m.id} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                      isAssistant
                        ? 'surface-soft border hairline text-main'
                        : 'bg-[#1652f0] text-white shadow-md'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t hairline space-y-3 bg-[var(--panel)]">
            <div className="flex flex-wrap gap-1.5">
              {starterPrompts.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={busy}
                  onClick={() => void sendMessage(p)}
                  className="text-[11px] px-3 py-1.5 rounded-xl surface-soft hover:border-[var(--gold)] border border-transparent text-sub hover:text-main transition text-start"
                >
                  <Sparkles className="w-3 h-3 inline me-1 text-amber" />
                  {p.slice(0, 62)}...
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={
                  isFa
                    ? 'مثلاً: تایم ۱۵ دقیقه با RSI زیر ۳۵ و EMA 9/21 فقط روی BTC و SOL حد ضرر ۲٪ و سود ۵٪...'
                    : 'Describe your timeframe, indicators, coins, SL%, TP%, and leverage...'
                }
                className="field text-xs flex-1 py-3"
              />
              <button
                type="button"
                disabled={busy || !input.trim()}
                onClick={() => void sendMessage()}
                className="btn-gold px-5 py-3 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{busy ? '...' : isFa ? 'آموزش بده' : 'Teach AI'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Learned Strategy Memory + Live Test */}
        <div className="space-y-4">
          <div className="panel rounded-[28px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                <Cpu className="w-4 h-4 text-brand" />
                <span>{isFa ? 'حافظه قوانین استخراج‌شده' : 'Extracted Strategy Brain'}</span>
              </h3>
              <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                {rules?.style || 'TREND'}
              </span>
            </div>

            {rules && (
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="surface-soft rounded-2xl p-3">
                  <p className="text-[10px] text-dim">{isFa ? 'تایم‌فریم' : 'Timeframe'}</p>
                  <p dir="ltr" className="font-num font-black text-main mt-0.5">{rules.timeframe}</p>
                </div>
                <div className="surface-soft rounded-2xl p-3">
                  <p className="text-[10px] text-dim">{isFa ? 'جهت معاملات' : 'Direction'}</p>
                  <p className="font-black text-main mt-0.5">{rules.directionMode}</p>
                </div>
                <div className="surface-soft rounded-2xl p-3">
                  <p className="text-[10px] text-dim">{isFa ? 'حد ضرر / حد سود' : 'SL / TP'}</p>
                  <p dir="ltr" className="font-num font-black text-jade mt-0.5">
                    {rules.stopLossPct}% / {rules.takeProfitPct}%
                  </p>
                </div>
                <div className="surface-soft rounded-2xl p-3">
                  <p className="text-[10px] text-dim">{isFa ? 'حداکثر اهرم' : 'Max Leverage'}</p>
                  <p dir="ltr" className="font-num font-black text-main mt-0.5">{rules.maxLeverage}x</p>
                </div>
                <div className="surface-soft rounded-2xl p-3 col-span-2">
                  <p className="text-[10px] text-dim mb-1.5">{isFa ? 'ارزهای انتخابی' : 'Target Symbols'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {rules.symbols.map((s) => (
                      <span key={s} dir="ltr" className="px-2.5 py-0.5 rounded-lg bg-[#1652f0]/15 text-brand font-num font-bold text-[11px]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="surface-soft rounded-2xl p-3 col-span-2">
                  <p className="text-[10px] text-dim mb-1.5">{isFa ? 'اندیکاتورها و منطق' : 'Indicators & Logic'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {rules.indicators.map((ind) => (
                      <span key={ind} dir="ltr" className="px-2.5 py-0.5 rounded-lg badge-signal font-bold text-[11px]">
                        {ind}
                      </span>
                    ))}
                    <span dir="ltr" className="px-2.5 py-0.5 rounded-lg surface-soft font-num text-[11px] text-sub">
                      EMA {rules.emaFast}/{rules.emaSlow} · RSI {rules.rsiOversold}/{rules.rsiOverbought}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={testBusy}
              onClick={() => void runTest()}
              className="btn-cobalt w-full py-3 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              <span>{testBusy ? '...' : isFa ? 'تست و شبیه‌سازی روی بازار زنده' : 'Test on Live Market Candles'}</span>
            </button>
          </div>

          {testResult && (
            <div className="panel rounded-[28px] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-display font-bold text-sm text-main flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-jade" />
                  <span>
                    {isFa ? `نتیجه تست زنده ${testResult.symbol}` : `Live Backtest (${testResult.symbol})`}
                  </span>
                </h4>
                {testResult.latestSignal && (
                  <span className="badge-signal px-2.5 py-0.5 rounded-full text-[11px] font-black">
                    {testResult.latestSignal.signal}
                  </span>
                )}
              </div>

              {testResult.backtest && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
                    <div className="surface-soft rounded-2xl p-2.5">
                      <p dir="ltr" className={`font-num font-black text-sm ${testResult.backtest.metrics.netReturnPct >= 0 ? 'text-jade' : 'text-loss'}`}>
                        {testResult.backtest.metrics.netReturnPct >= 0 ? '+' : ''}
                        {testResult.backtest.metrics.netReturnPct.toFixed(2)}%
                      </p>
                      <p className="text-[10px] text-dim">{isFa ? 'بازده شبیه‌سازی' : 'Net Return'}</p>
                    </div>
                    <div className="surface-soft rounded-2xl p-2.5">
                      <p dir="ltr" className="font-num font-black text-sm text-main">
                        {testResult.backtest.metrics.winRatePct.toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-dim">{isFa ? 'نرخ برد' : 'Win Rate'}</p>
                    </div>
                    <div className="surface-soft rounded-2xl p-2.5 col-span-2 sm:col-span-1">
                      <p dir="ltr" className="font-num font-black text-sm text-main">
                        {testResult.backtest.metrics.totalTrades}
                      </p>
                      <p className="text-[10px] text-dim">{isFa ? 'تعداد ترید' : 'Trades'}</p>
                    </div>
                  </div>
                  {testResult.backtest.equityCurve.length > 2 && (
                    <div className="h-28 rounded-2xl bg-black/20 border hairline p-2">
                      <AreaChart values={testResult.backtest.equityCurve.map((x) => x.equity)} height={92} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="surface-soft rounded-2xl p-4 text-[11px] text-dim flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-jade shrink-0 mt-0.5" />
            <span>
              {isFa
                ? 'پس از فعال‌سازی، ربات ۲۴/۷ بازار را دقیقاً طبق قوانین آموزش‌دیده شما بررسی کرده و با مدیریت ۳ تارگت و استاپ‌لاس خودکار معامله باز می‌کند.'
                : 'Once activated, your bot checks markets 24/7 strictly following your trained rules with 3-TP & stop-loss protection.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
