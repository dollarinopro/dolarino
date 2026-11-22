import {
  formatDollarinoSignal,
  resolveEngineDisplayLabel,
  type Direction,
  type DollarinoSignal,
} from '@dollarino/core';
import { renderProfitCardPng, renderSignalClosedCardPng } from '../cards/renderer.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { TelegramBotClient, type InlineKeyboardButton } from './client.js';
import {
  channelNewsInlineButtons,
  channelSignalInlineButtons,
  copyTradePublishConfirmButtons,
  formatTradeClosedCard,
  OFFICIAL_CHANNEL_HANDLE,
  RESULTS_CHANNEL_INVITE,
  SIGNALS_CHANNEL_INVITE,
} from './formatter.js';

export async function getSystemSettingValue(db: D1Database, key: string, fallback: string): Promise<string> {
  const row = await db.prepare('SELECT value FROM system_settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>()
    .catch(() => null);
  return row?.value || fallback;
}

export async function resolveChannelAndBotConfig(env: Env): Promise<{
  channelHandle: string;
  signalsChannelId: string;
  signalsChannelInvite: string;
  resultsChannelId: string;
  resultsChannelInvite: string;
  botUsername: string;
  webAppUrl: string;
}> {
  const [channelRaw, sigChanRaw, sigInviteRaw, resChanRaw, resInviteRaw, botUserRaw, webUrlRaw] = await Promise.all([
    getSystemSettingValue(env.DB, 'official_channel', env.DEFAULT_SIGNAL_CHANNEL || OFFICIAL_CHANNEL_HANDLE),
    getSystemSettingValue(env.DB, 'signals_channel_id', ''),
    getSystemSettingValue(env.DB, 'signals_channel_invite', SIGNALS_CHANNEL_INVITE),
    getSystemSettingValue(env.DB, 'results_channel_id', ''),
    getSystemSettingValue(env.DB, 'results_channel_invite', RESULTS_CHANNEL_INVITE),
    getSystemSettingValue(env.DB, 'bot_username', 'Dollarino_bot'),
    getSystemSettingValue(env.DB, 'public_web_url', env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev'),
  ]);
  const norm = (val: string) => {
    const t = val.trim();
    if (!t) return '';
    return t.startsWith('@') || t.startsWith('-100') || /^-?\d+$/.test(t) ? t : `@${t}`;
  };
  return {
    channelHandle: norm(channelRaw) || OFFICIAL_CHANNEL_HANDLE,
    signalsChannelId: norm(sigChanRaw),
    signalsChannelInvite: sigInviteRaw.trim() || SIGNALS_CHANNEL_INVITE,
    resultsChannelId: norm(resChanRaw),
    resultsChannelInvite: resInviteRaw.trim() || RESULTS_CHANNEL_INVITE,
    botUsername: botUserRaw.replace(/^@/, '') || 'Dollarino_bot',
    webAppUrl: webUrlRaw.replace(/\/$/, ''),
  };
}

export async function notifyAllAdmins(
  env: Env,
  text: string,
  options?: { inlineKeyboard?: InlineKeyboardButton[][] }
): Promise<number> {
  if (!env.TELEGRAM_BOT_TOKEN) return 0;
  const admins = await env.DB.prepare(
    `SELECT DISTINCT telegram_id FROM users WHERE role IN ('owner', 'admin') AND telegram_id IS NOT NULL AND telegram_id != ''`
  ).all<{ telegram_id: string }>().catch(() => ({ results: [] }));

  const targets = new Set<string>();
  if (env.OWNER_TELEGRAM_ID?.trim()) targets.add(env.OWNER_TELEGRAM_ID.trim());
  for (const r of admins.results) {
    if (r.telegram_id?.trim()) targets.add(r.telegram_id.trim());
  }

  const tg = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
  let sent = 0;
  for (const chatId of targets) {
    try {
      await tg.sendMessage(chatId, text, options);
      sent++;
    } catch {
      // Ignore unreachable admin chat
    }
  }
  return sent;
}

export async function notifyAllAdminsPhoto(
  env: Env,
  imageDataUrl: string,
  caption: string,
  options?: { inlineKeyboard?: InlineKeyboardButton[][] }
): Promise<number> {
  if (!env.TELEGRAM_BOT_TOKEN) return 0;
  const admins = await env.DB.prepare(
    `SELECT DISTINCT telegram_id FROM users WHERE role IN ('owner', 'admin') AND telegram_id IS NOT NULL AND telegram_id != ''`
  ).all<{ telegram_id: string }>().catch(() => ({ results: [] }));

  const targets = new Set<string>();
  if (env.OWNER_TELEGRAM_ID?.trim()) targets.add(env.OWNER_TELEGRAM_ID.trim());
  for (const r of admins.results) {
    if (r.telegram_id?.trim()) targets.add(r.telegram_id.trim());
  }

  const tg = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
  let sent = 0;
  for (const chatId of targets) {
    try {
      await tg.sendDataUrlPhoto(chatId, imageDataUrl, caption, options);
      sent++;
    } catch {
      try {
        await tg.sendMessage(chatId, caption, options);
        sent++;
      } catch {
        // Ignore unreachable admin chat
      }
    }
  }
  return sent;
}

export async function publishSignalBroadcast(
  env: Env,
  params: {
    signalId?: string;
    signal: DollarinoSignal;
    source: string;
    engineKey?: string;
    engineLabel?: string;
    publishToChannel?: boolean;
    notifySubscribers?: boolean;
  }
): Promise<{
  signalId: string;
  channelMessageId?: number;
  channelError?: string;
  subscribersNotified: number;
}> {
  const cfg = await resolveChannelAndBotConfig(env);
  const signalId = params.signalId || randomId('sig');
  const engineLabel = resolveEngineDisplayLabel(params.engineKey || params.signal.engineKey, params.engineLabel || params.signal.engineLabel);
  const fullSignal: DollarinoSignal = {
    ...params.signal,
    channelHandle: cfg.channelHandle,
    engineKey: params.engineKey || params.signal.engineKey,
    engineLabel,
  };
  const formattedText = formatDollarinoSignal(fullSignal);

  const existing = await env.DB.prepare(`SELECT id FROM signals WHERE id = ?`).bind(signalId).first().catch(() => null);
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO signals (
        id, source, symbol, direction, timeframe, price, stop_loss, leverage,
        tp1, tp2, tp3, raw_text, status, engine_source, engine_label, channel_chat_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSED', ?, ?, ?)`
    ).bind(
      signalId,
      params.source,
      fullSignal.symbol,
      fullSignal.direction,
      fullSignal.timeframe,
      fullSignal.price,
      fullSignal.stopLoss,
      fullSignal.leverage,
      fullSignal.tp1,
      fullSignal.tp2 ?? null,
      fullSignal.tp3 ?? null,
      formattedText,
      params.engineKey || params.source,
      engineLabel,
      cfg.channelHandle
    ).run().catch(() => {});
  }

  let channelMessageId: number | undefined;
  let channelError: string | undefined;
  let subscribersNotified = 0;

  if (!env.TELEGRAM_BOT_TOKEN) {
    return { signalId, subscribersNotified: 0, channelError: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  const tg = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
  const autoPublish = (await getSystemSettingValue(env.DB, 'auto_publish_signals_to_channel', 'true')) === 'true';
  const alsoOfficial = (await getSystemSettingValue(env.DB, 'signals_also_official', 'true')) === 'true';

  if (params.publishToChannel ?? autoPublish) {
    const primaryTarget = cfg.signalsChannelId || cfg.channelHandle;
    const targets = new Set<string>();
    if (primaryTarget) targets.add(primaryTarget);
    if (alsoOfficial && cfg.channelHandle) targets.add(cfg.channelHandle);

    const chanMarkup = channelSignalInlineButtons({
      signalId,
      botUsername: cfg.botUsername,
      webAppUrl: cfg.webAppUrl,
      forChannel: true,
      resultsChannelInvite: cfg.resultsChannelInvite,
    });

    for (const targetChat of targets) {
      try {
        const sent = await tg.sendMessage(targetChat, formattedText, {
          inlineKeyboard: chanMarkup,
        });
        if (!channelMessageId || targetChat === primaryTarget) {
          channelMessageId = sent.message_id;
          await env.DB.prepare(
            `UPDATE signals SET channel_message_id = ?, channel_chat_id = ?, engine_label = ?, engine_source = ? WHERE id = ?`
          ).bind(sent.message_id, targetChat, engineLabel, params.engineKey || params.source, signalId).run().catch(() => {});
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!channelError) channelError = errMsg;
        await notifyAllAdmins(
          env,
          `⚠️ خطای ارسال سیگنال ${fullSignal.symbol} به کانال ${targetChat}:\n${errMsg}\n\nلطفاً مطمئن شوید @${cfg.botUsername} با دسترسی ارسال پیام در کانال ادمین است.`
        ).catch(() => {});
      }
    }
  }

  if (params.notifySubscribers) {
    const subs = await env.DB.prepare(
      `SELECT DISTINCT u.telegram_id
       FROM users u
       LEFT JOIN bot_configs bc ON bc.user_id = u.id
       WHERE u.telegram_id IS NOT NULL AND u.telegram_id != ''
         AND COALESCE(u.is_blocked, 0) = 0
         AND COALESCE(bc.notifications_enabled, 1) != 0
         AND (COALESCE(u.phone_verified, 0) = 1 OR bc.bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE'))
       ORDER BY u.last_active_at DESC
       LIMIT 100`
    ).all<{ telegram_id: string }>().catch(() => ({ results: [] }));

    const inlineKb = channelSignalInlineButtons({
      signalId,
      botUsername: cfg.botUsername,
      webAppUrl: cfg.webAppUrl,
      forChannel: false,
    });
    for (let i = 0; i < subs.results.length; i += 10) {
      const batch = subs.results.slice(i, i + 10);
      const settled = await Promise.allSettled(
        batch.map((s) => tg.sendMessage(s.telegram_id, formattedText, { inlineKeyboard: inlineKb }))
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') subscribersNotified++;
      }
    }
  }

  return { signalId, channelMessageId, channelError, subscribersNotified };
}

export async function publishSignalClosedCard(
  env: Env,
  params: {
    tradeId: string;
    userId: string;
    signalId?: string | null;
    symbol: string;
    direction: Direction;
    leverage: number;
    mode: 'LIVE' | 'PAPER';
    strategyKey?: string | null;
    engineLabel?: string | null;
    entryPrice: string;
    exitPrice: string;
    stopLoss: string;
    tp1: string;
    tp1Hit: boolean;
    tp2Hit: boolean;
    tp3Hit: boolean;
    trailingActive: boolean;
    trailingSl?: string;
    pnlUsd: number;
    pnlPct: number;
    reason: string;
    openedAt?: string | null;
    closedAt?: string | null;
  }
): Promise<void> {
  const cfg = await resolveChannelAndBotConfig(env);
  const engineLabel = resolveEngineDisplayLabel(params.strategyKey, params.engineLabel);
  const cardId = `SIG-${randomId('').slice(0, 10).toUpperCase()}`;
  const closedAt = params.closedAt ?? new Date().toISOString();
  const openedAt = params.openedAt ?? closedAt;

  const caption = formatTradeClosedCard({
    symbol: params.symbol,
    direction: params.direction,
    entryPrice: params.entryPrice,
    exitPrice: params.exitPrice,
    pnlUsd: params.pnlUsd,
    pnlPct: params.pnlPct,
    reason: params.reason,
    openedAt,
    closedAt,
    stopLoss: params.stopLoss,
    tp1: params.tp1,
    leverage: params.leverage,
    tp1Hit: params.tp1Hit,
    tp2Hit: params.tp2Hit,
    tp3Hit: params.tp3Hit,
    trailingActive: params.trailingActive,
    trailingSl: params.trailingSl,
    engineKey: params.strategyKey || undefined,
    engineLabel,
    mode: params.mode,
  });

  await env.DB.prepare(
    `UPDATE trades SET closed_card_id = ?, engine_label = ? WHERE id = ?`
  ).bind(cardId, engineLabel, params.tradeId).run().catch(() => {});

  if (params.signalId) {
    await env.DB.prepare(
      `UPDATE signals SET tp1_hit = ?, tp2_hit = ?, tp3_hit = ?, trailing_sl = ?, closed_card_id = ? WHERE id = ?`
    ).bind(
      params.tp1Hit ? 1 : 0,
      params.tp2Hit ? 1 : 0,
      params.tp3Hit ? 1 : 0,
      params.trailingSl || params.stopLoss,
      cardId,
      params.signalId
    ).run().catch(() => {});
  }

  if (!env.TELEGRAM_BOT_TOKEN) return;
  const tg = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);

  const pngBytes = await renderSignalClosedCardPng({
    cardId,
    symbol: params.symbol,
    direction: params.direction,
    leverage: params.leverage,
    engineLabel,
    mode: params.mode,
    entryPrice: params.entryPrice,
    exitPrice: params.exitPrice,
    pnlUsd: params.pnlUsd,
    pnlPct: params.pnlPct,
    tp1Hit: params.tp1Hit,
    tp2Hit: params.tp2Hit,
    tp3Hit: params.tp3Hit,
    trailingActive: params.trailingActive,
    trailingSlPrice: params.trailingSl || params.stopLoss,
    closeReason: params.reason,
    openedAt,
    closedAt,
    layout: 'horizontal',
  }).catch(() => null);

  // 1. Send card to user's private Telegram if notifications enabled
  const userRow = await env.DB.prepare(
    `SELECT u.telegram_id, bc.notifications_enabled
     FROM users u LEFT JOIN bot_configs bc ON bc.user_id = u.id
     WHERE u.id = ? LIMIT 1`
  ).bind(params.userId).first<{ telegram_id: string | null; notifications_enabled: number | null }>().catch(() => null);

  if (userRow?.telegram_id && userRow.notifications_enabled !== 0) {
    try {
      if (pngBytes) {
        await tg.sendPhotoBuffer(userRow.telegram_id, pngBytes, `dollarino-result-${params.symbol}.png`, caption);
      } else {
        await tg.sendMessage(userRow.telegram_id, caption);
      }
    } catch {
      // ignore unreachable user
    }
  }

  const channelMarkup: InlineKeyboardButton[][] = [
    [
      {
        text: '📡 کانال سیگنال‌ها',
        url: cfg.signalsChannelInvite,
      },
      {
        text: '🤖 شروع با ربات',
        url: `https://t.me/${cfg.botUsername}`,
        style: 'success',
      },
    ],
    [
      {
        text: '📊 تاییدیه و نتایج در سایت',
        url: cfg.webAppUrl,
        style: 'primary',
      },
    ],
  ];

  let sentToResultsChannel = false;
  // 2A. Dedicated Results Channel (when configured by admin)
  if (cfg.resultsChannelId) {
    try {
      if (pngBytes) {
        await tg.sendPhotoBuffer(cfg.resultsChannelId, pngBytes, `dollarino-result-${params.symbol}.png`, caption, {
          inlineKeyboard: channelMarkup,
        });
      } else {
        await tg.sendMessage(cfg.resultsChannelId, caption, { inlineKeyboard: channelMarkup });
      }
      sentToResultsChannel = true;
    } catch {
      // ignore results channel post failure
    }
  }

  // 2B. If tied to a channel signal message, reply directly to that signal with result card!
  if (params.signalId) {
    const sigRow = await env.DB.prepare(
      `SELECT channel_message_id, channel_chat_id FROM signals WHERE id = ? LIMIT 1`
    ).bind(params.signalId).first<{ channel_message_id: number | null; channel_chat_id: string | null }>().catch(() => null);

    if (sigRow?.channel_message_id) {
      const targetChannel = sigRow.channel_chat_id || cfg.channelHandle;
      if (!sentToResultsChannel || targetChannel !== cfg.resultsChannelId) {
        try {
          if (pngBytes) {
            await tg.sendPhotoBuffer(
              targetChannel,
              pngBytes,
              `dollarino-signal-${params.symbol}.png`,
              caption,
              {
                replyToMessageId: sigRow.channel_message_id,
                inlineKeyboard: channelMarkup,
              }
            );
          } else {
            await tg.sendMessage(targetChannel, caption, {
              replyToMessageId: sigRow.channel_message_id,
              inlineKeyboard: channelMarkup,
            });
          }
        } catch {
          // ignore channel reply failure
        }
      }
    }
  }
}

export async function publishProfitCardToTelegram(
  env: Env,
  chatId: string | number,
  card: {
    id: string;
    displayName: string;
    mode: 'LIVE' | 'PAPER';
    period: string;
    tradesCount: number;
    winRate: number;
    netPnlUsd: number;
    roiPct: number;
    profitFactor: number;
    exchangeProvider: string;
    strategyName: string;
    issuedAt: string;
  },
  layout: 'horizontal' | 'vertical' = 'horizontal'
): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const tg = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
  const pngBytes = await renderProfitCardPng({ ...card, cardId: card.id, layout }).catch(() => null);
  const caption =
    `🏆 کارت سود رسمی دلارینو (${card.mode === 'LIVE' ? 'حساب واقعی ✅' : 'حساب دمو 🧪'})\n` +
    `📊 دوره: ${card.period} | وین‌ریت: ${card.winRate}%\n` +
    `💰 سود خالص: ${card.netPnlUsd >= 0 ? '+' : '-'}$${Math.abs(card.netPnlUsd).toFixed(2)} (${card.roiPct >= 0 ? '+' : '-'}${Math.abs(card.roiPct).toFixed(2)}%)\n` +
    `🆔 @Dollarino_official`;

  if (pngBytes) {
    await tg.sendPhotoBuffer(chatId, pngBytes, `dollarino-profit-${card.id}-${layout}.png`, caption);
  } else {
    await tg.sendMessage(chatId, caption);
  }
  return true;
}

export async function publishChannelNews(
  env: Env,
  params: {
    category: 'NEWS' | 'ANALYSIS' | 'SIGNAL_UPDATE' | 'ANNOUNCEMENT' | 'ALERT' | 'PROMO';
    title: string;
    body: string;
    mediaUrl?: string;
    buttonLabel?: string;
    buttonUrl?: string;
    createdBy?: string;
    notifyBotUsers?: boolean;
  }
): Promise<{ id: string; channelMessageId?: number; usersNotified: number; error?: string }> {
  const cfg = await resolveChannelAndBotConfig(env);
  const id = randomId('news');
  const catBadge =
    params.category === 'ANALYSIS'
      ? '📊 تحلیل هوشمند بازار دلارینو'
      : params.category === 'ALERT'
        ? '⚠️ اخطار و هشدار مدیریت ریسک دلارینو'
        : params.category === 'PROMO'
          ? '🚀 معرفی قدرت و امکانات دلارینو'
          : params.category === 'ANNOUNCEMENT'
            ? '📣 اطلاعیه رسمی دلارینو'
            : params.category === 'SIGNAL_UPDATE'
              ? '⚡️ به‌روزرسانی سیگنال'
              : '📰 خبر فوری و نبض بازار کریپتو';

  const text =
    `${catBadge}\n\n` +
    `📌 ${params.title.trim()}\n` +
    `------------------------------------------------\n` +
    `${params.body.trim()}\n` +
    `------------------------------------------------\n` +
    `🆔 ${cfg.channelHandle} · 🤖 @${cfg.botUsername}`;

  await env.DB.prepare(
    `INSERT INTO channel_news (id, category, title, body, media_url, button_label, button_url, channel_chat_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    params.category,
    params.title.trim(),
    params.body.trim(),
    params.mediaUrl || null,
    params.buttonLabel || null,
    params.buttonUrl || null,
    cfg.channelHandle,
    params.createdBy || null
  ).run().catch(() => {});

  if (!env.TELEGRAM_BOT_TOKEN) {
    return { id, usersNotified: 0, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  const tg = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
  const markup = channelNewsInlineButtons({
    botUsername: cfg.botUsername,
    webAppUrl: cfg.webAppUrl,
    customButtonLabel: params.buttonLabel,
    customButtonUrl: params.buttonUrl,
    signalsChannelInvite: cfg.signalsChannelInvite,
    resultsChannelInvite: cfg.resultsChannelInvite,
  });

  let channelMessageId: number | undefined;
  let channelErr: string | undefined;
  try {
    const res = params.mediaUrl?.startsWith('http')
      ? await tg.sendPhoto(cfg.channelHandle, params.mediaUrl, text.slice(0, 1020), { inlineKeyboard: markup })
      : await tg.sendMessage(cfg.channelHandle, text, { inlineKeyboard: markup });
    channelMessageId = res.message_id;
    await env.DB.prepare(`UPDATE channel_news SET channel_message_id = ? WHERE id = ?`)
      .bind(res.message_id, id).run().catch(() => {});
  } catch (err) {
    channelErr = err instanceof Error ? err.message : String(err);
  }

  let usersNotified = 0;
  if (params.notifyBotUsers) {
    const users = await env.DB.prepare(
      `SELECT DISTINCT u.telegram_id
       FROM users u
       LEFT JOIN bot_configs bc ON bc.user_id = u.id
       WHERE u.telegram_id IS NOT NULL AND u.telegram_id != ''
         AND COALESCE(u.is_blocked, 0) = 0
         AND COALESCE(bc.notifications_enabled, 1) != 0
         AND COALESCE(u.phone_verified, 0) = 1
       ORDER BY u.last_active_at DESC
       LIMIT 80`
    ).all<{ telegram_id: string }>().catch(() => ({ results: [] }));

    for (let i = 0; i < users.results.length; i += 10) {
      const batch = users.results.slice(i, i + 10);
      const settled = await Promise.allSettled(
        batch.map((u) =>
          params.mediaUrl?.startsWith('http')
            ? tg.sendPhoto(u.telegram_id, params.mediaUrl, text.slice(0, 1020), { inlineKeyboard: markup })
            : tg.sendMessage(u.telegram_id, text, { inlineKeyboard: markup })
        )
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') usersNotified++;
      }
    }
  }

  return { id, channelMessageId, usersNotified, error: channelErr };
}

export async function promptCopyTraderPublish(
  env: Env,
  params: {
    traderId: string;
    traderName: string;
    traderTelegramId?: string | null;
    copyTradeId: string;
    symbol: string;
    direction: Direction;
    leverage: number;
    entryPrice: string;
    stopLoss?: string;
    tp1?: string;
    tp2?: string;
    tp3?: string;
  }
): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !params.traderTelegramId) return false;
  const tg = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
  const text =
    `🏆 تایید انتشار معامله کپی‌ترید (${params.traderName})\n\n` +
    `شما یک معامله جدید باز کردید:\n` +
    `${params.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'} · ${params.symbol} · ${params.leverage}x\n` +
    `📥 ورود: ${params.entryPrice}\n` +
    (params.stopLoss ? `⛔️ SL: ${params.stopLoss}\n` : '') +
    (params.tp1 ? `🟢 TP1: ${params.tp1}\n` : '') +
    (params.tp2 ? `🟡 TP2: ${params.tp2}\n` : '') +
    (params.tp3 ? `🟠 TP3: ${params.tp3}\n` : '') +
    `\nآیا مایلید این معامله دقیقاً با همین مشخصات برای تمام دنبال‌کنندگان کپی‌ترید منتشر و آینه‌سازی شود؟`;

  try {
    await tg.sendMessage(params.traderTelegramId, text, {
      inlineKeyboard: copyTradePublishConfirmButtons(params.copyTradeId),
    });
    return true;
  } catch {
    return false;
  }
}

export async function maybePromptCopyTraderOnNewTrade(
  env: Env,
  userId: string,
  params: {
    sourceTradeId: string;
    symbol: string;
    direction: Direction;
    leverage: number;
    entryPrice: string;
    stopLoss: string;
    tp1: string;
    tp2?: string;
    tp3?: string;
    note?: string;
  }
): Promise<{ prompted: boolean; copyTradeId?: string }> {
  const trader = await env.DB.prepare(
    `SELECT ct.id, ct.display_name, ct.telegram_id, ct.auto_ask_publish, u.telegram_id AS linked_tg_id
     FROM copy_traders ct
     LEFT JOIN users u ON u.id = ct.user_id
     WHERE ct.user_id = ? AND ct.is_active = 1
     LIMIT 1`
  ).bind(userId).first<{
    id: string;
    display_name: string;
    telegram_id: string | null;
    linked_tg_id: string | null;
    auto_ask_publish: number;
  }>().catch(() => null);

  if (!trader || trader.auto_ask_publish === 0) {
    return { prompted: false };
  }

  const copyTradeId = randomId('ctt');
  await env.DB.prepare(
    `INSERT INTO copy_trader_trades
     (id, trader_id, symbol, direction, leverage, entry_price, stop_loss, tp1, tp2, tp3, status, publish_status, source_trade_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 'PENDING_CONFIRM', ?, ?)`
  ).bind(
    copyTradeId,
    trader.id,
    params.symbol,
    params.direction,
    params.leverage,
    params.entryPrice,
    params.stopLoss,
    params.tp1,
    params.tp2 ?? null,
    params.tp3 ?? null,
    params.sourceTradeId,
    params.note || 'معامله زنده تریدر کپی‌ترید (در انتظار تایید انتشار)'
  ).run();

  const tgId = trader.telegram_id || trader.linked_tg_id;
  await promptCopyTraderPublish(env, {
    traderId: trader.id,
    traderName: trader.display_name,
    traderTelegramId: tgId,
    copyTradeId,
    symbol: params.symbol,
    direction: params.direction,
    leverage: params.leverage,
    entryPrice: params.entryPrice,
    stopLoss: params.stopLoss,
    tp1: params.tp1,
    tp2: params.tp2,
    tp3: params.tp3,
  });

  return { prompted: true, copyTradeId };
}
