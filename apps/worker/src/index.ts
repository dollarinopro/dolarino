import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes, requireAuth, type AppVariables } from './auth.js';
import { hmacSha256Hex } from './crypto.js';
import { TradingBotCoordinator } from './engine/bot-do.js';
import { runAlwaysOnAiIntel, runAlwaysOnSignalRadar } from './engine/market-intel.js';
import type { Env } from './env.js';
import { fetchPublicKlines, fetchPublicMarket24h, fetchPublicOrderBook } from './exchanges/paper.js';
import {
  DOLLARINO_CREATOR_INFO,
  listSelectableAIModels,
  runPublicGuestAIChat,
} from './ai/assistant.js';
import { buildClientFingerprints, enforceRateLimit } from './security.js';
import { adminRoutes } from './routes/admin.js';
import { aiAssistantRoutes } from './routes/ai-assistant.js';
import { buildProfitCardSvg, renderProfitCardPng } from './cards/renderer.js';
import { chartAiRoutes } from './routes/chart-ai.js';
import { connectionRoutes } from './routes/connections.js';
import { copyTradeRoutes } from './routes/copy-trade.js';
import { dexRoutes } from './routes/dex.js';
import { myAiRoutes } from './routes/my-ai.js';
import { getPublicPlans, subscriptionRoutes } from './routes/subscriptions.js';
import { supportRoutes } from './routes/support.js';
import { buildVerifiedCardCanonicalPayload, tradingRoutes } from './routes/trading.js';
import { trustWalletRoutes } from './routes/trustwallet.js';
import { syncTelegramBotAutoOnVersion, webhookRoutes } from './routes/webhooks.js';

export { TradingBotCoordinator };

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use('*', cors({
  origin: (origin) => origin || '*',
  allowHeaders: ['Content-Type', 'Authorization', 'X-Dollarino-Token', 'X-Dollarino-Extension-Key'],
  credentials: true,
}));

app.use('/api/*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.onError((err, c) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/D1_ERROR|daily row read limit|quota|exceeded/i.test(msg)) {
    return c.json(
      {
        error:
          'سهمیه رایگان دیتابیس کلادفلر (۵ میلیون خواندن روزانه D1) پر شده است و ساعت ۰۰:۰۰ UTC (۰۳:۳۰ بامداد ایران) خودکار ریست می‌شود. با ارتقا به پلن پایه ۵ دلاری کلادفلر، محدودیت فوراً برداشته می‌شود.',
        code: 'D1_QUOTA_EXCEEDED',
      },
      503
    );
  }
  console.error('[Worker Error]', msg);
  return c.json({ error: msg || 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

async function serveAssetsWithDynamicOg(
  req: Request,
  assets: { fetch: (req: Request) => Promise<Response> }
): Promise<Response> {
  const res = await assets.fetch(req);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return res;
  }
  const url = new URL(req.url);
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    return res;
  }
  const origin = url.origin.replace(/\/+$/, '');
  const html = await res.text();
  const rewritten = html
    .replaceAll('https://dolarino.pages.dev/dollarino-preview.jpg', `${origin}/dollarino-preview.jpg`)
    .replaceAll('https://dollarino.pages.dev/dollarino-preview.jpg', `${origin}/dollarino-preview.jpg`)
    .replaceAll('https://dolarino.pages.dev/images/dollarino-og-brand.jpg', `${origin}/images/dollarino-og-brand.jpg`)
    .replaceAll('https://dollarino.pages.dev/images/dollarino-og-brand.jpg', `${origin}/images/dollarino-og-brand.jpg`)
    .replaceAll('content="https://dolarino.pages.dev/"', `content="${origin}/"`)
    .replaceAll('content="https://dollarino.pages.dev/"', `content="${origin}/"`)
    .replaceAll('href="https://dolarino.pages.dev/"', `href="${origin}/"`)
    .replaceAll('href="https://dollarino.pages.dev/"', `href="${origin}/"`);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(rewritten, { status: res.status, statusText: res.statusText, headers });
}

app.get('/', (c) => {
  if (c.env.ASSETS) {
    return serveAssetsWithDynamicOg(c.req.raw, c.env.ASSETS);
  }
  return c.json({
    ok: true,
    service: 'Dollarino API Worker v9.9.2',
    health: '/api/health',
    note: 'Open the Website preview (port 5173) or unified Worker URL to use the full Dollarino UI.',
  });
});

app.get('/api/health', (c) => {
  try {
    c.executionCtx.waitUntil(syncTelegramBotAutoOnVersion(c.env, '9.9.4').catch(() => {}));
  } catch {
    // ignore outside worker executionCtx
  }
  return c.json({
    ok: true,
    platform: 'Dollarino (دلارینو)',
    version: '9.9.2',
    openSource: false,
    paidSubscriptions: true,
    centralMultiAI: true,
    multiCoinAutonomous: true,
    alwaysOnSignalsAndAiIntel: true,
    dedicatedFloatingVisionAI: true,
    creator: DOLLARINO_CREATOR_INFO,
    primaryStrategy: 'dollarino_v01',
    brandNames: {
      ai: 'هوش مصنوعی دلارینو',
      strategy: 'استراتژی منتخب دلارینو (موتور دُرنا V1)',
      copyTrade: 'کپی ترید دلارینو',
    },
    aiProviders: ['deepseek', 'anthropic', 'openai', 'gemini', 'openai_compatible'],
    exchanges: {
      toobit: 'LIVE_SPOT_AND_FUTURES_SUPPORTED',
      bitunix: 'LIVE_FUTURES_SUPPORTED',
      kcex: 'MIRROR_0PCT_MAKER_AND_WEB_SESSION',
      paper: 'SIMULATOR_LIVE_QUOTES',
    },
    capabilities: {
      spotTrading: true,
      futuresTrading: true,
      dualDirection: true,
      hedgeMode: true,
      verifiedProfitCards: true,
      dexScreenerRadar: true,
      trustWalletDapp: true,
      browserExtension: true,
      smartSupportEscalation: true,
      antiAbuseReferralSystem: true,
      telegramFirstRegistration: true,
      profileEditorWithLockedPhone: true,
      telegramLoginWidget: true,
      alwaysOnSignalsAndAiIntel: true,
      dedicatedFloatingVisionAI: true,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/public/creator', (c) => c.json({ creator: DOLLARINO_CREATOR_INFO }));

app.get('/api/public/ai-models', async (c) => {
  const data = await listSelectableAIModels(c.env);
  return c.json({
    ...data,
    creator: DOLLARINO_CREATOR_INFO,
  });
});

app.post('/api/public/ai-chat', async (c) => {
  const fp = await buildClientFingerprints(c.req.raw, c.env).catch(() => ({ ipHash: 'anon' }));
  const rl = await enforceRateLimit(c.env, `pub_ai:${fp.ipHash}`, 20, 60).catch(() => ({
    allowed: true,
    retryAfterSec: 0,
  }));
  if (!rl.allowed) {
    return c.json(
      { error: `تعداد درخواست زیاد است. لطفاً ${rl.retryAfterSec} ثانیه دیگر امتحان کنید.` },
      429
    );
  }

  const body = await c.req
    .json<{
      modelId?: string | null;
      message?: string;
      imageDataUrl?: string | null;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }>()
    .catch(() => ({} as { modelId?: string; message?: string; imageDataUrl?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> }));

  const message = String(body.message || '').trim();
  const imageDataUrl = body.imageDataUrl ? String(body.imageDataUrl).trim() : null;
  if (!message && !imageDataUrl) {
    return c.json({ error: 'لطفاً پیام یا تصویر چارت ارسال کنید.' }, 400);
  }
  if (imageDataUrl && (!imageDataUrl.startsWith('data:image/') || imageDataUrl.length > 6_500_000)) {
    return c.json({ error: 'فرمت یا حجم تصویر نامعتبر است.' }, 400);
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .slice(-8)
    : [];

  const res = await runPublicGuestAIChat(c.env, {
    modelId: body.modelId || null,
    message,
    imageDataUrl,
    history,
  });

  return c.json(res);
});

app.get('/api/public/verify-card/:cardId', async (c) => {
  const cardId = (c.req.param('cardId') || '').trim();
  if (!cardId) return c.json({ valid: false, error: 'Missing cardId' }, 400);

  const row = await c.env.DB.prepare(
    `SELECT v.*, u.username, u.telegram_username
     FROM verified_profit_cards v
     LEFT JOIN users u ON u.id = v.user_id
     WHERE v.id = ? LIMIT 1`
  ).bind(cardId).first<{
    id: string;
    user_id: string;
    mode: string;
    period: string;
    start_date: string;
    end_date: string;
    trades_count: number;
    win_rate: number;
    net_pnl_usd: number;
    roi_pct: number;
    profit_factor: number;
    exchange_provider: string;
    strategy_name: string;
    payload_json: string;
    hmac_signature: string;
    issued_at: string;
    username: string | null;
    telegram_username: string | null;
  }>();

  if (!row) {
    return c.json({ valid: false, error: 'کارت سود با این شناسه در سرور دلارینو ثبت نشده است (احتمالاً جعلی یا نامعتبر است).' }, 404);
  }

  let parsedPayload: { tradesHash?: string; cardStyle?: string; symbol?: string; direction?: string; isVerifiedReal?: boolean } = {};
  try {
    parsedPayload = JSON.parse(row.payload_json || '{}');
  } catch {
    parsedPayload = {};
  }

  const cardSecret = c.env.SESSION_JWT_SECRET || c.env.MASTER_ENCRYPTION_KEY || 'dollarino-card-hmac-secret';
  const expectedCanonical = buildVerifiedCardCanonicalPayload({
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    period: row.period,
    startDate: row.start_date,
    endDate: row.end_date,
    tradesCount: Number(row.trades_count),
    winRate: Number(row.win_rate),
    netPnlUsd: Number(row.net_pnl_usd),
    roiPct: Number(row.roi_pct),
    profitFactor: Number(row.profit_factor),
    exchangeProvider: row.exchange_provider,
    strategyName: row.strategy_name,
    tradesHash: parsedPayload.tradesHash || '',
    issuedAt: row.issued_at,
  });
  const expectedSig = await hmacSha256Hex(expectedCanonical, cardSecret);
  const signatureValid = expectedSig === row.hmac_signature;

  return c.json({
    valid: signatureValid,
    card: {
      id: row.id,
      displayName: row.username || (row.telegram_username ? `@${row.telegram_username}` : 'Dollarino Trader'),
      mode: row.mode,
      isVerifiedReal: row.mode === 'LIVE' && signatureValid,
      period: row.period,
      startDate: row.start_date,
      endDate: row.end_date,
      tradesCount: row.trades_count,
      winRate: row.win_rate,
      netPnlUsd: row.net_pnl_usd,
      roiPct: row.roi_pct,
      profitFactor: row.profit_factor,
      exchangeProvider: row.exchange_provider,
      strategyName: row.strategy_name,
      cardStyle: parsedPayload.cardStyle || 'dark',
      symbol: parsedPayload.symbol,
      direction: parsedPayload.direction,
      signaturePrefix: row.hmac_signature.slice(0, 16),
      issuedAt: row.issued_at,
    },
  });
});

app.get('/api/public/card-image/:cardId', async (c) => {
  const rawId = c.req.param('cardId').replace(/\.png$/i, '');
  const layout = c.req.query('layout') === 'vertical' ? 'vertical' : 'horizontal';
  const row = await c.env.DB.prepare(
    `SELECT vc.*, u.username, u.telegram_username
     FROM verified_profit_cards vc LEFT JOIN users u ON vc.user_id = u.id
     WHERE vc.id = ?`
  ).bind(rawId).first<{
    id: string;
    user_id: string;
    mode: 'LIVE' | 'PAPER';
    period: '24H' | '7D' | '30D' | '1Y' | 'ALL' | 'TRADE';
    trades_count: number;
    win_rate: number;
    net_pnl_usd: number;
    roi_pct: number;
    profit_factor: number;
    exchange_provider: string;
    strategy_name: string;
    payload_json: string;
    issued_at: string;
    username: string | null;
    telegram_username: string | null;
  }>();
  if (!row) return c.json({ error: 'Card not found' }, 404);

  let parsedPayload: { symbol?: string; direction?: string } = {};
  try {
    parsedPayload = JSON.parse(row.payload_json || '{}');
  } catch {
    parsedPayload = {};
  }

  const renderInput = {
    cardId: row.id,
    displayName: row.username || (row.telegram_username ? `@${row.telegram_username}` : 'Dollarino Trader'),
    mode: row.mode,
    period: row.period,
    netPnlUsd: Number(row.net_pnl_usd || 0),
    roiPct: Number(row.roi_pct || 0),
    tradesCount: Number(row.trades_count || 0),
    winRate: Number(row.win_rate || 0),
    profitFactor: Number(row.profit_factor || 0),
    exchangeProvider: row.exchange_provider,
    strategyName: row.strategy_name,
    issuedAt: row.issued_at,
    layout: layout as 'horizontal' | 'vertical',
  };
  const png = await renderProfitCardPng(renderInput);

  if (png) {
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  return new Response(buildProfitCardSvg(renderInput), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

app.get('/api/public/plans', async (c) => {
  const plans = await getPublicPlans(c.env.DB);
  return c.json({ plans });
});

const FALLBACK_COPY_TRADERS = [
  {
    id: 'ct_parsa_scalp',
    display_name: 'پارسا اسکلپر (حرفه‌ای)',
    handle: '@parsa_scalp',
    specialty: 'Altcoin Scalping',
    win_rate: 71.8,
    roi_30d_pct: 64.9,
    max_drawdown_pct: 9.1,
    followers_count: 245,
    risk_level: 'MEDIUM',
  },
  {
    id: 'ct_aria_quant',
    display_name: 'آریا کوانت (تاییدشده دلارینو)',
    handle: '@aria_quant',
    specialty: 'BTC/ETH Futures',
    win_rate: 76.4,
    roi_30d_pct: 48.2,
    max_drawdown_pct: 5.4,
    followers_count: 318,
    risk_level: 'LOW',
  },
  {
    id: 'ct_negin_ai',
    display_name: 'نگین ترید (ترکیبی هوش مصنوعی)',
    handle: '@negin_ai',
    specialty: 'Swing & AI Hybrid',
    win_rate: 79.2,
    roi_30d_pct: 39.6,
    max_drawdown_pct: 4.3,
    followers_count: 412,
    risk_level: 'LOW',
  },
];

app.get('/api/public/copy-traders', async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      `SELECT id, display_name, handle, specialty, win_rate, roi_30d_pct, max_drawdown_pct, followers_count, risk_level
       FROM copy_traders WHERE is_active = 1 AND is_verified = 1 ORDER BY roi_30d_pct DESC LIMIT 6`
    ).all();
    return c.json({ traders: rows.results.length > 0 ? rows.results : FALLBACK_COPY_TRADERS });
  } catch {
    return c.json({ traders: FALLBACK_COPY_TRADERS });
  }
});

app.get('/api/public/market-snapshot', async (c) => {
  const symbol = (c.req.query('symbol') || 'BTCUSDT').toUpperCase();
  const proxyCfg = c.env.TOOBIT_PROXY_URL
    ? { proxyUrl: c.env.TOOBIT_PROXY_URL, proxySecret: c.env.EXCHANGE_PROXY_SECRET }
    : undefined;

  const watchlist = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  const [candles, orderBook, ...tickers] = await Promise.all([
    fetchPublicKlines(symbol, '15m', 48, proxyCfg).catch(() => []),
    fetchPublicOrderBook(symbol, 10, proxyCfg).catch(() => ({ bids: [], asks: [] })),
    ...watchlist.map(async (sym) => {
      const m = await fetchPublicMarket24h(sym, proxyCfg).catch(() => null);
      const rawVol = Number(String(m?.volume24h ?? '0').replace(/,/g, ''));
      return {
        symbol: sym,
        lastPrice: Number(m?.lastPrice ?? 0),
        changePct24h: Number(m?.changePct24h ?? 0),
        volume24hUsd: Number.isFinite(rawVol) ? rawVol : 0,
        high24h: Number(m?.high24h ?? 0),
        low24h: Number(m?.low24h ?? 0),
        fundingRate: m?.fundingRate ?? '0.0001',
      };
    }),
  ]);

  return c.json({
    symbol,
    candles,
    orderBook,
    markets: tickers.filter((t) => t.lastPrice > 0),
    timestamp: new Date().toISOString(),
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/connections', connectionRoutes);
app.route('/api/subscriptions', subscriptionRoutes);
app.route('/api/trading', tradingRoutes);
app.route('/api/ai-assistant', aiAssistantRoutes);
app.route('/api/chart-ai', chartAiRoutes);
app.route('/api/my-ai', myAiRoutes);
app.route('/api/copy-trade', copyTradeRoutes);
app.route('/api/dex', dexRoutes);
app.route('/api/trustwallet', trustWalletRoutes);
app.route('/api/support', supportRoutes);
app.route('/api/webhook', webhookRoutes);
app.route('/api/admin', adminRoutes);

app.get('/api/events/stream', requireAuth, async (c) => {
  const user = c.get('user');
  const [cfg, openCount, unreadNtf, latestSig] = await Promise.all([
    c.env.DB.prepare(`SELECT bot_state, trading_mode, paper_balance FROM bot_configs WHERE user_id = ?`).bind(user.id).first<{ bot_state: string; trading_mode: string; paper_balance: string }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE user_id = ? AND status = 'OPEN'`).bind(user.id).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`).bind(user.id).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT id, symbol, direction, created_at FROM signals ORDER BY created_at DESC LIMIT 1`).first(),
  ]);
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      const send = (ev: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('balance.updated', { paperBalance: cfg?.paper_balance ?? '0', tradingMode: cfg?.trading_mode ?? 'PAPER' });
      send('position.updated', { openCount: openCount?.cnt ?? 0, botState: cfg?.bot_state ?? 'STOPPED' });
      send('notification.created', { unread: unreadNtf?.cnt ?? 0 });
      if (latestSig) send('signal.received', latestSig);
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// Explicit aliases so both `/api/telegram/webhook/:botId` and `/api/webhook/telegram/:botId` work cleanly
app.post('/api/telegram/webhook', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/api/webhook/telegram';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env, c.executionCtx);
});
app.post('/api/telegram/webhook/:botId', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = `/api/webhook/telegram/${c.req.param('botId')}`;
  return app.fetch(new Request(url.toString(), c.req.raw), c.env, c.executionCtx);
});

app.all('*', async (c) => {
  if (!c.req.path.startsWith('/api/') && c.env.ASSETS) {
    return serveAssetsWithDynamicOg(c.req.raw, c.env.ASSETS);
  }
  return c.json({ error: `Route not found: ${c.req.path}` }, 404);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 1-minute watchdog: TradingBotCoordinator handles position reconciliation & bot scans; here we run radar & news
    ctx.waitUntil((async () => {
      await syncTelegramBotAutoOnVersion(env, '9.9.3').catch(() => {});

      const id = env.TRADING_BOT_DO.idFromName('global-coordinator');
      const stub = env.TRADING_BOT_DO.get(id);
      await stub.fetch('https://do/start').catch(() => {});

      await runAlwaysOnSignalRadar(env).catch(() => {});
      await runAlwaysOnAiIntel(env).catch(() => {});
    })());
  },
};
