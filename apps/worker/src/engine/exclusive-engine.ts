import { logAudit } from './executor.js';

export type TradingEngineChoice = 'CENTRAL_AI' | 'MY_AI' | 'STRATEGY' | 'COPY_TRADE';

export interface ActiveEngineState {
  activeEngine: TradingEngineChoice | 'NONE';
  strategyKey: string;
  botState: string;
  isBotRunning: boolean;
  myAiActive: boolean;
  activeCopyTradersCount: number;
}

export function classifyEngineFromStrategyKey(
  strategyKey: string | null | undefined,
  myAiActive: boolean,
  activeCopyCount: number,
  botState: string | null | undefined
): TradingEngineChoice | 'NONE' {
  const isRunning = botState === 'RUNNING_PAPER' || botState === 'RUNNING_LIVE';
  if (activeCopyCount > 0 && !isRunning) {
    return 'COPY_TRADE';
  }
  if (strategyKey === 'copy_trade' && activeCopyCount > 0) {
    return 'COPY_TRADE';
  }
  if (strategyKey === 'ai_autonomous_agent') {
    return 'CENTRAL_AI';
  }
  if (strategyKey === 'my_custom_ai' || (myAiActive && !isRunning)) {
    return 'MY_AI';
  }
  if (strategyKey) {
    return 'STRATEGY';
  }
  return activeCopyCount > 0 ? 'COPY_TRADE' : 'NONE';
}

export async function getActiveEngineState(db: D1Database, userId: string): Promise<ActiveEngineState> {
  const [cfg, agent, copyCnt] = await Promise.all([
    db
      .prepare(`SELECT bot_state, strategy_key FROM bot_configs WHERE user_id = ? LIMIT 1`)
      .bind(userId)
      .first<{ bot_state: string; strategy_key: string }>()
      .catch(() => null),
    db
      .prepare(`SELECT is_active_for_trading FROM user_ai_agents WHERE user_id = ? LIMIT 1`)
      .bind(userId)
      .first<{ is_active_for_trading: number }>()
      .catch(() => null),
    db
      .prepare(`SELECT COUNT(*) as cnt FROM copy_subscriptions WHERE user_id = ? AND is_active = 1`)
      .bind(userId)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
  ]);

  const botState = cfg?.bot_state || 'STOPPED';
  const strategyKey = cfg?.strategy_key || 'dollarino_v01';
  const myAiActive = Boolean(agent?.is_active_for_trading);
  const activeCopyTradersCount = Number(copyCnt?.cnt ?? 0);
  const isBotRunning = botState === 'RUNNING_PAPER' || botState === 'RUNNING_LIVE';

  const activeEngine = classifyEngineFromStrategyKey(strategyKey, myAiActive, activeCopyTradersCount, botState);

  return {
    activeEngine,
    strategyKey,
    botState,
    isBotRunning,
    myAiActive,
    activeCopyTradersCount,
  };
}

async function deactivateAllCopySubscriptions(db: D1Database, userId: string): Promise<number> {
  const activeRows = await db
    .prepare(`SELECT id, trader_id FROM copy_subscriptions WHERE user_id = ? AND is_active = 1`)
    .bind(userId)
    .all<{ id: string; trader_id: string }>()
    .catch(() => ({ results: [] as Array<{ id: string; trader_id: string }> }));

  if (!activeRows.results.length) return 0;

  await db
    .prepare(`UPDATE copy_subscriptions SET is_active = 0, updated_at = datetime('now') WHERE user_id = ? AND is_active = 1`)
    .bind(userId)
    .run()
    .catch(() => {});

  for (const row of activeRows.results) {
    await db
      .prepare(`UPDATE copy_traders SET followers_count = MAX(0, followers_count - 1) WHERE id = ?`)
      .bind(row.trader_id)
      .run()
      .catch(() => {});
  }

  return activeRows.results.length;
}

/**
 * Enforces strict single-engine mutual exclusion:
 * Activating CENTRAL_AI, MY_AI, STRATEGY, or COPY_TRADE automatically disables all other engines.
 */
export async function activateExclusiveTradingEngine(
  db: D1Database,
  userId: string,
  target: TradingEngineChoice,
  opts?: {
    strategyKey?: string;
    customStrategyId?: string | null;
    stopBotOnCopyTrade?: boolean;
    auditSource?: string;
  }
): Promise<{
  cancelledCopyCount: number;
  stoppedBot: boolean;
  disabledMyAi: boolean;
}> {
  let cancelledCopyCount = 0;
  let stoppedBot = false;
  let disabledMyAi = false;

  if (target === 'COPY_TRADE') {
    const cfg = await db
      .prepare(`SELECT bot_state FROM bot_configs WHERE user_id = ? LIMIT 1`)
      .bind(userId)
      .first<{ bot_state: string }>()
      .catch(() => null);
    if (cfg && (cfg.bot_state === 'RUNNING_PAPER' || cfg.bot_state === 'RUNNING_LIVE')) {
      stoppedBot = true;
    }
    await db
      .prepare(
        `UPDATE bot_configs
         SET bot_state = 'STOPPED',
             strategy_key = 'copy_trade',
             active_custom_strategy_id = NULL,
             updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .bind(userId)
      .run()
      .catch(() => {});

    const agRes = await db
      .prepare(`UPDATE user_ai_agents SET is_active_for_trading = 0, updated_at = datetime('now') WHERE user_id = ? AND is_active_for_trading = 1`)
      .bind(userId)
      .run()
      .catch(() => null);
    disabledMyAi = Boolean(agRes?.meta?.changes);
  } else {
    cancelledCopyCount = await deactivateAllCopySubscriptions(db, userId);

    if (target === 'CENTRAL_AI') {
      const agRes = await db
        .prepare(`UPDATE user_ai_agents SET is_active_for_trading = 0, updated_at = datetime('now') WHERE user_id = ? AND is_active_for_trading = 1`)
        .bind(userId)
        .run()
        .catch(() => null);
      disabledMyAi = Boolean(agRes?.meta?.changes);

      await db
        .prepare(
          `UPDATE bot_configs
           SET strategy_key = 'ai_autonomous_agent',
               active_custom_strategy_id = NULL,
               ai_gate_enabled = 1,
               updated_at = datetime('now')
           WHERE user_id = ?`
        )
        .bind(userId)
        .run()
        .catch(() => {});
    } else if (target === 'MY_AI') {
      await db
        .prepare(`UPDATE user_ai_agents SET is_active_for_trading = 1, updated_at = datetime('now') WHERE user_id = ?`)
        .bind(userId)
        .run()
        .catch(() => {});

      await db
        .prepare(
          `UPDATE bot_configs
           SET strategy_key = 'my_custom_ai',
               active_custom_strategy_id = NULL,
               updated_at = datetime('now')
           WHERE user_id = ?`
        )
        .bind(userId)
        .run()
        .catch(() => {});
    } else if (target === 'STRATEGY') {
      const agRes = await db
        .prepare(`UPDATE user_ai_agents SET is_active_for_trading = 0, updated_at = datetime('now') WHERE user_id = ? AND is_active_for_trading = 1`)
        .bind(userId)
        .run()
        .catch(() => null);
      disabledMyAi = Boolean(agRes?.meta?.changes);

      const skey = opts?.strategyKey && opts.strategyKey !== 'ai_autonomous_agent' && opts.strategyKey !== 'my_custom_ai' && opts.strategyKey !== 'copy_trade'
        ? opts.strategyKey
        : 'dollarino_v01';

      if (opts?.customStrategyId !== undefined) {
        await db
          .prepare(
            `UPDATE bot_configs
             SET strategy_key = ?,
                 active_custom_strategy_id = ?,
                 updated_at = datetime('now')
             WHERE user_id = ?`
          )
          .bind(skey, opts.customStrategyId, userId)
          .run()
          .catch(() => {});
      } else {
        await db
          .prepare(
            `UPDATE bot_configs
             SET strategy_key = ?,
                 updated_at = datetime('now')
             WHERE user_id = ?`
          )
          .bind(skey, userId)
          .run()
          .catch(() => {});
      }
    }
  }

  if (cancelledCopyCount > 0 || stoppedBot || disabledMyAi) {
    const parts: string[] = [];
    if (cancelledCopyCount > 0) parts.push(`${cancelledCopyCount} copy-trade subscription(s) stopped`);
    if (stoppedBot) parts.push('autonomous bot stopped');
    if (disabledMyAi) parts.push('personal AI deactivated');
    await logAudit(
      db,
      userId,
      'SYSTEM',
      'INFO',
      `Exclusive engine -> ${target} (${parts.join(', ')}${opts?.auditSource ? ` via ${opts.auditSource}` : ''})`
    ).catch(() => {});
  }

  return { cancelledCopyCount, stoppedBot, disabledMyAi };
}
