import { useEffect, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Copy,
  CreditCard,
  Crown,
  Eye,
  Flame,
  Gift,
  Headphones,
  History,
  KeyRound,
  Megaphone,
  MessageCircle,
  Newspaper,
  Play,
  Plus,
  Radio,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  Trophy,
  UserCheck,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface PlatformAIEngine {
  id: string;
  slot_order: number;
  provider: 'deepseek' | 'anthropic' | 'openai' | 'gemini' | 'openai_compatible';
  label: string;
  model: string;
  base_url: string | null;
  weight: number;
  is_active: number;
  api_key_masked: string;
  calls_today: number;
  daily_call_cap: number;
  last_test_status: string;
}

interface PlatformAISignal {
  id: string;
  symbol: string;
  timeframe: string;
  action: string;
  confidence: number;
  model_count: number;
  consensus_mode: string;
  thesis: string;
  created_at: string;
  model_votes: Array<{ provider: string; model: string; action: string; confidence: number }>;
}

const ADMIN_AI_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash', 'deepseek-v4-pro'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro'],
  openai_compatible: ['baidu/deepseek-v4.1-flash-1017', 'deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'],
};

interface AdminOverview {
  users: Array<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    telegram_username: string | null;
    phone_number?: string | null;
    phone_verified?: number;
    trust_wallet_address?: string | null;
    trust_wallet_tron?: string | null;
    trust_wallet_solana?: string | null;
    trust_wallet_verified?: number;
    ui_mode?: string | null;
    activePlan?: string | null;
    created_at: string;
  }>;
  stats: {
    totalUsers: number;
    phoneVerifiedCount?: number;
    trustWalletConnectedCount?: number;
    activeSubscriptions?: number;
    totalRevenueUsd?: number;
    openSupportTickets?: number;
    dexTradesTotal?: number;
    dexTradesOpen?: number;
    signalsCount: number;
    botsCount: number;
    trades: { total: number; open_count: number; total_pnl: number } | null;
  };
  settings: Record<string, string>;
}

interface AdminDexTrade {
  id: string;
  user_id: string;
  username?: string;
  email?: string;
  chain_id: string;
  token_symbol: string;
  token_address: string;
  side: string;
  amount_usd: number;
  entry_price_usd: number;
  current_price_usd: number;
  pnl_usd: number;
  status: string;
  tx_hash: string | null;
  opened_at: string;
}

interface AdminAuditLog {
  id: string;
  user_id: string | null;
  username?: string | null;
  email?: string | null;
  category: string;
  level: string;
  message: string;
  created_at: string;
}

interface SubOrder {
  id: string;
  user_id: string;
  email: string;
  username: string;
  plan_code: string;
  name_fa: string | null;
  name_en: string | null;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  receipt_image_url?: string | null;
  amount_usd: number;
  amount_toman: number;
  created_at: string;
}

interface PlanRow {
  code: string;
  name_fa?: string;
  name_en?: string;
  price_usd: number;
  price_toman: number;
  duration_days?: number;
  is_popular?: number;
  is_active?: number;
}

interface AdminCopyTrader {
  id: string;
  display_name: string;
  handle: string;
  specialty: string;
  win_rate: number;
  roi_30d_pct: number;
  max_drawdown_pct: number;
  followers_count: number;
  risk_level: string;
  is_verified: number;
  is_active: number;
  trades?: Array<{
    id: string;
    symbol: string;
    side: string;
    entry_price: number;
    leverage: number;
    pnl_pct: number;
    status: string;
  }>;
}

interface AdminSupportTicket {
  id: string;
  user_id: string | null;
  username: string | null;
  email: string | null;
  subject: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  last_message_at: string;
}

interface AdminSupportMessage {
  id: string;
  ticket_id: string;
  sender_role: 'user' | 'admin' | 'ai' | 'system';
  sender_name: string | null;
  message: string;
  image_data_url?: string | null;
  created_at: string;
}

export function AdminPage({
  lang,
  currentUser,
  onUserUpdated,
}: {
  lang: Lang;
  currentUser: { id: string; email: string; username: string; role: string };
  onUserUpdated: () => void;
}) {
  const isFa = lang === 'fa';
  const isOwnerOrAdmin = currentUser.role === 'owner' || currentUser.role === 'admin';
  const [data, setData] = useState<AdminOverview | null>(null);
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [helpText, setHelpText] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const [username, setUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [grantEmail, setGrantEmail] = useState('');
  const [grantPlan, setGrantPlan] = useState('pro_monthly');
  const [grantDays, setGrantDays] = useState(30);

  const [payCfg, setPayCfg] = useState({
    subscriptionRequired: true,
    usdtTrc20Wallet: '',
    iranCardNumber: '',
    iranCardHolder: '',
    telegramSupport: '@Dollarino_bot',
    proPriceUsd: 29,
    proPriceToman: 1950000,
    vipPriceUsd: 59,
    vipPriceToman: 3950000,
  });

  const [adminSection, setAdminSection] = useState<'all' | 'overview' | 'users' | 'payments' | 'ops' | 'dex_logs'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'kyc_verified' | 'trust_wallet' | 'unverified'>('all');
  const [requirePhoneKyc, setRequirePhoneKyc] = useState(true);
  const [trustReceivers, setTrustReceivers] = useState({
    evm: '',
    sol: '',
    ton: '',
  });
  const [dexTrades, setDexTrades] = useState<AdminDexTrade[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [adminReferrals, setAdminReferrals] = useState<
    Array<{
      id: string;
      referrer_name?: string;
      referred_name?: string;
      status: string;
      commission_usd?: number;
      fraud_flag?: number;
      fraud_reason?: string | null;
      created_at: string;
    }>
  >([]);
  const [refWithdrawals, setRefWithdrawals] = useState<
    Array<{
      id: string;
      username?: string;
      email?: string;
      amount_usd: number;
      target_type: string;
      wallet_address?: string | null;
      network?: string | null;
      status: string;
      tx_hash?: string | null;
      created_at: string;
    }>
  >([]);
  const [wdTxInputs, setWdTxInputs] = useState<Record<string, string>>({});

  // Channel (@Dollarino_official) Management State
  const [channelCheck, setChannelCheck] = useState<{
    ok?: boolean;
    channelHandle?: string;
    botStatus?: string;
    canPostMessages?: boolean;
    message?: string;
  } | null>(null);
  const [checkingChannel, setCheckingChannel] = useState(false);
  const [channelSignalForm, setChannelSignalForm] = useState({
    symbol: 'BTCUSDT',
    direction: 'LONG' as 'LONG' | 'SHORT',
    timeframe: '15m',
    entryPrice: '',
    stopLoss: '',
    tp1: '',
    tp2: '',
    tp3: '',
    leverage: 10,
    engineKey: 'dollarino_v01',
    note: '',
  });
  const [channelNewsForm, setChannelNewsForm] = useState({
    title: '',
    category: 'MARKET_NEWS',
    impact: 'HIGH',
    summary: '',
    analysis: '',
    symbolsText: 'BTCUSDT, ETHUSDT',
  });
  const [channelNewsList, setChannelNewsList] = useState<Array<{ id: string; title: string; category: string; impact: string; created_at: string }>>([]);

  const [aiEngines, setAiEngines] = useState<PlatformAIEngine[]>([]);
  const [aiSignals, setAiSignals] = useState<PlatformAISignal[]>([]);
  const [consensusMode, setConsensusMode] = useState('ENSEMBLE_AUTO');
  const [cacheTtlSec, setCacheTtlSec] = useState(180);
  const [testingAi, setTestingAi] = useState(false);
  const [hilinkupSecretReady, setHilinkupSecretReady] = useState(false);
  const [adminLightboxImg, setAdminLightboxImg] = useState<string | null>(null);
  const [aiTestResults, setAiTestResults] = useState<Array<{ slot_order: number; label: string; model: string; ok: boolean; latencyMs: number; reply: string }>>([]);
  const [aiForm, setAiForm] = useState({
    slotOrder: 1,
    provider: 'deepseek' as PlatformAIEngine['provider'],
    label: 'مدل ۱ (DeepSeek)',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    weight: 100,
  });

  // Copy Traders Admin State
  const [copyTraders, setCopyTraders] = useState<AdminCopyTrader[]>([]);
  const [newTrader, setNewTrader] = useState({
    displayName: '',
    handle: '@',
    specialty: 'BTC/ETH Momentum',
    bioFa: '',
    userEmailOrId: '',
    telegramId: '',
    askBeforePublish: true,
    winRate: 76,
    roi30dPct: 38,
    maxDrawdownPct: 5.5,
    riskLevel: 'BALANCED',
  });
  const [tradeTargetId, setTradeTargetId] = useState('');
  const [newTraderTrade, setNewTraderTrade] = useState({
    symbol: 'BTCUSDT',
    side: 'LONG' as 'LONG' | 'SHORT',
    entryPrice: 92000,
    stopLoss: 90200,
    tp1: 95200,
    tp2: 96800,
    tp3: 98500,
    leverage: 10,
    pnlPct: 12.4,
    status: 'OPEN' as 'OPEN' | 'CLOSED',
    askConfirm: false,
    mirrorNow: true,
    note: '',
  });

  // Online Support Admin State
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [allTicketMsgs, setAllTicketMsgs] = useState<AdminSupportMessage[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [supReply, setSupReply] = useState('');

  // Full Plans CRUD State
  const [adminPlans, setAdminPlans] = useState<PlanRow[]>([]);
  const [newPlan, setNewPlan] = useState({
    code: '',
    nameFa: '',
    nameEn: '',
    priceUsd: 29,
    priceToman: 2030000,
    durationDays: 30,
    isPopular: false,
  });

  const load = async () => {
    if (!isOwnerOrAdmin) return;
    const [ov, ordRes, subMe, aiRes, ctRes, supRes, plansRes, newsRes, dexRes, logRes, refAdminRes] = await Promise.all([
      apiFetch<AdminOverview>('/api/admin/overview'),
      apiFetch<{ orders: SubOrder[] }>('/api/subscriptions/admin/orders').catch(() => ({ orders: [] })),
      apiFetch<{ plans: PlanRow[]; paymentConfig: Record<string, string> }>('/api/subscriptions/me').catch(() => null),
      apiFetch<{
        engines: PlatformAIEngine[];
        consensusMode: string;
        cacheTtlSec: number;
        latestSignals: PlatformAISignal[];
        hilinkupSecretConfigured?: boolean;
      }>('/api/admin/ai-engines').catch(() => null),
      apiFetch<{ traders: AdminCopyTrader[]; trades: Array<{ id: string; trader_id: string; symbol: string; direction: string; entry_price: string; leverage: number; pnl_pct: number; status: string }> }>('/api/admin/copy-traders').catch(() => ({ traders: [], trades: [] })),
      apiFetch<{ tickets: AdminSupportTicket[]; messages: AdminSupportMessage[] }>('/api/admin/support').catch(() => ({ tickets: [], messages: [] })),
      apiFetch<{ plans: PlanRow[] }>('/api/admin/plans').catch(() => ({ plans: [] })),
      apiFetch<{ news: Array<{ id: string; title: string; category: string; impact: string; created_at: string }> }>('/api/admin/channel/news').catch(() => ({ news: [] })),
      apiFetch<{ trades: AdminDexTrade[] }>('/api/admin/dex-trades').catch(() => ({ trades: [] })),
      apiFetch<{ logs: AdminAuditLog[] }>('/api/admin/audit-logs').catch(() => ({ logs: [] })),
      apiFetch<{ referrals: typeof adminReferrals; withdrawals: typeof refWithdrawals }>('/api/admin/referrals').catch(() => ({ referrals: [], withdrawals: [] })),
    ]);
    setData(ov);
    setOrders(ordRes.orders);
    setAdminPlans(plansRes.plans || []);
    setChannelNewsList(newsRes.news || []);
    setDexTrades(dexRes.trades || []);
    setAuditLogs(logRes.logs || []);
    setAdminReferrals(refAdminRes.referrals || []);
    setRefWithdrawals(refAdminRes.withdrawals || []);
    setRequirePhoneKyc((ov.settings.require_telegram_phone_kyc ?? 'true') !== 'false');
    setTrustReceivers({
      evm: ov.settings.trust_wallet_evm_receiver || '',
      sol: ov.settings.trust_wallet_sol_receiver || '',
      ton: ov.settings.trust_wallet_ton_receiver || '',
    });
    const tradesMap = new Map<string, AdminCopyTrader['trades']>();
    for (const td of ctRes.trades || []) {
      const arr = tradesMap.get(td.trader_id) ?? [];
      arr.push({
        id: td.id,
        symbol: td.symbol,
        side: td.direction,
        entry_price: Number(td.entry_price),
        leverage: td.leverage,
        pnl_pct: td.pnl_pct,
        status: td.status,
      });
      tradesMap.set(td.trader_id, arr);
    }
    const mergedTraders = (ctRes.traders || []).map((t) => ({ ...t, trades: tradesMap.get(t.id) ?? [] }));
    setCopyTraders(mergedTraders);
    if (mergedTraders.length && !tradeTargetId) {
      setTradeTargetId(mergedTraders[0]!.id);
    }
    setTickets(supRes.tickets || []);
    setAllTicketMsgs(supRes.messages || []);
    setHelpText(ov.settings.help_text || '');
    if (aiRes) {
      setAiEngines(aiRes.engines || []);
      setConsensusMode(aiRes.consensusMode || 'ENSEMBLE_AUTO');
      setCacheTtlSec(aiRes.cacheTtlSec || 180);
      setAiSignals(aiRes.latestSignals || []);
      setHilinkupSecretReady(Boolean(aiRes.hilinkupSecretConfigured));
    }

    if (subMe) {
      const pro = subMe.plans.find((p) => p.code === 'pro_monthly');
      const vip = subMe.plans.find((p) => p.code === 'vip_quarterly');
      setPayCfg({
        subscriptionRequired: (subMe.paymentConfig.subscription_required ?? 'true') !== 'false',
        usdtTrc20Wallet: subMe.paymentConfig.usdt_trc20_wallet || '',
        iranCardNumber: subMe.paymentConfig.iran_card_number || '',
        iranCardHolder: subMe.paymentConfig.iran_card_holder || '',
        telegramSupport:
          subMe.paymentConfig.telegram_support && !/Dollarino_admin|Dollarinoofficial/i.test(subMe.paymentConfig.telegram_support)
            ? subMe.paymentConfig.telegram_support
            : '@Dollarino_bot',
        proPriceUsd: pro?.price_usd ?? 20,
        proPriceToman: pro?.price_toman ?? 1400000,
        vipPriceUsd: vip?.price_usd ?? 50,
        vipPriceToman: vip?.price_toman ?? 3500000,
      });
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [isOwnerOrAdmin]);

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ username }) });
      setMsg(isFa ? 'نام کاربری ذخیره شد.' : 'Username updated.');
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Profile update failed');
    }
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setMsg(isFa ? 'رمز عبور با موفقیت تغییر یافت.' : 'Password updated securely.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Password update failed');
    }
  };

  const reviewOrder = async (orderId: string, decision: 'APPROVE' | 'REJECT') => {
    setMsg(null);
    try {
      await apiFetch(`/api/subscriptions/admin/orders/${orderId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setMsg(decision === 'APPROVE' ? 'Subscription approved & activated!' : 'Order rejected.');
      await load();
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Order review failed');
    }
  };

  const [giftDays, setGiftDays] = useState(30);
  const [giftMaxUses, setGiftMaxUses] = useState(1);
  const [generatedGiftCode, setGeneratedGiftCode] = useState<string | null>(null);

  const createGiftCode = async () => {
    setMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; code: string; durationDays: number }>('/api/subscriptions/admin/gift-codes', {
        method: 'POST',
        body: JSON.stringify({ planCode: grantPlan, durationDays: giftDays, maxUses: giftMaxUses }),
      });
      setGeneratedGiftCode(res.code);
      setMsg(isFa ? `کد هدیه ساخته شد: ${res.code} (${res.durationDays} روز)` : `Gift Code Created: ${res.code} (${res.durationDays}d)`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Gift code creation failed');
    }
  };

  const grantSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch<{ email: string; days: number }>('/api/subscriptions/admin/grant', {
        method: 'POST',
        body: JSON.stringify({ emailOrUserId: grantEmail, planCode: grantPlan, days: grantDays }),
      });
      setGrantEmail('');
      setMsg(`Granted ${res.days}d ${grantPlan} to ${res.email}!`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Grant subscription failed');
    }
  };

  const savePayConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await Promise.all([
        apiFetch('/api/subscriptions/admin/config', {
          method: 'PATCH',
          body: JSON.stringify(payCfg),
        }),
        apiFetch('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            trust_wallet_evm_receiver: trustReceivers.evm.trim(),
            trust_wallet_sol_receiver: trustReceivers.sol.trim(),
            trust_wallet_ton_receiver: trustReceivers.ton.trim(),
            require_telegram_phone_kyc: requirePhoneKyc ? 'true' : 'false',
          }),
        }),
      ]);
      setMsg(isFa ? 'تنظیمات پرداخت، کیف‌پول Trust Wallet و احراز شماره تماس ذخیره شد.' : 'Payment, Trust Wallet receivers & KYC settings saved.');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save payment config');
    }
  };

  const savePlatformAiEngine = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/admin/ai-engines', {
        method: 'POST',
        body: JSON.stringify(aiForm),
      });
      setAiForm({ ...aiForm, apiKey: '' });
      setMsg(isFa ? `موتور هوش مصنوعی اسلات ${aiForm.slotOrder} ذخیره شد و برای کل پلتفرم فعال گردید!` : `Central AI Slot ${aiForm.slotOrder} saved!`);
      await load();
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save AI engine');
    }
  };

  const saveConsensusConfig = async () => {
    setMsg(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ai_consensus_mode: consensusMode,
          ai_cache_ttl_sec: String(cacheTtlSec),
        }),
      });
      setMsg(isFa ? 'حالت ترکیب مدل‌های هوش مصنوعی و زمان کش ذخیره شد.' : 'AI Consensus mode & cache TTL updated.');
      await load();
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save consensus config');
    }
  };

  const testPlatformEngines = async () => {
    setTestingAi(true);
    setAiTestResults([]);
    setMsg(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        results: Array<{ slot_order: number; label: string; model: string; ok: boolean; latencyMs: number; reply: string }>;
      }>('/api/admin/ai-engines/test', { method: 'POST' });
      setAiTestResults(res.results || []);
      setMsg(res.ok ? (isFa ? 'تست موتورهای هوش مصنوعی دلارینو موفق بود' : 'Dollarino AI test passed!') : 'One or more AI models failed');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && <div className="surface-card p-4 border-brand text-xs text-brand font-bold">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <form onSubmit={updateProfile} className="surface-card p-5 space-y-3">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-signal" />
            <span>{isFa ? 'پروفایل حساب کاربری' : 'Account Profile'}</span>
          </h3>
          <div className="text-sub">
            Email: <span className="text-main font-mono-num font-bold">{currentUser.email}</span> · Role:{' '}
            <span className="uppercase text-signal font-black">{currentUser.role}</span>
          </div>
          <div className="flex gap-2">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="flex-1 surface-input rounded-xl px-3 py-2" />
            <button type="submit" className="px-4 py-2 rounded-xl btn-emerald font-extrabold">
              {isFa ? 'ذخیره' : 'Save'}
            </button>
          </div>
        </form>

        <form onSubmit={updatePassword} className="surface-card p-5 space-y-3">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-flame" />
            <span>{isFa ? 'تغییر رمز عبور' : 'Security & Password'}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current Password"
              className="surface-input rounded-xl px-3 py-2"
            />
            <input
              required
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New Password (min 6)"
              className="surface-input rounded-xl px-3 py-2"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl btn-cobalt font-extrabold">
            {isFa ? 'به‌روزرسانی رمز عبور' : 'Update Password'}
          </button>
        </form>
      </div>

      {isOwnerOrAdmin && data && (
        <>
          {/* Organized Admin Command Bar */}
          <div className="panel rounded-3xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-brand" />
                <div>
                  <h2 className="text-sm sm:text-base font-black text-main">
                    {isFa ? 'مرکز فرماندهی و مدیریت کل دلارینو' : 'Dollarino Master Admin Desk'}
                  </h2>
                  <p className="text-[11px] text-dim">
                    {isFa
                      ? 'مدیریت یکپارچه کاربران، احراز هویت تلگرام، کیف‌پول‌های Trust Wallet، موتور AI، معاملات DEX و کانال رسمی'
                      : 'Unified control over users, Telegram phone KYC, Trust Wallet receivers, AI engines, DEX trades, and official channel'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {[
                  { id: 'all', icon: null, fa: 'همه بخش‌ها', en: 'All' },
                  { id: 'overview', icon: BrainCircuit, fa: 'هوش مصنوعی و آمار', en: 'AI & KPIs' },
                  { id: 'users', icon: Users, fa: 'کاربران و KYC', en: 'Users & KYC' },
                  { id: 'payments', icon: CreditCard, fa: 'مالی و Trust Wallet', en: 'Payments & Wallets' },
                  { id: 'ops', icon: Megaphone, fa: 'کانال، کپی‌ترید و پشتیبانی', en: 'Channel & Support' },
                  { id: 'dex_logs', icon: Flame, fa: 'DEX و لاگ‌ها', en: 'DEX & Audit Logs' },
                ].map((sec) => {
                  const SecIcon = sec.icon;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setAdminSection(sec.id as typeof adminSection)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition inline-flex items-center gap-1.5 ${
                        adminSection === sec.id ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                      }`}
                    >
                      {SecIcon && <SecIcon className="w-3.5 h-3.5" />}
                      <span>{isFa ? sec.fa : sec.en}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="surface-soft rounded-2xl p-3.5">
                <div className="text-[11px] text-sub">{isFa ? 'کل کاربران / تایید KYC' : 'Users / Phone KYC'}</div>
                <div className="text-lg font-black font-mono-num text-main mt-1 inline-flex items-center gap-1">
                  <span>{data.stats.totalUsers}</span>
                  <span className="text-xs text-jade inline-flex items-center gap-0.5">/ {data.stats.phoneVerifiedCount ?? 0} <Smartphone className="w-3 h-3" /></span>
                </div>
              </div>
              <div className="surface-soft rounded-2xl p-3.5">
                <div className="text-[11px] text-sub">{isFa ? 'کیف‌پول Trust Wallet' : 'Trust Wallets'}</div>
                <div className="text-lg font-black font-mono-num text-amber-400 mt-1 inline-flex items-center gap-1.5">
                  <span>{data.stats.trustWalletConnectedCount ?? 0}</span>
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="surface-soft rounded-2xl p-3.5">
                <div className="text-[11px] text-sub">{isFa ? 'اشتراک فعال / درآمد' : 'Subs / Revenue'}</div>
                <div className="text-lg font-black font-mono-num text-jade mt-1">
                  {data.stats.activeSubscriptions ?? 0} <span className="text-xs">(${Math.round(data.stats.totalRevenueUsd ?? 0)})</span>
                </div>
              </div>
              <div className="surface-soft rounded-2xl p-3.5">
                <div className="text-[11px] text-sub">{isFa ? 'سفارش در انتظار' : 'Pending Orders'}</div>
                <div className="text-lg font-black font-mono-num text-flame mt-1">
                  {orders.filter((o) => o.status === 'PENDING_REVIEW').length}
                </div>
              </div>
              <div className="surface-soft rounded-2xl p-3.5">
                <div className="text-[11px] text-sub">{isFa ? 'معاملات CEX / DEX' : 'CEX / DEX Trades'}</div>
                <div className="text-lg font-black font-mono-num text-main mt-1">
                  {data.stats.trades?.total ?? 0} <span className="text-xs text-brand">/ {data.stats.dexTradesTotal ?? dexTrades.length}</span>
                </div>
              </div>
              <div className="surface-soft rounded-2xl p-3.5">
                <div className="text-[11px] text-sub">{isFa ? 'سیگنال / تیکت باز' : 'Signals / Tickets'}</div>
                <div className="text-lg font-black font-mono-num text-main mt-1">
                  {data.stats.signalsCount} <span className="text-xs text-rose-400">/ {data.stats.openSupportTickets ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {(adminSection === 'all' || adminSection === 'overview') && (
          <>
          {/* Centralized Owner Multi-AI Engine (1 to 3 Combined Models) */}
          <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-5 border-[#1464F6]/35">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-brand" />
                  <span>{isFa ? 'موتور هوش مصنوعی دلارینو — موتور دُرّبین (۱ تا ۳ مدل ترکیبی)' : 'Dollarino AI Engine — Dorrbin (1–3 Combined Models)'}</span>
                </h3>
                <p className="text-xs text-sub mt-1">
                  {isFa
                    ? 'کلیدهای API خود را (۱، ۲ یا حداکثر ۳ مدل) اینجا وارد کنید. تمام کاربرانی که دکمه «هوش مصنوعی» را می‌زنند، از خروجی اجماع همین مدل‌ها معامله می‌کنند (بدون نیاز به API کاربر).'
                    : 'Connect 1 to 3 AI API keys here. Every platform user trading via AI uses this single combined consensus brain.'}
                </p>
              </div>
              <button
                type="button"
                disabled={testingAi}
                onClick={() => void testPlatformEngines()}
                className="px-4 py-2 rounded-xl btn-emerald text-xs font-black inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{testingAi ? '...' : isFa ? 'تست همزمان مدل‌های فعال' : 'Ping Active AI Models'}</span>
              </button>
            </div>

            {aiTestResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                {aiTestResults.map((r) => (
                  <div key={r.slot_order} className={`p-3 rounded-2xl border ${r.ok ? 'badge-signal' : 'bg-rose-500/10 border-rose-500/35'}`}>
                    <div className="font-black text-main flex items-center justify-between">
                      <span>#{r.slot_order} {r.label}</span>
                      <span className="font-mono-num text-[11px]">{r.latencyMs}ms</span>
                    </div>
                    <div className="text-[11px] text-sub mt-1 break-all">{r.reply}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Consensus Mode & Cache Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-4 rounded-2xl surface-soft border text-xs">
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">
                  {isFa ? 'حالت ترکیب مدل‌ها (Consensus)' : 'Consensus Mode'}
                </label>
                <select
                  value={consensusMode}
                  onChange={(e) => setConsensusMode(e.target.value)}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs"
                >
                  <option value="ENSEMBLE_AUTO">{isFa ? 'هوشمند خودکار (همه مدل‌های فعال تا ۳ مدل)' : 'Auto Ensemble (All active up to 3)'}</option>
                  <option value="SINGLE">{isFa ? 'تک‌مدل (فقط اسلات ۱)' : 'Single Model (Slot 1)'}</option>
                  <option value="DUAL">{isFa ? 'دو مدل ترکیبی (اسلات ۱ + ۲)' : 'Dual Consensus (Slots 1+2)'}</option>
                  <option value="ENSEMBLE_3">{isFa ? 'اجماع ۳ مدل همزمان (اسلات ۱ + ۲ + ۳)' : '3-Model Ensemble (Slots 1+2+3)'}</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">
                  {isFa ? 'زمان اشتراک‌گذاری کش بین کاربران (ثانیه)' : 'Shared Cache TTL (sec)'}
                </label>
                <input
                  type="number"
                  min={30}
                  max={900}
                  value={cacheTtlSec}
                  onChange={(e) => setCacheTtlSec(Number(e.target.value))}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <button
                type="button"
                onClick={() => void saveConsensusConfig()}
                className="py-2.5 px-4 rounded-xl btn-cobalt text-xs font-black"
              >
                {isFa ? 'ذخیره تنظیمات ترکیب' : 'Save Consensus Settings'}
              </button>
            </div>

            {/* Active Slots List (1..3) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {[1, 2, 3].map((slot) => {
                const eng = aiEngines.find((e) => e.slot_order === slot);
                return (
                  <div key={slot} className="surface-soft rounded-2xl p-4 border space-y-2.5 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full banner-cobalt-soft text-brand">
                          {isFa ? `اسلات ${slot}` : `Slot ${slot}`}
                        </span>
                        <div className="font-black text-main mt-1.5">
                          {eng ? eng.label : isFa ? 'خالی (اختیاری)' : 'Empty Slot'}
                        </div>
                        {eng && (
                          <div className="text-[11px] text-dim font-mono-num mt-0.5">
                            {eng.provider.toUpperCase()} · {eng.model}
                          </div>
                        )}
                      </div>
                      {eng && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/ai-engines/${eng.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ is_active: eng.is_active !== 1 }),
                            });
                            await load();
                            onUserUpdated();
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            eng.is_active === 1 ? 'badge-signal' : 'bg-slate-500/20 text-dim'
                          }`}
                        >
                          {eng.is_active === 1 ? (isFa ? 'فعال' : 'ON') : (isFa ? 'خاموش' : 'OFF')}
                        </button>
                      )}
                    </div>

                    {eng ? (
                      <div className="space-y-2 pt-2 border-t text-[11px]">
                        <div className="flex justify-between text-sub">
                          <span>Key: <span className="font-mono-num text-main">{eng.api_key_masked}</span></span>
                          <span>Weight: <span className="font-mono-num text-main">{eng.weight}%</span></span>
                        </div>
                        {eng.base_url && (
                          <div dir="ltr" className="text-[10px] font-mono text-dim truncate">
                            Base: {eng.base_url}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-dim">{eng.last_test_status || 'SAVED'}</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setAiForm({
                                  slotOrder: slot,
                                  provider: eng.provider,
                                  label: eng.label,
                                  model: eng.model,
                                  baseUrl: eng.base_url || '',
                                  apiKey: '',
                                  weight: eng.weight,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg surface-card text-brand font-bold"
                            >
                              {isFa ? 'ویرایش' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/ai-engines/${eng.id}`, { method: 'DELETE' });
                                await load();
                                onUserUpdated();
                              }}
                              className="p-1.5 rounded-lg surface-card text-rose-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setAiForm({
                            ...aiForm,
                            slotOrder: slot,
                            label: `مدل ${slot} (${aiForm.provider.toUpperCase()})`,
                          })
                        }
                        className="w-full py-2 rounded-xl surface-card text-brand font-bold hover:border-brand"
                      >
                        + {isFa ? `افزودن به اسلات ${slot}` : `Configure Slot ${slot}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add / Update Slot Form */}
            <form onSubmit={savePlatformAiEngine} className="pt-3 border-t space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="font-bold text-sub block">
                    {isFa ? 'افزودن یا ویرایش موتور هوش مصنوعی (پشتیبانی کامل از گیت‌وی Hilinkup / DeepSeek):' : 'Add / Edit AI Engine Slot (Supports custom Base URL / Gateway):'}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold ${hilinkupSecretReady ? 'text-jade' : 'text-amber-400'}`}>
                    {hilinkupSecretReady
                      ? isFa
                        ? '✓ کلید مرکزی DeepSeek / Hilinkup روی سرور (Secret) فعال است.'
                        : '✓ Central DeepSeek / Hilinkup Secret is active on Worker.'
                      : isFa
                        ? 'ℹ️ برای اتصال سریع DeepSeek، کلید API خود را در اسلات ۱ ذخیره کنید (یا در Cloudflare Secret ست کنید).'
                        : 'ℹ️ Paste your DeepSeek / Hilinkup API key in Slot 1 to connect immediately.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAiForm({
                      ...aiForm,
                      provider: 'openai_compatible',
                      baseUrl: 'https://api.hilinkup.com/v1',
                      model: 'baidu/deepseek-v4.1-flash-1017',
                      label: `مدل ${aiForm.slotOrder} (Hilinkup DeepSeek v4.1)`,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl banner-cobalt-soft text-brand font-bold text-[11px] inline-flex items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isFa ? 'پرکردن سریع DeepSeek / Hilinkup' : 'Fill DeepSeek / Hilinkup'}</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 items-end">
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'اسلات (۱-۳)' : 'Slot (1-3)'}</label>
                  <select
                    value={aiForm.slotOrder}
                    onChange={(e) => setAiForm({ ...aiForm, slotOrder: Number(e.target.value) })}
                    className="w-full surface-input rounded-xl px-2.5 py-2"
                  >
                    <option value={1}>Slot 1</option>
                    <option value={2}>Slot 2</option>
                    <option value={3}>Slot 3</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'سرویس‌دهنده' : 'Provider'}</label>
                  <select
                    value={aiForm.provider}
                    onChange={(e) => {
                      const p = e.target.value as PlatformAIEngine['provider'];
                      const models = ADMIN_AI_MODELS[p] || [];
                      const defaultBase =
                        p === 'deepseek'
                          ? 'https://api.deepseek.com'
                          : p === 'openai'
                            ? 'https://api.openai.com/v1'
                            : p === 'openai_compatible'
                              ? 'https://api.hilinkup.com/v1'
                              : '';
                      setAiForm({
                        ...aiForm,
                        provider: p,
                        model: models[0] || aiForm.model,
                        baseUrl: defaultBase,
                        label: `مدل ${aiForm.slotOrder} (${p.toUpperCase()})`,
                      });
                    }}
                    className="w-full surface-input rounded-xl px-2.5 py-2"
                  >
                    <option value="openai_compatible">Hilinkup / OpenAI-Compatible</option>
                    <option value="deepseek">DeepSeek Direct</option>
                    <option value="anthropic">Claude (Anthropic)</option>
                    <option value="openai">OpenAI GPT</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">Base URL</label>
                  <input
                    dir="ltr"
                    placeholder="https://api.hilinkup.com/v1"
                    value={aiForm.baseUrl}
                    onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })}
                    className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'نام مدل' : 'Model'}</label>
                  <input
                    list="admin-ai-models"
                    dir="ltr"
                    value={aiForm.model}
                    onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                    className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num"
                  />
                  <datalist id="admin-ai-models">
                    {(ADMIN_AI_MODELS[aiForm.provider] || []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'عنوان نمایشی' : 'Label'}</label>
                  <input
                    value={aiForm.label}
                    onChange={(e) => setAiForm({ ...aiForm, label: e.target.value })}
                    className="w-full surface-input rounded-xl px-2.5 py-2"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'کلید API (اختیاری)' : 'API Key'}</label>
                  <input
                    type="password"
                    dir="ltr"
                    placeholder="sk-..."
                    value={aiForm.apiKey}
                    onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                    className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num"
                  />
                </div>

                <button type="submit" className="py-2.5 px-3 rounded-xl btn-cobalt font-black inline-flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ثبت اسلات' : 'Save Slot'}</span>
                </button>
              </div>
            </form>

            {aiSignals.length > 0 && (
              <div className="pt-2 border-t space-y-2 text-xs">
                <div className="font-black text-sub">{isFa ? 'آخرین تصمیمات اجماع هوش مصنوعی دلارینو' : 'Recent Dollarino AI Signals'}</div>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {aiSignals.map((sig) => (
                    <div key={sig.id} className="surface-soft rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-black text-main">{sig.symbol} ({sig.timeframe})</span>{' '}
                        <span className={`font-black ${sig.action === 'LONG' ? 'text-signal' : sig.action === 'SHORT' ? 'text-loss' : 'text-dim'}`}>
                          {sig.action} ({sig.confidence}%)
                        </span>{' '}
                        <span className="text-[11px] text-dim">· {sig.model_count}x models</span>
                      </div>
                      <span className="text-[11px] text-sub truncate max-w-[360px]">{sig.thesis}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </>
          )}

          {(adminSection === 'all' || adminSection === 'payments') && (
          <>
          <div className="surface-card p-5 space-y-3 overflow-x-auto">
            <h3 className="text-sm font-black text-main flex items-center gap-2">
              <Crown className="w-4 h-4 text-flame" />
              <span>{isFa ? 'سفارش‌های خرید اشتراک (تایید / رد)' : 'Subscription Orders (Approve / Reject)'}</span>
            </h3>
            {orders.length === 0 ? (
              <p className="text-xs text-dim py-3">{isFa ? 'هنوز سفارشی ثبت نشده است.' : 'No subscription orders yet.'}</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-dim border-b">
                  <tr>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'کاربر' : 'User'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'پلن' : 'Plan'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'کد پیگیری' : 'Payment Ref'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                    <th className="py-2.5 px-2 text-end">{isFa ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 px-2">
                        <div className="font-bold text-main">{o.username}</div>
                        <div className="text-[11px] text-dim">{o.email}</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-bold text-brand">{isFa ? o.name_fa || o.plan_code : o.name_en || o.plan_code}</div>
                        <div className="text-[11px] font-mono-num text-dim">
                          ${o.amount_usd} / {o.amount_toman?.toLocaleString()}T
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono-num text-[11px]">
                        <span className="text-sub">{o.payment_method}</span>
                        <div className="text-main break-all max-w-[200px]">{o.payment_reference || '-'}</div>
                        {o.receipt_image_url && (
                          <button
                            type="button"
                            onClick={() => setAdminLightboxImg(o.receipt_image_url || null)}
                            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 font-sans text-[10px] font-bold"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{isFa ? 'مشاهده عکس رسید' : 'View Receipt'}</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
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
                      <td className="py-3 px-2 text-end space-x-1.5">
                        {o.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              onClick={() => void reviewOrder(o.id, 'APPROVE')}
                              className="px-2.5 py-1.5 rounded-xl btn-emerald font-bold inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isFa ? 'تایید' : 'Approve'}</span>
                            </button>
                            <button
                              onClick={() => void reviewOrder(o.id, 'REJECT')}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-loss font-bold inline-flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{isFa ? 'رد' : 'Reject'}</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <form onSubmit={grantSubscription} className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Gift className="w-4 h-4 text-signal" />
                <span>{isFa ? 'فعال‌سازی دستی اشتراک برای کاربر' : 'Manual Subscription Grant'}</span>
              </h3>
              <input
                required
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder={isFa ? 'ایمیل یا ID کاربر' : 'User Email or ID'}
                className="w-full surface-input rounded-xl px-3 py-2.5"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} className="surface-input rounded-xl px-3 py-2.5">
                  <option value="pro_monthly">1-Month ($20)</option>
                  <option value="vip_quarterly">3-Month ($50)</option>
                  <option value="pro_semiannual">6-Month ($90)</option>
                  <option value="pro_annual">1-Year ($160)</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={grantDays}
                  onChange={(e) => setGrantDays(Number(e.target.value))}
                  className="surface-input rounded-xl px-3 py-2.5 font-mono-num"
                />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl btn-emerald font-extrabold">
                {isFa ? 'اعطای اشتراک فعال' : 'Grant Active Subscription'}
              </button>

              <div className="pt-3 mt-2 border-t hairline space-y-2">
                <div className="text-[11px] font-bold text-sub">
                  {isFa ? 'تولید کد هدیه اشتراک (Gift Code):' : 'Generate Subscription Gift Code:'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min={1} max={3650} value={giftDays} onChange={(e) => setGiftDays(Number(e.target.value))} placeholder="Days" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                  <input type="number" min={1} max={500} value={giftMaxUses} onChange={(e) => setGiftMaxUses(Number(e.target.value))} placeholder="Uses" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                  <button type="button" onClick={() => void createGiftCode()} className="btn-cobalt rounded-xl font-black text-xs inline-flex items-center justify-center gap-1">
                    <Gift className="w-3.5 h-3.5" />
                    <span>{isFa ? 'ساخت کد' : 'Create'}</span>
                  </button>
                </div>
                {generatedGiftCode && (
                  <div className="p-2.5 rounded-xl surface-soft font-mono-num text-center font-black text-jade">
                    {generatedGiftCode}
                  </div>
                )}
              </div>
            </form>

            <form onSubmit={savePayConfig} className="surface-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'تنظیمات کیف‌پول و تعرفه پلن‌ها' : 'Payment Wallet & Plan Pricing'}</span>
                </h3>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-sub">
                  <input
                    type="checkbox"
                    checked={payCfg.subscriptionRequired}
                    onChange={(e) => setPayCfg({ ...payCfg, subscriptionRequired: e.target.checked })}
                  />
                  <span>{isFa ? 'اجبار اشتراک پولی' : 'Require Paid Plan'}</span>
                </label>
              </div>
              <input
                value={payCfg.usdtTrc20Wallet}
                onChange={(e) => setPayCfg({ ...payCfg, usdtTrc20Wallet: e.target.value })}
                placeholder="USDT TRC20 Wallet Address"
                className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={payCfg.iranCardNumber}
                  onChange={(e) => setPayCfg({ ...payCfg, iranCardNumber: e.target.value })}
                  placeholder="Card Number (6037-...)"
                  className="surface-input rounded-xl px-3 py-2 font-mono-num"
                />
                <input
                  value={payCfg.iranCardHolder}
                  onChange={(e) => setPayCfg({ ...payCfg, iranCardHolder: e.target.value })}
                  placeholder="Card Holder Name"
                  className="surface-input rounded-xl px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" value={payCfg.proPriceUsd} onChange={(e) => setPayCfg({ ...payCfg, proPriceUsd: Number(e.target.value) })} placeholder="Pro $" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.proPriceToman} onChange={(e) => setPayCfg({ ...payCfg, proPriceToman: Number(e.target.value) })} placeholder="Pro T" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.vipPriceUsd} onChange={(e) => setPayCfg({ ...payCfg, vipPriceUsd: Number(e.target.value) })} placeholder="VIP $" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.vipPriceToman} onChange={(e) => setPayCfg({ ...payCfg, vipPriceToman: Number(e.target.value) })} placeholder="VIP T" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
              </div>

              <div className="pt-2 border-t hairline space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-amber-400 inline-flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5" />
                    <span>{isFa ? 'آدرس‌های دریافت Trust Wallet و امنیت ربات:' : 'Trust Wallet Receivers & KYC Gate:'}</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-main">
                    <input
                      type="checkbox"
                      checked={requirePhoneKyc}
                      onChange={(e) => setRequirePhoneKyc(e.target.checked)}
                    />
                    <span>{isFa ? 'اجبار احراز شماره تماس تلگرام' : 'Require Telegram Phone KYC'}</span>
                  </label>
                </div>
                <input
                  dir="ltr"
                  value={trustReceivers.evm}
                  onChange={(e) => setTrustReceivers({ ...trustReceivers, evm: e.target.value })}
                  placeholder="Trust Wallet EVM / BEP20 Receiver (0x...)"
                  className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    dir="ltr"
                    value={trustReceivers.sol}
                    onChange={(e) => setTrustReceivers({ ...trustReceivers, sol: e.target.value })}
                    placeholder="Solana Receiver (optional)"
                    className="surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                  <input
                    dir="ltr"
                    value={trustReceivers.ton}
                    onChange={(e) => setTrustReceivers({ ...trustReceivers, ton: e.target.value })}
                    placeholder="TON Receiver (optional)"
                    className="surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt font-extrabold">
                {isFa ? 'ذخیره تنظیمات مالی، Trust Wallet و KYC' : 'Save Pricing, Trust Wallet & KYC'}
              </button>
            </form>
          </div>

          {/* Full Subscription Plans CRUD */}
          <div className="surface-card p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>{isFa ? 'مدیریت کامل پکیج‌ها و پلن‌های اشتراک' : 'Subscription Plans Manager'}</span>
              </h3>
              <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{adminPlans.length}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {adminPlans.map((pl) => (
                <div key={pl.code} className="surface-soft rounded-2xl p-3 space-y-2 border hairline">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-main truncate">{isFa ? pl.name_fa || pl.code : pl.name_en || pl.code}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/plans/${pl.code}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ is_active: pl.is_active !== 1 }),
                        });
                        await load();
                        onUserUpdated();
                      }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        pl.is_active === 1 ? 'badge-signal' : 'bg-rose-500/15 text-loss'
                      }`}
                    >
                      {pl.is_active === 1 ? (isFa ? 'فعال' : 'Active') : (isFa ? 'غیرفعال' : 'Hidden')}
                    </button>
                  </div>
                  <div className="text-[11px] text-dim font-mono-num" dir="ltr">
                    {pl.code} · ${pl.price_usd} · {Number(pl.price_toman || 0).toLocaleString()}T · {pl.duration_days || 30}d
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/plans/${pl.code}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ is_popular: pl.is_popular !== 1 }),
                        });
                        await load();
                      }}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-bold ${
                        pl.is_popular === 1 ? 'btn-gold' : 'surface-card text-dim'
                      }`}
                    >
                      {pl.is_popular === 1 ? '⭐ Popular' : 'Mark Popular'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/plans', {
                  method: 'POST',
                  body: JSON.stringify({
                    code: newPlan.code || undefined,
                    name_fa: newPlan.nameFa,
                    name_en: newPlan.nameEn || newPlan.nameFa,
                    price_usd: newPlan.priceUsd,
                    price_toman: newPlan.priceToman,
                    duration_days: newPlan.durationDays,
                    is_popular: newPlan.isPopular,
                    is_active: true,
                  }),
                });
                setNewPlan({ code: '', nameFa: '', nameEn: '', priceUsd: 29, priceToman: 2030000, durationDays: 30, isPopular: false });
                setMsg(isFa ? 'پلن اشتراک با موفقیت ذخیره شد.' : 'Subscription plan saved.');
                await load();
                onUserUpdated();
              }}
              className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-3 border-t hairline items-end"
            >
              <input
                value={newPlan.code}
                onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value })}
                placeholder="code (e.g. vip_60)"
                dir="ltr"
                className="surface-input rounded-xl px-2.5 py-2 font-mono-num"
              />
              <input
                required
                value={newPlan.nameFa}
                onChange={(e) => setNewPlan({ ...newPlan, nameFa: e.target.value })}
                placeholder={isFa ? 'نام فارسی پلن' : 'Persian Name'}
                className="surface-input rounded-xl px-2.5 py-2"
              />
              <input
                type="number"
                min={1}
                value={newPlan.priceUsd}
                onChange={(e) => setNewPlan({ ...newPlan, priceUsd: Number(e.target.value) })}
                placeholder="USD $"
                className="surface-input rounded-xl px-2.5 py-2 font-mono-num"
              />
              <input
                type="number"
                min={10000}
                value={newPlan.priceToman}
                onChange={(e) => setNewPlan({ ...newPlan, priceToman: Number(e.target.value) })}
                placeholder="Toman"
                className="surface-input rounded-xl px-2.5 py-2 font-mono-num"
              />
              <input
                type="number"
                min={1}
                value={newPlan.durationDays}
                onChange={(e) => setNewPlan({ ...newPlan, durationDays: Number(e.target.value) })}
                placeholder="Days"
                className="surface-input rounded-xl px-2.5 py-2 font-mono-num"
              />
              <button type="submit" className="btn-emerald py-2 px-3 rounded-xl font-black inline-flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'افزودن / آپدیت' : 'Save Plan'}</span>
              </button>
            </form>
          </div>

          {/* Referral Payouts & Anti-Fraud Audit Queue */}
          <div className="surface-card p-5 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Wallet className="w-4 h-4 text-jade" />
                <span>{isFa ? 'مدیریت تسویه برداشت‌های رفرال و کنترل تقلب' : 'Referral Payout Queue & Anti-Fraud'}</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full surface-soft text-[10px] font-bold">
                {refWithdrawals.filter((w) => w.status === 'PENDING').length} PENDING · {adminReferrals.filter((r) => r.fraud_flag === 1).length} FLAGGED
              </span>
            </div>

            {refWithdrawals.length === 0 ? (
              <p className="text-dim">{isFa ? 'هنوز درخواست برداشت رفرالی ثبت نشده است.' : 'No referral withdrawal requests yet.'}</p>
            ) : (
              <div className="space-y-2">
                {refWithdrawals.slice(0, 20).map((wd) => (
                  <div key={wd.id} className="surface-soft rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 border hairline">
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-bold text-main">
                        {wd.username || wd.email} · <span className="font-mono-num text-jade">${Number(wd.amount_usd).toFixed(2)}</span> ({wd.target_type === 'SUBSCRIPTION_CREDIT' ? 'Pro Days' : wd.network})
                      </div>
                      {wd.wallet_address && (
                        <div dir="ltr" className="font-mono-num text-[11px] text-sub break-all">{wd.wallet_address}</div>
                      )}
                      {wd.tx_hash && <div dir="ltr" className="text-[10px] text-jade font-mono-num">TX: {wd.tx_hash}</div>}
                    </div>
                    {wd.status === 'PENDING' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          dir="ltr"
                          value={wdTxInputs[wd.id] || ''}
                          onChange={(e) => setWdTxInputs((m) => ({ ...m, [wd.id]: e.target.value }))}
                          placeholder="TX Hash (optional)"
                          className="surface-input rounded-xl px-2.5 py-1.5 font-mono-num text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/referrals/withdrawals/${wd.id}/decide`, {
                              method: 'POST',
                              body: JSON.stringify({ decision: 'APPROVE', txHash: wdTxInputs[wd.id] || undefined }),
                            });
                            setMsg(isFa ? 'برداشت رفرال تایید و ثبت شد.' : 'Referral withdrawal approved.');
                            void load();
                          }}
                          className="btn-emerald px-3 py-1.5 rounded-xl font-black"
                        >
                          {isFa ? 'تایید واریز' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/referrals/withdrawals/${wd.id}/decide`, {
                              method: 'POST',
                              body: JSON.stringify({ decision: 'REJECT', adminNote: 'Rejected & refunded' }),
                            });
                            setMsg(isFa ? 'برداشت رد شد و موجودی به حساب کاربر بازگشت.' : 'Withdrawal rejected & refunded.');
                            void load();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-loss font-black"
                        >
                          {isFa ? 'رد و برگشت' : 'Reject'}
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${wd.status === 'APPROVED' ? 'badge-signal' : 'bg-rose-500/15 text-loss'}`}>
                        {wd.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {adminReferrals.some((r) => r.fraud_flag === 1) && (
              <div className="pt-3 border-t hairline space-y-1.5">
                <p className="font-bold text-loss">{isFa ? 'دعوت‌های مشکوک/مسدودشده توسط سیستم ضدتقلب:' : 'Anti-Fraud Flagged Referrals:'}</p>
                {adminReferrals.filter((r) => r.fraud_flag === 1).slice(0, 10).map((fr) => (
                  <div key={fr.id} className="surface-soft rounded-xl px-3 py-2 flex items-center justify-between text-[11px]">
                    <span>{fr.referrer_name} ← {fr.referred_name}</span>
                    <span className="text-loss font-mono-num">{fr.fraud_reason || fr.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
          )}

          {(adminSection === 'all' || adminSection === 'users') && (
          <div className="surface-card p-5 space-y-3 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black flex items-center gap-2 text-main">
                <Users className="w-4 h-4 text-brand" />
                <span>{isFa ? 'مدیریت کاربران، احراز هویت شماره و Trust Wallet' : 'Users, Phone KYC & Trust Wallets'}</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={isFa ? 'جستجو نام، ایمیل، تلفن، آدرس...' : 'Search user / phone / wallet...'}
                  className="surface-input rounded-xl px-3 py-1.5 text-xs"
                />
                {[
                  { id: 'all', label: isFa ? 'همه' : 'All' },
                  { id: 'kyc_verified', label: isFa ? 'KYC تایید' : 'Verified' },
                  { id: 'trust_wallet', label: isFa ? 'Trust Wallet' : 'Trust Wallet' },
                  { id: 'unverified', label: isFa ? 'بدون KYC' : 'Pending KYC' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setUserFilter(f.id as typeof userFilter)}
                    className={`px-2.5 py-1 rounded-lg font-bold ${userFilter === f.id ? 'btn-cobalt' : 'surface-soft text-dim'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <table className="w-full text-xs">
              <thead className="text-dim border-b">
                <tr>
                  <th className="py-2 px-2 text-start">User</th>
                  <th className="py-2 px-2 text-start">{isFa ? 'تلگرام و تلفن KYC' : 'Telegram & KYC'}</th>
                  <th className="py-2 px-2 text-start">{isFa ? 'کیف‌پول Trust Wallet' : 'Trust Wallet'}</th>
                  <th className="py-2 px-2 text-start">{isFa ? 'نقش / پلن / حالت' : 'Role / Plan / UI'}</th>
                  <th className="py-2 px-2 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.users
                  .filter((u) => {
                    if (userFilter === 'kyc_verified' && u.phone_verified !== 1) return false;
                    if (userFilter === 'trust_wallet' && !u.trust_wallet_address && !u.trust_wallet_tron) return false;
                    if (userFilter === 'unverified' && u.phone_verified === 1) return false;
                    const q = userSearch.trim().toLowerCase();
                    if (!q) return true;
                    return [u.username, u.email, u.telegram_id, u.telegram_username, u.phone_number, u.trust_wallet_address]
                      .filter(Boolean)
                      .some((v) => String(v).toLowerCase().includes(q));
                  })
                  .map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-2 text-main font-semibold">
                      <div>{u.username}</div>
                      <div className="text-[11px] text-dim">{u.email}</div>
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-sub">
                      <div>{u.telegram_username ? `@${u.telegram_username}` : u.telegram_id || '-'}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center gap-1 ${u.phone_verified === 1 ? 'text-jade font-bold' : 'text-amber-400'}`}>
                          {u.phone_verified === 1 ? <CheckCircle2 className="w-3 h-3" /> : null}
                          <span>{u.phone_verified === 1 ? u.phone_number || 'Verified' : 'Unverified'}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-[11px] text-sub" dir="ltr">
                      {u.trust_wallet_address ? (
                        <span className="badge-signal px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          <span>{u.trust_wallet_address.slice(0, 6)}...{u.trust_wallet_address.slice(-4)}</span>
                        </span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="px-2 py-0.5 rounded surface-soft text-main font-bold">{u.role}</span>
                        {u.activePlan && <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-jade font-bold">{u.activePlan}</span>}
                        <span className="px-2 py-0.5 rounded bg-white/5 text-dim">{u.ui_mode || 'simple'}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-end space-x-1 space-y-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/users/${u.id}/kyc`, {
                            method: 'PATCH',
                            body: JSON.stringify({ phoneVerified: u.phone_verified !== 1 }),
                          });
                          setMsg(isFa ? `وضعیت KYC کاربر ${u.username} بروزرسانی شد.` : 'User KYC updated.');
                          void load();
                        }}
                        className="px-2 py-1 rounded-lg bg-emerald-500/15 text-jade font-bold"
                      >
                        {u.phone_verified === 1 ? (isFa ? 'لغو KYC' : 'Revoke KYC') : (isFa ? 'تایید KYC' : 'Approve KYC')}
                      </button>
                      {u.role !== 'owner' && (
                        <>
                          {currentUser.role === 'owner' && (
                            <button
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ role: u.role === 'admin' ? 'user' : 'admin' }),
                                });
                                void load();
                              }}
                              className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand font-bold"
                            >
                              {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/users/${u.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ is_blocked: !u.is_blocked }),
                              });
                              void load();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-loss font-bold"
                          >
                            {u.is_blocked ? 'Unblock' : 'Block'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {(adminSection === 'all' || adminSection === 'ops') && (
          <>
          {/* Admin Copy Traders Manager + Online Support Inbox */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* Copy Traders Management */}
            <div className="surface-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>{isFa ? 'مدیریت تریدرهای تاییدشده کپی‌ترید' : 'Verified Copy Traders Manager'}</span>
                </h3>
                <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{copyTraders.length}</span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {copyTraders.map((tr) => (
                  <div key={tr.id} className="surface-soft rounded-xl p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-black text-main truncate">{tr.display_name} <span dir="ltr" className="text-dim font-mono">({tr.handle})</span></p>
                      <p className="text-[11px] text-dim" dir="ltr">
                        ROI +{tr.roi_30d_pct}% · WR {tr.win_rate}% · {tr.risk_level} · {tr.trades?.length || 0} trades
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/copy-traders/${tr.id}`, { method: 'DELETE' });
                        setMsg(isFa ? 'کپی‌تریدر حذف شد.' : 'Trader deleted.');
                        void load();
                      }}
                      className="text-loss hover:opacity-75 p-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const val = newTrader.userEmailOrId.trim();
                  await apiFetch('/api/admin/copy-traders', {
                    method: 'POST',
                    body: JSON.stringify({
                      display_name: newTrader.displayName,
                      handle: newTrader.handle,
                      specialty: newTrader.specialty,
                      bio_fa: newTrader.bioFa,
                      user_email: val.includes('@') ? val : undefined,
                      user_id: val && !val.includes('@') ? val : undefined,
                      telegram_id: newTrader.telegramId || undefined,
                      auto_ask_publish: newTrader.askBeforePublish,
                      win_rate: newTrader.winRate,
                      roi_30d_pct: newTrader.roi30dPct,
                      max_drawdown_pct: newTrader.maxDrawdownPct,
                      risk_level: newTrader.riskLevel === 'BALANCED' ? 'MEDIUM' : newTrader.riskLevel,
                      is_verified: true,
                    }),
                  });
                  setNewTrader({
                    ...newTrader,
                    displayName: '',
                    handle: '@',
                    bioFa: '',
                    userEmailOrId: '',
                    telegramId: '',
                  });
                  setMsg(isFa ? 'کپی‌تریدر تاییدشده جدید اضافه شد!' : 'Verified Copy Trader added!');
                  void load();
                }}
                className="space-y-2 pt-3 border-t hairline"
              >
                <p className="font-bold text-sub">{isFa ? 'افزودن تریدر تاییدشده جدید:' : 'Add Verified Trader:'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input required value={newTrader.displayName} onChange={(e) => setNewTrader({ ...newTrader, displayName: e.target.value })} placeholder={isFa ? 'نام تریدر' : 'Display Name'} className="surface-input rounded-xl px-3 py-2" />
                  <input required dir="ltr" value={newTrader.handle} onChange={(e) => setNewTrader({ ...newTrader, handle: e.target.value })} placeholder="@handle" className="surface-input rounded-xl px-3 py-2 font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input dir="ltr" value={newTrader.userEmailOrId} onChange={(e) => setNewTrader({ ...newTrader, userEmailOrId: e.target.value })} placeholder={isFa ? 'ایمیل یا ID کاربر سایت (اختیاری)' : 'Linked User Email/ID (opt)'} className="surface-input rounded-xl px-3 py-2" />
                  <input dir="ltr" value={newTrader.telegramId} onChange={(e) => setNewTrader({ ...newTrader, telegramId: e.target.value })} placeholder={isFa ? 'آیدی عددی تلگرام تریدر (اختیاری)' : 'Trader Telegram ID (opt)'} className="surface-input rounded-xl px-3 py-2 font-mono-num" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input value={newTrader.specialty} onChange={(e) => setNewTrader({ ...newTrader, specialty: e.target.value })} placeholder="Specialty" className="surface-input rounded-xl px-3 py-2" />
                  <input type="number" step="0.1" value={newTrader.roi30dPct} onChange={(e) => setNewTrader({ ...newTrader, roi30dPct: Number(e.target.value) })} placeholder="30d ROI %" className="surface-input rounded-xl px-3 py-2 font-mono-num" />
                  <input type="number" step="0.1" value={newTrader.winRate} onChange={(e) => setNewTrader({ ...newTrader, winRate: Number(e.target.value) })} placeholder="Win Rate %" className="surface-input rounded-xl px-3 py-2 font-mono-num" />
                </div>
                <label className="flex items-center gap-2 text-[11px] font-bold text-sub">
                  <input
                    type="checkbox"
                    checked={newTrader.askBeforePublish}
                    onChange={(e) => setNewTrader({ ...newTrader, askBeforePublish: e.target.checked })}
                  />
                  <span>{isFa ? 'قبل از انتشار هر معامله برای دنبال‌کننده‌ها، از خود تریدر تایید بگیر' : 'Ask trader confirmation before publishing to followers'}</span>
                </label>
                <button type="submit" className="w-full py-2 rounded-xl btn-gold font-black inline-flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ثبت تریدر تاییدشده' : 'Publish Verified Trader'}</span>
                </button>
              </form>

              {copyTraders.length > 0 && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const tid = tradeTargetId || copyTraders[0]!.id;
                    await apiFetch(`/api/admin/copy-traders/${tid}/trades`, {
                      method: 'POST',
                      body: JSON.stringify({
                        symbol: newTraderTrade.symbol,
                        direction: newTraderTrade.side,
                        leverage: newTraderTrade.leverage,
                        entry_price: String(newTraderTrade.entryPrice),
                        stop_loss: String(newTraderTrade.stopLoss),
                        tp1: String(newTraderTrade.tp1),
                        tp2: newTraderTrade.tp2 ? String(newTraderTrade.tp2) : undefined,
                        tp3: newTraderTrade.tp3 ? String(newTraderTrade.tp3) : undefined,
                        status: newTraderTrade.status,
                        pnl_pct: newTraderTrade.pnlPct,
                        ask_confirm: newTraderTrade.askConfirm,
                        mirror_now: newTraderTrade.mirrorNow,
                        note: newTraderTrade.note,
                      }),
                    });
                    setMsg(
                      newTraderTrade.askConfirm
                        ? isFa
                          ? 'درخواست تایید انتشار برای تریدر ارسال شد!'
                          : 'Confirmation prompt sent to trader!'
                        : isFa
                          ? 'معامله ثبت و برای دنبال‌کننده‌ها همگام شد!'
                          : 'Copy trade published & mirrored!'
                    );
                    void load();
                  }}
                  className="space-y-2 pt-3 border-t hairline"
                >
                  <p className="font-bold text-sub">{isFa ? 'ثبت معامله برای کپی توسط کاربران:' : 'Publish Trade for Users to Copy:'}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={tradeTargetId || copyTraders[0]?.id} onChange={(e) => setTradeTargetId(e.target.value)} className="surface-input rounded-xl px-2 py-2">
                      {copyTraders.map((t) => (
                        <option key={t.id} value={t.id}>{t.display_name}</option>
                      ))}
                    </select>
                    <input dir="ltr" value={newTraderTrade.symbol} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, symbol: e.target.value.toUpperCase() })} placeholder="BTCUSDT" className="surface-input rounded-xl px-2 py-2 font-mono" />
                    <select value={newTraderTrade.side} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, side: e.target.value as 'LONG' | 'SHORT' })} className="surface-input rounded-xl px-2 py-2">
                      <option value="LONG">LONG</option>
                      <option value="SHORT">SHORT</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <input type="number" step="any" value={newTraderTrade.entryPrice} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, entryPrice: Number(e.target.value) })} placeholder="Entry" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="any" value={newTraderTrade.stopLoss} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, stopLoss: Number(e.target.value) })} placeholder="SL" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="any" value={newTraderTrade.tp1} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp1: Number(e.target.value) })} placeholder="TP1" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="any" value={newTraderTrade.tp2} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp2: Number(e.target.value) })} placeholder="TP2" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="any" value={newTraderTrade.tp3} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp3: Number(e.target.value) })} placeholder="TP3" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="0.1" value={newTraderTrade.pnlPct} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, pnlPct: Number(e.target.value) })} placeholder="PnL%" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  </div>
                  <div className="flex flex-wrap gap-4 text-[11px] font-bold text-sub">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={newTraderTrade.askConfirm} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, askConfirm: e.target.checked })} />
                      <span>{isFa ? 'ابتدا از تریدر سوال تایید بپرس' : 'Ask trader first'}</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={newTraderTrade.mirrorNow} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, mirrorNow: e.target.checked })} />
                      <span>{isFa ? 'آینه‌سازی فوری به فالوئرها' : 'Mirror immediately'}</span>
                    </label>
                  </div>
                  <button type="submit" className="w-full py-2 rounded-xl btn-emerald font-black">
                    {isFa ? 'ثبت معامله در لیست کپی‌ترید' : 'Publish Copy Trade'}
                  </button>
                </form>
              )}
            </div>

            {/* Online Support Inbox */}
            <div className="surface-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-jade" />
                  <span>{isFa ? 'صندوق تیکت‌های پشتیبانی آنلاین (همگام با تلگرام)' : 'Online Support Inbox (Synced with Telegram)'}</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-black">
                  {tickets.filter((t) => t.status === 'OPEN').length} {isFa ? 'باز' : 'OPEN'}
                </span>
              </div>

              {tickets.length === 0 ? (
                <p className="text-center py-8 text-dim">{isFa ? 'هنوز تیکت پشتیبانی ارسال نشده است.' : 'No support tickets yet.'}</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {tickets.map((tk) => (
                      <button
                        key={tk.id}
                        type="button"
                        onClick={() => setActiveTicketId(tk.id)}
                        className={`w-full rounded-xl p-2.5 text-start flex items-center justify-between gap-2 transition ${
                          activeTicketId === tk.id ? 'btn-cobalt text-white' : 'surface-soft hover:bg-[var(--soft)]'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold truncate">{tk.username || tk.email || 'User'} · {tk.subject}</p>
                          <p className="text-[10px] opacity-75">{new Date(tk.last_message_at).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${tk.status === 'OPEN' ? 'bg-emerald-500/20 text-jade' : 'bg-white/10 text-dim'}`}>
                          {tk.status}
                        </span>
                      </button>
                    ))}
                  </div>

                  {activeTicketId && (
                    <div className="surface-soft rounded-2xl p-3 space-y-2.5 border hairline">
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {allTicketMsgs
                          .filter((m) => m.ticket_id === activeTicketId)
                          .map((m) => (
                            <div key={m.id} className={`rounded-xl p-2 ${m.sender_role === 'admin' ? 'bg-[#1652F0]/15 text-main' : 'panel'}`}>
                              <p className="text-[10px] font-black text-dim">{m.sender_role === 'admin' ? 'پشتیبانی دلارینو' : m.sender_name || 'کاربر'}</p>
                              {m.image_data_url && (
                                <button
                                  type="button"
                                  onClick={() => setAdminLightboxImg(m.image_data_url || null)}
                                  className="block my-1.5 rounded-xl overflow-hidden border hairline"
                                >
                                  <img src={m.image_data_url} alt="Support attachment" className="max-h-36 w-auto object-contain" />
                                </button>
                              )}
                              <p className="text-xs text-main mt-0.5 whitespace-pre-wrap">{m.message}</p>
                            </div>
                          ))}
                      </div>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!supReply.trim()) return;
                          await apiFetch(`/api/admin/support/${activeTicketId}/reply`, {
                            method: 'POST',
                            body: JSON.stringify({ message: supReply.trim() }),
                          });
                          setSupReply('');
                          await load();
                          setMsg(isFa ? 'پاسخ ارسال شد و به تلگرام کاربر هم مخابره گردید.' : 'Reply sent & notified on Telegram.');
                        }}
                        className="flex gap-2"
                      >
                        <input
                          value={supReply}
                          onChange={(e) => setSupReply(e.target.value)}
                          placeholder={isFa ? 'پاسخ پشتیبانی را بنویسید...' : 'Write admin reply...'}
                          className="flex-1 surface-input rounded-xl px-3 py-2 text-xs"
                        />
                        <button type="submit" className="btn-emerald px-3.5 py-2 rounded-xl font-black inline-flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{isFa ? 'ارسال' : 'Reply'}</span>
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/support/${activeTicketId}/status`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'CLOSED' }),
                          });
                          setMsg(isFa ? 'تیکت بسته شد.' : 'Ticket closed.');
                          void load();
                        }}
                        className="text-[11px] font-bold text-loss hover:underline"
                      >
                        {isFa ? 'بستن این تیکت' : 'Close Ticket'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Official Telegram Channel @Dollarino_official Studio */}
          <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-5 border-emerald-500/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                  <Radio className="w-5 h-5 text-jade" />
                  <span>{isFa ? 'مدیریت کانال رسمی دلارینو (@Dollarino_official)' : 'Official Channel Studio (@Dollarino_official)'}</span>
                </h3>
                <p className="text-xs text-sub mt-1">
                  {isFa
                    ? 'بررسی وضعیت ادمین بودن ربات @Dollarino_bot در کانال، انتشار سیگنال با دکمه‌های تعاملی، و انتشار اخبار و تحلیل فاندامنتال.'
                    : 'Verify channel admin status, broadcast signals with inline execution buttons, and post breaking fundamental news.'}
                </p>
              </div>
              <button
                type="button"
                disabled={checkingChannel}
                onClick={async () => {
                  setCheckingChannel(true);
                  try {
                    const res = await apiFetch<typeof channelCheck>('/api/admin/telegram/channel-status');
                    setChannelCheck(res);
                  } catch (e) {
                    setChannelCheck({ ok: false, message: e instanceof Error ? e.message : 'Check failed' });
                  } finally {
                    setCheckingChannel(false);
                  }
                }}
                className="px-4 py-2 rounded-xl btn-emerald text-xs font-black inline-flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{checkingChannel ? '...' : isFa ? 'بررسی ادمین ربات در کانال' : 'Check Bot Admin Status'}</span>
              </button>
            </div>

            {channelCheck && (
              <div className={`rounded-2xl p-3 text-xs font-bold border ${channelCheck.canPostMessages ? 'badge-signal' : 'bg-rose-500/10 border-rose-500/35 text-loss'}`}>
                {channelCheck.message || `Status: ${channelCheck.botStatus || 'unknown'} (${channelCheck.channelHandle || '@Dollarino_official'})`}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/channel/publish-signal', {
                      method: 'POST',
                      body: JSON.stringify({
                        symbol: channelSignalForm.symbol,
                        direction: channelSignalForm.direction,
                        timeframe: channelSignalForm.timeframe,
                        entryPrice: channelSignalForm.entryPrice || undefined,
                        stopLoss: channelSignalForm.stopLoss,
                        tp1: channelSignalForm.tp1,
                        tp2: channelSignalForm.tp2 || undefined,
                        tp3: channelSignalForm.tp3 || undefined,
                        leverage: channelSignalForm.leverage,
                        engineKey: channelSignalForm.engineKey,
                        note: channelSignalForm.note || undefined,
                      }),
                    });
                    setMsg(isFa ? 'سیگنال با دکمه‌های تعاملی در کانال @Dollarino_official منتشر شد.' : 'Signal published to channel.');
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Publish signal failed');
                  }
                }}
                className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline"
              >
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <Megaphone className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'ارسال سیگنال رسمی به کانال با دکمه‌های تعاملی' : 'Publish Signal to @Dollarino_official'}</span>
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <input dir="ltr" required value={channelSignalForm.symbol} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, symbol: e.target.value.toUpperCase() })} placeholder="BTCUSDT" className="surface-input rounded-xl px-2.5 py-2 font-mono" />
                  <select value={channelSignalForm.direction} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, direction: e.target.value as 'LONG' | 'SHORT' })} className="surface-input rounded-xl px-2.5 py-2">
                    <option value="LONG">LONG</option>
                    <option value="SHORT">SHORT</option>
                  </select>
                  <select value={channelSignalForm.engineKey} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, engineKey: e.target.value })} className="surface-input rounded-xl px-2.5 py-2">
                    <option value="dollarino_v01">استراتژی شکار (دُرنا)</option>
                    <option value="ai_autonomous_agent">هوش مصنوعی دلارینو</option>
                    <option value="my_custom_ai">هوش مصنوعی خام</option>
                    <option value="copy_trade">کپی‌ترید تاییدشده</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <input dir="ltr" value={channelSignalForm.entryPrice} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, entryPrice: e.target.value })} placeholder="Entry (auto)" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input dir="ltr" required value={channelSignalForm.stopLoss} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, stopLoss: e.target.value })} placeholder="SL *" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input dir="ltr" required value={channelSignalForm.tp1} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp1: e.target.value })} placeholder="TP1 *" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input dir="ltr" value={channelSignalForm.tp2} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp2: e.target.value })} placeholder="TP2" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input dir="ltr" value={channelSignalForm.tp3} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp3: e.target.value })} placeholder="TP3" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input type="number" min={1} max={100} value={channelSignalForm.leverage} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, leverage: Number(e.target.value) })} placeholder="Lev" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                </div>
                <input value={channelSignalForm.note} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, note: e.target.value })} placeholder={isFa ? 'توضیح تحلیلی کوتاه زیر سیگنال (اختیاری)' : 'Short note (optional)'} className="w-full surface-input rounded-xl px-2.5 py-2" />
                <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt font-black">
                  {isFa ? 'انتشار سیگنال در کانال @Dollarino_official' : 'Publish Signal to Channel'}
                </button>
              </form>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const bodyParts = [
                      channelNewsForm.summary.trim(),
                      channelNewsForm.analysis.trim() ? `\n📊 تحلیل اثر: ${channelNewsForm.analysis.trim()}` : '',
                      channelNewsForm.symbolsText.trim() ? `\n🪙 نمادها: ${channelNewsForm.symbolsText.trim()}` : '',
                    ].filter(Boolean);
                    await apiFetch('/api/admin/channel/publish-news', {
                      method: 'POST',
                      body: JSON.stringify({
                        title: `${channelNewsForm.impact === 'HIGH' ? '🔴 ' : channelNewsForm.impact === 'MEDIUM' ? '🟡 ' : ''}${channelNewsForm.title.trim()}`,
                        category: channelNewsForm.category === 'ANALYSIS' ? 'ANALYSIS' : 'NEWS',
                        body: bodyParts.join(''),
                      }),
                    });
                    setChannelNewsForm({ ...channelNewsForm, title: '', summary: '', analysis: '' });
                    setMsg(isFa ? 'خبر و تحلیل فاندامنتال در کانال @Dollarino_official منتشر شد.' : 'News published to channel.');
                    void load();
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Publish news failed');
                  }
                }}
                className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline"
              >
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <Newspaper className="w-4 h-4 text-amber-400" />
                  <span>{isFa ? 'انتشار اخبار فوری و تحلیل فاندامنتال در کانال' : 'Publish Breaking News & Fundamental Analysis'}</span>
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <input required value={channelNewsForm.title} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, title: e.target.value })} placeholder={isFa ? 'تیتر خبر یا تحلیل...' : 'Headline...'} className="col-span-2 surface-input rounded-xl px-2.5 py-2" />
                  <select value={channelNewsForm.impact} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, impact: e.target.value })} className="surface-input rounded-xl px-2 py-2">
                    <option value="HIGH">HIGH IMPACT</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">INFO</option>
                  </select>
                </div>
                <textarea required rows={2} value={channelNewsForm.summary} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, summary: e.target.value })} placeholder={isFa ? 'متن خبر یا داده‌های فاندامنتال...' : 'News summary...'} className="w-full surface-input rounded-xl p-2.5" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={channelNewsForm.analysis} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, analysis: e.target.value })} placeholder={isFa ? 'تحلیل اثر روی بازار (اختیاری)' : 'Market impact analysis'} className="surface-input rounded-xl px-2.5 py-2" />
                  <input dir="ltr" value={channelNewsForm.symbolsText} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, symbolsText: e.target.value })} placeholder="BTCUSDT, ETHUSDT" className="surface-input rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <button type="submit" className="w-full py-2.5 rounded-xl btn-gold font-black">
                  {isFa ? 'انتشار خبر فوری در کانال @Dollarino_official' : 'Broadcast News to Channel'}
                </button>
                {channelNewsList.length > 0 && (
                  <div className="text-[11px] text-dim pt-1 space-y-1 max-h-24 overflow-y-auto">
                    {channelNewsList.slice(0, 4).map((n) => (
                      <div key={n.id} className="truncate">• [{n.category}] {n.title}</div>
                    ))}
                  </div>
                )}
              </form>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm flex items-center gap-2 text-main">
                <Shield className="w-4 h-4 text-signal" />
                <span>{isFa ? 'ویرایش متن راهنمای ربات تلگرام' : 'Telegram Bot Help Message'}</span>
              </h3>
              <textarea rows={4} value={helpText} onChange={(e) => setHelpText(e.target.value)} className="w-full surface-input rounded-2xl p-3" />
              <button
                onClick={async () => {
                  await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ help_text: helpText }) });
                  setMsg('Help message updated.');
                }}
                className="px-4 py-2 rounded-xl btn-emerald font-bold"
              >
                Save Help Text
              </button>
            </div>

            <div className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm flex items-center gap-2 text-main">
                <Send className="w-4 h-4 text-flame" />
                <span>{isFa ? 'ارسال پیام همگانی به کاربران تلگرام' : 'Telegram Broadcast'}</span>
              </h3>
              <textarea
                rows={4}
                value={broadcast}
                onChange={(e) => setBroadcast(e.target.value)}
                placeholder="Write announcement..."
                className="w-full surface-input rounded-2xl p-3"
              />
              <button
                onClick={async () => {
                  const res = await apiFetch<{ sent: number }>('/api/admin/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({ message: broadcast }),
                  });
                  setBroadcast('');
                  setMsg(`Broadcast sent to ${res.sent} Telegram users.`);
                }}
                className="px-4 py-2 rounded-xl btn-cobalt font-bold"
              >
                Send Broadcast
              </button>
            </div>
          </div>

          {/* BotFather Complete Setup & Command Sync Card */}
          <div className="surface-card p-5 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-sm flex items-center gap-2 text-main">
                  <Bot className="w-4 h-4 text-[#0EA5E9]" />
                  <span>{isFa ? 'پیکربندی کامل ربات @Dollarino_bot و BotFather' : '@Dollarino_bot & BotFather Control'}</span>
                </h3>
                <p className="text-[11px] text-sub mt-0.5">
                  {isFa
                    ? 'ثبت هم‌زمان ۱۴ دستور اسلش، دکمه منوی مینی‌اپ و وب‌هوک تلگرام به همراه چک‌لیست تنظیمات BotFather'
                    : 'Sync all 14 slash commands, Mini App Menu button, webhook, and BotFather settings checklist'}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await apiFetch<{ ok: boolean; webhook?: boolean; commands?: boolean; menuButton?: boolean }>(
                      '/api/webhook/telegram/setup',
                      { method: 'POST', body: JSON.stringify({}) }
                    );
                    setMsg(
                      res.ok
                        ? isFa
                          ? 'وب‌هوک، ۱۴ دستور ربات و دکمه مینی‌اپ با موفقیت روی تلگرام همگام‌سازی شدند.'
                          : 'Webhook, commands & Mini App menu synced to Telegram.'
                        : 'Setup failed'
                    );
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Telegram setup error');
                  }
                }}
                className="btn-cobalt px-4 py-2 rounded-xl font-black inline-flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isFa ? 'همگام‌سازی فوری با سرور تلگرام' : 'Sync Bot Commands & Webhook'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="surface-soft rounded-2xl p-4 space-y-2 border hairline">
                <div className="flex items-center justify-between">
                  <span className="font-black text-main">{isFa ? '۱. دستورات آماده برای /setcommands در @BotFather:' : '1. /setcommands List for @BotFather:'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const cmds = [
                        'start - شروع، احراز هویت و منوی اصلی دلارینو',
                        'app - باز کردن مینی‌اپ معاملاتی دلارینو',
                        'weblogin - دریافت لینک ورود فوری با یک کلیک به سایت',
                        'wizard - راه‌اندازی ۴ مرحله‌ای ربات ترید',
                        'positions - مشاهده و مدیریت معاملات باز',
                        'balance - نمایش موجودی لحظه‌ای حساب',
                        'wallet - مدیریت کیف‌پول Trust Wallet DApp',
                        'dex - رادار توکن‌های داغ DexScreener',
                        'myai - آموزش و فعال‌سازی هوش مصنوعی من',
                        'copy - کپی‌ترید تاییدشده دلارینو',
                        'card - صدور و دریافت تصویر کارت سود دلارینو',
                        'settings - تنظیمات بازار (اسپات/فیوچرز) و جهت',
                        'support - پشتیبانی هوشمند ۲۴/۷ و گفتگو با مدیران',
                        'help - راهنمای کامل و امنیت حساب',
                      ].join('\n');
                      void navigator.clipboard?.writeText(cmds);
                      setMsg(isFa ? 'لیست ۱۴ دستور BotFather کپی شد.' : 'Commands copied.');
                    }}
                    className="btn-ghost px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1 text-[11px]"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{isFa ? 'کپی دستورات' : 'Copy'}</span>
                  </button>
                </div>
                <pre dir="ltr" className="text-[11px] font-mono-num text-sub bg-black/20 rounded-xl p-3 overflow-x-auto leading-relaxed">
{`start - شروع، احراز هویت و منوی اصلی دلارینو
app - باز کردن مینی‌اپ معاملاتی دلارینو
weblogin - دریافت لینک ورود فوری با یک کلیک به سایت
wizard - راه‌اندازی ۴ مرحله‌ای ربات ترید
positions - مشاهده و مدیریت معاملات باز
balance - نمایش موجودی لحظه‌ای حساب
wallet - مدیریت کیف‌پول Trust Wallet DApp
dex - رادار توکن‌های داغ DexScreener
myai - آموزش و فعال‌سازی هوش مصنوعی من
copy - کپی‌ترید تاییدشده دلارینو
card - صدور و دریافت تصویر کارت سود دلارینو
settings - تنظیمات بازار (اسپات/فیوچرز) و جهت
support - پشتیبانی هوشمند ۲۴/۷ و گفتگو با مدیران
help - راهنمای کامل و امنیت حساب`}
                </pre>
              </div>

              <div className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline leading-relaxed">
                <span className="font-black text-main block">{isFa ? '۲. چک‌لیست تنظیمات داخل @BotFather (بخش Edit Bot / Bot Settings):' : '2. @BotFather Checklist (Bot Settings):'}</span>
                <ul className="space-y-1.5 text-[11px] text-sub">
                  <li>
                    <strong className="text-main">• Mini Apps (/newapp &amp; Menu Button):</strong>{' '}
                    {isFa ? 'آدرس وب‌اپ را روی دامنه اصلی (https://dollarino.pages.dev) ثبت کنید؛ دکمه بالای منو با دکمه «همگام‌سازی فوری» خودکار ست می‌شود.' : 'Register your Mini App URL and Menu Button.'}
                  </li>
                  <li>
                    <strong className="text-main">• Domain / Login Widget (/setdomain):</strong>{' '}
                    {isFa ? 'دامنه سایت را با /setdomain در BotFather ثبت کنید تا ورود رسمی Login Widget (در صورت نیاز) بدون خطای دامنه کار کند.' : 'Bind domain via /setdomain for Telegram Login Widget.'}
                  </li>
                  <li>
                    <strong className="text-main">• Group Privacy &amp; Allow Groups:</strong>{' '}
                    {isFa ? 'اگر ربات قرار است در گروه سیگنال یا پشتیبانی پاسخ دهد، Group Privacy را روی Disable بگذارید و ربات را ادمین کانال رسمی کنید.' : 'Disable Group Privacy if bot moderates groups; promote bot as Channel Admin for signal publishing.'}
                  </li>
                  <li>
                    <strong className="text-main">• Payments &amp; Affiliate Program:</strong>{' '}
                    {isFa ? 'پرداخت‌های ریالی/ارزی اشتراک از طریق Trust Wallet BEP20/TRC20 داخل ربات فعال است؛ در صورت تمایل به دریافت Telegram Stars، بخش Payments را در BotFather وصل کنید.' : 'Trust Wallet BEP20/TRC20 checkout is built-in; optionally link Payments for Telegram Stars.'}
                  </li>
                  <li>
                    <strong className="text-main">• About / Description / Botpic:</strong>{' '}
                    {isFa ? 'متن معرفی و لوگوی رسمی دلارینو را در Edit Bot تکمیل کنید تا صفحه اول ربات قبل از زدن Start حرفه‌ای دیده شود.' : 'Set About, Description, and Botpic in @BotFather -> Edit Bot.'}
                  </li>
                </ul>
              </div>
            </div>
          </div>
          </>
          )}

          {(adminSection === 'all' || adminSection === 'dex_logs') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="surface-card p-5 space-y-3 overflow-x-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-sm text-main inline-flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>{isFa ? 'معاملات غیرمتمرکز DEX و Trust Wallet کاربران' : 'User DEX & Trust Wallet Trades'}</span>
                  </h3>
                  <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{dexTrades.length}</span>
                </div>
                {dexTrades.length === 0 ? (
                  <p className="text-dim py-4 text-center">{isFa ? 'هنوز معامله DEX ثبت نشده است.' : 'No DEX trades logged yet.'}</p>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="text-dim border-b">
                      <tr>
                        <th className="py-2 text-start">User</th>
                        <th className="py-2 text-start">Token / Chain</th>
                        <th className="py-2 text-start">Side / Amount</th>
                        <th className="py-2 text-end">PnL / Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dexTrades.slice(0, 25).map((dt) => (
                        <tr key={dt.id}>
                          <td className="py-2 font-semibold text-main">{dt.username || dt.email || dt.user_id}</td>
                          <td className="py-2 font-mono-num" dir="ltr">
                            <span className="font-bold text-main">{dt.token_symbol}</span>{' '}
                            <span className="text-dim">({dt.chain_id})</span>
                          </td>
                          <td className="py-2 font-mono-num" dir="ltr">
                            {dt.side} · ${Number(dt.amount_usd || 0).toFixed(2)}
                          </td>
                          <td className="py-2 text-end font-mono-num">
                            <span className={Number(dt.pnl_usd || 0) >= 0 ? 'text-jade' : 'text-loss'}>
                              ${Number(dt.pnl_usd || 0).toFixed(2)}
                            </span>{' '}
                            <span className="text-dim">({dt.status})</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="surface-card p-5 space-y-3 overflow-x-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-sm text-main inline-flex items-center gap-1.5">
                    <History className="w-4 h-4 text-brand" />
                    <span>{isFa ? 'لاگ‌های حسابرسی و امنیت سیستم (Audit Logs)' : 'System & Security Audit Logs'}</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full surface-soft text-[10px] font-black">{auditLogs.length}</span>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {auditLogs.slice(0, 40).map((lg) => (
                    <div key={lg.id} className="surface-soft rounded-xl p-2.5 flex items-start justify-between gap-2 text-[11px]">
                      <div className="min-w-0">
                        <span className="font-black text-brand">[{lg.category}]</span>{' '}
                        <span className="text-main">{lg.message}</span>
                        {(lg.username || lg.email) && (
                          <div className="text-[10px] text-dim">{lg.username || lg.email}</div>
                        )}
                      </div>
                      <span dir="ltr" className="text-[10px] font-mono-num text-dim shrink-0">
                        {lg.created_at?.slice(5, 16)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {adminLightboxImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setAdminLightboxImg(null)}
        >
          <button
            type="button"
            onClick={() => setAdminLightboxImg(null)}
            className="absolute top-4 end-4 h-10 w-10 rounded-full bg-white/15 text-white grid place-items-center"
          >
            <XCircle className="w-5 h-5" />
          </button>
          <img
            src={adminLightboxImg}
            alt="Admin receipt or screenshot preview"
            className="max-w-full max-h-[88vh] rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
