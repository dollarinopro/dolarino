export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative?: string;
  priceUsd?: string | null;
  txns?: Record<string, { buys: number; sells: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  } | null;
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
  info?: {
    imageUrl?: string;
    websites?: Array<{ url: string; label?: string }>;
    socials?: Array<{ type?: string; platform?: string; handle?: string; url?: string }>;
  };
  boosts?: {
    active?: number;
  };
}

export interface DexBoostProfileItem {
  url: string;
  chainId: string;
  tokenAddress: string;
  amount?: number;
  totalAmount?: number;
  icon?: string;
  header?: string;
  description?: string;
}

export interface DexMetaItem {
  name?: string;
  slug?: string;
  description?: string;
  marketCap?: number;
  liquidity?: number;
  volume?: number;
  tokenCount?: number;
  marketCapChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
}

export interface TrustWalletDexLinks {
  chainId: string;
  coinId: number;
  dexName: string;
  swapUrl: string;
  trustWalletDappUrl: string;
  dexScreenerUrl: string;
}

export interface DexTokenEnriched extends DexPair {
  safetyScore: number;
  riskFlags: string[];
  trustWallet: TrustWalletDexLinks;
  isOnCentralizedHint: boolean;
}

const DEX_BASE = 'https://api.dexscreener.com';

const TRUST_COIN_IDS: Record<string, number> = {
  bsc: 20000714,
  ethereum: 60,
  base: 8453,
  arbitrum: 42161,
  polygon: 966,
  optimism: 10000010,
  avalanche: 9005,
  solana: 501,
  ton: 607,
  tron: 195,
  sui: 784,
  aptos: 637,
  linea: 59144,
  blast: 81457,
  pulsechain: 369,
  cronos: 25,
  fantom: 250,
};

export function buildTrustWalletSwapLinks(chainId: string, tokenAddress: string, pairUrl?: string): TrustWalletDexLinks {
  const c = (chainId || 'bsc').toLowerCase();
  const coinId = TRUST_COIN_IDS[c] ?? 20000714;
  let dexName = '1inch / DEX Swap';
  let swapUrl = `https://app.1inch.io/#/1/simple/swap/USDT/${encodeURIComponent(tokenAddress)}`;

  if (c === 'bsc') {
    dexName = 'PancakeSwap (BSC)';
    swapUrl = `https://pancakeswap.finance/swap?outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'ethereum') {
    dexName = 'Uniswap (Ethereum)';
    swapUrl = `https://app.uniswap.org/swap?chain=mainnet&outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'base') {
    dexName = 'Uniswap (Base)';
    swapUrl = `https://app.uniswap.org/swap?chain=base&outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'arbitrum') {
    dexName = 'Uniswap (Arbitrum)';
    swapUrl = `https://app.uniswap.org/swap?chain=arbitrum&outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'polygon') {
    dexName = 'Uniswap (Polygon)';
    swapUrl = `https://app.uniswap.org/swap?chain=polygon&outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'optimism') {
    dexName = 'Uniswap (Optimism)';
    swapUrl = `https://app.uniswap.org/swap?chain=optimism&outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'avalanche') {
    dexName = 'LFJ / TraderJoe (AVAX)';
    swapUrl = `https://lfj.gg/avalanche/trade?outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'solana') {
    dexName = 'Jupiter (Solana)';
    swapUrl = `https://jup.ag/swap/SOL-${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'ton') {
    dexName = 'STON.fi (TON)';
    swapUrl = `https://app.ston.fi/swap?ft=TON&tt=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'tron') {
    dexName = 'SunSwap (TRON)';
    swapUrl = `https://sunswap.com/#/home?tokenAddress=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'sui') {
    dexName = 'Cetus (Sui)';
    swapUrl = `https://app.cetus.zone/swap?from=0x2::sui::SUI&to=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'aptos') {
    dexName = 'Liquidswap (Aptos)';
    swapUrl = `https://liquidswap.com/#/`;
  } else if (c === 'linea') {
    dexName = 'Lynex (Linea)';
    swapUrl = `https://app.lynex.finance/swap?outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'blast') {
    dexName = 'Thruster (Blast)';
    swapUrl = `https://app.thruster.finance/?token2=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'pulsechain') {
    dexName = 'PulseX (PulseChain)';
    swapUrl = `https://app.pulsex.com/swap?outputCurrency=${encodeURIComponent(tokenAddress)}`;
  } else if (c === 'cronos') {
    dexName = 'VVS Finance (Cronos)';
    swapUrl = `https://vvs.finance/swap?outputCurrency=${encodeURIComponent(tokenAddress)}`;
  }

  const trustWalletDappUrl = `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(swapUrl)}`;
  return {
    chainId: c,
    coinId,
    dexName,
    swapUrl,
    trustWalletDappUrl,
    dexScreenerUrl: pairUrl || `https://dexscreener.com/${encodeURIComponent(c)}/${encodeURIComponent(tokenAddress)}`,
  };
}

export function scoreDexPairSafety(pair: DexPair): { safetyScore: number; riskFlags: string[] } {
  let score = 50;
  const riskFlags: string[] = [];

  const liq = Number(pair.liquidity?.usd || 0);
  const vol24 = Number(pair.volume?.h24 || 0);
  const m5Buys = Number(pair.txns?.m5?.buys || 0);
  const m5Sells = Number(pair.txns?.m5?.sells || 0);
  const h1Change = Number(pair.priceChange?.h1 || 0);
  const ageMs = pair.pairCreatedAt ? Date.now() - Number(pair.pairCreatedAt) : 0;

  if (liq >= 250_000) score += 20;
  else if (liq >= 50_000) score += 10;
  else if (liq < 15_000) {
    score -= 22;
    riskFlags.push('نقدینگی پایین استخر (< $15K)');
  }

  if (vol24 >= 500_000) score += 15;
  else if (vol24 >= 100_000) score += 8;
  else if (vol24 < 20_000) {
    score -= 10;
    riskFlags.push('حجم معاملات ۲۴ساعته پایین');
  }

  if (pair.info?.websites?.length || pair.info?.socials?.length) {
    score += 10;
  } else {
    riskFlags.push('فاقد لینک وب‌سایت/شبکه اجتماعی تاییدشده');
  }

  if (ageMs > 0 && ageMs < 6 * 3600_000) {
    score -= 12;
    riskFlags.push('استخر تازه ایجاد شده (< ۶ ساعت)');
  } else if (ageMs >= 7 * 86400_000) {
    score += 10;
  }

  if (m5Buys + m5Sells > 10 && m5Sells === 0 && h1Change > 80) {
    score -= 15;
    riskFlags.push('فشار خرید غیرعادی / احتمال محدودیت فروش');
  }

  return {
    safetyScore: Math.max(5, Math.min(98, score)),
    riskFlags,
  };
}

export function enrichDexPair(pair: DexPair): DexTokenEnriched {
  const { safetyScore, riskFlags } = scoreDexPairSafety(pair);
  const sym = (pair.baseToken?.symbol || '').toUpperCase();
  const majors = new Set(['BTC', 'WBTC', 'ETH', 'WETH', 'SOL', 'BNB', 'WBNB', 'XRP', 'ADA', 'DOGE', 'TON', 'TRX', 'AVAX', 'LINK', 'USDT', 'USDC']);
  return {
    ...pair,
    safetyScore,
    riskFlags,
    trustWallet: buildTrustWalletSwapLinks(pair.chainId, pair.baseToken?.address || pair.pairAddress, pair.url),
    isOnCentralizedHint: majors.has(sym),
  };
}

async function fetchJson<T>(path: string, timeoutMs = 9000): Promise<T | null> {
  try {
    const res = await fetch(`${DEX_BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; DollarinoDexRadar/9.6; +https://dollarino.pages.dev)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const GECKO_NETWORK_MAP: Record<string, string> = {
  eth: 'ethereum',
  bsc: 'bsc',
  solana: 'solana',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon_pos: 'polygon',
  ton: 'ton',
  avax: 'avalanche',
  optimism: 'optimism',
  'sui-network': 'sui',
  aptos: 'aptos',
  linea: 'linea',
  blast: 'blast',
  pulsechain: 'pulsechain',
  cro: 'cronos',
  tron: 'tron',
};

interface GeckoResponse {
  data?: Array<{
    id: string;
    attributes: {
      address: string;
      name: string;
      base_token_price_usd?: string | null;
      pool_created_at?: string | null;
      fdv_usd?: string | null;
      market_cap_usd?: string | null;
      reserve_in_usd?: string | null;
      volume_usd?: { h24?: string; h1?: string; m5?: string };
      price_change_percentage?: { h24?: string; h1?: string; m5?: string };
      transactions?: Record<string, { buys?: number; sells?: number }>;
    };
    relationships?: {
      base_token?: { data?: { id?: string } };
      quote_token?: { data?: { id?: string } };
      network?: { data?: { id?: string } };
      dex?: { data?: { id?: string } };
    };
  }>;
  included?: Array<{
    id: string;
    type: string;
    attributes?: {
      address?: string;
      name?: string;
      symbol?: string;
      image_url?: string | null;
    };
  }>;
}

async function fetchGeckoTerminalFallback(query?: string): Promise<DexTokenEnriched[]> {
  try {
    const path = query
      ? `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(query)}&include=base_token,quote_token,dex`
      : `https://api.geckoterminal.com/api/v2/networks/trending_pools?include=base_token,quote_token,dex`;
    const res = await fetch(path, {
      headers: {
        Accept: 'application/json;version=20230302',
        'User-Agent': 'Mozilla/5.0 (compatible; DollarinoDexRadar/9.6; +https://dollarino.pages.dev)',
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as GeckoResponse;
    const rows = Array.isArray(json.data) ? json.data : [];
    const incMap = new Map<string, { address?: string; name?: string; symbol?: string; image_url?: string | null }>();
    for (const item of json.included || []) {
      if (item?.id && item.attributes) incMap.set(item.id, item.attributes);
    }

    const mapped: DexPair[] = [];
    for (const pool of rows.slice(0, 28)) {
      const a = pool.attributes;
      if (!a?.address || !a.base_token_price_usd) continue;
      const rawNet = pool.relationships?.network?.data?.id || pool.id.split('_')[0] || 'bsc';
      const chainId = GECKO_NETWORK_MAP[rawNet] || rawNet;
      const baseId = pool.relationships?.base_token?.data?.id || '';
      const quoteId = pool.relationships?.quote_token?.data?.id || '';
      const baseMeta = incMap.get(baseId);
      const quoteMeta = incMap.get(quoteId);
      const dexId = pool.relationships?.dex?.data?.id || 'dex';
      const nameParts = (a.name || '').split('/').map((x) => x.trim());
      const baseSym = baseMeta?.symbol || nameParts[0] || 'TOKEN';
      const quoteSym = quoteMeta?.symbol || nameParts[1] || 'USDT';

      mapped.push({
        chainId,
        dexId,
        url: `https://www.geckoterminal.com/${encodeURIComponent(rawNet)}/pools/${encodeURIComponent(a.address)}`,
        pairAddress: a.address,
        baseToken: {
          address: baseMeta?.address || a.address,
          name: baseMeta?.name || baseSym,
          symbol: baseSym,
        },
        quoteToken: {
          address: quoteMeta?.address || '',
          name: quoteMeta?.name || quoteSym,
          symbol: quoteSym,
        },
        priceUsd: a.base_token_price_usd,
        liquidity: { usd: Number(a.reserve_in_usd || 0) },
        volume: {
          h24: Number(a.volume_usd?.h24 || 0),
          h1: Number(a.volume_usd?.h1 || 0),
        },
        priceChange: {
          h24: Number(a.price_change_percentage?.h24 || 0),
          h1: Number(a.price_change_percentage?.h1 || 0),
          m5: Number(a.price_change_percentage?.m5 || 0),
        },
        txns: {
          m5: {
            buys: Number(a.transactions?.m5?.buys || 0),
            sells: Number(a.transactions?.m5?.sells || 0),
          },
          h24: {
            buys: Number(a.transactions?.h24?.buys || 0),
            sells: Number(a.transactions?.h24?.sells || 0),
          },
        },
        fdv: a.fdv_usd ? Number(a.fdv_usd) : null,
        marketCap: a.market_cap_usd ? Number(a.market_cap_usd) : null,
        pairCreatedAt: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
        info: baseMeta?.image_url ? { imageUrl: baseMeta.image_url } : undefined,
      });
    }
    return mapped.filter((p) => Number(p.priceUsd || 0) > 0).map(enrichDexPair);
  } catch {
    return [];
  }
}

export async function searchDexPairs(query: string): Promise<DexTokenEnriched[]> {
  const q = query.trim();
  if (!q) return [];
  const [dexRes, geckoRes] = await Promise.allSettled([
    fetchJson<{ pairs?: DexPair[] }>(`/latest/dex/search?q=${encodeURIComponent(q)}`),
    fetchGeckoTerminalFallback(q),
  ]);
  const dexPairs = dexRes.status === 'fulfilled' && Array.isArray(dexRes.value?.pairs) ? dexRes.value.pairs : [];
  const geckoPairs = geckoRes.status === 'fulfilled' && Array.isArray(geckoRes.value) ? geckoRes.value : [];

  const seen = new Set<string>();
  const combined: DexTokenEnriched[] = [];
  for (const p of dexPairs) {
    if (!p.baseToken?.symbol || Number(p.priceUsd || 0) <= 0) continue;
    const key = `${String(p.chainId).toLowerCase()}:${String(p.pairAddress || p.baseToken.address).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(enrichDexPair(p));
  }
  for (const gp of geckoPairs) {
    const key = `${String(gp.chainId).toLowerCase()}:${String(gp.pairAddress || gp.baseToken?.address).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(gp);
  }

  return combined
    .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))
    .slice(0, 48);
}

export async function getDexTokenPools(chainId: string, tokenAddress: string): Promise<DexTokenEnriched[]> {
  const res = await fetchJson<DexPair[]>(`/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`);
  const pairs = Array.isArray(res) ? res : [];
  if (pairs.length > 0) {
    return pairs
      .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))
      .slice(0, 12)
      .map(enrichDexPair);
  }
  return searchDexPairs(tokenAddress);
}

export async function getDexPairDetails(chainId: string, pairId: string): Promise<DexTokenEnriched | null> {
  const res = await fetchJson<{ pairs?: DexPair[] }>(`/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairId)}`);
  const pair = Array.isArray(res?.pairs) ? res.pairs[0] : null;
  return pair ? enrichDexPair(pair) : null;
}

export async function getDexOrdersCheck(chainId: string, tokenAddress: string): Promise<Array<{ type: string; status: string; paymentTimestamp?: number }>> {
  const res = await fetchJson<Array<{ type: string; status: string; paymentTimestamp?: number }>>(
    `/orders/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`
  );
  return Array.isArray(res) ? res : [];
}

export async function fetchDexTrendingOverview(): Promise<{
  pairs: DexTokenEnriched[];
  metas: DexMetaItem[];
}> {
  const [topRes, latestRes, profRes, metasRes] = await Promise.allSettled([
    fetchJson<DexBoostProfileItem[]>('/token-boosts/top/v1'),
    fetchJson<DexBoostProfileItem[]>('/token-boosts/latest/v1'),
    fetchJson<DexBoostProfileItem[]>('/token-profiles/latest/v1'),
    fetchJson<DexMetaItem[]>('/metas/trending/v1'),
  ]);

  const topBoosts = topRes.status === 'fulfilled' ? topRes.value : null;
  const latestBoosts = latestRes.status === 'fulfilled' ? latestRes.value : null;
  const latestProfiles = profRes.status === 'fulfilled' ? profRes.value : null;
  const trendingMetas = metasRes.status === 'fulfilled' ? metasRes.value : null;

  const byChain = new Map<string, Set<string>>();
  const collect = (list: DexBoostProfileItem[] | null, cap = 15) => {
    if (!Array.isArray(list)) return;
    for (const item of list.slice(0, cap)) {
      if (!item.chainId || !item.tokenAddress) continue;
      if (!byChain.has(item.chainId)) byChain.set(item.chainId, new Set());
      const set = byChain.get(item.chainId)!;
      if (set.size < 25) set.add(item.tokenAddress);
    }
  };
  collect(topBoosts, 18);
  collect(latestBoosts, 12);
  collect(latestProfiles, 10);

  const pairFetches: Array<Promise<DexPair[] | null>> = [];
  for (const [chainId, addresses] of byChain.entries()) {
    const list = [...addresses].slice(0, 25);
    if (list.length) {
      pairFetches.push(fetchJson<DexPair[]>(`/tokens/v1/${encodeURIComponent(chainId)}/${list.join(',')}`));
    }
  }

  const fetchedChunks = await Promise.all(pairFetches);
  const bestByToken = new Map<string, DexPair>();
  for (const chunk of fetchedChunks) {
    if (!Array.isArray(chunk)) continue;
    for (const p of chunk) {
      if (!p.baseToken?.address || !p.priceUsd) continue;
      const key = `${p.chainId}:${p.baseToken.address.toLowerCase()}`;
      const prev = bestByToken.get(key);
      if (!prev || Number(p.liquidity?.usd || 0) > Number(prev.liquidity?.usd || 0)) {
        bestByToken.set(key, p);
      }
    }
  }

  let pairs = [...bestByToken.values()]
    .filter((p) => Number(p.liquidity?.usd || 0) >= 3500)
    .sort((a, b) => (Number(b.boosts?.active || 0) * 100000 + Number(b.volume?.h24 || 0)) - (Number(a.boosts?.active || 0) * 100000 + Number(a.volume?.h24 || 0)))
    .slice(0, 28)
    .map(enrichDexPair);

  if (pairs.length === 0) {
    const fallbackSearches = await Promise.allSettled([
      searchDexPairs('PEPE'),
      searchDexPairs('SOL/USDC'),
      searchDexPairs('TON'),
    ]);
    const merged: DexTokenEnriched[] = [];
    const seen = new Set<string>();
    for (const r of fallbackSearches) {
      if (r.status !== 'fulfilled') continue;
      for (const item of r.value) {
        const key = `${item.chainId}:${item.pairAddress}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }
    }
    pairs = merged.slice(0, 24);
  }

  if (pairs.length === 0) {
    pairs = await fetchGeckoTerminalFallback();
  }

  return {
    pairs,
    metas: Array.isArray(trendingMetas) ? trendingMetas.slice(0, 10) : [],
  };
}
