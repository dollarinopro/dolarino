import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Cpu, Play, Radio, RotateCcw, SlidersHorizontal, Sparkles, Zap } from 'lucide-react';
import type { Lang } from '../lib/i18n';
import { AreaChart, ProgressRing } from './DollarinoViz';

type EngineId = 'ai' | 'dorna' | 'copy';
type Scope = 'ALL' | 'TOP' | 'SINGLE';

const ENGINES: Array<{
  id: EngineId;
  code: string;
  nameFa: string;
  nameEn: string;
  subFa: string;
  subEn: string;
  color: string;
  icon: typeof Cpu;
  w: [number, number, number, number];
}> = [
  {
    id: 'ai',
    code: 'AI',
    nameFa: 'هوش مصنوعی دُرّبین',
    nameEn: 'Dorrbin AI Consensus',
    subFa: 'اجماع چندمدلی لحظه‌ای',
    subEn: 'Multi-LLM Ensemble',
    color: '#d9f75c',
    icon: Sparkles,
    w: [9, 7, 8, 6],
  },
  {
    id: 'dorna',
    code: 'DRN',
    nameFa: 'استراتژی دُرنا V1',
    nameEn: 'Dorna V1 Strategy',
    subFa: 'روند، مومنتوم و KBOS',
    subEn: 'Trend, Momentum & KBOS',
    color: '#7e95ff',
    icon: Zap,
    w: [8, 9, 7, 9],
  },
  {
    id: 'copy',
    code: 'CPY',
    nameFa: 'کپی ترید دلارینو',
    nameEn: 'Dollarino Copy-Trade',
    subFa: 'تلگرام و وب‌هوک زیر ۱ ثانیه',
    subEn: 'Telegram & Webhook <1s',
    color: '#ff9c7a',
    icon: Radio,
    w: [6, 10, 9, 5],
  },
];

const PRESETS: Array<{
  nameFa: string;
  nameEn: string;
  engines: EngineId[];
  risk: number;
  leverage: number;
  scope: Scope;
}> = [
  { nameFa: 'محافظه‌کار', nameEn: 'Conservative', engines: ['dorna'], risk: 3, leverage: 3, scope: 'TOP' },
  { nameFa: 'متعادل', nameEn: 'Balanced', engines: ['ai', 'dorna'], risk: 6, leverage: 10, scope: 'ALL' },
  { nameFa: 'تهاجمی', nameEn: 'Aggressive', engines: ['ai', 'dorna', 'copy'], risk: 9, leverage: 25, scope: 'ALL' },
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function HybridLab({
  lang,
  onTryDemo,
}: {
  lang: Lang;
  onTryDemo?: () => void;
}) {
  const isFa = lang === 'fa';
  const [active, setActive] = useState<EngineId[]>(['ai', 'dorna']);
  const [risk, setRisk] = useState(6);
  const [leverage, setLeverage] = useState(10);
  const [scope, setScope] = useState<Scope>('ALL');
  const [capital, setCapital] = useState(10000);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const model = useMemo(() => {
    const n = active.length || 1;
    const axes = [0, 1, 2, 3].map((i) =>
      clamp(
        Math.round(
          (ENGINES.filter((e) => active.includes(e.id)).reduce((s, e) => s + (e.w[i] ?? 0), 0) / n) * 9.1 +
            (n - 1) * 2.4 -
            (i === 3 ? (risk - 5) * 1.4 : 0)
        ),
        35,
        99
      )
    );
    const coverage = scope === 'ALL' ? 30 : scope === 'TOP' ? 10 : 1;
    const winRate = clamp(Math.round(60 + n * 4 + axes[0]! * 0.16 - (risk - 5) * 1.3 - leverage * 0.12), 42, 95);
    const monthly = clamp((winRate - 50) * 0.34 * (risk / 6) + n * 0.75, 1.8, 28);
    const profit = Math.round((capital * monthly) / 100);
    const trades = scope === 'SINGLE' ? 8 : Math.round(coverage * (2.2 + risk * 0.18));
    const score = Math.round((axes[0]! + axes[1]! + axes[2]! + axes[3]!) / 4);
    const code = `DLR/${active.map((a) => a.toUpperCase()).sort().join('+')} · ${scope} · ${leverage}x · R${risk}`;
    const seed = risk * 3.1 + leverage * 0.7 + n * 5 + coverage;
    const curve = Array.from({ length: 30 }, (_, i) => {
      const wave = Math.sin(i * 0.85 + seed) * (risk * 0.9) + Math.cos(i * 0.37 + seed * 0.4) * 1.8;
      return capital + ((profit / 30) * (i + 1)) + wave * (capital / 1000);
    });
    return { axes, coverage, winRate, monthly, profit, trades, score, code, curve };
  }, [active, risk, leverage, scope, capital]);

  const toggle = (id: EngineId) => {
    setActive((prev) => (prev.includes(id) ? (prev.length === 1 ? prev : prev.filter((x) => x !== id)) : [...prev, id]));
    setPhase('idle');
    setProgress(0);
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setActive(p.engines);
    setRisk(p.risk);
    setLeverage(p.leverage);
    setScope(p.scope);
    setPhase('idle');
    setProgress(0);
    setToast(isFa ? `پیش‌تنظیم «${p.nameFa}» اعمال شد` : `Preset "${p.nameEn}" applied`);
  };

  const runSimulation = () => {
    if (phase === 'running') return;
    setPhase('running');
    setProgress(0);
    let p = 0;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      p += 8;
      setProgress(Math.min(100, p));
      if (p >= 100) {
        if (timer.current) window.clearInterval(timer.current);
        setPhase('done');
        setToast(isFa ? 'شبیه‌سازی ۳۰ روزه مدل ترکیبی کامل شد' : '30-day hybrid simulation finished');
      }
    }, 55);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(model.code);
      setToast(isFa ? 'شناسه مدل کپی شد' : 'Model ID copied');
    } catch {
      setToast(model.code);
    }
  };

  const chartColor = active.includes('ai') ? '#d9f75c' : '#7e95ff';

  return (
    <div id="hybrid-lab" className="console-lab">
      <div className="pointer-events-none absolute inset-0 console-grid" />
      <div className="relative">
        {/* Console Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 md:px-8 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div dir="ltr" className="flex gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-[#ff6242]" />
              <i className="w-2.5 h-2.5 rounded-full bg-[#d9f75c]" />
              <i className="w-2.5 h-2.5 rounded-full bg-[#7e95ff]" />
            </div>
            <span dir="ltr" className="font-latin text-[10px] tracking-[0.2em] font-bold text-white/60">
              HYBRID ENGINE LAB / V6.0
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#d9f75c] animate-pulse" />
            <span>{isFa ? 'محاسبه زنده پارامترها' : 'Real-Time Calibration'}</span>
          </div>
        </div>

        <div className="p-5 md:p-8 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div dir="ltr" className="font-latin text-[10px] tracking-[0.2em] font-bold text-[#d9f75c] mb-1.5">
                BUILD YOUR OWN MODEL
              </div>
              <h3 className="text-xl md:text-3xl font-black text-white leading-tight">
                {isFa ? 'موتورها را ترکیب کن. خروجی را همان لحظه ببین.' : 'Mix the engines. See live projections instantly.'}
              </h3>
              <p className="text-xs text-white/65 mt-1.5 max-w-xl leading-relaxed">
                {isFa
                  ? 'هوش مصنوعی دُرّبین، استراتژی دُرنا V1 و کپی‌ترید را ترکیب کنید و با تغییر ریسک، اهرم و پوشش بازار نتیجه ۳۰ روزه را بسنجید.'
                  : 'Combine Dorrbin AI, Dorna V1 Strategy, and Copy-Trade — tune risk, leverage, and market breadth in real time.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.nameEn}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-3.5 py-2 rounded-xl text-[11px] font-bold border border-white/15 text-white/75 hover:border-[#d9f75c] hover:text-[#d9f75c] transition"
                >
                  {isFa ? p.nameFa : p.nameEn}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Controls Column */}
            <div className="rounded-2xl console-surface border p-4 md:p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-extrabold text-white">
                  <SlidersHorizontal size={15} className="text-[#d9f75c]" />
                  <span>{isFa ? '۰۱ · انتخاب موتورها' : '01 · Select Engines'}</span>
                </div>
                <span dir="ltr" className="font-latin text-[10px] font-bold text-white/55">
                  {active.length}/3 ACTIVE
                </span>
              </div>

              <div className="space-y-2.5">
                {ENGINES.map((e) => {
                  const Icon = e.icon;
                  const on = active.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggle(e.id)}
                      className="w-full flex items-center gap-3 text-start p-3 rounded-xl border transition"
                      style={{
                        borderColor: on ? e.color : 'rgba(255,255,255,0.1)',
                        background: on ? `${e.color}14` : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <span
                        dir="ltr"
                        className="font-latin w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
                        style={{
                          background: on ? e.color : 'rgba(255,255,255,0.08)',
                          color: on ? '#0e141f' : 'rgba(255,255,255,0.55)',
                        }}
                      >
                        {e.code}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-extrabold text-white">
                          {isFa ? e.nameFa : e.nameEn}
                        </span>
                        <span className="block text-[10px] text-white/55 mt-0.5">
                          {isFa ? e.subFa : e.subEn}
                        </span>
                      </span>
                      <Icon size={16} style={{ color: on ? e.color : 'rgba(255,255,255,0.35)' }} />
                      <span
                        className="w-9 h-5 rounded-full flex items-center px-0.5 shrink-0 transition"
                        style={{ background: on ? e.color : 'rgba(255,255,255,0.16)' }}
                      >
                        <span
                          className="w-4 h-4 rounded-full bg-[#0a0f1d] transition-transform"
                          style={{ transform: on ? (isFa ? 'translateX(-16px)' : 'translateX(16px)') : 'none' }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="text-xs font-extrabold text-white mb-2.5">
                  {isFa ? '۰۲ · دامنه پوشش بازار' : '02 · Market Coverage'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['ALL', isFa ? 'کل بازار' : 'All Coins', '30+'],
                    ['TOP', isFa ? 'برترها' : 'Top Pairs', '10'],
                    ['SINGLE', isFa ? 'تک ارز' : 'Single', '01'],
                  ] as [Scope, string, string][]).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { setScope(id); setPhase('idle'); }}
                      className="rounded-xl border p-2.5 text-center transition"
                      style={{
                        borderColor: scope === id ? '#d9f75c' : 'rgba(255,255,255,0.12)',
                        background: scope === id ? 'rgba(217,247,92,0.1)' : 'rgba(255,255,255,0.025)',
                      }}
                    >
                      <div dir="ltr" className="font-latin text-[11px] font-black" style={{ color: scope === id ? '#d9f75c' : 'rgba(255,255,255,0.75)' }}>
                        {id}
                      </div>
                      <div className="text-[10px] text-white/55 mt-0.5">{label}</div>
                      <div dir="ltr" className="font-latin text-[10px] font-bold text-white mt-0.5">{count}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/10 pt-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-white/65">{isFa ? 'سطح ریسک مجاز' : 'Risk Level'}</span>
                    <span dir="ltr" className="font-mono-num text-xs font-black" style={{ color: risk > 7 ? '#ff8a6b' : '#d9f75c' }}>
                      {risk} / 10
                    </span>
                  </div>
                  <div dir="ltr">
                    <input type="range" min="1" max="10" value={risk} onChange={(e) => { setRisk(+e.target.value); setPhase('idle'); }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-white/65">{isFa ? 'اهرم معاملاتی' : 'Leverage'}</span>
                    <span dir="ltr" className="font-mono-num text-xs font-black text-[#7e95ff]">{leverage}x</span>
                  </div>
                  <div dir="ltr">
                    <input type="range" min="1" max="50" value={leverage} onChange={(e) => { setLeverage(+e.target.value); setPhase('idle'); }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-white/65">{isFa ? 'سرمایه شبیه‌سازی' : 'Sim Capital'}</span>
                  <div className="flex gap-1.5">
                    {[1000, 5000, 10000, 50000].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setCapital(c); setPhase('idle'); }}
                        dir="ltr"
                        className="font-mono-num px-2.5 py-1 rounded-lg text-[10px] font-bold border transition"
                        style={{
                          borderColor: capital === c ? '#7e95ff' : 'rgba(255,255,255,0.14)',
                          color: capital === c ? '#7e95ff' : 'rgba(255,255,255,0.65)',
                          background: capital === c ? 'rgba(126,149,255,0.14)' : 'transparent',
                        }}
                      >
                        ${c >= 1000 ? `${c / 1000}k` : c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Live Output Column */}
            <div className="rounded-2xl console-surface border p-4 md:p-6 flex flex-col justify-between space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-extrabold text-white">
                  <Cpu size={15} className="text-[#7e95ff]" />
                  <span>{isFa ? '۰۳ · خروجی زنده مدل' : '03 · Live Model Telemetry'}</span>
                </div>
                <span dir="ltr" className="font-latin text-[10px] font-bold text-[#d9f75c]">REAL-TIME</span>
              </div>

              <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                <ProgressRing value={model.score} size={78} stroke={7} color={chartColor}>
                  <span dir="ltr" className="font-mono-num text-base font-black text-white">{model.score}</span>
                  <span className="text-[8px] text-white/55">SCORE</span>
                </ProgressRing>
                <div className="flex-1 min-w-0">
                  <div dir="ltr" className="font-latin text-[9px] tracking-[0.18em] text-white/50 mb-1">MODEL ID</div>
                  <div dir="ltr" className="font-mono-num text-xs font-bold text-white break-all">{model.code}</div>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-white/65 hover:text-[#d9f75c] transition"
                  >
                    <Copy size={12} /> {isFa ? 'کپی شناسه مدل' : 'Copy Model ID'}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  [isFa ? 'دقت تحلیل' : 'Precision', model.axes[0]!, '#d9f75c'],
                  [isFa ? 'سرعت اجرا' : 'Speed', model.axes[1]!, '#7e95ff'],
                  [isFa ? 'پوشش بازار' : 'Coverage', model.axes[2]!, '#ff9c7a'],
                  [isFa ? 'کنترل ریسک' : 'Risk Guard', model.axes[3]!, '#37d6a5'],
                ].map(([label, val, color]) => (
                  <div key={String(label)}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/65">{label}</span>
                      <span dir="ltr" className="font-mono-num font-bold text-white">{val}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${val}%`, background: String(color) }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                <div>
                  <div className="text-[10px] text-white/55">{isFa ? 'وین‌ریت تخمینی' : 'Est. Win Rate'}</div>
                  <div dir="ltr" className="font-mono-num text-base font-black text-[#d9f75c] mt-0.5">{model.winRate}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-white/55">{isFa ? 'بازده ۳۰ روزه' : '30D Return'}</div>
                  <div dir="ltr" className="font-mono-num text-base font-black text-[#37d6a5] mt-0.5">+{model.monthly.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-white/55">{isFa ? 'تعداد معامله' : 'Est. Trades'}</div>
                  <div dir="ltr" className="font-mono-num text-base font-black text-white mt-0.5">{model.trades}</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white/55">{isFa ? 'منحنی پیش‌بینی رشد ۳۰ روزه' : '30-Day Growth Projection'}</span>
                  <span dir="ltr" className="font-mono-num text-xs font-black" style={{ color: chartColor }}>
                    +${model.profit.toLocaleString('en-US')}
                  </span>
                </div>
                <AreaChart values={model.curve} color={chartColor} height={110} />
              </div>
            </div>
          </div>

          {/* Simulation Run Bar */}
          <div className="rounded-2xl border border-white/10 console-surface p-4 flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  {phase === 'done' ? <Check size={14} className="text-[#d9f75c]" /> : <Play size={13} className="text-[#d9f75c]" />}
                  {phase === 'running'
                    ? isFa ? 'در حال پردازش داده‌های بازار...' : 'Running hybrid simulation...'
                    : phase === 'done'
                      ? isFa ? `شبیه‌سازی کامل شد · سود تخمینی +$${model.profit.toLocaleString('en-US')}` : `Complete · Est. +$${model.profit.toLocaleString('en-US')}`
                      : isFa ? 'آماده اجرای شبیه‌سازی مدل ترکیبی' : 'Ready to run hybrid simulation'}
                </span>
                <span dir="ltr" className="font-mono-num text-[11px] font-bold text-white/60">
                  {phase === 'idle' ? 'READY' : `${Math.round(progress)}%`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{ width: `${phase === 'idle' ? 0 : progress}%`, background: 'linear-gradient(90deg, #7e95ff, #d9f75c)' }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { setPhase('idle'); setProgress(0); }}
                aria-label="Reset simulation"
                className="px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white/75 hover:text-white transition"
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={runSimulation}
                className="btn-lime px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5"
              >
                <Play size={14} fill="currentColor" />
                <span>{isFa ? 'اجرای شبیه‌سازی' : 'Run Model'}</span>
              </button>
              {onTryDemo && (
                <button
                  type="button"
                  onClick={onTryDemo}
                  className="btn-cobalt px-5 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Zap size={14} />
                  <span>{isFa ? 'فعال‌سازی در ربات تریدر' : 'Activate on Bot'}</span>
                </button>
              )}
            </div>
          </div>

          {toast && (
            <div className="rounded-xl border border-[#d9f75c]/40 bg-[#d9f75c]/15 px-4 py-2 text-xs font-bold text-[#d9f75c] text-center">
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
