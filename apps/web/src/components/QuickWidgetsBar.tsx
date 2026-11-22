import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Flame,
  KeyRound,
  Power,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo, DashboardPayload, NavTab } from '../lib/types';
import type { UiMode } from './Layout';

export type WidgetId = 'bot_toggle' | 'kill_switch' | 'live_report' | 'dex_radar' | 'mode_switch';

export const DEFAULT_WIDGET_ORDER: WidgetId[] = ['bot_toggle', 'live_report', 'dex_radar', 'kill_switch', 'mode_switch'];

const WIDGET_META: Record<WidgetId, { fa: string; en: string }> = {
  bot_toggle: { fa: 'روشن / خاموش فوری ربات', en: 'Bot On/Off Switch' },
  live_report: { fa: 'گزارش لحظه‌ای موجودی و سود', en: 'Live PnL & Balance' },
  dex_radar: { fa: 'رادار DexScreener و Trust Wallet', en: 'DexScreener & TW' },
  kill_switch: { fa: 'توقف اضطراری (Kill Switch)', en: 'Emergency Kill Switch' },
  mode_switch: { fa: 'تغییر حالت ساده / حرفه‌ای', en: 'Simple / Pro Switch' },
};

export function QuickWidgetsBar({
  lang,
  uiMode,
  user,
  dashboard,
  onToggleBot,
  onKillSwitch,
  onToggleUiMode,
  onNavigate,
  onUserUpdated,
}: {
  lang: Lang;
  uiMode: UiMode;
  user: AuthUserInfo;
  dashboard: DashboardPayload;
  onToggleBot: () => Promise<void>;
  onKillSwitch: () => Promise<void>;
  onToggleUiMode?: (next: UiMode) => void;
  onNavigate: (tab: NavTab) => void;
  onUserUpdated: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [widgets, setWidgets] = useState<WidgetId[]>(() => {
    const raw = user.mobile_widgets;
    if (Array.isArray(raw) && raw.length) {
      return raw.filter((x): x is WidgetId => x in WIDGET_META);
    }
    return DEFAULT_WIDGET_ORDER;
  });
  const [customizing, setCustomizing] = useState(false);
  const [extOpen, setExtOpen] = useState(false);
  const [extKey, setExtKey] = useState(user.extension_api_key || '');
  const [extErr, setExtErr] = useState('');
  const [extOkMsg, setExtOkMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const isRunning = dashboard.config.bot_state.startsWith('RUNNING');
  const openPnl = dashboard.openTrades.reduce((acc, t) => acc + Number(t.unrealized_pnl || 0), 0);

  const persistWidgets = async (next: WidgetId[]) => {
    setWidgets(next);
    await apiFetch('/api/auth/ui-preferences', {
      method: 'PATCH',
      body: JSON.stringify({ mobileWidgets: next }),
    }).catch(() => {});
  };

  const toggleWidgetVisibility = (id: WidgetId) => {
    const exists = widgets.includes(id);
    const next = exists ? widgets.filter((w) => w !== id) : [...widgets, id];
    if (next.length === 0) return;
    void persistWidgets(next);
  };

  const moveWidget = (id: WidgetId, dir: -1 | 1) => {
    const idx = widgets.indexOf(id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= widgets.length) return;
    const next = [...widgets];
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    void persistWidgets(next);
  };

  const handleGenerateExtKey = async (rotate = false) => {
    setBusy(true);
    setExtErr('');
    setExtOkMsg('');
    try {
      const res = await apiFetch<{ extensionApiKey?: string; error?: string }>('/api/auth/extension-key', {
        method: 'POST',
        body: JSON.stringify({ rotate }),
      });
      if (res.extensionApiKey) {
        setExtKey(res.extensionApiKey);
        setExtOkMsg(isFa ? 'کلید اتصال اختصاصی با موفقیت ایجاد و آماده کپی شد.' : 'Extension key generated & synced.');
        await onUserUpdated();
      } else {
        setExtErr(res.error || (isFa ? 'ساخت کلید ناموفق بود.' : 'Key generation failed.'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setExtErr(
        msg.includes('404') || msg.includes('Route not found')
          ? isFa
            ? 'سرور API نیاز به همگام‌سازی نسخه جدید (Deploy Worker v9.7) دارد. پس از انتشار Worker، این دکمه کلید اختصاصی dlr_ext_ شما را می‌سازد.'
            : 'API Worker needs v9.7 deployment before generating extension keys.'
          : msg
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCopyKey = () => {
    if (!extKey) return;
    navigator.clipboard.writeText(extKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="panel rounded-3xl p-3.5 space-y-3 border border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-black text-main">
          <Smartphone className="w-4 h-4 text-[var(--gold)]" />
          <span>{isFa ? 'ویجت‌های کنترل سریع موبایل و اکستنشن مرورگر' : 'Quick Mobile Widgets & Browser Extension'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setExtOpen((v) => !v);
              if (!extKey && !extOpen) void handleGenerateExtKey(false);
            }}
            className="btn-cobalt px-3 py-1 rounded-xl text-[11px] font-black inline-flex items-center gap-1"
          >
            <KeyRound className="w-3 h-3" />
            <span>{isFa ? 'اکستنشن کروم' : 'Extension'}</span>
          </button>
          <button
            type="button"
            onClick={() => setCustomizing((v) => !v)}
            className="btn-ghost px-2.5 py-1 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{isFa ? 'سفارشی‌سازی ویجت‌ها' : 'Customize'}</span>
          </button>
        </div>
      </div>

      {/* Rendered Customizable Widget Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {widgets.map((wId) => {
          if (wId === 'bot_toggle') {
            return (
              <button
                key={wId}
                type="button"
                onClick={() => void onToggleBot()}
                className={`rounded-2xl p-2.5 text-start transition border ${
                  isRunning
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-jade'
                    : 'surface-soft border-white/10 text-main hover:border-[var(--gold)]/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Power className="w-4 h-4" />
                  <span className="text-[10px] font-black">{isRunning ? (isFa ? 'روشن' : 'ON') : isFa ? 'خاموش' : 'OFF'}</span>
                </div>
                <p className="text-[11px] font-black mt-1.5">{isFa ? 'ربات تریدر' : 'Trading Bot'}</p>
              </button>
            );
          }
          if (wId === 'live_report') {
            return (
              <button
                key={wId}
                type="button"
                onClick={() => onNavigate('portfolio')}
                className="surface-soft rounded-2xl p-2.5 text-start border border-white/10 hover:border-[var(--gold)]/40 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-dim">{isFa ? 'موجودی / سود باز' : 'Bal / Open PnL'}</span>
                </div>
                <p dir="ltr" className="text-xs font-num font-black text-main mt-1">
                  ${Number(dashboard.balance.total || 0).toFixed(0)}{' '}
                  <span className={openPnl >= 0 ? 'text-jade' : 'text-loss'}>
                    ({openPnl >= 0 ? '+' : ''}
                    ${openPnl.toFixed(1)})
                  </span>
                </p>
              </button>
            );
          }
          if (wId === 'dex_radar') {
            return (
              <button
                key={wId}
                type="button"
                onClick={() => onNavigate('dex')}
                className="surface-soft rounded-2xl p-2.5 text-start border border-amber-500/25 hover:border-amber-500/60 transition"
              >
                <div className="flex items-center justify-between text-amber-400">
                  <Flame className="w-4 h-4" />
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <p className="text-[11px] font-black text-main mt-1.5">{isFa ? 'رادار DEX و تراست‌ولت' : 'DEX & Trust Wallet'}</p>
              </button>
            );
          }
          if (wId === 'kill_switch') {
            return (
              <button
                key={wId}
                type="button"
                onClick={() => void onKillSwitch()}
                className="rounded-2xl p-2.5 text-start bg-rose-500/12 border border-rose-500/35 text-loss hover:bg-rose-500/20 transition"
              >
                <div className="flex items-center justify-between">
                  <ShieldAlert className="w-4 h-4" />
                  <span className="text-[10px] font-black">KILL</span>
                </div>
                <p className="text-[11px] font-black mt-1.5">{isFa ? 'توقف اضطراری' : 'Kill Switch'}</p>
              </button>
            );
          }
          return (
            <button
              key={wId}
              type="button"
              onClick={() => onToggleUiMode?.(uiMode === 'simple' ? 'pro' : 'simple')}
              className="surface-soft rounded-2xl p-2.5 text-start border border-white/10 hover:border-blue-500/40 transition"
            >
              <div className="flex items-center justify-between text-blue-400">
                <Zap className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase">{uiMode}</span>
              </div>
              <p className="text-[11px] font-black text-main mt-1.5">
                {uiMode === 'simple' ? (isFa ? 'ارتقا به حرفه‌ای' : 'Go Pro') : isFa ? 'رفتن به ساده' : 'Go Simple'}
              </p>
            </button>
          );
        })}
      </div>

      {/* Widget Order & Visibility Customizer */}
      {customizing && (
        <div className="surface-soft rounded-2xl p-3 space-y-2 border hairline text-xs">
          <p className="font-bold text-main">{isFa ? 'چیدمان و نمایش ویجت‌های صفحه اصلی:' : 'Arrange & Toggle Quick Widgets:'}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(WIDGET_META) as WidgetId[]).map((id) => {
              const active = widgets.includes(id);
              return (
                <div key={id} className="flex items-center gap-1 bg-black/20 rounded-xl px-2.5 py-1.5 border border-white/10">
                  <input type="checkbox" checked={active} onChange={() => toggleWidgetVisibility(id)} />
                  <span className="text-[11px] font-bold text-main">{isFa ? WIDGET_META[id].fa : WIDGET_META[id].en}</span>
                  {active && (
                    <>
                      <button type="button" onClick={() => moveWidget(id, -1)} className="p-0.5 text-dim hover:text-main">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => moveWidget(id, 1)} className="p-0.5 text-dim hover:text-main">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chrome/Edge Extension Key & ZIP Panel */}
      {extOpen && (
        <div className="panel rounded-3xl p-4 space-y-3 border border-[var(--line-strong)] text-xs">
          <div className="hero-cobalt dot-grid-light rounded-2xl p-3.5 relative overflow-hidden">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 backdrop-blur-md grid place-items-center shrink-0">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-white text-xs sm:text-sm truncate">
                      {isFa ? 'افزونه گرافیکی مرورگر دلارینو' : 'Dollarino Browser Extension'}
                    </p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20 text-white border border-white/25 shrink-0">
                      v9.7
                    </span>
                  </div>
                  <p className="text-[11px] text-white/80 mt-0.5">
                    {isFa ? 'کنترل ربات، نرخ زنده، رادار DEX و سوآپ Trust Wallet در کروم/اج' : 'Live bot control, markets & DEX radar in Chrome / Edge'}
                  </p>
                </div>
              </div>
              <a
                href="/downloads/dollarino-extension.zip"
                download="dollarino-extension.zip"
                className="px-3.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5 bg-white text-[#0b3bb8] shadow-md hover:brightness-105 active:scale-95 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isFa ? 'دانلود اکستنشن (ZIP)' : 'Download Extension ZIP'}</span>
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <code
              dir="ltr"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-xl font-mono text-[11px] text-main truncate border hairline"
              style={{ background: 'var(--soft)' }}
            >
              {extKey || (busy ? (isFa ? 'در حال تولید کلید امن...' : 'Generating...') : isFa ? 'هنوز کلیدی ایجاد نشده — روی دکمه ساخت کلید بزنید' : 'No key yet — click Generate Key')}
            </code>
            {extKey && (
              <button type="button" onClick={handleCopyKey} className="btn-ghost px-3 py-2 rounded-xl text-[11px] font-bold inline-flex items-center gap-1">
                {copied ? <Check className="w-3.5 h-3.5 text-jade" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی کلید' : 'Copy'}</span>
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleGenerateExtKey(Boolean(extKey))}
              className="btn-cobalt px-3 py-2 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>{extKey ? (isFa ? 'کلید جدید' : 'Rotate') : isFa ? 'ساخت کلید اکستنشن' : 'Generate Key'}</span>
            </button>
          </div>
          {extErr && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-3 py-2 text-[11px] font-bold text-loss">
              {extErr}
            </div>
          )}
          {extOkMsg && (
            <div className="rounded-xl bg-[#0D9455]/15 border border-[#0D9455]/30 px-3 py-2 text-[11px] font-bold text-jade">
              {extOkMsg}
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-xl p-2.5 border hairline flex items-center gap-2" style={{ background: 'var(--soft)' }}>
              <span className="w-5 h-5 rounded-full bg-[#1652F0]/15 text-[#1652F0] font-black grid place-items-center shrink-0">۱</span>
              <span className="text-dim">{isFa ? 'فایل ZIP را Extract کنید' : 'Extract the ZIP file'}</span>
            </div>
            <div className="rounded-xl p-2.5 border hairline flex items-center gap-2" style={{ background: 'var(--soft)' }}>
              <span className="w-5 h-5 rounded-full bg-[#1652F0]/15 text-[#1652F0] font-black grid place-items-center shrink-0">۲</span>
              <span className="text-dim">{isFa ? 'در chrome://extensions گزینه Load unpacked بزنید' : 'Load unpacked in chrome://extensions'}</span>
            </div>
            <div className="rounded-xl p-2.5 border hairline flex items-center gap-2" style={{ background: 'var(--soft)' }}>
              <span className="w-5 h-5 rounded-full bg-[#0D9455]/15 text-[#0D9455] font-black grid place-items-center shrink-0">۳</span>
              <span className="text-dim">{isFa ? 'در تب «اتصال» کلید بالا را وارد کنید' : 'Paste your key in the Sync tab'}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function QuickLauncherModal({
  action,
  lang,
  dashboard,
  onToggleBot,
  onKillSwitch,
  onNavigate,
  onClose,
}: {
  action: string | null;
  lang: Lang;
  dashboard: DashboardPayload;
  onToggleBot: () => Promise<void>;
  onKillSwitch: () => Promise<void>;
  onNavigate: (tab: NavTab) => void;
  onClose: () => void;
}) {
  if (!action || typeof document === 'undefined') return null;
  const isFa = lang === 'fa';
  const isRunning = dashboard.config.bot_state.startsWith('RUNNING');
  const openPnl = dashboard.openTrades.reduce((a, t) => a + Number(t.unrealized_pnl || 0), 0);

  return createPortal(
    <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md p-4 grid place-items-center" onClick={onClose}>
      <div className="panel rounded-[28px] max-w-sm w-full p-5 space-y-4 border border-amber-500/35" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[var(--gold)]" />
            <span>{isFa ? 'ویجت اجرای سریع موبایل' : 'Mobile Quick Launcher'}</span>
          </h3>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="surface-soft rounded-2xl p-4 space-y-2 text-xs">
          <p className="text-dim">
            {isFa ? 'وضعیت فعلی ربات:' : 'Bot Status:'}{' '}
            <strong className={isRunning ? 'text-jade' : 'text-loss'}>{isRunning ? (isFa ? 'فعال' : 'Running') : isFa ? 'متوقف' : 'Stopped'}</strong>
          </p>
          <p className="text-dim">
            {isFa ? 'موجودی:' : 'Balance:'} <strong dir="ltr" className="text-main">${Number(dashboard.balance.total || 0).toFixed(2)}</strong> ·{' '}
            {isFa ? 'سود باز:' : 'Open PnL:'}{' '}
            <strong dir="ltr" className={openPnl >= 0 ? 'text-jade' : 'text-loss'}>
              {openPnl >= 0 ? '+' : ''}${openPnl.toFixed(2)}
            </strong>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => void onToggleBot()}
            className={`py-3 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-1.5 ${isRunning ? 'bg-rose-500 text-white' : 'btn-gold'}`}
          >
            <Power className="w-4 h-4" />
            <span>{isRunning ? (isFa ? 'خاموش کردن فوری ربات' : 'Turn Bot OFF') : isFa ? 'روشن کردن فوری ربات' : 'Turn Bot ON'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('dex');
              onClose();
            }}
            className="btn-cobalt py-2.5 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-1.5"
          >
            <Flame className="w-4 h-4" />
            <span>{isFa ? 'باز کردن رادار DexScreener و Trust Wallet' : 'Open DexScreener & Trust Wallet'}</span>
          </button>
          <button
            type="button"
            onClick={() => void onKillSwitch().then(onClose)}
            className="py-2.5 rounded-2xl text-xs font-black bg-rose-500/15 text-loss border border-rose-500/35 inline-flex items-center justify-center gap-1.5"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>{isFa ? 'توقف اضطراری کامل (Kill Switch)' : 'Emergency Kill Switch'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
