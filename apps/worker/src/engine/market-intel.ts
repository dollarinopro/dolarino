import {
  computeStrategySignals,
  ema,
  evaluateSignalMixerAtBar,
  resolveEngineDisplayLabel,
  rsi,
  selectClosedCandles,
  strategyOutputToDollarinoSignal,
  type Candle,
  type DollarinoSignal,
} from '@dollarino/core';
import { callBYOAI, resolveAIEnsemble, runAutonomousAITrader } from '../ai/providers.js';
import type { Env } from '../env.js';
import { fetchPublicKlines, fetchPublicMarket24h } from '../exchanges/paper.js';
import { buildToobitRequest, type ToobitProxyConfig } from '../exchanges/proxy.js';
import {
  getSystemSettingValue,
  publishChannelNews,
  publishSignalBroadcast,
  resolveChannelAndBotConfig,
} from '../telegram/publisher.js';

const WATCH_COINS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'TONUSDT',
  'AVAXUSDT',
  'SUIUSDT',
  'DOGEUSDT',
  'LINKUSDT',
  'ARBUSDT',
  'ADAUSDT',
];

function getProxyCfg(env: Env): ToobitProxyConfig | undefined {
  return env.TOOBIT_PROXY_URL
    ? { proxyUrl: env.TOOBIT_PROXY_URL, proxySecret: env.EXCHANGE_PROXY_SECRET }
    : undefined;
}

async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(key, value)
    .run()
    .catch(() => {});
}

async function getSettingsMap(db: D1Database, keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const placeholders = keys.map(() => '?').join(', ');
  const rows = await db
    .prepare(`SELECT key, value FROM system_settings WHERE key IN (${placeholders})`)
    .bind(...keys)
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] as Array<{ key: string; value: string }> }));
  const map: Record<string, string> = {};
  for (const r of rows.results ?? []) {
    map[r.key] = r.value;
  }
  return map;
}

function minsFromIso(val?: string): number {
  if (!val) return Infinity;
  const ts = Date.parse(val);
  if (!Number.isFinite(ts)) return Infinity;
  return (Date.now() - ts) / 60_000;
}

async function minutesSinceSetting(db: D1Database, key: string): Promise<number> {
  const val = await getSystemSettingValue(db, key, '');
  return minsFromIso(val);
}

function roundSignalPrice(val: number, ref: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0';
  if (ref >= 1000) return val.toFixed(2);
  if (ref >= 10) return val.toFixed(3);
  if (ref >= 1) return val.toFixed(4);
  if (ref >= 0.01) return val.toFixed(5);
  return val.toFixed(7);
}

/**
 * Always-On 24/7 Signal Radar.
 * Runs independently of whether users' personal auto-trading bots are ON or OFF,
 * publishing verified signals to @Dollarino_official and delivering them to bot users.
 */
export async function runAlwaysOnSignalRadar(
  env: Env,
  opts?: { force?: boolean }
): Promise<{
  scanned: number;
  published: boolean;
  symbol?: string;
  direction?: string;
  signalId?: string;
  subscribersNotified?: number;
  reason?: string;
}> {
  const settings = await getSettingsMap(env.DB, [
    'always_on_signals_enabled',
    'intel_last_scan_at',
    'intel_last_signal_at',
  ]);
  const enabled = (settings['always_on_signals_enabled'] ?? 'true') === 'true';
  if (!enabled && !opts?.force) {
    return { scanned: 0, published: false, reason: 'disabled' };
  }

  if (!opts?.force) {
    const minsSinceScan = minsFromIso(settings['intel_last_scan_at']);
    if (minsSinceScan < 15) {
      return { scanned: 0, published: false, reason: 'scan_cooldown' };
    }
    const minsSincePub = minsFromIso(settings['intel_last_signal_at']);
    if (minsSincePub < 45) {
      await setSetting(env.DB, 'intel_last_scan_at', new Date().toISOString());
      return { scanned: 0, published: false, reason: 'publish_cooldown' };
    }
  }

  await setSetting(env.DB, 'intel_last_scan_at', new Date().toISOString());
  const proxyCfg = getProxyCfg(env);
  const cfg = await resolveChannelAndBotConfig(env);

  const cursorStr = await getSystemSettingValue(env.DB, 'intel_scan_cursor', '0');
  const cursor = Number.parseInt(cursorStr, 10) || 0;
  const batch: string[] = [];
  for (let i = 0; i < 6; i++) {
    batch.push(WATCH_COINS[(cursor + i) % WATCH_COINS.length]!);
  }
  await setSetting(env.DB, 'intel_scan_cursor', String((cursor + 6) % WATCH_COINS.length));

  const computeSignalRR = (entryStr: string, slStr: string, tp1Str?: string, tp2Str?: string): number => {
    const entry = Number(entryStr);
    const sl = Number(slStr);
    const tp = Number(tp2Str || tp1Str || 0);
    const risk = Math.abs(entry - sl);
    if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp) || risk <= 0) return 0;
    return Math.abs(tp - entry) / risk;
  };

  const evaluateHtfQuality = (
    closed15: Candle[],
    closed1h: Candle[],
    dir: 'LONG' | 'SHORT'
  ): boolean => {
    const c15 = closed15.map((c) => c.close);
    const rArr = c15.length >= 20 ? rsi(c15, 14) : [];
    const r14 = rArr[rArr.length - 1] ?? 50;
    if (dir === 'LONG' && (r14 > 67 || r14 < 36)) return false;
    if (dir === 'SHORT' && (r14 < 33 || r14 > 64)) return false;

    if (closed1h.length >= 55) {
      const c1h = closed1h.map((c) => c.close);
      const e20 = ema(c1h, 20);
      const e50 = ema(c1h, 50);
      const f = e20[e20.length - 1] ?? 0;
      const s = e50[e50.length - 1] ?? 0;
      if (f > 0 && s > 0) {
        if (dir === 'LONG' && f < s * 0.998) return false;
        if (dir === 'SHORT' && f > s * 1.002) return false;
      }
    }
    return true;
  };

  let chosenSignal: DollarinoSignal | null = null;
  let chosenEngineKey = 'dollarino_v01';
  let bestCandidate: {
    symbol: string;
    candles15m: Candle[];
    candles1h: Candle[];
    score: number;
  } | null = null;

  for (const sym of batch) {
    if (!opts?.force) {
      const symCooldown = await minutesSinceSetting(env.DB, `intel_sig_last_${sym}`);
      if (symCooldown < 180) continue;
    }

    const [raw15, raw1h] = await Promise.all([
      fetchPublicKlines(sym, '15m', 120, proxyCfg).catch(() => []),
      fetchPublicKlines(sym, '1h', 120, proxyCfg).catch(() => []),
    ]);
    const closed15 = selectClosedCandles(raw15, '15m');
    const closed1h = selectClosedCandles(raw1h, '1h');
    if (closed15.length < 40) continue;

    // 1) Zero-Token Mechanical Check (Dorna V1 & KBOS v11) with strict HTF + R:R >= 1.8 filter
    for (const skey of ['dollarino_v01', 'kbos_v11'] as const) {
      const outputs = computeStrategySignals(skey, closed15, closed1h, '15m', '1h', {});
      const latest = outputs[outputs.length - 1];
      if (latest && latest.signal !== 'NONE' && Number.isFinite(latest.stopLoss)) {
        const sig = strategyOutputToDollarinoSignal(
          sym,
          '15m',
          sym === 'BTCUSDT' || sym === 'ETHUSDT' ? 10 : 8,
          latest,
          cfg.channelHandle,
          skey
        );
        if (sig) {
          const rr = computeSignalRR(sig.price, sig.stopLoss, sig.tp1, sig.tp2);
          const htfOk = opts?.force || evaluateHtfQuality(closed15, closed1h, sig.direction);
          if (htfOk && (opts?.force || rr >= 1.8)) {
            chosenSignal = sig;
            chosenEngineKey = skey;
            break;
          }
        }
      }
    }
    if (chosenSignal) break;

    // 2) Zero-Token Quant Confluence Screener before ever consulting external AI
    let htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (closed1h.length >= 55) {
      const c1h = closed1h.map((c) => c.close);
      const e20 = ema(c1h, 20);
      const e50 = ema(c1h, 50);
      const f = e20[e20.length - 1] ?? 0;
      const s = e50[e50.length - 1] ?? 0;
      if (f > 0 && s > 0) {
        htfTrend = f > s * 1.001 ? 'BULLISH' : f < s * 0.999 ? 'BEARISH' : 'NEUTRAL';
      }
    }
    const mixer = evaluateSignalMixerAtBar(closed15, closed15.length - 1, htfTrend);
    const absScore = Math.abs(mixer.compositeScore || 0);
    const lastClose = closed15[closed15.length - 1]!.close;
    const prevClose = closed15[Math.max(0, closed15.length - 9)]!.close;
    const movePct = prevClose > 0 ? Math.abs((lastClose - prevClose) / prevClose) * 100 : 0;
    const compositeRank = absScore + movePct * 4;

    if (opts?.force || (absScore >= 34 && mixer.direction !== 'NONE' && evaluateHtfQuality(closed15, closed1h, mixer.direction))) {
      if (!bestCandidate || compositeRank > bestCandidate.score) {
        bestCandidate = { symbol: sym, candles15m: closed15, candles1h: closed1h, score: compositeRank };
      }
    }
  }

  // 3) Only consult Central AI (1 lightweight model call) when a genuinely strong A+ candidate exists (or when forced)
  if (!chosenSignal && (bestCandidate || opts?.force)) {
    const targetSym = bestCandidate?.symbol || 'BTCUSDT';
    let candles = bestCandidate?.candles15m ?? [];
    let htf = bestCandidate?.candles1h ?? [];
    if (candles.length < 30) {
      const [raw15, raw1h] = await Promise.all([
        fetchPublicKlines(targetSym, '15m', 120, proxyCfg).catch(() => []),
        fetchPublicKlines(targetSym, '1h', 120, proxyCfg).catch(() => []),
      ]);
      candles = selectClosedCandles(raw15, '15m');
      htf = selectClosedCandles(raw1h, '1h');
    }
    if (candles.length >= 30) {
      const decision = await runAutonomousAITrader(env, 'system_radar', {
        symbol: targetSym,
        timeframe: '15m',
        higherTimeframe: '1h',
        candles,
        htfCandles: htf.length >= 25 ? htf : undefined,
        maxLeverage: 10,
        minConfidence: opts?.force ? 60 : 78,
        riskPreset: 'balanced',
      }).catch(() => null);

      if (
        decision &&
        decision.ok &&
        (decision.action === 'LONG' || decision.action === 'SHORT') &&
        decision.confidence >= (opts?.force ? 60 : 78) &&
        decision.entry > 0 &&
        decision.stopLoss > 0 &&
        decision.tp1 > 0
      ) {
        const rr = computeSignalRR(
          String(decision.entry),
          String(decision.stopLoss),
          String(decision.tp1),
          decision.tp2 > 0 ? String(decision.tp2) : undefined
        );
        const htfOk = opts?.force || evaluateHtfQuality(candles, htf, decision.action);
        if (htfOk && (opts?.force || rr >= 1.8)) {
          chosenEngineKey = 'ai_autonomous_agent';
          chosenSignal = {
            symbol: targetSym,
            direction: decision.action,
            timeframe: '15m',
            price: roundSignalPrice(decision.entry, decision.entry),
            stopLoss: roundSignalPrice(decision.stopLoss, decision.entry),
            leverage: Math.min(10, Math.max(3, decision.leverage || 5)),
            tp1: roundSignalPrice(decision.tp1, decision.entry),
            tp2: decision.tp2 > 0 ? roundSignalPrice(decision.tp2, decision.entry) : undefined,
            tp3: decision.tp3 > 0 ? roundSignalPrice(decision.tp3, decision.entry) : undefined,
            channelHandle: cfg.channelHandle,
            engineKey: 'ai_autonomous_agent',
            engineLabel: resolveEngineDisplayLabel('ai_autonomous_agent'),
          };
        }
      }
    }
  }

  if (!chosenSignal) {
    return { scanned: batch.length, published: false, reason: 'no_high_confidence_setup' };
  }

  const pubRes = await publishSignalBroadcast(env, {
    signal: chosenSignal,
    source: 'always_on_ai_radar',
    engineKey: chosenEngineKey,
    engineLabel: resolveEngineDisplayLabel(chosenEngineKey),
    publishToChannel: true,
    notifySubscribers: true,
  });

  const nowIso = new Date().toISOString();
  await Promise.all([
    setSetting(env.DB, 'intel_last_signal_at', nowIso),
    setSetting(env.DB, `intel_sig_last_${chosenSignal.symbol}`, nowIso),
  ]);

  return {
    scanned: batch.length,
    published: true,
    symbol: chosenSignal.symbol,
    direction: chosenSignal.direction,
    signalId: pubRes.signalId,
    subscribersNotified: pubRes.subscribersNotified,
  };
}

interface LiveCoinSnap {
  symbol: string;
  price: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  fundingRate: string;
}

async function gatherMarketSnapshot(env: Env): Promise<{
  coins: LiveCoinSnap[];
  btcRsi1h: number;
  btcEma20: number;
  btcEma50: number;
}> {
  const proxyCfg = getProxyCfg(env);
  const targetCoins = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'TONUSDT', 'XRPUSDT'];
  const [tickers, btcKlines] = await Promise.all([
    Promise.all(
      targetCoins.map(async (sym) => {
        const m = await fetchPublicMarket24h(sym, proxyCfg).catch(() => null);
        return {
          symbol: sym,
          price: Number(m?.lastPrice ?? 0),
          changePct24h: Number(m?.changePct24h ?? 0),
          high24h: Number(m?.high24h ?? 0),
          low24h: Number(m?.low24h ?? 0),
          fundingRate: m?.fundingRate ?? '0.0001',
        };
      })
    ),
    fetchPublicKlines('BTCUSDT', '1h', 80, proxyCfg).catch(() => []),
  ]);

  const closed = selectClosedCandles(btcKlines, '1h');
  const closes = closed.map((c) => c.close);
  const rsiArr = closes.length >= 20 ? rsi(closes, 14) : [];
  const e20Arr = closes.length >= 25 ? ema(closes, 20) : [];
  const e50Arr = closes.length >= 55 ? ema(closes, 50) : [];
  const btcRsi1h = Number((rsiArr[rsiArr.length - 1] ?? 50).toFixed(1));
  const btcEma20 = Number((e20Arr[e20Arr.length - 1] ?? 0).toFixed(2));
  const btcEma50 = Number((e50Arr[e50Arr.length - 1] ?? 0).toFixed(2));

  return {
    coins: tickers.filter((c) => c.price > 0),
    btcRsi1h,
    btcEma20,
    btcEma50,
  };
}

async function generateAiPersianPost(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 520
): Promise<string | null> {
  const ensemble = await resolveAIEnsemble(env).catch(() => null);
  const primary = ensemble?.engines?.[0];
  if (!primary) return null;
  try {
    const compactEngine = { ...primary, maxTokens: Math.min(primary.maxTokens || maxTokens, maxTokens) };
    const out = await callBYOAI(compactEngine, systemPrompt, userPrompt, { fastJson: true });
    const cleaned = out.trim();
    return cleaned.length >= 40 ? cleaned.slice(0, 1400) : null;
  } catch {
    return null;
  }
}

async function fetchPublicCryptoHeadlines(): Promise<Array<{ title: string; source: string }>> {
  try {
    const res = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { Data?: Array<{ title?: string; source?: string }> };
    return (json.Data ?? [])
      .slice(0, 4)
      .filter((x) => Boolean(x.title))
      .map((x) => ({ title: String(x.title), source: String(x.source || 'CryptoNews') }));
  } catch {
    return [];
  }
}

/**
 * Always-On AI Channel & Bot Publisher.
 * Publishes AI-authored:
 *  - ALERT: Extreme volatility / RSI overbought-oversold / funding-rate warnings
 *  - ANALYSIS: Multi-coin market structure, key S/R levels & AI outlook
 *  - NEWS: Live macro & crypto news summary translated & interpreted by AI
 *  - PROMO: Rotating Dollarino platform spotlight & feature showcase with banner graphics
 */
export async function runAlwaysOnAiIntel(
  env: Env,
  opts?: { forceKind?: 'ANALYSIS' | 'NEWS' | 'ALERT' | 'PROMO' }
): Promise<{
  published: boolean;
  kind?: 'ANALYSIS' | 'NEWS' | 'ALERT' | 'PROMO';
  usersNotified?: number;
  channelMessageId?: number;
  reason?: string;
}> {
  const aiSettings = await getSettingsMap(env.DB, [
    'always_on_ai_broadcast_enabled',
    'intel_last_ai_check_at',
    'intel_last_alert_at',
    'intel_last_news_at',
    'intel_last_analysis_at',
    'intel_last_promo_at',
    'intel_promo_cursor',
  ]);
  const enabled = (aiSettings['always_on_ai_broadcast_enabled'] ?? 'true') === 'true';
  if (!enabled && !opts?.forceKind) {
    return { published: false, reason: 'disabled' };
  }

  // Check at most once every 5 minutes so 30-min news & alerts trigger smoothly without wasting API quota
  if (!opts?.forceKind) {
    const minsCheck = minsFromIso(aiSettings['intel_last_ai_check_at']);
    if (minsCheck < 5) {
      return { published: false, reason: 'check_cooldown' };
    }
  }
  await setSetting(env.DB, 'intel_last_ai_check_at', new Date().toISOString());

  const cfg = await resolveChannelAndBotConfig(env);
  const snap = await gatherMarketSnapshot(env);
  const btc = snap.coins.find((c) => c.symbol === 'BTCUSDT');
  const eth = snap.coins.find((c) => c.symbol === 'ETHUSDT');
  const summaryLines = snap.coins
    .map((c) => `${c.symbol.replace('USDT', '')}: $${c.price} (${c.changePct24h >= 0 ? '+' : ''}${c.changePct24h.toFixed(2)}%)`)
    .join(' | ');

  const fk = opts?.forceKind;

  // 1) Priority 1: ALERT on extreme market move / overbought-oversold RSI (180m cooldown)
  const extremeCoin = snap.coins.find((c) => Math.abs(c.changePct24h) >= 7.5);
  const extremeRsi = snap.btcRsi1h >= 78 || snap.btcRsi1h <= 22;
  const minsAlert = minsFromIso(aiSettings['intel_last_alert_at']);
  if (fk === 'ALERT' || (!fk && (extremeCoin || extremeRsi) && minsAlert >= 180)) {
    const triggerReason = extremeCoin
      ? `نوسان شدید ۲۴ ساعته روی ${extremeCoin.symbol.replace('USDT', '')} (${extremeCoin.changePct24h >= 0 ? '+' : ''}${extremeCoin.changePct24h.toFixed(2)}%)`
      : `وضعیت اشباع RSI یک‌ساعته بیت‌کوین (RSI = ${snap.btcRsi1h})`;

    const aiText = await generateAiPersianPost(
      env,
      'شما مدیر ریسک و تحلیلگر ارشد هوش مصنوعی دلارینو هستید. یک اخطار کوتاه، دقیق و حرفه‌ای به فارسی بنویسید (حداکثر ۶ خط). روی حفظ سرمایه، کاهش اهرم و فعال‌کردن حد ضرر و سپر ریسک دلارینو تاکید کنید.',
      `رویداد فوری بازار: ${triggerReason}\nقیمت‌های لحظه‌ای: ${summaryLines || 'BTC/ETH live'}`,
      420
    );

    const body =
      aiText ||
      `⚡️ هشدار نوسان و مدیریت ریسک بازار:\n` +
        `• عامل اخطار: ${triggerReason}\n` +
        (summaryLines ? `• نبض لحظه‌ای: ${summaryLines}\n\n` : '\n') +
        `🛡 توصیه هوش مصنوعی دلارینو:\n` +
        `در این شرایط از اهرم‌های بالا پرهیز کنید، حد ضرر قطعی بگذارید و اجازه دهید سیستم «ریسک‌فری خودکار TP1» و سپر ریسک دلارینو از سرمایه شما محافظت کند.`;

    const res = await publishChannelNews(env, {
      category: 'ALERT',
      title: 'اخطار نوسان شدید و هشدار مدیریت ریسک بازار',
      body,
      notifyBotUsers: true,
      createdBy: 'ai_intel_daemon',
    });
    await setSetting(env.DB, 'intel_last_alert_at', new Date().toISOString());
    return { published: true, kind: 'ALERT', usersNotified: res.usersNotified, channelMessageId: res.channelMessageId };
  }

  // 2) Priority 2: Crypto News Summary EVERY 30 MINUTES (low-token lightweight AI summary)
  const minsNews = minsFromIso(aiSettings['intel_last_news_at']);
  if (fk === 'NEWS' || (!fk && minsNews >= 30)) {
    const headlines = await fetchPublicCryptoHeadlines();
    const headlineTxt = headlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join('\n');
    const aiText = await generateAiPersianPost(
      env,
      'شما خبرنگار و تحلیلگر اقتصادی هوش مصنوعی دلارینو هستید. تیترهای خبری و قیمت‌های لحظه‌ای را در ۴ تا ۶ خط خلاصه به فارسی روان بنویسید و تاثیر کوتاه‌مدت آن روی بیت‌کوین و بازار را بگویید.',
      `${headlineTxt ? `تازه‌ترین اخبار کریپتو:\n${headlineTxt}\n\n` : ''}نبض لحظه‌ای قیمت‌ها:\n${summaryLines}`,
      420
    );

    const body =
      aiText ||
      (headlines.length
        ? `🗞 مهم‌ترین اخبار نیم‌ساعت اخیر بازار:\n` +
          headlines.map((h) => `• ${h.title} (${h.source})`).join('\n') +
          `\n\n📊 نبض بازار: ${summaryLines || 'رصد ۲۴ ساعته فعال است'}\n\n` +
          `🤖 رادار سیگنال دلارینو فقط فرصت‌های باکیفیت و تاییدشده را ارسال می‌کند.`
        : `📊 خلاصه نبض ۳۰ دقیقه‌ای بازار:\n${summaryLines}\n\n` +
          `بیشترین تمرکز نقدینگی روی جفت‌ارزهای اصلی و توکن‌های پرشتاب DEX دیده می‌شود.`);

    const res = await publishChannelNews(env, {
      category: 'NEWS',
      title: 'بسته خبری نیم‌ساعته و نبض لحظه‌ای بازار کریپتو',
      body,
      notifyBotUsers: true,
      createdBy: 'ai_intel_daemon',
    });
    await setSetting(env.DB, 'intel_last_news_at', new Date().toISOString());
    return { published: true, kind: 'NEWS', usersNotified: res.usersNotified, channelMessageId: res.channelMessageId };
  }

  // 3) Priority 3: AI Market Analysis every 3 hours (180 mins)
  const minsAnalysis = minsFromIso(aiSettings['intel_last_analysis_at']);
  if (fk === 'ANALYSIS' || (!fk && minsAnalysis >= 180)) {
    const aiText = await generateAiPersianPost(
      env,
      'شما موتور تحلیلگر هوش مصنوعی پلتفرم دلارینو (Dollarino) هستید. به فارسی حرفه‌ای، ساختارمند و جذاب تحلیل لحظه‌ای بازار کریپتو را بنویسید (حداکثر ۸ خط). فقط از اعداد واقعی داده‌شده استفاده کنید.',
      `داده‌های زنده بازار:\n${summaryLines || 'اطلاعات قیمت لحظه‌ای'}\nBTC 1H RSI: ${snap.btcRsi1h} | EMA20: $${snap.btcEma20} | EMA50: $${snap.btcEma50}\nBTC High/Low 24h: $${btc?.high24h ?? 0} / $${btc?.low24h ?? 0}\nETH High/Low 24h: $${eth?.high24h ?? 0} / $${eth?.low24h ?? 0}`,
      480
    );

    const trendFa =
      snap.btcEma20 > 0 && snap.btcEma50 > 0
        ? snap.btcEma20 >= snap.btcEma50
          ? 'صعودی (تایم‌فریم ۱ ساعته)'
          : 'نزولی / اصلاحی (تایم‌فریم ۱ ساعته)'
        : 'نوسانی';

    const body =
      aiText ||
      `📈 وضعیت لحظه‌ای کوین‌های اصلی:\n${summaryLines || 'در حال رصد بازار'}\n\n` +
        `🔍 شاخص‌های تکنیکال بیت‌کوین (1H):\n` +
        `• روند میانگین‌های متحرک (EMA 20/50): ${trendFa}\n` +
        `• شاخص قدرت نسبی (RSI 14): ${snap.btcRsi1h}\n` +
        (btc ? `• سقف و کف ۲۴ ساعته BTC: $${btc.high24h} / $${btc.low24h}\n\n` : '\n') +
        `🤖 پیشنهاد هوشمند دلارینو:\n` +
        `برای دریافت نقاط دقیق ورود، حد ضرر و ۳ تارگت سود هر ارز، کافیست در مینی‌اپ یا سایت دلارینو دکمه «تحلیل چارت AI» را بزنید یا سیگنال‌های ۲۴ ساعته ربات را دنبال کنید.`;

    const res = await publishChannelNews(env, {
      category: 'ANALYSIS',
      title: `تحلیل جامع AI بازار کریپتو (${btc ? `BTC $${btc.price}` : 'Live Pulse'})`,
      body,
      notifyBotUsers: true,
      createdBy: 'ai_intel_daemon',
    });
    await setSetting(env.DB, 'intel_last_analysis_at', new Date().toISOString());
    return { published: true, kind: 'ANALYSIS', usersNotified: res.usersNotified, channelMessageId: res.channelMessageId };
  }

  // 4) Priority 4: Rotating Dollarino Platform Showcase / Promotional Spotlight every 12 hours (720 mins)
  const minsPromo = minsFromIso(aiSettings['intel_last_promo_at']);
  if (fk === 'PROMO' || (!fk && minsPromo >= 720)) {
    const promoCursorStr = aiSettings['intel_promo_cursor'] ?? '0';
    const promoCursor = (Number.parseInt(promoCursorStr, 10) || 0) % 4;
    await setSetting(env.DB, 'intel_promo_cursor', String((promoCursor + 1) % 4));

    const spotlights = [
      {
        title: 'ترید خودکار ۲۴ ساعته + استراتژی دُرنا V1 و سپر ریسک ۳ تارگت',
        topic: 'معرفی موتور ترید خودکار دلارینو، ریسک‌فری خودکار در تارگت اول، استاپ تریلینگ و ارسال سیگنال حتی وقتی ربات تریدر کاربر خاموش است.',
        banner: `${cfg.webAppUrl}/images/hero-quant-desk.png`,
        fallback:
          `چرا حرفه‌ای‌ها ۲۴ ساعته از دلارینو استفاده می‌کنند؟\n\n` +
          `✅ اسکن هوشمند کل بازار با استراتژی‌های غیرریپینت دُرنا V1 و KBOS Super\n` +
          `✅ مدیریت سود ۳ مرحله‌ای (TP1 / TP2 / TP3) با ریسک‌فری خودکار\n` +
          `✅ سیگنال‌دهی لحظه‌ای در کانال و ربات — حتی وقتی ربات ترید شما خاموش است!\n\n` +
          `همین حالا وارد ربات یا پنل وب شوید و قدرت ترید هوشمند را تجربه کنید.`,
      },
      {
        title: 'کیف‌پول چندزنجیره‌ای Trust Wallet و شکار توکن‌های انفجاری DEX',
        topic: 'معرفی اتصال یک‌کلیکی همه شبکه‌ها (EVM، BSC، Base، Solana، TON، TRON) و کشف توکن‌های جدید در تمام بسترها با امتیاز ایمنی AI و سوآپ غیرامانی.',
        banner: `${cfg.webAppUrl}/images/trust-dex-hub.png`,
        fallback:
          `توکن‌های پُررشد را قبل از لیست‌شدن در صرافی‌های متمرکز شکار کنید!\n\n` +
          `🦊 اتصال مستقیم به Trust Wallet روی شبکه‌های BSC، Ethereum، Base، Arbitrum، Solana، TON و TRON\n` +
          `🔥 جستجوی یکپارچه در کل DEXها (DexScreener + GeckoTerminal) با امتیاز ایمنی هوش مصنوعی\n` +
          `🛡 معامله ۱۰۰٪ غیرامانی از کیف‌پول شخصی خودتان`,
      },
      {
        title: 'هوش مصنوعی شخصی «هوش مصنوعی من» و چارت‌خوان لحظه‌ای AI',
        topic: 'معرفی هوش مصنوعی خام قابل آموزش به زبان فارسی، ویرایشگر Pine Script / Python و دستیار پشتیبانی ۲۴ ساعته.',
        banner: `${cfg.webAppUrl}/images/my-ai-brain.png`,
        fallback:
          `استراتژی خودت را به زبان فارسی به هوش مصنوعی یاد بده!\n\n` +
          `🧠 در بخش «هوش مصنوعی من» کافیست مثل چت کردن قوانین ورود، اندیکاتورها و حد ضرر دلخواهت را بنویسی تا هوش مصنوعی دلارینو برایت تست بگیرد و ۲۴ ساعته ترید کند.\n` +
          `📊 به‌همراه تحلیلگر چارت AI و پشتیبانی آنلاین فوری داخل سایت و تلگرام.`,
      },
      {
        title: 'اتصال به Toobit · Bitunix · KCEX + کپی‌ترید تاییدشده و درآمد دلاری رفرال',
        topic: 'معرفی اتصال امن رمزنگاری‌شده AES-256 به صرافی‌های Toobit، Bitunix و KCEX، کپی‌تریدرهای تاییدشده و سیستم کسب درآمد ۱۵ تا ۲۲ درصدی دعوت دوستان.',
        banner: `${cfg.webAppUrl}/images/vip-club-banner.png`,
        fallback:
          `یک پلتفرم کامل برای معامله و کسب درآمد:\n\n` +
          `🔗 اتصال امن AES-256 به صرافی‌های Toobit، Bitunix و KCEX (بدون نیاز به مجوز برداشت)\n` +
          `🏆 کپی‌ترید ۱-کلیکی از تریدرهای تاییدشده مدیریت دلارینو\n` +
          `💎 دعوت دوستان با پورسانت دلاری قابل برداشت + ۷ روز اشتراک هدیه!`,
      },
    ];

    const spot = spotlights[promoCursor]!;
    const aiPromo = await generateAiPersianPost(
      env,
      'شما مدیر مارکتینگ و معرفی محصول پلتفرم ترید هوشمند دلارینو هستید. یک متن تبلیغاتی/آموزشی بسیار شیک، باکلاس، پرانرژی و کوتاه به فارسی بنویسید (۵ تا ۷ خط با بولت‌پوینت منظم). شعار ندهید و دقیقاً امکانات واقعی پلتفرم را پررنگ کنید.',
      `موضوع معرفی امروز: ${spot.title}\nنکات کلیدی: ${spot.topic}\nآدرس ربات: @${cfg.botUsername} | آدرس سایت: ${cfg.webAppUrl}`
    );

    const res = await publishChannelNews(env, {
      category: 'PROMO',
      title: spot.title,
      body: aiPromo || spot.fallback,
      mediaUrl: spot.banner,
      notifyBotUsers: true,
      createdBy: 'ai_intel_daemon',
    });
    await setSetting(env.DB, 'intel_last_promo_at', new Date().toISOString());
    return { published: true, kind: 'PROMO', usersNotified: res.usersNotified, channelMessageId: res.channelMessageId };
  }

  return { published: false, reason: 'all_intel_on_cooldown' };
}
