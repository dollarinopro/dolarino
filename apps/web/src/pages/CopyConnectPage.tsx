import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy as CopyIcon,
  KeyRound,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { formatDollarinoSignal } from '@dollarino/core';
import { ExchangeLogo } from '../components/BrandLogos';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload, EntitlementSummary, NavTab } from '../lib/types';

interface ExchangeConn {
  id: string;
  provider: string;
  label: string;
  is_active: number;
  api_key_masked: string;
  proxy_url?: string;
  last_test_status: string;
}

interface PlatformAISummary {
  configured: boolean;
  activeCount: number;
  consensusMode: string;
  effectiveModeLabelFa: string;
  effectiveModeLabelEn: string;
  engines: Array<{
    id: string;
    slot_order: number;
    provider: string;
    label: string;
    model: string;
    is_active: number;
  }>;
}

interface VerifiedCopyTrader {
  id: string;
  display_name: string;
  handle: string;
  avatar_url?: string | null;
  bio_fa?: string | null;
  bio_en?: string | null;
  specialty: string;
  win_rate: number;
  roi_30d_pct: number;
  max_drawdown_pct: number;
  followers_count: number;
  min_allocation_usd?: number;
  risk_level: string;
  following: boolean;
  mySubscription?: { allocation_usd: number } | null;
  trades: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price: string;
    stop_loss: string | null;
    tp1: string | null;
    leverage: number;
    pnl_pct: number;
    status: 'OPEN' | 'CLOSED';
    note: string | null;
    opened_at: string;
  }>;
}

interface TgBot {
  id: string;
  bot_username: string;
  bot_token_masked: string;
  signal_channel_id: string | null;
}

export function CopyConnectPage({
  lang,
  data,
  entitlement,
  onNavigate,
  onRefresh,
}: {
  lang: Lang;
  data: DashboardPayload;
  entitlement?: EntitlementSummary | null;
  onNavigate: (tab: NavTab) => void;
  onRefresh: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [tab, setTab] = useState<'copy' | 'exchanges' | 'risk'>('copy');
  const [msg, setMsg] = useState<{ err?: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [traders, setTraders] = useState<VerifiedCopyTrader[]>([]);
  const [pendingConfirmTrades, setPendingConfirmTrades] = useState<
    Array<{ id: string; trader_id: string; trader_name?: string; symbol: string; direction: string; entry_price: string; leverage: number }>
  >([]);
  const [loadingTraders, setLoadingTraders] = useState(true);
  const [allocMap, setAllocMap] = useState<Record<string, number>>({});
  const [copyingTradeId, setCopyingTradeId] = useState<string | null>(null);
  const [showWebhookMirror, setShowWebhookMirror] = useState(false);

  // Copy Trade & Signals
  const webhookUrl = `${window.location.origin}/api/webhook/tv/${data.config.webhook_secret}`;
  const [rawSig, setRawSig] = useState(
    formatDollarinoSignal({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      timeframe: '15m',
      price: '62000',
      stopLoss: '60500',
      leverage: 10,
      tp1: '63500',
      tp2: '65000',
      tp3: '66500',
      channelHandle: data.config.signal_channel_handle || '@Dollarino_official',
    })
  );
  const [tgBots, setTgBots] = useState<TgBot[]>([]);
  const [tgToken, setTgToken] = useState('');
  const [tgChannel, setTgChannel] = useState(data.config.signal_channel_handle || '@Dollarino_official');

  // Exchanges & Platform AI
  const [exchanges, setExchanges] = useState<ExchangeConn[]>([]);
  const [platformAI, setPlatformAI] = useState<PlatformAISummary | null>(null);
  const [proxyEdits, setProxyEdits] = useState<Record<string, string>>({});
  const [showAdvancedEx, setShowAdvancedEx] = useState(false);
  const [exForm, setExForm] = useState({
    provider: 'toobit' as 'toobit' | 'bitunix' | 'kcex',
    label: '',
    apiKey: '',
    apiSecret: '',
    webSessionToken: '',
    proxyUrl: '',
    proxySecret: '',
  });

  // Full Risk Studio Controls
  const [riskForm, setRiskForm] = useState({
    margin_pct: Number(data.config.margin_pct ?? 10),
    max_leverage: Number(data.config.max_leverage ?? 10),
    max_open_positions: Number(data.config.max_open_positions ?? 6),
    daily_max_loss_pct: Number(data.config.daily_max_loss_pct ?? 5),
    tp1_close_pct: Number(data.config.tp1_close_pct ?? 50),
    tp2_close_pct: Number(data.config.tp2_close_pct ?? 25),
    tp3_close_pct: Number(data.config.tp3_close_pct ?? 25),
    trailing_stop_enabled: Boolean(data.config.trailing_stop_enabled ?? 1),
    trailing_stop_pct: Number(data.config.trailing_stop_pct ?? 2),
    trail_after_tp1: Boolean(data.config.trail_after_tp1 ?? 1),
    auto_breakeven_on_tp1: Boolean(data.config.auto_breakeven_on_tp1 ?? 1),
    move_sl_to_tp1_on_tp2: Boolean(data.config.move_sl_to_tp1_on_tp2 ?? 1),
    use_signal_leverage: Boolean(data.config.use_signal_leverage ?? 0),
    allow_auto_flip: Boolean(data.config.allow_auto_flip ?? 1),
    block_weekends: Boolean(data.config.block_weekends ?? 0),
    macro_blackout: Boolean(data.config.macro_blackout ?? 0),
  });

  const loadConnections = async () => {
    setLoadingTraders(true);
    const [ex, ai, tg, ct] = await Promise.all([
      apiFetch<{ connections: ExchangeConn[] }>('/api/connections/exchanges').catch(() => ({ connections: [] })),
      apiFetch<{ platformAI: PlatformAISummary }>('/api/connections/platform-ai').catch(() => ({ platformAI: null })),
      apiFetch<{ bots: TgBot[] }>('/api/connections/telegram-bots').catch(() => ({ bots: [] })),
      apiFetch<{
        traders: VerifiedCopyTrader[];
        pendingConfirmTrades?: Array<{
          id: string;
          trader_id: string;
          trader_name?: string;
          symbol: string;
          direction: string;
          entry_price: string;
          leverage: number;
        }>;
      }>('/api/copy-trade/traders').catch(() => ({ traders: [], pendingConfirmTrades: [] })),
    ]);
    setExchanges(
      ex.connections.filter(
        (c) => c.provider === 'toobit' || c.provider === 'bitunix' || c.provider === 'kcex' || c.provider === 'paper'
      )
    );
    setPlatformAI(ai.platformAI);
    setTgBots(tg.bots);
    setTraders(ct.traders || []);
    setPendingConfirmTrades(ct.pendingConfirmTrades || []);
    setAllocMap((prev) => {
      const next = { ...prev };
      for (const tr of ct.traders || []) {
        if (next[tr.id] === undefined) next[tr.id] = tr.mySubscription?.allocation_usd || tr.min_allocation_usd || 100;
      }
      return next;
    });
    setLoadingTraders(false);
  };

  useEffect(() => {
    void loadConnections();
  }, []);

  const flash = (text: string, err = false) => {
    setMsg({ text, err });
    setTimeout(() => setMsg(null), 5000);
  };

  const toggleFollowTrader = async (t: VerifiedCopyTrader) => {
    try {
      const res = await apiFetch<{
        ok: boolean;
        following: boolean;
        stoppedOtherEngines?: boolean;
      }>('/api/copy-trade/follow', {
        method: 'POST',
        body: JSON.stringify({
          traderId: t.id,
          follow: !t.following,
          allocationUsd: allocMap[t.id] ?? 100,
        }),
      });
      flash(
        res.following
          ? isFa
            ? `کپی‌ترید خودکار از ${t.display_name} فعال شد!${res.stoppedOtherEngines ? ' (ربات AI/استراتژی قبلی برای جلوگیری از تداخل متوقف شد)' : ''}`
            : `Auto-copy enabled for ${t.display_name}${res.stoppedOtherEngines ? ' (previous AI/strategy engine stopped)' : ''}`
          : isFa
            ? `کپی‌ترید ${t.display_name} متوقف شد.`
            : `Unfollowed ${t.display_name}`
      );
      await Promise.all([loadConnections(), onRefresh()]);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Subscription required', true);
    }
  };

  const copySingleTrade = async (tradeId: string) => {
    setCopyingTradeId(tradeId);
    try {
      const res = await apiFetch<{ ok: boolean; tradeId?: string }>(`/api/copy-trade/copy-now/${tradeId}`, {
        method: 'POST',
      });
      flash(isFa ? `معامله با موفقیت کپی شد! (${res.tradeId ?? ''})` : `Trade mirrored (${res.tradeId ?? ''})!`);
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to mirror trade', true);
    } finally {
      setCopyingTradeId(null);
    }
  };

  const runSignal = async (executeNow: boolean) => {
    try {
      const res = await apiFetch<{ ok: boolean; tradeId?: string; error?: string }>('/api/trading/signals/execute', {
        method: 'POST',
        body: JSON.stringify({ rawText: rawSig, executeNow, source: 'copytrade' }),
      });
      if (!res.ok) flash(res.error || 'Rejected', true);
      else flash(executeNow ? (isFa ? `معامله ${res.tradeId} باز شد` : `Executed ${res.tradeId}`) : isFa ? 'سیگنال با موفقیت ثبت شد' : 'Signal parsed & logged');
      await onRefresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error', true);
    }
  };

  const saveChannelHandle = async () => {
    await apiFetch('/api/trading/config', {
      method: 'PATCH',
      body: JSON.stringify({ signal_channel_handle: tgChannel }),
    });
    flash(isFa ? `کانال ${tgChannel} ذخیره شد` : 'Signal channel saved');
    await onRefresh();
  };

  const addExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ test: { ok: boolean; message: string }; requiresSubscription?: boolean }>('/api/connections/exchanges', {
        method: 'POST',
        body: JSON.stringify(exForm),
      });
      flash(
        res.requiresSubscription
          ? isFa
            ? 'صرافی ذخیره شد. برای معامله واقعی، اشتراک Pro را فعال کنید.'
            : 'Saved. Upgrade to Pro for live execution.'
          : res.test.message,
        !res.requiresSubscription && !res.test.ok
      );
      setExForm({ provider: 'toobit', label: '', apiKey: '', apiSecret: '', webSessionToken: '', proxyUrl: '', proxySecret: '' });
      await loadConnections();
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const activateExchange = async (id: string) => {
    try {
      await apiFetch(`/api/connections/exchanges/${id}/activate`, { method: 'POST' });
      flash(isFa ? 'حساب صرافی فعال شد' : 'Active exchange switched');
      await loadConnections();
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Upgrade required', true);
    }
  };

  const updateExchangeProxy = async (id: string) => {
    try {
      const res = await apiFetch<{ test: { ok: boolean; message: string } }>(`/api/connections/exchanges/${id}/proxy`, {
        method: 'PATCH',
        body: JSON.stringify({ proxyUrl: proxyEdits[id] ?? '' }),
      });
      flash(res.test.message, !res.test.ok);
      await loadConnections();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Proxy update failed', true);
    }
  };

  const addTelegramBot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ botUsername: string; webhookConfigured?: boolean }>('/api/connections/telegram-bots', {
        method: 'POST',
        body: JSON.stringify({ botToken: tgToken, signalChannelId: tgChannel }),
      });
      flash(
        isFa
          ? `ربات @${res.botUsername} متصل شد${res.webhookConfigured ? ' (Webhook و Mini App فعال)' : ''}`
          : `Bot @${res.botUsername} connected`
      );
      setTgToken('');
      await loadConnections();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const saveRisk = async () => {
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          ...riskForm,
          trailing_stop_enabled: riskForm.trailing_stop_enabled ? 1 : 0,
          trail_after_tp1: riskForm.trail_after_tp1 ? 1 : 0,
          auto_breakeven_on_tp1: riskForm.auto_breakeven_on_tp1 ? 1 : 0,
          move_sl_to_tp1_on_tp2: riskForm.move_sl_to_tp1_on_tp2 ? 1 : 0,
          use_signal_leverage: riskForm.use_signal_leverage ? 1 : 0,
          allow_auto_flip: riskForm.allow_auto_flip ? 1 : 0,
          block_weekends: riskForm.block_weekends ? 1 : 0,
          macro_blackout: riskForm.macro_blackout ? 1 : 0,
        }),
      });
      flash(isFa ? 'تمام قوانین سپر ریسک و تارگت‌ها ذخیره شد' : 'Risk & 3-TP settings saved');
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Save failed', true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
            COPY-TRADE · EXCHANGES · RISK ENGINE
          </p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
            {isFa ? 'کپی‌ترید، اتصال صرافی و سپر ریسک' : 'Copy-Trade, Exchanges & Risk'}
          </h2>
        </div>

        <div className="inline-flex p-1 panel rounded-full overflow-x-auto no-scrollbar">
          {[
            { id: 'copy' as const, icon: Bot, l: isFa ? 'کپی‌ترید و وب‌هوک' : 'Copy & Webhooks' },
            { id: 'exchanges' as const, icon: Link2, l: isFa ? 'اتصال صرافی واقعی' : 'Exchanges' },
            { id: 'risk' as const, icon: Sliders, l: isFa ? 'سپر ریسک و ۳ تارگت' : 'Risk Shield' },
          ].map((x) => {
            const Icon = x.icon;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setTab(x.id)}
                className={`px-4 py-2 rounded-full text-xs font-black transition inline-flex items-center gap-1.5 whitespace-nowrap ${
                  tab === x.id ? 'btn-gold' : 'text-dim hover:text-main'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{x.l}</span>
              </button>
            );
          })}
        </div>
      </div>

      {msg && (
        <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${msg.err ? 'bg-rose-500/15 text-loss border border-rose-500/35' : 'badge-signal'}`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg.text}</span>
        </div>
      )}

      {tab === 'copy' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[11px] font-bold text-sub flex items-center gap-2">
            <span>🔒</span>
            <span>
              {isFa
                ? 'قانون تک‌موتوره دلارینو: با فعال‌کردن کپی‌ترید هر تریدر، موتورهای AI و استراتژی خودکار قبلی به‌صورت خودکار متوقف می‌شوند تا هم‌زمان دو موتور روی سرمایه شما معامله نکنند.'
                : 'Single-Engine Rule: Following a copy trader automatically stops any active AI or autonomous strategy bot so multiple engines never conflict.'}
            </span>
          </div>
          {pendingConfirmTrades.length > 0 && (
            <div className="panel rounded-[26px] p-5 border border-amber-400/45 bg-amber-500/10 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                <Sparkles className="w-4 h-4" />
                <span>
                  {isFa
                    ? 'درخواست تایید انتشار معامله کپی‌ترید شما برای دنبال‌کننده‌ها'
                    : 'Confirm Copy-Trade Publication to Followers'}
                </span>
              </div>
              <div className="space-y-2">
                {pendingConfirmTrades.map((pt) => (
                  <div key={pt.id} className="surface-soft rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-black text-main">
                        <span dir="ltr">{pt.symbol}</span> · {pt.direction} ({pt.leverage}×) @ ${pt.entry_price}
                      </p>
                      <p className="text-[11px] text-dim mt-0.5">
                        {isFa
                          ? 'آیا مایلید این معامله برای همه دنبال‌کننده‌های کپی‌ترید شما هم باز و منتشر شود؟'
                          : 'Do you want to publish and mirror this trade to all your followers?'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await apiFetch<{ ok?: boolean; mirroredCount?: number }>(`/api/copy-trade/confirm-publish/${pt.id}`, {
                            method: 'POST',
                            body: JSON.stringify({ publish: true }),
                          });
                          flash(
                            isFa
                              ? `منتشر و برای ${r.mirroredCount ?? 0} دنبال‌کننده کپی شد.`
                              : `Published & mirrored to ${r.mirroredCount ?? 0} followers.`
                          );
                          await loadConnections();
                        }}
                        className="btn-emerald px-3.5 py-2 rounded-xl font-black text-[11px] inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'بله، منتشر و کپی شود' : 'Yes, Publish & Copy'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/copy-trade/confirm-publish/${pt.id}`, {
                            method: 'POST',
                            body: JSON.stringify({ publish: false }),
                          });
                          flash(isFa ? 'این معامله فقط شخصی باقی ماند.' : 'Kept private.');
                          await loadConnections();
                        }}
                        className="btn-ghost px-3.5 py-2 rounded-xl font-bold text-[11px] text-loss"
                      >
                        {isFa ? 'خیر، فقط شخصی' : 'Private Only'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verified Copy Traders Marketplace */}
          <div className="panel rounded-[28px] p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src="/images/copytrade-trophy.png"
                  alt="Verified Copy Traders"
                  className="w-24 h-16 rounded-2xl object-cover border hairline shrink-0 hidden sm:block"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h3 className="font-display font-bold text-xl text-main">
                      {isFa ? 'تریدرهای تاییدشده کپی‌ترید دلارینو' : 'Admin-Verified Copy Traders'}
                    </h3>
                  </div>
                  <p className="text-xs text-dim mt-1">
                    {isFa
                      ? 'فقط معامله‌گران بررسی و تاییدشده توسط مدیریت دلارینو در این بخش نمایش داده می‌شوند. معاملات هر تریدر را ببینید و با یک کلیک کپی کنید.'
                      : 'Only traders reviewed and verified by Dollarino admins appear here. Follow automatically or copy any trade with 1 tap.'}
                  </p>
                </div>
              </div>
              {!entitlement?.hasPaidPlan && (
                <button type="button" onClick={() => onNavigate('pricing')} className="btn-gold px-4 py-2 rounded-xl text-xs font-black">
                  {isFa ? 'فعال‌سازی اشتراک برای کپی ←' : 'Subscribe to Copy →'}
                </button>
              )}
            </div>

            {loadingTraders ? (
              <div className="p-8 text-center text-xs text-dim">{isFa ? 'در حال دریافت لیست تریدرها...' : 'Loading verified traders...'}</div>
            ) : traders.length === 0 ? (
              <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim">
                {isFa ? 'در حال حاضر تریدری ثبت نشده است. به‌زودی تریدرهای تاییدشده اضافه می‌شوند.' : 'No verified copy traders published yet.'}
              </div>
            ) : (
              <div className="grid lg:grid-cols-3 gap-4">
                {traders.map((tr) => (
                  <div key={tr.id} className={`surface-soft rounded-[24px] p-4 border flex flex-col justify-between gap-4 ${tr.following ? 'border-emerald-500/45' : 'hairline'}`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-display font-bold text-base text-main">{tr.display_name}</h4>
                            <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                          </div>
                          <p className="text-[11px] text-dim mt-0.5">
                            {tr.specialty} · <span dir="ltr">{tr.handle}</span>
                          </p>
                        </div>
                        <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0">
                          {tr.risk_level}
                        </span>
                      </div>

                      <p className="text-[11px] text-sub leading-relaxed">
                        {isFa ? tr.bio_fa || '' : tr.bio_en || ''}
                      </p>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="panel rounded-xl p-2">
                          <p dir="ltr" className="font-num font-black text-jade">+{tr.roi_30d_pct}%</p>
                          <p className="text-[10px] text-dim">{isFa ? 'بازده ۳۰ روزه' : '30d ROI'}</p>
                        </div>
                        <div className="panel rounded-xl p-2">
                          <p dir="ltr" className="font-num font-black text-main">{tr.win_rate}%</p>
                          <p className="text-[10px] text-dim">{isFa ? 'نرخ برد' : 'Win Rate'}</p>
                        </div>
                        <div className="panel rounded-xl p-2">
                          <p dir="ltr" className="font-num font-black text-amber-400">-{tr.max_drawdown_pct}%</p>
                          <p className="text-[10px] text-dim">{isFa ? 'حداکثر افت' : 'Max DD'}</p>
                        </div>
                      </div>

                      {/* Trader's Open & Recent Trades */}
                      <div className="space-y-2 pt-2 border-t hairline">
                        <p className="text-[11px] font-black text-dim">
                          {isFa ? 'آخرین معاملات این تریدر:' : 'Recent / Live Trades:'}
                        </p>
                        {tr.trades.length === 0 ? (
                          <p className="text-[11px] text-dim">{isFa ? 'معامله فعالی ثبت نشده است.' : 'No trades logged yet.'}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {tr.trades.slice(0, 3).map((td) => (
                              <div key={td.id} className="panel rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 font-bold text-main">
                                    <span dir="ltr">{td.symbol}</span>
                                    <span className={td.direction === 'LONG' ? 'text-jade' : 'text-loss'}>{td.direction}</span>
                                    <span dir="ltr" className="text-dim">{td.leverage}×</span>
                                  </div>
                                  <p className="text-[10px] text-dim truncate" dir="ltr">
                                    @${td.entry_price} · {td.status} ({td.pnl_pct >= 0 ? '+' : ''}{td.pnl_pct}%)
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={copyingTradeId === td.id}
                                  onClick={() => void copySingleTrade(td.id)}
                                  className="btn-emerald px-2.5 py-1.5 rounded-lg text-[10px] font-black shrink-0"
                                >
                                  {copyingTradeId === td.id ? '...' : isFa ? 'کپی معامله' : 'Copy Trade'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t hairline">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-dim">{isFa ? 'مبلغ تخصیص کپی ($):' : 'Copy Allocation ($):'}</span>
                        <select
                          value={allocMap[tr.id] ?? 100}
                          onChange={(e) => setAllocMap((prev) => ({ ...prev, [tr.id]: Number(e.target.value) }))}
                          className="field py-1 px-2 text-xs w-28"
                        >
                          {[50, 100, 250, 500, 1000].map((v) => (
                            <option key={v} value={v}>${v}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleFollowTrader(tr)}
                        className={`w-full py-2.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5 ${
                          tr.following ? 'btn-ghost text-loss border border-rose-500/35' : 'btn-gold'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>
                          {tr.following
                            ? isFa
                              ? 'توقف کپی خودکار (در حال دنبال کردن)'
                              : 'Stop Auto-Copy (Following)'
                            : isFa
                              ? `فعال‌سازی کپی خودکار (${tr.followers_count} دنبال‌کننده)`
                              : `Follow & Auto-Copy (${tr.followers_count})`}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collapsible Advanced TradingView / Telegram Mirror */}
          <div className="panel rounded-[24px] p-4 sm:p-5 space-y-4">
            <button
              type="button"
              onClick={() => setShowWebhookMirror((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-black text-main"
            >
              <span>{isFa ? 'اتصال وب‌هوک TradingView و کپی کانال تلگرام (تنظیمات پیشرفته)' : 'TradingView Webhook & Channel Mirror (Advanced)'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showWebhookMirror ? 'rotate-180' : ''}`} />
            </button>

            {showWebhookMirror && (
              <div className="grid lg:grid-cols-2 gap-4 pt-2 border-t hairline">
                <div className="surface-soft rounded-[22px] p-4 space-y-3">
                  <h4 className="font-display font-bold text-sm text-main">
                    {isFa ? 'لینک وب‌هوک TradingView و اجرای سیگنال' : 'TradingView Webhook & Signal Runner'}
                  </h4>
                  <div className="rounded-xl panel p-2.5 flex items-center justify-between gap-2 text-xs">
                    <code dir="ltr" className="truncate font-mono text-[11px] text-main">{webhookUrl}</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(webhookUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1800);
                      }}
                      className="btn-gold px-3 py-1.5 rounded-xl text-[11px] inline-flex items-center gap-1 shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                      <span>{copied ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی لینک' : 'Copy'}</span>
                    </button>
                  </div>
                  <textarea rows={6} dir="ltr" value={rawSig} onChange={(e) => setRawSig(e.target.value)} className="field font-mono text-[11px]" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void runSignal(false)} className="btn-ghost flex-1 py-2.5 rounded-xl text-xs font-bold">
                      {isFa ? 'فقط تحلیل و ثبت' : 'Parse Only'}
                    </button>
                    <button type="button" onClick={() => void runSignal(true)} className="btn-emerald flex-1 py-2.5 rounded-xl text-xs inline-flex items-center justify-center gap-1.5">
                      <Play className="w-3.5 h-3.5" />
                      <span>{isFa ? 'اجرای خودکار ۳ تارگت' : 'Execute 3-TP'}</span>
                    </button>
                  </div>
                </div>

                <div className="surface-soft rounded-[22px] p-4 space-y-3">
                  <h4 className="font-display font-bold text-sm text-main">
                    {isFa ? 'کپی‌ترید مستقیم از کانال و ربات تلگرام' : 'Telegram Channel & Bot Link'}
                  </h4>
                  <div className="flex gap-2 text-xs">
                    <input value={tgChannel} onChange={(e) => setTgChannel(e.target.value)} dir="ltr" placeholder="@Dollarino_official" className="field font-mono" />
                    <button type="button" onClick={() => void saveChannelHandle()} className="btn-ghost px-4 rounded-xl font-bold shrink-0">
                      {isFa ? 'ذخیره کانال' : 'Save'}
                    </button>
                  </div>
                  <form onSubmit={addTelegramBot} className="space-y-2.5 text-xs pt-2 border-t hairline">
                    <input value={tgToken} onChange={(e) => setTgToken(e.target.value)} required dir="ltr" placeholder="123456:ABC-BotFatherToken..." className="field font-mono" />
                    <button type="submit" className="btn-gold w-full py-2.5 rounded-xl text-xs inline-flex items-center justify-center gap-1.5">
                      <Plus className="w-4 h-4" />
                      <span>{isFa ? 'اتصال ربات تلگرام شخصی' : 'Connect Telegram Bot'}</span>
                    </button>
                  </form>
                  {tgBots.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t hairline text-xs">
                      {tgBots.map((b) => (
                        <div key={b.id} className="panel rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                          <span>@{b.bot_username} · {b.signal_channel_id}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void apiFetch(`/api/connections/telegram-bots/${b.id}/sync-webhook`, { method: 'POST' }).then(() => flash(isFa ? 'وب‌هوک همگام‌سازی شد' : 'Synced'))}
                              className="text-brand font-bold text-[11px]"
                            >
                              Sync
                            </button>
                            <button
                              type="button"
                              onClick={() => void apiFetch(`/api/connections/telegram-bots/${b.id}`, { method: 'DELETE' }).then(loadConnections)}
                              className="text-loss hover:opacity-75"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'exchanges' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            {/* Platform Multi-AI Status Card (restored from ConnectionsPage) */}
            <div className="panel rounded-[26px] p-5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4 text-jade" />
                  <span>{isFa ? 'هوش مصنوعی مرکزی دلارینو (دُرّبین)' : 'Platform Central Multi-AI'}</span>
                </h3>
                <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                  {platformAI?.configured ? (isFa ? 'فعال و مدیریت‌شده' : 'MANAGED ONLINE') : 'READY'}
                </span>
              </div>
              <p className="text-dim">
                {platformAI
                  ? isFa
                    ? platformAI.effectiveModeLabelFa
                    : platformAI.effectiveModeLabelEn
                  : isFa
                    ? 'تمام کلیدهای هوش مصنوعی توسط پلتفرم مدیریت می‌شوند؛ نیازی به تهیه کلید شخصی نیست.'
                    : 'Zero personal LLM keys needed — consensus engines run centrally.'}
              </p>
              {platformAI?.engines?.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {platformAI.engines.map((eng) => (
                    <span key={eng.id} className="surface-soft rounded-lg px-2.5 py-1 text-[10px] font-bold text-main">
                      {eng.label || eng.provider} · {eng.model}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="panel rounded-[26px] p-5 space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src="/images/exchange-api-hub.png"
                  alt="Dollarino Exchange API Hub"
                  className="w-20 h-14 rounded-2xl object-cover border hairline shrink-0"
                />
                <div>
                  <h3 className="font-display font-bold text-lg text-main">{isFa ? 'حساب‌های صرافی متصل شما' : 'Connected Exchange Accounts'}</h3>
                  <p className="text-[11px] text-dim">{isFa ? 'Toobit · Bitunix · KCEX Mirror · Paper' : 'Toobit · Bitunix · KCEX Mirror · Paper'}</p>
                </div>
              </div>
              <div className="space-y-3">
                {exchanges.map((c) => (
                  <div key={c.id} className="surface-soft rounded-2xl p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <ExchangeLogo provider={c.provider} size={30} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-main">{c.label || c.provider.toUpperCase()}</span>
                            {c.is_active === 1 && <span className="px-2 py-0.5 rounded-full badge-signal text-[10px] font-black">{isFa ? 'فعال' : 'ACTIVE'}</span>}
                          </div>
                          <p dir="ltr" className="font-mono text-[11px] text-dim mt-0.5">{c.api_key_masked} · {c.last_test_status}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {c.is_active !== 1 && (
                          <button type="button" onClick={() => void activateExchange(c.id)} className="btn-gold px-3 py-1.5 rounded-xl text-[11px]">
                            {isFa ? 'فعال‌سازی' : 'Activate'}
                          </button>
                        )}
                        {c.provider !== 'paper' && (
                          <>
                            <button
                              type="button"
                              onClick={() => void apiFetch(`/api/connections/exchanges/${c.id}/test`, { method: 'POST' }).then((r) => {
                                const d = r as { ok: boolean; message: string };
                                flash(d.message, !d.ok);
                              })}
                              className="btn-ghost p-2 rounded-xl"
                              title="Test"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void apiFetch(`/api/connections/exchanges/${c.id}`, { method: 'DELETE' }).then(loadConnections)}
                              className="btn-ghost p-2 rounded-xl text-loss"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {c.provider !== 'paper' && (
                      <div className="flex gap-1.5 pt-1 border-t hairline">
                        <input
                          value={proxyEdits[c.id] ?? c.proxy_url ?? ''}
                          onChange={(e) => setProxyEdits((p) => ({ ...p, [c.id]: e.target.value }))}
                          dir="ltr"
                          placeholder="Relay Proxy URL (optional)"
                          className="field py-1.5 text-[11px] font-mono"
                        />
                        <button type="button" onClick={() => void updateExchangeProxy(c.id)} className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0">
                          {isFa ? 'ذخیره رله' : 'Relay'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={addExchange} className="panel rounded-[26px] p-5 space-y-3 text-xs self-start">
            <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
              <KeyRound className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <span>{isFa ? 'افزودن صرافی واقعی (Toobit · Bitunix · KCEX)' : 'Connect Exchange API'}</span>
            </h3>
            <p className="text-dim leading-relaxed">
              {isFa
                ? 'فقط دسترسی «معامله Futures» را فعال کنید — گزینه برداشت (Withdraw) حتماً خاموش بماند.'
                : 'Use Trade-Only Futures API keys — never enable withdrawal permissions.'}
            </p>

            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'toobit' as const, label: 'Toobit' },
                { id: 'bitunix' as const, label: 'Bitunix' },
                { id: 'kcex' as const, label: 'KCEX' },
              ]).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setExForm((f) => ({ ...f, provider: p.id }))}
                  className={`py-2 px-2 rounded-xl font-black uppercase inline-flex items-center justify-center gap-1.5 ${
                    exForm.provider === p.id ? 'btn-gold' : 'btn-ghost text-dim'
                  }`}
                >
                  <ExchangeLogo provider={p.id} size={18} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            {exForm.provider === 'kcex' && (
              <div className="rounded-2xl p-3 bg-amber-500/10 border border-amber-500/35 text-[11px] leading-relaxed text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  {isFa
                    ? 'شفافیت فنی: صرافی KCEX در حال حاضر API عمومی معامله خودکار ارائه نمی‌دهد. می‌توانید بدون نیاز به API Key صرافی KCEX را در حالت Signal-Mirror (محاسبه کارمزد واقعی ۰.۰۱٪ + دکمه ۱-کلیکی باز کردن در KCEX) فعال کنید.'
                    : 'KCEX operates in Signal-Mirror mode without requiring mandatory API keys (0.01% taker simulation + 1-tap KCEX deep links).'}
                </span>
              </div>
            )}

            <input value={exForm.label} onChange={(e) => setExForm((f) => ({ ...f, label: e.target.value }))} placeholder={isFa ? 'نام دلخواه (مثلاً حساب اصلی)' : 'Account Label'} className="field" />
            <input
              value={exForm.apiKey}
              onChange={(e) => setExForm((f) => ({ ...f, apiKey: e.target.value }))}
              required={exForm.provider !== 'kcex'}
              dir="ltr"
              placeholder={exForm.provider === 'kcex' ? 'API Key (Optional for KCEX Mirror)' : 'API Key'}
              className="field font-mono"
            />
            <input
              type="password"
              value={exForm.apiSecret}
              onChange={(e) => setExForm((f) => ({ ...f, apiSecret: e.target.value }))}
              required={exForm.provider !== 'kcex'}
              dir="ltr"
              placeholder={exForm.provider === 'kcex' ? 'API Secret (Optional for KCEX Mirror)' : 'API Secret'}
              className="field font-mono"
            />

            <button type="button" onClick={() => setShowAdvancedEx((v) => !v)} className="inline-flex items-center gap-1 text-dim hover:text-main font-bold">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedEx ? 'rotate-180' : ''}`} />
              <span>{isFa ? 'تنظیمات پیشرفته شبکه (پروکسی / سشن وب)' : 'Advanced Proxy / Web Session'}</span>
            </button>

            {showAdvancedEx && (
              <div className="space-y-2 pt-1">
                {exForm.provider === 'kcex' && (
                  <input value={exForm.webSessionToken} onChange={(e) => setExForm((f) => ({ ...f, webSessionToken: e.target.value }))} dir="ltr" placeholder="KCEX Web Token (optional)" className="field font-mono" />
                )}
                <input value={exForm.proxyUrl} onChange={(e) => setExForm((f) => ({ ...f, proxyUrl: e.target.value }))} dir="ltr" placeholder="https://your-relay.vercel.app (optional)" className="field font-mono" />
                <input type="password" value={exForm.proxySecret} onChange={(e) => setExForm((f) => ({ ...f, proxySecret: e.target.value }))} dir="ltr" placeholder="Proxy Secret (optional)" className="field font-mono" />
              </div>
            )}

            <button type="submit" className="btn-emerald w-full py-3 rounded-xl text-xs font-black">
              {isFa ? 'ذخیره رمزنگاری‌شده و تست اتصال' : 'Encrypt & Test Connection'}
            </button>
          </form>
        </div>
      )}

      {tab === 'risk' && (
        <div className="panel rounded-[26px] p-5 sm:p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-jade" />
                <span>{isFa ? 'قوانین سپر ریسک و تقسیم سود ۳ مرحله‌ای' : 'Automated Risk Engine & 3-TP Split'}</span>
              </h3>
              <p className="text-xs text-dim mt-0.5">
                {isFa ? 'کنترل‌های قطعی برای جلوگیری از ضرر سنگین و مدیریت هوشمند سود.' : 'Hard exposure rules enforced on every autonomous & manual order.'}
              </p>
            </div>
            <button type="button" onClick={() => void saveRisk()} className="btn-gold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5">
              <Save className="w-4 h-4" />
              <span>{isFa ? 'ذخیره قوانین ریسک' : 'Save Risk Rules'}</span>
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {[
              { l: isFa ? `حجم هر معامله: ${riskForm.margin_pct}%` : `Margin/Trade: ${riskForm.margin_pct}%`, min: 1, max: 50, val: riskForm.margin_pct, set: (v: number) => setRiskForm((f) => ({ ...f, margin_pct: v })) },
              { l: isFa ? `سقف اهرم: ${riskForm.max_leverage}×` : `Max Leverage: ${riskForm.max_leverage}×`, min: 1, max: 50, val: riskForm.max_leverage, set: (v: number) => setRiskForm((f) => ({ ...f, max_leverage: v })) },
              { l: isFa ? `معاملات همزمان: ${riskForm.max_open_positions}` : `Max Open: ${riskForm.max_open_positions}`, min: 1, max: 20, val: riskForm.max_open_positions, set: (v: number) => setRiskForm((f) => ({ ...f, max_open_positions: v })) },
              { l: isFa ? `سقف ضرر روزانه: ${riskForm.daily_max_loss_pct}%` : `Daily Max Loss: ${riskForm.daily_max_loss_pct}%`, min: 1, max: 25, val: riskForm.daily_max_loss_pct, set: (v: number) => setRiskForm((f) => ({ ...f, daily_max_loss_pct: v })) },
            ].map((s) => (
              <div key={s.l} className="surface-soft rounded-2xl p-4 space-y-2.5">
                <p className="font-bold text-main">{s.l}</p>
                <input type="range" min={s.min} max={s.max} value={s.val} onChange={(e) => s.set(Number(e.target.value))} className="w-full" style={{ ['--fill' as string]: `${((s.val - s.min) / (s.max - s.min)) * 100}%` }} />
              </div>
            ))}
          </div>

          {/* 3-TP Close Split & Trailing Distance */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="surface-soft rounded-2xl p-3">
              <label className="text-dim block mb-1">{isFa ? 'خروج در TP1 (%)' : 'TP1 Close %'}</label>
              <input type="number" min={0} max={100} value={riskForm.tp1_close_pct} onChange={(e) => setRiskForm((f) => ({ ...f, tp1_close_pct: Number(e.target.value) }))} className="field py-2 font-num" />
            </div>
            <div className="surface-soft rounded-2xl p-3">
              <label className="text-dim block mb-1">{isFa ? 'خروج در TP2 (%)' : 'TP2 Close %'}</label>
              <input type="number" min={0} max={100} value={riskForm.tp2_close_pct} onChange={(e) => setRiskForm((f) => ({ ...f, tp2_close_pct: Number(e.target.value) }))} className="field py-2 font-num" />
            </div>
            <div className="surface-soft rounded-2xl p-3">
              <label className="text-dim block mb-1">{isFa ? 'خروج در TP3 (%)' : 'TP3 Close %'}</label>
              <input type="number" min={0} max={100} value={riskForm.tp3_close_pct} onChange={(e) => setRiskForm((f) => ({ ...f, tp3_close_pct: Number(e.target.value) }))} className="field py-2 font-num" />
            </div>
            <div className="surface-soft rounded-2xl p-3">
              <label className="text-dim block mb-1">{isFa ? 'فاصله تریلینگ (%)' : 'Trailing Distance %'}</label>
              <input type="number" step="0.2" min={0.2} max={10} value={riskForm.trailing_stop_pct} onChange={(e) => setRiskForm((f) => ({ ...f, trailing_stop_pct: Number(e.target.value) }))} className="field py-2 font-num" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {[
              { k: 'trailing_stop_enabled' as const, l: isFa ? 'تریلینگ استاپ فعال' : 'Trailing Stop Enabled' },
              { k: 'trail_after_tp1' as const, l: isFa ? 'شروع تریلینگ بعد از TP1' : 'Trail Only After TP1' },
              { k: 'auto_breakeven_on_tp1' as const, l: isFa ? 'ریسک‌فری خودکار در TP1' : 'Auto Break-Even on TP1' },
              { k: 'move_sl_to_tp1_on_tp2' as const, l: isFa ? 'انتقال SL به TP1 در TP2' : 'Move SL → TP1 on TP2' },
              { k: 'use_signal_leverage' as const, l: isFa ? 'استفاده از اهرم سیگنال' : 'Use Signal Leverage' },
              { k: 'allow_auto_flip' as const, l: isFa ? 'چرخش خودکار در تغییر روند' : 'Auto-Flip on Reversal' },
              { k: 'block_weekends' as const, l: isFa ? 'توقف ترید آخر هفته' : 'Block Weekends' },
              { k: 'macro_blackout' as const, l: isFa ? 'توقف هنگام اخبار CPI/FOMC' : 'Macro Blackout' },
            ].map((tog) => (
              <label key={tog.k} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-bold text-main flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--gold)' }} />
                  {tog.l}
                </span>
                <input
                  type="checkbox"
                  checked={riskForm[tog.k]}
                  onChange={(e) => setRiskForm((f) => ({ ...f, [tog.k]: e.target.checked }))}
                  className="w-4 h-4 accent-[#10d9a3]"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
