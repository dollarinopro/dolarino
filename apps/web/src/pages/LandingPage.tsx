import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Download,
  Globe,
  Headphones,
  Lock,
  Menu,
  Moon,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { usePwaInstall } from '../lib/pwa';
import type { LookId } from '../components/AppearanceModal';
import { DollarinoBrandMark } from '../components/BrandGraphics';
import { ChainLogo, ExchangeLogo, WalletLogo } from '../components/BrandLogos';
import { CoinIcon } from '../components/CoinIcon';
import { Sparkline } from '../components/DollarinoViz';
import { PwaInstallModal } from '../components/PwaInstallModal';

interface PublicPlan {
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

interface PublicCopyTrader {
  id: string;
  display_name: string;
  handle: string;
  specialty: string;
  win_rate: number;
  roi_30d_pct: number;
  max_drawdown_pct: number;
  followers_count: number;
  risk_level: string;
}

interface SnapshotCoin {
  symbol: string;
  price: number;
  changePct24h: number;
  funding?: string;
}

export function LandingPage({
  lang,
  setLang,
  look,
  onToggleDaylight,
  onGoAuth,
  onOpenSupport,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  look: LookId;
  onToggleDaylight: () => void;
  onGoAuth: (mode: 'login' | 'register') => void;
  onOpenSupport?: () => void;
}) {
  const isFa = lang === 'fa';
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [copyTraders, setCopyTraders] = useState<PublicCopyTrader[]>([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [heroCoin, setHeroCoin] = useState<'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'>('BTCUSDT');
  const [liveCandles, setLiveCandles] = useState<number[]>([]);
  const [liveCoins, setLiveCoins] = useState<SnapshotCoin[]>([
    { symbol: 'BTCUSDT', price: 0, changePct24h: 0, funding: '0.0085%' },
    { symbol: 'ETHUSDT', price: 0, changePct24h: 0, funding: '0.0091%' },
    { symbol: 'SOLUSDT', price: 0, changePct24h: 0, funding: '0.0110%' },
    { symbol: 'BNBUSDT', price: 0, changePct24h: 0, funding: '0.0072%' },
    { symbol: 'XRPUSDT', price: 0, changePct24h: 0, funding: '0.0064%' },
  ]);
  const [activePillar, setActivePillar] = useState<'simple' | 'myai' | 'copy' | 'ide'>('simple');
  const [openFaq, setOpenFaq] = useState<number>(0);
  const [pwaOpen, setPwaOpen] = useState(false);
  const pwa = usePwaInstall();

  useEffect(() => {
    apiFetch<{ plans: PublicPlan[] }>('/api/public/plans')
      .then((r) => {
        if (r.plans?.length) setPlans(r.plans);
      })
      .catch(() => {});

    apiFetch<{ traders: PublicCopyTrader[] }>('/api/public/copy-traders')
      .then((r) => {
        if (r.traders?.length) setCopyTraders(r.traders);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch<{
      candles?: Array<{ close: number }>;
      markets?: Array<{ symbol: string; lastPrice: number; changePct24h: number; fundingRate?: string }>;
    }>(`/api/public/market-snapshot?symbol=${heroCoin}`)
      .then((r) => {
        if (r.candles?.length) {
          setLiveCandles(r.candles.slice(-24).map((c) => Number(c.close)).filter((n) => n > 0));
        }
        if (r.markets?.length) {
          setLiveCoins(
            r.markets.map((m) => ({
              symbol: m.symbol,
              price: Number(m.lastPrice),
              changePct24h: Number(m.changePct24h || 0),
              funding: m.fundingRate ?? '0.008%',
            }))
          );
        }
      })
      .catch(() => {});
  }, [heroCoin]);

  const scrollTo = (id: string) => {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activeCoin = liveCoins.find((c) => c.symbol === heroCoin) ?? liveCoins[0]!;

  const pillars = [
    {
      id: 'simple' as const,
      badge: '۰۱ · DOLLARINO AI',
      title: isFa ? 'هوش مصنوعی دلارینو: ترید هوشمند اتومات با اجماع چندمدله' : 'Dollarino AI: 100% Automated Multi-LLM Trading',
      shortTitle: isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI',
      icon: Bot,
      color: '#10b981',
      desc: isFa
        ? 'مناسب همه افراد حتی بدون دانش فنی! فقط میزان سرمایه و ریسک‌پذیری (کم‌ریسک، متعادل یا پرقدرت) را انتخاب کنید تا هوش مصنوعی دلارینو ۲۴ ساعته بهترین فرصت‌ها را پیدا کند، معامله باز کند و با ۳ تارگت + استاپ‌لاس خودکار مدیریت کند.'
        : 'Designed for everyone. Choose your comfort level and Dollarino AI scans markets 24/7, enters trades, and manages 3 take-profits + stop-loss automatically.',
      bullets: isFa
        ? ['فقط با یک لمس روشن و خاموش می‌شود', 'بدون نیاز به دانش کدنویسی یا تحلیل پیچیده', 'مدیریت خودکار ریسک‌فری و حد ضرر هوشمند']
        : ['1-tap start & stop', 'Zero technical setup required', 'Automatic 3-TP & Risk-Free management'],
    },
    {
      id: 'myai' as const,
      badge: '۰۲ · RAW PERSONAL AI',
      title: isFa ? 'هوش مصنوعی خام (شخصی): هوش مصنوعی خودت را آموزش بده' : 'Raw Personal AI: Train Your Own AI Trader',
      shortTitle: isFa ? 'هوش مصنوعی خام (شخصی)' : 'Raw Personal AI',
      icon: Brain,
      color: '#1652f0',
      desc: isFa
        ? 'یک هوش مصنوعی کاملاً خام که استراتژی شما را با چت فارسی یاد می‌گیرد! به او بگویید چه تایم‌فریمی، چه اندیکاتورهایی (مثلاً RSI، EMA، MACD یا سوپرترند)، چه حد ضرر و سودی و کدام ارزها را دوست دارید — روی بازار تست بگیرید و فعال کنید تا دقیقاً مثل خودتان ترید کند.'
        : 'Starts as a blank AI. Chat in plain language to teach your exact rules, indicators, coins, SL & TP — test on live candles and activate 24/7 execution.',
      bullets: isFa
        ? ['یادگیری سریع از طریق گفتگو به زبان ساده', 'استخراج خودکار قوانین و بک‌تست روی بازار زنده', 'امکان ریست و آموزش استراتژی جدید در هر لحظه']
        : ['Teaches easily through natural chat', 'Extracts structured rules & runs instant backtests', 'Reset and retrain anytime'],
    },
    {
      id: 'copy' as const,
      badge: '۰۳ · VERIFIED COPY TRADE',
      title: isFa ? 'کپی‌ترید تاییدشده دلارینو: کپی از تریدرهای احرازشده' : 'Verified Copy Trade: Mirror Admin-Vetted Leaders',
      shortTitle: isFa ? 'کپی‌ترید تاییدشده' : 'Copy Trade',
      icon: Trophy,
      color: '#f59e0b',
      desc: isFa
        ? 'فقط تریدرهایی که توسط مدیریت دلارینو بررسی و تایید شده‌اند در لیست کپی‌ترید نمایش داده می‌شوند. درصد برد، بازده ۳۰ روزه و تاریخچه معاملات هر تریدر را ببینید و با یک دکمه، تمام معاملاتشان را خودکار یا تکی کپی کنید.'
        : 'Browse strictly verified traders approved by Dollarino admins. Inspect real win-rates, 30-day ROI, and active trades, then mirror them in 1 tap.',
      bullets: isFa
        ? ['فقط تریدرهای احرازشده و تاییدشده توسط ادمین', 'مشاهده معاملات باز و بسته هر تریدر با جزئیات', 'کپی خودکار یا کپی فوری تک‌معامله با یک کلیک']
        : ['Admin-verified traders only', 'Transparent trade history & risk level', 'Auto-mirror or 1-tap single-trade copy'],
    },
    {
      id: 'ide' as const,
      badge: '۰۴ · HUNTING STRATEGY (2 MODES)',
      title: isFa ? 'استراتژی شکار: استراتژی‌های آماده ما + استراتژی شخصی شما' : 'Hunting Strategy: Our Presets + Your Custom Code',
      shortTitle: isFa ? 'استراتژی شکار' : 'Hunting Strategy',
      icon: Code2,
      color: '#8b5cf6',
      desc: isFa
        ? 'دو راه در یک موتور: می‌توانید از استراتژی‌های آماده و تست‌شده دلارینو (دُرنا V1، KBOS و شکار نقدینگی SP2L) استفاده کنید، یا استراتژی Pine Script / Python شخصی خودتان را در آزمایشگاه بسازید و با بک‌تست ۹۰۰ کندلی ۲۴/۷ اجرا کنید.'
        : 'Two modes in one engine: trade Dollarino preset hunters (Dorna V1, KBOS, SP2L) OR write/paste your own Pine Script or Python strategy.',
      bullets: isFa
        ? ['بخش ۱: استراتژی‌های آماده و غیرریپینت دُرنا V1، KBOS و SP2L', 'بخش ۲: ورود Pine Script، Python یا سازنده بصری شخصی', 'بک‌تست زنده ۹۰۰ کندلی و اجرای ۲۴/۷ روی Toobit، Bitunix و KCEX']
        : ['Mode 1: Preset Dorna V1, KBOS & SP2L hunters', 'Mode 2: Your own Pine Script, Python & Visual Builder', '24/7 live exchange execution'],
    },
  ];

  const selectedPillar = pillars.find((p) => p.id === activePillar) ?? pillars[0]!;

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell relative overflow-x-clip">
      {/* Clean Subtle Dot Pattern (no color halos on mobile) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[560px] z-0 overflow-hidden">
        <div
          className={`absolute inset-0 ${look === 'paper' ? 'opacity-15' : 'opacity-20'}`}
          style={{
            backgroundImage: 'radial-gradient(color-mix(in srgb, var(--text) 12%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'linear-gradient(to bottom, #000 10%, transparent 90%)',
          }}
        />
      </div>

      {/* Sticky Floating Pill Navbar (Clean mobile layout without overlap) */}
      <header className="sticky top-0 z-40 px-2.5 sm:px-6 pt-2.5 sm:pt-3">
        <div
          className="mx-auto max-w-6xl panel rounded-full px-3 sm:px-5 py-2 flex items-center gap-2 shadow-xl lg:backdrop-blur-2xl"
          style={{ background: 'color-mix(in srgb, var(--panel) 92%, transparent)' }}
        >
          <button type="button" onClick={() => scrollTo('top')} className="flex items-center gap-2 shrink-0 min-w-0">
            <DollarinoBrandMark size={34} glow />
            <span className="leading-none text-start">
              <span dir="ltr" className="block font-display font-bold text-sm sm:text-base text-main">
                Dollarino<span style={{ color: 'var(--gold)' }}>.</span>
              </span>
              <span className="hidden sm:block text-[9px] font-black tracking-[0.18em] text-dim">PRO · AI TRADING</span>
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-1 mx-auto text-xs font-bold text-dim">
            {[
              ['pillars', isFa ? '۴ روش معامله' : '4 Ways to Trade'],
              ['copy-leaders', isFa ? 'کپی‌تریدرها' : 'Copy Traders'],
              ['pricing', isFa ? 'اشتراک‌ها' : 'Subscriptions'],
              ['faq', isFa ? 'سوالات و راهنما' : 'Guide & FAQ'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id!)}
                className="px-3.5 py-2 rounded-full hover:text-main hover:bg-[var(--soft)] transition"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-1.5 shrink-0">
            {onOpenSupport && (
              <button
                type="button"
                onClick={onOpenSupport}
                className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-full btn-ghost text-xs font-bold"
              >
                <Headphones className="w-3.5 h-3.5 text-jade" />
                <span>{isFa ? 'پشتیبانی آنلاین' : 'Support'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-2 rounded-full btn-ghost"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{isFa ? 'EN' : 'فارسی'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleDaylight}
              title={isFa ? 'تغییر حالت روز و شب' : 'Day / Night'}
              className="inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-auto sm:px-3 gap-1.5 rounded-full btn-ghost text-xs font-bold"
            >
              {look === 'paper' ? (
                <>
                  <Moon className="h-4 w-4 text-[var(--gold)]" />
                  <span className="hidden sm:inline">{isFa ? 'حالت شب' : 'Night'}</span>
                </>
              ) : (
                <>
                  <Sun className="h-4 w-4 text-[#f59e0b]" />
                  <span className="hidden sm:inline">{isFa ? 'حالت روز' : 'Day'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onGoAuth('login')}
              className="hidden sm:inline-flex btn-ghost px-3.5 py-2 rounded-full text-xs font-bold"
            >
              {isFa ? 'ورود' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => onGoAuth('register')}
              className="btn-gold inline-flex items-center gap-1 text-[11px] font-black px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full shrink-0"
            >
              <span className="sm:hidden">{isFa ? 'ورود / پنل' : 'Enter'}</span>
              <span className="hidden sm:inline">{isFa ? 'ورود به میز کار' : 'Enter Workspace'}</span>
              <ArrowLeft className={`h-3.5 w-3.5 ${isFa ? '' : 'rotate-180'}`} />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenu((v) => !v)}
              className="lg:hidden h-8 w-8 grid place-items-center rounded-full btn-ghost"
              aria-label="Menu"
            >
              {mobileMenu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="panel rounded-3xl mt-2 p-3 lg:hidden max-w-6xl mx-auto space-y-1.5">
            <div className="flex items-center justify-between px-2 pb-1.5 border-b hairline sm:hidden">
              <span className="text-[11px] font-bold text-dim">{isFa ? 'زبان پلتفرم' : 'Language'}</span>
              <button
                type="button"
                onClick={() => setLang(isFa ? 'en' : 'fa')}
                className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full btn-ghost"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>{isFa ? 'English' : 'فارسی'}</span>
              </button>
            </div>
            {[
              ['pillars', isFa ? '۴ روش معامله (ساده تا حرفه‌ای)' : '4 Ways to Trade'],
              ['copy-leaders', isFa ? 'تریدرهای تاییدشده کپی‌ترید' : 'Verified Copy Traders'],
              ['pricing', isFa ? 'تعرفه اشتراک‌ها' : 'Subscriptions'],
              ['faq', isFa ? 'راهنما و سوالات پرتکرار' : 'FAQ'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id!)}
                className="block w-full text-start px-4 py-2.5 rounded-2xl text-xs font-bold hover:bg-[var(--soft)]"
              >
                {label}
              </button>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMobileMenu(false);
                  onGoAuth('login');
                }}
                className="btn-ghost py-2.5 rounded-2xl font-bold text-xs"
              >
                {isFa ? 'ورود به حساب' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenu(false);
                  onGoAuth('register');
                }}
                className="btn-gold py-2.5 rounded-2xl font-black text-xs"
              >
                {isFa ? 'ورود به میز کار' : 'Open Workspace'}
              </button>
            </div>
            {onOpenSupport && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenu(false);
                  onOpenSupport();
                }}
                className="btn-emerald w-full py-2.5 rounded-2xl font-black text-xs inline-flex items-center justify-center gap-1.5"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>{isFa ? 'پشتیبانی آنلاین و تلگرام' : 'Online Support'}</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Live Market Ticker */}
      <div className="relative z-10 mt-3 overflow-hidden border-y hairline bg-[color:color-mix(in_srgb,var(--panel)_65%,transparent)] backdrop-blur-md py-2">
        <div className="flex w-max animate-ticker gap-6 text-xs font-num" dir="ltr">
          {[...liveCoins, ...liveCoins, ...liveCoins].map((c, idx) => {
            const up = c.changePct24h >= 0;
            return (
              <div key={`${c.symbol}-${idx}`} className="flex items-center gap-2 px-3">
                <CoinIcon symbol={c.symbol} size={18} />
                <span className="font-bold text-main">{c.symbol}</span>
                <span className="text-sub">{c.price > 0 ? `$${c.price.toLocaleString()}` : '$—'}</span>
                <span className={`font-black ${up ? 'text-jade' : 'text-loss'}`}>
                  {up ? '+' : ''}{c.changePct24h.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main id="top" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 space-y-16 sm:space-y-20 py-10 sm:py-14">
        {/* 1. Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.06fr_0.94fr] gap-8 xl:gap-12 items-center">
          <div className="text-center lg:text-start reveal-up space-y-5">
            <div className="flex flex-wrap justify-center lg:justify-start gap-2">
              {[
                { icon: Bot, text: isFa ? 'حالت ساده: ترید اتومات با AI' : 'Simple Mode: Auto AI', color: 'var(--jade)' },
                { icon: Brain, text: isFa ? 'هوش مصنوعی قابل آموزش من' : 'Trainable My AI', color: 'var(--gold)' },
                { icon: Trophy, text: isFa ? 'کپی‌ترید تاییدشده + IDE شخصی' : 'Verified Copy Trade + IDE', color: '#f59e0b' },
              ].map((b) => {
                const Icon = b.icon;
                return (
                  <span key={b.text} className="inline-flex items-center gap-1.5 panel rounded-full px-3.5 py-1.5 text-[11px] font-black text-main">
                    <Icon className="h-3.5 w-3.5" style={{ color: b.color }} />
                    <span>{b.text}</span>
                  </span>
                );
              })}
            </div>

            <h1 className="font-display font-bold tracking-tight leading-[1.42] text-[clamp(30px,6.4vw,56px)] text-main">
              {isFa ? (
                <>
                  پلتفرم جامع ترید هوشمند
                  <br />
                  <span style={{ color: 'var(--gold)' }}>ساده برای همه، </span>
                  <span className="mark-lime">حرفه‌ای</span>
                  <br />
                  برای معامله‌گران.
                </>
              ) : (
                <>
                  One Smart Trading Platform
                  <br />
                  <span style={{ color: 'var(--gold)' }}>Effortless </span>
                  <span className="mark-lime">AI Trading</span>
                  <br />
                  for Every Skill Level.
                </>
              )}
            </h1>

            <p className="text-sm sm:text-[15px] leading-[1.9] text-dim max-w-xl mx-auto lg:mx-0">
              {isFa
                ? 'با دلارینو دقیقاً همان‌طور که راحت‌ترید معامله کنید: از ترید کاملاً خودکار با هوش مصنوعی گرفته تا آموزش هوش مصنوعی خام شخصی، کپی از تریدرهای تاییدشده یا استراتژی Pine Script و Python — متصل به صرافی‌های Toobit، Bitunix و KCEX، کیف‌پول غیرامانی چندزنجیره‌ای Trust Wallet، رادار DexScreener و ربات رسمی تلگرام @Dollarino_bot.'
                : 'Trade the exact way you prefer: fully automated AI trading, chat-trainable personal AI, verified Copy Traders, or custom Pine Script & Python strategies — synced with Toobit, Bitunix, KCEX, multi-chain Trust Wallet, DexScreener Radar, and Telegram Bot @Dollarino_bot.'}
            </p>

            {/* Brand Ecosystem Strip (Exchanges, Wallets & Blockchains) */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-1">
              {[
                { kind: 'ex' as const, id: 'toobit', label: 'Toobit' },
                { kind: 'ex' as const, id: 'bitunix', label: 'Bitunix' },
                { kind: 'ex' as const, id: 'kcex', label: 'KCEX' },
                { kind: 'w' as const, id: 'trustwallet', label: 'Trust Wallet' },
                { kind: 'w' as const, id: 'tonkeeper', label: 'TON' },
                { kind: 'c' as const, id: 'solana', label: 'Solana' },
                { kind: 'c' as const, id: 'bsc', label: 'BSC' },
                { kind: 'c' as const, id: 'base', label: 'Base' },
              ].map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full surface-soft border hairline text-[11px] font-bold text-main"
                >
                  {item.kind === 'ex' ? (
                    <ExchangeLogo provider={item.id} size={16} />
                  ) : item.kind === 'w' ? (
                    <WalletLogo wallet={item.id === 'tonkeeper' ? 'ton' : 'trustwallet'} size={16} />
                  ) : (
                    <ChainLogo chain={item.id} size={16} />
                  )}
                  <span>{item.label}</span>
                </span>
              ))}
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-3 pt-1">
              <button
                type="button"
                onClick={() => onGoAuth('register')}
                className="btn-lime inline-flex items-center gap-2 font-black px-7 py-4 rounded-2xl text-sm"
              >
                <Zap className="h-[18px] w-[18px]" />
                <span>{isFa ? 'ثبت‌نام امن در @Dollarino_bot' : 'Register via @Dollarino_bot'}</span>
              </button>
              <button
                type="button"
                onClick={() => onGoAuth('login')}
                className="btn-gold inline-flex items-center gap-2 font-black px-6 py-4 rounded-2xl text-sm"
              >
                <span>{isFa ? 'ورود به میز کار' : 'Sign In to Workspace'}</span>
                <ArrowLeft className={`h-4 w-4 ${isFa ? '' : 'rotate-180'}`} />
              </button>
              <button
                type="button"
                onClick={() => scrollTo('pillars')}
                className="btn-ghost inline-flex items-center gap-2 font-bold px-5 py-4 rounded-2xl text-sm"
              >
                <Play className="h-4 w-4" />
                <span>{isFa ? 'آموزش سریع سیستم' : 'How It Works'}</span>
              </button>
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-xs font-bold text-dim pt-1">
              {[
                isFa ? 'ربات ۲۴ ساعته متصل به Toobit، Bitunix، KCEX و Trust Wallet' : '24/7 Toobit, Bitunix, KCEX & Trust Wallet Core',
                isFa ? 'رادار زنده DexScreener + اکستنشن کروم و ویجت موبایل' : 'DexScreener Radar, Extension & Mobile Widgets',
                isFa ? 'ثبت‌نام و احراز هویت امن شماره تماس در @Dollarino_bot' : 'Phone-Verified Onboarding in @Dollarino_bot',
              ].map((x) => (
                <span key={x} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-jade" />
                  <span>{x}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Right Live Market & 4-Mode Interactive Card */}
          <div className="panel glow-card-anim rounded-[30px] p-5 sm:p-6 space-y-4">
            <div className="relative rounded-2xl overflow-hidden border hairline h-36 sm:h-40">
              <img
                src="/images/hero-quant-desk.png"
                alt="Dollarino AI Quantitative Desk"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#081022]/90 via-[#081022]/30 to-transparent flex items-end p-3.5">
                <div className="flex items-center justify-between gap-2 w-full">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--gold)' }}>
                      DOLLARINO QUANT DESK
                    </p>
                    <p className="text-xs font-bold text-white">
                      {isFa ? 'ترید هوشمند، کپی‌ترید، و Trust Wallet DApp' : 'AI Trading, Copy-Trade & Trust Wallet DApp'}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black shrink-0">
                    {isFa ? 'آنلاین ۲۴/۷' : '24/7 LIVE'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--gold)' }}>
                  LIVE MARKET TELEMETRY
                </p>
                <h3 className="font-display font-bold text-lg text-main">
                  {isFa ? 'نبض زنده بازار و شبیه‌ساز ۴ گانه' : 'Live Market Feed'}
                </h3>
              </div>
              <div className="flex gap-1">
                {(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const).map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setHeroCoin(sym)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black transition ${
                      heroCoin === sym ? 'btn-gold' : 'btn-ghost text-dim'
                    }`}
                  >
                    {sym.replace('USDT', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="ios-wallet-card rounded-[24px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <CoinIcon symbol={activeCoin.symbol} size={34} />
                  <div>
                    <p dir="ltr" className="font-display font-bold text-base">{activeCoin.symbol}</p>
                    <p className="text-[11px] text-white/75">Perpetual Futures</p>
                  </div>
                </div>
                <div className="text-end" dir="ltr">
                  <p className="font-num font-black text-2xl">
                    {activeCoin.price > 0 ? `$${activeCoin.price.toLocaleString()}` : '$—'}
                  </p>
                  <p className={`text-xs font-black ${activeCoin.changePct24h >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {activeCoin.changePct24h >= 0 ? '+' : ''}{activeCoin.changePct24h.toFixed(2)}% (24h)
                  </p>
                </div>
              </div>
              {liveCandles.length > 4 && (
                <div className="h-24 pt-2">
                  <Sparkline
                    values={liveCandles}
                    color={activeCoin.changePct24h >= 0 ? '#10d9a3' : '#f43f5e'}
                    height={82}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {pillars.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActivePillar(p.id);
                      scrollTo('pillars');
                    }}
                    className="surface-soft hover:border-[var(--gold)] border border-transparent rounded-2xl p-3 text-start transition space-y-1"
                  >
                    <div className="flex items-center gap-1.5 font-black text-main">
                      <Icon className="w-4 h-4 shrink-0" style={{ color: p.color }} />
                      <span className="truncate">{p.shortTitle}</span>
                    </div>
                    <p className="text-[10px] text-dim">{p.badge}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 2. Interactive 4 Pillars Clear Walkthrough */}
        <section id="pillars" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--gold)' }}>
              HOW DOLLARINO WORKS · SUPER EASY FOR EVERYONE
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? '۴ روش ساده و قدرتمند برای کسب سود در دلارینو' : '4 Simple & Powerful Ways to Trade'}
            </h2>
            <p className="text-xs sm:text-sm text-dim">
              {isFa
                ? 'هر سطحی که دارید — از کسی که فقط یک دکمه می‌خواهد تا تریدر حرفه‌ای — بخش مناسب خودتان آماده است.'
                : 'Whether you want 1-tap automated AI or full Pine Script control, pick your lane cleanly.'}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {pillars.map((p) => {
              const Icon = p.icon;
              const active = activePillar === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePillar(p.id)}
                  className={`rounded-2xl p-3.5 text-start transition flex items-center gap-2.5 border ${
                    active ? 'btn-gold border-transparent shadow-lg' : 'panel border-transparent hover:border-[var(--line-strong)] text-main'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" style={{ color: active ? '#fff' : p.color }} />
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate">{p.shortTitle}</p>
                    <p className={`text-[10px] truncate ${active ? 'text-white/80' : 'text-dim'}`}>{p.badge}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="panel glow-card-anim rounded-[30px] p-6 sm:p-8 grid md:grid-cols-[1.15fr_0.85fr] gap-6 items-center">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[11px] font-black">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{selectedPillar.badge}</span>
              </span>
              <h3 className="font-display font-bold text-2xl sm:text-3xl text-main">{selectedPillar.title}</h3>
              <p className="text-xs sm:text-sm text-dim leading-relaxed">{selectedPillar.desc}</p>
              <ul className="space-y-2 text-xs text-sub">
                {selectedPillar.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-jade shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-2 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-emerald px-5 py-3 rounded-2xl text-xs font-black"
                >
                  {isFa ? 'شروع با همین روش' : 'Get Started Now'}
                </button>
                <a
                  href="https://t.me/Dollarino_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost px-5 py-3 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5 text-brand" />
                  <span>{isFa ? 'اجرا در ربات تلگرام' : 'Open Telegram Bot'}</span>
                </a>
              </div>
            </div>

            <div className="surface-soft rounded-[26px] p-5 space-y-3 border hairline">
              <p className="text-[11px] font-black text-dim uppercase">
                {isFa ? 'چطور در ۳ قدم شروع کنم؟' : '3 Simple Steps to Start'}
              </p>
              {[
                {
                  n: '۱',
                  t: isFa ? 'ثبت‌نام و تایید شماره در @Dollarino_bot' : 'Register & Verify Phone in @Dollarino_bot',
                  d: isFa ? 'شماره تلگرام خودتان را به اشتراک بگذارید و بلافاصله لینک ورود به سایت را بگیرید.' : 'Share your own Telegram contact and receive your 1-click web login link.',
                },
                {
                  n: '۲',
                  t: isFa ? 'انتخاب اشتراک (Trust Wallet یا کارت‌به‌کارت)' : 'Activate Your Subscription Plan',
                  d: isFa ? 'اشتراک ماهانه یا فصلی را انتخاب و فعال کنید.' : 'Pick Monthly or VIP plan via Trust Wallet or Card.',
                },
                {
                  n: '۳',
                  t: isFa ? 'روشن کردن ربات یا آموزش هوش مصنوعی من' : 'Launch Auto AI, My AI, or Copy Trade',
                  d: isFa ? 'به سادگی در سایت یا ربات تلگرام دکمه شروع را بزنید.' : 'Start automated trades on Web or Telegram.',
                },
              ].map((step) => (
                <div key={step.n} className="panel rounded-2xl p-3.5 flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl btn-gold grid place-items-center text-xs font-black shrink-0">{step.n}</span>
                  <div>
                    <p className="text-xs font-black text-main">{step.t}</p>
                    <p className="text-[11px] text-dim mt-0.5">{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Verified Copy Traders Showcase */}
        <section id="copy-leaders" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1.5" style={{ color: 'var(--gold)' }}>
                VERIFIED COPY TRADE DESK
              </p>
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
                {isFa ? 'معامله‌گران تاییدشده توسط مدیریت دلارینو' : 'Admin-Verified Copy Traders'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onGoAuth('register')}
              className="btn-cobalt px-4 py-2.5 rounded-2xl text-xs font-black"
            >
              {isFa ? 'مشاهده معاملات و کپی‌ترید' : 'View Trades & Copy'}
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {copyTraders.map((t) => (
              <div key={t.id} className="panel panel-hover rounded-[26px] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-display font-bold text-base text-main">{t.display_name}</h3>
                      <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                    </div>
                    <p className="text-[11px] text-dim mt-0.5">{t.specialty} · <span dir="ltr">{t.handle}</span></p>
                  </div>
                  <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                    {isFa ? 'تاییدشده' : 'VERIFIED'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="surface-soft rounded-2xl p-2.5">
                    <p dir="ltr" className="font-num font-black text-jade">+{t.roi_30d_pct}%</p>
                    <p className="text-[10px] text-dim">{isFa ? 'بازده ۳۰ روزه' : '30d ROI'}</p>
                  </div>
                  <div className="surface-soft rounded-2xl p-2.5">
                    <p dir="ltr" className="font-num font-black text-main">{t.win_rate}%</p>
                    <p className="text-[10px] text-dim">{isFa ? 'نرخ برد' : 'Win Rate'}</p>
                  </div>
                  <div className="surface-soft rounded-2xl p-2.5">
                    <p dir="ltr" className="font-num font-black text-sub">{t.followers_count}</p>
                    <p className="text-[10px] text-dim">{isFa ? 'دنبال‌کننده' : 'Followers'}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-ghost w-full py-2.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5 text-brand" />
                  <span>{isFa ? 'کپی خودکار معاملات این تریدر' : 'Follow & Copy Trader'}</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Paid Subscription Plans (No Free Tier) */}
        <section id="pricing" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--gold)' }}>
              SUBSCRIPTION PLANS · ALL-INCLUSIVE ACCESS
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? 'پلن اشتراک خودتان را انتخاب کنید' : 'Choose Your Dollarino Subscription'}
            </h2>
            <p className="text-xs sm:text-sm text-dim">
              {isFa
                ? 'تمامی پلن‌ها شامل دسترسی کامل به حالت ساده AI، هوش مصنوعی من، کپی‌ترید تاییدشده، استراتژی شخصی و ربات تلگرام هستند.'
                : 'Every plan unlocks Automated AI Mode, My Trainable AI, Verified Copy-Trade, Custom IDE, and Telegram Bot control.'}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.filter((p) => p.price_usd > 0).map((p) => {
              let feats: string[] = [];
              try {
                feats = JSON.parse(p.features_json || '[]') as string[];
              } catch {
                feats = [];
              }
              return (
                <div key={p.code} className={`panel rounded-[26px] p-6 flex flex-col justify-between space-y-5 ${p.is_popular ? 'ring-2 ring-[var(--gold)]' : ''}`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase" style={{ color: 'var(--gold-soft)' }}>{p.code}</span>
                      {p.is_popular === 1 && <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{isFa ? 'محبوب‌ترین' : 'POPULAR'}</span>}
                    </div>
                    <h3 className="font-display font-bold text-xl text-main mt-1">{isFa ? p.name_fa : p.name_en}</h3>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span dir="ltr" className="font-display font-bold text-3xl text-main">${p.price_usd}</span>
                      <span className="text-xs text-dim">/ {p.duration_days} {isFa ? 'روز' : 'days'}</span>
                    </div>
                    {p.price_toman > 0 && (
                      <p className="text-[11px] text-dim mt-1">
                        {p.price_toman.toLocaleString('fa-IR')} {isFa ? 'تومان' : 'Toman'}
                      </p>
                    )}
                    <ul className="mt-4 space-y-2 text-xs text-sub">
                      {feats.slice(0, 4).map((f) => (
                        <li key={f} className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 text-jade" /><span>{f}</span></li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoAuth('register')}
                    className={`w-full py-3 rounded-2xl text-xs font-black ${p.is_popular ? 'btn-gold' : 'btn-cobalt'}`}
                  >
                    {isFa ? 'خرید و فعال‌سازی اشتراک' : 'Select & Subscribe'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Security & FAQ */}
        <section id="faq" className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
          <div className="panel rounded-[28px] p-6 space-y-4">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[10px] font-black">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>ZERO-TRUST SECURITY</span>
            </span>
            <h3 className="font-display font-bold text-2xl text-main">
              {isFa ? 'امنیت کامل سرمایه + پشتیبانی آنلاین واقعی' : 'Bank-Grade Security + Real Online Support'}
            </h3>
            <p className="text-xs sm:text-sm text-dim leading-relaxed">
              {isFa
                ? 'تمامی کلیدهای API صرافی‌های Toobit، Bitunix و KCEX با رمزنگاری AES-256 ذخیره می‌شوند و دسترسی برداشت کاملاً مسدود است. در تمام ساعات شبانه‌روز از طریق چت پشتیبانی آنلاین داخل سایت یا ربات تلگرام کنار شما هستیم.'
                : 'Toobit, Bitunix & KCEX keys are AES-256 encrypted with zero withdrawal permission. Reach our support desk live inside the app or via Telegram anytime.'}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {onOpenSupport && (
                <button
                  type="button"
                  onClick={onOpenSupport}
                  className="btn-emerald px-5 py-3 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Headphones className="w-4 h-4" />
                  <span>{isFa ? 'گفتگو با پشتیبانی آنلاین' : 'Chat with Support'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPwaOpen(true)}
                className="btn-ghost px-4 py-3 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>{pwa.canPromptNatively ? (isFa ? 'نصب اپلیکیشن' : 'Install App') : isFa ? 'نصب وب‌اپ (PWA)' : 'Install PWA'}</span>
              </button>
            </div>
          </div>

          <div className="panel rounded-[28px] p-5 space-y-2.5">
            <h3 className="font-display font-bold text-lg text-main px-1 pb-1">
              {isFa ? 'سوالات پرتکرار کاربران' : 'Frequently Asked Questions'}
            </h3>
            {(isFa
              ? [
                  ['چطور با هوش مصنوعی من (My AI) کار کنم؟', 'بعد از ورود به میز کار وارد تب «هوش مصنوعی من» شوید و مثل چت کردن عادی استراتژیتان را بنویسید (مثلاً تایم ۱۵ دقیقه، RSI زیر ۳۵، حد ضرر ۲٪). سیستم فوراً قوانین را می‌فهمد، تست زنده می‌گیرد و با یک کلیک ۲۴ ساعته برایتان معامله می‌کند.'],
                  ['تفاوت حالت ساده با حالت حرفه‌ای چیست؟', 'در حالت ساده فقط ترید هوشمند کاملاً اتومات با هوش مصنوعی وجود دارد تا هیچ پیچیدگی نبیند. در حالت حرفه‌ای به ترمینال چارت، هوش مصنوعی من، کپی‌ترید تاییدشده و IDE استراتژی شخصی دسترسی دارید.'],
                  ['کپی‌ترید چگونه کار می‌کند؟', 'تریدرهای تاییدشده توسط مدیریت دلارینو در لیست کپی‌ترید نمایش داده می‌شوند. می‌توانید آمار و معاملات آن‌ها را ببینید و با یک دکمه کپی خودکار را فعال کنید.'],
                  ['آیا اشتراک رایگان یا دمو وجود دارد؟', 'خیر — تمام امکانات دلارینو روی زیرساخت ابری اختصاصی با اشتراک فعال ارائه می‌شوند. می‌توانید پس از ثبت‌نام، اشتراک ماهانه، فصلی یا سالانه را با تتر یا کارت‌به‌کارت فعال کنید.'],
                ]
              : [
                  ['How does My Trainable AI work?', 'Open "My AI" inside the workspace and chat naturally in Persian or English describing your rules, indicators, timeframe, SL/TP, and coins — test live and activate 24/7.'],
                  ['What is the difference between Simple & Pro modes?', 'Simple Mode is strictly automated AI trading for effortless 1-tap usage. Pro Mode adds My AI, Verified Copy-Trade, Candlestick Terminal, and Pine/Python Strategy IDE.'],
                  ['How does Copy Trade work?', 'Only admin-verified traders appear on the Copy Trade leaderboard. View their ROI, win rate, and live trades, and follow or mirror them in 1 tap.'],
                  ['Is a subscription required?', 'Yes — all trading engines, Copy Trade, and AI desks require an active subscription plan.'],
                ]
            ).map(([q, a], i) => (
              <div key={q} className="surface-soft rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  className="w-full px-4 py-3 flex items-center justify-between text-start text-xs sm:text-sm font-bold text-main gap-2"
                >
                  <span>{q}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <p className="px-4 pb-3.5 text-xs text-dim leading-relaxed">{a}</p>}
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t hairline py-10 px-4 text-center text-xs text-dim space-y-3">
        <div className="flex items-center justify-center gap-2">
          <DollarinoBrandMark size={26} />
          <span className="font-bold text-main">Dollarino AI Trading Platform</span>
        </div>
        <p className="opacity-85">
          {isFa
            ? 'چت هوش مصنوعی اختصاصی + تحلیل عکس چارت + ترید هوشمند ۲۴/۷ · ربات تلگرام @Dollarino_bot'
            : 'Dedicated Vision AI · Autonomous Trading · Verified Copy Trade · @Dollarino_bot'}
        </p>
        <div className="inline-flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-2xl surface-soft border hairline text-[11px]">
          <span className="font-black text-main">
            {isFa ? '👨‍💻 طراحی و توسعه توسط: آوید کیا (Avid Kiya)' : '👨‍💻 Created & Engineered by Avid Kiya'}
          </span>
          <span className="opacity-40">|</span>
          <a href="https://t.me/avidkiya" target="_blank" rel="noreferrer" dir="ltr" className="font-bold text-[var(--gold)] hover:underline">
            Telegram: @avidkiya
          </a>
          <a href="https://instagram.com/avid_kiya" target="_blank" rel="noreferrer" dir="ltr" className="font-bold text-jade hover:underline">
            Instagram: @avid_kiya
          </a>
          <a href="https://x.com/avid_kiya" target="_blank" rel="noreferrer" dir="ltr" className="font-bold text-brand hover:underline">
            X (Twitter): @avid_kiya
          </a>
        </div>
      </footer>

      {pwaOpen && <PwaInstallModal lang={lang} onClose={() => setPwaOpen(false)} />}
    </div>
  );
}
