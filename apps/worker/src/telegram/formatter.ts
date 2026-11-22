import { resolveEngineDisplayLabel } from '@dollarino/core';
import type { FuturesBalance } from '../exchanges/base.js';
import type { InlineKeyboardButton, ReplyKeyboardButton } from './client.js';

export const OFFICIAL_CHANNEL_HANDLE = '@Dollarino_official';
export const OFFICIAL_BOT_HANDLE = '@Dollarino_bot';
export const CREATOR_ATTRIBUTION_FA =
  '👨‍💻 طراح و سازنده پروژه دلارینو: **آوید کیا (Avid Kiya)**\n' +
  '• تلگرام: @avidkiya (https://t.me/avidkiya)\n' +
  '• اینستاگرام و توییتر (X): @avid_kiya (https://instagram.com/avid_kiya)';
export const ANTI_SCAM_WARNING_FA =
  '⚠️ هشدار امنیتی: دلارینو هیچ اکانت پیوی شخصی برای پشتیبانی یا دریافت وجه ندارد. ثبت‌نام، ورود و پشتیبانی رسمی فقط از طریق ربات @Dollarino_bot و پشتیبانی آنلاین داخل سایت انجام می‌شود.';

export function formatIranDateTime(isoInput?: string | null): string {
  if (!isoInput) return '—';
  const normalized = isoInput.includes('T') || isoInput.endsWith('Z') ? isoInput : isoInput.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return String(isoInput);
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function formatToman(usdt: number, rate = 70000): string {
  return Math.round(usdt * rate).toLocaleString('en-US');
}

export function preAuthIntroMessage(firstName: string): string {
  return (
    `🚀 به **دلارینو** خوش آمدید، ${firstName || 'دوست عزیز'}!\n\n` +
    `به دنیای ابزارهای هوشمند معاملاتی خوش آمدید.\n\n` +
    `در دلارینو می‌توانید به مجموعه‌ای از امکانات معاملاتی دسترسی داشته باشید:\n\n` +
    `🤖 **هوش مصنوعی دلارینو**\n` +
    `ابزار هوشمند تحلیل و معاملهٔ خودکار بازار\n\n` +
    `📊 **استراتژی‌های منتخب دلارینو**\n` +
    `دسترسی به استراتژی‌های معاملاتی منتخب و دُرنا V1\n\n` +
    `🔄 **کپی ترید دلارینو**\n` +
    `امکان کپی معاملات و دنبال‌کردن عملکرد معامله‌گران\n\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `🔐 **تنها یک قدم تا شروع:**\n` +
    `برای ورود امن و باز شدن منوی کامل ربات، دکمهٔ پایین صفحه (**📱 اشتراک‌گذاری شماره تماس من**) را لمس کنید.\n` +
    `⚠️ فقط شماره خودتان پذیرفته می‌شود.`
  );
}

export function preAuthIntroInlineButtons(): InlineKeyboardButton[][] {
  return [];
}

export function contactVerificationKeyboard(): ReplyKeyboardButton[][] {
  return [
    [{ text: '📱 اشتراک‌گذاری شماره تماس من', request_contact: true }],
  ];
}

export function welcomeMessage(firstName: string, uiMode: 'simple' | 'pro' = 'simple', webAppUrl = 'https://dollarino.pages.dev'): string {
  const cleanWeb = webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  return (
    `🚀 به **دلارینو** خوش آمدید، ${firstName || 'دوست عزیز'}!\n\n` +
    `به دنیای ابزارهای هوشمند معاملاتی خوش آمدید.\n\n` +
    `در دلارینو می‌توانید به مجموعه‌ای از امکانات معاملاتی دسترسی داشته باشید:\n\n` +
    `🧠 **هوش مصنوعی اختصاصی دلارینو (چت + تحلیل عکس چارت)**\n` +
    `چت آزاد مثل پیشرفته‌ترین AIها، انتخاب مدل و ارسال عکس چارت برای دریافت ستاپ\n\n` +
    `🤖 **ترید هوشمند اتومات و استراتژی دُرنا V1**\n` +
    `رصد ۲۴ ساعته بازار، مدیریت ریسک ۳ تارگت و کپی‌ترید تاییدشده\n\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `برای شروع، سرویس موردنظر خود را از منوی پایین انتخاب کنید (${uiMode === 'pro' ? 'حالت حرفه‌ای ⚡' : 'حالت ساده 🌱'}).\n` +
    `📸 همچنین می‌توانید همین‌جا **سوال بپرسید یا عکس چارت بفرستید** تا هوش مصنوعی دلارینو فوراً تحلیل و ستاپ بدهد!\n\n` +
    `🌐 وب‌سایت رسمی دلارینو: ${cleanWeb}\n` +
    `${CREATOR_ATTRIBUTION_FA}\n\n` +
    `⚠️ فعالیت در بازارهای مالی با ریسک همراه است. هیچ بازدهی تضمین‌شده‌ای وجود ندارد.\n` +
    `**دلارینو؛ هوشمندانه‌تر معامله کنید.**`
  );
}

export function mainMenuKeyboard(webAppUrl?: string, uiMode: 'simple' | 'pro' = 'simple', isAdmin = false): ReplyKeyboardButton[][] {
  const safeUrl = webAppUrl?.startsWith('https://') ? webAppUrl : undefined;
  const rows: ReplyKeyboardButton[][] = [
    [{ text: '🧠 چت هوش مصنوعی (عکس چارت)' }, { text: '⚡️ شکار فوری AI' }],
    [{ text: '🟢 شروع خودکار ربات' }, { text: '📈 معاملات باز' }],
    [{ text: 'حساب کاربری 👤' }, { text: 'اتصال به صرافی 🔗' }],
    [{ text: '🦊 Trust Wallet و DEX' }, { text: uiMode === 'pro' ? '🔍 اسکنر DEX' : '🏆 کپی‌ترید' }],
  ];
  rows.push([{ text: 'تنظیمات ⚙️' }, { text: 'خرید اشتراک 💎' }]);
  rows.push([{ text: '💬 پشتیبانی' }, { text: 'راهنما 📚' }, { text: '👨‍💻 درباره سازنده' }]);
  if (isAdmin && safeUrl) {
    rows.push([{ text: 'پنل مدیریت 💼' }, { text: '🚀 باز کردن مینی‌اپ', web_app: { url: safeUrl } }]);
  } else if (isAdmin) {
    rows.push([{ text: 'پنل مدیریت 💼' }]);
  } else if (safeUrl) {
    rows.push([{ text: '🚀 باز کردن مینی‌اپ دلارینو', web_app: { url: safeUrl } }]);
  }
  return rows;
}

export type CollapsibleMenuSection = 'none' | 'ai' | 'hunt' | 'copy' | 'trust' | 'tools';

export function miniAppInlineKeyboard(
  webAppUrl: string,
  path = '',
  openSection: CollapsibleMenuSection = 'none',
  isBotRunning = false,
  uiMode: 'simple' | 'pro' = 'simple'
): InlineKeyboardButton[][] {
  const base = webAppUrl.replace(/\/$/, '');
  const fullUrl = `${base}${path}`;
  const hasHttps = fullUrl.startsWith('https://');
  const rows: InlineKeyboardButton[][] = [];

  rows.push([
    {
      text: isBotRunning ? '🔴 توقف ربات' : '🟢 روشن کردن ربات',
      callback_data: 'tg_bot_toggle',
      style: isBotRunning ? 'danger' : 'success',
    },
    {
      text: '⚡️ شکار فوری AI',
      callback_data: 'tg_instant_ai_trade',
      style: 'primary',
    },
  ]);

  if (openSection === 'none') {
    rows.push([
      { text: '🧠 چت AI و عکس چارت', callback_data: 'tg_ai_chat', style: 'primary' },
      { text: '🎛 انتخاب روش ترید', callback_data: 'tg_acc:ai' },
    ]);
    if (hasHttps) {
      rows.push([
        { text: '🚀 باز کردن مینی‌اپ', web_app: { url: fullUrl }, style: 'success' },
        { text: '💬 صفحه چت کامل AI', web_app: { url: `${base}/?tab=aichat` }, style: 'primary' },
      ]);
    }
    return rows;
  }

  if (openSection === 'ai') {
    rows.push([
      { text: '🤖 هوش مصنوعی دلارینو', callback_data: 'tg_mode_simple_ai', style: 'success' },
      { text: '📊 استراتژی دُرنا V1', callback_data: 'tg_hunt_ready', style: 'primary' },
    ]);
    rows.push([
      { text: '🔄 کپی‌ترید', callback_data: 'tg_copy_list' },
      { text: '🧠 آموزش به هوش مصنوعی من', callback_data: 'tg_myai' },
    ]);
    rows.push([
      {
        text: uiMode === 'simple' ? '⚡ حالت حرفه‌ای' : '🌱 حالت ساده',
        callback_data: 'tg_toggle_ui_mode',
      },
      { text: '🚀 راه‌اندازی ۴ مرحله', callback_data: 'tg_simple_wizard:1' },
    ]);
  }

  if (openSection === 'hunt') {
    rows.push([
      { text: '⚡️ استراتژی‌های آماده', callback_data: 'tg_hunt_ready', style: 'success' },
      ...(hasHttps
        ? [{ text: '🛠 استراتژی شخصی', web_app: { url: `${base}/?tab=radar` }, style: 'primary' as const }]
        : [{ text: '🛠 استراتژی شخصی', callback_data: 'tg_hunt_personal', style: 'primary' as const }]),
    ]);
  }

  if (openSection === 'copy') {
    rows.push([
      { text: '📋 تریدرهای تاییدشده', callback_data: 'tg_copy_list', style: 'success' },
      ...(hasHttps
        ? [{ text: '🌐 مدیریت در مینی‌اپ', web_app: { url: `${base}/?tab=copy` } }]
        : [{ text: '📈 معاملات باز', callback_data: 'tg_positions' }]),
    ]);
  }

  if (openSection === 'trust') {
    rows.push([
      { text: '🦊 وضعیت و اتصال ولت', callback_data: 'tg_tw_menu', style: 'primary' },
      { text: '🔍 توکن‌های داغ DEX', callback_data: 'tg_dex_trending', style: 'success' },
    ]);
    rows.push([
      { text: '🔎 جستجوی توکن', callback_data: 'tg_dex_search' },
      { text: '💎 اشتراک', callback_data: 'tg_open_sub' },
    ]);
  }

  if (openSection === 'tools') {
    rows.push([
      { text: '📈 معاملات باز', callback_data: 'tg_positions' },
      { text: '💎 اشتراک', callback_data: 'tg_open_sub', style: 'success' },
    ]);
    rows.push([
      { text: '🧩 اکستنشن و ویجت', callback_data: 'tg_ext_widgets' },
      { text: '🌐 ورود به سایت', callback_data: 'tg_web_login' },
    ]);
  }

  rows.push([
    ...(hasHttps ? [{ text: '🚀 باز کردن مینی‌اپ', web_app: { url: fullUrl }, style: 'success' as const }] : []),
    { text: '🔙 بستن منو', callback_data: 'tg_acc:none' },
  ]);

  return rows;
}

export function channelSignalInlineButtons(params: {
  signalId: string;
  botUsername: string;
  webAppUrl: string;
  forChannel: boolean;
}): InlineKeyboardButton[][] {
  const cleanBot = params.botUsername.replace(/^@/, '') || 'Dollarino_bot';
  const baseWeb = params.webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';

  if (params.forChannel) {
    return [
      [
        {
          text: '🤖 ترید در ربات',
          url: `https://t.me/${cleanBot}?start=sig_${params.signalId}`,
          style: 'success',
        },
        {
          text: '⚡️ تایید و اجرا',
          url: `https://t.me/${cleanBot}?start=exec_${params.signalId}`,
          style: 'primary',
        },
      ],
      [
        {
          text: '📊 مشاهده چارت در سایت',
          url: `${baseWeb}/?signal=${params.signalId}`,
        },
      ],
    ];
  }

  return [
    [
      {
        text: 'دلارینو ترید کن برام 🤖',
        callback_data: `manual_trade:${params.signalId}`,
        style: 'success',
      },
      {
        text: 'تایید سریع و اجرا ✅',
        callback_data: `manual_confirm:${params.signalId}`,
        style: 'primary',
      },
    ],
    [
      {
        text: '📊 تحلیل و جزئیات در مینی‌اپ',
        web_app: { url: `${baseWeb}/?signal=${params.signalId}` },
      },
    ],
  ];
}

export function channelNewsInlineButtons(params: {
  botUsername: string;
  webAppUrl: string;
  customButtonLabel?: string;
  customButtonUrl?: string;
}): InlineKeyboardButton[][] {
  const cleanBot = params.botUsername.replace(/^@/, '') || 'Dollarino_bot';
  const baseWeb = params.webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  const rows: InlineKeyboardButton[][] = [
    [
      {
        text: '🤖 ورود به ربات ترید @Dollarino_bot',
        url: `https://t.me/${cleanBot}`,
        style: 'primary',
      },
      {
        text: '🚀 پنل هوشمند دلارینو',
        url: baseWeb,
        style: 'success',
      },
    ],
  ];
  if (params.customButtonLabel && params.customButtonUrl) {
    rows.unshift([
      {
        text: params.customButtonLabel,
        url: params.customButtonUrl,
      },
    ]);
  }
  return rows;
}

export function copyTradePublishConfirmButtons(copyTradeId: string): InlineKeyboardButton[][] {
  return [
    [
      {
        text: '✅ بله، منتشر و برای کپی‌تریدها ارسال شود',
        callback_data: `copy_pub_yes:${copyTradeId}`,
        style: 'success',
      },
    ],
    [
      {
        text: '❌ خیر، فقط ترید شخصی بماند',
        callback_data: `copy_pub_no:${copyTradeId}`,
        style: 'danger',
      },
    ],
  ];
}

export function settingsKeyboard(isAdmin: boolean, isSuperAdmin = false, uiMode: 'simple' | 'pro' = 'simple') {
  const rows = [
    [{ text: 'اتوترید 🤖' }, { text: 'دستی ترید 💪' }],
    [{ text: '🎛 انتخاب روش ترید' }, { text: '⚖️ اسپات / فیوچرز' }],
    [{ text: '↕️ جهت معاملات' }, { text: 'تنظیم مقادیر معاملات 🪛' }],
    [{ text: 'دریافت موجودی صرافی 💳' }, { text: 'دریافت اعلان 🔔' }],
    [
      { text: uiMode === 'simple' ? '⚡ رفتن به حالت حرفه‌ای' : '🌱 رفتن به حالت ساده' },
      { text: 'تغییر API صرافی 📡' },
    ],
  ];
  if (isSuperAdmin) {
    rows.push([{ text: 'پنل مدیریت 💼' }, { text: 'افزودن مدیر 🔑' }]);
  } else if (isAdmin) {
    rows.push([{ text: 'پنل مدیریت 💼' }]);
  }
  rows.push([{ text: 'بازگشت به صفحه قبل 🔙' }]);
  return rows;
}

export function exchangeSelectionKeyboard() {
  return [
    [{ text: '🦊 کیف‌پول Trust Wallet' }],
    [{ text: 'Toobit (توبیت) 🟢' }, { text: 'Bitunix (بیت‌یونیکس) 🟠' }],
    [{ text: 'KCEX (کی‌سی‌ای‌ایکس) 🔵' }, { text: 'Paper Mode (دمو) 🧪' }],
    [{ text: 'بازگشت به صفحه قبل 🔙' }],
  ];
}

export function formatBalanceCard(provider: string, bal: FuturesBalance): string {
  return (
    `💳 موجودی حساب فیوچرز (${provider.toUpperCase()}):\n\n` +
    `Free: ${bal.free} ${bal.currency}\n` +
    `Used: ${bal.used} ${bal.currency}\n` +
    `Total: ${bal.total} ${bal.currency}\n\n` +
    `🆔 ${OFFICIAL_CHANNEL_HANDLE}`
  );
}

export function formatTradeOpenedCard(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  exchange: string;
  entryPrice: string;
  leverage: number;
  marginUsed: string;
  stopLoss: string;
  tp1: string;
  tp2?: string;
  tp3?: string;
  tp1Pct: number;
  tp2Pct: number;
  tp3Pct: number;
  engineKey?: string;
  engineLabel?: string;
}) {
  const engineStr = resolveEngineDisplayLabel(params.engineKey, params.engineLabel);
  return (
    `📣 باز شدن معامله جدید (${params.exchange.toUpperCase()})\n` +
    `⚙️ موتور: ${engineStr}\n\n` +
    `${params.direction === 'LONG' ? '🟢 لانگ (BUY)' : '🔴 شورت (SELL)'} | 💲 ${params.symbol}\n` +
    `🔔 قیمت ورود (Market): ${params.entryPrice}\n` +
    `🔘 لوریج: ${params.leverage}x\n` +
    `💰 مارجین درگیر: ${params.marginUsed} USDT\n` +
    `⛔️ SL اولیه: ${params.stopLoss}\n` +
    `🟢 TP1 (${params.tp1Pct}% + ریسک‌فری): ${params.tp1}\n` +
    (params.tp2 ? `🟡 TP2 (${params.tp2Pct}% + SL→TP1): ${params.tp2}\n` : '') +
    (params.tp3 ? `🟠 TP3 (${params.tp3Pct}%): ${params.tp3}\n` : '') +
    `🕒 زمان ورود: ${formatIranDateTime(new Date().toISOString())}\n` +
    `🆔 ${OFFICIAL_CHANNEL_HANDLE}`
  );
}

export function formatTradeClosedCard(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: string;
  exitPrice: string;
  pnlUsd: number;
  pnlPct: number;
  reason: string;
  openedAt?: string | null;
  closedAt?: string | null;
  stopLoss?: string;
  tp1?: string;
  leverage?: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp3Hit?: boolean;
  trailingActive?: boolean;
  trailingSl?: string;
  engineKey?: string;
  engineLabel?: string;
  mode?: 'LIVE' | 'PAPER';
}) {
  const win = params.pnlUsd >= 0;
  const header = win ? 'تبریک میگم 🤑' : 'ضرر هم جزئی از بازار🥲';
  const entryTime = formatIranDateTime(params.openedAt);
  const exitTime = formatIranDateTime(params.closedAt ?? new Date().toISOString());
  const engineName = resolveEngineDisplayLabel(params.engineKey, params.engineLabel);
  const signPnl = `${params.pnlUsd >= 0 ? '+' : '-'}$${Math.abs(params.pnlUsd).toFixed(2)}`;
  const signPct = `${params.pnlPct >= 0 ? '+' : '-'}${Math.abs(params.pnlPct).toFixed(2)}%`;

  const tpSummary = [
    `TP1: ${params.tp1Hit ? '✅ فعال شد' : '⏳ نرسید'}`,
    `TP2: ${params.tp2Hit ? '✅ فعال شد' : '⏳ نرسید'}`,
    `TP3: ${params.tp3Hit ? '✅ کامل شد' : '⏳ نرسید'}`,
  ].join(' | ');

  const trailSummary = params.trailingActive
    ? `🛡 Trailing SL فعال‌شده (${params.trailingSl || 'Risk-Free'})`
    : `⛔️ SL ثابت (${params.trailingSl || params.stopLoss || '—'})`;

  return (
    `${header}\n\n` +
    `⚙️ موتور: ${engineName}\n` +
    `🏷 نوع حساب: ${params.mode === 'LIVE' ? 'حساب واقعی (LIVE)' : 'حساب دمو / شبیه‌ساز'}\n` +
    `💲 نماد: ${params.symbol} (${params.direction} · ${params.leverage ?? 1}x)\n` +
    `🕒 تایم ورود: ${entryTime}\n` +
    `🏁 تایم خروج: ${exitTime}\n` +
    `📥 قیمت ورود: ${params.entryPrice}\n` +
    `📤 قیمت خروج: ${params.exitPrice}\n` +
    `${win ? '🟢 سود خالص' : '🔴 زیان خالص'}: ${signPnl} (${signPct})\n` +
    `🎯 وضعیت تارگت‌ها: ${tpSummary}\n` +
    `${trailSummary}\n` +
    `📌 نتیجه: ${params.reason}\n\n` +
    `استراتژی:\n` +
    `• لوریج: ${params.leverage ?? 1}x | SL اولیه: ${params.stopLoss ?? '—'} | TP1: ${params.tp1 ?? '—'}\n` +
    `🆔 ${OFFICIAL_CHANNEL_HANDLE}`
  );
}

export function formatAccountCard(params: {
  telegramId: string;
  username: string;
  email: string;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  trustWalletAddress?: string | null;
  uiMode?: 'simple' | 'pro';
  walletUsdt: number;
  tomanRate: number;
  planNameFa: string;
  hasPaidPlan: boolean;
  daysRemaining: number;
  subStart?: string | null;
  subEnd?: string | null;
  tradingMode: string;
  execMode: string;
  totalTrades: number;
  wins: number;
  totalPnl: number;
}): string {
  const walletToman = formatToman(params.walletUsdt, params.tomanRate);
  const shortTw = params.trustWalletAddress
    ? `${params.trustWalletAddress.slice(0, 6)}...${params.trustWalletAddress.slice(-4)}`
    : 'متصل نشده (از منوی Trust Wallet متصل کنید)';
  return (
    `👤 اطلاعات حساب کاربری دلارینو\n\n` +
    `👤 نام: ${params.username}\n` +
    `📱 شماره تماس احرازشده: ${params.phoneVerified && params.phoneNumber ? `${params.phoneNumber} ✅` : 'تایید نشده'}\n` +
    `🦊 کیف‌پول Trust Wallet: ${shortTw}\n` +
    `🎛 حالت رابط ربات: ${params.uiMode === 'pro' ? 'حالت حرفه‌ای ⚡' : 'حالت ساده 🌱'}\n` +
    `🆔 آیدی عددی: ${params.telegramId}\n` +
    `📧 حساب وب: ${params.email.endsWith('.local') ? 'ورود با تلگرام (از دکمه ورود سریع استفاده کنید)' : params.email}\n` +
    `💰 موجودی کیف پول: ${params.walletUsdt.toFixed(2)} USDT (${walletToman} تومان)\n\n` +
    `💎 اشتراک فعلی: ${params.planNameFa}\n` +
    (params.hasPaidPlan
      ? `📅 تاریخ شروع: ${formatIranDateTime(params.subStart)}\n⏳ تاریخ پایان: ${formatIranDateTime(params.subEnd)} (${params.daysRemaining} روز باقیمانده)\n\n`
      : `⏳ برای دسترسی کامل به لایو، DEX و کپی‌ترید، اشتراک تهیه کنید.\n\n`) +
    `⚙️ حالت معامله: ${params.tradingMode} | ${params.execMode === 'AUTO' ? 'اتوترید 🤖' : 'دستی ترید 💪'}\n` +
    `📊 معاملات بسته: ${params.totalTrades} (برد: ${params.wins})\n` +
    `📈 سود/ضرر خالص: ${params.totalPnl >= 0 ? '+' : '-'}$${Math.abs(params.totalPnl).toFixed(2)}\n\n` +
    `${ANTI_SCAM_WARNING_FA}`
  );
}
