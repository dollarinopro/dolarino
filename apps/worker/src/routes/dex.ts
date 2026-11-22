import { Hono } from 'hono';
import { callBYOAI, resolveAIEnsemble } from '../ai/providers.js';
import { requireAuth } from '../auth.js';
import {
  fetchDexTrendingOverview,
  getDexOrdersCheck,
  getDexTokenPools,
  searchDexPairs,
} from '../dex/screener.js';
import type { AuthUser, Env } from '../env.js';
import { enforceRateLimit } from '../security.js';

export const dexRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

dexRoutes.get('/trending', async (c) => {
  const data = await fetchDexTrendingOverview();
  return c.json({ ok: true, trending: data.pairs, ...data, source: 'dexscreener.com' });
});

dexRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q) {
    const data = await fetchDexTrendingOverview();
    return c.json({ ok: true, pairs: data.pairs, results: data.pairs, source: 'dexscreener.com' });
  }
  const pairs = await searchDexPairs(q);
  return c.json({ ok: true, query: q, pairs, results: pairs, source: 'dexscreener.com' });
});

dexRoutes.get('/token/:chainId/:tokenAddress', async (c) => {
  const chainId = c.req.param('chainId');
  const tokenAddress = c.req.param('tokenAddress');
  const [pools, orders] = await Promise.all([
    getDexTokenPools(chainId, tokenAddress),
    getDexOrdersCheck(chainId, tokenAddress),
  ]);
  return c.json({
    ok: true,
    chainId,
    tokenAddress,
    pools,
    paidOrders: orders,
    primaryPair: pools[0] ?? null,
  });
});

dexRoutes.post('/ai-analyze', requireAuth, async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `dexai:${user.id}`, 12, 300);
  if (!rl.allowed) {
    return c.json({ error: `تعداد تحلیل‌های سریع DEX زیاد است. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    chainId?: string;
    tokenAddress?: string;
    query?: string;
    lang?: 'fa' | 'en';
  };

  let pair = null;
  if (body.chainId && body.tokenAddress) {
    const pools = await getDexTokenPools(body.chainId, body.tokenAddress);
    pair = pools[0] ?? null;
  } else if (body.query) {
    const hits = await searchDexPairs(body.query);
    pair = hits[0] ?? null;
  }
  if (!pair) {
    return c.json({ error: 'توکن مورد نظر در DexScreener یافت نشد.' }, 404);
  }

  const priceUsd = Number(pair.priceUsd || 0);
  const liqUsd = Number(pair.liquidity?.usd || 0);
  const vol24 = Number(pair.volume?.h24 || 0);
  const fdv = Number(pair.fdv || 0);
  const ch5 = Number(pair.priceChange?.m5 || 0);
  const ch1 = Number(pair.priceChange?.h1 || 0);
  const ch24 = Number(pair.priceChange?.h24 || 0);

  const fallbackAnalysis =
    body.lang === 'en'
      ? `${pair.baseToken.symbol} (${pair.chainId.toUpperCase()}): Price $${priceUsd}, Liquidity $${liqUsd.toLocaleString()}, 24h Vol $${vol24.toLocaleString()}, Safety Score ${pair.safetyScore}/100. ${
          pair.riskFlags.length ? `Warnings: ${pair.riskFlags.join(', ')}.` : 'Pool liquidity and activity look balanced.'
        }`
      : `تحلیل هوشمند ${pair.baseToken.symbol} در شبکه ${pair.chainId.toUpperCase()}:\n` +
        `• قیمت لحظه‌ای: $${priceUsd < 0.01 ? priceUsd.toPrecision(5) : priceUsd.toFixed(4)} | نقدینگی استخر: $${Math.round(liqUsd).toLocaleString('en-US')}\n` +
        `• حجم ۲۴ساعته: $${Math.round(vol24).toLocaleString('en-US')} | امتیاز ایمنی دلارینو: ${pair.safetyScore}/100\n` +
        `• تغییرات ۵دقیقه: ${ch5 >= 0 ? '+' : ''}${ch5}% | ۱ساعت: ${ch1 >= 0 ? '+' : ''}${ch1}% | ۲۴ساعت: ${ch24 >= 0 ? '+' : ''}${ch24}%\n` +
        (pair.riskFlags.length ? `⚠️ هشدارها: ${pair.riskFlags.join(' · ')}` : '✅ نقدینگی و جریان معاملات برای ترید غیرحضانتی با Trust Wallet مناسب ارزیابی شد.');

  const ensemble = await resolveAIEnsemble(c.env, user.id);
  let aiText = fallbackAnalysis;
  if (ensemble.engines.length > 0) {
    const sys =
      body.lang === 'en'
        ? 'You are Dollarino DEX Analyst. Give concise risk & trade setup analysis (3-5 bullets) for this DexScreener token.'
        : 'تو تحلیلگر ارشد DEX و توکن‌های آن‌چین دلارینو هستی. در ۴ تا ۵ خط شفاف و فارسی درباره ریسک، نقدینگی، مومنتوم و حد ضرر/تارگت احتمالی این توکن نظر بده. به کاربر یادآوری کن برای خرید غیرحضانتی از Trust Wallet DApp استفاده کند.';
    const usr = JSON.stringify({
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      chainId: pair.chainId,
      dexId: pair.dexId,
      priceUsd,
      liquidityUsd: liqUsd,
      volume24h: vol24,
      fdv,
      priceChange: pair.priceChange,
      txnsM5: pair.txns?.m5,
      safetyScore: pair.safetyScore,
      riskFlags: pair.riskFlags,
    });
    const out = await callBYOAI(ensemble.engines[0]!, sys, usr, { fastJson: false }).catch(() => '');
    if (out.trim()) aiText = out.trim().slice(0, 1400);
  }

  return c.json({
    ok: true,
    pair,
    analysis: aiText,
    suggestedLevels: {
      entryUsd: priceUsd,
      stopLossUsd: Number((priceUsd * 0.88).toPrecision(6)),
      tp1Usd: Number((priceUsd * 1.25).toPrecision(6)),
    },
  });
});
