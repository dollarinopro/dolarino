import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  Eye,
  Gift,
  ImagePlus,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { buildTrustWalletDappOpenUrl, sendBep20UsdtViaTrustWallet } from '../lib/trustwallet';
import { ExchangeLogo, WalletLogo } from '../components/BrandLogos';
import { compressChartImageFile } from '../components/FloatingAiChat';

export interface UserEntitlement {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  status: string;
  allowPaperDemo: boolean;
  allowAiTrading: boolean;
  allowCodexbot: boolean;
  allowCopyTrade: boolean;
  allowLiveTrading: boolean;
  daysRemaining: number;
  expiresAt: string | null;
  subscriptionRequired: boolean;
}

interface PlanRow {
  code: string;
  name_fa: string;
  name_en: string;
  description_fa: string | null;
  description_en: string | null;
  price_usd: number;
  price_toman: number;
  duration_days: number;
  features_json: string;
  is_popular: number;
}

interface SubOrder {
  id: string;
  plan_code: string;
  name_fa?: string;
  name_en?: string;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  receipt_image_url?: string | null;
  amount_usd: number;
  admin_note: string | null;
  expires_at: string | null;
  created_at: string;
}

export function SubscriptionPage({
  lang,
  onRefreshDashboard,
}: {
  lang: Lang;
  onRefreshDashboard: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [entitlement, setEntitlement] = useState<UserEntitlement | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [payCfg, setPayCfg] = useState<Record<string, string>>({});
  const [selectedPlan, setSelectedPlan] = useState<PlanRow | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'TRUST_WALLET_BEP20' | 'USDT_TRC20' | 'CARD_TO_CARD'>('USDT_TRC20');
  const [paymentRef, setPaymentRef] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [lightboxReceipt, setLightboxReceipt] = useState<string | null>(null);
  const [payerNote, setPayerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemUsd, setRedeemUsd] = useState('5');
  const [wdAmount, setWdAmount] = useState('10');
  const [wdNetwork, setWdNetwork] = useState<'BEP20' | 'TRC20'>('BEP20');
  const [wdWallet, setWdWallet] = useState('');
  const [refBusy, setRefBusy] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutRef = useRef<HTMLDivElement | null>(null);
  const [referral, setReferral] = useState<{
    referralCode: string;
    inviteUrl?: string;
    telegramInviteUrl?: string;
    tier?: 'BRONZE' | 'SILVER' | 'GOLD' | string;
    commissionPct?: number;
    renewalPct?: number;
    balanceUsd?: number;
    totalEarnedUsd?: number;
    totalReferred: number;
    qualifiedReferred?: number;
    flaggedCount?: number;
    rewardDaysEarned: number;
    referrals: Array<{
      id?: string;
      username: string;
      reward_days?: number;
      commission_usd?: number;
      status?: string;
      fraud_flag?: number;
      phone_verified?: boolean;
      created_at: string;
    }>;
    withdrawals?: Array<{
      id: string;
      amount_usd: number;
      target_type: string;
      wallet_address?: string | null;
      network?: string | null;
      status: string;
      tx_hash?: string | null;
      admin_note?: string | null;
      created_at: string;
    }>;
  } | null>(null);

  const loadData = async () => {
    const [res, refRes] = await Promise.all([
      apiFetch<{
        entitlement: UserEntitlement;
        plans: PlanRow[];
        orders: SubOrder[];
        paymentConfig: Record<string, string>;
      }>('/api/subscriptions/me'),
      apiFetch<NonNullable<typeof referral>>('/api/subscriptions/referrals').catch(() => null),
    ]);
    setEntitlement(res.entitlement);
    setPlans(res.plans);
    setOrders(res.orders);
    setPayCfg(res.paymentConfig);
    if (refRes) setReferral(refRes);
    if (!selectedPlan) {
      const def = res.plans.find((p) => p.code === 'pro_monthly') || res.plans.find((p) => p.price_usd > 0) || null;
      setSelectedPlan(def);
    }
  };

  const handleRedeemRefBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefBusy(true);
    setMsg(null);
    try {
      const amt = Number(redeemUsd || 0);
      const r = await apiFetch<{ ok: boolean; convertedUsd: number; daysGranted: number }>('/api/subscriptions/referrals/redeem-balance', {
        method: 'POST',
        body: JSON.stringify({ amountUsd: amt }),
      });
      setMsg(
        isFa
          ? `$${r.convertedUsd.toFixed(2)} از موجودی رفرال شما تبدیل به +${r.daysGranted} روز اشتراک پرو شد!`
          : `Converted $${r.convertedUsd.toFixed(2)} referral balance to +${r.daysGranted} Pro days!`
      );
      await loadData();
      await onRefreshDashboard();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Redeem failed');
    } finally {
      setRefBusy(false);
    }
  };

  const handleWithdrawRef = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefBusy(true);
    setMsg(null);
    try {
      const amt = Number(wdAmount || 0);
      const r = await apiFetch<{ ok: boolean; withdrawalId: string }>('/api/subscriptions/referrals/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amountUsd: amt,
          network: wdNetwork,
          walletAddress: wdWallet.trim(),
        }),
      });
      setWdWallet('');
      setMsg(
        isFa
          ? `درخواست برداشت $${amt.toFixed(2)} USDT (${wdNetwork}) ثبت شد (کد پیگیری: ${r.withdrawalId}). پس از تایید امنیتی ادمین واریز می‌شود.`
          : `Withdrawal request $${amt.toFixed(2)} USDT (${wdNetwork}) submitted (#${r.withdrawalId}).`
      );
      await loadData();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setRefBusy(false);
    }
  };

  const redeemGift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftCode.trim()) return;
    setRedeeming(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ ok: boolean; durationDays: number; expiresAt: string }>('/api/subscriptions/redeem-gift', {
        method: 'POST',
        body: JSON.stringify({ code: giftCode.trim() }),
      });
      setGiftCode('');
      setMsg(
        isFa
          ? `کد هدیه فعال شد! ${r.durationDays} روز اشتراک به حساب شما اضافه گردید.`
          : `Gift code redeemed! +${r.durationDays} days added to your subscription.`
      );
      await loadData();
      await onRefreshDashboard();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Gift code invalid');
    } finally {
      setRedeeming(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const copyText = (val: string, key: string) => {
    void navigator.clipboard?.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  };

  const handleReceiptFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg(isFa ? 'فقط تصویر معتبر (PNG/JPG/WebP) به عنوان عکس رسید پذیرفته می‌شود.' : 'Please select a valid receipt image.');
      return;
    }
    try {
      const compressed = await compressChartImageFile(file);
      setReceiptImage(compressed);
      setMsg(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Receipt upload failed');
    }
  };

  const submitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || selectedPlan.price_usd <= 0) return;
    if (!receiptImage && paymentRef.trim().length < 5) {
      setMsg(isFa ? 'لطفاً عکس رسید واریز را آپلود کنید یا کد پیگیری / TXID وارد نمایید.' : 'Please upload a receipt photo or enter a TXID.');
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; autoVerified?: boolean; message?: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planCode: selectedPlan.code,
          paymentMethod,
          paymentReference: paymentRef.trim(),
          receiptImageDataUrl: receiptImage,
          payerNote: payerNote.trim(),
        }),
      });
      setPaymentRef('');
      setReceiptImage(null);
      setPayerNote('');
      setMsg(
        res.autoVerified
          ? isFa
            ? 'تراکنش بلاک‌چین تایید خودکار شد و اشتراک شما هم‌اکنون فعال گردید!'
            : 'Blockchain transaction auto-verified! Your subscription is now ACTIVE.'
          : res.message ||
            (isFa
              ? 'پرداخت و رسید شما با موفقیت ثبت شد! پس از تایید سریع مدیریت، اشتراک شما فعال می‌شود.'
              : 'Payment submitted! Once verified by admin, your Pro/VIP license activates immediately.')
      );
      await loadData();
      await onRefreshDashboard();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInstantTrustWalletPay = async () => {
    if (!selectedPlan || selectedPlan.price_usd <= 0) return;
    const toAddr = (payCfg.trust_wallet_evm_receiver || '').trim();
    if (!toAddr || !toAddr.startsWith('0x')) {
      setMsg(
        isFa
          ? 'آدرس دریافت BEP20 در پنل ادمین تنظیم نشده است. لطفاً روش TRC20 یا کارت به کارت را انتخاب کنید.'
          : 'Platform BEP20 receiver address is not configured yet.'
      );
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const txHash = await sendBep20UsdtViaTrustWallet({ toAddress: toAddr, amountUsdt: selectedPlan.price_usd });
      setPaymentRef(txHash);
      const res = await apiFetch<{ ok?: boolean; autoVerified?: boolean; message?: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planCode: selectedPlan.code,
          paymentMethod: 'TRUST_WALLET_BEP20',
          paymentReference: txHash,
          payerNote: 'Instant Trust Wallet DApp Pay',
        }),
      });
      setMsg(
        res.autoVerified
          ? isFa
            ? `پرداخت Trust Wallet با TX ${txHash.slice(0, 12)}... تایید آن‌چین شد و اشتراک فعال گردید!`
            : `Trust Wallet payment verified on-chain (${txHash.slice(0, 12)}...)!`
          : res.message ||
            (isFa
              ? `تراکنش ${txHash.slice(0, 12)}... ارسال و ثبت شد! پس از تایید بلاک BSC اشتراک فوراً فعال می‌شود.`
              : `Transaction submitted (${txHash.slice(0, 12)}...).`)
      );
      await loadData();
      await onRefreshDashboard();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'NO_INJECTED_WALLET') {
        window.open(buildTrustWalletDappOpenUrl(`${window.location.origin}/?tab=pricing`), '_blank', 'noopener,noreferrer');
        setMsg(
          isFa
            ? 'در مرورگر فعلی افزونه کیف‌پول یافت نشد؛ صفحه در اپلیکیشن Trust Wallet DApp باز می‌شود یا پس از واریز، هش تراکنش (TXID) را ثبت کنید.'
            : 'Opening inside Trust Wallet DApp Browser...'
        );
      } else {
        setMsg(code || 'Trust Wallet payment cancelled');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero License Banner */}
      <div className="hero-cobalt p-6 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <img
            src="/images/vip-club-banner.png"
            alt="Dollarino VIP Subscriptions"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border border-white/20 shadow-lg shrink-0 mx-auto sm:mx-0"
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Crown className={`w-5 h-5 ${entitlement?.hasPaidPlan ? 'text-[#55ff94]' : 'text-[#fde047]'}`} />
              <h1 className="text-lg font-black">
                {isFa ? entitlement?.planNameFa || 'وضعیت اشتراک' : entitlement?.planNameEn || 'Subscription Status'}
              </h1>
              <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-white/15">
                {entitlement?.hasPaidPlan
                  ? isFa
                    ? `فعال · ${entitlement.daysRemaining} روز`
                    : `ACTIVE · ${entitlement.daysRemaining}d`
                  : isFa
                    ? 'بدون اشتراک فعال'
                    : 'Subscription Required'}
              </span>
            </div>
            <p className="text-xs text-white/85 mt-1.5 leading-relaxed max-w-2xl">
              {entitlement?.hasPaidPlan
                ? isFa
                  ? 'دسترسی کامل به ترید هوشمند اتومات، هوش مصنوعی من، کپی‌ترید تاییدشده، استراتژی شخصی و صرافی‌های Toobit، Bitunix و KCEX فعال است.'
                  : 'Full access unlocked: Auto AI Trading, My Trainable AI, Verified Copy-Trade, Custom IDE & Live Toobit/Bitunix/KCEX.'
                : isFa
                  ? 'برای استفاده از ترید هوشمند، هوش مصنوعی من، کپی‌ترید تاییدشده و استراتژی شخصی، ابتدا یکی از اشتراک‌های زیر را انتخاب و فعال کنید.'
                  : 'Activate a subscription plan below to unlock Auto AI Trading, My AI, Verified Copy-Trade, and Custom Strategies.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { ok: entitlement?.hasPaidPlan, label: isFa ? 'ترید هوشمند اتومات AI' : 'Auto AI Trading' },
            { ok: entitlement?.allowAiTrading, label: isFa ? 'هوش مصنوعی من' : 'My Trainable AI' },
            { ok: entitlement?.allowCopyTrade, label: isFa ? 'کپی‌ترید تاییدشده' : 'Verified Copy-Trade' },
            { ok: entitlement?.allowLiveTrading, label: isFa ? 'صرافی Toobit / Bitunix / KCEX' : 'Live Toobit / Bitunix / KCEX' },
          ].map((e) => (
            <span
              key={e.label}
              className={`px-3 py-1 rounded-xl inline-flex items-center gap-1 font-bold ${
                e.ok ? 'bg-[#059669] text-white shadow' : 'bg-white/10 text-white/60'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {e.label}
            </span>
          ))}
        </div>
      </div>

      {msg && (
        <div className="surface-card p-4 border-brand text-xs text-main font-semibold">
          {msg}
        </div>
      )}

      {/* Paid & Free Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.filter((p) => p.price_usd > 0).map((p) => {
          let feats: string[] = [];
          try {
            feats = JSON.parse(p.features_json) as string[];
          } catch {
            feats = [];
          }
          const isSelected = selectedPlan?.code === p.code;
          const isCurrent = entitlement?.planCode === p.code;

          return (
            <div
              key={p.code}
              className={`p-6 rounded-3xl flex flex-col justify-between gap-4 transition ${
                p.is_popular ? 'hero-cobalt text-white' : 'surface-card'
              } ${isSelected && !p.is_popular ? 'ring-2 ring-[#1464F6]' : ''}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-black text-base ${p.is_popular ? 'text-white' : 'text-main'}`}>
                    {isFa ? p.name_fa : p.name_en}
                  </span>
                  {p.is_popular ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">
                      {isFa ? 'محبوب‌ترین' : 'POPULAR'}
                    </span>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-baseline gap-2 font-mono-num">
                    <span className={`text-3xl font-black ${p.is_popular ? 'text-white' : 'text-main'}`}>
                      ${p.price_usd}
                    </span>
                    <span className={`text-xs ${p.is_popular ? 'text-white/75' : 'text-dim'}`}>
                      / {p.duration_days} {isFa ? 'روز' : 'days'}
                    </span>
                  </div>
                  {p.price_toman > 0 && (
                    <p className={`text-xs font-extrabold mt-1 ${p.is_popular ? 'text-[#7dffb0]' : 'text-signal'}`}>
                      {p.price_toman.toLocaleString()} {isFa ? 'تومان' : 'Toman'}
                    </p>
                  )}
                </div>

                <p className={`text-xs leading-relaxed ${p.is_popular ? 'text-white/85' : 'text-sub'}`}>
                  {isFa ? p.description_fa : p.description_en}
                </p>

                <ul className={`space-y-2 pt-3 border-t text-xs ${p.is_popular ? 'border-white/20' : ''}`}>
                  {feats.map((f, i) => (
                    <li key={i} className={`flex items-start gap-2 ${p.is_popular ? 'text-white' : 'text-sub'}`}>
                      <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${p.is_popular ? 'text-[#55ff94]' : 'text-signal'}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => {
                  setSelectedPlan(p);
                  setTimeout(() => checkoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
                }}
                className={`w-full py-3 rounded-2xl font-extrabold text-xs transition ${
                  p.is_popular
                    ? 'bg-[#059669] hover:bg-[#047857] text-white shadow'
                    : isSelected
                      ? 'btn-emerald'
                      : 'btn-cobalt'
                }`}
              >
                {isSelected
                  ? isFa ? 'انتخاب‌شده برای پرداخت ↓' : 'Selected ↓'
                  : isCurrent
                    ? isFa ? 'تمدید این پلن' : 'Renew Plan'
                    : isFa ? 'خرید و فعال‌سازی اشتراک' : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Gift Code + Referral Invite Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <form onSubmit={redeemGift} className="panel rounded-[26px] p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl btn-gold grid place-items-center shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-main">
                {isFa ? 'کد هدیه یا تخفیف دارید؟' : 'Have a Gift Code?'}
              </h3>
              <p className="text-[11px] text-dim">
                {isFa ? 'کد را وارد کنید تا اشتراک شما فوراً فعال شود' : 'Redeem your instant activation code'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={giftCode}
              onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
              placeholder="DLRXXXXXX"
              dir="ltr"
              className="field font-mono-num text-xs flex-1"
            />
            <button
              type="submit"
              disabled={redeeming || !giftCode.trim()}
              className="btn-emerald px-4 py-2.5 rounded-xl text-xs font-black shrink-0"
            >
              {redeeming ? '...' : isFa ? 'فعالسازی' : 'Redeem'}
            </button>
          </div>
        </form>

        <div className="panel rounded-[26px] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl btn-cobalt grid place-items-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold text-sm text-main">
                    {isFa ? 'باشگاه همکاران رفرال دلارینو' : 'Dollarino Partner & Referral Hub'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-400">
                    {referral?.tier || 'BRONZE'} · {referral?.commissionPct ?? 15}%
                  </span>
                </div>
                <p className="text-[11px] text-dim">
                  {isFa
                    ? `${referral?.qualifiedReferred ?? 0} خرید موفق از ${referral?.totalReferred ?? 0} دعوت · +${referral?.rewardDaysEarned ?? 0} روز هدیه`
                    : `${referral?.qualifiedReferred ?? 0}/${referral?.totalReferred ?? 0} qualified · +${referral?.rewardDaysEarned ?? 0} bonus days`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              dir="ltr"
              value={
                referral?.inviteUrl ||
                (typeof window !== 'undefined' && referral?.referralCode
                  ? `${window.location.origin}/?ref=${referral.referralCode}`
                  : 'Loading...')
              }
              className="field font-mono-num text-xs flex-1"
            />
            <button
              type="button"
              onClick={() =>
                copyText(
                  referral?.inviteUrl ||
                    (typeof window !== 'undefined' && referral?.referralCode
                      ? `${window.location.origin}/?ref=${referral.referralCode}`
                      : ''),
                  'ref'
                )
              }
              className="btn-cobalt px-3.5 py-2.5 rounded-xl text-xs font-black shrink-0 inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied === 'ref' ? (isFa ? 'کپی شد!' : 'Copied!') : isFa ? 'لینک وب' : 'Web Link'}</span>
            </button>
            {referral?.telegramInviteUrl && (
              <button
                type="button"
                onClick={() => copyText(referral.telegramInviteUrl || '', 'reftg')}
                className="btn-gold px-3 py-2.5 rounded-xl text-xs font-black shrink-0 inline-flex items-center gap-1"
                title={isFa ? 'کپی لینک مستقیم ربات تلگرام' : 'Copy Telegram Invite'}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{copied === 'reftg' ? (isFa ? 'کپی شد!' : 'Copied!') : isFa ? 'لینک تلگرام' : 'TG'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Tiered Referral Cashout, Subscription Conversion & Anti-Abuse Dashboard */}
      {referral && (
        <div className="panel rounded-[28px] p-5 sm:p-6 space-y-5 border border-blue-500/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl btn-gold grid place-items-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base text-main">
                  {isFa ? 'کسب درآمد دلاری و مدیریت کمیسیون دعوت دوستان' : 'Referral Earnings, Tiers & Instant Cashout'}
                </h2>
                <p className="text-xs text-sub">
                  {isFa
                    ? 'برنز (۱۵٪) → نقره‌ای در ۵ خرید موفق (۱۸٪) → طلایی در ۱۵ خرید موفق (۲۲٪) + ۱۰٪ پورسانت تمدیدها + ۷ روز اشتراک هدیه'
                    : 'Bronze (15%) → Silver @ 5 paid (18%) → Gold @ 15 paid (22%) + 10% renewals + 7 Pro days per friend'}
                </p>
              </div>
            </div>
            {(referral.flaggedCount ?? 0) > 0 && (
              <span className="px-3 py-1 rounded-full bg-rose-500/15 text-loss text-[11px] font-black inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {isFa ? `${referral.flaggedCount} دعوت مسدودشده ضدتقلب` : `${referral.flaggedCount} flagged duplicate`}
                </span>
              </span>
            )}
          </div>

          {/* 3 KPI Stat Cards + Tier Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="surface-soft rounded-2xl p-3.5 border hairline">
              <span className="text-[10.5px] text-dim block">{isFa ? 'موجودی قابل برداشت' : 'Available Balance'}</span>
              <strong dir="ltr" className="font-num text-xl font-black text-jade">
                ${(referral.balanceUsd ?? 0).toFixed(2)}
              </strong>
            </div>
            <div className="surface-soft rounded-2xl p-3.5 border hairline">
              <span className="text-[10.5px] text-dim block">{isFa ? 'مجموع درآمد تا امروز' : 'Total Earned'}</span>
              <strong dir="ltr" className="font-num text-xl font-black text-main">
                ${(referral.totalEarnedUsd ?? 0).toFixed(2)}
              </strong>
            </div>
            <div className="surface-soft rounded-2xl p-3.5 border hairline">
              <span className="text-[10.5px] text-dim block">{isFa ? 'سطح همکاری شما' : 'Partner Tier'}</span>
              <strong className="text-base font-black text-[var(--gold)]">
                {referral.tier || 'BRONZE'} · {referral.commissionPct ?? 15}%
              </strong>
            </div>
            <div className="surface-soft rounded-2xl p-3.5 border hairline">
              <span className="text-[10.5px] text-dim block">
                {isFa ? 'پیشرفت تا سطح بعدی' : 'Next Tier Progress'}
              </span>
              {(() => {
                const q = referral.qualifiedReferred ?? 0;
                const nextTarget = q >= 15 ? 15 : q >= 5 ? 15 : 5;
                const pct = Math.min(100, Math.round((q / nextTarget) * 100));
                return (
                  <div className="space-y-1.5 mt-1">
                    <div className="flex justify-between font-num text-[11px] font-bold">
                      <span>{q >= 15 ? (isFa ? 'حداکثر سطح طلایی!' : 'Max Gold!') : `${q} / ${nextTarget}`}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-black/25 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#1652F0] to-[#F5B731]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* 2 Action Forms: Convert to Pro Days OR Withdraw USDT */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <form onSubmit={handleRedeemRefBalance} className="surface-soft rounded-2xl p-4 space-y-3 border hairline">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#0D9455]" />
                  <span>{isFa ? 'تبدیل آنی کمیسیون به اشتراک پرو' : 'Convert Commission to Pro Days'}</span>
                </h4>
                <span className="text-[10px] text-dim">{isFa ? 'هر ۱ دلار = ۲ روز اشتراک (حداقل ۵$)' : '$1 = 2 Pro days (min $5)'}</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.5"
                  min={5}
                  value={redeemUsd}
                  onChange={(e) => setRedeemUsd(e.target.value)}
                  dir="ltr"
                  className="field font-num flex-1"
                  placeholder="5.00"
                />
                <button
                  type="submit"
                  disabled={refBusy || (referral.balanceUsd ?? 0) < 5}
                  className="btn-emerald px-4 py-2 rounded-xl font-black shrink-0 disabled:opacity-50"
                >
                  {isFa ? `دریافت +${Math.max(10, Math.round(Number(redeemUsd || 5) * 2))} روز Pro` : 'Redeem Pro'}
                </button>
              </div>
            </form>

            <form onSubmit={handleWithdrawRef} className="surface-soft rounded-2xl p-4 space-y-3 border hairline">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-[var(--gold)]" />
                  <span>{isFa ? 'درخواست برداشت نقدی USDT (حداقل ۱۰$)' : 'Withdraw Commission (USDT · Min $10)'}</span>
                </h4>
                <span className="text-[10px] text-amber-400 font-bold">{isFa ? 'نیازمند تایید شماره تلگرام' : 'Phone KYC Required'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={wdNetwork}
                  onChange={(e) => setWdNetwork(e.target.value as 'BEP20' | 'TRC20')}
                  className="field"
                >
                  <option value="BEP20">BEP20 (Trust Wallet)</option>
                  <option value="TRC20">TRC20 (Tron USDT)</option>
                </select>
                <input
                  type="number"
                  step="1"
                  min={10}
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                  dir="ltr"
                  placeholder="10"
                  className="field font-num"
                />
                <button
                  type="submit"
                  disabled={refBusy || (referral.balanceUsd ?? 0) < 10}
                  className="btn-gold py-2 rounded-xl font-black disabled:opacity-50"
                >
                  {isFa ? 'ثبت برداشت' : 'Request Payout'}
                </button>
              </div>
              <input
                required
                dir="ltr"
                value={wdWallet}
                onChange={(e) => setWdWallet(e.target.value)}
                placeholder={wdNetwork === 'BEP20' ? '0x... (BSC / Trust Wallet Address)' : 'T... (TRC20 Address)'}
                className="field font-mono-num w-full"
              />
            </form>
          </div>

          {/* Security Rule Banner + Referral & Withdrawal Logs */}
          <div className="rounded-2xl bg-blue-500/10 border border-blue-500/25 px-3.5 py-2.5 text-[11px] text-sub flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1652F0] shrink-0 mt-0.5" />
            <span>
              {isFa
                ? 'سپر ضدسوءاستفاده دلارینو: دعوت از خود، ساخت اکانت تکراری روی یک دستگاه/شماره/کیف‌پول یا استفاده از کد هدیه رایگان پورسانت نقدی آزاد نمی‌کند. پورسانت تنها پس از پرداخت تاییدشده و واقعی فعال می‌شود.'
                : 'Anti-Abuse Shield: Self-referrals, duplicate devices/phones/wallets, and $0 gift redemptions never unlock cash commissions. Only verified paid orders earn USD rewards.'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <h4 className="font-black text-main">{isFa ? `دوستان دعوت‌شده (${referral.referrals.length})` : `Invited Users (${referral.referrals.length})`}</h4>
              <div className="max-h-44 overflow-y-auto space-y-1.5">
                {referral.referrals.length === 0 ? (
                  <p className="text-dim py-3">{isFa ? 'هنوز کاربری با لینک شما ثبت‌نام نکرده است.' : 'No referrals yet.'}</p>
                ) : (
                  referral.referrals.map((r, idx) => (
                    <div key={r.id || idx} className="surface-soft rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-main" dir="ltr">{r.username}</span>
                        <span className="text-[10px] text-dim block">{r.created_at.slice(0, 10)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {Number(r.commission_usd || 0) > 0 && (
                          <span dir="ltr" className="font-num font-black text-jade">+${Number(r.commission_usd).toFixed(2)}</span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9.5px] font-black ${
                            r.status === 'REWARDED'
                              ? 'badge-signal'
                              : r.status === 'FLAGGED_DUPLICATE'
                                ? 'bg-rose-500/15 text-loss'
                                : 'bg-white/10 text-dim'
                          }`}
                        >
                          {r.status === 'REWARDED'
                            ? isFa ? 'پورسانت واریز شد' : 'Rewarded'
                            : r.status === 'FLAGGED_DUPLICATE'
                              ? isFa ? 'تکراری/مسدود' : 'Flagged'
                              : isFa ? 'در انتظار خرید' : 'Pending Pay'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-black text-main">
                {isFa ? `تاریخچه تسویه و برداشت‌ها (${referral.withdrawals?.length || 0})` : `Payout & Redemption History (${referral.withdrawals?.length || 0})`}
              </h4>
              <div className="max-h-44 overflow-y-auto space-y-1.5">
                {!referral.withdrawals || referral.withdrawals.length === 0 ? (
                  <p className="text-dim py-3">{isFa ? 'هنوز برداشتی ثبت نکرده‌اید.' : 'No payouts yet.'}</p>
                ) : (
                  referral.withdrawals.map((w) => (
                    <div key={w.id} className="surface-soft rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-num font-black text-main">
                          ${Number(w.amount_usd).toFixed(2)} · {w.target_type === 'SUBSCRIPTION_CREDIT' ? (isFa ? 'تبدیل به Pro' : 'Pro Credit') : w.network}
                        </div>
                        {w.wallet_address && (
                          <div dir="ltr" className="text-[10px] text-dim font-mono truncate max-w-[200px]">
                            {w.wallet_address}
                          </div>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-black shrink-0 ${
                          w.status === 'APPROVED'
                            ? 'badge-signal'
                            : w.status === 'REJECTED'
                              ? 'bg-rose-500/15 text-loss'
                              : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Step-by-Step Simplified Checkout Panel */}
      {selectedPlan && selectedPlan.price_usd > 0 && (
        <div ref={checkoutRef} className="surface-card p-5 sm:p-6 space-y-5 border-brand/30">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b hairline">
            <div className="space-y-0.5">
              <h2 className="text-base sm:text-lg font-black text-main flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand" />
                <span>
                  {isFa
                    ? `تکمیل خرید پلن ${selectedPlan.name_fa}`
                    : `Checkout: ${selectedPlan.name_en}`}
                </span>
              </h2>
              <p className="text-xs text-sub">
                {isFa
                  ? `مبلغ قابل پرداخت: $${selectedPlan.price_usd} تتر یا ${selectedPlan.price_toman.toLocaleString()} تومان`
                  : `Total: $${selectedPlan.price_usd} USDT or ${selectedPlan.price_toman.toLocaleString()} Toman`}
              </p>
            </div>
            <span className="text-[11px] px-3 py-1 rounded-full surface-soft border hairline text-sub font-bold">
              {isFa
                ? `پشتیبانی رسمی: ${payCfg.telegram_support && !/Dollarino_admin/i.test(payCfg.telegram_support) ? payCfg.telegram_support : '@Dollarino_bot'}`
                : `Support Bot: ${payCfg.telegram_support && !/Dollarino_admin/i.test(payCfg.telegram_support) ? payCfg.telegram_support : '@Dollarino_bot'}`}
            </span>
          </div>

          {/* Step 1: Select Payment Method */}
          <div className="space-y-2">
            <p className="text-xs font-black text-main">
              {isFa ? '۱) روش پرداخت را انتخاب کنید:' : '1) Choose Payment Method:'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              <button
                type="button"
                onClick={() => setPaymentMethod('USDT_TRC20')}
                className={`p-3.5 rounded-2xl border text-start flex items-center gap-3 transition ${
                  paymentMethod === 'USDT_TRC20' ? 'btn-emerald ring-2 ring-emerald-400/40' : 'surface-soft text-sub hover:border-[var(--line-strong)]'
                }`}
              >
                <Wallet className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-extrabold">{isFa ? 'تتر (USDT · TRC20)' : 'Tether USDT (TRC20)'}</div>
                  <div className="text-[11px] opacity-90">${selectedPlan.price_usd} USDT</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('TRUST_WALLET_BEP20')}
                className={`p-3.5 rounded-2xl border text-start flex items-center gap-3 transition ${
                  paymentMethod === 'TRUST_WALLET_BEP20' ? 'btn-gold ring-2 ring-blue-400/40' : 'surface-soft text-sub hover:border-[var(--line-strong)]'
                }`}
              >
                <WalletLogo wallet="trustwallet" size={26} />
                <div>
                  <div className="font-extrabold">Trust Wallet (BEP20)</div>
                  <div className="text-[11px] opacity-90">${selectedPlan.price_usd} USDT · {isFa ? 'کارمزد خیلی کم' : 'Low fee'}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CARD_TO_CARD')}
                className={`p-3.5 rounded-2xl border text-start flex items-center gap-3 transition ${
                  paymentMethod === 'CARD_TO_CARD' ? 'btn-cobalt ring-2 ring-blue-400/40' : 'surface-soft text-sub hover:border-[var(--line-strong)]'
                }`}
              >
                <CreditCard className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-extrabold">{isFa ? 'کارت به کارت (تومانی)' : 'Card-to-Card (Toman)'}</div>
                  <div className="text-[11px] opacity-90">{selectedPlan.price_toman.toLocaleString()} {isFa ? 'تومان' : 'Toman'}</div>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Copy Address / Card or Pay Direct */}
          <div className="space-y-2">
            <p className="text-xs font-black text-main">
              {isFa ? '۲) مبلغ را به مقصد زیر واریز کنید:' : '2) Transfer to the destination below:'}
            </p>
            <div className="p-4 rounded-2xl surface-soft border border-[var(--line-strong)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              {paymentMethod === 'TRUST_WALLET_BEP20' ? (
                <div className="space-y-1 min-w-0">
                  <div className="text-sub font-bold">{isFa ? 'آدرس ولت BEP20 (شبکه بایننس اسمارت چین):' : 'USDT BEP20 Address:'}</div>
                  <div className="font-mono-num text-sm sm:text-base font-black text-main break-all select-all" dir="ltr">
                    {payCfg.trust_wallet_evm_receiver || (isFa ? 'هنوز در پنل ادمین تنظیم نشده' : 'Set trust_wallet_evm_receiver in Admin')}
                  </div>
                </div>
              ) : paymentMethod === 'USDT_TRC20' ? (
                <div className="space-y-1 min-w-0">
                  <div className="text-sub font-bold">{isFa ? 'آدرس ولت تتر TRC20:' : 'USDT TRC20 Address:'}</div>
                  <div className="font-mono-num text-sm sm:text-base font-black text-main break-all select-all" dir="ltr">
                    {payCfg.usdt_trc20_wallet || 'Set USDT wallet in Admin Panel'}
                  </div>
                </div>
              ) : (
                <div className="space-y-1 min-w-0">
                  <div className="text-sub font-bold">
                    {isFa ? `شماره کارت به نام «${payCfg.iran_card_holder || 'مدیریت دلارینو'}»:` : `Card (${payCfg.iran_card_holder || 'Admin'}):`}
                  </div>
                  <div className="font-mono-num text-base sm:text-lg font-black text-main tracking-wider select-all" dir="ltr">
                    {payCfg.iran_card_number || '6037-9975-0000-0000'}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 shrink-0">
                {paymentMethod === 'TRUST_WALLET_BEP20' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleInstantTrustWalletPay()}
                    className="px-4 py-2.5 rounded-xl btn-gold font-black inline-flex items-center gap-1.5"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>{isFa ? 'پرداخت خودکار Trust Wallet' : 'Instant Trust Wallet Pay'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      paymentMethod === 'TRUST_WALLET_BEP20'
                        ? payCfg.trust_wallet_evm_receiver || ''
                        : paymentMethod === 'USDT_TRC20'
                          ? payCfg.usdt_trc20_wallet || ''
                          : payCfg.iran_card_number || '',
                      'addr'
                    )
                  }
                  className="px-4 py-2.5 rounded-xl btn-cobalt font-black inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied === 'addr' ? (isFa ? 'کپی شد ✓' : 'Copied ✓') : isFa ? 'کپی مقصد' : 'Copy Address'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 3: Upload Receipt Photo and/or Enter Tracking Code */}
          <form onSubmit={submitCheckout} className="space-y-4">
            <p className="text-xs font-black text-main">
              {isFa ? '۳) عکس رسید واریزی را بفرستید یا کد پیگیری را وارد کنید:' : '3) Upload receipt photo and/or enter TXID:'}
            </p>

            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                void handleReceiptFile(file);
              }}
            />

            {!receiptImage ? (
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                className="w-full p-5 rounded-2xl border-2 border-dashed border-[var(--line-strong)] hover:border-[var(--gold)] bg-[var(--soft)]/60 flex flex-col items-center justify-center gap-2 text-center transition"
              >
                <div className="h-11 w-11 rounded-2xl bg-[var(--cobalt)]/15 text-[var(--gold)] grid place-items-center">
                  <ImagePlus className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs sm:text-sm font-black text-main">
                    {isFa ? '📸 آپلود عکس رسید / اسکرین‌شات واریزی (پیشنهادی)' : '📸 Upload Payment Receipt Screenshot'}
                  </p>
                  <p className="text-[11px] text-dim">
                    {isFa ? 'با ارسال عکس رسید، نوشتن کد پیگیری اختیاری می‌شود.' : 'Uploading a receipt makes TXID optional.'}
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-2xl surface-soft border border-emerald-500/40">
                <button
                  type="button"
                  onClick={() => setLightboxReceipt(receiptImage)}
                  className="shrink-0 rounded-xl overflow-hidden border hairline"
                >
                  <img src={receiptImage} alt="Receipt preview" className="h-16 w-24 object-cover" />
                </button>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-xs font-black text-jade">
                    {isFa ? '✓ عکس رسید واریز آماده ارسال شد' : '✓ Receipt photo attached'}
                  </p>
                  <p className="text-[11px] text-dim">
                    {isFa ? 'می‌توانید همین الان دکمه ثبت نهایی را بزنید یا کد پیگیری را هم بنویسید.' : 'Ready to submit.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReceiptImage(null)}
                  className="h-8 w-8 rounded-full btn-ghost text-rose-400 grid place-items-center shrink-0"
                  title={isFa ? 'حذف تصویر' : 'Remove image'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-sub">
                  {receiptImage
                    ? isFa
                      ? 'کد پیگیری / TXID (اختیاری)'
                      : 'Tracking Code / TXID (Optional)'
                    : isFa
                      ? 'کد پیگیری یا هش تراکنش (TXID)'
                      : 'Tracking Code / TXID'}
                </label>
                <input
                  required={!receiptImage}
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder={
                    paymentMethod === 'TRUST_WALLET_BEP20'
                      ? isFa
                        ? 'هش تراکنش BEP20 (0x...) یا خالی اگر عکس فرستادید'
                        : 'BSC TX Hash (0x...)'
                      : paymentMethod === 'USDT_TRC20'
                        ? isFa
                          ? 'هش تراکنش TXID (یا خالی اگر عکس رسید فرستادید)'
                          : 'USDT TRC20 TXID'
                        : isFa
                          ? 'شماره پیگیری / ۴ رقم آخر کارت'
                          : 'Tracking code or last 4 digits'
                  }
                  className="w-full surface-input rounded-xl px-3.5 py-2.5 font-mono-num"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-sub">
                  {isFa ? 'آیدی تلگرام یا یادداشت (اختیاری)' : 'Telegram @handle or Note (Optional)'}
                </label>
                <input
                  value={payerNote}
                  onChange={(e) => setPayerNote(e.target.value)}
                  placeholder={isFa ? 'مثلاً @my_id یا زمان واریز...' : '@handle or note...'}
                  className="w-full surface-input rounded-xl px-3.5 py-2.5"
                />
              </div>
            </div>

            <button
              disabled={submitting || (!receiptImage && paymentRef.trim().length < 5)}
              type="submit"
              className="w-full py-3.5 px-6 rounded-2xl btn-emerald font-black text-sm flex items-center justify-center gap-2 disabled:opacity-45 shadow-lg"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>{submitting ? (isFa ? 'در حال ثبت...' : 'Submitting...') : isFa ? 'ثبت نهایی پرداخت و ارسال برای فعال‌سازی' : 'Submit Payment & Receipt'}</span>
            </button>

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-[10.5px] leading-relaxed text-sub flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {isFa
                  ? 'نکته امنیتی: دلارینو هیچ پیوی شخصی برای دریافت وجه ندارد؛ فقط از همین فرم یا ربات @Dollarino_bot اقدام کنید.'
                  : 'Security: Dollarino has NO personal DM support. Use only this checkout or @Dollarino_bot.'}
              </span>
            </div>
          </form>
        </div>
      )}

      {orders.length > 0 && (
        <div className="surface-card p-5 space-y-3 text-xs">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand" />
            <span>{isFa ? 'سوابق سفارش اشتراک' : 'Subscription Orders'}</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-[11px] text-dim border-b">
                <tr>
                  <th className="py-2 text-start">{isFa ? 'پلن' : 'Plan'}</th>
                  <th className="py-2 text-start">{isFa ? 'روش' : 'Method'}</th>
                  <th className="py-2 text-start">{isFa ? 'کد پیگیری / رسید' : 'Reference / Receipt'}</th>
                  <th className="py-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                  <th className="py-2 text-end">{isFa ? 'تاریخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono-num">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 font-sans font-bold text-main">{isFa ? o.name_fa || o.plan_code : o.name_en || o.plan_code}</td>
                    <td className="py-2.5 text-sub">{o.payment_method}</td>
                    <td className="py-2.5 text-sub max-w-[220px]">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{o.payment_reference || '-'}</span>
                        {o.receipt_image_url && (
                          <button
                            type="button"
                            onClick={() => setLightboxReceipt(o.receipt_image_url || null)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 font-sans text-[10px] font-bold shrink-0"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{isFa ? 'رسید' : 'Receipt'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold ${
                          o.status === 'ACTIVE'
                            ? 'badge-signal'
                            : o.status === 'PENDING_REVIEW'
                              ? 'bg-[#FF8A00]/15 text-flame'
                              : 'bg-rose-500/15 text-loss'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-end text-dim">{o.created_at.slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lightboxReceipt && (
        <div
          className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxReceipt(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxReceipt(null)}
            className="absolute top-4 end-4 h-10 w-10 rounded-full bg-white/15 text-white grid place-items-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxReceipt}
            alt="Payment receipt"
            className="max-w-full max-h-[88vh] rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
