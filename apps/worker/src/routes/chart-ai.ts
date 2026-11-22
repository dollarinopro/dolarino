import { Hono } from 'hono';
import { DEFAULT_MIXER_WEIGHTS, mergeKbosParams, type SignalMixerWeights, type Timeframe } from '@dollarino/core';
import { runChartAIAnalysis } from '../ai/providers.js';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { requirePaidEntitlement } from './subscriptions.js';

export const chartAiRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
chartAiRoutes.use('*', requireAuth);

function higherTimeframeFor(tf: Timeframe): Timeframe {
  const map: Record<string, Timeframe> = {
    '1m': '15m',
    '3m': '15m',
    '5m': '15m',
    '15m': '1h',
    '30m': '4h',
    '1h': '4h',
    '2h': '4h',
    '4h': '1d',
    '1d': '1d',
  };
  return map[tf] ?? '4h';
}

chartAiRoutes.get('/chats', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT id, symbol, timeframe, title, updated_at FROM chart_ai_chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 25`
  ).bind(user.id).all();
  return c.json({ chats: rows.results });
});

chartAiRoutes.get('/chats/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT * FROM chart_ai_chats WHERE id = ? AND user_id = ?`
  ).bind(c.req.param('id'), user.id).first();
  if (!row) return c.json({ error: 'Chat not found' }, 404);
  return c.json({ chat: row });
});

chartAiRoutes.post('/analyze', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) {
    return c.json({ error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  }
  const body = await c.req.json<{
    chatId?: string;
    symbol: string;
    timeframe: Timeframe;
    prompt: string;
  }>();

  const symbol = (body.symbol || 'BTCUSDT').toUpperCase();
  const timeframe = (body.timeframe || '15m') as Timeframe;
  const htfTf = higherTimeframeFor(timeframe);
  const prompt = (body.prompt || 'Analyze trend, key support/resistance, and suggest Entry/SL/3-TP setup.').trim();

  const [{ adapter }, cfgRow] = await Promise.all([
    resolveUserExchangeAdapter(c.env, user.id, 'paper'),
    c.env.DB.prepare('SELECT kbos_params_json, mixer_weights_json, mixer_threshold FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ kbos_params_json?: string; mixer_weights_json?: string; mixer_threshold?: number }>(),
  ]);

  const [candles, htfCandles] = await Promise.all([
    adapter.getKlines(symbol, timeframe, 360),
    adapter.getKlines(symbol, htfTf, 140),
  ]);

  let kbosParams = mergeKbosParams();
  try {
    if (cfgRow?.kbos_params_json) kbosParams = mergeKbosParams(JSON.parse(cfgRow.kbos_params_json));
  } catch { /* default */ }

  let mixerWeights: SignalMixerWeights = DEFAULT_MIXER_WEIGHTS;
  try {
    if (cfgRow?.mixer_weights_json) mixerWeights = JSON.parse(cfgRow.mixer_weights_json) as SignalMixerWeights;
  } catch { /* default */ }

  const analysis = await runChartAIAnalysis(c.env, user.id, symbol, timeframe, candles, prompt, {
    htfCandles,
    kbosParams,
    mixerWeights,
    mixerThreshold: cfgRow?.mixer_threshold ?? 65,
  });

  const chatId = body.chatId || randomId('chat');
  const existing = await c.env.DB.prepare('SELECT messages_json FROM chart_ai_chats WHERE id = ? AND user_id = ?')
    .bind(chatId, user.id).first<{ messages_json: string }>();

  const prevMessages: Array<{ role: string; content: string }> = existing
    ? JSON.parse(existing.messages_json)
    : [];
  const nextMessages = [
    ...prevMessages,
    { role: 'user', content: prompt },
    { role: 'assistant', content: analysis.summary },
  ];

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE chart_ai_chats SET messages_json = ?, annotations_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(nextMessages), JSON.stringify(analysis), chatId).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO chart_ai_chats (id, user_id, symbol, timeframe, title, messages_json, annotations_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      chatId,
      user.id,
      symbol,
      timeframe,
      `${symbol} ${timeframe} Analysis`,
      JSON.stringify(nextMessages),
      JSON.stringify(analysis)
    ).run();
  }

  return c.json({ chatId, analysis, messages: nextMessages });
});
