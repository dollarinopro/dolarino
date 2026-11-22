import { Hono } from 'hono';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import { logAudit } from '../engine/executor.js';
import type { AuthUser, Env } from '../env.js';
import { enforceRateLimit, maskUsernameForReferral } from '../security.js';
import { TelegramBotClient } from '../telegram/client.js';
import { ANTI_SCAM_WARNING_FA, OFFICIAL_BOT_HANDLE } from '../telegram/formatter.js';
import { notifyAllAdmins, notifyAllAdminsPhoto } from '../telegram/publisher.js';

export interface SubscriptionPlanRow {
  code: string;
  name_fa: string;
  name_en: string;
  description_fa: string | null;
  description_en: string | null;
  price_usd: number;
  price_toman: number;
  duration_days: number;
  max_live_exchanges: number;
  allow_ai_trading: number;
  allow_codexbot: number;
  allow_copy_trade: number;
  allow_live_trading: number;
  features_json: string;
  is_popular: number;
  is_active: number;
  sort_order: number;
}

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

const FALLBACK_PUBLIC_PLANS: SubscriptionPlanRow[] = [
  {
    code: 'pro_monthly',
    name_fa: 'اشتراک حرفه‌ای ماهانه (Pro)',
    name_en: 'Pro Monthly',
    description_fa: 'دسترسی کامل به هوش مصنوعی دلارینو، استراتژی منتخب دلارینو و کپی ترید دلارینو',
    description_en: 'Full Dollarino AI, Dollarino Select (Dorna V1) & Dollarino Copy-Trade on Toobit & KCEX',
    price_usd: 20,
    price_toman: 1400000,
    duration_days: 30,
    max_live_exchanges: 2,
    allow_ai_trading: 1,
    allow_codexbot: 1,
    allow_copy_trade: 1,
    allow_live_trading: 1,
    features_json: JSON.stringify([
      'ترید خودکار با هوش مصنوعی دلارینو (بدون نیاز به API شخصی)',
      'استراتژی منتخب دلارینو با اسکن آزاد کل بازار (۳۰+ ارز)',
      'کپی ترید دلارینو خودکار از کانال تلگرام و وب‌هوک',
      'اتصال همزمان صرافی‌های Toobit و KCEX + حساب دمو',
    ]),
    is_popular: 1,
    is_active: 1,
    sort_order: 2,
  },
  {
    code: 'vip_quarterly',
    name_fa: 'اشتراک ویژه ۳ ماهه (VIP)',
    name_en: 'VIP Quarterly (3 Months)',
    description_fa: '۹۰ روز دسترسی کامل به تمام امکانات + اسکن سریع کل بازار و پشتیبانی اختصاصی',
    description_en: '90 days full VIP access with multi-coin priority scanning & dedicated support',
    price_usd: 50,
    price_toman: 3450000,
    duration_days: 90,
    max_live_exchanges: 5,
    allow_ai_trading: 1,
    allow_codexbot: 1,
    allow_copy_trade: 1,
    allow_live_trading: 1,
    features_json: JSON.stringify([
      '۹۰ روز دسترسی کامل به هوش مصنوعی، استراتژی منتخب و کپی ترید دلارینو',
      'اولویت پردازش چندارزی و تا ۲۰ پوزیشن همزمان',
      'راه‌اندازی اختصاصی رله Toobit و ربات تلگرام',
      'پشتیبانی مستقیم مدیریت و بروزرسانی‌های جدید',
    ]),
    is_popular: 0,
    is_active: 1,
    sort_order: 3,
  },
  {
    code: 'pro_semiannual',
    name_fa: 'اشتراک ۶ ماهه (نصف‌سال)',
    name_en: 'Semiannual (6 Months)',
    description_fa: '۱۸۰ روز دسترسی کامل به اتوترید، کپی‌ترید، هوش مصنوعی و صرافی‌ها با ۲۵٪ تخفیف',
    description_en: '180 days full AI, Strategy & Toobit/KCEX access (25% savings)',
    price_usd: 90,
    price_toman: 6200000,
    duration_days: 180,
    max_live_exchanges: 5,
    allow_ai_trading: 1,
    allow_codexbot: 1,
    allow_copy_trade: 1,
    allow_live_trading: 1,
    features_json: JSON.stringify([
      '۱۸۰ روز دسترسی نامحدود به تمام امکانات حرفه‌ای',
      'اتوترید و کپی‌ترید خودکار تلگرام بدون محدودیت',
      'تحلیل چارت با هوش مصنوعی مرکزی دلارینو',
      'صرفه‌جویی ۳۰ دلار نسبت به خرید ماهانه',
    ]),
    is_popular: 0,
    is_active: 1,
    sort_order: 4,
  },
  {
    code: 'pro_annual',
    name_fa: 'اشتراک سالانه (۱۲ ماهه)',
    name_en: 'Annual (12 Months)',
    description_fa: '۳۶۵ روز دسترسی کامل طلایی با ۳۳٪ تخفیف ویژه معامله‌گران مداوم',
    description_en: '365 days full access with maximum 33% annual savings',
    price_usd: 160,
    price_toman: 11000000,
    duration_days: 365,
    max_live_exchanges: 10,
    allow_ai_trading: 1,
    allow_codexbot: 1,
    allow_copy_trade: 1,
    allow_live_trading: 1,
    features_json: JSON.stringify([
      '۳۶۵ روز دسترسی کامل به تمام موتورها و صرافی‌ها',
      'اولویت پردازش سیگنال و رله اختصاصی',
      'پشتیبانی مستقیم تیم فنی دلارینو',
      'بیشترین تخفیف سالانه (۸۰ دلار صرفه‌جویی)',
    ]),
    is_popular: 0,
    is_active: 1,
    sort_order: 5,
  },
];

export async function getPublicPlans(db: D1Database): Promise<SubscriptionPlanRow[]> {
  try {
    const rows = await db
      .prepare(`SELECT * FROM subscription_plans WHERE is_active = 1 AND price_usd > 0 ORDER BY sort_order ASC`)
      .all<SubscriptionPlanRow>();
    return rows.results.length > 0 ? rows.results : FALLBACK_PUBLIC_PLANS;
  } catch {
    return FALLBACK_PUBLIC_PLANS;
  }
}

export async function requirePaidEntitlement(
  db: D1Database,
  user: AuthUser
): Promise<{ ok: true; entitlement: UserEntitlement } | { ok: false; entitlement: UserEntitlement; error: string }> {
  const entitlement = await resolveUserEntitlement(db, user);
  if (entitlement.hasPaidPlan || !entitlement.subscriptionRequired) {
    return { ok: true, entitlement };
  }
  return {
    ok: false,
    entitlement,
    error: 'برای دسترسی به این قابلیت، ابتدا اشتراک دلارینو را خریداری و فعال کنید.',
  };
}

export async function resolveUserEntitlement(db: D1Database, user: AuthUser): Promise<UserEntitlement> {
  const reqSetting = await db.prepare(
    `SELECT value FROM system_settings WHERE key = 'subscription_required'`
  ).first<{ value: string }>().catch(() => null);
  const subscriptionRequired = (reqSetting?.value ?? 'true') !== 'false';

  if (user.role === 'owner' || user.role === 'admin') {
    return {
      hasPaidPlan: true,
      planCode: 'vip_owner',
      planNameFa: 'دسترسی کامل مدیریت (VIP)',
      planNameEn: 'Admin / Owner Full VIP',
      status: 'ACTIVE',
      allowPaperDemo: true,
      allowAiTrading: true,
      allowCodexbot: true,
      allowCopyTrade: true,
      allowLiveTrading: true,
      daysRemaining: 9999,
      expiresAt: null,
      subscriptionRequired,
    };
  }

  const activeSub = await db.prepare(
    `SELECT us.plan_code, us.expires_at, sp.name_fa, sp.name_en,
            sp.allow_ai_trading, sp.allow_codexbot, sp.allow_copy_trade, sp.allow_live_trading
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.code = us.plan_code
     WHERE us.user_id = ? AND us.status = 'ACTIVE'
       AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
     ORDER BY us.expires_at DESC LIMIT 1`
  ).bind(user.id).first<{
    plan_code: string;
    expires_at: string | null;
    name_fa: string;
    name_en: string;
    allow_ai_trading: number;
    allow_codexbot: number;
    allow_copy_trade: number;
    allow_live_trading: number;
  }>().catch(() => null);

  if (activeSub && activeSub.plan_code !== 'free_demo') {
    const expMs = activeSub.expires_at
      ? Date.parse(activeSub.expires_at.includes('T') ? activeSub.expires_at : `${activeSub.expires_at.replace(' ', 'T')}Z`)
      : Date.now() + 30 * 86_400_000;
    const daysRemaining = Math.max(1, Math.ceil((expMs - Date.now()) / 86_400_000));
    return {
      hasPaidPlan: true,
      planCode: activeSub.plan_code,
      planNameFa: activeSub.name_fa,
      planNameEn: activeSub.name_en,
      status: 'ACTIVE',
      allowPaperDemo: true,
      allowAiTrading: Boolean(activeSub.allow_ai_trading),
      allowCodexbot: Boolean(activeSub.allow_codexbot),
      allowCopyTrade: Boolean(activeSub.allow_copy_trade),
      allowLiveTrading: Boolean(activeSub.allow_live_trading),
      daysRemaining,
      expiresAt: activeSub.expires_at,
      subscriptionRequired,
    };
  }

  if (!subscriptionRequired) {
    return {
      hasPaidPlan: true,
      planCode: 'open_access',
      planNameFa: 'دسترسی آزاد پلتفرم',
      planNameEn: 'Open Platform Access',
      status: 'ACTIVE',
      allowPaperDemo: true,
      allowAiTrading: true,
      allowCodexbot: true,
      allowCopyTrade: true,
      allowLiveTrading: true,
      daysRemaining: 365,
      expiresAt: null,
      subscriptionRequired: false,
    };
  }

  return {
    hasPaidPlan: false,
    planCode: 'none',
    planNameFa: 'بدون اشتراک فعال',
    planNameEn: 'No Active Subscription',
    status: 'UNSUBSCRIBED',
    allowPaperDemo: false,
    allowAiTrading: false,
    allowCodexbot: false,
    allowCopyTrade: false,
    allowLiveTrading: false,
    daysRemaining: 0,
    expiresAt: null,
    subscriptionRequired: true,
  };
}

export async function rewardReferrerIfEligible(
  env: Env,
  referredUserId: string,
  subscriptionId?: string,
  paidAmountUsd = 0
): Promise<void> {
  if (!Number.isFinite(paidAmountUsd) || paidAmountUsd <= 0) {
    // Do not grant referral bonuses or USD commissions on $0 gift codes / admin grants
    return;
  }

  const ref = await env.DB.prepare(
    `SELECT id, referrer_user_id, reward_days, status, COALESCE(fraud_flag, 0) as fraud_flag
     FROM referrals WHERE referred_user_id = ? LIMIT 1`
  )
    .bind(referredUserId)
    .first<{ id: string; referrer_user_id: string; reward_days: number; status: string; fraud_flag: number }>()
    .catch(() => null);

  if (!ref || ref.referrer_user_id === referredUserId) return;
  if (ref.fraud_flag === 1 || ref.status === 'FLAGGED_DUPLICATE') {
    await logAudit(
      env.DB,
      ref.referrer_user_id,
      'SYSTEM',
      'WARN',
      `Referral reward blocked due to anti-abuse flag on user ${referredUserId}`
    ).catch(() => {});
    return;
  }

  // Cross-check phone number / Trust Wallet overlap between referrer & referred to prevent self-farming
  const [referrerUser, referredUser] = await Promise.all([
    env.DB.prepare(
      `SELECT id, phone_number, trust_wallet_address, signup_ip_hash, telegram_id FROM users WHERE id = ?`
    )
      .bind(ref.referrer_user_id)
      .first<{
        id: string;
        phone_number: string | null;
        trust_wallet_address: string | null;
        signup_ip_hash: string | null;
        telegram_id: string | null;
      }>()
      .catch(() => null),
    env.DB.prepare(
      `SELECT id, phone_number, trust_wallet_address, signup_ip_hash, telegram_id FROM users WHERE id = ?`
    )
      .bind(referredUserId)
      .first<{
        id: string;
        phone_number: string | null;
        trust_wallet_address: string | null;
        signup_ip_hash: string | null;
        telegram_id: string | null;
      }>()
      .catch(() => null),
  ]);

  if (!referrerUser || !referredUser) return;

  let abuseReason = '';
  if (
    referredUser.phone_number &&
    referrerUser.phone_number &&
    referredUser.phone_number === referrerUser.phone_number
  ) {
    abuseReason = 'شماره تماس یکسان با معرف';
  } else if (
    referredUser.trust_wallet_address &&
    referrerUser.trust_wallet_address &&
    referredUser.trust_wallet_address.toLowerCase() === referrerUser.trust_wallet_address.toLowerCase()
  ) {
    abuseReason = 'کیف‌پول Trust Wallet یکسان با معرف';
  } else if (referredUser.phone_number) {
    const dupPhone = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM referrals r
       JOIN users u ON u.id = r.referred_user_id
       WHERE r.status = 'REWARDED' AND r.referred_user_id != ? AND u.phone_number = ?`
    )
      .bind(referredUserId, referredUser.phone_number)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 }));
    if ((dupPhone?.cnt ?? 0) > 0) abuseReason = 'استفاده مجدد از شماره تماس قبلی برای پاداش رفرال';
  }

  if (abuseReason) {
    await env.DB.prepare(
      `UPDATE referrals SET fraud_flag = 1, status = 'FLAGGED_DUPLICATE', fraud_reason = ? WHERE id = ?`
    )
      .bind(abuseReason, ref.id)
      .run()
      .catch(() => {});
    await logAudit(env.DB, ref.referrer_user_id, 'SYSTEM', 'WARN', `Referral flagged (${abuseReason})`).catch(() => {});
    return;
  }

  // Compute tier commission rate based on qualified referrals count
  const qualifiedCntRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM referrals WHERE referrer_user_id = ? AND status = 'REWARDED'`
  )
    .bind(ref.referrer_user_id)
    .first<{ cnt: number }>()
    .catch(() => ({ cnt: 0 }));
  const qualifiedCount = Number(qualifiedCntRow?.cnt ?? 0);

  const isFirstPurchase = ref.status !== 'REWARDED';
  let tier = 'BRONZE';
  let firstPct = 0.15;
  if (qualifiedCount >= 15) {
    tier = 'GOLD';
    firstPct = 0.22;
  } else if (qualifiedCount >= 5) {
    tier = 'SILVER';
    firstPct = 0.18;
  }

  const rate = isFirstPurchase ? firstPct : 0.1; // 15%-22% first order, 10% recurring renewals
  const commissionUsd = Math.round(paidAmountUsd * rate * 100) / 100;
  const days = isFirstPurchase ? Math.max(1, ref.reward_days || 7) : 0;

  await env.DB.prepare(
    `UPDATE referrals
     SET status = 'REWARDED',
         commission_usd = COALESCE(commission_usd, 0) + ?,
         subscription_id = COALESCE(subscription_id, ?),
         unlocked_at = COALESCE(unlocked_at, datetime('now'))
     WHERE id = ?`
  )
    .bind(commissionUsd, subscriptionId ?? null, ref.id)
    .run();

  await env.DB.prepare(
    `UPDATE users
     SET referral_balance_usd = COALESCE(referral_balance_usd, 0) + ?,
         referral_total_earned_usd = COALESCE(referral_total_earned_usd, 0) + ?,
         referral_tier = ?
     WHERE id = ?`
  )
    .bind(commissionUsd, commissionUsd, tier, ref.referrer_user_id)
    .run();

  if (days > 0) {
    await env.DB.prepare(
      `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, admin_note)
       VALUES (?, ?, 'pro_monthly', 'ACTIVE', 'ADMIN_GRANT', ?, 0, datetime('now'), datetime('now', '+' || ? || ' days'), 'پاداش دعوت دوست (رفرال)')`
    )
      .bind(randomId('sub'), ref.referrer_user_id, `REFERRAL:${referredUserId}`, days)
      .run();
  }

  await logAudit(
    env.DB,
    ref.referrer_user_id,
    'SYSTEM',
    'INFO',
    `Referral bonus credited: +$${commissionUsd.toFixed(2)} USD${days > 0 ? ` & +${days} Pro days` : ''} (${tier})`
  );

  const referrerTg = await env.DB.prepare(`SELECT telegram_id FROM users WHERE id = ?`)
    .bind(ref.referrer_user_id)
    .first<{ telegram_id: string | null }>()
    .catch(() => null);
  if (referrerTg?.telegram_id && env.TELEGRAM_BOT_TOKEN) {
    const tg = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
    await tg
      .sendMessage(
        referrerTg.telegram_id,
        `کمیسیون جدید رفرال در دلارینو!\n` +
          `• پاداش نقدی واریزشده: +$${commissionUsd.toFixed(2)} USDT\n` +
          (days > 0 ? `• هدیه اشتراک: +${days} روز اشتراک Pro\n` : '') +
          `• سطح همکاری شما: ${tier}\n` +
          `می‌توانید از بخش اشتراک/رفرال در سایت مبلغ را به USDT برداشت یا تبدیل به اشتراک کنید.`
      )
      .catch(() => {});
  }
}

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BEP20_CONTRACT = '0x55d398326f99059ff775485246999027b3197955';
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function verifyBscUsdtBep20(
  txHash: string,
  expectedWallet: string,
  minAmountUsd: number
): Promise<{ verified: boolean; amountUsd?: number; note: string }> {
  const cleanHash = txHash.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash) || !/^0x[a-fA-F0-9]{40}$/.test(expectedWallet.trim())) {
    return { verified: false, note: 'Pending manual review (non-EVM hash or Trust Wallet receiver not set)' };
  }
  try {
    const res = await fetch('https://bsc-dataseed.binance.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [cleanHash] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { verified: false, note: `BSC RPC HTTP ${res.status}` };
    const rpc = (await res.json()) as {
      result?: {
        status?: string;
        logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
      } | null;
    };
    const receipt = rpc.result;
    if (!receipt || receipt.status !== '0x1') {
      return { verified: false, note: 'BSC transaction not yet confirmed' };
    }
    const targetTopic = '0x' + expectedWallet.trim().toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
    const match = logs.find((l) => {
      const sameContract = (l.address || '').toLowerCase() === USDT_BEP20_CONTRACT;
      const isTransfer = (l.topics?.[0] || '').toLowerCase() === TRANSFER_EVENT_TOPIC;
      const sameTo = (l.topics?.[2] || '').toLowerCase() === targetTopic;
      if (!sameContract || !isTransfer || !sameTo || !l.data) return false;
      const amt = Number(BigInt(l.data)) / 1e18;
      return amt >= Math.max(0.5, minAmountUsd - 0.5);
    });
    if (!match || !match.data) {
      return { verified: false, note: 'BSC BEP20 USDT transfer to platform Trust Wallet did not match' };
    }
    const amt = Number(BigInt(match.data)) / 1e18;
    return { verified: true, amountUsd: amt, note: `Auto-verified $${amt.toFixed(2)} USDT BEP20 via Trust Wallet / BSC` };
  } catch (err) {
    return { verified: false, note: err instanceof Error ? err.message : 'BSC verification unavailable' };
  }
}

async function verifyTronscanUsdtTrc20(
  txid: string,
  expectedWallet: string,
  minAmountUsd: number
): Promise<{ verified: boolean; amountUsd?: number; note: string }> {
  const cleanHash = txid.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(cleanHash) || !expectedWallet || expectedWallet.startsWith('T-PLACEHOLDER')) {
    return { verified: false, note: 'Pending manual review (non-64-hex hash or wallet not finalized)' };
  }
  try {
    const res = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(cleanHash)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { verified: false, note: `Tronscan HTTP ${res.status}` };
    const data = await res.json() as {
      confirmed?: boolean;
      contractRet?: string;
      trc20TransferInfo?: Array<{
        contract_address?: string;
        to_address?: string;
        amount_str?: string;
        decimals?: number;
      }>;
    };
    if (!data.confirmed || data.contractRet !== 'SUCCESS') {
      return { verified: false, note: 'Transaction not yet confirmed on TRON' };
    }
    const transfers = Array.isArray(data.trc20TransferInfo) ? data.trc20TransferInfo : [];
    const match = transfers.find((t) => {
      const sameContract = (t.contract_address || '').toLowerCase() === USDT_TRC20_CONTRACT.toLowerCase();
      const sameWallet = (t.to_address || '').toLowerCase() === expectedWallet.toLowerCase();
      const dec = Number(t.decimals ?? 6);
      const amt = Number(t.amount_str || 0) / Math.pow(10, dec);
      return sameContract && sameWallet && amt >= Math.max(0.5, minAmountUsd - 0.5);
    });
    if (!match) {
      return { verified: false, note: 'Wallet or USDT amount did not match automatically' };
    }
    const amt = Number(match.amount_str || 0) / Math.pow(10, Number(match.decimals ?? 6));
    return { verified: true, amountUsd: amt, note: `Auto-verified $${amt.toFixed(2)} USDT TRC20 via Tronscan` };
  } catch (err) {
    return { verified: false, note: err instanceof Error ? err.message : 'Tronscan verification unavailable' };
  }
}

export const subscriptionRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
subscriptionRoutes.use('*', requireAuth);

subscriptionRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const [entitlement, plans, orders, settings] = await Promise.all([
    resolveUserEntitlement(c.env.DB, user),
    getPublicPlans(c.env.DB),
    c.env.DB.prepare(
      `SELECT us.*, sp.name_fa, sp.name_en
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
       WHERE us.user_id = ?
       ORDER BY us.created_at DESC LIMIT 20`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT key, value FROM system_settings
       WHERE key IN (
         'subscription_required', 'usdt_trc20_wallet', 'trust_wallet_evm_receiver',
         'trust_wallet_sol_receiver', 'trust_wallet_ton_receiver',
         'iran_card_number', 'iran_card_holder', 'telegram_support', 'anti_scam_notice_fa'
       )`
    ).all<{ key: string; value: string }>().catch(() => ({ results: [] })),
  ]);

  const paymentConfig: Record<string, string> = {};
  for (const s of settings.results) paymentConfig[s.key] = s.value;
  if (!paymentConfig.telegram_support || /Dollarino_admin/i.test(paymentConfig.telegram_support)) {
    paymentConfig.telegram_support = OFFICIAL_BOT_HANDLE;
  }
  if (!paymentConfig.anti_scam_notice_fa) {
    paymentConfig.anti_scam_notice_fa = ANTI_SCAM_WARNING_FA;
  }

  return c.json({
    entitlement,
    plans,
    orders: orders.results,
    paymentConfig,
  });
});

subscriptionRoutes.post('/checkout', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `chk:${user.id}`, 10, 300);
  if (!rl.allowed) {
    return c.json({ error: `تعداد ثبت سفارش زیاد است. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const body = await c.req.json<{
    planCode?: string;
    paymentMethod?: 'USDT_TRC20' | 'TRUST_WALLET_BEP20' | 'TRUST_WALLET_TRC20' | 'CARD_TO_CARD';
    paymentReference?: string;
    receiptImageDataUrl?: string | null;
    payerNote?: string;
  }>().catch(() => ({} as Record<string, string | null | undefined>));

  const planCode = (body.planCode || '').trim();
  const plan = await c.env.DB.prepare(
    `SELECT * FROM subscription_plans WHERE code = ? AND is_active = 1`
  ).bind(planCode).first<SubscriptionPlanRow>().catch(() => null);

  if (!plan || plan.price_usd <= 0) {
    return c.json({ error: 'Selected subscription plan is invalid' }, 400);
  }

  const rawReceipt = body.receiptImageDataUrl ? String(body.receiptImageDataUrl).trim() : '';
  if (rawReceipt && (!rawReceipt.startsWith('data:image/') || rawReceipt.length > 4_500_000)) {
    return c.json({ error: 'فرمت تصویر رسید نامعتبر است یا حجم آن بیش از حد مجاز (۴ مگابایت) است.' }, 400);
  }
  const receiptImage = rawReceipt || null;

  const userRef = (body.paymentReference || '').trim();
  if (!receiptImage && userRef.length < 5) {
    return c.json({ error: 'لطفاً تصویر رسید واریز را آپلود کنید یا کد پیگیری / TXID معتبر وارد نمایید.' }, 400);
  }

  // Prevent reusing the exact same user-entered payment reference / TXID
  if (userRef.length >= 5) {
    const duplicateRef = await c.env.DB.prepare(
      `SELECT id FROM user_subscriptions WHERE payment_reference = ? AND status IN ('ACTIVE', 'PENDING_REVIEW') LIMIT 1`
    ).bind(userRef.slice(0, 140)).first<{ id: string }>().catch(() => null);
    if (duplicateRef) {
      return c.json({ error: 'این کد پیگیری یا TXID قبلاً ثبت شده است.' }, 409);
    }
  }

  const method =
    body.paymentMethod === 'CARD_TO_CARD'
      ? 'CARD_TO_CARD'
      : body.paymentMethod === 'TRUST_WALLET_BEP20'
        ? 'TRUST_WALLET_BEP20'
        : body.paymentMethod === 'TRUST_WALLET_TRC20'
          ? 'TRUST_WALLET_TRC20'
          : 'USDT_TRC20';
  const id = randomId('sub');
  const ref = userRef.length >= 4 ? userRef : `RECEIPT-${id.slice(-6).toUpperCase()}`;

  // Auto-verify USDT TRC20 (Tronscan) or Trust Wallet BEP20 (BSC RPC) TXID when applicable
  let autoActivated = false;
  let autoNote = '';
  if (userRef.length >= 16) {
    if (method === 'USDT_TRC20' || method === 'TRUST_WALLET_TRC20') {
      const walletSetting = await c.env.DB.prepare(
        `SELECT value FROM system_settings WHERE key = 'usdt_trc20_wallet'`
      ).first<{ value: string }>().catch(() => null);
      const check = await verifyTronscanUsdtTrc20(ref, walletSetting?.value || '', plan.price_usd);
      if (check.verified) {
        autoActivated = true;
        autoNote = check.note;
      }
    } else if (method === 'TRUST_WALLET_BEP20') {
      const evmReceiver = await c.env.DB.prepare(
        `SELECT value FROM system_settings WHERE key = 'trust_wallet_evm_receiver'`
      ).first<{ value: string }>().catch(() => null);
      const check = await verifyBscUsdtBep20(ref, evmReceiver?.value || '', plan.price_usd);
      if (check.verified) {
        autoActivated = true;
        autoNote = check.note;
      }
    }
  }

  if (autoActivated) {
    const days = Math.max(1, plan.duration_days || 30);
    await c.env.DB.prepare(
      `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, receipt_image_url, amount_usd, payer_note, started_at, expires_at, reviewed_at, admin_note)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+' || ? || ' days'), datetime('now'), ?)`
    ).bind(
      id,
      user.id,
      plan.code,
      method,
      ref.slice(0, 140),
      receiptImage,
      plan.price_usd,
      (body.payerNote || '').trim().slice(0, 240),
      days,
      autoNote
    ).run();

    await rewardReferrerIfEligible(c.env, user.id, id, plan.price_usd).catch(() => {});
    await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Subscription ${id} AUTO-ACTIVATED via Tronscan (${plan.name_en})`);
    await notifyAllAdmins(
      c.env,
      `✅ اشتراک کاربر ${user.username} (${user.email}) برای پلن ${plan.name_fa} به صورت خودکار از طریق شبکه بلاک‌چین تایید و فعال شد!\nTXID: ${ref}`
    ).catch(() => {});

    return c.json({ ok: true, orderId: id, status: 'ACTIVE', autoVerified: true }, 201);
  }

  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, receipt_image_url, amount_usd, payer_note)
     VALUES (?, ?, ?, 'PENDING_REVIEW', ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    plan.code,
    method,
    ref.slice(0, 140),
    receiptImage,
    plan.price_usd,
    (body.payerNote || '').trim().slice(0, 240)
  ).run();

  await logAudit(
    c.env.DB,
    user.id,
    'SYSTEM',
    'INFO',
    `Subscription order ${id} submitted for ${plan.name_en} (${method}: ${ref.slice(0, 32)})`
  );

  const note = [
    `💳 درخواست اشتراک جدید در دلارینو`,
    `👤 کاربر: ${user.email} (${user.username})`,
    `📦 پلن: ${plan.name_fa} ($${plan.price_usd} / ${Number(plan.price_toman || 0).toLocaleString()} تومان)`,
    `💳 روش: ${method}`,
    userRef ? `🔗 کد پیگیری / TXID: ${userRef}` : `📸 ثبت‌شده با عکس رسید واریز`,
    body.payerNote?.trim() ? `📝 توضیح: ${body.payerNote.trim().slice(0, 120)}` : '',
    `🧾 سفارش: #${id}`,
  ]
    .filter(Boolean)
    .join('\n');

  const reviewKeyboard = {
    inlineKeyboard: [
      [
        { text: '✅ تایید فوری اشتراک', callback_data: `adm:tx_approve:${id}`, style: 'success' as const },
        { text: '❌ رد درخواست', callback_data: `adm:tx_reject:${id}`, style: 'danger' as const },
      ],
    ],
  };

  if (receiptImage) {
    await notifyAllAdminsPhoto(c.env, receiptImage, note, reviewKeyboard).catch(() => {});
  } else {
    await notifyAllAdmins(c.env, note, reviewKeyboard).catch(() => {});
  }

  return c.json({ ok: true, orderId: id, status: 'PENDING_REVIEW', autoVerified: false }, 201);
});

// Admin subscription management routes
function isAdmin(c: { get: (k: 'user') => AuthUser; env: Env }): boolean {
  const u = c.get('user');
  const ownerTg = c.env.OWNER_TELEGRAM_ID || '944021185';
  return u.role === 'owner' || u.role === 'admin' || Boolean(u.telegramId && u.telegramId === ownerTg);
}

subscriptionRoutes.get('/admin/orders', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT us.*, u.email, u.username, sp.name_fa, sp.name_en, sp.duration_days
     FROM user_subscriptions us
     JOIN users u ON u.id = us.user_id
     LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
     ORDER BY CASE WHEN us.status = 'PENDING_REVIEW' THEN 0 ELSE 1 END, us.created_at DESC
     LIMIT 100`
  ).all().catch(() => ({ results: [] }));
  return c.json({ orders: rows.results });
});

subscriptionRoutes.post('/admin/orders/:id/review', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ decision: 'APPROVE' | 'REJECT'; adminNote?: string }>();

  const order = await c.env.DB.prepare(
    `SELECT us.*, sp.duration_days
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
     WHERE us.id = ?`
  ).bind(id).first<{ id: string; user_id: string; plan_code: string; amount_usd: number; duration_days: number | null }>();
  if (!order) return c.json({ error: 'Order not found' }, 404);

  if (body.decision === 'APPROVE') {
    const days = Math.max(1, order.duration_days ?? 30);
    await c.env.DB.prepare(
      `UPDATE user_subscriptions
       SET status = 'ACTIVE',
           started_at = datetime('now'),
           expires_at = datetime('now', '+' || ? || ' days'),
           reviewed_by = ?,
           reviewed_at = datetime('now'),
           admin_note = ?
       WHERE id = ?`
    ).bind(days, actor.id, body.adminNote || 'Approved', id).run();
    await rewardReferrerIfEligible(c.env, order.user_id, order.id, Number(order.amount_usd || 0)).catch(() => {});
    await logAudit(c.env.DB, order.user_id, 'SYSTEM', 'INFO', `Subscription ${order.plan_code} approved for ${days} days`);
  } else {
    await c.env.DB.prepare(
      `UPDATE user_subscriptions
       SET status = 'REJECTED', reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ?
       WHERE id = ?`
    ).bind(actor.id, body.adminNote || 'Rejected', id).run();
  }

  return c.json({ ok: true });
});

subscriptionRoutes.post('/admin/grant', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const body = await c.req.json<{ emailOrUserId: string; planCode?: string; days?: number; note?: string }>();
  const target = (body.emailOrUserId || '').trim();
  const userRow = await c.env.DB.prepare(
    `SELECT id, email FROM users WHERE lower(email) = lower(?) OR id = ? LIMIT 1`
  ).bind(target, target).first<{ id: string; email: string }>();
  if (!userRow) return c.json({ error: 'User not found' }, 404);

  const planCode = body.planCode || 'pro_monthly';
  const days = Math.max(1, Math.min(3650, Number(body.days ?? 30)));
  const id = randomId('sub');

  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, reviewed_by, reviewed_at, admin_note)
     VALUES (?, ?, ?, 'ACTIVE', 'ADMIN_GRANT', 'OWNER_DIRECT_GRANT', 0, datetime('now'), datetime('now', '+' || ? || ' days'), ?, datetime('now'), ?)`
  ).bind(id, userRow.id, planCode, days, actor.id, body.note || `Granted ${days}d by owner`).run();

  return c.json({ ok: true, id, userId: userRow.id, email: userRow.email, days });
});

subscriptionRoutes.patch('/admin/config', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const body = await c.req.json<{
    subscriptionRequired?: boolean;
    usdtTrc20Wallet?: string;
    iranCardNumber?: string;
    iranCardHolder?: string;
    telegramSupport?: string;
    proPriceUsd?: number;
    proPriceToman?: number;
    vipPriceUsd?: number;
    vipPriceToman?: number;
  }>();

  const cleanSupport = body.telegramSupport?.trim();
  const safeSupport = cleanSupport && /Dollarino_admin/i.test(cleanSupport) ? OFFICIAL_BOT_HANDLE : cleanSupport;

  const kvPairs: Array<[string, string | undefined]> = [
    ['subscription_required', body.subscriptionRequired !== undefined ? String(body.subscriptionRequired) : undefined],
    ['usdt_trc20_wallet', body.usdtTrc20Wallet?.trim()],
    ['iran_card_number', body.iranCardNumber?.trim()],
    ['iran_card_holder', body.iranCardHolder?.trim()],
    ['telegram_support', safeSupport],
  ];

  for (const [k, v] of kvPairs) {
    if (v !== undefined && v !== '') {
      await c.env.DB.prepare(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      ).bind(k, v).run();
    }
  }

  if (typeof body.proPriceUsd === 'number' || typeof body.proPriceToman === 'number') {
    await c.env.DB.prepare(
      `UPDATE subscription_plans SET price_usd = COALESCE(?, price_usd), price_toman = COALESCE(?, price_toman), updated_at = datetime('now') WHERE code = 'pro_monthly'`
    ).bind(body.proPriceUsd ?? null, body.proPriceToman ?? null).run();
  }
  if (typeof body.vipPriceUsd === 'number' || typeof body.vipPriceToman === 'number') {
    await c.env.DB.prepare(
      `UPDATE subscription_plans SET price_usd = COALESCE(?, price_usd), price_toman = COALESCE(?, price_toman), updated_at = datetime('now') WHERE code = 'vip_quarterly'`
    ).bind(body.vipPriceUsd ?? null, body.vipPriceToman ?? null).run();
  }

  return c.json({ ok: true });
});

subscriptionRoutes.get('/referrals', async (c) => {
  const user = c.get('user');
  const code = `DLR-${user.id.slice(-6).toUpperCase()}`;
  const [userBal, refs, withdrawals] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COALESCE(referral_balance_usd, 0) as bal, COALESCE(referral_total_earned_usd, 0) as total, COALESCE(referral_tier, 'BRONZE') as tier
       FROM users WHERE id = ?`
    )
      .bind(user.id)
      .first<{ bal: number; total: number; tier: string }>()
      .catch(() => ({ bal: 0, total: 0, tier: 'BRONZE' })),
    c.env.DB.prepare(
      `SELECT r.id, r.reward_days, r.status, COALESCE(r.commission_usd, 0) as commission_usd,
              COALESCE(r.fraud_flag, 0) as fraud_flag, r.fraud_reason, r.created_at, r.unlocked_at,
              u.username, COALESCE(u.phone_verified, 0) as phone_verified
       FROM referrals r JOIN users u ON u.id = r.referred_user_id
       WHERE r.referrer_user_id = ? ORDER BY r.created_at DESC LIMIT 80`
    )
      .bind(user.id)
      .all<{
        id: string;
        reward_days: number;
        status: string;
        commission_usd: number;
        fraud_flag: number;
        fraud_reason: string | null;
        created_at: string;
        unlocked_at: string | null;
        username: string;
        phone_verified: number;
      }>()
      .catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT id, amount_usd, target_type, wallet_address, network, status, tx_hash, admin_note, created_at, processed_at
       FROM referral_withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
      .bind(user.id)
      .all()
      .catch(() => ({ results: [] })),
  ]);

  const totalReferred = refs.results.length;
  const qualifiedReferred = refs.results.filter((r) => r.status === 'REWARDED').length;
  const flaggedCount = refs.results.filter((r) => r.fraud_flag === 1 || r.status === 'FLAGGED_DUPLICATE').length;
  const rewardDaysEarned = refs.results
    .filter((r) => r.status === 'REWARDED')
    .reduce((acc, r) => acc + Number(r.reward_days || 0), 0);

  let tier = 'BRONZE';
  let commissionPct = 15;
  if (qualifiedReferred >= 15) {
    tier = 'GOLD';
    commissionPct = 22;
  } else if (qualifiedReferred >= 5) {
    tier = 'SILVER';
    commissionPct = 18;
  }

  const webUrl = (c.env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/+$/, '');
  const sanitizedRefs = refs.results.map((r) => ({
    id: r.id,
    username: maskUsernameForReferral(r.username),
    reward_days: r.reward_days,
    commission_usd: Number(r.commission_usd || 0),
    status: r.status,
    fraud_flag: r.fraud_flag,
    phone_verified: r.phone_verified === 1,
    created_at: r.created_at,
    unlocked_at: r.unlocked_at,
  }));

  return c.json({
    referralCode: code,
    inviteUrl: `${webUrl}/?ref=${encodeURIComponent(code)}`,
    telegramInviteUrl: `https://t.me/Dollarino_bot?start=REF_${encodeURIComponent(code)}`,
    tier,
    commissionPct,
    renewalPct: 10,
    balanceUsd: Number(userBal?.bal ?? 0),
    totalEarnedUsd: Number(userBal?.total ?? 0),
    totalReferred,
    qualifiedReferred,
    flaggedCount,
    rewardDaysEarned,
    referrals: sanitizedRefs,
    withdrawals: withdrawals.results,
  });
});

subscriptionRoutes.post('/referrals/redeem-balance', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `refred:${user.id}`, 8, 300);
  if (!rl.allowed) return c.json({ error: 'درخواست زیاد است. کمی بعد تلاش کنید.' }, 429);

  const body = (await c.req.json().catch(() => ({}))) as { amountUsd?: number };
  const amt = Math.round(Number(body.amountUsd || 0) * 100) / 100;
  if (!Number.isFinite(amt) || amt < 5) {
    return c.json({ error: 'حداقل مبلغ برای تبدیل به اشتراک ۵ دلار است.' }, 400);
  }

  // Atomic balance deduction to eliminate double-spend races
  const res = await c.env.DB.prepare(
    `UPDATE users SET referral_balance_usd = ROUND(referral_balance_usd - ?, 2)
     WHERE id = ? AND COALESCE(referral_balance_usd, 0) >= ?`
  )
    .bind(amt, user.id, amt)
    .run();

  if (!res.meta?.changes || res.meta.changes < 1) {
    return c.json({ error: 'موجودی کمیسیون رفرال کافی نیست.' }, 400);
  }

  const days = Math.max(7, Math.min(365, Math.round(amt * 2))); // $1 = 2 days Pro
  const subId = randomId('sub');
  const wId = randomId('rw');
  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, admin_note)
     VALUES (?, ?, 'pro_monthly', 'ACTIVE', 'ADMIN_GRANT', ?, 0, datetime('now'), datetime('now', '+' || ? || ' days'), 'تبدیل کمیسیون رفرال به اشتراک')`
  )
    .bind(subId, user.id, `REF_REDEEM:${wId}`, days)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO referral_withdrawals (id, user_id, amount_usd, target_type, status, admin_note, processed_at)
     VALUES (?, ?, ?, 'SUBSCRIPTION_CREDIT', 'APPROVED', ?, datetime('now'))`
  )
    .bind(wId, user.id, amt, `Converted to ${days} Pro days (${subId})`)
    .run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Converted $${amt.toFixed(2)} referral balance to +${days} Pro days`);
  return c.json({ ok: true, convertedUsd: amt, daysGranted: days });
});

subscriptionRoutes.post('/referrals/withdraw', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `refwd:${user.id}`, 5, 600);
  if (!rl.allowed) return c.json({ error: 'درخواست برداشت بیش از حد مجاز. چند دقیقه دیگر تلاش کنید.' }, 429);

  const body = (await c.req.json().catch(() => ({}))) as {
    amountUsd?: number;
    walletAddress?: string;
    network?: 'BEP20' | 'TRC20';
  };
  const amt = Math.round(Number(body.amountUsd || 0) * 100) / 100;
  const wallet = (body.walletAddress || '').trim();
  const network = body.network === 'TRC20' ? 'TRC20' : 'BEP20';

  if (!Number.isFinite(amt) || amt < 10) {
    return c.json({ error: 'حداقل مبلغ برداشت نقدی کمیسیون ۱۰ USDT است.' }, 400);
  }
  if (network === 'BEP20' && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return c.json({ error: 'آدرس کیف‌پول BEP20 (Trust Wallet) نامعتبر است.' }, 400);
  }
  if (network === 'TRC20' && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet)) {
    return c.json({ error: 'آدرس کیف‌پول TRC20 نامعتبر است.' }, 400);
  }

  // Require phone verification before cash payout for anti-abuse security
  const uRow = await c.env.DB.prepare(
    `SELECT COALESCE(phone_verified, 0) as pv FROM users WHERE id = ?`
  )
    .bind(user.id)
    .first<{ pv: number }>()
    .catch(() => null);
  if (!uRow?.pv) {
    return c.json(
      { error: 'برای برداشت نقدی USDT ابتدا باید شماره تماس تلگرام خود را از طریق ربات @Dollarino_bot احراز (KYC) کنید.' },
      403
    );
  }

  const ded = await c.env.DB.prepare(
    `UPDATE users SET referral_balance_usd = ROUND(referral_balance_usd - ?, 2)
     WHERE id = ? AND COALESCE(referral_balance_usd, 0) >= ?`
  )
    .bind(amt, user.id, amt)
    .run();

  if (!ded.meta?.changes || ded.meta.changes < 1) {
    return c.json({ error: 'موجودی قابل برداشت کافی نیست.' }, 400);
  }

  const wid = randomId('rwd');
  await c.env.DB.prepare(
    `INSERT INTO referral_withdrawals (id, user_id, amount_usd, target_type, wallet_address, network, status)
     VALUES (?, ?, ?, 'USDT_WALLET', ?, ?, 'PENDING')`
  )
    .bind(wid, user.id, amt, wallet, network)
    .run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Referral withdrawal requested: $${amt.toFixed(2)} ${network} -> ${wallet}`);
  await notifyAllAdmins(
    c.env,
    `💸 درخواست برداشت کمیسیون رفرال\nکاربر: ${user.username} (${user.email})\nمبلغ: $${amt.toFixed(2)} USDT\nشبکه: ${network}\nآدرس: ${wallet}\nشناسه: ${wid}`
  ).catch(() => {});

  return c.json({ ok: true, withdrawalId: wid, status: 'PENDING' }, 201);
});

subscriptionRoutes.post('/redeem-gift', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `gift:${user.id}`, 8, 300);
  if (!rl.allowed) return c.json({ error: 'تعداد تلاش برای کد هدیه زیاد است. چند دقیقه دیگر امتحان کنید.' }, 429);
  const body = await c.req.json<{ code?: string }>().catch(() => ({} as { code?: string }));
  const code = (body.code || '').trim().toUpperCase();
  if (!code) return c.json({ error: 'Gift code is required' }, 400);

  const gift = await c.env.DB.prepare(
    `SELECT * FROM gift_codes WHERE code = ? AND is_active = 1`
  ).bind(code).first<{
    code: string;
    plan_code: string;
    duration_days: number;
    max_uses: number;
    uses_count: number;
    expires_at: string | null;
  }>().catch(() => null);

  if (!gift) return c.json({ error: 'Gift code is invalid or inactive' }, 404);
  if (gift.uses_count >= gift.max_uses) return c.json({ error: 'Gift code usage limit reached' }, 400);
  if (gift.expires_at && Date.parse(gift.expires_at) < Date.now()) {
    return c.json({ error: 'Gift code has expired' }, 400);
  }

  const already = await c.env.DB.prepare(
    `SELECT id FROM gift_redemptions WHERE code = ? AND user_id = ?`
  ).bind(code, user.id).first();
  if (already) return c.json({ error: 'You have already redeemed this gift code' }, 409);

  const subId = randomId('sub');
  const redId = randomId('red');
  await c.env.DB.prepare(`INSERT INTO gift_redemptions (id, code, user_id) VALUES (?, ?, ?)`).bind(redId, code, user.id).run();
  await c.env.DB.prepare(`UPDATE gift_codes SET uses_count = uses_count + 1 WHERE code = ?`).bind(code).run();
  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, admin_note)
     VALUES (?, ?, ?, 'ACTIVE', 'ADMIN_GRANT', ?, 0, datetime('now'), datetime('now', '+' || ? || ' days'), 'Gift code redeemed')`
  ).bind(subId, user.id, gift.plan_code, `GIFT:${code}`, gift.duration_days).run();

  // Free gift codes activate subscription only; they do not unlock USD referral commissions (anti-farming)
  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Redeemed gift code ${code} (${gift.duration_days}d)`);
  return c.json({ ok: true, durationDays: gift.duration_days, planCode: gift.plan_code });
});

subscriptionRoutes.post('/admin/gift-codes', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const body = await c.req.json<{ code?: string; planCode?: string; durationDays?: number; maxUses?: number }>();
  const code = (body.code || `DLR${Math.random().toString(36).slice(2, 8)}`).trim().toUpperCase();
  const durationDays = Math.max(1, Math.min(365, Number(body.durationDays ?? 30)));
  const maxUses = Math.max(1, Math.min(1000, Number(body.maxUses ?? 1)));
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO gift_codes (code, plan_code, duration_days, max_uses, is_active, created_by)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).bind(code, body.planCode || 'pro_monthly', durationDays, maxUses, actor.id).run();
  return c.json({ ok: true, code, durationDays, maxUses }, 201);
});
