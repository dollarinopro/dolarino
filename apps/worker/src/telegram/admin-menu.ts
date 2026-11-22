import { randomId } from '../crypto.js';
import { runAlwaysOnAiIntel, runAlwaysOnSignalRadar } from '../engine/market-intel.js';
import type { Env } from '../env.js';
import { TelegramBotClient, type InlineKeyboardButton } from './client.js';
import { formatIranDateTime, formatToman, mainMenuKeyboard, settingsKeyboard } from './formatter.js';
import { publishChannelNews, resolveChannelAndBotConfig } from './publisher.js';

export interface AdminPerms {
  users?: boolean;
  broadcast?: boolean;
  finance?: boolean;
  stats?: boolean;
  settings?: boolean;
}

export interface AdminActor {
  id: string;
  telegramId: string;
  role: string;
  username: string;
  perms: AdminPerms;
  isSuperAdmin: boolean;
  lastActiveAt?: string | null;
}

export interface AdminStepState {
  step: string;
  targetUserId?: string;
  targetKey?: string;
  bcTarget?: string;
  giftType?: 'SUBSCRIPTION' | 'WALLET';
  giftPlan?: string;
  giftDays?: number;
  giftCredit?: number;
  giftMaxUses?: number;
  giftExpireDays?: number;
}

const ADMIN_IDLE_MS = 15 * 60 * 1000;

export function parseAdminPerms(raw: string | null | undefined, isSuperAdmin: boolean): AdminPerms {
  if (isSuperAdmin) {
    return { users: true, broadcast: true, finance: true, stats: true, settings: true };
  }
  try {
    const parsed = raw ? (JSON.parse(raw) as AdminPerms) : {};
    return {
      users: parsed.users ?? true,
      broadcast: parsed.broadcast ?? true,
      finance: parsed.finance ?? true,
      stats: parsed.stats ?? true,
      settings: parsed.settings ?? false,
    };
  } catch {
    return { users: true, broadcast: true, finance: true, stats: true, settings: false };
  }
}

export async function getSystemSetting(db: D1Database, key: string, fallback = ''): Promise<string> {
  const row = await db.prepare(`SELECT value FROM system_settings WHERE key = ?`).bind(key).first<{ value: string }>().catch(() => null);
  return row?.value ?? fallback;
}

export async function setSystemSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`).bind(key, value).run();
}

async function auditAdmin(db: D1Database, actorId: string, message: string, details?: unknown) {
  await db.prepare(
    `INSERT INTO audit_logs (id, user_id, category, level, message, details_json) VALUES (?, ?, 'TELEGRAM', 'INFO', ?, ?)`
  ).bind(randomId('aud'), actorId, message, details ? JSON.stringify(details) : null).run().catch(() => {});
}

export async function touchAdminActivity(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`UPDATE users SET admin_panel_last_active_at = datetime('now') WHERE id = ?`).bind(userId).run().catch(() => {});
}

export function isAdminSessionExpired(lastActiveAt?: string | null): boolean {
  if (!lastActiveAt) return false;
  const norm = lastActiveAt.includes('T') || lastActiveAt.endsWith('Z') ? lastActiveAt : lastActiveAt.replace(' ', 'T') + 'Z';
  const ts = Date.parse(norm);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > ADMIN_IDLE_MS;
}

export function adminMainKeyboard(actor: AdminActor): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: '⏳ تایید اشتراک‌ها', callback_data: 'adm:tx:PENDING_REVIEW:0', style: 'success' },
      { text: '👥 کاربران', callback_data: 'adm:users', style: 'primary' },
    ],
    [
      { text: '💬 تیکت پشتیبانی', callback_data: 'adm:support', style: 'primary' },
      { text: '💰 تراکنش‌ها', callback_data: 'adm:tx:ALL:0' },
    ],
    [
      { text: '📊 آمار و درآمد', callback_data: 'adm:dash' },
      { text: '🏆 کپی‌تریدرها', callback_data: 'adm:copy' },
    ],
    [
      { text: '📡 کانال و اخبار', callback_data: 'adm:channel' },
      { text: '📨 پیام همگانی', callback_data: 'adm:broadcast' },
    ],
    [
      { text: '🎁 کد هدیه', callback_data: 'adm:gifts' },
      { text: '⚙️ تنظیمات', callback_data: 'adm:settings' },
    ],
    [
      ...(actor.isSuperAdmin ? [{ text: '🔑 مدیران', callback_data: 'adm:admins' }] : []),
      { text: '📈 گزارش', callback_data: 'adm:reports' },
      { text: '🔙 خروج', callback_data: 'adm:exit', style: 'danger' as const },
    ],
  ];
  return rows;
}

export async function openAdminPanelHome(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  actor: AdminActor,
  editMsgId?: number
) {
  await touchAdminActivity(env.DB, actor.id);
  const [uTotal, subActive, pendingTx, openTickets] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as cnt FROM users`).first<{ cnt: number }>(),
    env.DB.prepare(`SELECT COUNT(*) as cnt FROM user_subscriptions WHERE status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > datetime('now'))`).first<{ cnt: number }>(),
    env.DB.prepare(`SELECT COUNT(*) as cnt FROM user_subscriptions WHERE status = 'PENDING_REVIEW'`).first<{ cnt: number }>(),
    env.DB.prepare(`SELECT COUNT(*) as cnt FROM support_tickets WHERE status = 'OPEN'`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
  ]);
  const text =
    `💼 **پنل مدیریت جامع دلارینو**\n\n` +
    `👤 مدیر: ${actor.username} (${actor.isSuperAdmin ? 'مدیر اصلی 👑' : 'ادمین'})\n` +
    `👥 کاربران: ${uTotal?.cnt ?? 0} | 💎 اشتراک فعال: ${subActive?.cnt ?? 0}\n` +
    `⏳ فیش در انتظار تایید: **${pendingTx?.cnt ?? 0}** | 💬 تیکت باز: **${openTickets?.cnt ?? 0}**\n\n` +
    `بخش مورد نظر را انتخاب کنید:`;

  const kb = adminMainKeyboard(actor);
  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

function hasPerm(actor: AdminActor, perm: keyof AdminPerms): boolean {
  return actor.isSuperAdmin || Boolean(actor.perms[perm]);
}

export async function handleAdminCallback(
  env: Env,
  bot: TelegramBotClient,
  actor: AdminActor,
  cqId: string,
  chatId: string | number,
  msgId: number | undefined,
  data: string
): Promise<boolean> {
  if (!data.startsWith('adm:')) return false;

  if (data !== 'adm:home' && data !== 'adm:exit' && isAdminSessionExpired(actor.lastActiveAt)) {
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL, admin_panel_last_active_at = NULL WHERE id = ?`).bind(actor.id).run();
    await bot.answerCallbackQuery(cqId, 'نشست مدیریتی پس از ۱۵ دقیقه منقضی شد. دوباره وارد شوید.', true);
    if (msgId) {
      await bot.editMessageText(chatId, msgId, '⏰ نشست پنل مدیریت به دلیل ۱۵ دقیقه عدم فعالیت بسته شد. از «تنظیمات ⚙️ -> پنل مدیریت 💼» دوباره وارد شوید.').catch(() => {});
    }
    return true;
  }

  await touchAdminActivity(env.DB, actor.id);

  const render = async (text: string, kb?: InlineKeyboardButton[][]) => {
    if (msgId) {
      await bot.editMessageText(chatId, msgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
    } else {
      await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
    }
  };

  if (data === 'adm:home') {
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(actor.id).run();
    await openAdminPanelHome(env, bot, chatId, actor, msgId);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data === 'adm:exit') {
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL, admin_panel_last_active_at = NULL WHERE id = ?`).bind(actor.id).run();
    await bot.answerCallbackQuery(cqId, 'خروج از پنل مدیریت');
    if (msgId) await bot.editMessageText(chatId, msgId, '✅ از پنل مدیریت خارج شدید.').catch(() => {});
    await bot.sendMessage(chatId, '⚙️ منوی تنظیمات:', {
      replyKeyboard: settingsKeyboard(true, actor.isSuperAdmin),
    });
    return true;
  }

  // 1. Financial & Stats Dashboard
  if (data === 'adm:dash') {
    if (!hasPerm(actor, 'stats')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی به بخش آمار', true);
      return true;
    }
    const rate = Number(await getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000')) || 70000;
    const [revRow, userRow, txRow, tradeRow] = await Promise.all([
      env.DB.prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN amount_usd ELSE 0 END), 0) as today,
          COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN amount_usd ELSE 0 END), 0) as week,
          COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN amount_usd ELSE 0 END), 0) as month,
          COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-365 days') THEN amount_usd ELSE 0 END), 0) as year,
          COALESCE(SUM(amount_usd), 0) as total
         FROM user_subscriptions WHERE status = 'ACTIVE' AND amount_usd > 0`
      ).first<{ today: number; week: number; month: number; year: number; total: number }>(),
      env.DB.prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) as new_today,
          SUM(CASE WHEN date(last_active_at) = date('now') THEN 1 ELSE 0 END) as active_today,
          SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) as blocked,
          SUM(CASE WHEN phone_verified = 1 THEN 1 ELSE 0 END) as kyc_cnt,
          SUM(CASE WHEN trust_wallet_address IS NOT NULL OR trust_wallet_tron IS NOT NULL OR trust_wallet_solana IS NOT NULL OR trust_wallet_ton IS NOT NULL THEN 1 ELSE 0 END) as tw_cnt
         FROM users`
      ).first<{ total: number; new_today: number; active_today: number; blocked: number; kyc_cnt: number; tw_cnt: number }>(),
      env.DB.prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as ok_cnt,
          SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) as pending_cnt,
          SUM(CASE WHEN status IN ('REJECTED', 'REVOKED') THEN 1 ELSE 0 END) as fail_cnt,
          COALESCE(AVG(CASE WHEN status = 'ACTIVE' AND amount_usd > 0 THEN amount_usd END), 0) as avg_usd
         FROM user_subscriptions`
      ).first<{ total: number; ok_cnt: number; pending_cnt: number; fail_cnt: number; avg_usd: number }>(),
      env.DB.prepare(
        `SELECT
          (SELECT COUNT(DISTINCT user_id) FROM user_subscriptions WHERE status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > datetime('now'))) as vip_cnt,
          (SELECT COUNT(*) FROM trades) as trades_total,
          (SELECT COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) FROM trades WHERE status = 'CLOSED') as total_pnl,
          (SELECT COUNT(*) FROM dex_trades) as dex_total`
      ).first<{ vip_cnt: number; trades_total: number; total_pnl: number; dex_total: number }>(),
    ]);

    const rev = revRow ?? { today: 0, week: 0, month: 0, year: 0, total: 0 };
    const text =
      `📊 داشبورد مالی و آمار لحظه‌ای دلارینو\n\n` +
      `💰 درآمد کل (تاییدشده):\n` +
      `• امروز: ${rev.today.toFixed(2)}$ (${formatToman(rev.today, rate)} ت)\n` +
      `• هفته اخیر: ${rev.week.toFixed(2)}$ (${formatToman(rev.week, rate)} ت)\n` +
      `• ماه اخیر: ${rev.month.toFixed(2)}$ (${formatToman(rev.month, rate)} ت)\n` +
      `• سال اخیر: ${rev.year.toFixed(2)}$\n` +
      `• مجموع کل: ${rev.total.toFixed(2)}$ (${formatToman(rev.total, rate)} ت)\n\n` +
      `👥 آمار کاربران:\n` +
      `• کل کاربران: ${userRow?.total ?? 0} | احراز تلفن: ${userRow?.kyc_cnt ?? 0}\n` +
      `• کیف‌پول Trust Wallet متصل: ${userRow?.tw_cnt ?? 0} | VIP فعال: ${tradeRow?.vip_cnt ?? 0}\n` +
      `• ثبت‌نام امروز: ${userRow?.new_today ?? 0} | فعال امروز: ${userRow?.active_today ?? 0}\n` +
      `• مسدود شده: ${userRow?.blocked ?? 0}\n\n` +
      `💳 تراکنش‌ها و معاملات:\n` +
      `• کل سفارش‌ها: ${txRow?.total ?? 0} (موفق: ${txRow?.ok_cnt ?? 0} | در انتظار: ${txRow?.pending_cnt ?? 0} | رد/لغو: ${txRow?.fail_cnt ?? 0})\n` +
      `• میانگین هر خرید: ${(txRow?.avg_usd ?? 0).toFixed(2)} USDT\n` +
      `• کل معاملات ثبت‌شده: ${tradeRow?.trades_total ?? 0} (DEX: ${tradeRow?.dex_total ?? 0} | PnL کل: ${(tradeRow?.total_pnl ?? 0).toFixed(2)}$)`;

    await render(text, [
      [{ text: '🔄 بروزرسانی آمار', callback_data: 'adm:dash' }],
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ]);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  // 2. User Management
  if (data === 'adm:users') {
    if (!hasPerm(actor, 'users')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی به مدیریت کاربران', true);
      return true;
    }
    await render('👥 مدیریت کاربران دلارینو:\nیک گزینه را انتخاب کنید:', [
      [
        { text: '🔍 جستجوی کاربر (ID / یوزرنیم)', callback_data: 'adm:u_search' },
        { text: '📋 لیست همه کاربران', callback_data: 'adm:u_list:0' },
      ],
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ]);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data === 'adm:u_search') {
    if (!hasPerm(actor, 'users')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'ADM_SEARCH_USER' } satisfies AdminStepState), actor.id).run();
    await bot.answerCallbackQuery(cqId);
    await bot.sendMessage(chatId, '🔍 آیدی عددی تلگرام، @یوزرنیم یا ایمیل کاربر را ارسال کنید:', {
      inlineKeyboard: [[{ text: '🔙 انصراف', callback_data: 'adm:home' }]],
    });
    return true;
  }

  if (data.startsWith('adm:u_list:')) {
    if (!hasPerm(actor, 'users')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    const page = Math.max(0, Number(data.split(':')[2] ?? 0));
    const rows = await env.DB.prepare(
      `SELECT id, username, telegram_id, telegram_username, is_blocked, role
       FROM users ORDER BY created_at DESC LIMIT 8 OFFSET ?`
    ).bind(page * 8).all<{
      id: string;
      username: string;
      telegram_id: string | null;
      telegram_username: string | null;
      is_blocked: number;
      role: string;
    }>();

    const buttons: InlineKeyboardButton[][] = rows.results.map((u) => [
      {
        text: `${u.is_blocked ? '🔒' : u.role === 'owner' ? '👑' : u.role === 'admin' ? '🛡' : '👤'} ${u.username} (${u.telegram_id || u.id.slice(-6)})`,
        callback_data: `adm:u_view:${u.id}`,
      },
    ]);
    const nav: InlineKeyboardButton[] = [];
    if (page > 0) nav.push({ text: '⬅️ قبلی', callback_data: `adm:u_list:${page - 1}` });
    if (rows.results.length === 8) nav.push({ text: '➡️ بعدی', callback_data: `adm:u_list:${page + 1}` });
    if (nav.length) buttons.push(nav);
    buttons.push([{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }]);

    await render(`📋 لیست کاربران (صفحه ${page + 1}):`, buttons);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:u_view:')) {
    const uid = data.slice('adm:u_view:'.length);
    await renderAdminUserCard(env, bot, chatId, msgId, uid);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:u_vip:')) {
    const uid = data.slice('adm:u_vip:'.length);
    await env.DB.prepare(
      `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, amount_usd, started_at, expires_at, reviewed_by, reviewed_at, admin_note)
       VALUES (?, ?, 'pro_monthly', 'ACTIVE', 'ADMIN_GRANT', 0, datetime('now'), datetime('now', '+30 days'), ?, datetime('now'), 'Admin VIP upgrade via Telegram')`
    ).bind(randomId('sub'), uid, actor.id).run();
    await auditAdmin(env.DB, actor.id, `Upgraded user ${uid} to VIP 30d`);
    const target = await env.DB.prepare(`SELECT telegram_id FROM users WHERE id = ?`).bind(uid).first<{ telegram_id: string | null }>();
    if (target?.telegram_id) {
      await bot.sendMessage(target.telegram_id, '👑 تبریک! حساب شما توسط مدیر سیستم به اشتراک VIP (۳۰ روزه) ارتقا یافت.').catch(() => {});
    }
    await bot.answerCallbackQuery(cqId, 'کاربر VIP شد 👑');
    await renderAdminUserCard(env, bot, chatId, msgId, uid);
    return true;
  }

  if (data.startsWith('adm:u_downgrade:')) {
    const uid = data.slice('adm:u_downgrade:'.length);
    await env.DB.prepare(`UPDATE user_subscriptions SET status = 'REVOKED', reviewed_by = ?, reviewed_at = datetime('now') WHERE user_id = ? AND status = 'ACTIVE'`)
      .bind(actor.id, uid).run();
    await auditAdmin(env.DB, actor.id, `Downgraded user ${uid} to free`);
    await bot.answerCallbackQuery(cqId, 'اشتراک به عادی تنزل یافت');
    await renderAdminUserCard(env, bot, chatId, msgId, uid);
    return true;
  }

  if (data.startsWith('adm:u_charge:')) {
    const uid = data.slice('adm:u_charge:'.length);
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'ADM_CHARGE_USER', targetUserId: uid } satisfies AdminStepState), actor.id).run();
    await bot.answerCallbackQuery(cqId);
    await bot.sendMessage(chatId, '💰 مبلغ شارژ کیف پول کاربر را به دلار (USDT) ارسال کنید (مثلاً 25):', {
      inlineKeyboard: [[{ text: '🔙 انصراف', callback_data: `adm:u_view:${uid}` }]],
    });
    return true;
  }

  if (data.startsWith('adm:u_block:')) {
    const uid = data.slice('adm:u_block:'.length);
    const uRow = await env.DB.prepare(`SELECT is_blocked, role, telegram_id FROM users WHERE id = ?`).bind(uid).first<{ is_blocked: number; role: string; telegram_id: string | null }>();
    if (uRow?.role === 'owner' || uRow?.telegram_id === (env.OWNER_TELEGRAM_ID || '944021185')) {
      await bot.answerCallbackQuery(cqId, 'امکان مسدودسازی مدیر اصلی وجود ندارد!', true);
      return true;
    }
    const nextBlock = uRow?.is_blocked ? 0 : 1;
    await env.DB.prepare(`UPDATE users SET is_blocked = ? WHERE id = ?`).bind(nextBlock, uid).run();
    await auditAdmin(env.DB, actor.id, `${nextBlock ? 'Blocked' : 'Unblocked'} user ${uid}`);
    await bot.answerCallbackQuery(cqId, nextBlock ? 'کاربر مسدود شد 🔒' : 'رفع مسدودیت انجام شد ✅');
    await renderAdminUserCard(env, bot, chatId, msgId, uid);
    return true;
  }

  if (data.startsWith('adm:u_stats:')) {
    const uid = data.slice('adm:u_stats:'.length);
    const stats = await env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_cnt,
              SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 AND status = 'CLOSED' THEN 1 ELSE 0 END) as wins,
              COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as pnl
       FROM trades WHERE user_id = ?`
    ).bind(uid).first<{ total: number; open_cnt: number; wins: number; pnl: number }>();
    const closed = Math.max(0, (stats?.total ?? 0) - (stats?.open_cnt ?? 0));
    const wr = closed > 0 ? (((stats?.wins ?? 0) / closed) * 100).toFixed(1) : '0.0';
    await render(
      `📊 گزارش کامل معاملاتی کاربر:\n\n• کل معاملات: ${stats?.total ?? 0}\n• معاملات باز: ${stats?.open_cnt ?? 0}\n• معاملات بسته: ${closed} (برد: ${stats?.wins ?? 0} · WinRate: ${wr}%)\n• سود/زیان خالص: ${(stats?.pnl ?? 0).toFixed(2)} USDT`,
      [[{ text: '🔙 بازگشت به پروفایل کاربر', callback_data: `adm:u_view:${uid}` }]]
    );
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  // 3. Broadcast
  if (data === 'adm:broadcast') {
    if (!hasPerm(actor, 'broadcast')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی به پیام همگانی', true);
      return true;
    }
    await render('📨 ارسال پیام همگانی:\nجامعه هدف پیام را انتخاب کنید:', [
      [
        { text: '👥 همه کاربران', callback_data: 'adm:bc_target:all' },
        { text: '👑 کاربران VIP', callback_data: 'adm:bc_target:vip' },
      ],
      [
        { text: '👤 کاربران بدون اشتراک', callback_data: 'adm:bc_target:free' },
        { text: '🟢 فعال امروز', callback_data: 'adm:bc_target:active_today' },
      ],
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ]);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:bc_target:')) {
    if (!hasPerm(actor, 'broadcast')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    const target = data.split(':')[2] || 'all';
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'ADM_BROADCAST_MSG', bcTarget: target } satisfies AdminStepState), actor.id).run();
    await bot.answerCallbackQuery(cqId);
    await bot.sendMessage(chatId, `✍️ متن پیام همگانی (یا عکس با کپشن) برای گروه «${target}» را ارسال کنید:`, {
      inlineKeyboard: [[{ text: '🔙 انصراف', callback_data: 'adm:home' }]],
    });
    return true;
  }

  // 4. Transactions Management
  if (data.startsWith('adm:tx:')) {
    if (!hasPerm(actor, 'finance')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی به مدیریت مالی', true);
      return true;
    }
    const parts = data.split(':');
    const filter = parts[2] || 'ALL';
    const page = Math.max(0, Number(parts[3] ?? 0));
    const whereClause = filter === 'ALL' ? '' : `WHERE s.status = '${filter.replace(/[^A-Z_]/g, '')}'`;
    const rows = await env.DB.prepare(
      `SELECT s.id, s.plan_code, s.status, s.amount_usd, s.payment_method, s.created_at, u.username, u.telegram_id
       FROM user_subscriptions s JOIN users u ON u.id = s.user_id
       ${whereClause} ORDER BY s.created_at DESC LIMIT 8 OFFSET ?`
    ).bind(page * 8).all<{
      id: string;
      plan_code: string;
      status: string;
      amount_usd: number;
      payment_method: string;
      created_at: string;
      username: string;
      telegram_id: string | null;
    }>();

    const kb: InlineKeyboardButton[][] = [
      [
        { text: filter === 'ALL' ? '• همه •' : 'همه', callback_data: 'adm:tx:ALL:0' },
        { text: filter === 'PENDING_REVIEW' ? '• در انتظار •' : 'در انتظار ⏳', callback_data: 'adm:tx:PENDING_REVIEW:0' },
        { text: filter === 'ACTIVE' ? '• تاییدشده •' : 'موفق ✅', callback_data: 'adm:tx:ACTIVE:0' },
        { text: filter === 'REJECTED' ? '• ردشده •' : 'ناموفق ❌', callback_data: 'adm:tx:REJECTED:0' },
      ],
      ...rows.results.map((r) => [
        {
          text: `${r.status === 'ACTIVE' ? '✅' : r.status === 'PENDING_REVIEW' ? '⏳' : '❌'} ${r.username} | ${r.plan_code} (${r.amount_usd}$)`,
          callback_data: `adm:tx_view:${r.id}`,
        },
      ]),
    ];
    const nav: InlineKeyboardButton[] = [];
    if (page > 0) nav.push({ text: '⬅️ قبلی', callback_data: `adm:tx:${filter}:${page - 1}` });
    if (rows.results.length === 8) nav.push({ text: '➡️ بعدی', callback_data: `adm:tx:${filter}:${page + 1}` });
    if (nav.length) kb.push(nav);
    kb.push([{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }]);

    await render(`💰 مدیریت تراکنش‌ها (${filter} - صفحه ${page + 1}):`, kb);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:tx_view:')) {
    const subId = data.slice('adm:tx_view:'.length);
    const sub = await env.DB.prepare(
      `SELECT s.*, u.username, u.telegram_id FROM user_subscriptions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
    ).bind(subId).first<{
      id: string;
      user_id: string;
      plan_code: string;
      status: string;
      payment_method: string;
      payment_reference: string | null;
      amount_usd: number;
      payer_note: string | null;
      created_at: string;
      username: string;
      telegram_id: string | null;
    }>();
    if (!sub) {
      await bot.answerCallbackQuery(cqId, 'تراکنش یافت نشد', true);
      return true;
    }
    const text =
      `🧾 جزئیات تراکنش #${sub.id}\n\n` +
      `👤 کاربر: ${sub.username} (${sub.telegram_id || sub.user_id})\n` +
      `📦 پلن: ${sub.plan_code}\n` +
      `💵 مبلغ: ${sub.amount_usd} USDT\n` +
      `💳 روش: ${sub.payment_method}\n` +
      `🔗 کد پیگیری / TXID: ${sub.payment_reference || 'ثبت نشده'}\n` +
      `📌 وضعیت: ${sub.status}\n` +
      `🕒 تاریخ ثبت: ${formatIranDateTime(sub.created_at)}`;

    const kb: InlineKeyboardButton[][] = [];
    if (sub.status === 'PENDING_REVIEW') {
      kb.push([
        { text: '✅ تایید و فعال‌سازی اشتراک', callback_data: `adm:tx_approve:${sub.id}` },
        { text: '❌ رد تراکنش', callback_data: `adm:tx_reject:${sub.id}` },
      ]);
    }
    kb.push([{ text: '🔙 لیست تراکنش‌ها', callback_data: 'adm:tx:ALL:0' }]);
    await render(text, kb);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:tx_approve:') || data.startsWith('adm:tx_reject:')) {
    if (!hasPerm(actor, 'finance')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی مالی', true);
      return true;
    }
    const isApprove = data.startsWith('adm:tx_approve:');
    const subId = data.split(':')[2]!;
    const sub = await env.DB.prepare(
      `SELECT s.id, s.user_id, s.plan_code, s.amount_usd, u.telegram_id FROM user_subscriptions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
    ).bind(subId).first<{ id: string; user_id: string; plan_code: string; amount_usd: number; telegram_id: string | null }>();

    if (!sub) {
      await bot.answerCallbackQuery(cqId, 'سفارش یافت نشد', true);
      return true;
    }

    if (isApprove) {
      if (sub.plan_code === 'wallet_charge') {
        await env.DB.prepare(`UPDATE users SET wallet_balance_usdt = COALESCE(wallet_balance_usdt, 0) + ? WHERE id = ?`)
          .bind(sub.amount_usd, sub.user_id).run();
        await env.DB.prepare(
          `UPDATE user_subscriptions SET status = 'ACTIVE', started_at = datetime('now'), reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
        ).bind(actor.id, sub.id).run();
        if (sub.telegram_id) {
          await bot.sendMessage(sub.telegram_id, `✅ شارژ کیف پول به مبلغ ${sub.amount_usd} USDT با موفقیت تایید و به حساب شما اضافه شد!`).catch(() => {});
        }
      } else {
        const plan = await env.DB.prepare(`SELECT duration_days, name_fa FROM subscription_plans WHERE code = ?`)
          .bind(sub.plan_code).first<{ duration_days: number; name_fa: string }>();
        const days = plan?.duration_days ?? 30;
        await env.DB.prepare(
          `UPDATE user_subscriptions SET status = 'ACTIVE', started_at = datetime('now'), expires_at = datetime('now', '+' || ? || ' days'), reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
        ).bind(days, actor.id, sub.id).run();
        if (sub.telegram_id) {
          await bot.sendMessage(
            sub.telegram_id,
            `🎉 پرداخت شما تایید شد!\n\n✅ اشتراک ${plan?.name_fa || sub.plan_code} به مدت ${days} روز برای شما فعال گردید. اکنون می‌توانید از تمام امکانات ویژه استفاده کنید!`,
            { inlineKeyboard: [[{ text: 'حساب کاربری 👤', callback_data: 'tg_account' }]] }
          ).catch(() => {});
        }
      }
      await auditAdmin(env.DB, actor.id, `Approved transaction ${subId}`);
      await bot.answerCallbackQuery(cqId, 'تراکنش تایید شد ✅');
    } else {
      await env.DB.prepare(
        `UPDATE user_subscriptions SET status = 'REJECTED', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
      ).bind(actor.id, sub.id).run();
      if (sub.telegram_id) {
        await bot.sendMessage(sub.telegram_id, `❌ سفارش #${sub.id} تایید نشد. لطفاً TXID صحیح را بررسی کرده و با پشتیبانی در تماس باشید.`).catch(() => {});
      }
      await auditAdmin(env.DB, actor.id, `Rejected transaction ${subId}`);
      await bot.answerCallbackQuery(cqId, 'تراکنش رد شد ❌');
    }

    await render(`✅ وضعیت سفارش #${subId} به «${isApprove ? 'تاییدشده ✅' : 'ردشده ❌'}» تغییر یافت.`, [
      [{ text: '🔙 بازگشت به تراکنش‌ها', callback_data: 'adm:tx:ALL:0' }],
    ]);
    return true;
  }

  // 5. Gift Codes
  if (data === 'adm:gifts') {
    if (!hasPerm(actor, 'finance')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    const gifts = await env.DB.prepare(
      `SELECT code, code_type, plan_code, duration_days, credit_usdt, uses_count, max_uses, is_active FROM gift_codes ORDER BY created_at DESC LIMIT 10`
    ).all<{
      code: string;
      code_type?: string;
      plan_code: string;
      duration_days: number;
      credit_usdt?: number;
      uses_count: number;
      max_uses: number;
      is_active: number;
    }>();

    const listText = gifts.results.length
      ? gifts.results.map((g) => `• ${g.code} — ${g.code_type === 'WALLET' ? `${g.credit_usdt ?? 0}$ شارژ` : `${g.plan_code} (${g.duration_days} روز)`} | مصرف: ${g.uses_count}/${g.max_uses} ${g.is_active ? '🟢' : '🔴'}`).join('\n')
      : 'هیچ کد هدیه‌ای ثبت نشده است.';

    const kb: InlineKeyboardButton[][] = [
      [{ text: '➕ ساخت کد هدیه جدید', callback_data: 'adm:gift_new' }],
      ...gifts.results.slice(0, 5).map((g) => [
        { text: `${g.is_active ? '🔴 غیرفعال کردن' : '🟢 فعال کردن'} ${g.code}`, callback_data: `adm:gift_toggle:${g.code}` },
      ]),
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ];
    await render(`🎁 مدیریت کدهای هدیه:\n\n${listText}`, kb);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:gift_toggle:')) {
    const code = data.slice('adm:gift_toggle:'.length);
    await env.DB.prepare(`UPDATE gift_codes SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE code = ?`).bind(code).run();
    await bot.answerCallbackQuery(cqId, 'وضعیت کد تغییر یافت');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, 'adm:gifts');
  }

  if (data === 'adm:gift_new') {
    await render('🎁 نوع کد هدیه جدید را انتخاب کنید:', [
      [
        { text: '💎 اشتراک ماهانه (۳۰ روز)', callback_data: 'adm:gift_tpl:SUB:pro_monthly:30' },
        { text: '👑 اشتراک ۳ ماهه (۹۰ روز)', callback_data: 'adm:gift_tpl:SUB:vip_quarterly:90' },
      ],
      [
        { text: '🌟 اشتراک سالانه (۳۶۵ روز)', callback_data: 'adm:gift_tpl:SUB:pro_annual:365' },
        { text: '💰 شارژ کیف پول (USDT)', callback_data: 'adm:gift_tpl:WALLET:wallet:0' },
      ],
      [{ text: '🔙 بازگشت', callback_data: 'adm:gifts' }],
    ]);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:gift_tpl:')) {
    const parts = data.split(':');
    const kind = parts[2] === 'WALLET' ? 'WALLET' : 'SUBSCRIPTION';
    const planCode = parts[3] || 'pro_monthly';
    const days = Number(parts[4] || 30);
    if (kind === 'WALLET') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'ADM_GIFT_CREDIT', giftType: 'WALLET' } satisfies AdminStepState), actor.id).run();
      await bot.answerCallbackQuery(cqId);
      await bot.sendMessage(chatId, '💰 مبلغ شارژ هدیه را به USDT وارد کنید (مثلاً 10):');
    } else {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'ADM_GIFT_MAX_USES', giftType: 'SUBSCRIPTION', giftPlan: planCode, giftDays: days } satisfies AdminStepState), actor.id).run();
      await bot.answerCallbackQuery(cqId);
      await bot.sendMessage(chatId, '🔢 حداکثر تعداد کاربران مجاز برای استفاده از این کد را بنویسید (مثلاً 10):');
    }
    return true;
  }

  // 6. System Settings
  if (data === 'adm:settings') {
    if (!hasPerm(actor, 'settings')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی به تنظیمات سیستم', true);
      return true;
    }
    const [plans, margin, lev, chan, sup, wallet, bep20Recv, rate, privOnly, kycReq] = await Promise.all([
      env.DB.prepare(`SELECT code, price_usd FROM subscription_plans WHERE price_usd > 0`).all<{ code: string; price_usd: number }>(),
      getSystemSetting(env.DB, 'default_margin_pct', '10'),
      getSystemSetting(env.DB, 'default_max_leverage', '20'),
      getSystemSetting(env.DB, 'official_channel', '@Dollarino_official'),
      getSystemSetting(env.DB, 'telegram_support', '@Dollarino_bot'),
      getSystemSetting(env.DB, 'usdt_trc20_wallet', 'تنظیم نشده'),
      getSystemSetting(env.DB, 'trust_wallet_evm_receiver', 'تنظیم نشده'),
      getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000'),
      getSystemSetting(env.DB, 'bot_private_admin_only', 'false'),
      getSystemSetting(env.DB, 'require_telegram_phone_kyc', 'true'),
    ]);
    const pMap: Record<string, number> = {};
    for (const p of plans.results) pMap[p.code] = p.price_usd;

    const text =
      `⚙️ تنظیمات سیستم دلارینو:\n\n` +
      `• تعرفه‌ها: ماهانه ${pMap.pro_monthly ?? 20}$ | ۳ماهه ${pMap.vip_quarterly ?? 50}$ | ۶ماهه ${pMap.pro_semiannual ?? 90}$ | سالانه ${pMap.pro_annual ?? 160}$\n` +
      `• مارجین پیش‌فرض: ${margin}% | حداکثر لوریج: ${lev}x\n` +
      `• کانال سیگنال: ${chan} | پشتیبانی: ${sup}\n` +
      `• ولت TRC20: ${wallet}\n` +
      `• ولت BEP20 (Trust Wallet): ${bep20Recv}\n` +
      `• نرخ تتر: ${Number(rate).toLocaleString('en-US')} تومان\n` +
      `• 📱 احراز اجباری شماره تماس: ${kycReq === 'true' ? 'روشن ✅' : 'خاموش ⚪️'}\n` +
      `• 🔐 حالت دسترسی ربات: ${privOnly === 'true' ? 'فقط مدیران تاییدشده 🔒' : 'عمومی (همه کاربران) 🌐'}`;

    await render(text, [
      [
        { text: '💵 قیمت ماهانه', callback_data: 'adm:set:plan:pro_monthly' },
        { text: '💵 قیمت ۳ ماهه', callback_data: 'adm:set:plan:vip_quarterly' },
      ],
      [
        { text: '💵 قیمت ۶ ماهه', callback_data: 'adm:set:plan:pro_semiannual' },
        { text: '💵 قیمت سالانه', callback_data: 'adm:set:plan:pro_annual' },
      ],
      [
        { text: '📊 مارجین پیش‌فرض', callback_data: 'adm:set:key:default_margin_pct' },
        { text: '🔘 حداکثر لوریج', callback_data: 'adm:set:key:default_max_leverage' },
      ],
      [
        { text: '📡 کانال سیگنال', callback_data: 'adm:set:key:official_channel' },
        { text: '🆘 آیدی پشتیبانی', callback_data: 'adm:set:key:telegram_support' },
      ],
      [
        { text: '💳 ولت TRC20', callback_data: 'adm:set:key:usdt_trc20_wallet' },
        { text: '🦊 ولت BEP20 (TW)', callback_data: 'adm:set:key:trust_wallet_evm_receiver' },
      ],
      [
        { text: '💱 نرخ تتر (تومان)', callback_data: 'adm:set:key:usdt_to_toman_rate' },
        { text: '📚 متن راهنما', callback_data: 'adm:set:key:bot_help_text' },
      ],
      [
        { text: '🖼 مدیا راهنما (URL)', callback_data: 'adm:set:key:bot_help_media_url' },
        { text: `📱 احراز تلفن (${kycReq === 'true' ? 'اجباری ✅' : 'آزاد'})`, callback_data: 'adm:toggle_phone_kyc' },
      ],
      [
        {
          text: `🔐 تغییر حالت دسترسی (${privOnly === 'true' ? 'فقط ادمین' : 'عمومی'})`,
          callback_data: 'adm:toggle_private_mode',
        },
      ],
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ]);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data === 'adm:toggle_phone_kyc') {
    const cur = await getSystemSetting(env.DB, 'require_telegram_phone_kyc', 'true');
    const next = cur === 'true' ? 'false' : 'true';
    await setSystemSetting(env.DB, 'require_telegram_phone_kyc', next);
    await auditAdmin(env.DB, actor.id, `Set require_telegram_phone_kyc=${next}`);
    await bot.answerCallbackQuery(cqId, next === 'true' ? 'احراز اجباری شماره تماس روشن شد ✅' : 'احراز اجباری خاموش شد');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, 'adm:settings');
  }

  if (data === 'adm:toggle_private_mode') {
    if (!actor.isSuperAdmin) {
      await bot.answerCallbackQuery(cqId, 'فقط مدیر اصلی می‌تواند حالت انحصاری ربات را تغییر دهد.', true);
      return true;
    }
    const cur = await getSystemSetting(env.DB, 'bot_private_admin_only', 'false');
    const next = cur === 'true' ? 'false' : 'true';
    await setSystemSetting(env.DB, 'bot_private_admin_only', next);
    await auditAdmin(env.DB, actor.id, `Set bot_private_admin_only=${next}`);
    await bot.answerCallbackQuery(cqId, next === 'true' ? 'ربات روی حالت انحصاری ادمین قفل شد 🔒' : 'دسترسی عمومی باز شد 🌐');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, 'adm:settings');
  }

  if (data.startsWith('adm:set:')) {
    const rest = data.slice('adm:set:'.length);
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'ADM_EDIT_SETTING', targetKey: rest } satisfies AdminStepState), actor.id).run();
    await bot.answerCallbackQuery(cqId);
    await bot.sendMessage(chatId, `✍️ مقدار جدید برای «${rest}» را ارسال کنید:`, {
      inlineKeyboard: [[{ text: '🔙 انصراف', callback_data: 'adm:settings' }]],
    });
    return true;
  }

  // 7. Advanced Reporting + JSON / CSV Export
  if (data === 'adm:reports') {
    if (!hasPerm(actor, 'stats')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    await render('📈 گزارش‌گیری پیشرفته و خروجی فایل:\nدوره زمانی و فرمت خروجی را انتخاب کنید:', [
      [
        { text: '📅 امروز (متنی)', callback_data: 'adm:rep:today:text' },
        { text: '📅 هفته اخیر (متنی)', callback_data: 'adm:rep:week:text' },
      ],
      [
        { text: '📅 ماه اخیر (متنی)', callback_data: 'adm:rep:month:text' },
        { text: '📅 سالانه (متنی)', callback_data: 'adm:rep:year:text' },
      ],
      [
        { text: '📎 خروجی JSON (ماه)', callback_data: 'adm:rep:month:json' },
        { text: '📊 خروجی Excel/CSV (ماه)', callback_data: 'adm:rep:month:csv' },
      ],
      [
        { text: '📎 JSON کل تاریخچه', callback_data: 'adm:rep:all:json' },
        { text: '📊 Excel/CSV کل تاریخچه', callback_data: 'adm:rep:all:csv' },
      ],
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ]);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:rep:')) {
    const [, , period, fmt] = data.split(':');
    const sinceSql =
      period === 'today'
        ? `date(created_at) = date('now')`
        : period === 'week'
          ? `created_at >= datetime('now', '-7 days')`
          : period === 'month'
            ? `created_at >= datetime('now', '-30 days')`
            : period === 'year'
              ? `created_at >= datetime('now', '-365 days')`
              : `1=1`;

    const [subs, byPlan, usersJoined, tradesCount] = await Promise.all([
      env.DB.prepare(
        `SELECT s.id, u.username, u.telegram_id, s.plan_code, s.status, s.amount_usd, s.payment_method, s.created_at
         FROM user_subscriptions s JOIN users u ON u.id = s.user_id
         WHERE ${sinceSql.replace(/created_at/g, 's.created_at')} ORDER BY s.created_at DESC LIMIT 500`
      ).all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT plan_code, COUNT(*) as cnt, COALESCE(SUM(amount_usd), 0) as usd
         FROM user_subscriptions WHERE status = 'ACTIVE' AND ${sinceSql} GROUP BY plan_code`
      ).all<{ plan_code: string; cnt: number; usd: number }>(),
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM users WHERE ${sinceSql}`).first<{ cnt: number }>(),
      env.DB.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as pnl FROM trades WHERE ${sinceSql.replace(/created_at/g, 'opened_at')}`).first<{ cnt: number; pnl: number }>(),
    ]);

    const totalRev = byPlan.results.reduce((a, b) => a + Number(b.usd || 0), 0);
    const dailyRunRate = period === 'today' ? totalRev : period === 'week' ? totalRev / 7 : period === 'month' ? totalRev / 30 : totalRev / 365;
    const forecast30d = dailyRunRate * 30;

    if (fmt === 'json') {
      const payload = JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          period,
          summary: {
            revenueUsd: totalRev,
            forecast30DaysUsd: Number(forecast30d.toFixed(2)),
            newUsers: usersJoined?.cnt ?? 0,
            tradesCount: tradesCount?.cnt ?? 0,
            tradesPnlUsd: tradesCount?.pnl ?? 0,
            byPlan: byPlan.results,
          },
          transactions: subs.results,
        },
        null,
        2
      );
      await bot.sendDocument(chatId, `dollarino-report-${period}.json`, payload, 'application/json', `📎 گزارش JSON دوره ${period}`);
      await bot.answerCallbackQuery(cqId, 'فایل JSON ارسال شد 📎');
      return true;
    }

    if (fmt === 'csv') {
      const header = ['Order ID', 'Username', 'Telegram ID', 'Plan', 'Status', 'Amount USD', 'Method', 'Created At'].join(',');
      const lines = subs.results.map((r) =>
        [r.id, r.username, r.telegram_id ?? '', r.plan_code, r.status, r.amount_usd, r.payment_method, r.created_at]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      );
      const csv = '\uFEFF' + [header, ...lines].join('\n');
      await bot.sendDocument(chatId, `dollarino-report-${period}.csv`, csv, 'text/csv;charset=utf-8', `📊 فایل اکسل / CSV دوره ${period}`);
      await bot.answerCallbackQuery(cqId, 'فایل Excel/CSV ارسال شد 📊');
      return true;
    }

    const planBreakdown = byPlan.results.length
      ? byPlan.results.map((p) => `• ${p.plan_code}: ${p.cnt} فروش (${Number(p.usd).toFixed(2)}$)`).join('\n')
      : '• بدون فروش در این بازه';

    await render(
      `📈 گزارش جامع (${period}):\n\n` +
      `💵 درآمد خالص تاییدشده: ${totalRev.toFixed(2)} USDT\n` +
      `🔮 پیش‌بینی ۳۰ روز آینده: ~${forecast30d.toFixed(2)} USDT\n` +
      `👥 کاربران جدید: ${usersJoined?.cnt ?? 0}\n` +
      `📊 تعداد معاملات: ${tradesCount?.cnt ?? 0} (PnL: ${(tradesCount?.pnl ?? 0).toFixed(2)}$)\n\n` +
      `📦 تفکیک پلن‌ها:\n${planBreakdown}`,
      [[{ text: '🔙 بازگشت به گزارش‌گیری', callback_data: 'adm:reports' }]]
    );
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  // 8. Admin Management (Super Admin ONLY)
  if (data === 'adm:admins') {
    if (!actor.isSuperAdmin) {
      await bot.answerCallbackQuery(cqId, '⛔️ فقط مدیر اصلی (944021185) به مدیریت ادمین‌ها دسترسی دارد.', true);
      return true;
    }
    const admins = await env.DB.prepare(
      `SELECT id, username, telegram_id, role FROM users WHERE role IN ('owner', 'admin') ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at ASC`
    ).all<{ id: string; username: string; telegram_id: string | null; role: string }>();

    const kb: InlineKeyboardButton[][] = [
      [{ text: '➕ افزودن ادمین جدید (با آیدی عددی)', callback_data: 'adm:adm_add' }],
      ...admins.results.map((a) => [
        {
          text: `${a.role === 'owner' ? '👑' : '🛡'} ${a.username} (${a.telegram_id || a.id.slice(-6)})`,
          callback_data: `adm:adm_view:${a.id}`,
        },
      ]),
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ];
    await render(`👤 مدیریت ادمین‌های دلارینو (${admins.results.length} نفر):`, kb);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data === 'adm:adm_add') {
    if (!actor.isSuperAdmin) {
      await bot.answerCallbackQuery(cqId, 'فقط مدیر اصلی مجاز است.', true);
      return true;
    }
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'AWAIT_ADD_ADMIN' }), actor.id).run();
    await bot.answerCallbackQuery(cqId);
    await bot.sendMessage(chatId, '🔑 آیدی عددی تلگرام فرد مورد نظر را ارسال کنید:');
    return true;
  }

  if (data.startsWith('adm:adm_view:')) {
    if (!actor.isSuperAdmin) {
      await bot.answerCallbackQuery(cqId, 'فقط مدیر اصلی مجاز است.', true);
      return true;
    }
    const aid = data.slice('adm:adm_view:'.length);
    const aRow = await env.DB.prepare(
      `SELECT id, username, telegram_id, role, telegram_admin_perms FROM users WHERE id = ?`
    ).bind(aid).first<{ id: string; username: string; telegram_id: string | null; role: string; telegram_admin_perms: string | null }>();
    if (!aRow) {
      await bot.answerCallbackQuery(cqId, 'یافت نشد', true);
      return true;
    }
    const p = parseAdminPerms(aRow.telegram_admin_perms, aRow.role === 'owner');
    const kb: InlineKeyboardButton[][] =
      aRow.role === 'owner'
        ? [[{ text: '👑 مدیر اصلی دارای کل دسترسی‌هاست', callback_data: 'adm:admins' }]]
        : [
            [
              { text: `${p.users ? '✅' : '❌'} کاربران`, callback_data: `adm:adm_perm:${aid}:users` },
              { text: `${p.broadcast ? '✅' : '❌'} پیام همگانی`, callback_data: `adm:adm_perm:${aid}:broadcast` },
            ],
            [
              { text: `${p.finance ? '✅' : '❌'} مالی و هدیه`, callback_data: `adm:adm_perm:${aid}:finance` },
              { text: `${p.stats ? '✅' : '❌'} آمار و گزارش`, callback_data: `adm:adm_perm:${aid}:stats` },
            ],
            [{ text: `${p.settings ? '✅' : '❌'} تنظیمات سیستم`, callback_data: `adm:adm_perm:${aid}:settings` }],
            [{ text: '❌ حذف از لیست ادمین‌ها', callback_data: `adm:adm_del:${aid}` }],
          ];
    kb.push([{ text: '🔙 لیست ادمین‌ها', callback_data: 'adm:admins' }]);
    await render(`🛡 مدیریت دسترسی‌های ${aRow.username} (${aRow.telegram_id ?? '—'}):`, kb);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:adm_perm:')) {
    if (!actor.isSuperAdmin) return true;
    const [, , aid, permKey] = data.split(':');
    const aRow = await env.DB.prepare(`SELECT telegram_admin_perms FROM users WHERE id = ?`).bind(aid).first<{ telegram_admin_perms: string | null }>();
    const perms = parseAdminPerms(aRow?.telegram_admin_perms, false) as Record<string, boolean>;
    perms[permKey!] = !perms[permKey!];
    await env.DB.prepare(`UPDATE users SET telegram_admin_perms = ? WHERE id = ?`).bind(JSON.stringify(perms), aid).run();
    await auditAdmin(env.DB, actor.id, `Toggled admin perm ${permKey} for ${aid}`);
    await bot.answerCallbackQuery(cqId, 'دسترسی بروزرسانی شد');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, `adm:adm_view:${aid}`);
  }

  if (data.startsWith('adm:adm_del:')) {
    if (!actor.isSuperAdmin) return true;
    const aid = data.slice('adm:adm_del:'.length);
    await env.DB.prepare(`UPDATE users SET role = 'user', telegram_admin_perms = '{}' WHERE id = ? AND role != 'owner'`).bind(aid).run();
    await auditAdmin(env.DB, actor.id, `Revoked admin role for ${aid}`);
    await bot.answerCallbackQuery(cqId, 'مدیر با موفقیت حذف شد');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, 'adm:admins');
  }

  // Online Support Tickets Desk inside Admin Bot
  if (data === 'adm:support') {
    const tickets = await env.DB.prepare(
      `SELECT st.id, st.subject, st.status, st.channel, st.last_message_at, u.username, u.email
       FROM support_tickets st
       JOIN users u ON u.id = st.user_id
       ORDER BY CASE WHEN st.status = 'OPEN' THEN 0 ELSE 1 END, st.last_message_at DESC
       LIMIT 10`
    ).all<{ id: string; subject: string; status: string; channel: string; last_message_at: string; username: string; email: string }>().catch(() => ({ results: [] }));

    const lines = tickets.results.length
      ? tickets.results.map((t, i) => `${i + 1}. [${t.status === 'OPEN' ? '🟢 باز' : t.status === 'ANSWERED' ? '🔵 پاسخ‌داده‌شده' : '⚪️ بسته'}] ${t.username} (${t.channel}) — ${t.subject}`).join('\n')
      : '📭 هیچ تیکت پشتیبانی فعالی ثبت نشده است.';

    const kb: InlineKeyboardButton[][] = tickets.results.slice(0, 6).map((t) => [
      { text: `✍️ پاسخ به ${t.username}`, callback_data: `adm:sup_reply:${t.id}`, style: 'primary' },
      { text: `🔒 بستن`, callback_data: `adm:sup_close:${t.id}`, style: 'danger' },
    ]);
    kb.push([{ text: '🔄 بروزرسانی تیکت‌ها', callback_data: 'adm:support' }]);
    kb.push([{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }]);
    await render(`💬 تیکت‌های پشتیبانی آنلاین:\n\n${lines}`, kb);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data.startsWith('adm:sup_reply:')) {
    const ticketId = data.slice('adm:sup_reply:'.length);
    const msgs = await env.DB.prepare(
      `SELECT sender_role, sender_name, message, created_at FROM support_messages WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 5`
    ).bind(ticketId).all<{ sender_role: string; sender_name: string | null; message: string }>().catch(() => ({ results: [] }));

    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'ADM_AWAIT_SUP_REPLY', targetKey: ticketId } satisfies AdminStepState), actor.id).run();

    const history = msgs.results.reverse().map((m) => `${m.sender_role === 'admin' ? '🛡 ادمین' : '👤 کاربر'}: ${m.message}`).join('\n');
    await bot.answerCallbackQuery(cqId);
    await bot.sendMessage(
      chatId,
      `✍️ پاسخ به تیکت #${ticketId}\n\nآخرین پیام‌ها:\n${history || '—'}\n\nمتن پاسخ خود را بنویسید (مستقیماً در وب و تلگرام کاربر ارسال می‌شود):`
    );
    return true;
  }

  if (data.startsWith('adm:sup_close:')) {
    const ticketId = data.slice('adm:sup_close:'.length);
    await env.DB.prepare(`UPDATE support_tickets SET status = 'CLOSED' WHERE id = ?`).bind(ticketId).run();
    await bot.answerCallbackQuery(cqId, 'تیکت بسته شد ✅');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, 'adm:support');
  }

  // Verified Copy Traders overview inside Admin Bot
  if (data === 'adm:copy') {
    const traders = await env.DB.prepare(
      `SELECT id, display_name, specialty, win_rate, roi_30d_pct, followers_count, is_verified FROM copy_traders ORDER BY roi_30d_pct DESC LIMIT 10`
    ).all<{ id: string; display_name: string; specialty: string; win_rate: number; roi_30d_pct: number; followers_count: number; is_verified: number }>().catch(() => ({ results: [] }));
    const lines = traders.results.length
      ? traders.results.map((t, i) => `${i + 1}. ${t.is_verified ? '✅' : '⏳'} ${t.display_name} (${t.specialty})\n   Win: ${t.win_rate}% | ROI 30d: +${t.roi_30d_pct}% | Followers: ${t.followers_count}`).join('\n\n')
      : 'هیچ تریدری ثبت نشده است.';
    const kb: InlineKeyboardButton[][] = [
      [{ text: '🔄 بروزرسانی لیست', callback_data: 'adm:copy', style: 'primary' }],
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ];
    await render(`🏆 کپی‌تریدرهای تاییدشده دلارینو:\n(برای افزودن تریدر جدید یا ثبت ترید، از پنل مدیریت وب استفاده کنید)\n\n${lines}`, kb);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  // Channel @Dollarino_official Status & News Publishing inside Admin Bot
  if (data === 'adm:channel') {
    if (!hasPerm(actor, 'broadcast') && !hasPerm(actor, 'settings')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی به مدیریت کانال', true);
      return true;
    }
    const cfg = await resolveChannelAndBotConfig(env);
    const [sigCnt, newsCnt, autoBroadcast, privOnly, alwaysOnSig, alwaysOnIntel] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM signals WHERE channel_message_id IS NOT NULL`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      env.DB.prepare(`SELECT COUNT(*) as cnt FROM channel_news WHERE channel_message_id IS NOT NULL`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
      getSystemSetting(env.DB, 'auto_publish_signals_to_channel', 'true'),
      getSystemSetting(env.DB, 'bot_private_admin_only', 'false'),
      getSystemSetting(env.DB, 'always_on_signals_enabled', 'true'),
      getSystemSetting(env.DB, 'always_on_ai_broadcast_enabled', 'true'),
    ]);

    const text =
      `📡 مرکز فرماندهی کانال و انتشار خودکار AI دلارینو\n\n` +
      `• کانال رسمی: ${cfg.channelHandle}\n` +
      `• ربات رسمی: @${cfg.botUsername}\n` +
      `• سیگنال دائمی (حتی با ربات خاموش): ${alwaysOnSig === 'true' ? '🟢 روشن' : '🔴 خاموش'}\n` +
      `• انتشار خودکار اخبار/تحلیل/اخطار/تبلیغ AI: ${alwaysOnIntel === 'true' ? '🟢 روشن' : '🔴 خاموش'}\n` +
      `• ارسال سیگنال در کانال: ${autoBroadcast === 'true' ? '🟢 روشن' : '🔴 خاموش'}\n` +
      `• وضعیت دسترسی ربات: ${privOnly === 'true' ? '🔒 فقط مدیران' : '🌐 عمومی'}\n` +
      `• سیگنال‌های کانال: ${sigCnt?.cnt ?? 0} | اخبار و تحلیل‌ها: ${newsCnt?.cnt ?? 0}`;

    await render(text, [
      [
        { text: '⚡️ سیگنال فوری AI', callback_data: 'adm:chan_ai:SIG', style: 'success' },
        { text: '📊 تحلیل فوری AI', callback_data: 'adm:chan_ai:ANALYSIS', style: 'primary' },
      ],
      [
        { text: '📰 خبر فوری AI', callback_data: 'adm:chan_ai:NEWS', style: 'primary' },
        { text: '🚀 تبلیغ و معرفی AI', callback_data: 'adm:chan_ai:PROMO', style: 'success' },
      ],
      [
        { text: '⚠️ اخطار نوسان AI', callback_data: 'adm:chan_ai:ALERT' },
        { text: '✍️ ارسال دستی خبر', callback_data: 'adm:chan_news:NEWS' },
      ],
      [
        { text: alwaysOnSig === 'true' ? '🟢 سیگنال دائمی: روشن' : '🔴 سیگنال دائمی: خاموش', callback_data: 'adm:chan_toggle_sig' },
        { text: alwaysOnIntel === 'true' ? '🟢 هوش‌مصنوعی کانال: روشن' : '🔴 هوش‌مصنوعی کانال: خاموش', callback_data: 'adm:chan_toggle_intel' },
      ],
      [
        { text: autoBroadcast === 'true' ? '🔴 توقف کانال' : '🟢 روشن‌کردن کانال', callback_data: 'adm:chan_toggle_auto' },
        { text: '🧪 تست اتصال', callback_data: 'adm:chan_ping' },
      ],
      [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }],
    ]);
    await bot.answerCallbackQuery(cqId);
    return true;
  }

  if (data === 'adm:chan_toggle_sig') {
    if (!hasPerm(actor, 'settings') && !hasPerm(actor, 'broadcast')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    const cur = await getSystemSetting(env.DB, 'always_on_signals_enabled', 'true');
    const next = cur === 'true' ? 'false' : 'true';
    await setSystemSetting(env.DB, 'always_on_signals_enabled', next);
    await auditAdmin(env.DB, actor.id, `Toggled always_on_signals_enabled=${next}`);
    await bot.answerCallbackQuery(cqId, next === 'true' ? 'سیگنال‌دهی دائمی ۲۴/۷ فعال شد 🟢' : 'سیگنال دائمی متوقف شد 🔴');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, 'adm:channel');
  }

  if (data === 'adm:chan_toggle_intel') {
    if (!hasPerm(actor, 'settings') && !hasPerm(actor, 'broadcast')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    const cur = await getSystemSetting(env.DB, 'always_on_ai_broadcast_enabled', 'true');
    const next = cur === 'true' ? 'false' : 'true';
    await setSystemSetting(env.DB, 'always_on_ai_broadcast_enabled', next);
    await auditAdmin(env.DB, actor.id, `Toggled always_on_ai_broadcast_enabled=${next}`);
    await bot.answerCallbackQuery(cqId, next === 'true' ? 'ارسال خودکار اخبار/تحلیل/تبلیغ AI فعال شد 🟢' : 'هوش مصنوعی کانال متوقف شد 🔴');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, 'adm:channel');
  }

  if (data.startsWith('adm:chan_ai:')) {
    if (!hasPerm(actor, 'broadcast') && !hasPerm(actor, 'settings')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    const kind = data.slice('adm:chan_ai:'.length);
    await bot.answerCallbackQuery(cqId, '⏳ هوش مصنوعی در حال آماده‌سازی و ارسال...');
    if (kind === 'SIG') {
      const r = await runAlwaysOnSignalRadar(env, { force: true });
      await bot.sendMessage(
        chatId,
        r.published
          ? `✅ سیگنال فوری ${r.symbol} (${r.direction}) در کانال و برای ${r.subscribersNotified ?? 0} کاربر ربات ارسال شد!`
          : `ℹ️ در این لحظه ستاپ با اطمینان بالا یافت نشد (${r.reason || 'wait'}).`
      );
    } else if (kind === 'ANALYSIS' || kind === 'NEWS' || kind === 'PROMO' || kind === 'ALERT') {
      const r = await runAlwaysOnAiIntel(env, { forceKind: kind });
      await bot.sendMessage(
        chatId,
        r.published
          ? `✅ پست هوشمند (${kind}) تولید و در کانال + برای ${r.usersNotified ?? 0} کاربر ربات منتشر شد!`
          : `⚠️ خطا یا محدودیت در ارسال (${r.reason || 'error'}).`
      );
    }
    return true;
  }

  if (data === 'adm:chan_toggle_auto') {
    if (!hasPerm(actor, 'settings') && !hasPerm(actor, 'broadcast')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی', true);
      return true;
    }
    const cur = await getSystemSetting(env.DB, 'auto_publish_signals_to_channel', 'true');
    const next = cur === 'true' ? 'false' : 'true';
    await setSystemSetting(env.DB, 'auto_publish_signals_to_channel', next);
    await auditAdmin(env.DB, actor.id, `Toggled auto_publish_signals_to_channel=${next}`);
    await bot.answerCallbackQuery(cqId, next === 'true' ? 'انتشار خودکار سیگنال‌ها در کانال فعال شد 🟢' : 'انتشار خودکار متوقف شد 🔴');
    return handleAdminCallback(env, bot, actor, cqId, chatId, msgId, 'adm:channel');
  }

  if (data === 'adm:chan_ping') {
    const cfg = await resolveChannelAndBotConfig(env);
    try {
      const me = await bot.getMe();
      await bot.answerCallbackQuery(cqId, `✅ ربات @${me.username} آماده ارسال به ${cfg.channelHandle} است`, true);
    } catch (err) {
      await bot.answerCallbackQuery(cqId, `❌ خطای اتصال: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    return true;
  }

  if (data.startsWith('adm:chan_news:')) {
    if (!hasPerm(actor, 'broadcast')) {
      await bot.answerCallbackQuery(cqId, 'عدم دسترسی به انتشار کانال', true);
      return true;
    }
    const category = data.slice('adm:chan_news:'.length) || 'NEWS';
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'ADM_CHAN_NEWS', targetKey: category } satisfies AdminStepState), actor.id).run();
    await bot.answerCallbackQuery(cqId);
    await bot.sendMessage(
      chatId,
      `📡 ارسال محتوا به کانال رسمی دلارینو (دسته: ${category}):\n\n` +
      `خط اول پیام به عنوان «تیتر» و بقیه خطوط به عنوان «متن کامل خبر/تحلیل» با دکمه‌های تعاملی و لینک ترید مستقیم در کانال منتشر می‌شوند.\n` +
      `(حتی می‌توانید عکس + کپشن بفرستید!)`,
      { inlineKeyboard: [[{ text: '🔙 انصراف', callback_data: 'adm:channel' }]] }
    );
    return true;
  }

  await bot.answerCallbackQuery(cqId);
  return true;
}

async function renderAdminUserCard(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  msgId: number | undefined,
  uid: string
) {
  const [u, sub, cfg, rateStr] = await Promise.all([
    env.DB.prepare(
      `SELECT id, username, email, role, is_blocked, telegram_id, telegram_username, wallet_balance_usdt,
              phone_number, phone_verified, trust_wallet_address, ui_mode, created_at, last_active_at
       FROM users WHERE id = ?`
    ).bind(uid).first<{
      id: string;
      username: string;
      email: string;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      telegram_username: string | null;
      wallet_balance_usdt?: number;
      phone_number?: string | null;
      phone_verified?: number;
      trust_wallet_address?: string | null;
      ui_mode?: string | null;
      created_at: string;
      last_active_at: string;
    }>(),
    env.DB.prepare(
      `SELECT plan_code, expires_at FROM user_subscriptions WHERE user_id = ? AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY created_at DESC LIMIT 1`
    ).bind(uid).first<{ plan_code: string; expires_at: string | null }>(),
    env.DB.prepare(`SELECT paper_balance, trading_mode FROM bot_configs WHERE user_id = ?`).bind(uid).first<{ paper_balance: string; trading_mode: string }>(),
    getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000'),
  ]);
  if (!u) {
    await bot.sendMessage(chatId, '❌ کاربر یافت نشد.');
    return;
  }
  const rate = Number(rateStr) || 70000;
  const walletUsdt = Number(u.wallet_balance_usdt ?? 0);
  const text =
    `👤 پروفایل کاربر:\n\n` +
    `• نام: ${u.username} (${u.telegram_username ? '@' + u.telegram_username : 'بدون یوزرنیم'})\n` +
    `• آیدی تلگرام: ${u.telegram_id ?? '—'} | رابط: ${u.ui_mode === 'pro' ? 'حرفه‌ای ⚡' : 'ساده 🌱'}\n` +
    `• 📱 موبایل (KYC): ${u.phone_verified ? `✅ تاییدشده (${u.phone_number || '—'})` : '⏳ احرازنشده'}\n` +
    `• 🦊 Trust Wallet: ${u.trust_wallet_address || 'متصل‌نشده'}\n` +
    `• نقش: ${u.role} | وضعیت: ${u.is_blocked ? '🔒 مسدود' : '🟢 فعال'}\n` +
    `• اشتراک: ${sub ? `💎 ${sub.plan_code} (تا ${formatIranDateTime(sub.expires_at)})` : 'بدون اشتراک فعال'}\n` +
    `• کیف پول: ${walletUsdt.toFixed(2)} USDT (${formatToman(walletUsdt, rate)} ت)\n` +
    `• موجودی شبیه‌ساز: ${cfg?.paper_balance ?? '10000'} USDT (${cfg?.trading_mode ?? 'PAPER'})\n` +
    `• عضویت: ${formatIranDateTime(u.created_at)}\n` +
    `• آخرین فعالیت: ${formatIranDateTime(u.last_active_at)}`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: '👑 ارتقاء VIP (۳۰ روز)', callback_data: `adm:u_vip:${u.id}` },
      { text: '📉 تنزل سطح', callback_data: `adm:u_downgrade:${u.id}` },
    ],
    [
      { text: '💰 شارژ کیف پول', callback_data: `adm:u_charge:${u.id}` },
      { text: u.is_blocked ? '✅ رفع مسدودیت' : '🔒 مسدود کردن', callback_data: `adm:u_block:${u.id}` },
    ],
    [{ text: '📊 گزارش معاملات کاربر', callback_data: `adm:u_stats:${u.id}` }],
    [{ text: '🔙 لیست کاربران', callback_data: 'adm:u_list:0' }],
  ];

  if (msgId) {
    await bot.editMessageText(chatId, msgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

export async function handleAdminStepInput(
  env: Env,
  bot: TelegramBotClient,
  actor: AdminActor,
  chatId: string | number,
  state: AdminStepState,
  text: string,
  photoFileId?: string
): Promise<boolean> {
  if (!state.step.startsWith('ADM_')) return false;

  if (isAdminSessionExpired(actor.lastActiveAt)) {
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL, admin_panel_last_active_at = NULL WHERE id = ?`).bind(actor.id).run();
    await bot.sendMessage(chatId, '⏰ نشست پنل مدیریت پس از ۱۵ دقیقه منقضی شد. لطفاً دوباره وارد شوید.');
    return true;
  }

  await touchAdminActivity(env.DB, actor.id);

  if (state.step === 'ADM_SEARCH_USER') {
    const q = text.replace(/^@/, '').trim();
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(actor.id).run();
    const u = await env.DB.prepare(
      `SELECT id FROM users WHERE telegram_id = ? OR LOWER(telegram_username) = LOWER(?) OR LOWER(email) = LOWER(?) OR id = ? LIMIT 1`
    ).bind(q, q, q, q).first<{ id: string }>();
    if (!u) {
      await bot.sendMessage(chatId, `❌ کاربری با مشخصات «${text}» پیدا نشد.`, {
        inlineKeyboard: [[{ text: '🔙 بازگشت به مدیریت کاربران', callback_data: 'adm:users' }]],
      });
      return true;
    }
    await renderAdminUserCard(env, bot, chatId, undefined, u.id);
    return true;
  }

  if (state.step === 'ADM_CHARGE_USER' && state.targetUserId) {
    const amt = Number(text);
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(actor.id).run();
    if (!Number.isFinite(amt) || amt <= 0) {
      await bot.sendMessage(chatId, '❌ مبلغ نامعتبر است.');
      return true;
    }
    await env.DB.prepare(`UPDATE users SET wallet_balance_usdt = COALESCE(wallet_balance_usdt, 0) + ? WHERE id = ?`)
      .bind(amt, state.targetUserId).run();
    await auditAdmin(env.DB, actor.id, `Charged user ${state.targetUserId} +${amt} USDT`);
    const target = await env.DB.prepare(`SELECT telegram_id FROM users WHERE id = ?`).bind(state.targetUserId).first<{ telegram_id: string | null }>();
    if (target?.telegram_id) {
      await bot.sendMessage(target.telegram_id, `💰 کیف پول شما به مبلغ ${amt} USDT توسط مدیریت شارژ شد!`).catch(() => {});
    }
    await bot.sendMessage(chatId, `✅ مبلغ ${amt} USDT به کیف پول کاربر اضافه شد.`);
    await renderAdminUserCard(env, bot, chatId, undefined, state.targetUserId);
    return true;
  }

  if (state.step === 'ADM_BROADCAST_MSG') {
    const target = state.bcTarget || 'all';
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(actor.id).run();

    let query = `SELECT u.telegram_id FROM users u WHERE u.telegram_id IS NOT NULL AND u.is_blocked = 0`;
    if (target === 'vip') {
      query = `SELECT DISTINCT u.telegram_id FROM users u JOIN user_subscriptions s ON s.user_id = u.id WHERE u.telegram_id IS NOT NULL AND u.is_blocked = 0 AND s.status = 'ACTIVE' AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))`;
    } else if (target === 'free') {
      query = `SELECT u.telegram_id FROM users u WHERE u.telegram_id IS NOT NULL AND u.is_blocked = 0 AND NOT EXISTS (SELECT 1 FROM user_subscriptions s WHERE s.user_id = u.id AND s.status = 'ACTIVE' AND (s.expires_at IS NULL OR s.expires_at > datetime('now')))`;
    } else if (target === 'active_today') {
      query = `SELECT u.telegram_id FROM users u WHERE u.telegram_id IS NOT NULL AND u.is_blocked = 0 AND date(u.last_active_at) = date('now')`;
    }

    const targets = await env.DB.prepare(query).all<{ telegram_id: string }>();
    let sent = 0;
    let failed = 0;
    const msgText = `📢 اطلاعیه دلارینو:\n\n${text}`;
    for (const t of targets.results) {
      try {
        if (photoFileId) {
          await bot.sendPhoto(t.telegram_id, photoFileId, msgText);
        } else {
          await bot.sendMessage(t.telegram_id, msgText);
        }
        sent++;
      } catch {
        failed++;
      }
    }
    await auditAdmin(env.DB, actor.id, `Broadcast to ${target}: ${sent} ok, ${failed} failed`);
    await bot.sendMessage(chatId, `✅ پیام همگانی تکمیل شد!\n• گروه هدف: ${target}\n• ارسال موفق: ${sent}\n• ناموفق: ${failed}`, {
      inlineKeyboard: [[{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'adm:home' }]],
    });
    return true;
  }

  // Gift Wizard
  if (state.step === 'ADM_GIFT_CREDIT') {
    const credit = Number(text);
    if (!Number.isFinite(credit) || credit <= 0) {
      await bot.sendMessage(chatId, '❌ مبلغ شارژ باید عددی مثبت باشد:');
      return true;
    }
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ ...state, step: 'ADM_GIFT_MAX_USES', giftCredit: credit, giftPlan: 'wallet_charge', giftDays: 0 } satisfies AdminStepState), actor.id).run();
    await bot.sendMessage(chatId, '🔢 حداکثر تعداد مجاز استفاده از این کد هدیه را وارد کنید (مثلاً 5):');
    return true;
  }

  if (state.step === 'ADM_GIFT_MAX_USES') {
    const maxUses = Math.max(1, Math.min(10000, Math.round(Number(text))));
    if (!Number.isFinite(maxUses) || maxUses <= 0) {
      await bot.sendMessage(chatId, '❌ یک عدد صحیح مثبت وارد کنید:');
      return true;
    }
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ ...state, step: 'ADM_GIFT_EXPIRE_DAYS', giftMaxUses: maxUses } satisfies AdminStepState), actor.id).run();
    await bot.sendMessage(chatId, '⏳ این کد چند روز اعتبار داشته باشد؟ (مثلاً 30، یا 0 برای بدون انقضا):');
    return true;
  }

  if (state.step === 'ADM_GIFT_EXPIRE_DAYS') {
    const expDays = Math.max(0, Math.round(Number(text)));
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ ...state, step: 'ADM_GIFT_CODE_NAME', giftExpireDays: expDays } satisfies AdminStepState), actor.id).run();
    await bot.sendMessage(chatId, '🏷 نام کد هدیه دلخواه را بنویسید (مثلاً VIP1405) یا کلمه «auto» را بفرستید تا خودکار ساخته شود:');
    return true;
  }

  if (state.step === 'ADM_GIFT_CODE_NAME') {
    const code = text.trim().toLowerCase() === 'auto'
      ? `DLR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      : text.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(actor.id).run();
    if (!code) {
      await bot.sendMessage(chatId, '❌ کد نامعتبر است.');
      return true;
    }
    const expSql = state.giftExpireDays && state.giftExpireDays > 0
      ? new Date(Date.now() + state.giftExpireDays * 86400_000).toISOString()
      : null;

    await env.DB.prepare(
      `INSERT OR REPLACE INTO gift_codes (code, code_type, plan_code, duration_days, credit_usdt, max_uses, is_active, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      code,
      state.giftType || 'SUBSCRIPTION',
      state.giftPlan || 'pro_monthly',
      state.giftDays ?? 30,
      state.giftCredit ?? 0,
      state.giftMaxUses ?? 1,
      actor.id,
      expSql
    ).run();

    await auditAdmin(env.DB, actor.id, `Created gift code ${code}`);
    await bot.sendMessage(
      chatId,
      `✅ کد هدیه با موفقیت ساخته شد!\n\n🎁 کد: ${code}\n📦 نوع: ${state.giftType === 'WALLET' ? `${state.giftCredit}$ شارژ کیف پول` : `${state.giftPlan} (${state.giftDays} روز)`}\n🔢 سقف مصرف: ${state.giftMaxUses}\n⏳ انقضا: ${expSql ? formatIranDateTime(expSql) : 'بدون انقضا'}`,
      { inlineKeyboard: [[{ text: '🎁 مشاهده کدهای هدیه', callback_data: 'adm:gifts' }]] }
    );
    return true;
  }

  if (state.step === 'ADM_AWAIT_SUP_REPLY' && state.targetKey) {
    const ticketId = state.targetKey;
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(actor.id).run();
    const ticket = await env.DB.prepare(
      `SELECT st.id, u.telegram_id FROM support_tickets st JOIN users u ON u.id = st.user_id WHERE st.id = ? LIMIT 1`
    ).bind(ticketId).first<{ id: string; telegram_id: string | null }>();
    if (!ticket) {
      await bot.sendMessage(chatId, '❌ تیکت یافت نشد.');
      return true;
    }
    await env.DB.prepare(
      `INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message)
       VALUES (?, ?, ?, 'admin', ?, ?)`
    ).bind(randomId('smsg'), ticketId, actor.id, actor.username || 'پشتیبانی دلارینو', text.trim().slice(0, 2000)).run();
    await env.DB.prepare(`UPDATE support_tickets SET status = 'ANSWERED', last_message_at = datetime('now') WHERE id = ?`).bind(ticketId).run();
    if (ticket.telegram_id) {
      await bot.sendMessage(ticket.telegram_id, `💬 پاسخ پشتیبانی آنلاین دلارینو:\n\n${text.trim()}`).catch(() => {});
    }
    await auditAdmin(env.DB, actor.id, `Replied to support ticket ${ticketId}`);
    await bot.sendMessage(chatId, `✅ پاسخ شما برای تیکت #${ticketId} ثبت و برای کاربر ارسال شد!`, {
      inlineKeyboard: [[{ text: '💬 بازگشت به تیکت‌ها', callback_data: 'adm:support', style: 'primary' }]],
    });
    return true;
  }

  if (state.step === 'ADM_CHAN_NEWS') {
    const category = (['NEWS', 'ANALYSIS', 'SIGNAL_UPDATE', 'ANNOUNCEMENT'].includes(state.targetKey || '')
      ? state.targetKey
      : 'NEWS') as 'NEWS' | 'ANALYSIS' | 'SIGNAL_UPDATE' | 'ANNOUNCEMENT';
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(actor.id).run();
    const lines = text.trim().split('\n');
    const title = (lines[0] || 'اطلاعیه دلارینو').slice(0, 120);
    const body = lines.slice(1).join('\n').trim() || lines[0] || text.trim();
    const res = await publishChannelNews(env, {
      category,
      title,
      body,
      createdBy: actor.id,
    });
    await auditAdmin(env.DB, actor.id, `Published channel ${category} news ${res.id}`);
    await bot.sendMessage(
      chatId,
      res.error
        ? `⚠️ در دیتابیس ذخیره شد ولی ارسال تلگرامی خطا خورد:\n${res.error}`
        : `✅ پیام شما با موفقیت در کانال رسمی دلارینو منتشر شد!\n🆔 شناسه پیام: ${res.channelMessageId ?? res.id}`,
      { inlineKeyboard: [[{ text: '📡 بازگشت به مدیریت کانال', callback_data: 'adm:channel', style: 'primary' }]] }
    );
    return true;
  }

  if (state.step === 'ADM_EDIT_SETTING' && state.targetKey) {
    const key = state.targetKey;
    await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(actor.id).run();
    if (key.startsWith('plan:')) {
      const planCode = key.slice('plan:'.length);
      const usd = Number(text);
      if (!Number.isFinite(usd) || usd <= 0) {
        await bot.sendMessage(chatId, '❌ قیمت باید یک عدد معتبر به دلار باشد.');
        return true;
      }
      const rate = Number(await getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000')) || 70000;
      await env.DB.prepare(`UPDATE subscription_plans SET price_usd = ?, price_toman = ?, updated_at = datetime('now') WHERE code = ?`)
        .bind(usd, Math.round(usd * rate), planCode).run();
    } else if (key.startsWith('key:')) {
      const settingKey = key.slice('key:'.length);
      await setSystemSetting(env.DB, settingKey, text.trim());
    }
    await auditAdmin(env.DB, actor.id, `Updated setting ${key}`);
    await bot.sendMessage(chatId, `✅ تنظیم «${key}» با موفقیت ذخیره شد!`, {
      inlineKeyboard: [[{ text: '⚙️ بازگشت به تنظیمات سیستم', callback_data: 'adm:settings' }]],
    });
    return true;
  }

  return false;
}
