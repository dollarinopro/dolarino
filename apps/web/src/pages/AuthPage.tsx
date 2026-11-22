import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ExternalLink,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Moon,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { DollarinoBrandMark } from '../components/BrandGraphics';

export function AuthPage({
  lang,
  setLang,
  isLight,
  onToggleDaylight,
  initialMode = 'register',
  externalError,
  onBack,
  onSuccess,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  isLight: boolean;
  onToggleDaylight: () => void;
  initialMode?: 'login' | 'register';
  externalError?: string | null;
  onBack?: () => void;
  onSuccess: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'register' | 'login'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(() =>
    typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('ref') || '').trim().toUpperCase() : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    apiFetch<{ ok: boolean }>('/api/health')
      .then((r) => setApiReady(Boolean(r.ok)))
      .catch(() => setApiReady(false));
  }, []);

  const cleanRef = referralCode.trim().replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  const telegramBotUrl = cleanRef
    ? `https://t.me/Dollarino_bot?start=${encodeURIComponent(`web_auth__REF_${cleanRef}`)}`
    : 'https://t.me/Dollarino_bot?start=web_auth';

  const submitPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail.includes('@')) {
        throw new Error(lang === 'fa' ? 'لطفاً ایمیل خود را وارد کنید' : 'Please enter your email address');
      }
      if (password.length < 6) {
        throw new Error(lang === 'fa' ? 'رمز عبور باید حداقل ۶ رقم یا حرف باشد' : 'Password must be at least 6 characters');
      }
      const res = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      setStoredToken(res.token);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  const shownError = error || externalError;
  const isFa = lang === 'fa';

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[460px] space-y-4">
        <div className="flex items-center justify-between text-xs">
          {onBack ? (
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-dim hover:text-main font-bold transition">
              <ArrowLeft className={`w-4 h-4 ${isFa ? 'rotate-180' : ''}`} />
              <span>{isFa ? 'صفحه اصلی' : 'Home'}</span>
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onToggleDaylight} className="p-2 rounded-xl btn-ghost" aria-label="Toggle theme">
              {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-[#f7c85c]" />}
            </button>
            <button type="button" onClick={() => setLang(isFa ? 'en' : 'fa')} className="px-3 py-2 rounded-xl btn-ghost text-main font-bold inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
              <span>{isFa ? 'English' : 'فارسی'}</span>
            </button>
          </div>
        </div>

        <div className="panel rounded-[28px] p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <DollarinoBrandMark size={44} glow />
              <div>
                <h1 className="font-display font-bold text-xl text-main">Dollarino</h1>
                <p className="text-xs text-dim">{isFa ? 'ثبت‌نام امن تلگرامی و ورود یکپارچه' : 'Telegram-Verified Onboarding'}</p>
              </div>
            </div>
            {apiReady !== null && (
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${apiReady ? 'badge-signal' : 'bg-rose-500/15 text-loss'}`}>
                {apiReady ? (isFa ? 'سرور آنلاین' : 'Online') : isFa ? 'خطای سرور' : 'Offline'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 p-1 rounded-2xl surface-soft gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2.5 rounded-xl text-xs font-bold transition ${mode === 'register' ? 'btn-gold' : 'text-dim hover:text-main'}`}
            >
              {isFa ? 'ثبت‌نام / ورود تلگرامی' : 'Telegram Sign Up / In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2.5 rounded-xl text-xs font-bold transition ${mode === 'login' ? 'btn-gold' : 'text-dim hover:text-main'}`}
            >
              {isFa ? 'ورود با ایمیل و رمز' : 'Email & Password'}
            </button>
          </div>

          {shownError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs font-bold text-loss">
              {shownError}
            </div>
          )}

          {mode === 'register' ? (
            <div className="space-y-4">
              <div className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline text-xs leading-relaxed">
                <p className="font-black text-main flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-jade shrink-0" />
                  <span>
                    {isFa
                      ? 'ثبت‌نام فقط از طریق ربات رسمی تلگرام انجام می‌شود'
                      : 'Secure Registration Exclusively via Telegram Bot'}
                  </span>
                </p>
                <p className="text-sub">
                  {isFa
                    ? 'برای جلوگیری از ساخت اکانت‌های جعلی، ثبت‌نام مستقیم با ایمیل غیرفعال شده است. روی دکمه زیر بزنید تا ربات @Dollarino_bot باز شود:'
                    : 'To prevent spam and fake accounts, open @Dollarino_bot and follow these 3 steps:'}
                </p>
                <ul className="space-y-1.5 text-[11px] text-sub">
                  <li className="flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                    <span>{isFa ? '۱. در ربات توضیح کامل کارکرد دلارینو برایتان نمایش داده می‌شود.' : '1. Read the complete Dollarino overview inside the bot.'}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Phone className="w-3.5 h-3.5 text-jade shrink-0 mt-0.5" />
                    <span>{isFa ? '۲. تنها دکمه «اشتراک‌گذاری شماره تماس من» را لمس کنید (شماره تلگرام خودتان تایید و قفل می‌شود).' : '2. Tap "Share My Contact" using your own Telegram account.'}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{isFa ? '۳. بلافاصله لینک ورود یک‌کلیک به سایت برای شما ارسال می‌شود و حسابتان ساخته می‌شود.' : '3. Immediately receive your 1-click magic link to enter your web dashboard.'}</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-dim block">
                  {isFa ? 'کد معرف یا دعوت (اختیاری):' : 'Referral Code (optional):'}
                </label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-jade absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    dir="ltr"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder={isFa ? 'مثلاً DLR-XXXXXX' : 'e.g. DLR-XXXXXX'}
                    className="field ps-10 text-xs font-mono-num"
                  />
                </div>
                {cleanRef && (
                  <p className="text-[11px] font-bold text-jade">
                    {isFa
                      ? `کد معرف ${cleanRef} به لینک ورود ربات پیوست شد.`
                      : `Referral ${cleanRef} attached to bot link.`}
                  </p>
                )}
              </div>

              <a
                href={telegramBotUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-cobalt w-full py-3.5 px-4 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-lg"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isFa ? (
                    <>
                      ثبت‌نام و دریافت لینک ورود از <span dir="ltr" className="inline-block font-mono-num">@Dollarino_bot</span>
                    </>
                  ) : (
                    'Register & Get 1-Click Login via @Dollarino_bot'
                  )}
                </span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              <p className="text-[11px] text-dim text-center leading-relaxed">
                {isFa
                  ? 'اگر قبلاً ثبت‌نام کرده‌اید نیز با لمس دکمه بالا یا ارسال دستور /weblogin در ربات، لینک ورود مستقیم دریافت می‌کنید.'
                  : 'Already registered? Tapping above or sending /weblogin in the bot gives you an instant login link.'}
              </p>
            </div>
          ) : (
            <form onSubmit={submitPasswordLogin} className="space-y-3">
              <div className="surface-soft rounded-2xl p-3 text-[11px] text-sub leading-relaxed flex items-start gap-2">
                <KeyRound className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <span>
                  {isFa
                    ? 'اگر قبلاً از تلگرام ثبت‌نام کرده و در بخش «مدیریت حساب» ایمیل شخصی و رمز عبور تنظیم کرده‌اید، از اینجا وارد شوید:'
                    : 'Sign in using the personal email and password you configured in Account Management:'}
                </span>
              </div>

              <div className="relative">
                <Mail className="w-4 h-4 text-dim absolute start-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="field ps-10 text-xs"
                />
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-dim absolute start-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isFa ? 'رمز عبور' : 'Password'}
                  className="field ps-10 text-xs"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-gold w-full py-3.5 rounded-2xl text-xs font-black">
                {loading ? '...' : isFa ? 'ورود به میز کار دلارینو' : 'Enter Workspace'}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className="text-[11px] font-bold text-brand hover:underline"
                >
                  {isFa ? 'هنوز رمز نگذاشته‌اید یا حساب ندارید؟ ورود با @Dollarino_bot ←' : 'Need an account or 1-click Telegram login?'}
                </button>
              </div>
            </form>
          )}

          <p className="text-[10px] text-dim flex items-center justify-center gap-1.5 pt-1 border-t hairline">
            <Bot className="w-3.5 h-3.5 text-brand shrink-0" />
            <span dir="ltr">@Dollarino_bot · @Dollarino_official</span>
          </p>
        </div>
      </div>
    </div>
  );
}
