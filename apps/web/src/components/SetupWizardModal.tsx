import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  KeyRound,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { DollarinoBrandMark } from './BrandGraphics';
import { ExchangeLogo } from './BrandLogos';

export function SetupWizardModal({
  lang,
  availableBalance = 10000,
  onClose,
  onCompleted,
}: {
  lang: Lang;
  availableBalance?: number;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [tab, setTab] = useState<'agent' | 'vault'>('agent');
  const [step, setStep] = useState(0);

  const safeAvail = Math.max(100, availableBalance);
  const [allocatedAmount, setAllocatedAmount] = useState<number>(Math.round(safeAvail * 0.5));
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [strategyType, setStrategyType] = useState<
    'ai_autonomous_agent' | 'my_custom_ai' | 'dollarino_v01' | 'kbos_v11' | 'sp2l' | 'ema_trend_pullback' | 'signal_mixer' | 'high_20x'
  >('ai_autonomous_agent');

  const [exProvider, setExProvider] = useState<'toobit' | 'bitunix' | 'kcex'>('toobit');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [kcexSession, setKcexSession] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const marginPct = Math.min(100, Math.max(2, Math.round((allocatedAmount / safeAvail) * 100)));

  const riskOptions = [
    {
      id: 'low' as const,
      title: isFa ? 'کم‌ریسک (Conservative)' : 'Conservative',
      maxLev: 3,
      dailyLoss: 3.0,
      trailingPct: 1.5,
      detail: isFa ? 'اهرم ۳x، تریلینگ ۱.۵٪، سقف ضرر روزانه ۳٪' : 'Max 3x lev · 1.5% Trailing SL · 3% daily cap',
      color: 'text-jade',
    },
    {
      id: 'medium' as const,
      title: isFa ? 'متعادل (پیشنهادی)' : 'Balanced (Recommended)',
      maxLev: 10,
      dailyLoss: 5.0,
      trailingPct: 2.0,
      detail: isFa ? 'اهرم ۱۰x، تریلینگ ۲٪ + ریسک‌فری خودکار TP1' : 'Max 10x lev · 2% Trailing + Auto BE on TP1',
      color: 'text-goldsoft',
    },
    {
      id: 'high' as const,
      title: isFa ? 'پُرقدرت (Aggressive)' : 'Aggressive',
      maxLev: 20,
      dailyLoss: 10.0,
      trailingPct: 2.8,
      detail: isFa ? 'اهرم ۲۰x، آزادی کامل برای نوسان‌گیری سریع' : 'Max 20x lev · Higher ROI target',
      color: 'text-flame',
    },
  ];

  const strategyOptions = [
    {
      id: 'ai_autonomous_agent' as const,
      title: isFa ? 'ترید هوشمند اتومات با هوش مصنوعی دلارینو' : 'Dollarino Autonomous AI',
      badge: '100% AI',
      detail: isFa ? 'حالت ساده: تحلیل و معامله کاملاً اتومات توسط هوش مصنوعی ۲۴ ساعته' : 'Fully automated 24/7 AI trading',
    },
    {
      id: 'my_custom_ai' as const,
      title: isFa ? 'هوش مصنوعی شخصی من (آموزش‌دیده با چت)' : 'My Trainable Personal AI',
      badge: 'My AI',
      detail: isFa ? 'اجرای استراتژی‌ای که خودتان به هوش مصنوعی خام یاد داده‌اید' : 'Executes rules taught via your personal AI chat',
    },
    {
      id: 'dollarino_v01' as const,
      title: isFa ? 'استراتژی دُرنا V1 (منتخب دلارینو)' : 'Dorna V1 (Dollarino Select)',
      badge: 'دُرنا V1',
      detail: isFa ? 'برترین استراتژی غیرریپینت دلارینو با اسکن همزمان کل بازار' : 'Non-repaint flagship scanning all markets simultaneously',
    },
    {
      id: 'kbos_v11' as const,
      title: 'KBOs Super v11',
      badge: 'ALMA + ATR',
      detail: isFa ? 'کوانت غیرریپینت تایم‌فریم بالا با ۳ تارگت و تریلینگ هوشمند' : 'HTF ALMA crossover + ATR trailing & 3-TP exits',
    },
    {
      id: 'sp2l' as const,
      title: isFa ? 'شکار نقدینگی (SP2L)' : 'Liquidity Sweep (SP2L)',
      badge: '3-TP',
      detail: isFa ? 'شکار نقدینگی و شکست جعلی با ریسک‌فری خودکار' : 'Sweep reversal with Break-Even on TP1',
    },
    {
      id: 'ema_trend_pullback' as const,
      title: isFa ? 'مومنتوم روند (Momentum EMA)' : 'Momentum EMA 20/50',
      badge: 'Trend',
      detail: isFa ? 'ورود دقیق روی پولبک EMA در جهت روند اصلی' : 'HTF trend continuation pullback',
    },
    {
      id: 'signal_mixer' as const,
      title: isFa ? 'میکسر ۸ کاناله (Quant + AI)' : '8-Channel Mixer',
      badge: '8-Ch',
      detail: isFa ? 'امتیازدهی ۸ کاناله تکنیکال + تایید هوشمند' : '8-channel scoring + AI verification',
    },
    {
      id: 'high_20x' as const,
      title: isFa ? 'استراتژی ۲۰× پرشتاب' : 'High ×20 Leverage',
      badge: '20x',
      detail: isFa ? 'ترکیب KBOs v11 با اهرم ۲۰×' : 'KBOs v11 paired with 20x leverage',
    },
  ];

  const selectedRisk = riskOptions.find((r) => r.id === riskLevel) ?? riskOptions[1]!;
  const selectedStrat = strategyOptions.find((s) => s.id === strategyType) ?? strategyOptions[0]!;

  const startAiAgent = async () => {
    setSaving(true);
    setMsg('');
    try {
      const actualKey = strategyType === 'high_20x' ? 'kbos_v11' : strategyType;
      const effLev = strategyType === 'high_20x' ? 20 : selectedRisk.maxLev;

      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          strategy_key: actualKey,
          margin_pct: marginPct,
          max_leverage: effLev,
          daily_max_loss_pct: selectedRisk.dailyLoss,
          trailing_stop_enabled: 1,
          trailing_stop_pct: selectedRisk.trailingPct,
          tp1_close_pct: actualKey === 'kbos_v11' ? 30 : 50,
          tp2_close_pct: actualKey === 'kbos_v11' ? 30 : 25,
          tp3_close_pct: actualKey === 'kbos_v11' ? 40 : 25,
          risk_profile_json: {
            preset: riskLevel === 'low' ? 'conservative' : riskLevel === 'high' ? 'aggressive' : 'balanced',
            allocatedAmount,
            trailingStop: true,
            trailingDistance: selectedRisk.trailingPct,
          },
        }),
      });

      await apiFetch('/api/trading/bot/start', {
        method: 'POST',
        body: JSON.stringify({
          marginPct,
          strategyKey: actualKey,
          riskPreset: riskLevel,
          maxLeverage: effLev,
          trailingStopEnabled: true,
          trailingStopPct: selectedRisk.trailingPct,
          allocatedAmount,
        }),
      });

      await onCompleted();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setSaving(false);
    }
  };

  const saveExchange = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await apiFetch<{ test: { message: string }; activated?: boolean; requiresSubscription?: boolean }>(
        '/api/connections/exchanges',
        {
          method: 'POST',
          body: JSON.stringify({
            provider: exProvider,
            apiKey,
            apiSecret,
            proxyUrl: exProvider === 'toobit' && proxyUrl.trim() ? proxyUrl.trim() : undefined,
            webSessionToken: exProvider === 'kcex' ? kcexSession : undefined,
          }),
        }
      );
      setMsg(
        res.requiresSubscription && !res.activated
          ? isFa
            ? 'کلید ذخیره شد. برای معامله واقعی اشتراک Pro را فعال کنید.'
            : 'Saved. Upgrade to Pro to activate live trading.'
          : res.test?.message || 'Saved'
      );
      await onCompleted();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const stepLabels = [
    isFa ? 'مبلغ سرمایه' : 'Capital',
    isFa ? 'سطح ریسک' : 'Risk',
    isFa ? 'استراتژی' : 'Strategy',
    isFa ? 'تأیید و شروع' : 'Launch',
  ];

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="pop-in panel !bg-[var(--panel)] rounded-[28px] w-full max-w-xl p-6 space-y-5 shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DollarinoBrandMark size={42} glow />
            <div>
              <h3 className="font-display font-bold text-main text-base">
                {isFa ? 'راه‌اندازی گام‌به‌گام ربات دلارینو' : 'Dollarino Setup Wizard'}
              </h3>
              <p className="text-[11px] text-dim">
                {isFa ? 'تنظیم سریع سرمایه، ریسک، استراتژی و اتصال صرافی' : '4-step capital, risk, strategy & exchange deployment'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl btn-ghost text-dim hover:text-main">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl surface-soft text-xs">
          <button
            type="button"
            onClick={() => setTab('agent')}
            className={`py-2.5 rounded-xl font-black flex items-center justify-center gap-1.5 transition ${
              tab === 'agent' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>{isFa ? 'تنظیم ربات معاملاتی' : 'Deploy Trading Bot'}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('vault')}
            className={`py-2.5 rounded-xl font-black flex items-center justify-center gap-1.5 transition ${
              tab === 'vault' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>{isFa ? 'اتصال صرافی واقعی' : 'Connect Exchange'}</span>
          </button>
        </div>

        {tab === 'agent' ? (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {stepLabels.map((lbl, idx) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => setStep(idx)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-bold transition ${
                    step === idx
                      ? 'btn-gold'
                      : idx < step
                        ? 'badge-signal'
                        : 'surface-soft text-dim'
                  }`}
                >
                  {idx + 1}. {lbl}
                </button>
              ))}
            </div>

            {step === 0 && (() => {
              const minAmt = Math.max(50, Math.round(safeAvail * 0.05));
              const maxAmt = Math.max(minAmt + 10, safeAvail);
              const clampedVal = Math.min(maxAmt, Math.max(minAmt, allocatedAmount));
              const sliderFill = Math.round(((clampedVal - minAmt) / (maxAmt - minAmt)) * 100);
              return (
                <div className="space-y-4">
                  <div className="surface-soft rounded-2xl p-4 space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                      <span className="text-dim flex items-center gap-1.5 leading-snug">
                        <Wallet className="w-4 h-4 shrink-0" style={{ color: 'var(--gold)' }} />
                        <span>{isFa ? 'مبلغ درگیر در هر معامله / سبد:' : 'Capital allocated:'}</span>
                      </span>
                      <span
                        dir="ltr"
                        className="font-num font-black text-base sm:text-lg text-main bg-white/5 px-3 py-1 rounded-xl border hairline self-start sm:self-auto shrink-0"
                      >
                        ${allocatedAmount.toLocaleString()} ({marginPct}%)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={minAmt}
                      max={maxAmt}
                      step={Math.max(10, Math.round(safeAvail * 0.02))}
                      value={clampedVal}
                      onChange={(e) => setAllocatedAmount(Number(e.target.value))}
                      className="w-full"
                      style={{ ['--fill' as string]: `${sliderFill}%` }}
                    />
                    <div className="flex gap-2">
                      {[0.1, 0.25, 0.5, 1].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setAllocatedAmount(Math.round(safeAvail * p))}
                          className="flex-1 py-1.5 rounded-xl btn-ghost text-[11px] font-bold"
                        >
                          {Math.round(p * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {step === 1 && (
              <div className="space-y-2.5">
                {riskOptions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRiskLevel(r.id)}
                    className={`w-full p-3.5 rounded-2xl border text-start transition flex items-center justify-between ${
                      riskLevel === r.id ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)]' : 'surface-soft'
                    }`}
                  >
                    <div>
                      <p className={`text-xs font-black ${r.color}`}>{r.title}</p>
                      <p className="text-[11px] text-dim mt-0.5">{r.detail}</p>
                    </div>
                    {riskLevel === r.id && <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--gold)' }} />}
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                {strategyOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStrategyType(s.id)}
                    className={`w-full p-3 rounded-2xl border text-start transition flex items-center justify-between gap-2 ${
                      strategyType === s.id ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)]' : 'surface-soft'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-main">{s.title}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full badge-signal font-bold">{s.badge}</span>
                      </div>
                      <p className="text-[11px] text-dim mt-0.5">{s.detail}</p>
                    </div>
                    {strategyType === s.id && <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--gold)' }} />}
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="surface-soft rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-dim">{isFa ? 'استراتژی:' : 'Strategy:'}</span>
                  <span className="font-bold text-main">{selectedStrat.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">{isFa ? 'ریسک و اهرم:' : 'Risk & Max Lev:'}</span>
                  <span className="font-bold text-jade">
                    {selectedRisk.title} ({strategyType === 'high_20x' ? '20x' : `${selectedRisk.maxLev}x`})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">{isFa ? 'درصد مارجین:' : 'Margin Ratio:'}</span>
                  <span dir="ltr" className="font-num font-bold text-main">{marginPct}%</span>
                </div>
              </div>
            )}

            {msg && <p className="text-xs font-bold text-loss">{msg}</p>}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40"
              >
                <ArrowLeft className={`w-3.5 h-3.5 ${isFa ? 'rotate-180' : ''}`} />
                <span>{isFa ? 'قبلی' : 'Back'}</span>
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(3, s + 1))}
                  className="btn-gold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1"
                >
                  <span>{isFa ? 'مرحله بعد' : 'Next'}</span>
                  <ArrowRight className={`w-3.5 h-3.5 ${isFa ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void startAiAgent()}
                  className="btn-emerald px-6 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5"
                >
                  <Rocket className="w-4 h-4" />
                  <span>{saving ? '...' : isFa ? 'ذخیره و شروع خودکار ربات' : 'Save & Start Bot'}</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'toobit' as const, label: 'Toobit' },
                { id: 'bitunix' as const, label: 'Bitunix' },
                { id: 'kcex' as const, label: 'KCEX' },
              ]).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setExProvider(p.id)}
                  className={`py-2.5 px-2 rounded-xl font-black uppercase inline-flex items-center justify-center gap-1.5 ${
                    exProvider === p.id ? 'btn-gold' : 'btn-ghost text-dim'
                  }`}
                >
                  <ExchangeLogo provider={p.id} size={18} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
            {exProvider === 'kcex' && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 leading-relaxed">
                {isFa
                  ? 'صرافی KCEX در حالت Signal-Mirror بدون نیاز به کلید API اجباری کار می‌کند.'
                  : 'KCEX works in Signal-Mirror mode — API keys are optional.'}
              </p>
            )}
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              dir="ltr"
              placeholder={exProvider === 'kcex' ? 'API Key (Optional)' : 'API Key'}
              className="field font-mono"
            />
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              dir="ltr"
              placeholder={exProvider === 'kcex' ? 'API Secret (Optional)' : 'API Secret'}
              className="field font-mono"
            />
            {exProvider === 'kcex' && (
              <input value={kcexSession} onChange={(e) => setKcexSession(e.target.value)} dir="ltr" placeholder="KCEX Web Token (optional)" className="field font-mono" />
            )}
            {exProvider === 'toobit' && (
              <input value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} dir="ltr" placeholder="Relay Proxy URL (optional)" className="field font-mono" />
            )}
            {msg && <p className="font-bold text-jade">{msg}</p>}
            <button type="button" disabled={saving} onClick={() => void saveExchange()} className="btn-emerald w-full py-3 rounded-xl font-black">
              {saving ? '...' : isFa ? 'اتصال رمزنگاری‌شده به صرافی' : 'Save Encrypted Connection'}
            </button>
            <p className="text-[11px] text-dim flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-jade shrink-0" />
              <span>{isFa ? 'فقط مجوز معامله Futures فعال باشد — برداشت خاموش.' : 'Trade-only API keys — zero withdrawal scope.'}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
