import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { DollarinoBrandMark } from '../components/BrandGraphics';
import type { Lang } from '../lib/i18n';
import type { VerifiedProfitCard } from '../lib/types';

export function VerifyCardPage({ cardId, lang, onBackHome }: { cardId: string; lang: Lang; onBackHome: () => void }) {
  const isFa = lang === 'fa';
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [card, setCard] = useState<VerifiedProfitCard | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/verify-card/${encodeURIComponent(cardId)}`)
      .then(async (r) => {
        const json = (await r.json()) as { valid?: boolean; error?: string; card?: VerifiedProfitCard };
        if (!r.ok || !json.card) {
          setValid(false);
          setErr(json.error || 'Card record not found');
        } else {
          setValid(Boolean(json.valid));
          setCard(json.card);
        }
      })
      .catch(() => setErr('Network verification failure'))
      .finally(() => setLoading(false));
  }, [cardId]);

  return (
    <div className="min-h-screen app-shell flex items-center justify-center p-4">
      <div className="panel rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative overflow-hidden">
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 object-contain opacity-[0.06]"
        />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <DollarinoBrandMark size={36} glow />
            <div>
              <h1 className="text-sm font-black text-main">
                {isFa ? 'استعلام اصالت کارت سود دلارینو' : 'Dollarino Profit Card Verification'}
              </h1>
              <p dir="ltr" className="text-[11px] font-mono-num text-dim">{cardId} · @Dollarino_official</p>
            </div>
          </div>
          <button type="button" onClick={onBackHome} className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1">
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{isFa ? 'بازگشت' : 'Home'}</span>
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-sub">
            {isFa ? 'در حال بررسی امضای رمزنگاری HMAC-SHA256 روی سرور...' : 'Verifying HMAC-SHA256 signature...'}
          </div>
        ) : !card || !valid ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-center space-y-2">
            <ShieldAlert className="w-10 h-10 text-loss mx-auto" />
            <h2 className="text-base font-black text-loss">
              {isFa ? 'کارت نامعتبر یا تاییدنشده' : 'Invalid or Unverified Card'}
            </h2>
            <p className="text-xs text-sub">{err || (isFa ? 'امضای دیجیتال مطابقت ندارد.' : 'Signature mismatch.')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={`rounded-2xl border p-4 flex items-start gap-3 ${
                card.isVerifiedReal ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              {card.isVerifiedReal ? (
                <ShieldCheck className="w-6 h-6 text-jade shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-goldsoft shrink-0" />
              )}
              <div>
                <p className={`text-sm font-black ${card.isVerifiedReal ? 'text-jade' : 'text-goldsoft'}`}>
                  {card.isVerifiedReal
                    ? isFa
                      ? 'تاییدشده: عملکرد واقعی (Live) ثبت‌شده در سرور'
                      : 'VERIFIED: Real Live Settled Performance'
                    : isFa
                      ? 'هشدار: این کارت مربوط به حساب شبیه‌سازی (Simulation) است'
                      : 'SIMULATION: Issued from Simulation Account'}
                </p>
                <p className="text-[11px] text-sub mt-1">
                  {isFa
                    ? 'امضای دیجیتال سرور با داده‌های تسویه‌شده مطابقت کامل دارد.'
                    : 'Cryptographic HMAC-SHA256 signature matches settled D1 ledger.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="surface-soft rounded-2xl p-3">
                <span className="text-dim block">{isFa ? 'تریدر' : 'Trader'}</span>
                <span className="font-black text-main text-sm">{card.displayName}</span>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <span className="text-dim block">{isFa ? 'صرافی و بازه' : 'Exchange & Period'}</span>
                <span className="font-black text-main text-sm">{card.exchangeProvider} · {card.period}</span>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <span className="text-dim block">{isFa ? 'بازده واقعی' : 'Verified ROI'}</span>
                <span dir="ltr" className={`font-display font-bold text-lg ${card.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                  {card.roiPct >= 0 ? '+' : ''}{card.roiPct.toFixed(2)}%
                </span>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <span className="text-dim block">{isFa ? 'سود/زیان خالص' : 'Net PnL'}</span>
                <span dir="ltr" className={`font-display font-bold text-lg ${card.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                  {card.netPnlUsd >= 0 ? '+' : '-'}${Math.abs(card.netPnlUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <span className="text-dim block">{isFa ? 'تعداد معاملات / وین‌ریت' : 'Trades / Win Rate'}</span>
                <span dir="ltr" className="font-mono-num font-bold text-main">
                  {card.tradesCount} · {card.winRate.toFixed(1)}%
                </span>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <span className="text-dim block">Profit Factor</span>
                <span dir="ltr" className="font-mono-num font-bold text-main">{card.profitFactor.toFixed(2)}</span>
              </div>
            </div>

            <div className="surface-soft rounded-2xl p-3 flex items-center justify-between text-[11px] text-dim">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-jade" />
                <span>HMAC-SHA256 Verified</span>
              </span>
              <span dir="ltr" className="font-mono-num">#{card.signaturePrefix}</span>
            </div>
            <div className="text-center text-[11px] text-jade font-bold inline-flex items-center justify-center gap-1 w-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isFa ? 'تاریخ صدور: ' : 'Issued: '}{new Date(card.issuedAt).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
