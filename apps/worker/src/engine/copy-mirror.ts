import type { Direction, DollarinoSignal } from '@dollarino/core';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserEntitlement } from '../routes/subscriptions.js';
import { TelegramBotClient } from '../telegram/client.js';
import {
  getSystemSettingValue,
  publishSignalBroadcast,
} from '../telegram/publisher.js';
import { executeSignalForUser } from './executor.js';

export interface CopyTradeRecord {
  id: string;
  trader_id: string;
  symbol: string;
  direction: Direction;
  leverage: number;
  entry_price: string;
  stop_loss: string | null;
  tp1: string | null;
  tp2: string | null;
  tp3: string | null;
  status: string;
  publish_status: string;
  note: string | null;
}

/**
 * Confirms a Copy Trader's trade for publication, broadcasts it to @Dollarino_official / subscribers,
 * and immediately mirrors exact parameters into all active auto_mirror follower accounts.
 */
export async function confirmAndMirrorCopyTrade(
  env: Env,
  copyTradeId: string,
  approve: boolean
): Promise<{
  ok: boolean;
  published: boolean;
  mirroredCount: number;
  skippedCount: number;
  channelMessageId?: number;
}> {
  const row = await env.DB.prepare(
    `SELECT ctt.*, ct.display_name AS trader_name
     FROM copy_trader_trades ctt
     JOIN copy_traders ct ON ct.id = ctt.trader_id
     WHERE ctt.id = ? LIMIT 1`
  ).bind(copyTradeId).first<CopyTradeRecord & { trader_name: string }>();

  if (!row) {
    return { ok: false, published: false, mirroredCount: 0, skippedCount: 0 };
  }

  if (!approve) {
    await env.DB.prepare(`UPDATE copy_trader_trades SET publish_status = 'REJECTED' WHERE id = ?`)
      .bind(copyTradeId).run();
    return { ok: true, published: false, mirroredCount: 0, skippedCount: 0 };
  }

  await env.DB.prepare(`UPDATE copy_trader_trades SET publish_status = 'PUBLISHED' WHERE id = ?`)
    .bind(copyTradeId).run();

  const entryNum = Number(row.entry_price) || 1;
  const fallbackSl = row.stop_loss || (row.direction === 'LONG' ? (entryNum * 0.98).toFixed(4) : (entryNum * 1.02).toFixed(4));
  const fallbackTp1 = row.tp1 || (row.direction === 'LONG' ? (entryNum * 1.03).toFixed(4) : (entryNum * 0.97).toFixed(4));

  const sig: DollarinoSignal = {
    symbol: row.symbol,
    direction: row.direction,
    timeframe: 'Copy',
    price: row.entry_price,
    stopLoss: fallbackSl,
    leverage: row.leverage,
    tp1: fallbackTp1,
    tp2: row.tp2 ?? undefined,
    tp3: row.tp3 ?? undefined,
    engineKey: 'copy_trade',
    engineLabel: `🏆 کپی‌ترید تاییدشده · ${row.trader_name}`,
  };

  const publishChan = (await getSystemSettingValue(env.DB, 'copy_publish_to_channel', 'true')) === 'true';
  const broadcast = await publishSignalBroadcast(env, {
    signal: sig,
    source: 'COPY_TRADE',
    engineKey: 'copy_trade',
    engineLabel: `🏆 کپی‌ترید تاییدشده · ${row.trader_name}`,
    publishToChannel: publishChan,
    notifySubscribers: false,
  });

  if (broadcast.channelMessageId) {
    await env.DB.prepare(`UPDATE copy_trader_trades SET channel_message_id = ? WHERE id = ?`)
      .bind(broadcast.channelMessageId, copyTradeId).run().catch(() => {});
  }

  // Mirror exact parameters immediately to all active followers of this trader
  const followers = await env.DB.prepare(
    `SELECT cs.user_id, cs.allocation_usd, cs.risk_multiplier, u.telegram_id, u.email, u.role
     FROM copy_subscriptions cs
     JOIN users u ON u.id = cs.user_id
     WHERE cs.trader_id = ? AND cs.is_active = 1 AND cs.auto_mirror = 1`
  ).bind(row.trader_id).all<{
    user_id: string;
    allocation_usd: number;
    risk_multiplier: number;
    telegram_id: string | null;
    email: string;
    role: 'owner' | 'admin' | 'user';
  }>();

  let mirroredCount = 0;
  let skippedCount = 0;
  const tg = env.TELEGRAM_BOT_TOKEN ? new TelegramBotClient(env.TELEGRAM_BOT_TOKEN) : null;

  for (const f of followers.results) {
    try {
      const ent = await resolveUserEntitlement(env.DB, {
        id: f.user_id,
        email: f.email,
        username: f.email,
        role: f.role,
        telegramId: f.telegram_id,
      });
      if (!ent.hasPaidPlan && ent.subscriptionRequired) {
        skippedCount++;
        continue;
      }

      const execRes = await executeSignalForUser(env, f.user_id, sig, {
        signalId: broadcast.signalId,
        forceBypassState: true,
        strategyKey: 'copy_trade',
        aiConfidence: 95,
        aiReasoning: `Copy-Trade mirror from verified trader ${row.trader_name}`,
      });

      if (execRes.ok) {
        mirroredCount++;
        if (tg && f.telegram_id) {
          await tg.sendMessage(
            f.telegram_id,
            `🏆 معامله کپی‌ترید از ${row.trader_name} برای شما آینه‌سازی شد!\n\n` +
              `${row.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'} · ${row.symbol} (${row.leverage}x)\n` +
              `📥 ورود: ${row.entry_price}\n⛔️ SL: ${fallbackSl}\n🎯 TP1: ${fallbackTp1}`
          ).catch(() => {});
        }
      } else {
        skippedCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  return {
    ok: true,
    published: true,
    mirroredCount,
    skippedCount,
    channelMessageId: broadcast.channelMessageId,
  };
}
