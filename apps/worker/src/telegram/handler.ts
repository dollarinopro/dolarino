import { formatDollarinoSignal, parseDollarinoSignal, resolveEngineDisplayLabel, selectClosedCandles, type Direction, type MarketType, type Timeframe } from '@dollarino/core';
import {
  DOLLARINO_CREATOR_INFO,
  listSelectableAIModels,
  runDedicatedAIChat,
  type ExtractedChartSetup,
} from '../ai/assistant.js';
import { generateSupportAIReply, getPlatformAISummary, resolveAIEnsemble, runAutonomousAITrader } from '../ai/providers.js';
import { ensureUserDefaults, syncTelegramAvatarForUser } from '../auth.js';
import { encryptVaultJson, hashPassword, hmacSha256Hex, maskSecret, randomId, sha256Hex } from '../crypto.js';
import { fetchDexTrendingOverview, searchDexPairs, type DexTokenEnriched } from '../dex/screener.js';
import { confirmAndMirrorCopyTrade } from '../engine/copy-mirror.js';
import { executeSignalForUser, type UserBotConfigRow } from '../engine/executor.js';
import type { AuthUser, Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { DEFAULT_TRAINED_RULES, extractRulesFromConversation, type TrainedAIRules } from '../routes/my-ai.js';
import { buildVerifiedCardCanonicalPayload } from '../routes/trading.js';
import { resolveUserEntitlement } from '../routes/subscriptions.js';
import {
  fetchBscUsdtBalance,
  fetchEvmNativeBalance,
  fetchSolanaBalance,
  fetchTonBalance,
  fetchTronBalances,
  isValidEvm,
  isValidSolana,
  isValidTon,
  isValidTron,
} from '../routes/trustwallet.js';
import {
  getSystemSetting,
  handleAdminCallback,
  handleAdminStepInput,
  openAdminPanelHome,
  parseAdminPerms,
  type AdminActor,
  type AdminStepState,
} from './admin-menu.js';
import { TelegramBotClient, type InlineKeyboardButton } from './client.js';
import {
  ANTI_SCAM_WARNING_FA,
  CREATOR_ATTRIBUTION_FA,
  channelSignalInlineButtons,
  type CollapsibleMenuSection,
  contactVerificationKeyboard,
  exchangeSelectionKeyboard,
  formatAccountCard,
  formatBalanceCard,
  formatToman,
  mainMenuKeyboard,
  miniAppInlineKeyboard,
  OFFICIAL_BOT_HANDLE,
  preAuthIntroMessage,
  settingsKeyboard,
  welcomeMessage,
} from './formatter.js';
import {
  notifyAllAdmins,
  notifyAllAdminsPhoto,
  publishProfitCardToTelegram,
  publishSignalClosedCard,
  resolveChannelAndBotConfig,
} from './publisher.js';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string }>;
    document?: { file_id: string; mime_type?: string; file_name?: string };
    contact?: {
      phone_number: string;
      first_name?: string;
      last_name?: string;
      user_id?: number;
    };
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
  };
  channel_post?: {
    message_id: number;
    date?: number;
    forward_date?: number;
    forward_from?: unknown;
    forward_from_chat?: unknown;
    chat: { id: number; username?: string; title?: string };
    text?: string;
  };
}

interface TelegramStepState extends Partial<AdminStepState> {
  step: string;
  provider?: 'toobit' | 'bitunix' | 'kcex';
  apiKey?: string;
  subId?: string;
  pendingStartArg?: string;
  wizMarginPct?: number;
  wizLev?: number;
  wizEngine?: string;
  activeAiSessionId?: string;
}

function splitTelegramChunks(text: string, maxLen = 3800): string[] {
  const clean = text.trim();
  if (clean.length <= maxLen) return [clean];
  const chunks: string[] = [];
  let remaining = clean;
  while (remaining.length > maxLen) {
    let idx = remaining.lastIndexOf('\n', maxLen);
    if (idx < maxLen * 0.4) idx = maxLen;
    chunks.push(remaining.slice(0, idx).trim());
    remaining = remaining.slice(idx).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function openDedicatedAIChatMenu(
  env: Env,
  bot: TelegramBotClient,
  chatId: number | string,
  user: ProvisionedUserRow,
  webAppUrl: string,
  opts?: { createNewSession?: boolean; editMsgId?: number }
): Promise<void> {
  const { models, selectedModelId } = await listSelectableAIModels(env, user.id);
  const currentModel = models.find((m) => m.id === selectedModelId) || models[0];
  let sessionId = '';
  if (opts?.createNewSession) {
    sessionId = randomId('aichat');
    await env.DB.prepare(`INSERT INTO ai_chat_sessions (id, user_id, title, model_id) VALUES (?, ?, ?, ?)`)
      .bind(sessionId, user.id, 'چت تلگرام دلارینو', currentModel?.id || null)
      .run()
      .catch(() => {});
  } else {
    const existing = await env.DB.prepare(
      `SELECT id FROM ai_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
      .bind(user.id)
      .first<{ id: string }>()
      .catch(() => null);
    sessionId = existing?.id || '';
  }

  await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
    .bind(JSON.stringify({ step: 'AWAIT_AI_CHAT', activeAiSessionId: sessionId || undefined }), user.id)
    .run();

  const visionBadge = currentModel?.supportsVision ? '👁️ پشتیبانی کامل از عکس چارت' : '💬 مدل متنی';
  const hasHttps = webAppUrl.startsWith('https://');
  const text =
    `🧠 **هوش مصنوعی اختصاصی دلارینو (نسخه هوشمند + تحلیل چارت)**\n\n` +
    `🔹 مدل فعال فعلی: **${currentModel?.label || 'هوش مصنوعی مرکزی دلارینو'}** (${visionBadge})\n` +
    `🔹 مدل‌های آماده انتخاب: **${models.length} مدل متصل**\n\n` +
    `✨ **هر کاری می‌خواهی همین‌جا انجام بده:**\n` +
    `• **عکس چارت / اسکرین‌شات بفرست** تا روند، سطوح و ستاپ کامل (Entry / SL / TP1-3) بدهم 📸\n` +
    `• **هر سوالی داری بپرس** (تحلیل بازار، کدنویسی Pine/Python، استراتژی، سوالات عمومی و راهنمای دلارینو) 💬\n` +
    `• از دکمه‌های زیر مدل را عوض کن یا گفتگوی جدید بساز:\n\n` +
    `${CREATOR_ATTRIBUTION_FA}`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: `🤖 تغییر مدل (${models.length})`, callback_data: 'tg_ai_models', style: 'primary' },
      { text: '🆕 گفتگوی جدید', callback_data: 'tg_ai_new', style: 'success' },
    ],
    ...(hasHttps
      ? [[{ text: '💬 باز کردن صفحه چت کامل در مینی‌اپ', web_app: { url: `${webAppUrl.replace(/\/$/, '')}/?tab=aichat` }, style: 'primary' as const }]]
      : []),
    [{ text: '🏠 خروج به منوی اصلی', callback_data: 'tg_ai_exit' }],
  ];

  if (opts?.editMsgId) {
    await bot.editMessageText(chatId, opts.editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function handleTelegramAIChatTurn(params: {
  env: Env;
  bot: TelegramBotClient;
  chatId: number | string;
  user: ProvisionedUserRow;
  webAppUrl: string;
  text: string;
  imageFileId?: string;
  sessionId?: string;
}): Promise<void> {
  const { env, bot, chatId, user, webAppUrl, text, imageFileId } = params;
  let imageDataUrl: string | null = null;
  if (imageFileId) {
    try {
      const dl = await bot.downloadFileAsDataUrl(imageFileId);
      imageDataUrl = dl.dataUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در دریافت عکس از تلگرام';
      await bot.sendMessage(chatId, `⚠️ ${msg}`);
      if (!text) return;
    }
  }

  const res = await runDedicatedAIChat(env, {
    userId: user.id,
    sessionId: params.sessionId || null,
    message: text,
    imageDataUrl,
  });

  await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
    .bind(JSON.stringify({ step: 'AWAIT_AI_CHAT', activeAiSessionId: res.sessionId }), user.id)
    .run();

  const header = `🧠 **${res.modelLabel}**${res.usedVision ? ' (👁️ تحلیل تصویر چارت)' : ''}\n${
    res.visionFallbackNotice ? `ℹ️ ${res.visionFallbackNotice}\n` : ''
  }\n`;
  let setupBanner = '';
  if (res.setup) {
    setupBanner =
      `\n\n━━━━━━━━━━━━━━\n` +
      `🎯 **ستاپ معاملاتی استخراج‌شده:**\n` +
      `• نماد: **${res.setup.symbol}** | جهت: **${res.setup.direction}**${res.setup.timeframe ? ` (${res.setup.timeframe})` : ''}\n` +
      `• ورود: \`${res.setup.entry}\` | حد ضرر: \`${res.setup.stopLoss}\`\n` +
      `• تارگت‌ها: \`${res.setup.tp1}\`${res.setup.tp2 ? ` / \`${res.setup.tp2}\`` : ''}${res.setup.tp3 ? ` / \`${res.setup.tp3}\`` : ''}` +
      (res.setup.rrRatio ? ` | R:R ${res.setup.rrRatio}` : '');
  }

  const fullOut = `${header}${res.reply}${setupBanner}`;
  const chunks = splitTelegramChunks(fullOut);
  const hasHttps = webAppUrl.startsWith('https://');
  const kb: InlineKeyboardButton[][] = [
    ...(res.setup
      ? [[{ text: '⚡️ ثبت ستاپ و اجرای معامله در دلارینو', callback_data: `tg_ai_exec_setup:${res.sessionId}`, style: 'success' as const }]]
      : []),
    [
      { text: '🤖 انتخاب مدل AI', callback_data: 'tg_ai_models', style: 'primary' },
      { text: '🆕 گفتگوی جدید', callback_data: 'tg_ai_new' },
    ],
    [
      ...(hasHttps
        ? [{ text: '💬 ادامه در صفحه چت وب/مینی‌اپ', web_app: { url: `${webAppUrl.replace(/\/$/, '')}/?tab=aichat` } }]
        : []),
      { text: '🏠 منوی اصلی', callback_data: 'tg_ai_exit' },
    ],
  ];

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await bot.sendMessage(chatId, chunks[i]!, isLast ? { inlineKeyboard: kb } : undefined);
  }
}

interface ProvisionedUserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  is_blocked: number;
  telegram_state: string | null;
  telegram_admin_perms: string | null;
  admin_panel_last_active_at?: string | null;
  wallet_balance_usdt?: number;
  phone_number?: string | null;
  phone_verified?: number;
  trust_wallet_address?: string | null;
  trust_wallet_tron?: string | null;
  trust_wallet_solana?: string | null;
  trust_wallet_ton?: string | null;
  ui_mode?: string | null;
  extension_api_key?: string | null;
}

function getUserUiMode(user: ProvisionedUserRow): 'simple' | 'pro' {
  return user.ui_mode === 'pro' ? 'pro' : 'simple';
}

function isSuperAdminUser(telegramId: string, role: string, env: Env): boolean {
  const ownerId = env.OWNER_TELEGRAM_ID || '944021185';
  return telegramId === ownerId || role === 'owner';
}

function isUserAdmin(telegramId: string, role: string, env: Env): boolean {
  return isSuperAdminUser(telegramId, role, env) || role === 'admin';
}

async function startBotOneClickForTelegram(params: {
  env: Env;
  bot: TelegramBotClient;
  chatId: number | string;
  user: ProvisionedUserRow;
  tgId: string;
  webAppUrl: string;
  overrideStrategyKey?: string;
}): Promise<{ ok: boolean; nextState?: string; text: string }> {
  const { env, user, tgId, overrideStrategyKey } = params;
  const ent = await resolveUserEntitlement(env.DB, {
    id: user.id,
    email: user.email,
    username: user.username,
    role: (user.role as AuthUser['role']) || 'user',
    telegramId: tgId,
  });
  if (!ent.hasPaidPlan && ent.subscriptionRequired) {
    return { ok: false, text: 'NEED_SUBSCRIPTION' };
  }

  const cfg = await env.DB.prepare(
    'SELECT trading_mode, strategy_key, market_type, entry_timeframe, higher_timeframe, margin_pct, max_leverage, ai_min_confidence FROM bot_configs WHERE user_id = ?'
  )
    .bind(user.id)
    .first<{
      trading_mode: string;
      strategy_key: string;
      market_type?: MarketType;
      entry_timeframe?: Timeframe;
      higher_timeframe?: Timeframe;
      margin_pct?: number;
      max_leverage?: number;
      ai_min_confidence?: number;
    }>();

  const targetStrategy = overrideStrategyKey || cfg?.strategy_key || 'ai_autonomous_agent';
  if (targetStrategy === 'ai_autonomous_agent') {
    const ensemble = await resolveAIEnsemble(env, user.id);
    if (ensemble.engines.length === 0) {
      return {
        ok: false,
        text: ensemble.capExceeded
          ? '⚠️ سقف درخواست روزانه موتور «هوش مصنوعی دلارینو» پر شده است. لطفاً در پنل مدیریت سقف را افزایش دهید.'
          : '⚠️ موتور «هوش مصنوعی دلارینو» هنوز توسط مدیریت فعال نشده است.',
      };
    }
  }

  const { adapter, provider } = await resolveUserExchangeAdapter(
    env,
    user.id,
    cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
  );
  const nextState = cfg?.trading_mode === 'LIVE' && provider !== 'paper' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
  const effectiveTradingMode = provider === 'paper' ? 'PAPER' : (cfg?.trading_mode || 'PAPER');

  await env.DB.prepare(
    `UPDATE bot_configs
     SET strategy_key = ?, trade_execution_mode = 'AUTO', auto_scan_top = 1, scan_scope = 'ALL_MARKET',
         bot_state = ?, started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now')
     WHERE user_id = ?`
  )
    .bind(targetStrategy, nextState, user.id)
    .run();

  const doStub = env.TRADING_BOT_DO.get(env.TRADING_BOT_DO.idFromName('global-coordinator'));
  const runTick = Promise.all([
    doStub.fetch('https://do/start').catch(() => {}),
    doStub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {}),
  ]);
  await Promise.race([runTick, new Promise((resolve) => setTimeout(resolve, 4500))]);

  const [bal, openCountRow] = await Promise.all([
    adapter.getBalance(cfg?.market_type ?? 'FUTURES').catch(() => ({ free: '0.00', used: '0.00', total: '0.00', currency: 'USDT' })),
    env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = ?`)
      .bind(user.id, effectiveTradingMode)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
  ]);

  const liveFallbackNote =
    cfg?.trading_mode === 'LIVE' && provider === 'paper'
      ? '\n⚠️ توجه: صرافی واقعی فعالی متصل نیست (یا Toobit نیاز به پروکسی دارد)؛ بنابراین ربات فعلاً روی **شبیه‌ساز Paper** ترید خودکار انجام می‌دهد.'
      : '';

  const text =
    `🟢 **ربات ترید خودکار دلارینو روشن شد و فعال است!**\n\n` +
    `• حالت اجرا: ⚡️ **۱۰۰٪ خودکار (بدون نیاز به تایید دستی)**\n` +
    `• موتور فعال: ${resolveEngineDisplayLabel(targetStrategy)}\n` +
    `• صرافی متصل: ${provider === 'paper' ? 'شبیه‌ساز Paper' : provider.toUpperCase()} (${effectiveTradingMode})\n` +
    `• موجودی آزاد: $${Number(bal.free || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}\n` +
    `• معاملات باز فعلی: ${openCountRow?.cnt ?? 0}\n\n` +
    `🔍 اسکن خودکار کل بازار هر ۱۵ ثانیه در حال اجراست و به‌محض یافتن نقطه ورود مطمئن، معامله با حد ضرر و ۳ تارگت خودکار باز می‌شود.` +
    liveFallbackNote;

  return { ok: true, nextState, text };
}

async function runInstantAiAutoTradeForTelegram(params: {
  env: Env;
  user: ProvisionedUserRow;
  tgId: string;
}): Promise<{ ok: boolean; needSubscription?: boolean; text: string }> {
  const { env, user, tgId } = params;
  const ent = await resolveUserEntitlement(env.DB, {
    id: user.id,
    email: user.email,
    username: user.username,
    role: (user.role as AuthUser['role']) || 'user',
    telegramId: tgId,
  });
  if (!ent.hasPaidPlan && ent.subscriptionRequired) {
    return { ok: false, needSubscription: true, text: 'NEED_SUBSCRIPTION' };
  }

  const cfg = await env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id)
    .first<UserBotConfigRow>();
  const tf: Timeframe = cfg?.entry_timeframe ?? '15m';
  const htf: Timeframe = cfg?.higher_timeframe ?? '1h';
  const marketType: MarketType = cfg?.market_type ?? 'FUTURES';
  const { adapter, provider } = await resolveUserExchangeAdapter(
    env,
    user.id,
    cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
  );

  // Also ensure auto-trading stays enabled on the coordinator
  const nextState = cfg?.trading_mode === 'LIVE' && provider !== 'paper' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
  await env.DB.prepare(
    `UPDATE bot_configs SET strategy_key = 'ai_autonomous_agent', trade_execution_mode = 'AUTO', auto_scan_top = 1, scan_scope = 'ALL_MARKET', bot_state = ?, updated_at = datetime('now') WHERE user_id = ?`
  )
    .bind(nextState, user.id)
    .run();

  const symbols = Array.from(new Set([cfg?.symbol || 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT']));
  const openedTrades: string[] = [];
  const signalLines: string[] = [];

  for (const sym of symbols) {
    try {
      const [ltfRaw, htfRaw] = await Promise.all([
        adapter.getKlines(sym, tf, 180),
        adapter.getKlines(sym, htf, 90).catch(() => []),
      ]);
      const ltfClosed = selectClosedCandles(ltfRaw, tf);
      const htfClosed = selectClosedCandles(htfRaw, htf);
      const decision = await runAutonomousAITrader(env, user.id, {
        symbol: sym,
        timeframe: tf,
        higherTimeframe: htf,
        candles: ltfClosed.length >= 35 ? ltfClosed : ltfRaw,
        htfCandles: htfClosed.length >= 25 ? htfClosed : htfRaw,
        maxLeverage: marketType === 'SPOT' ? 1 : Math.max(1, cfg?.max_leverage ?? 10),
        minConfidence: cfg?.ai_min_confidence ?? 60,
        bypassCache: true,
      });

      if (decision.ok && (decision.action === 'LONG' || decision.action === 'SHORT')) {
        const sigId = randomId('sig');
        const sigObj = {
          symbol: sym,
          direction: decision.action as Direction,
          timeframe: tf,
          price: String(decision.entry),
          stopLoss: String(decision.stopLoss),
          leverage: marketType === 'SPOT' ? 1 : decision.leverage,
          tp1: String(decision.tp1),
          tp2: String(decision.tp2),
          tp3: String(decision.tp3),
          channelHandle: cfg?.signal_channel_handle || '@Dollarino_official',
          engineKey: 'ai_autonomous_agent',
          engineLabel: resolveEngineDisplayLabel('ai_autonomous_agent'),
          reason: decision.thesis,
        };
        await env.DB.prepare(
          `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status, engine_source)
           VALUES (?, ?, 'ai_agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 'ai_autonomous_agent')`
        )
          .bind(
            sigId,
            user.id,
            sym,
            sigObj.direction,
            tf,
            sigObj.price,
            sigObj.stopLoss,
            sigObj.leverage,
            sigObj.tp1,
            sigObj.tp2,
            sigObj.tp3,
            formatDollarinoSignal(sigObj)
          )
          .run()
          .catch(() => {});

        const execRes = await executeSignalForUser(env, user.id, sigObj, {
          signalId: sigId,
          forceBypassState: true,
          strategyKey: 'ai_autonomous_agent',
          aiConfidence: decision.confidence,
          aiReasoning: decision.thesis,
          marketType,
        });
        if (execRes.ok) {
          await env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run().catch(() => {});
          openedTrades.push(`✅ **${sym}** ${sigObj.direction} (${sigObj.leverage}x) @ $${sigObj.price}`);
        } else {
          signalLines.push(`⚠️ ${sym} ${sigObj.direction} (${decision.confidence}%): اجرا نشد — ${execRes.error}`);
        }
      } else {
        signalLines.push(`⏸ ${sym}: ${decision.action} (${decision.confidence}%)`);
      }
    } catch {
      signalLines.push(`⚠️ ${sym}: خطا در دریافت داده بازار`);
    }
  }

  const doStub = env.TRADING_BOT_DO.get(env.TRADING_BOT_DO.idFromName('global-coordinator'));
  await doStub.fetch('https://do/start').catch(() => {});

  const summary =
    `⚡️ **نتیجه شکار و ترید فوری هوش مصنوعی (${provider.toUpperCase()})**\n\n` +
    (openedTrades.length > 0
      ? `🚀 **${openedTrades.length} معامله هم‌اکنون باز شد:**\n${openedTrades.join('\n')}\n\n`
      : `🔎 **در این لحظه سیگنال ورود قطعی معامله‌نشده‌ای باز نشد:**\n`) +
    (signalLines.length > 0 ? `${signalLines.join('\n')}\n\n` : '') +
    `🤖 ربات خودکار همچنان روشن است و هر ۱۵ ثانیه بازار را رصد می‌کند.`;

  return { ok: true, text: summary };
}

async function getOrProvisionTelegramUser(
  env: Env,
  tgUser: { id: number; first_name?: string; username?: string }
): Promise<ProvisionedUserRow> {
  const tgId = String(tgUser.id);
  const ownerId = env.OWNER_TELEGRAM_ID || '944021185';

  let row = await env.DB.prepare(
    `SELECT id, email, username, role, is_blocked, telegram_state, telegram_admin_perms, admin_panel_last_active_at,
            wallet_balance_usdt, phone_number, phone_verified, trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton,
            ui_mode, extension_api_key
     FROM users WHERE telegram_id = ?`
  ).bind(tgId).first<ProvisionedUserRow>();

  if (!row) {
    const id = randomId('usr');
    const role = tgId === ownerId ? 'owner' : 'user';
    const username = tgUser.username || tgUser.first_name || `tg_${tgId}`;
    const pseudoEmail = `tg_${tgId}@telegram.dollarino.local`;
    const pwd = await hashPassword(randomId('pwd'));
    const myRefCode = `DLR-${id.slice(-6).toUpperCase()}`;

    await env.DB.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, telegram_id, telegram_username, telegram_first_name, phone_verified, ui_mode, referral_code, has_custom_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'simple', ?, 0)`
    )
      .bind(id, pseudoEmail, username, pwd, role, tgId, tgUser.username ?? null, tgUser.first_name ?? null, tgId === ownerId ? 1 : 0, myRefCode)
      .run();

    await ensureUserDefaults(env.DB, id);
    row = {
      id,
      email: pseudoEmail,
      username,
      role,
      is_blocked: 0,
      telegram_state: null,
      telegram_admin_perms: '{}',
      admin_panel_last_active_at: null,
      wallet_balance_usdt: 0,
      phone_number: null,
      phone_verified: tgId === ownerId ? 1 : 0,
      trust_wallet_address: null,
      trust_wallet_tron: null,
      trust_wallet_solana: null,
      trust_wallet_ton: null,
      ui_mode: 'simple',
      extension_api_key: null,
    };
  } else {
    if (tgId === ownerId && row.role !== 'owner') {
      await env.DB.prepare(`UPDATE users SET role = 'owner', phone_verified = 1 WHERE id = ?`).bind(row.id).run();
      row.role = 'owner';
      row.phone_verified = 1;
    }
    await env.DB.prepare(
      `UPDATE users SET last_active_at = datetime('now'), telegram_username = COALESCE(?, telegram_username), telegram_first_name = COALESCE(?, telegram_first_name) WHERE id = ?`
    ).bind(tgUser.username ?? null, tgUser.first_name ?? null, row.id).run().catch(() => {});
  }

  // Sync default Telegram profile picture unless user uploaded a custom avatar
  await syncTelegramAvatarForUser(env, row.id, tgId).catch(() => {});

  return row;
}

function buildAdminActor(user: ProvisionedUserRow, tgId: string, env: Env): AdminActor {
  const superAdmin = isSuperAdminUser(tgId, user.role, env);
  return {
    id: user.id,
    telegramId: tgId,
    role: user.role,
    username: user.username,
    perms: parseAdminPerms(user.telegram_admin_perms, superAdmin),
    isSuperAdmin: superAdmin,
    lastActiveAt: user.admin_panel_last_active_at,
  };
}

async function applyLinkCodeForUser(
  env: Env,
  currentUserId: string,
  tgUser: { id: number; first_name?: string; username?: string },
  rawCode: string
): Promise<{ ok: boolean; message: string }> {
  const code = rawCode.trim().toUpperCase();
  const webUser = await env.DB.prepare(
    `SELECT id, username, telegram_link_expires_at FROM users WHERE telegram_link_code = ?`
  ).bind(code).first<{ id: string; username: string; telegram_link_expires_at: string | null }>();

  if (!webUser) {
    return { ok: false, message: '❌ کد اتصال نامعتبر است. لطفاً از پنل وب یک کد جدید بسازید.' };
  }
  if (webUser.telegram_link_expires_at && Date.parse(webUser.telegram_link_expires_at) < Date.now()) {
    return { ok: false, message: '⏰ اعتبار این کد اتصال منقضی شده است. لطفاً از پنل وب یک کد جدید بسازید.' };
  }

  if (webUser.id !== currentUserId) {
    const oldRow = await env.DB.prepare(
      `SELECT phone_number, phone_verified, phone_verified_at FROM users WHERE id = ?`
    ).bind(currentUserId).first<{ phone_number: string | null; phone_verified: number; phone_verified_at: string | null }>();
    await env.DB.prepare(`UPDATE users SET telegram_id = NULL WHERE id = ?`).bind(currentUserId).run();
    await env.DB.prepare(
      `UPDATE users
       SET telegram_id = ?, telegram_username = ?, telegram_first_name = ?,
           phone_number = COALESCE(phone_number, ?),
           phone_verified = CASE WHEN phone_verified = 1 OR ? = 1 THEN 1 ELSE 0 END,
           phone_verified_at = COALESCE(phone_verified_at, ?),
           telegram_link_code = NULL, telegram_link_expires_at = NULL
       WHERE id = ?`
    ).bind(
      String(tgUser.id),
      tgUser.username ?? null,
      tgUser.first_name ?? null,
      oldRow?.phone_number ?? null,
      oldRow?.phone_verified ?? 0,
      oldRow?.phone_verified_at ?? null,
      webUser.id
    ).run();
  } else {
    await env.DB.prepare(`UPDATE users SET telegram_link_code = NULL, telegram_link_expires_at = NULL WHERE id = ?`).bind(webUser.id).run();
  }

  return { ok: true, message: `✅ حساب تلگرام شما با موفقیت به اکانت وب «${webUser.username}» متصل شد!` };
}

async function sendWebMagicLoginLink(env: Env, bot: TelegramBotClient, chatId: string | number, userId: string, webAppUrl: string) {
  const magicToken = `tglm_${randomId('m')}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await env.DB.prepare(
    `UPDATE users SET web_magic_token = ?, web_magic_expires_at = ? WHERE id = ?`
  ).bind(magicToken, expiresAt, userId).run();

  const cleanBase = webAppUrl.replace(/\/$/, '');
  const loginUrl = `${cleanBase}/?tg_login=${encodeURIComponent(magicToken)}`;
  const browserInstallUrl = `${cleanBase}/?tg_login=${encodeURIComponent(magicToken)}&install=1`;
  const kb: InlineKeyboardButton[][] = loginUrl.startsWith('https://')
    ? [
        [{ text: '📱 باز کردن مینی‌اپ تلگرام (ورود خودکار)', web_app: { url: loginUrl }, style: 'success' }],
        [{ text: '🌐 باز کردن در گوگل / مرورگر (و نصب برنامه)', url: browserInstallUrl, style: 'primary' }],
      ]
    : [];

  await bot.sendMessage(
    chatId,
    `🌐 **لینک اختصاصی ورود به سایت و مینی‌اپ دلارینو آماده شد** (معتبر به مدت ۱۰ دقیقه):\n\n` +
      `${loginUrl}\n\n` +
      `📱 **دکمه اول (مینی‌اپ):** همین جا داخل تلگرام با حساب تاییدشده خودتان باز می‌شود.\n` +
      `🌐 **دکمه دوم (گوگل / مرورگر):** سایت در مرورگر باز می‌شود تا هم وارد حساب شوید و هم اپلیکیشن دلارینو را نصب کنید.\n` +
      `✏️ از بخش «مدیریت حساب» می‌توانید نام نمایشی، ایمیل، رمز عبور، بیوگرافی و عکس پروفایل را تغییر دهید.`,
    { inlineKeyboard: kb.length ? kb : undefined }
  );
}

async function showAccountCard(env: Env, bot: TelegramBotClient, chatId: string | number, user: ProvisionedUserRow, tgId: string, webAppUrl: string) {
  const [stats, cfg, ent, rateStr, activeSub] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END), 0) as wins, COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED'`
    ).bind(user.id).first<{ total: number; wins: number; pnl: number }>(),
    env.DB.prepare('SELECT trading_mode, trade_execution_mode FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trading_mode: string; trade_execution_mode: string }>(),
    resolveUserEntitlement(env.DB, {
      id: user.id,
      email: user.email,
      username: user.username,
      role: (user.role as AuthUser['role']) || 'user',
      telegramId: tgId,
    }),
    getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000'),
    env.DB.prepare(
      `SELECT started_at, expires_at FROM user_subscriptions WHERE user_id = ? AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY created_at DESC LIMIT 1`
    ).bind(user.id).first<{ started_at: string | null; expires_at: string | null }>(),
  ]);

  const card = formatAccountCard({
    telegramId: tgId,
    username: user.username,
    email: user.email,
    phoneNumber: user.phone_number,
    phoneVerified: Boolean(user.phone_verified),
    trustWalletAddress: user.trust_wallet_address || user.trust_wallet_tron || user.trust_wallet_solana || user.trust_wallet_ton,
    uiMode: getUserUiMode(user),
    walletUsdt: Number(user.wallet_balance_usdt ?? 0),
    tomanRate: Number(rateStr) || 70000,
    planNameFa: ent.planNameFa,
    hasPaidPlan: ent.hasPaidPlan,
    daysRemaining: ent.daysRemaining,
    subStart: activeSub?.started_at,
    subEnd: activeSub?.expires_at,
    tradingMode: cfg?.trading_mode ?? 'PAPER',
    execMode: cfg?.trade_execution_mode ?? 'AUTO',
    totalTrades: stats?.total ?? 0,
    wins: stats?.wins ?? 0,
    totalPnl: stats?.pnl ?? 0,
  });

  const kb: InlineKeyboardButton[][] = [
    [
      { text: 'افزایش موجودی 💰', callback_data: 'sub_topup' },
      { text: 'خرید اشتراک 💎', callback_data: 'sub_menu' },
    ],
    [
      { text: '🦊 کیف‌پول Trust Wallet', callback_data: 'tg_tw_menu', style: 'primary' },
      { text: '🧩 اکستنشن و ویجت موبایل', callback_data: 'tg_ext_widgets' },
    ],
    [
      {
        text: getUserUiMode(user) === 'simple' ? '⚡ ارتقا به حالت حرفه‌ای' : '🌱 رفتن به حالت ساده',
        callback_data: 'tg_toggle_ui_mode',
      },
      { text: '🌐 ورود مستقیم به وب', callback_data: 'tg_web_login' },
    ],
  ];
  if (webAppUrl.startsWith('https://')) {
    kb.push([{ text: '🚀 باز کردن حساب در مینی‌اپ', web_app: { url: `${webAppUrl}/services` } }]);
  }

  await bot.sendMessage(chatId, card, { inlineKeyboard: kb });
}

async function isPhoneKycRequiredForUser(env: Env, user: ProvisionedUserRow, tgId: string): Promise<boolean> {
  if (isUserAdmin(tgId, user.role, env)) return false;
  if (Number(user.phone_verified ?? 0) === 1) return false;
  const kycSetting = await getSystemSetting(env.DB, 'require_telegram_phone_kyc', 'true');
  return kycSetting !== 'false';
}

function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return raw.trim();
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

async function sendPreAuthIntro(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  firstName: string,
  pendingStartArg?: string
) {
  if (pendingStartArg) {
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'PENDING_CONTACT_KYC', pendingStartArg } satisfies TelegramStepState), user.id)
      .run()
      .catch(() => {});
  }
  await bot.sendMessage(chatId, preAuthIntroMessage(firstName), {
    replyKeyboard: contactVerificationKeyboard(),
  });
}

async function applyReferralIfPresent(env: Env, userId: string, rawPayload?: string | null, phoneNumber?: string | null) {
  if (!rawPayload) return;
  const match = rawPayload.match(/(?:REF_|DLR-)([A-Za-z0-9_-]+)/i);
  if (!match) return;
  const extracted = rawPayload.toUpperCase().includes('DLR-')
    ? rawPayload.toUpperCase().match(/DLR-[A-Z0-9]+/)?.[0] || ''
    : rawPayload.replace(/^.*REF_/i, '').trim().toUpperCase();
  if (!extracted) return;

  const existingRef = await env.DB.prepare(`SELECT id FROM referrals WHERE referred_user_id = ? LIMIT 1`).bind(userId).first();
  if (existingRef) return;

  const referrer = await env.DB.prepare(
    `SELECT id FROM users WHERE COALESCE(referral_code, 'DLR-' || UPPER(SUBSTR(id, -6))) = ? OR ('DLR-' || UPPER(SUBSTR(id, -6))) = ? LIMIT 1`
  )
    .bind(extracted, extracted)
    .first<{ id: string }>()
    .catch(() => null);
  if (!referrer?.id || referrer.id === userId) return;

  let fraudFlag = 0;
  let fraudReason: string | null = null;
  if (phoneNumber) {
    const dupPhone = await env.DB.prepare(`SELECT id FROM users WHERE phone_number = ? AND id != ? LIMIT 1`)
      .bind(phoneNumber, userId)
      .first();
    if (dupPhone) {
      fraudFlag = 1;
      fraudReason = 'شماره تماس تکراری روی اکانت دیگر';
    }
  }
  await env.DB.prepare(`UPDATE users SET referred_by = COALESCE(referred_by, ?) WHERE id = ?`).bind(extracted, userId).run().catch(() => {});
  await env.DB.prepare(
    `INSERT OR IGNORE INTO referrals (id, referrer_user_id, referred_user_id, referral_code, reward_days, status, fraud_flag, fraud_reason)
     VALUES (?, ?, ?, ?, 7, ?, ?, ?)`
  )
    .bind(randomId('ref'), referrer.id, userId, extracted, fraudFlag ? 'FLAGGED_DUPLICATE' : 'REGISTERED', fraudFlag, fraudReason)
    .run()
    .catch(() => {});
}

async function showTrustWalletMenu(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  webAppUrl: string,
  editMsgId?: number,
  includeLiveBalances = false
) {
  const [bep20Recv, trc20Recv, dexPref, walletEnabled] = await Promise.all([
    getSystemSetting(env.DB, 'trust_wallet_evm_receiver', 'تنظیم‌نشده توسط ادمین'),
    getSystemSetting(env.DB, 'usdt_trc20_wallet', 'تنظیم‌نشده توسط ادمین'),
    getSystemSetting(env.DB, 'trust_wallet_default_dex', 'pancakeswap'),
    getSystemSetting(env.DB, 'trust_wallet_dapp_enabled', 'true'),
  ]);

  let balLines = '';
  if (includeLiveBalances) {
    const parts: string[] = [];
    if (user.trust_wallet_address) {
      const [bnb, usdtBep20, eth] = await Promise.all([
        fetchEvmNativeBalance('https://bsc-dataseed.binance.org', user.trust_wallet_address),
        fetchBscUsdtBalance(user.trust_wallet_address),
        fetchEvmNativeBalance('https://ethereum-rpc.publicnode.com', user.trust_wallet_address),
      ]);
      parts.push(
        `• موجودی BSC: ${bnb !== null ? bnb.toFixed(4) : '—'} BNB | ${usdtBep20 !== null ? usdtBep20.toFixed(2) : '—'} USDT (BEP20)`
      );
      parts.push(`• موجودی ETH: ${eth !== null ? eth.toFixed(4) : '—'} ETH`);
    }
    if (user.trust_wallet_solana) {
      const sol = await fetchSolanaBalance(user.trust_wallet_solana);
      if (sol !== null) parts.push(`• موجودی Solana: ${sol.toFixed(4)} SOL`);
    }
    if (user.trust_wallet_ton) {
      const ton = await fetchTonBalance(user.trust_wallet_ton);
      if (ton !== null) parts.push(`• موجودی TON: ${ton.toFixed(4)} TON`);
    }
    if (user.trust_wallet_tron) {
      const tr = await fetchTronBalances(user.trust_wallet_tron);
      if (tr) parts.push(`• موجودی TRON: ${tr.trx.toFixed(2)} TRX | ${tr.usdt.toFixed(2)} USDT (TRC20)`);
    }
    if (parts.length) {
      balLines = `\n💰 **استعلام لحظه‌ای آن‌چین:**\n${parts.join('\n')}\n`;
    }
  }

  const twDappDeepLink = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(
    `${webAppUrl.startsWith('https://') ? webAppUrl : 'https://dollarino.pages.dev'}/?tab=trustwallet`
  )}`;

  const msgText =
    `🦊 **هسته مرکزی چندزنجیره‌ای Trust Wallet و رادار DEX**\n` +
    `وضعیت سرویس DApp: ${walletEnabled === 'true' ? '🟢 فعال' : '🔴 غیرفعال'}\n\n` +
    `🔐 **کیف‌پول‌های متصل شما (پوشش همه شبکه‌ها):**\n` +
    `• شبکه EVM (ETH / BSC / Base / Arbitrum / Polygon / AVAX): \`${user.trust_wallet_address || 'ثبت‌نشده'}\`\n` +
    `• شبکه Solana (SPL): \`${user.trust_wallet_solana || 'ثبت‌نشده'}\`\n` +
    `• شبکه TON (Jetton / تلگرام): \`${user.trust_wallet_ton || 'ثبت‌نشده'}\`\n` +
    `• شبکه TRON (TRC20): \`${user.trust_wallet_tron || 'ثبت‌نشده'}\`\n` +
    balLines +
    `\n📡 **ترید مستقیم روی همه شبکه‌ها (بدون نیاز به صرافی متمرکز):**\n` +
    `با دکمه‌های زیر می‌توانید توکن‌های **DexScreener** را روی هر شبکه از طریق مرورگر DApp در Trust Wallet (${dexPref}) سوآپ کنید یا اشتراک خود را بپردازید.\n` +
    `\n🏦 آدرس دریافت پلتفرم BEP20: \`${bep20Recv}\`\n` +
    `🏦 آدرس دریافت پلتفرم TRC20: \`${trc20Recv}\``;

  const kb: InlineKeyboardButton[][] = [
    [{ text: '🌐 باز کردن دلارینو در مرورگر Trust Wallet', url: twDappDeepLink, style: 'success' }],
    [
      { text: '✏️ آدرس EVM (0x)', callback_data: 'tg_tw_set:evm', style: 'primary' },
      { text: '✏️ آدرس Solana', callback_data: 'tg_tw_set:solana' },
    ],
    [
      { text: '✏️ آدرس TON', callback_data: 'tg_tw_set:ton' },
      { text: '✏️ آدرس TRON (T...)', callback_data: 'tg_tw_set:tron' },
    ],
    [
      { text: '💰 استعلام موجودی همه شبکه‌ها', callback_data: 'tg_tw_bal', style: 'success' },
      { text: '🔍 اسکن توکن داغ DexScreener', callback_data: 'tg_dex_trending', style: 'primary' },
    ],
    [{ text: '💳 پرداخت اشتراک با تراست‌ولت', callback_data: 'tg_open_sub' }],
    [{ text: '🔙 بازگشت به منوی سریع', callback_data: 'tg_acc:trust' }],
  ];

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, msgText, kb).catch(() => bot.sendMessage(chatId, msgText, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, msgText, { inlineKeyboard: kb });
  }
}

function formatUsdCompact(n?: number | null): string {
  const val = Number(n ?? 0);
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

async function showDexTrendingMenu(
  bot: TelegramBotClient,
  chatId: string | number,
  customTokens?: DexTokenEnriched[],
  queryLabel?: string,
  editMsgId?: number
) {
  let tokens: DexTokenEnriched[] = customTokens || [];
  if (!customTokens) {
    const overview = await fetchDexTrendingOverview().catch(() => ({ pairs: [] as DexTokenEnriched[], metas: [] }));
    tokens = overview.pairs;
  }
  const top = tokens.slice(0, 6);
  if (!top.length) {
    const emptyMsg = queryLabel
      ? `🔍 هیچ جفت‌ارزی برای «${queryLabel}» در DexScreener پیدا نشد.\nنام توکن یا آدرس کانترکت (Contract Address) را دوباره ارسال کنید.`
      : '⚠️ دریافت اطلاعات لحظه‌ای از DexScreener با تاخیر موقت روبرو شد. چند ثانیه دیگر دوباره تلاش کنید.';
    const kb: InlineKeyboardButton[][] = [
      [{ text: '🔎 جستجوی توکن دیگر', callback_data: 'tg_dex_search', style: 'primary' }],
      [{ text: '🔄 تلاش مجدد داغ‌ترین‌ها', callback_data: 'tg_dex_trending' }],
    ];
    if (editMsgId) await bot.editMessageText(chatId, editMsgId, emptyMsg, kb).catch(() => bot.sendMessage(chatId, emptyMsg, { inlineKeyboard: kb }));
    else await bot.sendMessage(chatId, emptyMsg, { inlineKeyboard: kb });
    return;
  }

  const lines = top.map((t, idx) => {
    const price = t.priceUsd ? `$${Number(t.priceUsd) < 0.01 ? Number(t.priceUsd).toPrecision(4) : Number(t.priceUsd).toFixed(4)}` : '—';
    const chg24 = Number(t.priceChange?.h24 ?? 0);
    const chgSign = chg24 >= 0 ? '🟢 +' : '🔴 ';
    const cexBadge = t.isOnCentralizedHint ? '🏦 در صرافی‌ها هم هست' : '🆕 ویژه DEX (ناموجود در Toobit/KCEX)';
    const safetyBadge = t.safetyScore >= 70 ? '🛡 ایمن' : t.safetyScore >= 45 ? '⚠️ متوسط' : '🚨 پرریسک';
    return (
      `${idx + 1}. **${t.baseToken.symbol}** (${t.chainId.toUpperCase()} · ${t.dexId})\n` +
      `   قیمت: ${price} | ۲۴س: ${chgSign}${chg24.toFixed(1)}%\n` +
      `   نقدینگی: ${formatUsdCompact(t.liquidity?.usd)} | حجم۲۴س: ${formatUsdCompact(t.volume?.h24)} | ${safetyBadge} (${t.safetyScore}/100)\n` +
      `   ${cexBadge}`
    );
  });

  const kb: InlineKeyboardButton[][] = [];
  for (const t of top.slice(0, 4)) {
    kb.push([
      { text: `🦊 سوآپ ${t.baseToken.symbol} در Trust Wallet`, url: t.trustWallet.trustWalletDappUrl, style: 'success' },
      { text: `📊 چارت ${t.baseToken.symbol}`, url: t.trustWallet.dexScreenerUrl, style: 'primary' },
    ]);
  }
  kb.push([
    { text: '🔎 جستجوی توکن با اسم/کانترکت', callback_data: 'tg_dex_search', style: 'primary' },
    { text: '🔄 بروزرسانی لحظه‌ای', callback_data: 'tg_dex_trending' },
  ]);
  kb.push([{ text: '🦊 مدیریت کیف‌پول Trust Wallet', callback_data: 'tg_tw_menu' }]);

  const title = queryLabel
    ? `🔎 **نتایج رادار DexScreener برای «${queryLabel}»**\n`
    : `🔍 **توکن‌های داغ و ترند زنده DexScreener**\n(مناسب کشف ارزهایی که هنوز در Toobit/KCEX لیست نشده‌اند)\n`;

  const fullText = `${title}\n${lines.join('\n\n')}`;
  if (editMsgId) await bot.editMessageText(chatId, editMsgId, fullText, kb).catch(() => bot.sendMessage(chatId, fullText, { inlineKeyboard: kb }));
  else await bot.sendMessage(chatId, fullText, { inlineKeyboard: kb });
}

async function showSimpleWizardStep(
  bot: TelegramBotClient,
  chatId: string | number,
  stepNum: 1 | 2 | 3 | 4,
  state?: TelegramStepState,
  editMsgId?: number
) {
  let msg = '';
  let kb: InlineKeyboardButton[][] = [];

  if (stepNum === 1) {
    msg =
      `🚀 **راه‌اندازی گام‌به‌گام ربات (مرحله ۱ از ۴ — میزان سرمایه در هر معامله)**\n\n` +
      `در هر سیگنال، ربات چه درصدی از موجودی آزاد شما را وارد معامله کند؟ (توصیه برای شروع امن: ۵٪ یا ۱۰٪)`;
    kb = [
      [
        { text: '🛡 ۵٪ سرمایه (بسیار ایمن)', callback_data: 'tg_wiz_m:5', style: 'success' },
        { text: '⚖️ ۱۰٪ سرمایه (متعادل)', callback_data: 'tg_wiz_m:10', style: 'primary' },
      ],
      [{ text: '🔥 ۲۰٪ سرمایه (تهاجمی)', callback_data: 'tg_wiz_m:20' }],
      [{ text: '🔙 انصراف', callback_data: 'tg_acc:none' }],
    ];
  } else if (stepNum === 2) {
    msg =
      `🚀 **مرحله ۲ از ۴ — سطح ریسک و اهرم (Leverage)**\n` +
      `• مارجین انتخابی شما: ${state?.wizMarginPct ?? 10}%\n\n` +
      `میزان اهرم معاملاتی خود را انتخاب کنید:`;
    kb = [
      [
        { text: '🟢 کم‌ریسک (3x)', callback_data: 'tg_wiz_l:3', style: 'success' },
        { text: '🟡 متعادل (10x)', callback_data: 'tg_wiz_l:10', style: 'primary' },
      ],
      [{ text: '🔴 حرفه‌ای (20x)', callback_data: 'tg_wiz_l:20' }],
      [{ text: '⬅️ بازگشت به مرحله ۱', callback_data: 'tg_simple_wizard:1' }],
    ];
  } else if (stepNum === 3) {
    msg =
      `🚀 **مرحله ۳ از ۴ — انتخاب مغز متفکر (۴ موتور دلارینو)**\n` +
      `• مارجین: ${state?.wizMarginPct ?? 10}% | اهرم: ${state?.wizLev ?? 10}x\n\n` +
      `کدام موتور سیگنال‌ها را برای شما پیدا و مدیریت کند؟`;
    kb = [
      [{ text: '🧠 موتور ۱: هوش مصنوعی خودکار دلارینو', callback_data: 'tg_wiz_e:ai_autonomous_agent', style: 'success' }],
      [{ text: '🤖 موتور ۲: هوش مصنوعی شخصی من', callback_data: 'tg_wiz_e:my_custom_ai', style: 'primary' }],
      [{ text: '🎯 موتور ۳: استراتژی شکار دُرنا V1', callback_data: 'tg_wiz_e:dollarino_v01', style: 'primary' }],
      [{ text: '🏆 موتور ۴: کپی‌ترید تاییدشده', callback_data: 'tg_wiz_e:copy_trade', style: 'success' }],
      [{ text: '⬅️ بازگشت به مرحله ۲', callback_data: 'tg_simple_wizard:2' }],
    ];
  } else {
    const engineName = resolveEngineDisplayLabel(state?.wizEngine || 'ai_autonomous_agent');
    msg =
      `🚀 **مرحله ۴ از ۴ — مسیر اجرا و شروع ترید**\n` +
      `• سرمایه در هر معامله: ${state?.wizMarginPct ?? 10}%\n` +
      `• حداکثر اهرم: ${state?.wizLev ?? 10}x\n` +
      `• موتور انتخاب‌شده: ${engineName}\n\n` +
      `حساب معاملاتی مقصد را انتخاب کنید یا همین حالا ربات را روشن کنید:`;
    kb = [
      [{ text: '🟢 تایید و شروع فوری ربات اتومات', callback_data: 'tg_wiz_go:auto', style: 'success' }],
      [
        { text: '🦊 اتصال Trust Wallet و DEX', callback_data: 'tg_tw_menu', style: 'primary' },
        { text: '🧪 اجرای آزمایشی (Paper)', callback_data: 'tg_wiz_go:paper' },
      ],
      [{ text: '⬅️ بازگشت به مرحله ۳', callback_data: 'tg_simple_wizard:3' }],
    ];
  }

  if (editMsgId) await bot.editMessageText(chatId, editMsgId, msg, kb).catch(() => bot.sendMessage(chatId, msg, { inlineKeyboard: kb }));
  else await bot.sendMessage(chatId, msg, { inlineKeyboard: kb });
}

async function showExtensionWidgetsMenu(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  webAppUrl: string,
  editMsgId?: number,
  rotate = false
) {
  let extKey = user.extension_api_key || '';
  if (!extKey || rotate) {
    extKey = `dlr_ext_${randomId('').replace(/_/g, '')}${Math.random().toString(36).slice(2, 10)}`;
    await env.DB.prepare(`UPDATE users SET extension_api_key = ? WHERE id = ?`).bind(extKey, user.id).run();
    user.extension_api_key = extKey;
  }
  const base = webAppUrl.startsWith('https://') ? webAppUrl : 'https://dollarino.pages.dev';
  const msg =
    `🧩 **اکستنشن مرورگر و ویجت‌های سریع موبایل دلارینو**\n\n` +
    `🔑 **کلید اتصال امن اکستنشن کروم/اج شما:**\n` +
    `\`${extKey}\`\n` +
    `(این کلید را در افزونه Dollarino Companion وارد کنید تا ربات را از هر تب مرورگر روشن/خاموش کنید، توکن‌های داغ DexScreener را ببینید و Kill Switch بزنید.)\n\n` +
    `📱 **لینک ویجت‌های سریع موبایل (PWA Add to Home Screen):**\n` +
    `• کنترل سریع روشن/خاموش ربات: ${base}/?quick=bot-toggle\n` +
    `• گزارش لحظه‌ای سود و موجودی: ${base}/?quick=report\n` +
    `• رادار توکن داغ DexScreener: ${base}/?quick=dex\n` +
    `• دکمه توقف اضطراری (Kill Switch): ${base}/?quick=kill-switch`;

  const kb: InlineKeyboardButton[][] = [
    [{ text: '🔄 تولید کلید جدید اکستنشن', callback_data: 'tg_ext_rotate', style: 'primary' }],
    ...(webAppUrl.startsWith('https://')
      ? [
          [{ text: '📱 باز کردن داشبورد ویجت‌های موبایل', web_app: { url: `${base}/?quick=bot-toggle` }, style: 'success' as const }],
          [{ text: '📦 دانلود فایل اکستنشن کروم (ZIP)', url: `${base}/downloads/dollarino-extension.zip` }],
        ]
      : []),
    [{ text: '🔙 بازگشت به منوی سریع', callback_data: 'tg_acc:tools' }],
  ];

  if (editMsgId) await bot.editMessageText(chatId, editMsgId, msg, kb).catch(() => bot.sendMessage(chatId, msg, { inlineKeyboard: kb }));
  else await bot.sendMessage(chatId, msg, { inlineKeyboard: kb });
}

async function showSubscriptionMenu(env: Env, bot: TelegramBotClient, chatId: string | number, user: ProvisionedUserRow, tgId: string, editMsgId?: number) {
  const [plans, ent, rateStr] = await Promise.all([
    env.DB.prepare(
      `SELECT code, name_fa, price_usd, duration_days FROM subscription_plans WHERE is_active = 1 AND price_usd > 0 ORDER BY sort_order ASC`
    ).all<{ code: string; name_fa: string; price_usd: number; duration_days: number }>().catch(() => ({ results: [] })),
    resolveUserEntitlement(env.DB, {
      id: user.id,
      email: user.email,
      username: user.username,
      role: (user.role as AuthUser['role']) || 'user',
      telegramId: tgId,
    }),
    getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000'),
  ]);

  const rate = Number(rateStr) || 70000;
  const planRows = plans.results.length
    ? plans.results
    : [
        { code: 'pro_monthly', name_fa: 'اشتراک ماهانه', price_usd: 20, duration_days: 30 },
        { code: 'vip_quarterly', name_fa: 'اشتراک ۳ ماهه', price_usd: 50, duration_days: 90 },
        { code: 'pro_semiannual', name_fa: 'اشتراک ۶ ماهه', price_usd: 90, duration_days: 180 },
        { code: 'pro_annual', name_fa: 'اشتراک سالانه', price_usd: 160, duration_days: 365 },
      ];

  const text =
    `💎 خرید اشتراک ویژه دلارینو\n\n` +
    `وضعیت فعلی شما: ${ent.planNameFa}${ent.hasPaidPlan ? ` (${ent.daysRemaining} روز باقیمانده)` : ''}\n` +
    `کیف پول شما: ${Number(user.wallet_balance_usdt ?? 0).toFixed(2)} USDT\n\n` +
    `📦 تعرفه‌های فعال:\n` +
    planRows.map((p) => `• ${p.name_fa}: ${p.price_usd} USDT (${formatToman(p.price_usd, rate)} تومان) — ${p.duration_days} روز`).join('\n') +
    `\n\nپلن مورد نظر را برای دریافت فاکتور TRC20 یا پرداخت با کیف پول انتخاب کنید:`;

  const kb: InlineKeyboardButton[][] = [
    planRows.slice(0, 2).map((p) => ({ text: `${p.name_fa} (${p.price_usd}$)`, callback_data: `sub_buy:${p.code}`, style: 'success' as const })),
    ...(planRows.length > 2
      ? [planRows.slice(2, 4).map((p) => ({ text: `${p.name_fa} (${p.price_usd}$)`, callback_data: `sub_buy:${p.code}`, style: 'primary' as const }))]
      : []),
    [{ text: '🎁 اعمال کد هدیه / تخفیف', callback_data: 'sub_gift' }],
  ];

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showTradeQuantitiesMenu(env: Env, bot: TelegramBotClient, chatId: string | number, userId: string, editMsgId?: number) {
  const cfg = await env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(userId).first<UserBotConfigRow>();
  const text =
    `🪛 تنظیم مقادیر معاملات و مدیریت سرمایه\n\n` +
    `• 💰 درصد مارجین هر معامله: ${cfg?.margin_pct ?? 10}%\n` +
    `• ⚡ نوع ورود پیش‌فرض: Market (اجرای لحظه‌ای)\n` +
    `• 🔘 حداکثر لوریج مجاز: ${cfg?.max_leverage ?? 20}x (${cfg?.use_signal_leverage ? 'طبق لوریج سیگنال' : 'سقف ثابت'})\n` +
    `• 🎯 تقسیم تارگت‌ها: TP1=${cfg?.tp1_close_pct ?? 50}% | TP2=${cfg?.tp2_close_pct ?? 25}% | TP3=${cfg?.tp3_close_pct ?? 25}%\n` +
    `• 🛡 ریسک‌فری خودکار TP1 (SL→Entry): ${cfg?.auto_breakeven_on_tp1 ? '✅ فعال' : '❌ غیرفعال'}\n` +
    `• 🛡 انتقال SL به TP1 روی TP2: ${cfg?.move_sl_to_tp1_on_tp2 ? '✅ فعال' : '❌ غیرفعال'}\n` +
    `• 📡 کانال سیگنال متصل: ${cfg?.signal_channel_handle ?? '@Dollarino_official'}`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: `💰 تغییر مارجین (${cfg?.margin_pct ?? 10}%)`, callback_data: 'cfg_edit:margin_pct' },
      { text: `🔘 حداکثر لوریج (${cfg?.max_leverage ?? 20}x)`, callback_data: 'cfg_edit:max_leverage' },
    ],
    [{ text: `🎯 تنظیم درصد TP1 / TP2 / TP3`, callback_data: 'cfg_tp_menu' }],
    [{ text: `📡 کانال سیگنال (${cfg?.signal_channel_handle ?? '@Dollarino_official'})`, callback_data: 'cfg_edit:signal_channel_handle' }],
    [
      { text: `🛡 ریسک‌فری TP1 (${cfg?.auto_breakeven_on_tp1 ? '✅' : '❌'})`, callback_data: 'cfg_toggle:be_tp1' },
      { text: `🛡 SL→TP1 در TP2 (${cfg?.move_sl_to_tp1_on_tp2 ? '✅' : '❌'})`, callback_data: 'cfg_toggle:sl_tp2' },
    ],
  ];

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

export async function handleTelegramUpdate(env: Env, botToken: string, update: TelegramUpdate) {
  const bot = new TelegramBotClient(botToken);
  const webAppUrl = (env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');

  // 1. Handle Channel Posts containing Dollarino Signals (Official origin validation, no forwards)
  if (update.channel_post?.text) {
    const post = update.channel_post;
    if (post.forward_date || post.forward_from || post.forward_from_chat) {
      return { ok: true, ignored: 'forwarded signal rejected' };
    }
    const chatIdStr = String(post.chat.id);
    const chatUser = (post.chat.username || '').toLowerCase();
    const defaultHandle = (env.DEFAULT_SIGNAL_CHANNEL || '@Dollarino_official').replace(/^@/, '').toLowerCase();
    const isOfficial =
      chatIdStr === '-1002263982097' ||
      chatUser === 'dollarino_official' ||
      chatUser === 'dollarinoofficial' ||
      chatUser === defaultHandle;

    if (!isOfficial) {
      const configuredBotChannel = await env.DB.prepare(
        `SELECT id FROM telegram_bots WHERE is_active = 1 AND (LOWER(REPLACE(COALESCE(signal_channel_id, ''), '@', '')) = ? OR signal_channel_id = ?) LIMIT 1`
      ).bind(chatUser || '__none__', chatIdStr).first<{ id: string }>();
      if (!configuredBotChannel) {
        return { ok: true, ignored: 'unauthorized signal channel' };
      }
    }

    const signal = parseDollarinoSignal(update.channel_post.text);
    if (!signal) return { ok: true, ignored: 'not a signal' };

    const sigId = randomId('sig');
    const engineLabel = signal.engineLabel || resolveEngineDisplayLabel(signal.engineKey, '📡 کانال رسمی دلارینو');
    await env.DB.prepare(
      `INSERT INTO signals (id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, sl_pct, tp1_pct, tp2_pct, tp3_pct, raw_text, status, engine_source, engine_label, channel_message_id, channel_chat_id)
       VALUES (?, 'telegram_channel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?)`
    ).bind(
      sigId,
      signal.symbol,
      signal.direction,
      signal.timeframe,
      signal.price,
      signal.stopLoss,
      signal.leverage,
      signal.tp1,
      signal.tp2 ?? null,
      signal.tp3 ?? null,
      signal.slPct ?? null,
      signal.tp1Pct ?? null,
      signal.tp2Pct ?? null,
      signal.tp3Pct ?? null,
      formatDollarinoSignal({ ...signal, engineLabel }),
      signal.engineKey || 'telegram_channel',
      engineLabel,
      post.message_id,
      chatIdStr
    ).run();

    const cfg = await resolveChannelAndBotConfig(env);
    const users = await env.DB.prepare(
      `SELECT u.id, u.email, u.username, u.role, u.telegram_id, bc.trade_execution_mode, bc.bot_state
       FROM users u JOIN bot_configs bc ON u.id = bc.user_id
       WHERE u.telegram_id IS NOT NULL AND u.is_blocked = 0`
    ).all<{
      id: string;
      email: string;
      username: string;
      role: AuthUser['role'];
      telegram_id: string;
      trade_execution_mode: 'AUTO' | 'MANUAL_CONFIRM';
      bot_state: string;
    }>();

    for (const u of users.results) {
      const ent = await resolveUserEntitlement(env.DB, {
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        telegramId: u.telegram_id,
      });
      if (!ent.allowCopyTrade) {
        continue;
      }
      if (u.trade_execution_mode === 'AUTO' && (u.bot_state === 'RUNNING_PAPER' || u.bot_state === 'RUNNING_LIVE')) {
        await executeSignalForUser(env, u.id, signal, { signalId: sigId }).catch(() => {});
      } else {
        await bot.sendMessage(u.telegram_id, formatDollarinoSignal({ ...signal, engineLabel }), {
          inlineKeyboard: channelSignalInlineButtons({
            signalId: sigId,
            botUsername: cfg.botUsername,
            webAppUrl: cfg.webAppUrl,
            forChannel: false,
          }),
        }).catch(() => {});
      }
    }
    return { ok: true, signalId: sigId };
  }

  const privateAdminOnly = (await getSystemSetting(env.DB, 'bot_private_admin_only', 'false')) === 'true';

  // 2. Handle Inline Callback Queries
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id ?? cq.from.id;
    const msgId = cq.message?.message_id;
    const data = cq.data ?? '';
    const tgId = String(cq.from.id);
    const user = await getOrProvisionTelegramUser(env, cq.from);
    const admin = isUserAdmin(tgId, user.role, env);

    if (user.is_blocked || (privateAdminOnly && !admin)) {
      await bot.answerCallbackQuery(cq.id, '⛔️ دسترسی محدود شده یا ربات در حالت خصوصی ادمین است.', true);
      return { ok: true };
    }

    // Hard Phone-KYC Gate on all callbacks before account verification (no extra buttons before KYC)
    if (await isPhoneKycRequiredForUser(env, user, tgId)) {
      await bot.answerCallbackQuery(cq.id, '🔐 ابتدا شماره تماس اکانت خود را از دکمه پایین به اشتراک بگذارید.', true);
      await sendPreAuthIntro(env, bot, chatId, user, cq.from.first_name || user.username);
      return { ok: true };
    }

    if (data.startsWith('adm:')) {
      if (!admin) {
        await bot.answerCallbackQuery(cq.id, '⛔️ دسترسی مدیریتی ندارید.', true);
        return { ok: true };
      }
      await handleAdminCallback(env, bot, buildAdminActor(user, tgId, env), cq.id, chatId, msgId, data);
      return { ok: true };
    }

    if (data === 'tg_web_login') {
      await bot.answerCallbackQuery(cq.id, 'لینک ورود سریع ساخته شد 🌐');
      await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
      return { ok: true };
    }

    if (data === 'tg_account') {
      await bot.answerCallbackQuery(cq.id);
      await showAccountCard(env, bot, chatId, user, tgId, webAppUrl);
      return { ok: true };
    }

    if (data === 'sub_menu') {
      await bot.answerCallbackQuery(cq.id);
      await showSubscriptionMenu(env, bot, chatId, user, tgId, msgId);
      return { ok: true };
    }

    if (data === 'sub_gift') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_GIFT_CODE' } satisfies TelegramStepState), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(chatId, '🎁 کد هدیه یا تخفیف خود را وارد کنید (مثلاً VIP1405):');
      return { ok: true };
    }

    if (data === 'sub_topup') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_TOPUP_AMOUNT' } satisfies TelegramStepState), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(chatId, '💰 مبلغ افزایش موجودی کیف پول را به تتر (USDT) وارد کنید (مثلاً 20):');
      return { ok: true };
    }

    if (data.startsWith('sub_buy:')) {
      const planCode = data.slice('sub_buy:'.length);
      const [plan, walletAddr, rateStr] = await Promise.all([
        env.DB.prepare(`SELECT code, name_fa, price_usd, duration_days FROM subscription_plans WHERE code = ?`)
          .bind(planCode).first<{ code: string; name_fa: string; price_usd: number; duration_days: number }>(),
        getSystemSetting(env.DB, 'usdt_trc20_wallet', 'TYourTRC20WalletAddressHere'),
        getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000'),
      ]);
      if (!plan) {
        await bot.answerCallbackQuery(cq.id, 'پلن یافت نشد', true);
        return { ok: true };
      }
      const subId = randomId('sub');
      await env.DB.prepare(
        `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, amount_usd, payer_note)
         VALUES (?, ?, ?, 'PENDING_REVIEW', 'USDT_TRC20', ?, 'Requested via Telegram Bot')`
      ).bind(subId, user.id, plan.code, plan.price_usd).run();

      const rate = Number(rateStr) || 70000;
      const canWalletPay = Number(user.wallet_balance_usdt ?? 0) >= plan.price_usd;
      const bep20Addr = await getSystemSetting(env.DB, 'trust_wallet_evm_receiver', '');
      const text =
        `🧾 فاکتور خرید ${plan.name_fa}\n\n` +
        `🔢 شماره فاکتور: ${subId}\n` +
        `💵 مبلغ قابل پرداخت: ${plan.price_usd} USDT (${formatToman(plan.price_usd, rate)} تومان)\n` +
        `⏳ مدت اعتبار: ${plan.duration_days} روز\n\n` +
        `💳 آدرس دریافت USDT (شبکه TRC20):\n\`${walletAddr}\`\n` +
        (bep20Addr ? `🦊 آدرس دریافت USDT در Trust Wallet (شبکه BEP20):\n\`${bep20Addr}\`\n` : '') +
        `\nپس از انتقال وجه، روی «✅ بررسی پرداخت» بزنید تا کد پیگیری (TXID) ثبت و اشتراک با تایید خودکار بلاکچینی فعال شود:`;

      const twPayDeepLink = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(
        `${webAppUrl.startsWith('https://') ? webAppUrl : 'https://dollarino.pages.dev'}/subscription`
      )}`;
      const kb: InlineKeyboardButton[][] = [
        [
          { text: '✅ بررسی پرداخت / ثبت TXID', callback_data: `sub_verify:${subId}`, style: 'success' },
          { text: '❌ انصراف', callback_data: `sub_cancel:${subId}`, style: 'danger' },
        ],
        [{ text: '🦊 پرداخت سریع با Trust Wallet DApp', url: twPayDeepLink, style: 'primary' }],
        ...(canWalletPay ? [[{ text: `💰 پرداخت فوری از کیف پول (${plan.price_usd}$)`, callback_data: `sub_pay_wallet:${subId}` }]] : []),
        [{ text: '🎁 اعمال کد هدیه', callback_data: 'sub_gift' }],
      ];
      if (msgId) await bot.editMessageText(chatId, msgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
      await bot.answerCallbackQuery(cq.id);
      return { ok: true };
    }

    if (data.startsWith('sub_pay_wallet:')) {
      const subId = data.slice('sub_pay_wallet:'.length);
      const sub = await env.DB.prepare(
        `SELECT s.id, s.plan_code, s.amount_usd, p.duration_days, p.name_fa FROM user_subscriptions s LEFT JOIN subscription_plans p ON p.code = s.plan_code WHERE s.id = ? AND s.user_id = ? AND s.status = 'PENDING_REVIEW'`
      ).bind(subId, user.id).first<{ id: string; plan_code: string; amount_usd: number; duration_days?: number; name_fa?: string }>();
      if (!sub || Number(user.wallet_balance_usdt ?? 0) < sub.amount_usd) {
        await bot.answerCallbackQuery(cq.id, 'موجودی کیف پول کافی نیست!', true);
        return { ok: true };
      }
      const days = sub.duration_days ?? 30;
      await env.DB.prepare(`UPDATE users SET wallet_balance_usdt = wallet_balance_usdt - ? WHERE id = ?`)
        .bind(sub.amount_usd, user.id).run();
      await env.DB.prepare(
        `UPDATE user_subscriptions SET status = 'ACTIVE', payment_method = 'WALLET_USDT', started_at = datetime('now'), expires_at = datetime('now', '+' || ? || ' days'), admin_note = 'Paid via wallet balance' WHERE id = ?`
      ).bind(days, sub.id).run();

      await bot.answerCallbackQuery(cq.id, 'اشتراک فعال شد ✅');
      if (msgId) {
        await bot.editMessageText(chatId, msgId, `🎉 پرداخت با موجودی کیف پول انجام شد!\n\n✅ اشتراک ${sub.name_fa || sub.plan_code} به مدت ${days} روز فعال گردید.`);
      }
      return { ok: true };
    }

    if (data.startsWith('sub_verify:')) {
      const subId = data.slice('sub_verify:'.length);
      const sub = await env.DB.prepare(`SELECT id, status, amount_usd, plan_code FROM user_subscriptions WHERE id = ? AND user_id = ?`)
        .bind(subId, user.id).first<{ id: string; status: string; amount_usd: number; plan_code: string }>();
      if (!sub) {
        await bot.answerCallbackQuery(cq.id, 'فاکتور یافت نشد', true);
        return { ok: true };
      }
      if (sub.status === 'ACTIVE') {
        await bot.answerCallbackQuery(cq.id, 'این اشتراک هم‌اکنون فعال شده است ✅', true);
        if (msgId) await bot.editMessageText(chatId, msgId, '🎉 اشتراک شما هم‌اکنون فعال است!').catch(() => {});
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_PAYMENT_TXID', subId: sub.id } satisfies TelegramStepState), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(
        chatId,
        `🔗 لطفاً **عکس رسید واریز** یا **کد پیگیری / هش تراکنش (TXID)** مربوط به فاکتور #${sub.id} (مبلغ ${sub.amount_usd} USDT) را همین‌جا ارسال کنید:`
      );
      return { ok: true };
    }

    if (data.startsWith('sub_cancel:')) {
      const subId = data.slice('sub_cancel:'.length);
      await env.DB.prepare(`UPDATE user_subscriptions SET status = 'REJECTED', admin_note = 'Cancelled by user' WHERE id = ? AND user_id = ? AND status = 'PENDING_REVIEW'`)
        .bind(subId, user.id).run();
      await bot.answerCallbackQuery(cq.id, 'سفارش لغو شد');
      if (msgId) await bot.editMessageText(chatId, msgId, `❌ فاکتور #${subId} لغو گردید.`).catch(() => {});
      return { ok: true };
    }

    // Trade Quantities Menu Callbacks
    if (data === 'cfg_qty_menu') {
      await bot.answerCallbackQuery(cq.id);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id, msgId);
      return { ok: true };
    }

    if (data === 'cfg_tp_menu') {
      await bot.answerCallbackQuery(cq.id);
      const kb: InlineKeyboardButton[][] = [
        [
          { text: '🎯 ۵۰% / ۲۵% / ۲۵% (پیش‌فرض)', callback_data: 'cfg_tp_set:50:25:25' },
          { text: '🎯 ۴۰% / ۳۰% / ۳۰%', callback_data: 'cfg_tp_set:40:30:30' },
        ],
        [
          { text: '🎯 ۳۰% / ۳۰% / ۴۰%', callback_data: 'cfg_tp_set:30:30:40' },
          { text: '✏️ ورود دستی درصدها', callback_data: 'cfg_edit:tp_custom' },
        ],
        [{ text: '🔙 بازگشت به مقادیر معامله', callback_data: 'cfg_qty_menu' }],
      ];
      if (msgId) await bot.editMessageText(chatId, msgId, '🎯 نحوه تقسیم حجم خروج در ۳ تارگت (مجموع = ۱۰۰٪) را انتخاب کنید:', kb);
      return { ok: true };
    }

    if (data.startsWith('cfg_tp_set:')) {
      const [, a, b, c] = data.split(':');
      await env.DB.prepare(`UPDATE bot_configs SET tp1_close_pct = ?, tp2_close_pct = ?, tp3_close_pct = ? WHERE user_id = ?`)
        .bind(Number(a), Number(b), Number(c), user.id).run();
      await bot.answerCallbackQuery(cq.id, `تنظیم شد: ${a}% / ${b}% / ${c}%`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id, msgId);
      return { ok: true };
    }

    if (data.startsWith('cfg_toggle:')) {
      const which = data.split(':')[1];
      if (which === 'be_tp1') {
        await env.DB.prepare(`UPDATE bot_configs SET auto_breakeven_on_tp1 = CASE WHEN auto_breakeven_on_tp1 = 1 THEN 0 ELSE 1 END WHERE user_id = ?`).bind(user.id).run();
      } else if (which === 'sl_tp2') {
        await env.DB.prepare(`UPDATE bot_configs SET move_sl_to_tp1_on_tp2 = CASE WHEN move_sl_to_tp1_on_tp2 = 1 THEN 0 ELSE 1 END WHERE user_id = ?`).bind(user.id).run();
      }
      await bot.answerCallbackQuery(cq.id, 'بروزرسانی شد ✅');
      await showTradeQuantitiesMenu(env, bot, chatId, user.id, msgId);
      return { ok: true };
    }

    if (data.startsWith('cfg_edit:')) {
      const field = data.slice('cfg_edit:'.length);
      const stepMap: Record<string, { step: string; prompt: string }> = {
        margin_pct: { step: 'AWAIT_MARGIN_PCT', prompt: '💰 درصد مارجین هر معامله (بین 1 تا 100، پیش‌فرض 10) را بفرستید:' },
        max_leverage: { step: 'AWAIT_MAX_LEV', prompt: '🔘 حداکثر اهرم مجاز (بین 1 تا 125، پیش‌فرض 20) را بفرستید:' },
        signal_channel_handle: { step: 'AWAIT_SIGNAL_CHANNEL', prompt: '📡 آیدی یا لینک کانال سیگنال جدید را بفرستید (پیش‌فرض: @Dollarino_official):' },
        tp_custom: { step: 'AWAIT_TP_CUSTOM', prompt: '🎯 درصدهای TP1 TP2 TP3 را با فاصله بفرستید (مثلاً: 50 25 25):' },
      };
      const item = stepMap[field];
      if (item) {
        await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: item.step }), user.id).run();
        await bot.answerCallbackQuery(cq.id);
        await bot.sendMessage(chatId, item.prompt);
      }
      return { ok: true };
    }

    if (data.startsWith('manual_trade:')) {
      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      if (!ent.hasPaidPlan && ent.subscriptionRequired) {
        await bot.answerCallbackQuery(cq.id, '💎 برای اجرای معامله، اشتراک فعال لازم است.', true);
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      const sigId = data.split(':')[1]!;
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `⚠️ آیا از باز کردن معامله برای این سیگنال اطمینان دارید؟`,
          [
            [
              { text: 'تایید میکنم ✅', callback_data: `confirm_trade:${sigId}` },
              { text: 'نه دستم خورد ❌', callback_data: `cancel_trade:${sigId}` },
            ],
          ]
        );
      }
      await bot.answerCallbackQuery(cq.id);
      return { ok: true };
    }

    if (data.startsWith('cancel_trade:')) {
      if (msgId) {
        await bot.editMessageText(chatId, msgId, '❌ سفارش لغو شد و هیچ معامله‌ای باز نگردید.');
      }
      await bot.answerCallbackQuery(cq.id, 'لغو شد');
      return { ok: true };
    }

    if (data.startsWith('confirm_trade:')) {
      const sigId = data.split(':')[1]!;
      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      if (!ent.allowCopyTrade) {
        await bot.answerCallbackQuery(cq.id, 'برای کپی‌ترید تلگرام اشتراک Pro یا VIP لازم است.', true);
        return { ok: true };
      }
      const sigRow = await env.DB.prepare('SELECT * FROM signals WHERE id = ?').bind(sigId).first<{
        symbol: string;
        direction: 'LONG' | 'SHORT';
        timeframe: string;
        price: string;
        stop_loss: string;
        leverage: number;
        tp1: string;
        tp2: string | null;
        tp3: string | null;
        created_at: string;
      }>();
      if (!sigRow) {
        await bot.answerCallbackQuery(cq.id, 'سیگنال منقضی شده است', true);
        return { ok: true };
      }
      const ageMs = Date.now() - Date.parse(sigRow.created_at + 'Z');
      if (Number.isFinite(ageMs) && ageMs > 60 * 60_000) {
        await bot.answerCallbackQuery(cq.id, 'این سیگنال منقضی شده است (بیش از ۱ ساعت گذشته).', true);
        return { ok: true };
      }
      const res = await executeSignalForUser(
        env,
        user.id,
        {
          symbol: sigRow.symbol,
          direction: sigRow.direction,
          timeframe: sigRow.timeframe,
          price: sigRow.price,
          stopLoss: sigRow.stop_loss,
          leverage: sigRow.leverage,
          tp1: sigRow.tp1,
          tp2: sigRow.tp2 ?? undefined,
          tp3: sigRow.tp3 ?? undefined,
        },
        { signalId: sigId, forceBypassState: true }
      );
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          res.ok ? `✅ معامله با موفقیت ثبت شد (شناسه: ${res.tradeId})` : `❌ خطا در ثبت معامله: ${res.error}`
        );
      }
      await bot.answerCallbackQuery(cq.id);
      return { ok: true };
    }

    if (data === 'toggle_auto_on' || data === 'toggle_auto_off') {
      if (data === 'toggle_auto_on') {
        const res = await startBotOneClickForTelegram({
          env,
          bot,
          chatId,
          user,
          tgId,
          webAppUrl,
        });
        if (!res.ok && res.text === 'NEED_SUBSCRIPTION') {
          await bot.answerCallbackQuery(cq.id, 'برای روشن کردن اتوترید، اشتراک فعال لازم است.', true);
          await showSubscriptionMenu(env, bot, chatId, user, tgId);
          return { ok: true };
        }
        await bot.answerCallbackQuery(cq.id, res.ok ? 'اتوترید خودکار روشن شد 🤖' : res.text, !res.ok);
        if (msgId) {
          await bot.editMessageText(chatId, msgId, res.text, miniAppInlineKeyboard(webAppUrl, '', 'none', true, getUserUiMode(user))).catch(() => {});
        } else {
          await bot.sendMessage(chatId, res.text, { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', true, getUserUiMode(user)) });
        }
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`
      ).bind(user.id).run();
      await bot.answerCallbackQuery(cq.id, 'اتوترید خاموش شد 🔴');
      if (msgId) {
        await bot.editMessageText(chatId, msgId, `وضعیت اتوترید: 🔴 خاموش`);
      }
      return { ok: true };
    }

    if (data.startsWith('tg_acc:')) {
      const sec = (data.slice('tg_acc:'.length) || 'none') as CollapsibleMenuSection;
      const cfg = await env.DB.prepare('SELECT bot_state FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ bot_state: string }>();
      const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
      const uiMode = getUserUiMode(user);
      await bot.answerCallbackQuery(cq.id);
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `🎛 کنترل پنل سریع دلارینو (${uiMode === 'simple' ? 'حالت ساده 🌱' : 'حالت حرفه‌ای ⚡'}):\nبخش دلخواه را باز یا بسته کنید:`,
          miniAppInlineKeyboard(webAppUrl, '', sec, isRunning, uiMode)
        ).catch(() => {});
      }
      return { ok: true };
    }

    if (data === 'tg_toggle_ui_mode') {
      const nextMode: 'simple' | 'pro' = getUserUiMode(user) === 'simple' ? 'pro' : 'simple';
      await env.DB.prepare(`UPDATE users SET ui_mode = ? WHERE id = ?`).bind(nextMode, user.id).run();
      user.ui_mode = nextMode;
      const cfg = await env.DB.prepare('SELECT bot_state FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ bot_state: string }>();
      const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
      await bot.answerCallbackQuery(cq.id, nextMode === 'pro' ? 'حالت حرفه‌ای فعال شد ⚡' : 'حالت ساده فعال شد 🌱');
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `🎛 حالت رابط کاربری روی **${nextMode === 'pro' ? 'حرفه‌ای (Quant Pro ⚡)' : 'ساده (۴ گامه 🌱)'}** تنظیم شد (همگام با وب و موبایل):`,
          miniAppInlineKeyboard(webAppUrl, '', 'none', isRunning, nextMode)
        ).catch(() => {});
      }
      await bot.sendMessage(chatId, nextMode === 'pro' ? '⚡ منوی حالت حرفه‌ای فعال شد:' : '🌱 منوی حالت ساده فعال شد:', {
        replyKeyboard: mainMenuKeyboard(webAppUrl, nextMode, isUserAdmin(tgId, user.role, env)),
      });
      return { ok: true };
    }

    if (data.startsWith('tg_simple_wizard:')) {
      const stepNum = Math.min(4, Math.max(1, Number(data.split(':')[1] || 1))) as 1 | 2 | 3 | 4;
      let st: TelegramStepState | undefined;
      try { st = user.telegram_state ? (JSON.parse(user.telegram_state) as TelegramStepState) : undefined; } catch { /* ignore */ }
      await bot.answerCallbackQuery(cq.id);
      await showSimpleWizardStep(bot, chatId, stepNum, st, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_wiz_m:')) {
      const margin = Number(data.split(':')[1] || 10);
      let st: TelegramStepState = { step: 'WIZARD' };
      try { if (user.telegram_state) st = { ...st, ...(JSON.parse(user.telegram_state) as TelegramStepState) }; } catch { /* ignore */ }
      st.wizMarginPct = margin;
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify(st), user.id).run();
      await bot.answerCallbackQuery(cq.id, `مارجین ${margin}% انتخاب شد`);
      await showSimpleWizardStep(bot, chatId, 2, st, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_wiz_l:')) {
      const lev = Number(data.split(':')[1] || 10);
      let st: TelegramStepState = { step: 'WIZARD' };
      try { if (user.telegram_state) st = { ...st, ...(JSON.parse(user.telegram_state) as TelegramStepState) }; } catch { /* ignore */ }
      st.wizLev = lev;
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify(st), user.id).run();
      await bot.answerCallbackQuery(cq.id, `اهرم ${lev}x انتخاب شد`);
      await showSimpleWizardStep(bot, chatId, 3, st, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_wiz_e:')) {
      const eng = data.slice('tg_wiz_e:'.length) || 'ai_autonomous_agent';
      let st: TelegramStepState = { step: 'WIZARD' };
      try { if (user.telegram_state) st = { ...st, ...(JSON.parse(user.telegram_state) as TelegramStepState) }; } catch { /* ignore */ }
      st.wizEngine = eng;
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify(st), user.id).run();
      await bot.answerCallbackQuery(cq.id, 'موتور انتخاب شد ✅');
      await showSimpleWizardStep(bot, chatId, 4, st, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_wiz_go:')) {
      const modeChoice = data.split(':')[1] || 'auto';
      let st: TelegramStepState = { step: 'WIZARD' };
      try { if (user.telegram_state) st = { ...st, ...(JSON.parse(user.telegram_state) as TelegramStepState) }; } catch { /* ignore */ }
      const marginPct = st.wizMarginPct ?? 10;
      const maxLev = st.wizLev ?? 10;
      const stratKey = st.wizEngine || 'ai_autonomous_agent';

      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      if (!ent.hasPaidPlan && ent.subscriptionRequired) {
        await bot.answerCallbackQuery(cq.id, '💎 برای روشن کردن خودکار ربات اشتراک فعال لازم است.', true);
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }

      const cfg = await env.DB.prepare('SELECT trading_mode FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ trading_mode: string }>();
      const nextTradingMode = modeChoice === 'paper' ? 'PAPER' : (cfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER');
      const nextBotState = nextTradingMode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';

      await env.DB.prepare(
        `UPDATE bot_configs
         SET margin_pct = ?, max_leverage = ?, strategy_key = ?, trading_mode = ?, trade_execution_mode = 'AUTO', bot_state = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      ).bind(marginPct, maxLev, stratKey, nextTradingMode, nextBotState, user.id).run();
      await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(user.id).run();

      const doStub = env.TRADING_BOT_DO.get(env.TRADING_BOT_DO.idFromName('global-coordinator'));
      await doStub.fetch('https://do/start').catch(() => {});
      await doStub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {});

      await bot.answerCallbackQuery(cq.id, 'ربات با تنظیمات ۴ مرحله‌ای روشن شد 🚀');
      const doneText =
        `✅ **تنظیمات ۴ مرحله‌ای ذخیره و ربات روشن شد!**\n\n` +
        `• سرمایه هر معامله: ${marginPct}%\n` +
        `• حداکثر اهرم: ${maxLev}x\n` +
        `• موتور فعال: ${resolveEngineDisplayLabel(stratKey)}\n` +
        `• وضعیت: 🟢 در حال رصد بازار (${nextTradingMode})`;
      if (msgId) await bot.editMessageText(chatId, msgId, doneText).catch(() => bot.sendMessage(chatId, doneText));
      else await bot.sendMessage(chatId, doneText);
      return { ok: true };
    }

    if (data === 'tg_tw_menu' || data === 'tg_tw_bal') {
      await bot.answerCallbackQuery(cq.id, data === 'tg_tw_bal' ? 'در حال استعلام از شبکه بلاکچین... 🔍' : undefined);
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, msgId, data === 'tg_tw_bal');
      return { ok: true };
    }

    if (data.startsWith('tg_tw_set:')) {
      const chainKind = data.slice('tg_tw_set:'.length);
      const stepMap: Record<string, { step: string; prompt: string }> = {
        evm: {
          step: 'AWAIT_TW_EVM',
          prompt: '🦊 لطفاً آدرس کیف‌پول **Trust Wallet شبکه EVM (BSC / ETH / Base / Arbitrum)** خود را که با `0x` شروع می‌شود ارسال کنید:',
        },
        tron: {
          step: 'AWAIT_TW_TRON',
          prompt: '🦊 لطفاً آدرس کیف‌پول **Trust Wallet شبکه TRON (TRC20)** خود را که با `T` شروع می‌شود ارسال کنید:',
        },
        solana: {
          step: 'AWAIT_TW_SOLANA',
          prompt: '🦊 لطفاً آدرس کیف‌پول **Trust Wallet شبکه Solana (SPL)** خود را ارسال کنید:',
        },
        ton: {
          step: 'AWAIT_TW_TON',
          prompt: '💎 لطفاً آدرس کیف‌پول **TON (شروع با EQ یا UQ)** خود را ارسال کنید:',
        },
      };
      const item = stepMap[chainKind];
      if (item) {
        await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: item.step }), user.id).run();
        await bot.answerCallbackQuery(cq.id);
        await bot.sendMessage(chatId, item.prompt);
      }
      return { ok: true };
    }

    if (data === 'tg_dex_trending') {
      await bot.answerCallbackQuery(cq.id, 'در حال دریافت توکن‌های داغ DexScreener... 🔍');
      await showDexTrendingMenu(bot, chatId, undefined, undefined, msgId);
      return { ok: true };
    }

    if (data === 'tg_dex_search') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: 'AWAIT_DEX_SEARCH' }), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(
        chatId,
        '🔎 نام توکن، نماد (مثل PEPE یا AERO) یا آدرس کامل کانترکت (Contract Address) مورد نظر را بنویسید تا در لحظه در DexScreener بررسی شود و لینک سوآپ Trust Wallet بسازیم:'
      );
      return { ok: true };
    }

    if (data === 'tg_ext_widgets' || data === 'tg_ext_rotate') {
      await bot.answerCallbackQuery(cq.id, data === 'tg_ext_rotate' ? 'کلید جدید اکستنشن ساخته شد 🔑' : undefined);
      await showExtensionWidgetsMenu(env, bot, chatId, user, webAppUrl, msgId, data === 'tg_ext_rotate');
      return { ok: true };
    }

    if (data === 'tg_mode_simple_ai') {
      const res = await startBotOneClickForTelegram({
        env,
        bot,
        chatId,
        user,
        tgId,
        webAppUrl,
        overrideStrategyKey: 'ai_autonomous_agent',
      });
      if (!res.ok && res.text === 'NEED_SUBSCRIPTION') {
        await bot.answerCallbackQuery(cq.id, 'برای ترید هوشمند اتومات، اشتراک لازم است 💎', true);
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      await bot.answerCallbackQuery(cq.id, res.ok ? 'ترید هوشمند اتومات روشن شد ✅' : res.text, !res.ok);
      await bot.sendMessage(chatId, res.text, {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', res.ok, getUserUiMode(user)),
      });
      return { ok: true };
    }

    if (data === 'tg_myai') {
      await bot.answerCallbackQuery(cq.id);
      let ag = await env.DB.prepare(`SELECT name, system_rules_json, is_active_for_trading FROM user_ai_agents WHERE user_id = ?`).bind(user.id).first<{
        name: string;
        system_rules_json: string;
        is_active_for_trading: number;
      }>().catch(() => null);
      if (!ag) {
        await env.DB.prepare(`INSERT OR IGNORE INTO user_ai_agents (id, user_id, name, system_rules_json) VALUES (?, ?, 'هوش مصنوعی شخصی من', ?)`)
          .bind(randomId('myai'), user.id, JSON.stringify(DEFAULT_TRAINED_RULES)).run();
        ag = { name: 'هوش مصنوعی شخصی من', system_rules_json: JSON.stringify(DEFAULT_TRAINED_RULES), is_active_for_trading: 0 };
      }
      let rules: TrainedAIRules = DEFAULT_TRAINED_RULES;
      try { rules = { ...DEFAULT_TRAINED_RULES, ...JSON.parse(ag.system_rules_json || '{}') }; } catch { /* default */ }
      const summary =
        `🧠 ${ag.name} (${ag.is_active_for_trading ? '🟢 فعال روی ربات' : '⚪️ در حال آموزش'})\n\n` +
        `• تایم‌فریم: ${rules.timeframe} | سبک: ${rules.style}\n` +
        `• ارزها: ${rules.symbols.join('، ')}\n` +
        `• اندیکاتورها: ${rules.indicators.join(' + ')}\n` +
        `• حد ضرر: ${rules.stopLossPct}% | حد سود: ${rules.takeProfitPct}% | اهرم: ${rules.maxLeverage}x\n\n` +
        `روی دکمه زیر بزنید و استراتژی خودتان را با زبان ساده برایم بنویسید تا یاد بگیرم:`;
      const kb: InlineKeyboardButton[][] = [
        [{ text: '✍️ آموزش جدید به هوش مصنوعی من', callback_data: 'tg_myai_train', style: 'primary' }],
        [{ text: '🚀 فعال‌سازی ترید خودکار با هوش مصنوعی من', callback_data: 'tg_myai_activate', style: 'success' }],
        [{ text: '🔙 بازگشت به پنل کنترل', callback_data: 'tg_acc:ai' }],
      ];
      if (msgId) await bot.editMessageText(chatId, msgId, summary, kb).catch(() => bot.sendMessage(chatId, summary, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, summary, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data === 'tg_myai_train') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: 'AWAIT_MYAI_TEACH' }), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(chatId, '🧠 هوش مصنوعی خام شما گوش به زنگ است!\nاستراتژی، تایم‌فریم، اندیکاتورها (مثلاً RSI زیر ۳۵ و EMA 9/21)، ارزها و حد ضرر/سود خود را همین الان بنویسید:');
      return { ok: true };
    }

    if (data === 'tg_myai_activate') {
      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      if (!ent.hasPaidPlan && ent.subscriptionRequired) {
        await bot.answerCallbackQuery(cq.id, 'برای فعال‌سازی ترید خودکار اشتراک لازم است 💎', true);
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE user_ai_agents SET is_active_for_trading = 1 WHERE user_id = ?`).bind(user.id).run();
      const cfg = await env.DB.prepare('SELECT trading_mode FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ trading_mode: string }>();
      const nextState = cfg?.trading_mode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
      await env.DB.prepare(`UPDATE bot_configs SET strategy_key = 'my_custom_ai', bot_state = ?, updated_at = datetime('now') WHERE user_id = ?`)
        .bind(nextState, user.id).run();
      const doStub = env.TRADING_BOT_DO.get(env.TRADING_BOT_DO.idFromName('global-coordinator'));
      await doStub.fetch('https://do/start').catch(() => {});
      await doStub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {});
      await bot.answerCallbackQuery(cq.id, 'هوش مصنوعی شخصی شما فعال شد ✅');
      await bot.sendMessage(chatId, '🚀 هوش مصنوعی شخصی شما با قوانین آموزش‌داده‌شده روی ربات فعال شد و ۲۴ ساعته معامله می‌کند!');
      return { ok: true };
    }

    if (data === 'tg_copy_list') {
      await bot.answerCallbackQuery(cq.id);
      const traders = await env.DB.prepare(
        `SELECT id, display_name, specialty, win_rate, roi_30d_pct, followers_count FROM copy_traders WHERE is_active = 1 AND is_verified = 1 ORDER BY roi_30d_pct DESC LIMIT 6`
      ).all<{ id: string; display_name: string; specialty: string; win_rate: number; roi_30d_pct: number; followers_count: number }>().catch(() => ({ results: [] }));
      if (!traders.results.length) {
        await bot.sendMessage(chatId, '🏆 در حال حاضر تریدری ثبت نشده است.');
        return { ok: true };
      }
      const lines = traders.results.map(
        (t, i) => `${i + 1}. ✅ ${t.display_name} (${t.specialty})\n   نرخ برد: ${t.win_rate}% | بازده ۳۰روزه: +${t.roi_30d_pct}% | دنبال‌کننده: ${t.followers_count}`
      ).join('\n\n');
      const kb: InlineKeyboardButton[][] = traders.results.map((t) => [
        { text: `📌 کپی از ${t.display_name}`, callback_data: `tg_copy_follow:${t.id}`, style: 'success' },
      ]);
      kb.push([{ text: '🔙 بازگشت', callback_data: 'tg_acc:copy' }]);
      if (msgId) await bot.editMessageText(chatId, msgId, `🏆 کپی‌تریدرهای تاییدشده دلارینو:\n\n${lines}`, kb).catch(() => bot.sendMessage(chatId, lines, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, `🏆 کپی‌تریدرهای تاییدشده دلارینو:\n\n${lines}`, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data.startsWith('tg_copy_follow:')) {
      const traderId = data.slice('tg_copy_follow:'.length);
      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      if (!ent.hasPaidPlan && ent.subscriptionRequired) {
        await bot.answerCallbackQuery(cq.id, 'برای کپی‌ترید اشتراک فعال لازم است 💎', true);
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      const trader = await env.DB.prepare(`SELECT display_name FROM copy_traders WHERE id = ?`).bind(traderId).first<{ display_name: string }>();
      await env.DB.prepare(
        `INSERT OR IGNORE INTO copy_subscriptions (id, user_id, trader_id, allocation_usd, risk_multiplier, auto_mirror, is_active) VALUES (?, ?, ?, 100, 1, 1, 1)`
      ).bind(randomId('csub'), user.id, traderId).run();
      await env.DB.prepare(`UPDATE copy_subscriptions SET is_active = 1 WHERE user_id = ? AND trader_id = ?`).bind(user.id, traderId).run();
      await bot.answerCallbackQuery(cq.id, `کپی‌ترید ${trader?.display_name || ''} فعال شد ✅`);
      await bot.sendMessage(chatId, `✅ کپی‌ترید خودکار برای «${trader?.display_name || traderId}» فعال شد! از مینی‌اپ نیز می‌توانید معاملات لحظه‌ای ایشان را ببینید و مدیریت کنید.`);
      return { ok: true };
    }

    if (data === 'tg_open_sub') {
      await bot.answerCallbackQuery(cq.id);
      await showSubscriptionMenu(env, bot, chatId, user, tgId);
      return { ok: true };
    }

    if (data.startsWith('copy_pub_yes:') || data.startsWith('copy_pub_no:')) {
      const approve = data.startsWith('copy_pub_yes:');
      const copyTradeId = data.split(':')[1]!;
      const res = await confirmAndMirrorCopyTrade(env, copyTradeId, approve);
      await bot.answerCallbackQuery(
        cq.id,
        approve ? `منتشر شد ✅ (${res.mirroredCount} آینه‌سازی)` : 'فقط شخصی باقی ماند ❌'
      );
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          approve
            ? `✅ معامله کپی‌ترید شما منتشر شد و برای ${res.mirroredCount} دنبال‌کننده فعال آینه‌سازی گردید!`
            : `❌ معامله منتشر نشد و فقط در تاریخچه شخصی شما باقی ماند.`
        );
      }
      return { ok: true };
    }

    if (data.startsWith('manual_confirm:')) {
      const sigId = data.split(':')[1]!;
      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      if (!ent.hasPaidPlan && ent.subscriptionRequired) {
        await bot.answerCallbackQuery(cq.id, '💎 برای اجرای معامله، اشتراک فعال لازم است.', true);
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `⚡️ تایید نهایی اجرای این سیگنال روی حساب متصل شما:`,
          [
            [
              { text: 'تایید میکنم و اجرا کن ✅', callback_data: `confirm_trade:${sigId}`, style: 'success' },
              { text: 'انصراف ❌', callback_data: `cancel_trade:${sigId}`, style: 'danger' },
            ],
          ]
        );
      }
      await bot.answerCallbackQuery(cq.id);
      return { ok: true };
    }

    if (data === 'tg_hunt_ready' || data === 'tg_hunt_personal') {
      await bot.answerCallbackQuery(cq.id);
      if (data === 'tg_hunt_ready') {
        const kb: InlineKeyboardButton[][] = [
          [
            { text: '🦅 استراتژی دُرنا V1 (مخلوط ۸گانه)', callback_data: 'tg_set_strat:dollarino_v01', style: 'success' },
            { text: '⚡️ KBOS Super v11', callback_data: 'tg_set_strat:kbos_v11', style: 'primary' },
          ],
          [
            { text: '🌊 شکار نقدینگی SP2L', callback_data: 'tg_set_strat:sp2l' },
            { text: '📈 روند EMA Pullback', callback_data: 'tg_set_strat:ema_trend_pullback' },
          ],
          [{ text: '🔙 بازگشت به پنل کنترل', callback_data: 'tg_acc:hunt' }],
        ];
        await bot.sendMessage(
          chatId,
          `🎯 استراتژی‌های شکار آماده دلارینو:\nیکی از موتورهای آماده و بهینه‌شده زیر را برای شکار فرصت‌ها انتخاب کنید:`,
          { inlineKeyboard: kb }
        );
      } else {
        const hasHttps = webAppUrl.startsWith('https://');
        await bot.sendMessage(
          chatId,
          `🛠 استراتژی شخصی خودتان (Pine Script / Python / Visual Builder):\nدر محیط آزمایشگاه کد دلارینو می‌توانید استراتژی اختصاصی خود را بنویسید، بک‌تست ۹۰۰ کندلی بگیرید و روی ربات فعال کنید.`,
          {
            inlineKeyboard: hasHttps
              ? [
                  [{ text: '🚀 باز کردن آزمایشگاه کدنویسی (IDE)', web_app: { url: `${webAppUrl}/?tab=radar` }, style: 'primary' }],
                  [{ text: '🔙 بازگشت', callback_data: 'tg_acc:hunt' }],
                ]
              : [[{ text: '🔙 بازگشت', callback_data: 'tg_acc:hunt' }]],
          }
        );
      }
      return { ok: true };
    }

    if (data.startsWith('tg_set_strat:')) {
      const stratKey = data.slice('tg_set_strat:'.length);
      const res = await startBotOneClickForTelegram({
        env,
        bot,
        chatId,
        user,
        tgId,
        webAppUrl,
        overrideStrategyKey: stratKey,
      });
      if (!res.ok && res.text === 'NEED_SUBSCRIPTION') {
        await env.DB.prepare(`UPDATE bot_configs SET strategy_key = ?, updated_at = datetime('now') WHERE user_id = ?`)
          .bind(stratKey, user.id).run();
        await bot.answerCallbackQuery(cq.id, `استراتژی ${resolveEngineDisplayLabel(stratKey)} انتخاب شد (برای اجرای خودکار اشتراک لازم است 💎)`, true);
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      await bot.answerCallbackQuery(cq.id, res.ok ? `استراتژی ${resolveEngineDisplayLabel(stratKey)} روشن شد ✅` : res.text, !res.ok);
      await bot.sendMessage(chatId, res.text, {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'hunt', res.ok, getUserUiMode(user)),
      });
      return { ok: true };
    }

    if (data === 'tg_profit_card') {
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(chatId, `🏆 صدور کارت سود رسمی دلارینو (با لوگو و مهر حساب واقعی / دمو):\nبازه زمانی و قالب دلخواه خود را انتخاب کنید:`, {
        inlineKeyboard: [
          [
            { text: '⏱ ۲۴ ساعته (افقی)', callback_data: 'tg_profit_issue:24H:horizontal', style: 'primary' },
            { text: '📅 هفتگی (افقی)', callback_data: 'tg_profit_issue:7D:horizontal', style: 'success' },
          ],
          [
            { text: '🗓 ماهانه (افقی)', callback_data: 'tg_profit_issue:30D:horizontal' },
            { text: '📆 سالانه (عمودی)', callback_data: 'tg_profit_issue:1Y:vertical', style: 'primary' },
          ],
          [{ text: '📱 کارت سود عمودی (استوری)', callback_data: 'tg_profit_issue:7D:vertical', style: 'success' }],
        ],
      });
      return { ok: true };
    }

    if (data.startsWith('tg_profit_issue:')) {
      const [, rawPeriod, rawLayout] = data.split(':');
      const period = (['24H', '7D', '30D', '1Y', 'ALL'].includes(rawPeriod || '') ? rawPeriod : '7D') as '24H' | '7D' | '30D' | '1Y' | 'ALL';
      const layout = rawLayout === 'vertical' ? 'vertical' : 'horizontal';
      const cfgRow = await env.DB.prepare('SELECT trading_mode, paper_balance FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ trading_mode: 'LIVE' | 'PAPER'; paper_balance: string }>();
      const mode = cfgRow?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
      const whereParts = [`user_id = ?`, `status = 'CLOSED'`, `mode = ?`];
      if (period === '24H') whereParts.push(`closed_at >= datetime('now', '-24 hours')`);
      else if (period === '7D') whereParts.push(`closed_at >= datetime('now', '-7 days')`);
      else if (period === '30D') whereParts.push(`closed_at >= datetime('now', '-30 days')`);
      else if (period === '1Y') whereParts.push(`closed_at >= datetime('now', '-365 days')`);

      const trRows = await env.DB.prepare(
        `SELECT id, exchange_provider, strategy_key, realized_pnl, margin_used, closed_at
         FROM trades WHERE ${whereParts.join(' AND ')} ORDER BY closed_at ASC`
      ).bind(user.id, mode).all<{
        id: string;
        exchange_provider: string;
        strategy_key: string | null;
        realized_pnl: string;
        margin_used: string;
        closed_at: string;
      }>();

      if (!trRows.results.length) {
        await bot.answerCallbackQuery(cq.id, `معامله بسته‌شده‌ای در بازه ${period} یافت نشد.`, true);
        return { ok: true };
      }

      let netPnl = 0;
      let wins = 0;
      let grossWin = 0;
      let grossLoss = 0;
      let totalMargin = 0;
      for (const r of trRows.results) {
        const pnl = Number(r.realized_pnl || 0);
        netPnl += pnl;
        totalMargin += Math.max(0, Number(r.margin_used || 0));
        if (pnl > 0) {
          wins++;
          grossWin += pnl;
        } else if (pnl < 0) {
          grossLoss += Math.abs(pnl);
        }
      }
      const winRate = Number(((wins / trRows.results.length) * 100).toFixed(2));
      const pf = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0;
      const baseCap = mode === 'PAPER' ? Math.max(totalMargin, Math.max(100, Number(cfgRow?.paper_balance || 10000) - netPnl)) : Math.max(10, totalMargin);
      const roiPct = Number(((netPnl / baseCap) * 100).toFixed(2));
      const cardId = `DLR-${randomId('').slice(0, 10).toUpperCase()}`;
      const issuedAt = new Date().toISOString();
      const topStrategy = resolveEngineDisplayLabel(trRows.results[0]?.strategy_key);
      const topProv = (trRows.results[0]?.exchange_provider || 'TOOBIT').toUpperCase();
      const tradesHash = await sha256Hex(trRows.results.map((t) => `${t.id}:${t.realized_pnl}:${t.closed_at}`).join(';'));
      const canonical = buildVerifiedCardCanonicalPayload({
        id: cardId,
        userId: user.id,
        mode,
        period,
        startDate: trRows.results[0]!.closed_at,
        endDate: trRows.results[trRows.results.length - 1]!.closed_at,
        tradesCount: trRows.results.length,
        winRate,
        netPnlUsd: Number(netPnl.toFixed(2)),
        roiPct,
        profitFactor: pf,
        exchangeProvider: topProv,
        strategyName: topStrategy,
        tradesHash,
        issuedAt,
      });
      const sig = await hmacSha256Hex(canonical, env.SESSION_JWT_SECRET || env.MASTER_ENCRYPTION_KEY || 'dollarino-card-hmac-secret');

      await env.DB.prepare(
        `INSERT INTO verified_profit_cards (id, user_id, mode, period, start_date, end_date, trades_count, win_rate, net_pnl_usd, roi_pct, profit_factor, exchange_provider, strategy_name, payload_json, hmac_signature, issued_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        cardId,
        user.id,
        mode,
        period,
        trRows.results[0]!.closed_at,
        trRows.results[trRows.results.length - 1]!.closed_at,
        trRows.results.length,
        winRate,
        Number(netPnl.toFixed(2)),
        roiPct,
        pf,
        topProv,
        topStrategy,
        JSON.stringify({ isVerifiedReal: mode === 'LIVE', tradesHash }),
        sig,
        issuedAt
      ).run();

      await bot.answerCallbackQuery(cq.id, 'در حال صدور کارت سود... 🎨');
      await publishProfitCardToTelegram(
        env,
        chatId,
        {
          id: cardId,
          displayName: user.username,
          mode,
          period,
          tradesCount: trRows.results.length,
          winRate,
          netPnlUsd: Number(netPnl.toFixed(2)),
          roiPct,
          profitFactor: pf,
          exchangeProvider: topProv,
          strategyName: topStrategy,
          issuedAt,
        },
        layout
      );
      return { ok: true };
    }

    if (data === 'tg_support_open') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: 'AWAIT_SUPPORT_MSG' }), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      const supportId = await getSystemSetting(env.DB, 'telegram_support', OFFICIAL_BOT_HANDLE);
      const safeSup = /Dollarino_admin/i.test(supportId) ? OFFICIAL_BOT_HANDLE : supportId;
      await bot.sendMessage(
        chatId,
        `💬 پشتیبانی هوشمند و آنلاین دلارینو (${safeSup})\n\n` +
        `سوال، خطا یا <b>عکس و اسکرین‌شات</b> خود را همین‌جا ارسال کنید تا دستیار هوش مصنوعی پشتیبانی ظرف چند ثانیه بررسی و پاسخ دهد.\n` +
        `هر زمان بخواهید می‌توانید دکمه «گفتگو مستقیم با مدیران» را بزنید تا پیام یا تصویرتان مستقیماً برای تیم مدیریت ارسال شود.\n\n` +
        `${ANTI_SCAM_WARNING_FA}`,
        {
          inlineKeyboard: [
            [{ text: '👨‍💼 اتصال مستقیم به مدیران پشتیبانی', callback_data: 'tg_support_human:new', style: 'primary' }],
          ],
        }
      );
      return { ok: true };
    }

    if (data.startsWith('tg_support_human:')) {
      const argTicketId = data.slice('tg_support_human:'.length).trim();
      let ticketId = argTicketId && argTicketId !== 'new' ? argTicketId : '';
      if (!ticketId) {
        const openTkt = await env.DB.prepare(
          `SELECT id FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
        ).bind(user.id).first<{ id: string }>();
        ticketId = openTkt?.id || '';
      }
      if (!ticketId) {
        ticketId = randomId('tkt');
        await env.DB.prepare(
          `INSERT INTO support_tickets (id, user_id, subject, status, channel, support_mode, escalated_at) VALUES (?, ?, 'ارتباط مستقیم با مدیران (تلگرام)', 'OPEN', 'TELEGRAM', 'HUMAN_ADMIN', datetime('now'))`
        ).bind(ticketId, user.id).run();
      } else {
        await env.DB.prepare(
          `UPDATE support_tickets SET support_mode = 'HUMAN_ADMIN', escalated_at = datetime('now'), status = 'OPEN', last_message_at = datetime('now') WHERE id = ?`
        ).bind(ticketId).run();
      }
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_SUPPORT_MSG' }), user.id).run();
      await bot.answerCallbackQuery(cq.id, 'متصل شدید به مدیران پشتیبانی 👨‍💼');
      await notifyAllAdmins(
        env,
        `👨‍💼 درخواست گفتگوی مستقیم کاربر با مدیران (تلگرام)\n👤 ${user.username} (${tgId})\nتیکت: #${ticketId}`,
        { inlineKeyboard: [[{ text: '✍️ پاسخ فوری به کاربر', callback_data: `adm:sup_reply:${ticketId}`, style: 'primary' }]] }
      ).catch(() => {});
      await bot.sendMessage(
        chatId,
        `👨‍💼 درخواست شما برای گفتگوی مستقیم با <b>مدیران پشتیبانی دلارینو</b> در تیکت #${ticketId} ثبت شد.\n\nپیام متنی یا <b>عکس و اسکرین‌شات</b> خود را همین‌جا ارسال کنید تا مستقیماً برای تیم مدیریت فرستاده شود و پاسخ مدیریت در همین‌جا برایتان پیام شود.`
      );
      return { ok: true };
    }

    if (data === 'tg_support_ai') {
      const openTkt = await env.DB.prepare(
        `SELECT id FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
      ).bind(user.id).first<{ id: string }>();
      if (openTkt) {
        await env.DB.prepare(`UPDATE support_tickets SET support_mode = 'AI_ASSISTANT' WHERE id = ?`).bind(openTkt.id).run();
      }
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_SUPPORT_MSG' }), user.id).run();
      await bot.answerCallbackQuery(cq.id, 'دستیار هوشمند فعال شد 🤖');
      await bot.sendMessage(chatId, '🤖 دستیار هوشمند پشتیبانی آماده است! سوال یا <b>اسکرین‌شات/عکس</b> خود را بفرستید:');
      return { ok: true };
    }

    if (data === 'tg_instant_ai_trade') {
      await bot.answerCallbackQuery(cq.id, 'در حال اسکن زنده و اجرای فوری معامله... ⚡️');
      const res = await runInstantAiAutoTradeForTelegram({ env, user, tgId });
      if (res.needSubscription) {
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      await bot.sendMessage(chatId, res.text, {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', true, getUserUiMode(user)),
      });
      return { ok: true };
    }

    if (data === 'tg_bot_toggle') {
      const cfg = await env.DB.prepare('SELECT bot_state, trading_mode FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ bot_state: string; trading_mode: string }>();
      const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
      if (isRunning) {
        await env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`)
          .bind(user.id).run();
        await bot.answerCallbackQuery(cq.id, 'ربات متوقف شد 🔴');
        const stopMsg = '🔴 **ربات دلارینو متوقف شد.** برای شروع مجدد در هر لحظه روی دکمه زیر بزنید:';
        if (msgId) {
          await bot.editMessageText(chatId, msgId, stopMsg, miniAppInlineKeyboard(webAppUrl, '', 'ai', false, getUserUiMode(user))).catch(() => {});
        } else {
          await bot.sendMessage(chatId, stopMsg, { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', false, getUserUiMode(user)) });
        }
        return { ok: true };
      }

      const res = await startBotOneClickForTelegram({
        env,
        bot,
        chatId,
        user,
        tgId,
        webAppUrl,
      });
      if (!res.ok && res.text === 'NEED_SUBSCRIPTION') {
        await bot.answerCallbackQuery(cq.id, 'برای روشن کردن ربات، اشتراک لازم است 💎', true);
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      await bot.answerCallbackQuery(cq.id, res.ok ? 'ربات خودکار روشن شد 🟢' : res.text, !res.ok);
      if (msgId) {
        await bot.editMessageText(chatId, msgId, res.text, miniAppInlineKeyboard(webAppUrl, '', 'ai', res.ok, getUserUiMode(user))).catch(() => bot.sendMessage(chatId, res.text));
      } else {
        await bot.sendMessage(chatId, res.text, { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', res.ok, getUserUiMode(user)) });
      }
      return { ok: true };
    }

    if (data === 'tg_positions') {
      const openRows = await env.DB.prepare(
        `SELECT id, symbol, direction, market_type, entry_price, leverage, margin_used, current_stop_loss, tp1 FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 8`
      ).bind(user.id).all<{
        id: string;
        symbol: string;
        direction: 'LONG' | 'SHORT';
        market_type?: string;
        entry_price: string;
        leverage: number;
        margin_used: string;
        current_stop_loss: string;
        tp1: string;
      }>();
      await bot.answerCallbackQuery(cq.id);
      if (!openRows.results.length) {
        await bot.sendMessage(chatId, '📭 در حال حاضر هیچ معامله بازی روی حساب شما نیست.', {
          inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '/terminal'),
        });
        return { ok: true };
      }
      const lines = openRows.results.map(
        (t, idx) =>
          `${idx + 1}. ${t.direction === 'LONG' ? '🟢' : '🔴'} ${t.symbol} (${t.market_type || 'FUTURES'} ${t.leverage}x)\n   ورود: ${t.entry_price} | SL: ${t.current_stop_loss} | TP1: ${t.tp1}`
      ).join('\n\n');
      const closeButtons: InlineKeyboardButton[][] = openRows.results.map((t) => [
        { text: `❌ بستن ${t.symbol} (${t.direction})`, callback_data: `close_pos:${t.id}` },
      ]);
      if (webAppUrl.startsWith('https://')) {
        closeButtons.push([{ text: '🚀 مشاهده در مینی‌اپ', web_app: { url: `${webAppUrl}/terminal` } }]);
      }
      await bot.sendMessage(chatId, `📈 معاملات باز فعلی (${openRows.results.length}):\n\n${lines}`, {
        inlineKeyboard: closeButtons,
      });
      return { ok: true };
    }

    if (data.startsWith('close_pos:')) {
      const tradeId = data.slice('close_pos:'.length);
      const t = await env.DB.prepare(
        `SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = 'OPEN'`
      ).bind(tradeId, user.id).first<{
        id: string;
        signal_id?: string | null;
        strategy_key?: string | null;
        mode: string;
        market_type?: 'SPOT' | 'FUTURES';
        symbol: string;
        direction: 'LONG' | 'SHORT';
        leverage: number;
        entry_price: string;
        initial_quantity: string;
        remaining_quantity: string;
        margin_used: string;
        current_stop_loss: string;
        initial_stop_loss?: string;
        tp1: string;
        tp1_hit?: number;
        tp2_hit?: number;
        tp3_hit?: number;
        trailing_active?: number;
        risk_free_active?: number;
        opened_at?: string;
        realized_pnl: string;
      }>();
      if (!t) {
        await bot.answerCallbackQuery(cq.id, 'این معامله قبلاً بسته شده است.', true);
        return { ok: true };
      }
      const { adapter } = await resolveUserExchangeAdapter(env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
      const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `tg_cls_${Date.now()}`, t.market_type ?? 'FUTURES');
      const exitPx = Number(cls.filledPrice);
      const entryPx = Number(t.entry_price);
      const qty = Number(t.remaining_quantity);
      const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
      const totalRealized = Number(t.realized_pnl) + pnl - Number(cls.fee);

      if (t.mode === 'PAPER') {
        const cfgRow = await env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
          .bind(user.id).first<{ paper_balance: string }>();
        const remMargin = Number(t.margin_used) * (qty / Math.max(1e-9, Number(t.initial_quantity)));
        const nextBal = Number(cfgRow?.paper_balance ?? 0) + remMargin + pnl - Number(cls.fee);
        await env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
          .bind(nextBal.toFixed(2), user.id).run();
      }
      await env.DB.prepare(
        `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'TELEGRAM_MANUAL', closed_at = datetime('now') WHERE id = ?`
      ).bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();

      const pnlPct = Number(t.margin_used) > 0 ? (totalRealized / Number(t.margin_used)) * 100 : 0;
      await publishSignalClosedCard(env, {
        tradeId: t.id,
        userId: user.id,
        signalId: t.signal_id,
        symbol: t.symbol,
        direction: t.direction,
        leverage: t.leverage ?? 1,
        mode: t.mode === 'LIVE' ? 'LIVE' : 'PAPER',
        strategyKey: t.strategy_key,
        entryPrice: t.entry_price,
        exitPrice: cls.filledPrice,
        stopLoss: t.initial_stop_loss ?? t.current_stop_loss,
        tp1: t.tp1,
        tp1Hit: Boolean(t.tp1_hit || totalRealized > 0),
        tp2Hit: Boolean(t.tp2_hit),
        tp3Hit: Boolean(t.tp3_hit),
        trailingActive: Boolean(t.trailing_active || t.risk_free_active),
        trailingSl: t.current_stop_loss,
        pnlUsd: totalRealized,
        pnlPct,
        reason: 'TELEGRAM_MANUAL',
        openedAt: t.opened_at,
        closedAt: new Date().toISOString(),
      }).catch(() => {});

      await bot.answerCallbackQuery(cq.id, 'معامله بسته شد ✅');
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `✅ معامله ${t.symbol} (${t.direction}) با موفقیت بسته شد!\nخروج: ${cls.filledPrice}\nسود/زیان خالص: ${totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)} USDT`
        );
      }
      return { ok: true };
    }

    if (data === 'set_mkt:SPOT' || data === 'set_mkt:FUTURES') {
      const nextMkt = data.endsWith('SPOT') ? 'SPOT' : 'FUTURES';
      if (nextMkt === 'SPOT') {
        await env.DB.prepare(
          `UPDATE bot_configs SET market_type = 'SPOT', max_leverage = 1, hedge_mode = 0, direction_mode = CASE WHEN direction_mode = 'SHORT_ONLY' THEN 'LONG_ONLY' ELSE direction_mode END WHERE user_id = ?`
        ).bind(user.id).run();
      } else {
        await env.DB.prepare(`UPDATE bot_configs SET market_type = 'FUTURES' WHERE user_id = ?`).bind(user.id).run();
      }
      await bot.answerCallbackQuery(cq.id, `بازار روی ${nextMkt} تنظیم شد`);
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `⚖️ نوع بازار معاملاتی روی ${nextMkt === 'SPOT' ? 'اسپات (Spot · اهرم 1x)' : 'فیوچرز (Futures · اهرم و دوطرفه)'} ذخیره شد.`
        );
      }
      return { ok: true };
    }

    if (data.startsWith('set_dir:') || data === 'toggle_hedge') {
      if (data === 'toggle_hedge') {
        const cfgRow = await env.DB.prepare('SELECT market_type, hedge_mode FROM bot_configs WHERE user_id = ?')
          .bind(user.id).first<{ market_type?: string; hedge_mode?: number }>();
        if (cfgRow?.market_type === 'SPOT') {
          await bot.answerCallbackQuery(cq.id, 'حالت هج فقط در بازار فیوچرز فعال می‌شود.', true);
          return { ok: true };
        }
        const nextHedge = cfgRow?.hedge_mode ? 0 : 1;
        await env.DB.prepare('UPDATE bot_configs SET hedge_mode = ? WHERE user_id = ?').bind(nextHedge, user.id).run();
        await bot.answerCallbackQuery(cq.id, nextHedge ? 'حالت هج هم‌زمان فعال شد 🛡' : 'حالت هج غیرفعال شد');
        if (msgId) {
          await bot.editMessageText(chatId, msgId, `🛡 وضعیت Hedge Mode (لانگ و شورت هم‌زمان): ${nextHedge ? '🟢 فعال' : '⚪️ غیرفعال'}`);
        }
        return { ok: true };
      }
      const nextDir = data.slice('set_dir:'.length);
      const cfgRow = await env.DB.prepare('SELECT market_type FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ market_type?: string }>();
      if (cfgRow?.market_type === 'SPOT' && nextDir === 'SHORT_ONLY') {
        await bot.answerCallbackQuery(cq.id, 'در بازار اسپات امکان معامله Short وجود ندارد.', true);
        return { ok: true };
      }
      await env.DB.prepare('UPDATE bot_configs SET direction_mode = ? WHERE user_id = ?').bind(nextDir, user.id).run();
      await bot.answerCallbackQuery(cq.id, `جهت معاملات: ${nextDir}`);
      if (msgId) {
        await bot.editMessageText(chatId, msgId, `↕️ جهت معاملات ربات روی ${nextDir} تنظیم شد.`);
      }
      return { ok: true };
    }

    if (data === 'tg_ai_chat' || data === 'tg_ai_new') {
      await bot.answerCallbackQuery(cq.id);
      await openDedicatedAIChatMenu(env, bot, chatId, user, webAppUrl, {
        createNewSession: data === 'tg_ai_new',
        editMsgId: data === 'tg_ai_chat' ? msgId : undefined,
      });
      return { ok: true };
    }

    if (data === 'tg_ai_models') {
      await bot.answerCallbackQuery(cq.id);
      const { models, selectedModelId } = await listSelectableAIModels(env, user.id);
      const kb: InlineKeyboardButton[][] = models.map((m) => [
        {
          text: `${m.id === selectedModelId ? '✅ ' : ''}${m.label}${m.supportsVision ? ' 👁️' : ''}`,
          callback_data: `tg_ai_set_model:${m.id}`,
          style: m.id === selectedModelId ? 'success' : 'primary',
        },
      ]);
      kb.push([{ text: '🔙 بازگشت به چت هوش مصنوعی', callback_data: 'tg_ai_chat' }]);
      const modelTxt =
        `🤖 **انتخاب مدل هوش مصنوعی دلارینو**\n\n` +
        `مدل‌هایی که علامت 👁️ دارند از **تحلیل مستقیم عکس چارت** پشتیبانی می‌کنند.\n` +
        `مدل‌های بیشتر را می‌توانید از پنل مدیریت یا بخش اتصالات وب اضافه کنید:`;
      if (msgId) await bot.editMessageText(chatId, msgId, modelTxt, kb).catch(() => bot.sendMessage(chatId, modelTxt, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, modelTxt, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data.startsWith('tg_ai_set_model:')) {
      const targetId = data.slice('tg_ai_set_model:'.length);
      const { models } = await listSelectableAIModels(env, user.id);
      const chosen = models.find((m) => m.id === targetId);
      if (!chosen) {
        await bot.answerCallbackQuery(cq.id, 'مدل یافت نشد یا غیرفعال شده است.', true);
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE users SET preferred_ai_model_id = ? WHERE id = ?`).bind(chosen.id, user.id).run();
      await bot.answerCallbackQuery(cq.id, `مدل فعال: ${chosen.label}`);
      await openDedicatedAIChatMenu(env, bot, chatId, user, webAppUrl, { editMsgId: msgId });
      return { ok: true };
    }

    if (data.startsWith('tg_ai_exec_setup:')) {
      const sid = data.slice('tg_ai_exec_setup:'.length);
      const row = await env.DB.prepare(
        `SELECT setup_json FROM ai_chat_messages WHERE session_id = ? AND user_id = ? AND setup_json IS NOT NULL ORDER BY created_at DESC LIMIT 1`
      )
        .bind(sid, user.id)
        .first<{ setup_json: string }>()
        .catch(() => null);
      if (!row?.setup_json) {
        await bot.answerCallbackQuery(cq.id, 'ستاپ قابل اجرا پیدا نشد.', true);
        return { ok: true };
      }
      let setup: ExtractedChartSetup | null = null;
      try {
        setup = JSON.parse(row.setup_json) as ExtractedChartSetup;
      } catch {
        setup = null;
      }
      if (!setup) {
        await bot.answerCallbackQuery(cq.id, 'خطا در خواندن اطلاعات ستاپ.', true);
        return { ok: true };
      }
      const cleanSymbol = setup.symbol.endsWith('USDT') ? setup.symbol : `${setup.symbol.replace(/[^A-Z0-9]/gi, '')}USDT`;
      const sigId = randomId('sig');
      const sigObj = {
        symbol: cleanSymbol,
        direction: setup.direction,
        timeframe: (setup.timeframe as Timeframe) || '15m',
        price: setup.entry,
        stopLoss: setup.stopLoss,
        leverage: Math.min(25, Math.max(1, Number(setup.leverage || 5))),
        tp1: setup.tp1,
        tp2: setup.tp2,
        tp3: setup.tp3,
        channelHandle: '@Dollarino_official',
        engineKey: 'ai_autonomous_agent',
        engineLabel: 'تحلیل چارت AI اختصاصی دلارینو',
      };
      const formatted = formatDollarinoSignal(sigObj);
      await env.DB.prepare(
        `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status)
         VALUES (?, ?, 'ai_chart_vision', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
      )
        .bind(
          sigId,
          user.id,
          sigObj.symbol,
          sigObj.direction,
          sigObj.timeframe,
          sigObj.price,
          sigObj.stopLoss,
          sigObj.leverage,
          sigObj.tp1,
          sigObj.tp2 ?? null,
          sigObj.tp3 ?? null,
          formatted
        )
        .run();
      await bot.answerCallbackQuery(cq.id, 'ستاپ آماده اجرا شد ⚡');
      await bot.sendMessage(chatId, `🎯 ستاپ چارت به سیگنال استاندارد دلارینو تبدیل شد:\n\n${formatted}`, {
        inlineKeyboard: [[{ text: '👈 دلارینو ترید کن برام 👉', callback_data: `manual_trade:${sigId}`, style: 'success' }]],
      });
      return { ok: true };
    }

    if (data === 'tg_ai_exit') {
      await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(user.id).run();
      await bot.answerCallbackQuery(cq.id, 'بازگشت به منوی اصلی');
      await bot.sendMessage(chatId, '🏠 از حالت چت مستقیم خارج شدید. منوی کامل در اختیار شماست:', {
        replyKeyboard: mainMenuKeyboard(webAppUrl, getUserUiMode(user), isUserAdmin(tgId, user.role, env)),
      });
      return { ok: true };
    }

    if (data === 'tg_about') {
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(
        chatId,
        `🚀 **درباره پلتفرم دلارینو (Dollarino v9.9)**\n\n` +
          `${CREATOR_ATTRIBUTION_FA}\n\n` +
          `• تلگرام سازنده: ${DOLLARINO_CREATOR_INFO.telegramUrl}\n` +
          `• اینستاگرام: ${DOLLARINO_CREATOR_INFO.instagramUrl}\n` +
          `• توییتر (X): ${DOLLARINO_CREATOR_INFO.twitterUrl}\n\n` +
          `💎 پلتفرم جامع ترید هوشمند AI، تحلیلگر تصویر چارت، استراتژی دُرنا V1، کپی‌ترید تاییدشده و کیف‌پول چندزنجیره‌ای Trust Wallet DEX.`
      );
      return { ok: true };
    }

    await bot.answerCallbackQuery(cq.id);
    return { ok: true };
  }

  // 3. Handle Normal Messages & Menu Navigation
  const msg = update.message;
  const msgBodyText = (msg?.text ?? msg?.caption ?? '').trim();
  const docImgFileId = msg?.document?.mime_type?.startsWith('image/') ? msg.document.file_id : undefined;
  const incomingImageFileId = msg?.photo?.[msg.photo.length - 1]?.file_id || docImgFileId;
  if (!msg?.from || (!msgBodyText && !incomingImageFileId && !msg.contact)) return { ok: true };

  const text = msgBodyText;
  const chatId = msg.chat.id;
  const tgId = String(msg.from.id);
  const user = await getOrProvisionTelegramUser(env, msg.from);
  const superAdmin = isSuperAdminUser(tgId, user.role, env);
  const admin = isUserAdmin(tgId, user.role, env);
  const uiMode = getUserUiMode(user);

  if (user.is_blocked) {
    await bot.sendMessage(chatId, '⛔️ دسترسی حساب شما موقتاً توسط مدیر محدود شده است.');
    return { ok: true };
  }

  if (privateAdminOnly && !admin) {
    await bot.sendMessage(
      chatId,
      `⛔️ این ربات در حال حاضر در حالت خصوصی است و فقط برای مدیر اصلی (${env.OWNER_TELEGRAM_ID || '944021185'}) و مدیران تاییدشده قابل استفاده می‌باشد.`
    );
    return { ok: true };
  }

  const clearState = () =>
    env.DB.prepare('UPDATE users SET telegram_state = NULL WHERE id = ?').bind(user.id).run();
  const setState = (s: TelegramStepState) =>
    env.DB.prepare('UPDATE users SET telegram_state = ? WHERE id = ?').bind(JSON.stringify(s), user.id).run();

  // 3A. Handle Native Telegram Contact Sharing (Mandatory Phone KYC)
  if (msg.contact) {
    if (!msg.contact.user_id || String(msg.contact.user_id) !== tgId) {
      await bot.sendMessage(
        chatId,
        `⛔️ لطفاً فقط شماره تماس **اکانت تلگرام خودتان** را از طریق دکمه‌ی زیر به اشتراک بگذارید (ارسال یا فوروارد شماره افراد دیگر پذیرفته نمی‌شود).`,
        { replyKeyboard: contactVerificationKeyboard() }
      );
      return { ok: true };
    }
    const normalizedPhone = normalizePhoneNumber(msg.contact.phone_number);
    let pendingStartArg: string | undefined;
    if (user.telegram_state) {
      try {
        const st = JSON.parse(user.telegram_state) as TelegramStepState;
        if (st.pendingStartArg) pendingStartArg = st.pendingStartArg;
      } catch { /* ignore */ }
    }
    await env.DB.prepare(
      `UPDATE users
       SET phone_number = ?, phone_verified = 1, phone_verified_at = datetime('now'), telegram_state = NULL
       WHERE id = ?`
    ).bind(normalizedPhone, user.id).run();
    user.phone_number = normalizedPhone;
    user.phone_verified = 1;

    await applyReferralIfPresent(env, user.id, pendingStartArg, normalizedPhone);

    await bot.sendMessage(
      chatId,
      `✅ احراز هویت شماره تماس شما با موفقیت انجام شد (${normalizedPhone})!\nحساب شما با مشخصات تلگرام خودتان ساخته و فعال گردید.`
    );

    if (pendingStartArg && pendingStartArg.toUpperCase().startsWith('LINK-')) {
      const linkRes = await applyLinkCodeForUser(env, user.id, msg.from, pendingStartArg);
      await bot.sendMessage(chatId, linkRes.message, { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) });
      await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
      return { ok: true };
    }

    await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, uiMode, webAppUrl), {
      replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
    });
    await bot.sendMessage(chatId, '🎛 کنترل سریع ربات:', {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', false, uiMode),
    });
    await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
    return { ok: true };
  }

  // 3B. Mandatory Pre-Auth Landing & Phone-KYC Gate (Never show bot menus before account verification!)
  if (await isPhoneKycRequiredForUser(env, user, tgId)) {
    const startArg = text.startsWith('/start ') ? text.slice(7).trim() : undefined;
    await sendPreAuthIntro(env, bot, chatId, user, msg.from.first_name ?? user.username, startArg);
    return { ok: true };
  }

  // Deep-link `/start PAYLOAD` (e.g. `/start LINK-XXXXXX`, `/start sig_<id>`, `/start exec_<id>`, `/start web_auth`)
  if (text.startsWith('/start ')) {
    await clearState();
    const payload = text.slice(7).trim();
    if (payload.toUpperCase().startsWith('LINK-')) {
      const linkRes = await applyLinkCodeForUser(env, user.id, msg.from, payload);
      await bot.sendMessage(chatId, linkRes.message, { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) });
      return { ok: true };
    }
    if (payload.startsWith('sig_') || payload.startsWith('exec_') || payload.startsWith('open_')) {
      const sigId = payload.replace(/^(sig_|exec_|open_)/, '').trim();
      const sigRow = await env.DB.prepare(`SELECT * FROM signals WHERE id = ? LIMIT 1`).bind(sigId).first<{
        id: string;
        symbol: string;
        direction: 'LONG' | 'SHORT';
        timeframe: string;
        price: string;
        stop_loss: string;
        leverage: number;
        tp1: string;
        tp2: string | null;
        tp3: string | null;
        engine_label: string | null;
        raw_text: string;
      }>();
      if (!sigRow) {
        await bot.sendMessage(chatId, '⚠️ سیگنال درخواستی یافت نشد یا منقضی شده است.', {
          replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
        });
        return { ok: true };
      }
      const formatted = sigRow.raw_text || formatDollarinoSignal({
        symbol: sigRow.symbol,
        direction: sigRow.direction,
        timeframe: sigRow.timeframe,
        price: sigRow.price,
        stopLoss: sigRow.stop_loss,
        leverage: sigRow.leverage,
        tp1: sigRow.tp1,
        tp2: sigRow.tp2 ?? undefined,
        tp3: sigRow.tp3 ?? undefined,
        engineLabel: sigRow.engine_label ?? undefined,
      });
      await bot.sendMessage(chatId, formatted, {
        inlineKeyboard: payload.startsWith('exec_')
          ? [
              [
                { text: 'تایید میکنم و معامله کن ✅', callback_data: `confirm_trade:${sigRow.id}`, style: 'success' },
                { text: 'انصراف ❌', callback_data: `cancel_trade:${sigRow.id}`, style: 'danger' },
              ],
            ]
          : [
              [
                { text: 'دلارینو ترید کن برام 🤖', callback_data: `manual_trade:${sigRow.id}`, style: 'success' },
                { text: 'تایید و اجرای فوری ✅', callback_data: `manual_confirm:${sigRow.id}`, style: 'primary' },
              ],
            ],
      });
      return { ok: true };
    }
    if (payload.toUpperCase().startsWith('REF_') || payload.toUpperCase().startsWith('DLR-')) {
      await applyReferralIfPresent(env, user.id, payload, user.phone_number);
      await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, uiMode, webAppUrl), {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
      });
      await bot.sendMessage(chatId, '🎁 شما از طریق لینک دعوت دوستتان وارد شدید! با فعال‌سازی اشتراک، پورسانت و هدیه اشتراک ثبت می‌شود.', {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', false, uiMode),
      });
      await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
      return { ok: true };
    }
    if (payload === 'web_auth' || payload.toLowerCase().startsWith('web_auth__')) {
      if (payload.toLowerCase().includes('ref_') || payload.toUpperCase().includes('DLR-')) {
        await applyReferralIfPresent(env, user.id, payload, user.phone_number);
      }
      await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, uiMode, webAppUrl), {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
      });
      await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
      return { ok: true };
    }
  }

  if (text === '/start' || text === '/menu' || text === 'بازگشت به صفحه قبل 🔙') {
    await clearState();
    const cfg = await env.DB.prepare('SELECT bot_state FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ bot_state: string }>();
    const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
    await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, uiMode, webAppUrl), {
      replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
    });
    await bot.sendMessage(chatId, '🎛 کنترل سریع ربات:', {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', isRunning, uiMode),
    });
    return { ok: true };
  }

  if (text === '/weblogin') {
    await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
    return { ok: true };
  }

  if (text === '/wizard') {
    await clearState();
    await showSimpleWizardStep(bot, chatId, 1);
    return { ok: true };
  }

  if (text === '/app' || text === '🚀 مینی‌اپ دلارینو') {
    await bot.sendMessage(chatId, '📱 برای ورود مستقیم و بدون نیاز به لاگین به مینی‌اپ دلارینو روی دکمه زیر بزنید:', {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', false, uiMode),
    });
    return { ok: true };
  }

  if (text.startsWith('/link ')) {
    const linkRes = await applyLinkCodeForUser(env, user.id, msg.from, text.slice(6));
    await bot.sendMessage(chatId, linkRes.message, { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) });
    return { ok: true };
  }

  const SLASH_OVERRIDE = new Set([
    '/card',
    '/copy',
    '/support',
    '/positions',
    '/balance',
    '/settings',
    '/help',
    '/menu',
    '/dex',
    '/wallet',
    '/wizard',
    '/myai',
    '/weblogin',
    '/ai',
    '/chat',
    '/about',
  ]);
  const MAIN_MENU_PREFIXES = [
    '🧠 چت هوش مصنوعی',
    '🟢 شروع خودکار ربات',
    '⚡️ شکار فوری AI',
    '🚀 راه‌اندازی ۴ مرحله‌ای ربات',
    '🦊 کیف‌پول Trust Wallet',
    '🦊 Trust Wallet و DEX',
    'ربات و هوش مصنوعی من',
    '🏆 کپی‌ترید',
    'حساب کاربری 👤',
    'خرید اشتراک 💎',
    'اتصال به صرافی 🔗',
    '⚡ رفتن به حالت حرفه‌ای',
    '🌱 رفتن به حالت ساده',
    '🔍 رادار DexScreener',
    '🔍 اسکنر DEX',
    'تنظیمات ⚙️',
    '📈 معاملات باز',
    '🎯 استراتژی شکار',
    '🧩 اکستنشن و ویجت موبایل',
    '💬 پشتیبانی',
    'راهنما 📚',
    '👨‍💻 درباره سازنده',
    'بازگشت به صفحه قبل 🔙',
    'پنل مدیریت 💼',
  ];
  const isMenuButtonTap =
    SLASH_OVERRIDE.has(text) ||
    text.startsWith('/') ||
    MAIN_MENU_PREFIXES.some((btn) => text.startsWith(btn.slice(0, 8)));

  if (SLASH_OVERRIDE.has(text) && user.telegram_state) {
    await clearState();
    user.telegram_state = null;
  }

  // Handle Multi-Step Flows
  if (user.telegram_state) {
    const state = JSON.parse(user.telegram_state) as TelegramStepState;

    if (admin && state.step.startsWith('ADM_')) {
      const handled = await handleAdminStepInput(
        env,
        bot,
        buildAdminActor(user, tgId, env),
        chatId,
        state as AdminStepState,
        text,
        incomingImageFileId
      );
      if (handled) return { ok: true };
    }

    if (state.step === 'AWAIT_AI_CHAT') {
      if (isMenuButtonTap) {
        await clearState();
      } else {
        await handleTelegramAIChatTurn({
          env,
          bot,
          chatId,
          user,
          webAppUrl,
          text,
          imageFileId: incomingImageFileId,
          sessionId: state.activeAiSessionId,
        });
        return { ok: true };
      }
    }

    if (state.step === 'AWAIT_API_KEY' && state.provider) {
      await setState({ step: 'AWAIT_API_SECRET', provider: state.provider, apiKey: text });
      await bot.sendMessage(chatId, `🔐 عالی! حالا لطفاً Secret Key صرافی ${state.provider.toUpperCase()} خود را ارسال کنید:`);
      return { ok: true };
    }

    if (state.step === 'AWAIT_API_SECRET' && state.provider && state.apiKey) {
      const apiKey = state.apiKey;
      const apiSecret = text;
      const encCreds = await encryptVaultJson(
        state.provider === 'kcex' ? { apiKey, apiSecret, webSessionToken: apiSecret } : { apiKey, apiSecret },
        env.MASTER_ENCRYPTION_KEY
      );
      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      const canActivateLive = ent.allowLiveTrading;

      if (canActivateLive) {
        await env.DB.prepare(`UPDATE exchange_connections SET is_active = 0 WHERE user_id = ?`).bind(user.id).run();
      }
      await env.DB.prepare(
        `INSERT INTO exchange_connections (id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'CONNECTED')`
      ).bind(
        randomId('ex'),
        user.id,
        state.provider,
        `${state.provider.toUpperCase()} Telegram`,
        canActivateLive ? 1 : 0,
        maskSecret(apiKey),
        encCreds
      ).run();

      await clearState();
      const { adapter } = await resolveUserExchangeAdapter(env, user.id, state.provider);
      const test = await adapter.testConnection();
      if (!canActivateLive) {
        await bot.sendMessage(
          chatId,
          `🔐 کلید ${state.provider.toUpperCase()} با رمزنگاری AES-256 ذخیره شد (در حالت Standby).\n\nبرای فعال‌سازی معاملات واقعی روی Toobit یا KCEX لطفاً اشتراک تهیه کنید.`,
          { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) }
        );
      } else if (test.ok && test.balance) {
        await env.DB.prepare(`UPDATE bot_configs SET trading_mode = 'LIVE' WHERE user_id = ?`).bind(user.id).run();
        await bot.sendMessage(
          chatId,
          `✅ اتصال به ${state.provider.toUpperCase()} با موفقیت برقرار شد!\n\n${formatBalanceCard(state.provider, test.balance)}`,
          { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) }
        );
      } else {
        await bot.sendMessage(
          chatId,
          `⚠️ کلیدها به‌صورت رمزنگاری‌شده ذخیره شدند اما تست اتصال صرافی پیام داد:\n${test.message}`,
          { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) }
        );
      }
      return { ok: true };
    }

    if (state.step === 'AWAIT_MARGIN_PCT') {
      const pct = Number(text);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        await bot.sendMessage(chatId, '❌ لطفاً یک عدد معتبر بین 1 تا 100 وارد کنید:');
        return { ok: true };
      }
      await env.DB.prepare('UPDATE bot_configs SET margin_pct = ? WHERE user_id = ?').bind(pct, user.id).run();
      await clearState();
      await bot.sendMessage(chatId, `✅ درصد مارجین هر معامله روی ${pct}% تنظیم شد.`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
      return { ok: true };
    }

    if (state.step === 'AWAIT_MAX_LEV') {
      const lev = Math.round(Number(text));
      if (!Number.isFinite(lev) || lev < 1 || lev > 125) {
        await bot.sendMessage(chatId, '❌ لطفاً عددی بین 1 تا 125 وارد کنید:');
        return { ok: true };
      }
      await env.DB.prepare('UPDATE bot_configs SET max_leverage = ? WHERE user_id = ?').bind(lev, user.id).run();
      await clearState();
      await bot.sendMessage(chatId, `✅ حداکثر لوریج مجاز روی ${lev}x تنظیم شد.`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
      return { ok: true };
    }

    if (state.step === 'AWAIT_SIGNAL_CHANNEL') {
      const ch = text.trim().startsWith('@') || text.trim().startsWith('-100') ? text.trim() : `@${text.trim()}`;
      await env.DB.prepare('UPDATE bot_configs SET signal_channel_handle = ? WHERE user_id = ?').bind(ch, user.id).run();
      await clearState();
      await bot.sendMessage(chatId, `✅ کانال سیگنال متصل روی ${ch} ذخیره شد.`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TP_CUSTOM') {
      const nums = text.trim().split(/[\s,/]+/).map(Number);
      if (nums.length !== 3 || nums.some((n) => !Number.isFinite(n) || n < 0) || Math.round(nums[0]! + nums[1]! + nums[2]!) !== 100) {
        await bot.sendMessage(chatId, '❌ لطفاً ۳ عدد که مجموعشان 100 شود بفرستید (مثلاً: 50 25 25):');
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE bot_configs SET tp1_close_pct = ?, tp2_close_pct = ?, tp3_close_pct = ? WHERE user_id = ?`)
        .bind(nums[0]!, nums[1]!, nums[2]!, user.id).run();
      await clearState();
      await bot.sendMessage(chatId, `✅ تقسیم تارگت‌ها روی ${nums[0]}% / ${nums[1]}% / ${nums[2]}% ذخیره شد.`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TOPUP_AMOUNT') {
      const amt = Number(text);
      await clearState();
      if (!Number.isFinite(amt) || amt < 5) {
        await bot.sendMessage(chatId, '❌ حداقل مبلغ شارژ کیف پول 5 USDT است.');
        return { ok: true };
      }
      const [walletAddr, rateStr] = await Promise.all([
        getSystemSetting(env.DB, 'usdt_trc20_wallet', 'TYourTRC20WalletAddressHere'),
        getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000'),
      ]);
      const subId = randomId('top');
      await env.DB.prepare(
        `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, amount_usd, payer_note)
         VALUES (?, ?, 'wallet_charge', 'PENDING_REVIEW', 'USDT_TRC20', ?, 'Wallet Top-Up')`
      ).bind(subId, user.id, amt).run();
      await bot.sendMessage(
        chatId,
        `💰 فاکتور شارژ کیف پول #${subId}\n\n💵 مبلغ: ${amt} USDT (${formatToman(amt, Number(rateStr) || 70000)} تومان)\n💳 آدرس TRC20:\n${walletAddr}\n\nپس از انتقال روی دکمه زیر بزنید:`,
        {
          inlineKeyboard: [
            [
              { text: '✅ بررسی پرداخت / ثبت TXID', callback_data: `sub_verify:${subId}` },
              { text: '❌ انصراف', callback_data: `sub_cancel:${subId}` },
            ],
          ],
        }
      );
      return { ok: true };
    }

    if (state.step === 'AWAIT_PAYMENT_TXID' && state.subId) {
      let txid = text.trim();
      let receiptDataUrl: string | null = null;
      if (incomingImageFileId) {
        try {
          const dl = await bot.downloadFileAsDataUrl(incomingImageFileId, 3_500_000);
          receiptDataUrl = dl.dataUrl;
          if (!txid) txid = `TG-RECEIPT-${state.subId.slice(-6).toUpperCase()}`;
        } catch (imgErr) {
          await bot.sendMessage(chatId, `⚠️ خطا در دریافت عکس رسید: ${imgErr instanceof Error ? imgErr.message : 'لطفاً دوباره بفرستید یا کد پیگیری را تایپ کنید.'}`);
          return { ok: true };
        }
      }
      if (!txid && !receiptDataUrl) {
        await bot.sendMessage(chatId, 'لطفاً عکس رسید یا کد پیگیری / TXID را ارسال کنید:');
        return { ok: true };
      }
      await clearState();
      await env.DB.prepare(`UPDATE user_subscriptions SET payment_reference = ?, receipt_image_url = COALESCE(?, receipt_image_url) WHERE id = ? AND user_id = ?`)
        .bind(txid.slice(0, 140), receiptDataUrl, state.subId, user.id).run();
      const sub = await env.DB.prepare(`SELECT plan_code, amount_usd FROM user_subscriptions WHERE id = ?`).bind(state.subId).first<{ plan_code: string; amount_usd: number }>();
      const alertText = `🔔 ثبت پرداخت جدید!\n\n👤 کاربر: ${user.username} (${tgId})\n🧾 سفارش: #${state.subId}\n📦 پلن: ${sub?.plan_code ?? '—'} | 💵 ${sub?.amount_usd ?? 0} USDT\n🔗 کد/TXID: ${txid}${receiptDataUrl ? '\n📸 به همراه عکس رسید' : ''}`;
      const reviewMarkup = {
        inlineKeyboard: [
          [
            { text: '✅ تایید فوری', callback_data: `adm:tx_approve:${state.subId}` },
            { text: '❌ رد', callback_data: `adm:tx_reject:${state.subId}` },
          ],
        ],
      };
      if (receiptDataUrl) {
        await notifyAllAdminsPhoto(env, receiptDataUrl, alertText, reviewMarkup).catch(() => {});
      } else {
        await notifyAllAdmins(env, alertText, reviewMarkup).catch(() => {});
      }
      await bot.sendMessage(
        chatId,
        `✅ ${receiptDataUrl ? 'عکس رسید واریز' : `کد پیگیری (${txid})`} برای فاکتور #${state.subId} ثبت و برای تایید آنی ارسال شد! به محض تایید پیام فعال‌سازی دریافت می‌کنید.`
      );
      return { ok: true };
    }

    if (state.step === 'AWAIT_MYAI_TEACH') {
      await clearState();
      let ag = await env.DB.prepare(`SELECT system_rules_json, training_notes FROM user_ai_agents WHERE user_id = ?`).bind(user.id).first<{ system_rules_json: string; training_notes: string }>().catch(() => null);
      if (!ag) {
        await env.DB.prepare(`INSERT OR IGNORE INTO user_ai_agents (id, user_id, name, system_rules_json) VALUES (?, ?, 'هوش مصنوعی شخصی من', ?)`)
          .bind(randomId('myai'), user.id, JSON.stringify(DEFAULT_TRAINED_RULES)).run();
        ag = { system_rules_json: JSON.stringify(DEFAULT_TRAINED_RULES), training_notes: '' };
      }
      let cur: TrainedAIRules = DEFAULT_TRAINED_RULES;
      try { cur = { ...DEFAULT_TRAINED_RULES, ...JSON.parse(ag.system_rules_json || '{}') }; } catch { /* default */ }
      const { next, learnedHighlights } = extractRulesFromConversation(text, cur);
      const nextNotes = `${ag.training_notes ? `${ag.training_notes}\n` : ''}• ${text}`.slice(-4000);
      await env.DB.prepare(
        `UPDATE user_ai_agents SET training_notes = ?, system_rules_json = ?, last_trained_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?`
      ).bind(nextNotes, JSON.stringify(next), user.id).run();
      await env.DB.prepare(`INSERT INTO user_ai_messages (id, user_id, role, content) VALUES (?, ?, 'user', ?)`).bind(randomId('msg'), user.id, text).run();
      const reply = learnedHighlights.length
        ? `✅ این موارد را یاد گرفتم و ثبت کردم:\n• ${learnedHighlights.join('\n• ')}\n\nتایم‌فریم: ${next.timeframe} | ارزها: ${next.symbols.join('، ')} | SL ${next.stopLossPct}% / TP ${next.takeProfitPct}%`
        : `🧠 دستورالعمل شما ثبت شد! تایم‌فریم فعلی: ${next.timeframe} | ارزها: ${next.symbols.join('، ')}`;
      await env.DB.prepare(`INSERT INTO user_ai_messages (id, user_id, role, content, extracted_rules_json) VALUES (?, ?, 'assistant', ?, ?)`).bind(randomId('msg'), user.id, reply, JSON.stringify(next)).run();
      await bot.sendMessage(chatId, reply, {
        inlineKeyboard: [
          [{ text: '✍️ آموزش بیشتر', callback_data: 'tg_myai_train', style: 'primary' }],
          [{ text: '🚀 فعال‌سازی ترید با هوش مصنوعی من', callback_data: 'tg_myai_activate', style: 'success' }],
        ],
      });
      return { ok: true };
    }

    if (state.step === 'AWAIT_SUPPORT_MSG') {
      if (isMenuButtonTap) {
        await clearState();
      } else {
        let supportImgDataUrl: string | null = null;
        if (incomingImageFileId) {
          try {
            const dl = await bot.downloadFileAsDataUrl(incomingImageFileId, 3_500_000);
            supportImgDataUrl = dl.dataUrl;
          } catch {
            // fallback to text if image fetch fails
          }
        }
        const supportMsgText = text.trim() || (supportImgDataUrl ? '📷 تصویر پیوست‌شده در پشتیبانی' : '');
        if (!supportMsgText) return { ok: true };

        let tkt = await env.DB.prepare(
          `SELECT id, COALESCE(support_mode, 'AI_ASSISTANT') as support_mode FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
        ).bind(user.id).first<{ id: string; support_mode: string }>();
      const ticketId = tkt?.id || randomId('tkt');
      const supportMode = tkt?.support_mode || 'AI_ASSISTANT';
      if (!tkt) {
        await env.DB.prepare(
          `INSERT INTO support_tickets (id, user_id, subject, status, channel, support_mode) VALUES (?, ?, 'پشتیبانی تلگرام', 'OPEN', 'TELEGRAM', 'AI_ASSISTANT')`
        ).bind(ticketId, user.id).run();
      }
      await env.DB.prepare(`INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message, image_data_url) VALUES (?, ?, ?, 'user', ?, ?, ?)`)
        .bind(randomId('smsg'), ticketId, user.id, user.username, supportMsgText.slice(0, 2000), supportImgDataUrl).run();

      if (supportMode === 'HUMAN_ADMIN') {
        await clearState();
        await env.DB.prepare(`UPDATE support_tickets SET status = 'OPEN', last_message_at = datetime('now') WHERE id = ?`).bind(ticketId).run();
        const adminCaption = `💬 پیام پشتیبانی جدید از ربات (گفتگوی مستقیم با مدیران):\n👤 ${user.username} (${tgId})\nتیکت: #${ticketId}\n\n${supportMsgText}`;
        const adminMarkup = {
          inlineKeyboard: [[{ text: '✍️ پاسخ فوری به کاربر', callback_data: `adm:sup_reply:${ticketId}`, style: 'primary' as const }]],
        };
        if (supportImgDataUrl) {
          await notifyAllAdminsPhoto(env, supportImgDataUrl, adminCaption, adminMarkup).catch(() => {});
        } else {
          await notifyAllAdmins(env, adminCaption, adminMarkup).catch(() => {});
        }
        await bot.sendMessage(
          chatId,
          `✅ پیام شما به تیکت #${ticketId} برای مدیران پشتیبانی ارسال شد و به‌زودی همین‌جا پاسخ می‌گیرید.\n\n${ANTI_SCAM_WARNING_FA}`,
          {
            replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
            inlineKeyboard: [[{ text: '🤖 بازگشت به پاسخگویی فوری هوش مصنوعی', callback_data: 'tg_support_ai' }]],
          }
        );
        return { ok: true };
      }

      // AI Support Auto-Answer mode — keeps AWAIT_SUPPORT_MSG active for continuous AI chat
      const aiRes = await generateSupportAIReply(env, {
        userId: user.id,
        username: user.username || tgId,
        question: supportImgDataUrl ? `${supportMsgText}\n[کاربر تصویر اسکرین‌شات ارسال کرده است؛ در صورت نیاز به بررسی دستی مدیر، یادآوری کن دکمه گفتگو با مدیران انسانی را بزند.]` : supportMsgText,
      });
      await env.DB.prepare(`INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message) VALUES (?, ?, ?, 'ai', ?, ?)`)
        .bind(randomId('smsg'), ticketId, user.id, `دستیار هوشمند (${aiRes.usedModel})`, aiRes.reply).run();
      await env.DB.prepare(`UPDATE support_tickets SET status = 'OPEN', last_message_at = datetime('now') WHERE id = ?`).bind(ticketId).run();

        await bot.sendMessage(
          chatId,
          `🤖 **پاسخ دستیار هوشمند دلارینو:**\n\n${aiRes.reply}\n\n—\nمی‌توانید سوال یا تصویر بعدی خود را همین‌جا بپرسید یا با دکمه زیر مستقیماً با مدیران صحبت کنید.`,
          {
            inlineKeyboard: [
              [{ text: '👨‍💼 سوال من حل نشد / گفتگو با مدیران انسانی', callback_data: `tg_support_human:${ticketId}`, style: 'primary' }],
            ],
          }
        );
        return { ok: true };
      }
    }

    if (state.step === 'AWAIT_TW_EVM') {
      const addr = text.trim();
      if (!isValidEvm(addr)) {
        await bot.sendMessage(chatId, '❌ فرمت آدرس EVM نامعتبر است! آدرس شبکه BSC/ETH باید با `0x` شروع شده و ۴۲ کاراکتر هگز باشد:');
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE users SET trust_wallet_address = ?, trust_wallet_verified = 1, trust_wallet_connected_at = datetime('now') WHERE id = ?`
      ).bind(addr, user.id).run();
      user.trust_wallet_address = addr;
      await clearState();
      await bot.sendMessage(chatId, `✅ آدرس EVM تراست‌ولت شما ثبت و تایید شد:\n\`${addr}\``, {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
      });
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, undefined, true);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TW_TRON') {
      const addr = text.trim();
      if (!isValidTron(addr)) {
        await bot.sendMessage(chatId, '❌ فرمت آدرس TRON نامعتبر است! آدرس TRC20 باید با `T` شروع شده و ۳۴ کاراکتر باشد:');
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE users SET trust_wallet_tron = ?, trust_wallet_verified = 1, trust_wallet_connected_at = datetime('now') WHERE id = ?`
      ).bind(addr, user.id).run();
      user.trust_wallet_tron = addr;
      await clearState();
      await bot.sendMessage(chatId, `✅ آدرس TRON (TRC20) تراست‌ولت شما ثبت شد:\n\`${addr}\``, {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
      });
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, undefined, true);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TW_SOLANA') {
      const addr = text.trim();
      if (!isValidSolana(addr)) {
        await bot.sendMessage(chatId, '❌ فرمت آدرس Solana نامعتبر است! لطفاً آدرس معتبر SPL ارسال کنید:');
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE users SET trust_wallet_solana = ?, trust_wallet_verified = 1, trust_wallet_connected_at = datetime('now') WHERE id = ?`
      ).bind(addr, user.id).run();
      user.trust_wallet_solana = addr;
      await clearState();
      await bot.sendMessage(chatId, `✅ آدرس Solana تراست‌ولت شما ثبت شد:\n\`${addr}\``, {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
      });
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TW_TON') {
      const addr = text.trim();
      if (!isValidTon(addr)) {
        await bot.sendMessage(chatId, '❌ فرمت آدرس TON نامعتبر است! آدرس باید با `EQ` یا `UQ` شروع شود:');
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE users SET trust_wallet_ton = ?, trust_wallet_verified = 1, trust_wallet_connected_at = datetime('now') WHERE id = ?`
      ).bind(addr, user.id).run();
      user.trust_wallet_ton = addr;
      await clearState();
      await bot.sendMessage(chatId, `✅ آدرس TON تراست‌ولت شما ثبت شد:\n\`${addr}\``, {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
      });
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, undefined, true);
      return { ok: true };
    }

    if (state.step === 'AWAIT_DEX_SEARCH') {
      const q = text.trim();
      await clearState();
      const results = await searchDexPairs(q).catch(() => []);
      await showDexTrendingMenu(bot, chatId, results, q);
      return { ok: true };
    }

    if (state.step === 'AWAIT_GIFT_CODE') {
      const code = text.trim().toUpperCase();
      await clearState();
      const gift = await env.DB.prepare(`SELECT * FROM gift_codes WHERE code = ? AND is_active = 1`).bind(code).first<{
        code: string;
        code_type?: string;
        plan_code: string;
        duration_days: number;
        credit_usdt?: number;
        max_uses: number;
        uses_count: number;
        expires_at: string | null;
      }>();
      if (!gift) {
        await bot.sendMessage(chatId, '❌ کد هدیه نامعتبر یا غیرفعال است.');
        return { ok: true };
      }
      if (gift.uses_count >= gift.max_uses || (gift.expires_at && Date.parse(gift.expires_at) < Date.now())) {
        await bot.sendMessage(chatId, '⏰ ظرفیت یا مهلت استفاده از این کد هدیه به پایان رسیده است.');
        return { ok: true };
      }
      const already = await env.DB.prepare(`SELECT id FROM gift_redemptions WHERE code = ? AND user_id = ?`).bind(code, user.id).first();
      if (already) {
        await bot.sendMessage(chatId, '⚠️ شما قبلاً از این کد هدیه استفاده کرده‌اید.');
        return { ok: true };
      }
      await env.DB.prepare(`INSERT INTO gift_redemptions (id, code, user_id) VALUES (?, ?, ?)`).bind(randomId('red'), code, user.id).run();
      await env.DB.prepare(`UPDATE gift_codes SET uses_count = uses_count + 1 WHERE code = ?`).bind(code).run();

      if (gift.code_type === 'WALLET' && (gift.credit_usdt ?? 0) > 0) {
        await env.DB.prepare(`UPDATE users SET wallet_balance_usdt = COALESCE(wallet_balance_usdt, 0) + ? WHERE id = ?`)
          .bind(gift.credit_usdt, user.id).run();
        await bot.sendMessage(chatId, `🎉 کد هدیه ${code} اعمال شد و مبلغ ${gift.credit_usdt} USDT به کیف پول شما اضافه گردید!`);
      } else {
        await env.DB.prepare(
          `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, admin_note)
           VALUES (?, ?, ?, 'ACTIVE', 'ADMIN_GRANT', ?, 0, datetime('now'), datetime('now', '+' || ? || ' days'), 'Telegram Gift Code')`
        ).bind(randomId('sub'), user.id, gift.plan_code, `GIFT:${code}`, gift.duration_days).run();
        await bot.sendMessage(chatId, `🎉 کد هدیه ${code} اعمال شد! اشتراک ${gift.plan_code} به مدت ${gift.duration_days} روز برای شما فعال گردید.`);
      }
      return { ok: true };
    }

    if (state.step === 'AWAIT_ADD_ADMIN' && superAdmin) {
      const targetTg = text.replace(/[^0-9]/g, '');
      await clearState();
      if (!targetTg) {
        await bot.sendMessage(chatId, '❌ آیدی عددی تلگرام نامعتبر است.', { replyKeyboard: settingsKeyboard(admin, superAdmin, uiMode) });
        return { ok: true };
      }
      const existingTarget = await env.DB.prepare('SELECT id, username FROM users WHERE telegram_id = ?').bind(targetTg).first<{ id: string; username: string }>();
      if (!existingTarget) {
        await bot.sendMessage(chatId, `⚠️ کاربر با آیدی ${targetTg} هنوز ربات را استارت نزده است. ابتدا یک بار /start بزند.`, {
          replyKeyboard: settingsKeyboard(admin, superAdmin, uiMode),
        });
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ? AND role != 'owner'`).bind(existingTarget.id).run();
      await bot.sendMessage(chatId, `✅ کاربر ${existingTarget.username} (${targetTg}) با موفقیت به لیست مدیران اضافه شد.`, {
        replyKeyboard: settingsKeyboard(admin, superAdmin, uiMode),
      });
      return { ok: true };
    }
  }

  // Main Menu Handlers
  if (text === '🚀 راه‌اندازی ۴ مرحله‌ای ربات') {
    await showSimpleWizardStep(bot, chatId, 1);
    return { ok: true };
  }

  if (text === '⚡ رفتن به حالت حرفه‌ای' || text === '🌱 رفتن به حالت ساده') {
    const nextMode: 'simple' | 'pro' = text.includes('حرفه‌ای') ? 'pro' : 'simple';
    await env.DB.prepare(`UPDATE users SET ui_mode = ? WHERE id = ?`).bind(nextMode, user.id).run();
    user.ui_mode = nextMode;
    await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, nextMode, webAppUrl), {
      replyKeyboard: mainMenuKeyboard(webAppUrl, nextMode, admin),
    });
    return { ok: true };
  }

  if (text.startsWith('🦊 کیف‌پول Trust Wallet') || text === '🦊 Trust Wallet و DEX' || text === '/wallet') {
    await showTrustWalletMenu(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (text === '/myai') {
    let ag = await env.DB.prepare(`SELECT name, system_rules_json, is_active_for_trading FROM user_ai_agents WHERE user_id = ?`)
      .bind(user.id)
      .first<{ name: string; system_rules_json: string; is_active_for_trading: number }>()
      .catch(() => null);
    if (!ag) {
      await env.DB.prepare(`INSERT OR IGNORE INTO user_ai_agents (id, user_id, name, system_rules_json) VALUES (?, ?, 'هوش مصنوعی شخصی من', ?)`)
        .bind(randomId('myai'), user.id, JSON.stringify(DEFAULT_TRAINED_RULES))
        .run();
      ag = { name: 'هوش مصنوعی شخصی من', system_rules_json: JSON.stringify(DEFAULT_TRAINED_RULES), is_active_for_trading: 0 };
    }
    let rules: TrainedAIRules = DEFAULT_TRAINED_RULES;
    try {
      rules = { ...DEFAULT_TRAINED_RULES, ...JSON.parse(ag.system_rules_json || '{}') };
    } catch { /* default */ }
    await bot.sendMessage(
      chatId,
      `🧠 **${ag.name}** (${ag.is_active_for_trading ? '🟢 فعال روی ربات' : '⚪️ آماده آموزش'})\n\n` +
        `• تایم‌فریم: ${rules.timeframe} | سبک: ${rules.style}\n` +
        `• ارزها: ${rules.symbols.join('، ')}\n` +
        `• SL ${rules.stopLossPct}% / TP ${rules.takeProfitPct}% | اهرم ${rules.maxLeverage}x`,
      {
        inlineKeyboard: [
          [{ text: '✍️ آموزش جدید به هوش مصنوعی من', callback_data: 'tg_myai_train', style: 'primary' }],
          [{ text: '🚀 فعال‌سازی ترید خودکار با هوش مصنوعی من', callback_data: 'tg_myai_activate', style: 'success' }],
        ],
      }
    );
    return { ok: true };
  }

  if (text === '🔍 رادار DexScreener و توکن داغ' || text === '🔍 اسکنر DEX' || text === '/dex') {
    await showDexTrendingMenu(bot, chatId);
    return { ok: true };
  }

  if (text === '🧩 اکستنشن و ویجت موبایل') {
    await showExtensionWidgetsMenu(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (text === 'اتصال به صرافی 🔗' || text === 'تغییر API صرافی 📡') {
    await bot.sendMessage(
      chatId,
      `🔗 انتخاب بستر معاملاتی دلارینو\n\n` +
      `• 🦊 Trust Wallet DApp: ترید مستقیم روی همه شبکه‌ها (EVM, Solana, TON, TRON)\n` +
      `• 🟢 Toobit (توبیت): اتصال مستقیم API فیوچرز با اجرای سریع\n` +
      `• 🟠 Bitunix (بیت‌یونیکس): اتصال مستقیم فیوچرز بدون نیاز به رله و بدون KYC اجباری\n` +
      `• 🔵 KCEX (کی‌سی‌ای‌ایکس): ۰٪ کارمزد میکر (Mirror و لینک مستقیم پوزیشن)\n` +
      `• 🧪 Paper Mode: شبیه‌ساز آزمایشی\n\n` +
      `گزینه مورد نظر خود را انتخاب کنید:`,
      { replyKeyboard: exchangeSelectionKeyboard() }
    );
    return { ok: true };
  }

  if (text === '/card' || text === 'کارت سود دلارینو 📊') {
    await bot.sendMessage(
      chatId,
      `📊 صدور کارت سود تاییدشده دلارینو:\n\nبازه زمانی و قالب دلخواه خود را انتخاب کنید تا تصویر رسمی با لوگوی دلارینو، مهر حساب واقعی/دمو و QR اصالت‌سنجی صادر شود:`,
      {
        inlineKeyboard: [
          [
            { text: '۲۴ ساعته (24H)', callback_data: 'tg_profit_issue:24H:horizontal', style: 'primary' },
            { text: 'هفتگی (7D)', callback_data: 'tg_profit_issue:7D:horizontal', style: 'success' },
          ],
          [
            { text: 'ماهانه (30D)', callback_data: 'tg_profit_issue:30D:horizontal', style: 'primary' },
            { text: 'سالانه (1Y)', callback_data: 'tg_profit_issue:1Y:horizontal', style: 'primary' },
          ],
          [
            { text: 'کل دوره (ALL · افقی)', callback_data: 'tg_profit_issue:ALL:horizontal', style: 'success' },
            { text: '📱 استوری عمودی (7D)', callback_data: 'tg_profit_issue:7D:vertical', style: 'primary' },
          ],
        ],
      }
    );
    return { ok: true };
  }

  if (text === '🏆 کپی‌ترید تاییدشده' || text === '🏆 کپی‌ترید' || text === '/copy') {
    const traders = await env.DB.prepare(
      `SELECT id, display_name, specialty, win_rate, roi_30d_pct, followers_count FROM copy_traders WHERE is_active = 1 AND is_verified = 1 ORDER BY roi_30d_pct DESC LIMIT 6`
    ).all<{ id: string; display_name: string; specialty: string; win_rate: number; roi_30d_pct: number; followers_count: number }>().catch(() => ({ results: [] }));
    const lines = traders.results.length
      ? traders.results.map((t, i) => `${i + 1}. ✅ ${t.display_name} (${t.specialty})\n   نرخ برد: ${t.win_rate}% | بازده ۳۰روزه: +${t.roi_30d_pct}%`).join('\n\n')
      : 'در حال حاضر تریدری ثبت نشده است.';
    const kb: InlineKeyboardButton[][] = traders.results.map((t) => [
      { text: `📌 کپی از ${t.display_name}`, callback_data: `tg_copy_follow:${t.id}`, style: 'success' },
    ]);
    await bot.sendMessage(chatId, `🏆 کپی‌تریدرهای تاییدشده دلارینو:\n\n${lines}`, { inlineKeyboard: kb });
    return { ok: true };
  }

  if (text === '🎯 استراتژی شکار') {
    const hasHttps = webAppUrl.startsWith('https://');
    await bot.sendMessage(
      chatId,
      `🎯 موتور ۳: استراتژی شکار دلارینو\n\nشاخه مورد نظر خود را انتخاب کنید:`,
      {
        inlineKeyboard: [
          [
            { text: '⚡️ استراتژی‌های آماده ما', callback_data: 'tg_hunt_ready', style: 'success' },
            ...(hasHttps
              ? [{ text: '🛠 استراتژی شخصی خودتان (IDE)', web_app: { url: `${webAppUrl}/?tab=radar` }, style: 'primary' as const }]
              : [{ text: '🛠 استراتژی شخصی', callback_data: 'tg_hunt_personal', style: 'primary' as const }]),
          ],
        ],
      }
    );
    return { ok: true };
  }

  if (text === '💬 پشتیبانی آنلاین' || text === '💬 پشتیبانی' || text === '/support') {
    await setState({ step: 'AWAIT_SUPPORT_MSG' });
    const supportId = await getSystemSetting(env.DB, 'telegram_support', OFFICIAL_BOT_HANDLE);
    const safeSup = /Dollarino_admin/i.test(supportId) ? OFFICIAL_BOT_HANDLE : supportId;
    await bot.sendMessage(
      chatId,
      `💬 پشتیبانی هوشمند و آنلاین دلارینو (${safeSup})\n\n` +
      `سوال، مشکل یا <b>عکس / اسکرین‌شات</b> خود را همین‌جا ارسال کنید تا هوش مصنوعی پشتیبانی فوری بررسی و پاسخ دهد. هر زمان خواستید می‌توانید از دکمه زیر مستقیم با <b>مدیران انسانی</b> گفتگو کنید.\n\n` +
      `${ANTI_SCAM_WARNING_FA}`,
      {
        inlineKeyboard: [
          [{ text: '👨‍💼 اتصال مستقیم به مدیران پشتیبانی', callback_data: 'tg_support_human:new', style: 'primary' }],
        ],
      }
    );
    return { ok: true };
  }

  if (text.startsWith('Toobit')) {
    await setState({ step: 'AWAIT_API_KEY', provider: 'toobit' });
    await bot.sendMessage(
      chatId,
      `🟢 راهنمای اتصال به صرافی Toobit:\n` +
      `۱. وارد اپلیکیشن یا سایت Toobit > بخش API Management شوید.\n` +
      `۲. یک کلید با دسترسی Trade / Futures Trade بسازید (دسترسی Withdraw را حتماً خاموش بگذارید).\n` +
      `۳. اکنون API Key خود را ارسال کنید:`,
      { removeKeyboard: true }
    );
    return { ok: true };
  }

  if (text.startsWith('Bitunix')) {
    await setState({ step: 'AWAIT_API_KEY', provider: 'bitunix' });
    await bot.sendMessage(
      chatId,
      `🟠 راهنمای اتصال به صرافی Bitunix:\n` +
      `۱. وارد اپلیکیشن یا سایت Bitunix > بخش API Management شوید.\n` +
      `۲. کلید API را با دسترسی Futures Trade بسازید (دسترسی Withdraw را خاموش بگذارید).\n` +
      `۳. اکنون API Key خود را ارسال کنید:`,
      { removeKeyboard: true }
    );
    return { ok: true };
  }

  if (text.startsWith('KCEX')) {
    await setState({ step: 'AWAIT_API_KEY', provider: 'kcex' });
    await bot.sendMessage(
      chatId,
      `🔵 راهنمای اتصال به صرافی KCEX:\n` +
      `۱. وارد بخش API Management یا اطلاعات نشست حساب KCEX خود شوید (توصیه: بدون دسترسی برداشت).\n` +
      `۲. همچنین کانال رسمی @Dollarino_official برای همگام‌سازی سیگنال‌ها فعال است.\n` +
      `۳. اکنون API Key (یا شناسه اتصال KCEX) خود را ارسال کنید:`,
      { removeKeyboard: true }
    );
    return { ok: true };
  }

  if (text.startsWith('Paper Mode')) {
    const ent = await resolveUserEntitlement(env.DB, {
      id: user.id,
      email: user.email,
      username: user.username,
      role: (user.role as AuthUser['role']) || 'user',
      telegramId: tgId,
    });
    if (ent.subscriptionRequired && !ent.hasPaidPlan) {
      await showSubscriptionMenu(env, bot, chatId, user, tgId);
      return { ok: true };
    }
    await env.DB.prepare(`UPDATE bot_configs SET trading_mode = 'PAPER' WHERE user_id = ?`).bind(user.id).run();
    const { adapter } = await resolveUserExchangeAdapter(env, user.id, 'paper');
    const bal = await adapter.getBalance();
    await bot.sendMessage(chatId, `✅ حالت شبیه‌ساز حساب فعال شد:\n\n${formatBalanceCard('PAPER', bal)}`, {
      replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
    });
    return { ok: true };
  }

  if (text === 'تنظیمات ⚙️' || text === '/settings') {
    await bot.sendMessage(chatId, '⚙️ منوی تنظیمات ربات دلارینو:', {
      replyKeyboard: settingsKeyboard(admin, superAdmin, uiMode),
    });
    return { ok: true };
  }

  if (text === '🎛 انتخاب روش ترید') {
    const cfg = await env.DB.prepare('SELECT strategy_key, bot_state FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ strategy_key: string; bot_state: string }>();
    const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
    await bot.sendMessage(
      chatId,
      `🎛 **انتخاب روش معاملاتی ربات:**\nروش فعلی: **${resolveEngineDisplayLabel(cfg?.strategy_key)}**\n\nیکی از موتورهای زیر را انتخاب کنید:`,
      { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', isRunning, uiMode) }
    );
    return { ok: true };
  }

  if (text === 'تنظیم نوع بازار (اسپات/فیوچرز) ⚖️' || text === '⚖️ اسپات / فیوچرز') {
    const cfg = await env.DB.prepare('SELECT market_type FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ market_type?: string }>();
    await bot.sendMessage(
      chatId,
      `⚖️ بازار فعلی ربات: ${cfg?.market_type === 'SPOT' ? 'اسپات (Spot · 1x)' : 'فیوچرز (Futures)'}\nنوع بازار مورد نظر را انتخاب کنید:`,
      {
        inlineKeyboard: [
          [
            { text: '📈 فیوچرز (Futures)', callback_data: 'set_mkt:FUTURES' },
            { text: '🪙 اسپات (Spot)', callback_data: 'set_mkt:SPOT' },
          ],
        ],
      }
    );
    return { ok: true };
  }

  if (text === 'جهت معاملات (لانگ/شورت) ↕️' || text === '↕️ جهت معاملات') {
    const cfg = await env.DB.prepare('SELECT direction_mode, hedge_mode FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ direction_mode?: string; hedge_mode?: number }>();
    await bot.sendMessage(
      chatId,
      `↕️ جهت فعلی معاملات: ${cfg?.direction_mode ?? 'BOTH'}\n🛡 حالت هج (لانگ و شورت هم‌زمان): ${cfg?.hedge_mode ? 'فعال' : 'غیرفعال'}\n\nجهت معاملات ربات را انتخاب کنید:`,
      {
        inlineKeyboard: [
          [{ text: '↕️ هر دو جهت (Long + Short)', callback_data: 'set_dir:BOTH' }],
          [
            { text: '🟢 فقط لانگ (Long Only)', callback_data: 'set_dir:LONG_ONLY' },
            { text: '🔴 فقط شورت (Short Only)', callback_data: 'set_dir:SHORT_ONLY' },
          ],
          [{ text: `🛡 تغییر حالت هج (${cfg?.hedge_mode ? 'روشن ✅' : 'خاموش'})`, callback_data: 'toggle_hedge' }],
        ],
      }
    );
    return { ok: true };
  }

  if (text === '📈 معاملات باز' || text === '/positions') {
    const openRows = await env.DB.prepare(
      `SELECT id, symbol, direction, market_type, entry_price, leverage, margin_used, current_stop_loss, tp1 FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 8`
    ).bind(user.id).all<{
      id: string;
      symbol: string;
      direction: 'LONG' | 'SHORT';
      market_type?: string;
      entry_price: string;
      leverage: number;
      margin_used: string;
      current_stop_loss: string;
      tp1: string;
    }>();
    if (!openRows.results.length) {
      await bot.sendMessage(chatId, '📭 در حال حاضر هیچ معامله بازی روی حساب شما نیست.', {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '/terminal'),
      });
      return { ok: true };
    }
    const lines = openRows.results.map(
      (t, idx) =>
        `${idx + 1}. ${t.direction === 'LONG' ? '🟢' : '🔴'} ${t.symbol} (${t.market_type || 'FUTURES'} ${t.leverage}x)\n   ورود: ${t.entry_price} | SL: ${t.current_stop_loss} | TP1: ${t.tp1}`
    ).join('\n\n');
    const closeButtons: InlineKeyboardButton[][] = openRows.results.map((t) => [
      { text: `❌ بستن ${t.symbol} (${t.direction})`, callback_data: `close_pos:${t.id}` },
    ]);
    if (webAppUrl.startsWith('https://')) {
      closeButtons.push([{ text: '🚀 مدیریت کامل در مینی‌اپ', web_app: { url: `${webAppUrl}/terminal` } }]);
    }
    await bot.sendMessage(chatId, `📈 معاملات باز فعلی (${openRows.results.length}):\n\n${lines}`, {
      inlineKeyboard: closeButtons,
    });
    return { ok: true };
  }

  if (text === '🟢 شروع خودکار ربات' || text === '🟢 شروع خودکار ربات (یک کلیک)' || text === '🟢 شروع سریع ربات' || text === '/autostart') {
    await clearState();
    const res = await startBotOneClickForTelegram({
      env,
      bot,
      chatId,
      user,
      tgId,
      webAppUrl,
    });
    if (!res.ok && res.text === 'NEED_SUBSCRIPTION') {
      await showSubscriptionMenu(env, bot, chatId, user, tgId);
      return { ok: true };
    }
    await bot.sendMessage(chatId, res.text, {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', res.ok, uiMode),
    });
    return { ok: true };
  }

  if (text === '⚡️ شکار فوری AI' || text === '⚡️ شکار و ترید فوری AI' || text === '/scan') {
    await clearState();
    await bot.sendMessage(chatId, '⚡️ در حال تحلیل لحظه‌ای ۵ نماد اصلی با هوش مصنوعی دلارینو و اجرای خودکار سیگنال معتبر...');
    const res = await runInstantAiAutoTradeForTelegram({ env, user, tgId });
    if (res.needSubscription) {
      await showSubscriptionMenu(env, bot, chatId, user, tgId);
      return { ok: true };
    }
    await bot.sendMessage(chatId, res.text, {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', true, uiMode),
    });
    return { ok: true };
  }

  if (text === 'اتوترید 🤖') {
    await bot.sendMessage(chatId, '🤖 وضعیت اجرای خودکار سیگنال‌ها (Auto-Trade) را انتخاب کنید:', {
      inlineKeyboard: [
        [
          { text: 'روشن کردن اتوترید 🟢', callback_data: 'toggle_auto_on' },
          { text: 'خاموش کردن 🔴', callback_data: 'toggle_auto_off' },
        ],
      ],
    });
    return { ok: true };
  }

  if (text === 'دستی ترید 💪') {
    await env.DB.prepare(`UPDATE bot_configs SET trade_execution_mode = 'MANUAL_CONFIRM' WHERE user_id = ?`)
      .bind(user.id).run();
    await bot.sendMessage(chatId, '💪 حالت دستی ترید فعال شد! از این پس زیر هر سیگنال دکمه «👈 دلارینو ترید کن برام 👉» برای تایید شما ارسال می‌شود.');
    return { ok: true };
  }

  if (text === 'دریافت موجودی صرافی 💳' || text === '/balance') {
    const cfg = await env.DB.prepare('SELECT trading_mode, market_type FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trading_mode: string; market_type?: 'SPOT' | 'FUTURES' }>();
    const { adapter, provider } = await resolveUserExchangeAdapter(
      env,
      user.id,
      cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
    );
    const bal = await adapter.getBalance(cfg?.market_type ?? 'FUTURES');
    await bot.sendMessage(chatId, formatBalanceCard(`${provider} (${cfg?.market_type ?? 'FUTURES'})`, bal));
    return { ok: true };
  }

  if (text === 'تنظیم مقادیر معاملات 🪛') {
    await showTradeQuantitiesMenu(env, bot, chatId, user.id);
    return { ok: true };
  }

  if (text === 'دریافت اعلان 🔔') {
    const cfg = await env.DB.prepare('SELECT notifications_enabled FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ notifications_enabled: number }>();
    const next = cfg?.notifications_enabled ? 0 : 1;
    await env.DB.prepare('UPDATE bot_configs SET notifications_enabled = ? WHERE user_id = ?').bind(next, user.id).run();
    await bot.sendMessage(chatId, next ? '🔔 اعلان‌های باز و بسته شدن معاملات روشن شد.' : '🔕 اعلان‌های ربات خاموش شد.');
    return { ok: true };
  }

  if (text === 'حساب کاربری 👤') {
    await showAccountCard(env, bot, chatId, user, tgId, webAppUrl);
    return { ok: true };
  }

  if (text === 'ربات و هوش مصنوعی من 🤖') {
    const [bots, aiSummary, cfg] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as cnt FROM telegram_bots WHERE user_id = ?').bind(user.id).first<{ cnt: number }>(),
      getPlatformAISummary(env),
      env.DB.prepare('SELECT strategy_key, bot_state, market_type, direction_mode, hedge_mode FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ strategy_key: string; bot_state: string; market_type?: string; direction_mode?: string; hedge_mode?: number }>(),
    ]);
    const stratName =
      cfg?.strategy_key === 'ai_autonomous_agent'
        ? 'هوش مصنوعی دلارینو'
        : cfg?.strategy_key === 'dollarino_v01'
          ? 'استراتژی منتخب دلارینو (موتور دُرنا V1)'
          : cfg?.strategy_key || 'استراتژی منتخب دلارینو';
    const running = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
    await bot.sendMessage(
      chatId,
      `🤖 وضعیت ربات و هوش مصنوعی دلارینو:\n\n` +
      `🔹 وضعیت فعلی: ${running ? '🟢 روشن و فعال' : '🔴 متوقف'}\n` +
      `🔹 بازار و جهت: ${cfg?.market_type ?? 'FUTURES'} | ${cfg?.direction_mode ?? 'BOTH'}${cfg?.hedge_mode ? ' | Hedge Mode 🛡' : ''}\n` +
      `🔹 استراتژی انتخاب‌شده: ${stratName}\n` +
      `🔹 موتور هوش مصنوعی دلارینو: ${aiSummary.effectiveModeLabelFa}\n` +
      `🔹 ربات‌های کپی ترید دلارینو متصل: ${bots?.cnt ?? 0}\n\n` +
      `با یک لمس ربات را روشن/خاموش کنید یا وارد ترمینال مینی‌اپ شوید:`,
      { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '/terminal') }
    );
    return { ok: true };
  }

  if (text === 'خرید اشتراک 💎') {
    await showSubscriptionMenu(env, bot, chatId, user, tgId);
    return { ok: true };
  }

  if (text === 'افزایش موجودی 💰') {
    await setState({ step: 'AWAIT_TOPUP_AMOUNT' });
    await bot.sendMessage(chatId, '💰 مبلغ افزایش موجودی کیف پول را به تتر (USDT) وارد کنید (مثلاً 20):');
    return { ok: true };
  }

  if (text === 'افزودن مدیر 🔑') {
    if (!superAdmin) {
      await bot.sendMessage(chatId, '⛔️ فقط مدیر اصلی سیستم (944021185) مجاز به افزودن مدیر جدید است.');
      return { ok: true };
    }
    await setState({ step: 'AWAIT_ADD_ADMIN' });
    await bot.sendMessage(chatId, '🔑 لطفاً آیدی عددی تلگرام فردی که می‌خواهید مدیر شود را ارسال کنید:');
    return { ok: true };
  }

  // Direct photo / chart screenshot sent anytime outside specialized admin/support flows -> Instant AI Chart Vision Analysis!
  if (incomingImageFileId) {
    await handleTelegramAIChatTurn({
      env,
      bot,
      chatId,
      user,
      webAppUrl,
      text,
      imageFileId: incomingImageFileId,
    });
    return { ok: true };
  }

  if (text === '🧠 چت هوش مصنوعی (عکس چارت)' || text === '/ai' || text === '/chat') {
    await openDedicatedAIChatMenu(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (text === '👨‍💻 درباره سازنده' || text === '/about') {
    await bot.sendMessage(
      chatId,
      `🚀 **پلتفرم معاملاتی هوشمند دلارینو (Dollarino)**\n\n` +
        `${CREATOR_ATTRIBUTION_FA}\n\n` +
        `🔗 **صفحات رسمی سازنده:**\n` +
        `• تلگرام: ${DOLLARINO_CREATOR_INFO.telegramUrl}\n` +
        `• اینستاگرام: ${DOLLARINO_CREATOR_INFO.instagramUrl}\n` +
        `• توییتر (X): ${DOLLARINO_CREATOR_INFO.twitterUrl}\n\n` +
        `🧠 این ربات مجهز به هوش مصنوعی اختصاصی دلارینو، تحلیلگر تصویر چارت، استراتژی دُرنا V1، کپی‌ترید تاییدشده و کیف‌پول Trust Wallet DEX است.`,
      { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) }
    );
    return { ok: true };
  }

  if (text === 'راهنما 📚' || text === '/help') {
    const [helpText, helpMedia, supportId] = await Promise.all([
      getSystemSetting(env.DB, 'bot_help_text', ''),
      getSystemSetting(env.DB, 'bot_help_media_url', ''),
      getSystemSetting(env.DB, 'telegram_support', OFFICIAL_BOT_HANDLE),
    ]);
    const safeSup = /Dollarino_admin/i.test(supportId) ? OFFICIAL_BOT_HANDLE : supportId;
    const rawHelp = (helpText || (await getSystemSetting(env.DB, 'help_text', '📚 راهنمای دلارینو در پنل وب در دسترس است.'))).replace(/\\n/g, '\n');
    const caption = `${rawHelp}\n\n${CREATOR_ATTRIBUTION_FA}\n\n🆘 پشتیبانی رسمی: ${safeSup}\n${ANTI_SCAM_WARNING_FA}`;
    const faqKb: InlineKeyboardButton[][] | undefined = webAppUrl.startsWith('https://')
      ? [[{ text: '🚀 راهنمای کامل در مینی‌اپ دلارینو', web_app: { url: `${webAppUrl.replace(/\/$/, '')}/faq` }, style: 'primary' }]]
      : undefined;
    if (helpMedia && helpMedia.startsWith('https://')) {
      if (/\.(mp4|mov|webm)(\?|$)/i.test(helpMedia)) {
        await bot.sendVideo(chatId, helpMedia, caption).catch(() => bot.sendMessage(chatId, caption, { inlineKeyboard: faqKb }));
      } else {
        await bot.sendPhoto(chatId, helpMedia, caption).catch(() => bot.sendMessage(chatId, caption, { inlineKeyboard: faqKb }));
      }
    } else {
      await bot.sendMessage(chatId, caption, { inlineKeyboard: faqKb });
    }
    return { ok: true };
  }

  if ((text === 'پنل مدیریت 💼' || text === '/admin') && admin) {
    await openAdminPanelHome(env, bot, chatId, buildAdminActor(user, tgId, env));
    return { ok: true };
  }

  // Fallback 1: if user pasted a raw Dollarino Signal straight into the bot chat!
  const directSignal = parseDollarinoSignal(text);
  if (directSignal) {
    const sigId = randomId('sig');
    await env.DB.prepare(
      `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status)
       VALUES (?, ?, 'manual_test', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
    ).bind(
      sigId,
      user.id,
      directSignal.symbol,
      directSignal.direction,
      directSignal.timeframe,
      directSignal.price,
      directSignal.stopLoss,
      directSignal.leverage,
      directSignal.tp1,
      directSignal.tp2 ?? null,
      directSignal.tp3 ?? null,
      formatDollarinoSignal(directSignal)
    ).run();

    await bot.sendMessage(chatId, `📡 سیگنال شناسایی شد! مایلید معامله را اجرا کنم؟\n\n${formatDollarinoSignal(directSignal)}`, {
      inlineKeyboard: [[{ text: '👈 دلارینو ترید کن برام 👉', callback_data: `manual_trade:${sigId}` }]],
    });
    return { ok: true };
  }

  // Fallback 2: Free-form message -> respond naturally as Dollarino Dedicated AI (like ChatGPT/Claude)!
  await handleTelegramAIChatTurn({
    env,
    bot,
    chatId,
    user,
    webAppUrl,
    text,
  });
  return { ok: true };
}
