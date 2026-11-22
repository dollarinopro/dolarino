import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  BrainCircuit,
  CandlestickChart,
  CircleHelp,
  Command,
  CreditCard,
  Flame,
  Globe,
  Headphones,
  Home,
  Image,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  Power,
  Radar,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Sprout,
  Sun,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getPersianToday } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import type { AuthUserInfo, EntitlementSummary, NavTab } from '../lib/types';
import type { LookId } from './AppearanceModal';
import { DollarinoBrandMark } from './BrandGraphics';
import { CoinIcon } from './CoinIcon';
import { ConfirmTradeSheet, type PendingTradeConfirmation } from './ConfirmTradeSheet';
import type { ExchangeMarket } from './SymbolPickerModal';

export type { AuthUserInfo, EntitlementSummary, NavTab };
export type UiMode = 'simple' | 'pro';

export function DollarinoCoinMark({ size = 40 }: { size?: number }) {
  return <DollarinoBrandMark size={size} glow />;
}

const SIMPLE_VIEWS: Array<{ id: NavTab; labelFa: string; labelEn: string; icon: typeof Home }> = [
  { id: 'overview', labelFa: 'ترید هوشمند اتومات AI', labelEn: 'Automated AI Trading', icon: Home },
  { id: 'aichat', labelFa: 'چت هوش مصنوعی AI (چارت)', labelEn: 'AI Chat & Vision', icon: Sparkles },
  { id: 'dex', labelFa: 'کیف‌پول Trust Wallet و DEX', labelEn: 'Trust Wallet & DEX', icon: Flame },
  { id: 'myai', labelFa: 'هوش مصنوعی من', labelEn: 'My AI Agent', icon: BrainCircuit },
  { id: 'copy', labelFa: 'کپی‌ترید تاییدشده', labelEn: 'Copy Trade', icon: Users },
  { id: 'portfolio', labelFa: 'کیف پول و سودها', labelEn: 'Wallet & Profit', icon: Wallet },
  { id: 'services', labelFa: 'سرویس‌ها و اشتراک', labelEn: 'Services & Plans', icon: LayoutGrid },
  { id: 'pricing', labelFa: 'خرید و تمدید اشتراک', labelEn: 'Subscriptions', icon: CreditCard },
  { id: 'faq', labelFa: 'راهنمای استفاده', labelEn: 'User Guide', icon: CircleHelp },
];

const MAIN_VIEWS: Array<{ id: NavTab; labelFa: string; labelEn: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', labelFa: 'نمای کلی', labelEn: 'Overview', icon: LayoutDashboard },
  { id: 'aichat', labelFa: 'چت هوش مصنوعی AI (چارت)', labelEn: 'AI Chat & Vision', icon: Sparkles },
  { id: 'dex', labelFa: 'Trust Wallet و رادار DEX', labelEn: 'Trust Wallet & DEX', icon: Flame },
  { id: 'myai', labelFa: 'هوش مصنوعی من', labelEn: 'My AI Agent', icon: BrainCircuit },
  { id: 'terminal', labelFa: 'پایانه و چارت AI', labelEn: 'Terminal & Chart AI', icon: CandlestickChart },
  { id: 'markets', labelFa: 'بازارهای فیوچرز', labelEn: 'Markets', icon: Globe },
  { id: 'radar', labelFa: 'رادار و استراتژی شخصی', labelEn: 'Radar & Custom IDE', icon: Radar },
  { id: 'copy', labelFa: 'کپی‌ترید تاییدشده و API', labelEn: 'Copy Trade & API', icon: Users },
  { id: 'portfolio', labelFa: 'پورتفوی و گزارش‌ها', labelEn: 'Portfolio & Logs', icon: Wallet },
  { id: 'services', labelFa: 'خدمات و پروفایل', labelEn: 'Services Hub', icon: LayoutGrid },
];

const ACCOUNT_VIEWS: Array<{ id: NavTab; labelFa: string; labelEn: string; icon: typeof CreditCard }> = [
  { id: 'pricing', labelFa: 'اشتراک‌ها و کد هدیه', labelEn: 'Subscriptions', icon: CreditCard },
  { id: 'faq', labelFa: 'راهنما و سوالات', labelEn: 'FAQ & Guide', icon: CircleHelp },
];

export function tabLabel(id: NavTab, lang: Lang): string {
  const isFa = lang === 'fa';
  if (id === 'aichat') return isFa ? 'چت هوش مصنوعی AI' : 'AI Chat & Vision';
  if (id === 'dex') return isFa ? 'Trust Wallet و DEX' : 'Trust Wallet & DEX';
  if (id === 'myai') return isFa ? 'هوش مصنوعی من' : 'My AI Agent';
  if (id === 'services') return isFa ? 'خدمات' : 'Services';
  if (id === 'card') return isFa ? 'کارت سود' : 'Profit Card';
  if (id === 'admin') return isFa ? 'مدیریت' : 'Admin';
  const found = [...MAIN_VIEWS, ...ACCOUNT_VIEWS].find((x) => x.id === id);
  return found ? (isFa ? found.labelFa : found.labelEn) : id;
}

type DockTabId = 'overview' | 'markets' | 'portfolio' | 'services';

function LiquidDockSvg({ id }: { id: DockTabId }) {
  if (id === 'services') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="2.3" fill="var(--tab-b)" />
        <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="2.3" fill="var(--tab-a)" />
        <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="2.3" fill="var(--tab-a)" />
        <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="2.3" fill="var(--tab-b)" />
      </svg>
    );
  }
  if (id === 'portfolio') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          className="dock-cap"
          d="M5 8.5l8.3-2.9a2 2 0 0 1 2.6 1.9V9H5v-.5z"
          fill="var(--tab-b)"
          stroke="var(--tab-cap)"
          strokeWidth=".6"
        />
        <rect x="3" y="8" width="18" height="12.5" rx="3.4" fill="var(--tab-a)" />
        <rect x="7" y="13.7" width="9" height="1.7" rx=".85" fill="#fff" />
      </svg>
    );
  }
  if (id === 'markets') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="var(--tab-a)" opacity=".3" />
        <rect className="dock-bar-r" x="6" y="12.8" width="2.9" height="5.7" rx="1.45" fill="var(--tab-b)" />
        <rect className="dock-bar-r" x="10.55" y="7" width="2.9" height="11.5" rx="1.45" fill="var(--tab-b)" />
        <rect className="dock-bar-r" x="15.1" y="10.2" width="2.9" height="8.3" rx="1.45" fill="var(--tab-b)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8L3.4 9.5A2.3 2.3 0 0 0 2.5 11.3V18.8A2.5 2.5 0 0 0 5 21.3H19A2.5 2.5 0 0 0 21.5 18.8V11.3A2.3 2.3 0 0 0 20.6 9.5Z" fill="var(--tab-a)" />
      <rect className="dock-slit" x="11.15" y="13.5" width="1.7" height="3.9" rx=".85" fill="var(--tab-b)" />
    </svg>
  );
}

function LiquidGlassDock({
  isFa,
  activeTab,
  isRunning,
  onSelectTab,
  onStartStop,
}: {
  isFa: boolean;
  activeTab: NavTab;
  isRunning: boolean;
  onSelectTab: (id: DockTabId) => void;
  onStartStop: () => Promise<void>;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const glassRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shapeClipRef = useRef<SVGPathElement | null>(null);
  const innerRef = useRef<SVGPathElement | null>(null);
  const hairRef = useRef<SVGPathElement | null>(null);
  const edgeRef = useRef<SVGPathElement | null>(null);
  const arcRef = useRef<SVGPathElement | null>(null);
  const rimGradRef = useRef<SVGLinearGradientElement | null>(null);
  const indRef = useRef<HTMLSpanElement | null>(null);
  const btnRefs = useRef<Record<DockTabId, HTMLButtonElement | null>>({
    overview: null,
    markets: null,
    portfolio: null,
    services: null,
  });

  const [popTab, setPopTab] = useState<DockTabId | null>(null);
  const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indInitRef = useRef(false);

  const isDockTab =
    activeTab === 'overview' || activeTab === 'markets' || activeTab === 'portfolio' || activeTab === 'services';

  const drawShape = useCallback(() => {
    const shell = shellRef.current;
    const glass = glassRef.current;
    const svg = svgRef.current;
    if (!shell || !glass || !svg) return;
    const W = shell.clientWidth;
    const H = shell.clientHeight;
    if (W <= 0 || H <= 0) return;

    const R = 28;
    const cx = W / 2;
    const top = `M0 ${R}A${R} ${R} 0 0 1 ${R} 0H${cx - 72}C${cx - 52} 0 ${cx - 41} 10 ${cx - 41} 24A41 41 0 0 0 ${cx + 41} 24C${cx + 41} 10 ${cx + 52} 0 ${cx + 72} 0H${W - R}A${R} ${R} 0 0 1 ${W} ${R}`;
    const open = `M0 ${H + 4}V${R}${top.slice(`M0 ${R}`.length)}V${H + 4}`;
    const closed = `${top}V${H + 200}H0Z`;

    glass.style.clipPath = `path('${closed}')`;
    (glass.style as unknown as { webkitClipPath?: string }).webkitClipPath = `path('${closed}')`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    shapeClipRef.current?.setAttribute('d', closed);
    innerRef.current?.setAttribute('d', open);
    hairRef.current?.setAttribute('d', open);
    edgeRef.current?.setAttribute('d', open);
    arcRef.current?.setAttribute('d', `M${cx - 33} 48.3A41 41 0 0 0 ${cx + 33} 48.3`);
  }, []);

  const moveInd = useCallback(
    (animate = true) => {
      const ind = indRef.current;
      const shell = shellRef.current;
      if (!ind || !shell) return;
      if (!isDockTab) {
        ind.style.opacity = '0';
        return;
      }
      const btn = btnRefs.current[activeTab as DockTabId];
      if (!btn) return;
      const s = shell.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      if (s.width <= 0 || b.width <= 0) return;
      const x = b.left - s.left + (b.width - ind.offsetWidth) / 2;
      if (!animate) ind.classList.add('no-anim');
      ind.style.opacity = '1';
      ind.style.transform = `translateX(${Math.round(x)}px)`;
      if (!animate) {
        void ind.offsetWidth;
        ind.classList.remove('no-anim');
      }
    },
    [activeTab, isDockTab],
  );

  useEffect(() => {
    drawShape();
    moveInd(indInitRef.current);
    indInitRef.current = true;

    const ro =
      typeof ResizeObserver !== 'undefined' && shellRef.current
        ? new ResizeObserver(() => {
            drawShape();
            moveInd(false);
          })
        : null;
    if (ro && shellRef.current) ro.observe(shellRef.current);

    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const dx = Math.max(-0.28, Math.min(0.28, Math.sin(y * 0.008) * 0.25));
      rimGradRef.current?.setAttribute('gradientTransform', `translate(${dx.toFixed(2)}, 0)`);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [drawShape, moveInd, isFa]);

  useEffect(() => {
    return () => {
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
    };
  }, []);

  const handleSelect = (id: DockTabId) => {
    setPopTab(null);
    requestAnimationFrame(() => setPopTab(id));
    if (popTimerRef.current) clearTimeout(popTimerRef.current);
    popTimerRef.current = setTimeout(() => setPopTab(null), 750);
    onSelectTab(id);
  };

  const leftPair: Array<{ id: DockTabId; label: string; cls: string }> = isFa
    ? [
        { id: 'services', label: 'خدمات', cls: 't-grid' },
        { id: 'portfolio', label: 'کیف پول', cls: 't-wallet' },
      ]
    : [
        { id: 'overview', label: 'Home', cls: 't-home' },
        { id: 'markets', label: 'Markets', cls: 't-market' },
      ];

  const rightPair: Array<{ id: DockTabId; label: string; cls: string }> = isFa
    ? [
        { id: 'markets', label: 'بازار', cls: 't-market' },
        { id: 'overview', label: 'خانه', cls: 't-home' },
      ]
    : [
        { id: 'portfolio', label: 'Wallet', cls: 't-wallet' },
        { id: 'services', label: 'Services', cls: 't-grid' },
      ];

  return (
    <nav className="lg:hidden liquid-shell" ref={shellRef} aria-label={isFa ? 'ناوبری اصلی' : 'Main navigation'}>
      <div className="dock-glass-body" ref={glassRef} />

      <svg className="dock-rim" ref={svgRef} fill="none" aria-hidden="true">
        <defs>
          <clipPath id="dockShapeClip">
            <path ref={shapeClipRef} />
          </clipPath>
          <filter id="dockBlurRim" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <linearGradient id="dockRimGrad" ref={rimGradRef} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--rim)" stopOpacity=".4" />
            <stop offset="28%" stopColor="var(--rim)" stopOpacity=".95" />
            <stop offset="50%" stopColor="var(--rim)" stopOpacity=".55" />
            <stop offset="72%" stopColor="var(--rim)" stopOpacity=".95" />
            <stop offset="100%" stopColor="var(--rim)" stopOpacity=".4" />
          </linearGradient>
        </defs>

        <g clipPath="url(#dockShapeClip)">
          <path ref={innerRef} stroke="var(--rim)" strokeOpacity=".42" strokeWidth="10" filter="url(#dockBlurRim)" />
        </g>
        <path ref={hairRef} stroke="var(--hairline-glass)" strokeWidth="1" />
        <path ref={edgeRef} stroke="url(#dockRimGrad)" strokeWidth="3" strokeLinecap="round" />
        <path ref={arcRef} stroke="var(--rim-soft)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>

      {/* Concentric Specular Liquid-Glass Center Bot Power Button (68px) */}
      <button
        type="button"
        onClick={() => {
          tgHaptic('medium');
          void onStartStop();
        }}
        aria-label={isRunning ? (isFa ? 'خاموش کردن ربات' : 'Turn Off Bot') : isFa ? 'روشن کردن ربات' : 'Turn On Bot'}
        title={
          isRunning
            ? isFa
              ? 'ربات روشن است (لمس برای توقف)'
              : 'Bot is ON (tap to pause)'
            : isFa
              ? 'ربات خاموش است (لمس برای شروع)'
              : 'Bot is OFF (tap to start)'
        }
        className="dock-fab z-20"
        style={{
          background: isRunning
            ? 'linear-gradient(155deg, rgba(16, 185, 129, 0.25), rgba(8, 42, 136, 0.96)), radial-gradient(circle at center, #0a36a8 0%, #051646 100%)'
            : 'linear-gradient(155deg, rgba(255, 255, 255, 0.72), rgba(226, 232, 240, 0.45)), radial-gradient(circle at center, #475569 0%, #1e293b 100%)',
          border: isRunning ? '3px solid #10B981' : '2px solid rgba(255, 255, 255, 0.92)',
          boxShadow: isRunning
            ? '0 0 0 3px rgba(16, 185, 129, 0.26), 0 12px 26px rgba(16, 185, 129, 0.45), inset 0 2px 3px rgba(255, 255, 255, 0.45), inset 0 -3px 5px rgba(5, 22, 70, 0.4)'
            : '0 8px 22px rgba(25, 45, 90, 0.2), inset 0 2px 3px rgba(255, 255, 255, 0.85), inset 0 -3px 5px rgba(30, 50, 90, 0.22)',
        }}
      >
        <img
          src="/logo.png"
          alt="Dollarino Bot"
          className={`w-[46px] h-[46px] rounded-full object-contain transition-all duration-300 select-none ${
            isRunning ? 'scale-105' : 'grayscale contrast-125 opacity-80'
          }`}
        />
        {isRunning && (
          <span className="absolute -top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[#10B981] border-2 border-[var(--panel)] shadow-sm" />
        )}
      </button>

      {/* 4 Surrounding Animated Liquid-Glass Tabs */}
      <div className="dock-tabs" role="tablist">
        <div className="dock-pair">
          {leftPair.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  btnRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelect(tab.id)}
                className={`liquid-tab ${tab.cls}${popTab === tab.id ? ' pop' : ''}`}
              >
                <LiquidDockSvg id={tab.id} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div aria-hidden="true" />

        <div className="dock-pair">
          {rightPair.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  btnRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelect(tab.id)}
                className={`liquid-tab ${tab.cls}${popTab === tab.id ? ' pop' : ''}`}
              >
                <LiquidDockSvg id={tab.id} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliding Glowing Amber Bottom Pill */}
      <span className="dock-ind" ref={indRef} aria-hidden="true" />
    </nav>
  );
}

export function Layout({
  lang,
  setLang,
  uiMode = 'simple',
  onToggleUiMode,
  currentLook,
  onSelectLook,
  activeTab,
  setActiveTab,
  user,
  entitlement,
  botState,
  tradingMode,
  activeExchangeLabel,
  freeBalance,
  markets = [],
  openTradesCount = 0,
  recentSignalsCount = 0,
  onStartStop,
  onKillSwitch,
  onSelectSymbolForTerminal,
  onRefresh,
  onGoLanding,
  onOpenSupport,
  onLogout,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  uiMode?: UiMode;
  onToggleUiMode?: (m: UiMode) => void;
  currentLook: LookId;
  onSelectLook: (look: LookId) => void;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  user: AuthUserInfo;
  entitlement?: EntitlementSummary | null;
  botState: string;
  tradingMode: 'PAPER' | 'LIVE';
  activeExchangeLabel: string;
  freeBalance: string;
  markets?: ExchangeMarket[];
  openTradesCount?: number;
  recentSignalsCount?: number;
  onStartStop: () => Promise<void>;
  onKillSwitch: () => Promise<void>;
  onResetDemo?: () => Promise<void>;
  onSelectSymbolForTerminal?: (sym: string) => void;
  onRefresh?: () => Promise<void>;
  onGoLanding?: () => void;
  onOpenSupport?: () => void;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const isFa = lang === 'fa';
  void activeExchangeLabel;
  const isRunning = botState.startsWith('RUNNING');
  const isAdmin = user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'OWNER';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; category: string; title: string; body: string; is_read: number; created_at: string }>>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [qtOpen, setQtOpen] = useState(false);
  const [qtSymbol, setQtSymbol] = useState('BTCUSDT');
  const [qtSide, setQtSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [qtLev, setQtLev] = useState(uiMode === 'simple' ? 5 : 10);
  const [qtBusy, setQtBusy] = useState(false);
  const [qtErr, setQtErr] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingTradeConfirmation | null>(null);
  const [clock, setClock] = useState('');

  const loadNotifications = async () => {
    try {
      const r = await apiFetch<{ notifications: typeof notifications; unread: number }>('/api/trading/notifications');
      setNotifications(r.notifications || []);
      setUnreadNotifs(r.unread || 0);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    void loadNotifications();
    const iv = setInterval(() => void loadNotifications(), 20_000);
    return () => {
      clearInterval(iv);
    };
  }, [onRefresh]);

  const toggleDayNight = () => {
    tgHaptic('light');
    onSelectLook(currentLook === 'paper' ? 'cosmic' : 'paper');
  };

  useEffect(() => {
    const f = () =>
      setClock(new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    f();
    const iv = setInterval(f, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setQtOpen(false);
        setPendingConfirm(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allTabs: NavTab[] = [
    ...MAIN_VIEWS.map((x) => x.id),
    'card',
    ...ACCOUNT_VIEWS.map((x) => x.id),
    ...(isAdmin ? (['admin'] as NavTab[]) : []),
  ];

  const filteredTabs = useMemo(() => {
    const q = paletteQ.trim().toLowerCase();
    if (!q) return allTabs;
    return allTabs.filter((id) => tabLabel(id, lang).toLowerCase().includes(q) || id.includes(q));
  }, [paletteQ, lang, isAdmin]);

  const filteredMarkets = useMemo(() => {
    const q = paletteQ.trim().toLowerCase();
    const list = markets.length ? markets : [];
    if (!q) return list.slice(0, 5);
    return list.filter((m) => m.symbol.toLowerCase().includes(q) || m.base.toLowerCase().includes(q)).slice(0, 5);
  }, [markets, paletteQ]);

  const selectTab = (id: NavTab) => {
    tgHaptic('light');
    setActiveTab(id);
    setDrawerOpen(false);
    setPaletteOpen(false);
    setPaletteQ('');
  };

  const tickerCoins = markets.slice(0, 12);

  const openQuickTradeModal = (sym?: string) => {
    tgHaptic('medium');
    if (sym) setQtSymbol(sym);
    setQtErr('');
    setQtOpen(true);
  };

  const prepareQuickConfirm = () => {
    const m = markets.find((x) => x.symbol === qtSymbol);
    const px = Number(m?.lastPrice || 0);
    const dec = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
    const sl = px > 0 ? (qtSide === 'LONG' ? px * 0.985 : px * 1.015).toFixed(dec) : undefined;
    const tp1 = px > 0 ? (qtSide === 'LONG' ? px * 1.025 : px * 0.975).toFixed(dec) : undefined;
    setQtOpen(false);
    setPendingConfirm({
      symbol: qtSymbol,
      direction: qtSide,
      orderType: 'MARKET',
      entryPrice: px > 0 ? px.toFixed(dec) : undefined,
      leverage: qtLev,
      stopLoss: sl,
      tp1,
      tradingMode,
    });
  };

  const executeConfirmedQuickTrade = async () => {
    if (!pendingConfirm) return;
    setQtBusy(true);
    setQtErr('');
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol: pendingConfirm.symbol,
          direction: pendingConfirm.direction,
          orderType: 'MARKET',
          leverage: pendingConfirm.leverage,
          marginMode: 'ISOLATED',
          stopLoss: pendingConfirm.stopLoss,
          tp1: pendingConfirm.tp1,
        }),
      });
      if (!res.ok) {
        tgNotifyHaptic('error');
        setQtErr(res.error || 'Order failed');
        setPendingConfirm(null);
        setQtOpen(true);
      } else {
        tgNotifyHaptic('success');
        setPendingConfirm(null);
        await onRefresh?.();
        setActiveTab('terminal');
      }
    } catch (e) {
      tgNotifyHaptic('error');
      setQtErr(e instanceof Error ? e.message : 'Order failed');
      setPendingConfirm(null);
      setQtOpen(true);
    } finally {
      setQtBusy(false);
    }
  };

  const renderModeSwitcher = (compact?: boolean) =>
    onToggleUiMode ? (
      <div
        className="relative grid grid-cols-2 p-0.5 rounded-full border hairline bg-[var(--soft)] shrink-0"
        role="group"
        aria-label={isFa ? 'انتخاب سطح تجربه کاربری' : 'Interface Mode'}
      >
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 rounded-full pointer-events-none ios-pill-active"
          style={{
            width: 'calc(50% - 2px)',
            insetInlineStart: uiMode === 'pro' ? '50%' : '2px',
            transition: 'inset-inline-start 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
        <button
          type="button"
          onClick={() => {
            tgHaptic('light');
            onToggleUiMode('simple');
          }}
          className={`relative z-10 ${compact ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-xs'} rounded-full font-bold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors duration-300 active:scale-95 ${
            uiMode === 'simple' ? 'text-white' : 'text-dim hover:text-main'
          }`}
        >
          <Sprout className={`${compact ? 'hidden sm:inline ' : ''}w-3 h-3 shrink-0`} />
          <span>{isFa ? 'ساده' : 'Simple'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            tgHaptic('light');
            onToggleUiMode('pro');
          }}
          className={`relative z-10 ${compact ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-xs'} rounded-full font-bold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors duration-300 active:scale-95 ${
            uiMode === 'pro' ? 'text-white' : 'text-dim hover:text-main'
          }`}
        >
          <Zap className={`${compact ? 'hidden sm:inline ' : ''}w-3 h-3 shrink-0`} />
          <span>{isFa ? 'حرفه‌ای' : 'Pro'}</span>
        </button>
      </div>
    ) : null;

  const renderSidebarBody = (mobile?: boolean) => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-5">
        <DollarinoCoinMark size={42} />
        <div>
          <p className="font-display font-bold text-[20px] leading-none text-main">
            Dollarino<span style={{ color: 'var(--gold-soft)' }}>.</span>
          </p>
          <p className="text-[9px] font-black tracking-[0.2em] mt-1" style={{ color: 'var(--gold-soft)' }}>
            {uiMode === 'simple' ? (isFa ? 'نسخه آسان ۱۰ تا ۸۰ ساله' : 'SIMPLE EDITION') : 'PRO QUANT DESK'}
          </p>
        </div>
        {mobile && (
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="ms-auto lg:hidden h-9 w-9 grid place-items-center rounded-full btn-ghost"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {onToggleUiMode && (
        <div className="mb-4 px-1 flex items-center justify-center">{renderModeSwitcher()}</div>
      )}

      {uiMode === 'simple' ? (
        <>
          <p className="px-3.5 text-[10px] font-black tracking-wider text-dim mb-2">
            {isFa ? 'منوی سریع و آسان' : 'EASY MENU'}
          </p>
          <div className="space-y-1">
            {SIMPLE_VIEWS.map((item) => {
              const Icon = item.icon;
              const on = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-bold transition-all ${
                    on ? 'ios-pill-active' : 'text-sub hover:text-main hover:bg-[var(--soft)]'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              tgHaptic('medium');
              onToggleUiMode?.('pro');
            }}
            className="mt-5 w-full rounded-2xl p-3.5 text-start surface-soft hover:border-[var(--line-strong)] transition space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-main flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--gold-soft)' }} />
                <span>{isFa ? 'حالت حرفه‌ای‌ها' : 'Unlock Pro Desk'}</span>
                <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
              </span>
            </div>
            <p className="text-[11px] text-dim leading-relaxed">
              {isFa
                ? 'چارت کندلی، رادار، بک‌تستر، کپی‌ترید و اتصال API صرافی'
                : 'Charts, Radar, Backtester, Copy-Trade & API Keys'}
            </p>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => selectTab('admin')}
              className={`mt-3 w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[13px] font-bold transition ${
                activeTab === 'admin' ? 'ios-pill-active' : 'text-flame hover:bg-[#FF8200]/10'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span className="truncate">{isFa ? 'پنل مدیریت' : 'Admin'}</span>
            </button>
          )}
        </>
      ) : (
        <>
          <p className="px-3.5 text-[9px] font-black tracking-[0.2em] text-dim mb-2">
            {isFa ? 'میز کار حرفه‌ای' : 'PRO VIEWS'}
          </p>
          <div className="space-y-0.5">
            {MAIN_VIEWS.map((item) => {
              const Icon = item.icon;
              const on = activeTab === item.id;
              const badge = item.id === 'radar' ? recentSignalsCount : item.id === 'terminal' ? openTradesCount : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all ${
                    on ? 'bg-[color:color-mix(in_srgb,var(--gold)_18%,transparent)] text-main' : 'text-dim hover:text-main hover:bg-[var(--soft)]'
                  }`}
                >
                  {on && (
                    <span
                      className="absolute start-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full"
                      style={{ background: 'var(--gold-soft)', boxShadow: '0 0 12px var(--gold)' }}
                    />
                  )}
                  <Icon className="w-[18px] h-[18px] shrink-0" style={on ? { color: 'var(--gold-soft)' } : undefined} />
                  <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
                  {badge > 0 && (
                    <span
                      dir="ltr"
                      className="ms-auto text-[10px] font-black rounded-full px-2 py-0.5 tabular bg-jade text-black"
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="px-3.5 text-[9px] font-black tracking-[0.2em] text-dim mt-5 mb-2">
            {isFa ? 'استودیو' : 'STUDIO'}
          </p>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => selectTab('card')}
              className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all ${
                activeTab === 'card'
                  ? 'bg-[color:color-mix(in_srgb,var(--gold)_18%,transparent)] text-main'
                  : 'text-dim hover:text-main hover:bg-[var(--soft)]'
              }`}
            >
              <Image className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate">{isFa ? 'کارت سود' : 'Profit Card'}</span>
            </button>

            <button
              type="button"
              onClick={toggleDayNight}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold text-dim hover:text-main hover:bg-[var(--soft)] transition"
            >
              {currentLook === 'paper' ? <Moon className="w-[18px] h-[18px] shrink-0" /> : <Sun className="w-[18px] h-[18px] shrink-0 text-[#F59E0B]" />}
              <span className="truncate">{currentLook === 'paper' ? (isFa ? 'حالت شب آیفونی' : 'Night Mode') : isFa ? 'حالت روز آیفونی' : 'Day Mode'}</span>
            </button>
          </div>

          <p className="px-3.5 text-[9px] font-black tracking-[0.2em] text-dim mt-5 mb-2">
            {isFa ? 'حساب کاربری' : 'ACCOUNT'}
          </p>
          <div className="space-y-0.5">
            {ACCOUNT_VIEWS.map((item) => {
              const Icon = item.icon;
              const on = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all ${
                    on ? 'bg-[color:color-mix(in_srgb,var(--gold)_18%,transparent)] text-main' : 'text-dim hover:text-main hover:bg-[var(--soft)]'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" style={on ? { color: 'var(--gold-soft)' } : undefined} />
                  <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
                </button>
              );
            })}

            {isAdmin && (
              <button
                type="button"
                onClick={() => selectTab('admin')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition ${
                  activeTab === 'admin' ? 'btn-gold' : 'text-flame hover:bg-[#FF8200]/10'
                }`}
              >
                <Shield className="w-[18px] h-[18px] shrink-0" />
                <span className="truncate">{isFa ? 'پنل مدیریت' : 'Admin'}</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Bottom Engine Card */}
      <div className="mt-auto pt-5 space-y-2.5">
        <div className="panel rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'live-dot bg-jade' : 'live-gold'}`} style={!isRunning ? { background: 'var(--gold-soft)' } : undefined} />
            <p className="text-xs font-bold text-main">
              {isRunning ? (isFa ? 'ربات روشن است' : 'Bot Active 24/7') : isFa ? 'ربات آماده است' : 'Ready to Trade'}
            </p>
          </div>
          <p className="text-[10px] text-dim truncate">
            {entitlement?.hasPaidPlan
              ? `${isFa ? entitlement.planNameFa : entitlement.planNameEn}`
              : isFa
                ? 'نیازمند اشتراک فعال'
                : 'Subscription Required'}
          </p>
          <button
            type="button"
            onClick={toggleDayNight}
            className="mt-2.5 w-full py-1.5 px-2.5 rounded-xl surface-soft text-[11px] font-bold text-main flex items-center justify-center gap-1.5 hover:border-[var(--line-strong)] transition"
          >
            {currentLook === 'paper' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>{isFa ? 'تغییر به حالت شب' : 'Switch to Night'}</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>{isFa ? 'تغییر به حالت روز' : 'Switch to Day'}</span>
              </>
            )}
          </button>
        </div>

        {isRunning && (
          <button
            type="button"
            onClick={() => void onKillSwitch()}
            className="w-full py-2.5 px-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{isFa ? 'توقف اضطراری و بستن همه' : 'Emergency Kill Switch'}</span>
          </button>
        )}

        <div className="surface-soft rounded-xl px-3 py-2 text-[10px] text-dim space-y-1 border hairline">
          <p className="font-bold text-main">
            {isFa ? '👨‍💻 سازنده: آوید کیا' : '👨‍💻 Creator: Avid Kiya'}
          </p>
          <div className="flex flex-wrap gap-2" dir="ltr">
            <a href="https://t.me/avidkiya" target="_blank" rel="noreferrer" className="hover:text-main underline">
              TG: @avidkiya
            </a>
            <a href="https://instagram.com/avid_kiya" target="_blank" rel="noreferrer" className="hover:text-main underline">
              IG/X: @avid_kiya
            </a>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-semibold text-dim px-1">
          {onOpenSupport ? (
            <button type="button" onClick={onOpenSupport} className="inline-flex items-center gap-1 hover:text-main transition">
              <Headphones className="w-3 h-3 text-jade" />
              <span>{isFa ? 'پشتیبانی آنلاین' : 'Support'}</span>
            </button>
          ) : (
            <span className="truncate">{user.username}</span>
          )}
          <button type="button" onClick={() => void onLogout()} className="inline-flex items-center gap-1 hover:text-loss transition">
            <LogOut className="w-3 h-3" />
            <span>{isFa ? 'خروج' : 'Sign Out'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex flex-col overflow-x-hidden max-w-full">
      <div className="flex-1 flex min-w-0">
        <aside
          className="hidden lg:flex w-64 shrink-0 border-e border-[var(--glass-border)] p-4 flex-col sticky top-0 h-screen overflow-y-auto backdrop-blur-2xl"
          style={{ background: 'var(--panel-translucent)' }}
        >
          {renderSidebarBody()}
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-black/70 backdrop-blur-sm flex" onClick={() => setDrawerOpen(false)}>
            <div
              className="w-72 max-w-[85vw] h-full p-5 bg-[var(--bg-surface)] border-e hairline overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {renderSidebarBody(true)}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          {/* Unified Consistent Frosted Liquid-Glass Header (Clean & spacious on mobile) */}
          <header
            className="sticky top-0 z-30 lg:backdrop-blur-2xl border-b border-[var(--glass-border)]"
            style={{ background: 'var(--header-glass)' }}
          >
            <div className="mx-auto max-w-7xl px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Menu"
                  className="lg:hidden h-8 w-8 grid place-items-center rounded-xl bg-[var(--soft)] border border-[var(--glass-border)] shrink-0 hover:brightness-95 transition"
                >
                  <Menu className="w-4 h-4 text-main" />
                </button>
                <button
                  type="button"
                  onClick={() => selectTab('services')}
                  className="flex items-center gap-2 text-start group min-w-0"
                >
                  <span className="hidden sm:grid h-8 w-8 rounded-full surface-soft place-items-center text-main font-display font-bold text-xs border border-[var(--glass-border)] shrink-0 overflow-hidden shadow-sm">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.username}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      user.username.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div className="leading-tight min-w-0">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-main whitespace-nowrap">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${isRunning ? 'bg-[#10B981] live-dot' : 'bg-slate-400'}`} />
                      <span className="font-num truncate">{isFa ? getPersianToday() : clock}</span>
                    </span>
                    <span className="text-[10px] text-dim hidden sm:inline truncate">{user.username}</span>
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden lg:flex flex-1 max-w-xs items-center gap-2.5 panel rounded-2xl px-3.5 py-1.5 text-[12px] text-dim hover:border-[var(--line-strong)] transition text-start"
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{isFa ? 'جستجوی صفحه یا ارز...' : 'Search views or coins...'}</span>
                <kbd dir="ltr" className="ms-auto text-[9px] border hairline rounded px-1.5 py-0.5">
                  ⌘K
                </kbd>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                {renderModeSwitcher(true)}

                <button
                  type="button"
                  onClick={() => selectTab('aichat')}
                  aria-label={isFa ? 'چت هوش مصنوعی AI' : 'AI Chat'}
                  title={isFa ? 'چت هوش مصنوعی + تحلیل عکس چارت' : 'AI Chat & Chart Vision'}
                  className={`hidden lg:inline-flex h-8 px-2.5 items-center gap-1 rounded-xl border transition text-[11px] font-bold ${
                    activeTab === 'aichat'
                      ? 'bg-[var(--cobalt)] text-white border-[var(--cobalt)]'
                      : 'bg-[var(--soft)] border-[var(--glass-border)] text-main hover:brightness-95'
                  }`}
                >
                  <Sparkles className="w-[14px] h-[14px] text-[var(--gold)] shrink-0" />
                  <span>{isFa ? 'چت AI' : 'AI Chat'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => (onOpenSupport ? onOpenSupport() : selectTab('faq'))}
                  aria-label={isFa ? 'پشتیبانی آنلاین' : 'Online Support'}
                  title={isFa ? 'پشتیبانی آنلاین' : 'Online Support'}
                  className="relative h-8 w-8 sm:w-auto sm:px-2.5 inline-flex items-center justify-center gap-1 rounded-xl bg-[var(--soft)] border border-[var(--glass-border)] hover:brightness-95 transition text-[11px] font-bold text-main shrink-0"
                >
                  <Headphones className="w-[15px] h-[15px] text-jade shrink-0" />
                  <span className="hidden sm:inline">{isFa ? 'پشتیبانی' : 'Support'}</span>
                  <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-[#10B981] ring-2 ring-[var(--bg)]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    if (!notifOpen && unreadNotifs > 0) {
                      void apiFetch('/api/trading/notifications/read', { method: 'POST' }).catch(() => {});
                      setUnreadNotifs(0);
                    }
                  }}
                  aria-label={isFa ? 'اعلان‌ها' : 'Notifications'}
                  title={isFa ? 'اعلان‌ها' : 'Notifications'}
                  className="relative h-8 w-8 grid place-items-center rounded-xl bg-[var(--soft)] border border-[var(--glass-border)] hover:brightness-95 transition shrink-0"
                >
                  <Bell className="w-[15px] h-[15px] text-main" />
                  {unreadNotifs > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-[#F59E0B] ring-2 ring-[var(--bg)]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleDayNight}
                  aria-label="Toggle day or night"
                  title={isFa ? 'حالت روز / شب' : 'Day / Night'}
                  className="h-8 w-8 grid place-items-center rounded-xl bg-[var(--soft)] border border-[var(--glass-border)] hover:brightness-95 transition shrink-0"
                >
                  {currentLook === 'paper' ? (
                    <Moon className="w-[15px] h-[15px] text-[var(--gold)]" />
                  ) : (
                    <Sun className="w-[15px] h-[15px] text-[#F59E0B]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setLang(isFa ? 'en' : 'fa')}
                  className="hidden md:inline-flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-full hover:bg-[var(--soft)] transition"
                >
                  <Globe className="w-3.5 h-3.5" style={{ color: 'var(--gold-soft)' }} />
                  <span>{isFa ? 'EN' : 'فارسی'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectTab('portfolio')}
                  className="hidden md:inline-flex items-center gap-1.5 panel rounded-full px-3 py-1 text-xs font-bold"
                >
                  <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--jade)' }} />
                  <span dir="ltr" className="tabular text-main font-num">
                    ${Number(freeBalance || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('medium');
                    void onStartStop();
                  }}
                  className={`hidden md:inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full transition ${
                    isRunning ? 'bg-[#0D9455] hover:bg-[#059669] text-white' : 'btn-emerald'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isRunning ? (isFa ? 'توقف ربات' : 'Stop') : isFa ? 'شروع ربات' : 'Start Bot'}</span>
                </button>
              </div>
            </div>

            {tickerCoins.length > 0 && uiMode === 'pro' && (
              <div dir="ltr" className="border-t hairline bg-black/5 dark:bg-black/20 overflow-hidden">
                <div className="flex w-max gap-8 px-5 py-1.5 animate-ticker">
                  {[...tickerCoins, ...tickerCoins].map((c, idx) => {
                    const ch = Number(c.changePct24h || 0);
                    const px = Number(c.lastPrice || 0);
                    return (
                      <button
                        key={`${c.symbol}-${idx}`}
                        type="button"
                        onClick={() => {
                          onSelectSymbolForTerminal?.(c.symbol);
                          selectTab('terminal');
                        }}
                        className="flex items-center gap-2 text-[11px] font-semibold whitespace-nowrap hover:opacity-75 transition"
                      >
                        <CoinIcon symbol={c.symbol} size={15} />
                        <span className="font-bold text-main">{c.base}</span>
                        <span dir="ltr" className="text-dim tabular font-num">
                          ${px >= 100 ? px.toLocaleString('en-US', { maximumFractionDigits: 2 }) : px.toFixed(px >= 1 ? 3 : 5)}
                        </span>
                        <span dir="ltr" className={`tabular font-bold inline-flex items-center gap-0.5 ${ch >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {ch >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span>{Math.abs(ch).toFixed(2)}%</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </header>

          <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-6 py-5 pb-32 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* Notifications Popover */}
      {notifOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px]"
            onClick={() => setNotifOpen(false)}
          >
            <div
              className="pop-in fixed top-16 end-3 sm:end-8 w-[92vw] max-w-sm panel rounded-[26px] p-4 shadow-2xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b hairline pb-2.5">
                <span className="font-display font-bold text-sm text-main flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#F59E0B]" />
                  {isFa ? 'اعلان‌ها و رویدادها' : 'Live Notifications'}
                </span>
                <button type="button" onClick={() => setNotifOpen(false)} className="h-7 w-7 rounded-full btn-ghost grid place-items-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <p className="text-xs text-dim py-6 text-center">
                    {isFa ? 'اعلان جدیدی ثبت نشده است.' : 'No notifications yet.'}
                  </p>
                ) : (
                  notifications.slice(0, 12).map((n) => (
                    <div key={n.id} className="surface-soft rounded-2xl p-3 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-main truncate">{n.title}</span>
                        <span className="text-[10px] text-dim shrink-0">{n.created_at.slice(11, 16)}</span>
                      </div>
                      <p className="text-[11px] text-sub leading-relaxed">{n.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      <LiquidGlassDock
        isFa={isFa}
        activeTab={activeTab}
        isRunning={isRunning}
        onSelectTab={(id) => selectTab(id)}
        onStartStop={onStartStop}
      />

      {/* Command Palette (⌘K) */}
      {paletteOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm p-4 grid place-items-start justify-items-center pt-[12vh]"
            onClick={() => setPaletteOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="pop-in w-full max-w-lg panel rounded-3xl overflow-hidden shadow-2xl border hairline"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center gap-3 px-5 py-4 border-b hairline">
              <Command className="w-5 h-5 shrink-0" style={{ color: 'var(--gold-soft)' }} />
              <input
                autoFocus
                value={paletteQ}
                onChange={(e) => setPaletteQ(e.target.value)}
                placeholder={isFa ? 'جستجوی صفحه یا ارز...' : 'Jump to view or market...'}
                className="bg-transparent flex-1 outline-none text-sm font-medium text-main"
              />
              <kbd className="text-[10px] font-bold text-dim border hairline rounded-md px-1.5 py-0.5">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-3 space-y-3">
              {filteredTabs.length > 0 && (
                <div>
                  <p className="px-3 text-[9px] font-black tracking-widest text-dim mb-1.5">{isFa ? 'صفحات' : 'VIEWS'}</p>
                  {filteredTabs.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectTab(id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--soft)] transition text-start font-semibold text-sm text-main"
                    >
                      <LayoutDashboard className="w-4 h-4" style={{ color: 'var(--gold-soft)' }} />
                      <span>{tabLabel(id, lang)}</span>
                    </button>
                  ))}
                </div>
              )}

              {filteredMarkets.length > 0 && (
                <div>
                  <p className="px-3 text-[9px] font-black tracking-widest text-dim mb-1.5">{isFa ? 'ارزهای بازار' : 'MARKETS'}</p>
                  {filteredMarkets.map((c) => {
                    const ch = Number(c.changePct24h || 0);
                    return (
                      <button
                        key={c.symbol}
                        type="button"
                        onClick={() => {
                          onSelectSymbolForTerminal?.(c.symbol);
                          selectTab('terminal');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--soft)] transition font-semibold text-sm text-main"
                      >
                        <CoinIcon symbol={c.symbol} size={24} />
                        <span>{c.symbol}</span>
                        <span dir="ltr" className="ms-auto tabular text-dim">
                          ${Number(c.lastPrice).toLocaleString()}
                        </span>
                        <span dir="ltr" className={`tabular text-xs font-bold ${ch >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {ch >= 0 ? '+' : ''}
                          {ch.toFixed(2)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </div>,
          document.body
        )}

      {/* iPhone QuickTrade Modal */}
      {qtOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-md p-4 grid place-items-center overflow-y-auto"
            onClick={() => setQtOpen(false)}
          >
          <div
            role="dialog"
            aria-modal="true"
            className="pop-in w-full max-w-sm panel rounded-[30px] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={qtSymbol} size={38} />
                <div>
                  <p className="font-display font-bold text-lg text-main">{qtSymbol}</p>
                  <p className="text-[11px] text-dim">{isFa ? 'معامله سریع و محافظت‌شده' : 'Protected Quick Order'}</p>
                </div>
              </div>
              <button type="button" onClick={() => setQtOpen(false)} className="h-9 w-9 grid place-items-center rounded-full btn-ghost">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQtSymbol(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-black shrink-0 ${
                    qtSymbol === s ? 'btn-cobalt' : 'btn-ghost text-dim'
                  }`}
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl surface-soft">
              {(['LONG', 'SHORT'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQtSide(s)}
                  className={`py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition ${
                    qtSide === s
                      ? s === 'LONG'
                        ? 'btn-emerald'
                        : 'bg-rose-500 text-white'
                      : 'text-dim'
                  }`}
                >
                  {s === 'LONG' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>
                    {s === 'LONG' ? (isFa ? 'بالا میره (خرید)' : 'Going UP') : isFa ? 'پایین میاد (فروش)' : 'Going DOWN'}
                  </span>
                </button>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-dim">{isFa ? 'سرعت (اهرم محافظت‌شده)' : 'Speed (Leverage)'}</span>
                <span dir="ltr" className="font-num font-bold" style={{ color: 'var(--gold-soft)' }}>
                  {qtLev}×
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={uiMode === 'simple' ? 15 : 50}
                value={qtLev}
                onChange={(e) => setQtLev(Number(e.target.value))}
                className="w-full"
                style={{ ['--fill' as string]: `${((qtLev - 1) / ((uiMode === 'simple' ? 15 : 50) - 1)) * 100}%` }}
              />
            </div>

            {qtErr && <div className="text-xs text-loss font-bold">{qtErr}</div>}

            <button
              type="button"
              onClick={prepareQuickConfirm}
              className="btn-cobalt w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2"
            >
              <Rocket className="w-4 h-4" />
              <span>{isFa ? 'دلارینو ترید کن برام' : 'Execute Protected Trade'}</span>
            </button>
          </div>
          </div>,
          document.body
        )}

      <ConfirmTradeSheet
        open={Boolean(pendingConfirm)}
        lang={lang}
        order={pendingConfirm}
        busy={qtBusy}
        onConfirm={executeConfirmedQuickTrade}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
