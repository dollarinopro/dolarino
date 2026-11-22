import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ShieldCheck, X, XCircle } from 'lucide-react';
import type { Lang } from '../lib/i18n';
import { CoinIcon } from './CoinIcon';

export interface PendingTradeConfirmation {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  orderType: 'MARKET' | 'LIMIT';
  marketType?: 'SPOT' | 'FUTURES';
  entryPrice?: string;
  leverage: number;
  amountUsd?: number;
  stopLoss?: string;
  tp1?: string;
  tp2?: string;
  tp3?: string;
  tradingMode: 'PAPER' | 'LIVE';
}

export function ConfirmTradeSheet({
  open,
  lang,
  order,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  lang: Lang;
  order: PendingTradeConfirmation | null;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  if (!open || !order || typeof document === 'undefined') return null;
  const isFa = lang === 'fa';
  const isLong = order.direction === 'LONG';

  return createPortal(
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-md p-4 grid place-items-center overflow-y-auto"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="pop-in w-full max-w-md panel !bg-[var(--panel)] rounded-[32px] p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CoinIcon symbol={order.symbol} size={42} />
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--gold-soft)' }}>
                {isFa ? 'بازبینی نهایی قبل از اجرا' : 'FINAL TRADE REVIEW'} · {order.marketType || 'FUTURES'}
              </p>
              <h3 className="font-display font-bold text-xl text-main">{order.symbol}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="h-9 w-9 grid place-items-center rounded-full btn-ghost"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`rounded-2xl p-4 border flex items-center justify-between ${
            isLong ? 'bg-jade/12 border-jade/30' : 'bg-rose-500/12 border-rose-500/30'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isLong ? <ArrowUpRight className="w-6 h-6 text-jade" /> : <ArrowDownRight className="w-6 h-6 text-loss" />}
            <div>
              <p className={`font-black text-sm ${isLong ? 'text-jade' : 'text-loss'}`}>
                {isLong
                  ? isFa
                    ? 'پیش‌بینی افزایش قیمت (خرید / LONG)'
                    : 'Price Going UP (Buy / LONG)'
                  : isFa
                    ? 'پیش‌بینی کاهش قیمت (فروش / SHORT)'
                    : 'Price Going DOWN (Sell / SHORT)'}
              </p>
              <p className="text-[11px] text-sub">
                {order.tradingMode === 'PAPER'
                  ? isFa
                    ? 'در حساب شبیه‌ساز متصل به قیمت واقعی بازار'
                    : 'Simulated live-quote execution'
                  : isFa
                    ? 'در حساب واقعی صرافی متصل شما'
                    : 'Live Connected Exchange Account'}
              </p>
            </div>
          </div>
          <span dir="ltr" className="font-num font-black text-base px-2.5 py-1 rounded-xl bg-black/20 text-main">
            {order.leverage}×
          </span>
        </div>

        <div className="surface-soft rounded-2xl p-4 space-y-2.5 text-xs">
          {order.entryPrice && (
            <div className="flex items-center justify-between">
              <span className="text-dim">{order.orderType === 'LIMIT' ? (isFa ? 'قیمت سفارش لیمیت' : 'Limit Entry') : isFa ? 'قیمت فعلی بازار' : 'Market Price'}</span>
              <span dir="ltr" className="font-num font-bold text-main">${order.entryPrice}</span>
            </div>
          )}
          {order.amountUsd !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-dim">{isFa ? 'سرمایه درگیر تقریبی' : 'Estimated Margin'}</span>
              <span dir="ltr" className="font-num font-bold text-main">${order.amountUsd.toFixed(0)} USDT</span>
            </div>
          )}
          {order.stopLoss && (
            <div className="flex items-center justify-between">
              <span className="text-dim">{isFa ? 'سپر محافظت خودکار (حد ضرر)' : 'Auto Stop-Loss Protection'}</span>
              <span dir="ltr" className="font-num font-bold text-loss">${order.stopLoss}</span>
            </div>
          )}
          {order.tp1 && (
            <div className="flex items-center justify-between">
              <span className="text-dim">{isFa ? 'تارگت سود اول (ریسک‌فری)' : 'Take Profit 1 (+Break-Even)'}</span>
              <span dir="ltr" className="font-num font-bold text-jade">${order.tp1}</span>
            </div>
          )}
          {(order.tp2 || order.tp3) && (
            <div className="flex items-center justify-between">
              <span className="text-dim">{isFa ? 'تارگت‌های بعدی' : 'TP2 / TP3'}</span>
              <span dir="ltr" className="font-num font-bold text-jade">
                {[order.tp2, order.tp3].filter(Boolean).map((x) => `$${x}`).join(' · ')}
              </span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-dim flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-jade shrink-0" />
          <span>
            {isFa
              ? 'تا زمانی که دکمه سبز پایین را نزنید، هیچ سفارشی ثبت نمی‌شود.'
              : 'No order is placed until you explicitly tap Confirm below.'}
          </span>
        </p>

        <div className="grid grid-cols-[1fr_1.4fr] gap-2.5">
          <button type="button" onClick={onCancel} className="btn-ghost py-3.5 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-1.5">
            <XCircle className="w-4 h-4 text-loss" />
            <span>{isFa ? 'نه، منصرف شدم' : 'Cancel'}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="btn-emerald py-3.5 rounded-2xl text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{busy ? '...' : isFa ? 'تایید می‌کنم' : 'Confirm'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
