const DEFAULT_API_BASE = 'https://dollarino.pages.dev';

const state = {
  apiBase: DEFAULT_API_BASE,
  extKey: '',
  theme: 'cosmic',
  isRunning: false,
  tradingMode: 'PAPER',
  referralUrl: '',
  marketsCache: [],
  marketFilter: 'all',
  activeTab: 'bot',
};

const COIN_COLORS = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#14F195',
  BNB: '#F3BA2F',
  XRP: '#00A2FF',
  DOGE: '#C2A633',
  ADA: '#0033AD',
  AVAX: '#E84142',
  TON: '#0098EA',
  DOT: '#E6007A',
  LINK: '#2A5ADA',
  TRX: '#FF060A',
  USDT: '#26A17B',
  USDC: '#2775CA',
  SUI: '#4DA2FF',
  PEPE: '#479F53',
  ARB: '#28A0F0',
  OP: '#FF0420',
  BONK: '#F59E0B',
  WIF: '#B97E56',
  ORDI: '#1652F0',
};

const CHAIN_COLORS = {
  solana: '#14F195',
  ethereum: '#627EEA',
  bsc: '#F3BA2F',
  base: '#1652F0',
  ton: '#0098EA',
  arbitrum: '#28A0F0',
};

const els = {
  connDot: document.getElementById('connDot'),
  userMeta: document.getElementById('userMeta'),
  themeBtn: document.getElementById('themeBtn'),
  themeIconMoon: document.getElementById('themeIconMoon'),
  themeIconSun: document.getElementById('themeIconSun'),
  refreshBtn: document.getElementById('refreshBtn'),
  openWebHeaderBtn: document.getElementById('openWebHeaderBtn'),
  segThumb: document.getElementById('segThumb'),
  goSyncBtn: document.getElementById('goSyncBtn'),
  welcomeHeroCard: document.getElementById('welcomeHeroCard'),
  connectedHeroCard: document.getElementById('connectedHeroCard'),
  botPulseDot: document.getElementById('botPulseDot'),
  botStateLabel: document.getElementById('botStateLabel'),
  botModeLabel: document.getElementById('botModeLabel'),
  balanceTotal: document.getElementById('balanceTotal'),
  heroSparkWrap: document.getElementById('heroSparkWrap'),
  openPnl: document.getElementById('openPnl'),
  openCount: document.getElementById('openCount'),
  heroModeShort: document.getElementById('heroModeShort'),
  toggleBotBtn: document.getElementById('toggleBotBtn'),
  aiScanBtn: document.getElementById('aiScanBtn'),
  killSwitchBtn: document.getElementById('killSwitchBtn'),
  positionsList: document.getElementById('positionsList'),
  openWebLink: document.getElementById('openWebLink'),
  marketsList: document.getElementById('marketsList'),
  marketSearchInput: document.getElementById('marketSearchInput'),
  refreshMarketsBtn: document.getElementById('refreshMarketsBtn'),
  dexSearchInput: document.getElementById('dexSearchInput'),
  dexSearchBtn: document.getElementById('dexSearchBtn'),
  dexList: document.getElementById('dexList'),
  accountProfileCard: document.getElementById('accountProfileCard'),
  profileAvatar: document.getElementById('profileAvatar'),
  profileName: document.getElementById('profileName'),
  profileVerifiedBadge: document.getElementById('profileVerifiedBadge'),
  profilePlanLine: document.getElementById('profilePlanLine'),
  apiBaseInput: document.getElementById('apiBaseInput'),
  extKeyInput: document.getElementById('extKeyInput'),
  toggleKeyVisBtn: document.getElementById('toggleKeyVisBtn'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  clearConfigBtn: document.getElementById('clearConfigBtn'),
  referralBox: document.getElementById('referralBox'),
  refTierBadge: document.getElementById('refTierBadge'),
  refCodeText: document.getElementById('refCodeText'),
  copyRefBtn: document.getElementById('copyRefBtn'),
  toastDot: document.getElementById('toastDot'),
  toastText: document.getElementById('toastText'),
};

const extStorage = {
  async get(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return chrome.storage.local.get(keys);
    }
    const out = {};
    for (const k of keys) {
      try {
        const v = localStorage.getItem(`dlr_ext_${k}`);
        if (v !== null) out[k] = v;
      } catch {}
    }
    return out;
  },
  async set(obj) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return chrome.storage.local.set(obj);
    }
    for (const [k, v] of Object.entries(obj)) {
      try {
        localStorage.setItem(`dlr_ext_${k}`, String(v ?? ''));
      } catch {}
    }
  },
  async remove(key) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return chrome.storage.local.remove(key);
    }
    try {
      localStorage.removeItem(`dlr_ext_${key}`);
    } catch {}
  },
};

function notifyBadgeSync() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: 'SYNC_BADGE' }).catch(() => {});
  }
}

function escHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setToast(msg, tone = 'info') {
  els.toastText.textContent = msg;
  els.toastDot.className = `toast-dot ${tone === 'ok' ? 'ok' : tone === 'err' ? 'err' : ''}`;
}

function extractBaseSymbol(raw) {
  let clean = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9/_-]/g, '');
  if (clean.includes('/')) clean = clean.split('/')[0];
  else if (clean.includes('_')) clean = clean.split('_')[0];
  else if (clean.includes('-')) clean = clean.split('-')[0];
  for (const q of ['USDT', 'USDC', 'USD', 'BTC', 'ETH']) {
    if (clean.length > q.length && clean.endsWith(q)) {
      clean = clean.slice(0, -q.length);
      break;
    }
  }
  return clean.replace(/^1000+/, '') || 'COIN';
}

function renderCoinAvatar(symbol) {
  const base = extractBaseSymbol(symbol);
  if (base === 'BTC') {
    return `<svg viewBox="0 0 32 32" width="32" height="32" style="flex-shrink:0"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="#FFF" d="M22.5 14.1c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.7-1.6-.4-.7 2.7c-.4-.1-.7-.2-1-.2l-2.3-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 0 .1 0 .2.1h-.2l-1.1 4.5c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.5.1.9.2 1.3.3l-.7 2.7 1.6.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2-.1-3.2-1.5-3.9 1.1-.3 1.9-1 2.1-2.5zm-3.8 5.3c-.5 2-4 .9-5.1.7l.9-3.7c1.1.3 4.7.8 4.2 3zm.5-5.3c-.5 1.8-3.4.9-4.3.7l.8-3.3c1 .2 4 .7 3.5 2.6z"/></svg>`;
  }
  if (base === 'ETH') {
    return `<svg viewBox="0 0 32 32" width="32" height="32" style="flex-shrink:0"><circle cx="16" cy="16" r="16" fill="#627EEA"/><path fill="#FFF" fill-opacity=".65" d="M16 4v8.9l7.5 3.3z"/><path fill="#FFF" d="M16 4L8.5 16.2 16 12.9z"/><path fill="#FFF" fill-opacity=".65" d="M16 21.9v6.1l7.5-10.4z"/><path fill="#FFF" d="M16 28v-6.1l-7.5-4.3z"/><path fill="#FFF" fill-opacity=".25" d="M16 20.6l7.5-4.4L16 12.9z"/><path fill="#FFF" fill-opacity=".6" d="M8.5 16.2l7.5 4.4v-7.7z"/></svg>`;
  }
  if (base === 'TON') {
    return `<svg viewBox="0 0 32 32" width="32" height="32" style="flex-shrink:0"><circle cx="16" cy="16" r="16" fill="#0098EA"/><path fill="#FFF" d="M16 24.5l-6.6-11c-.5-.8.1-1.9 1.1-1.9h11c1 0 1.6 1.1 1.1 1.9l-6.6 11zm-.7-10.9h-3.6l3.6 6v-6zm1.4 0v6l3.6-6h-3.6z"/></svg>`;
  }
  const color = COIN_COLORS[base] || ['#1652F0', '#2563EB', '#0D9455', '#7C3AED', '#EA580C', '#0284C7'][base.charCodeAt(0) % 6];
  const darkText = base === 'SOL' || base === 'BNB' ? 'color:#09111f;' : '';
  return `<div class="coin-avatar" style="background:linear-gradient(135deg,${color},${color}dd);${darkText}">${escHtml(base.slice(0, 3))}</div>`;
}

function renderSparklineSvg(seedStr, changePct = 0, w = 52, h = 22, whiteStroke = false) {
  const isUp = Number(changePct) >= 0;
  const stroke = whiteStroke ? '#6ee7b7' : isUp ? 'var(--jade)' : 'var(--rose)';
  const hash = Array.from(String(seedStr || 'BTC')).reduce((a, c) => a + c.charCodeAt(0), 0);
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const x = (i / 6) * (w - 4) + 2;
    const wave = Math.sin(hash * 0.4 + i * 1.15) * 4.5;
    const trend = isUp ? (6 - i) * 1.4 : i * 1.4;
    const y = Math.max(3, Math.min(h - 3, 6 + trend + wave * 0.55));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" style="flex-shrink:0">
    <polyline points="${pts.join(' ')}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderHeroSparkline(totalPnl) {
  const isUp = totalPnl >= 0;
  const stroke = isUp ? '#6ee7b7' : '#fda4af';
  const fill = isUp ? 'rgba(110,231,183,0.22)' : 'rgba(253,164,175,0.20)';
  const path = isUp
    ? 'M2 30 C18 28, 28 19, 44 22 C60 25, 72 11, 88 13 C98 14, 106 7, 113 4'
    : 'M2 8 C18 11, 28 18, 44 16 C60 14, 72 24, 88 22 C98 21, 106 28, 113 31';
  const area = `${path} L113 35 L2 35 Z`;
  els.heroSparkWrap.innerHTML = `<svg viewBox="0 0 115 36" width="115" height="36" fill="none">
    <path d="${area}" fill="${fill}"/>
    <path d="${path}" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="113" cy="${isUp ? 4 : 31}" r="3" fill="${stroke}"/>
  </svg>`;
}

function positionSegThumb() {
  const activeBtn = document.querySelector(`.seg-tab[data-tab="${state.activeTab}"]`);
  if (!activeBtn || !els.segThumb) return;
  const w = activeBtn.offsetWidth;
  const left = activeBtn.offsetLeft;
  els.segThumb.style.width = `${w}px`;
  els.segThumb.style.transform = `translateX(${left - 4}px)`;
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.seg-tab').forEach((b) => {
    const isAct = b.dataset.tab === tabName;
    b.classList.toggle('active', isAct);
    b.setAttribute('aria-selected', String(isAct));
  });
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
  positionSegThumb();
  if (tabName === 'dex') void loadDexTokens(els.dexSearchInput.value.trim());
  if (tabName === 'markets') void loadMarkets();
}

function renderSkeletons(container, count = 4) {
  container.innerHTML = Array.from({ length: count }, () => '<div class="skeleton-row"></div>').join('');
}

async function apiFetch(path, options = {}) {
  const base = (state.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (state.extKey) headers['X-Dollarino-Extension-Key'] = state.extKey;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function applyTheme(theme) {
  state.theme = theme === 'paper' || theme === 'light' ? 'paper' : 'cosmic';
  document.documentElement.setAttribute('data-theme', state.theme);
  const isLight = state.theme === 'paper';
  els.themeIconMoon.classList.toggle('hidden', isLight);
  els.themeIconSun.classList.toggle('hidden', !isLight);
}

async function loadOverview() {
  const base = (state.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  els.openWebHeaderBtn.href = base;
  els.openWebLink.href = base;

  if (!state.extKey) {
    els.connDot.className = 'conn-dot offline';
    els.userMeta.textContent = 'در انتظار اتصال امن حساب';
    els.welcomeHeroCard.classList.remove('hidden');
    els.connectedHeroCard.classList.add('hidden');
    els.accountProfileCard.classList.add('hidden');
    els.positionsList.innerHTML = `<div class="empty-card">
      <span class="empty-emoji">🔐</span>
      <p>کلید اکستنشن هنوز ثبت نشده است. از تب «اتصال» کلید را وارد کنید تا ربات و پوزیشن‌هایتان ظاهر شود.</p>
    </div>`;
    return;
  }

  try {
    const [sess, ov] = await Promise.all([apiFetch('/api/auth/session'), apiFetch('/api/trading/overview')]);
    const u = sess.user || {};
    const uname = u.username || 'کاربر دلارینو';

    els.connDot.className = 'conn-dot online';
    els.userMeta.textContent = `${uname} · ${u.phone_verified ? 'احراز تاییدشده' : 'متصل به سایت'}`;

    els.welcomeHeroCard.classList.add('hidden');
    els.connectedHeroCard.classList.remove('hidden');
    els.accountProfileCard.classList.remove('hidden');

    els.profileAvatar.textContent = uname.charAt(0).toUpperCase() || 'D';
    els.profileName.textContent = uname;
    els.profileVerifiedBadge.textContent = u.phone_verified ? 'تاییدشده ✓' : 'اکستنشن فعال';
    els.profilePlanLine.textContent = `${ov.config?.trading_mode || 'PAPER'} · همگام با سایت`;

    const cfg = ov.config || {};
    const botState = cfg.bot_state || 'STOPPED';
    state.isRunning = botState === 'RUNNING_PAPER' || botState === 'RUNNING_LIVE';
    state.tradingMode = cfg.trading_mode || 'PAPER';

    els.botStateLabel.textContent = state.isRunning ? 'ربات فعال و در حال ترید ۲۴/۷' : 'ربات آماده و متوقف';
    els.botPulseDot.className = `pulse-dot ${state.isRunning ? 'emerald' : ''}`;
    els.botModeLabel.textContent = `${state.tradingMode} · ${cfg.market_type || 'FUTURES'}`;
    els.heroModeShort.textContent = `${state.tradingMode === 'LIVE' ? 'LIVE' : 'DEMO'} · ${cfg.leverage || 10}x`;

    const totalBal = Number(ov.balance?.total || 0);
    const openTrades = Array.isArray(ov.openTrades) ? ov.openTrades : [];
    const totalPnl = openTrades.reduce((acc, t) => acc + Number(t.unrealized_pnl || 0), 0);

    els.balanceTotal.textContent = `$${totalBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    els.openPnl.textContent = `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`;
    els.openPnl.style.color = totalPnl >= 0 ? '#6ee7b7' : '#fda4af';
    els.openCount.textContent = String(openTrades.length);
    renderHeroSparkline(totalPnl);

    els.toggleBotBtn.innerHTML = state.isRunning
      ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg><span>خاموش کردن ربات</span>`
      : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg><span>روشن کردن ربات</span>`;
    els.toggleBotBtn.className = `btn flex-1 ${state.isRunning ? 'btn-danger' : 'btn-emerald'}`;

    if (!openTrades.length) {
      els.positionsList.innerHTML = `<div class="empty-card">
        <span class="empty-emoji">✨</span>
        <p>در حال حاضر معامله بازی در این حالت (${escHtml(state.tradingMode)}) وجود ندارد.</p>
      </div>`;
    } else {
      els.positionsList.innerHTML = openTrades
        .slice(0, 8)
        .map((t) => {
          const pnl = Number(t.unrealized_pnl || 0);
          const isLong = String(t.direction || '').toUpperCase() !== 'SHORT';
          return `<div class="item-row">
            <div class="row-left">
              ${renderCoinAvatar(t.symbol)}
              <div style="min-width:0">
                <div class="item-title">
                  <span>${escHtml(t.symbol)}</span>
                  <span class="dir-pill ${isLong ? 'long' : 'short'}">${isLong ? 'LONG' : 'SHORT'} ${escHtml(t.leverage)}x</span>
                </div>
                <div class="item-sub" dir="ltr">Entry $${escHtml(t.entry_price)} · SL $${escHtml(t.current_stop_loss)}</div>
              </div>
            </div>
            <div class="item-actions">
              <strong class="pos-pnl ${pnl >= 0 ? 'pos' : 'neg'}" dir="ltr">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</strong>
              <button class="btn btn-danger-soft btn-xs close-pos-btn" data-id="${escHtml(t.id)}">بستن</button>
            </div>
          </div>`;
        })
        .join('');
    }

    void loadReferralInfo();
    notifyBadgeSync();
    setToast('همگام‌سازی زنده با سایت برقرار است', 'ok');
  } catch (err) {
    els.connDot.className = 'conn-dot offline';
    setToast(`خطای اتصال: ${err.message}`, 'err');
  }
}

async function loadReferralInfo() {
  if (!state.extKey) return;
  try {
    const res = await apiFetch('/api/subscriptions/referrals');
    const code = res.referralCode;
    if (code) {
      const base = (state.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
      state.referralUrl = `${base}/?ref=${code}`;
      els.referralBox.classList.remove('hidden');
      els.refCodeText.textContent = state.referralUrl;
      if (res.tier?.nameFa) els.refTierBadge.textContent = `${res.tier.nameFa} · ${res.tier.commissionPct}%`;
    }
  } catch {
    // ignore if unavailable
  }
}

function renderMarketsList() {
  const query = (els.marketSearchInput.value || '').trim().toUpperCase();
  let list = state.marketsCache.slice();
  if (query) list = list.filter((m) => String(m.symbol || '').toUpperCase().includes(query));
  if (state.marketFilter === 'gainers') list = list.filter((m) => Number(m.changePct24h || 0) >= 0);
  if (state.marketFilter === 'losers') list = list.filter((m) => Number(m.changePct24h || 0) < 0);

  if (!list.length) {
    els.marketsList.innerHTML = `<div class="empty-card"><span class="empty-emoji">🔍</span><p>بازاری با این فیلتر یافت نشد.</p></div>`;
    return;
  }

  els.marketsList.innerHTML = list
    .slice(0, 16)
    .map((m) => {
      const ch = Number(m.changePct24h || 0);
      const px = Number(m.lastPrice || 0);
      const pxStr = px >= 100 ? px.toLocaleString('en-US', { maximumFractionDigits: 2 }) : px.toFixed(px >= 1 ? 4 : 6);
      const vol = Number(m.volume24h || 0);
      const volLabel = vol >= 1e6 ? `$${(vol / 1e6).toFixed(1)}M` : vol > 0 ? `$${Math.round(vol / 1000)}K` : 'Live';
      return `<div class="item-row">
        <div class="row-left">
          ${renderCoinAvatar(m.symbol)}
          <div style="min-width:0">
            <div class="item-title">
              <strong>${escHtml(m.symbol)}</strong>
              <span class="badge-cobalt">${escHtml(m.maxLeverage || 20)}x</span>
            </div>
            <div class="item-sub" dir="ltr">Vol ${escHtml(volLabel)}</div>
          </div>
        </div>
        <div class="item-actions">
          ${renderSparklineSvg(m.symbol, ch)}
          <div class="text-end" style="min-width:68px">
            <div class="item-title" style="justify-content:flex-end" dir="ltr">$${pxStr}</div>
            <span class="pct-pill ${ch >= 0 ? 'pos' : 'neg'}" dir="ltr">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

async function loadMarkets() {
  renderSkeletons(els.marketsList, 5);
  try {
    if (state.extKey) {
      const res = await apiFetch('/api/trading/markets');
      const list = Array.isArray(res.markets) ? res.markets : [];
      if (list.length) {
        state.marketsCache = list;
        renderMarketsList();
        return;
      }
    }
    const pairs = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'TON', 'DOGE', 'AVAX'];
    const raw = await Promise.all(
      pairs.map((s) =>
        fetch(`https://api.coinbase.com/v2/prices/${s}-USD/spot`)
          .then((r) => r.json())
          .then((d) => ({ symbol: `${s}USDT`, lastPrice: Number(d?.data?.amount || 0), changePct24h: 0, maxLeverage: 50, volume24h: 0 }))
          .catch(() => ({ symbol: `${s}USDT`, lastPrice: 0, changePct24h: 0, maxLeverage: 20, volume24h: 0 }))
      )
    );
    state.marketsCache = raw.filter((x) => x.lastPrice > 0);
    renderMarketsList();
  } catch (err) {
    els.marketsList.innerHTML = `<div class="empty-card"><span class="empty-emoji">⚠️</span><p>خطا در دریافت بازار: ${escHtml(err.message)}</p></div>`;
  }
}

async function fetchPublicDex(query = '') {
  try {
    const dexUrl = query
      ? `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`
      : 'https://api.dexscreener.com/latest/dex/search?q=PEPE';
    const raw = await fetch(dexUrl).then((r) => r.json());
    if (Array.isArray(raw?.pairs) && raw.pairs.length) {
      return raw.pairs.slice(0, 10);
    }
  } catch {
    /* fallback to GeckoTerminal */
  }
  const gUrl = query
    ? `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(query)}&include=base_token`
    : 'https://api.geckoterminal.com/api/v2/networks/trending_pools?include=base_token';
  const g = await fetch(gUrl).then((r) => r.json());
  const inc = new Map((g.included || []).map((x) => [x.id, x.attributes]));
  return (g.data || []).slice(0, 10).map((p) => {
    const a = p.attributes || {};
    const rawNet = p.relationships?.network?.data?.id || 'bsc';
    const b = inc.get(p.relationships?.base_token?.data?.id || '') || {};
    const sym = b.symbol || (a.name || '').split('/')[0]?.trim() || 'TOKEN';
    return {
      chainId: rawNet === 'eth' ? 'ethereum' : rawNet,
      baseToken: { symbol: sym, address: b.address || a.address },
      priceUsd: a.base_token_price_usd,
      liquidity: { usd: Number(a.reserve_in_usd || 0) },
      priceChange: { h24: Number(a.price_change_percentage?.h24 || 0) },
      url: `https://www.geckoterminal.com/${rawNet}/pools/${a.address}`,
    };
  });
}

async function loadDexTokens(query = '') {
  renderSkeletons(els.dexList, 5);
  try {
    let pairs = [];
    if (state.extKey) {
      try {
        const url = query ? `/api/dex/search?q=${encodeURIComponent(query)}` : '/api/dex/trending';
        const data = await apiFetch(url);
        pairs = query ? data.pairs || data.results || [] : data.trending || data.pairs || [];
      } catch {
        pairs = [];
      }
    }
    if (!pairs.length) {
      pairs = await fetchPublicDex(query);
    }

    if (!pairs.length) {
      els.dexList.innerHTML = `<div class="empty-card"><span class="empty-emoji">🔍</span><p>توکنی با این نام یافت نشد.</p></div>`;
      return;
    }

    els.dexList.innerHTML = pairs
      .slice(0, 10)
      .map((p) => {
        const sym = p.baseToken?.symbol || 'TOKEN';
        const addr = p.baseToken?.address || '';
        const chain = String(p.chainId || 'dex').toLowerCase();
        const chainColor = CHAIN_COLORS[chain] || '#1652f0';
        const numPx = Number(p.priceUsd || 0);
        const price = numPx > 0 ? `$${numPx < 0.01 ? numPx.toPrecision(4) : numPx.toFixed(4)}` : 'DEX';
        const liq = Number(p.liquidity?.usd || 0);
        const liqStr = liq >= 1000 ? ` · Liq $${Math.round(liq / 1000)}K` : '';
        const ch24 = Number(p.priceChange?.h24 || 0);
        const twUrl = p.trustWallet?.trustWalletDappUrl || p.url || 'https://link.trustwallet.com';
        const score = typeof p.safetyScore === 'number' ? p.safetyScore : liq > 100000 ? 85 : 65;
        const scoreColor = score >= 75 ? 'var(--jade)' : score >= 50 ? 'var(--amber)' : 'var(--rose)';

        return `<div class="item-row">
          <div class="row-left">
            ${renderCoinAvatar(sym)}
            <div style="min-width:0">
              <div class="item-title">
                <strong>${escHtml(sym)}</strong>
                <span class="badge-cobalt" style="color:${chainColor};border-color:${chainColor}44;background:${chainColor}18">${escHtml(chain.toUpperCase())}</span>
                <span class="pct-pill ${ch24 >= 0 ? 'pos' : 'neg'}" dir="ltr">${ch24 >= 0 ? '+' : ''}${ch24.toFixed(1)}%</span>
              </div>
              <div class="item-sub" dir="ltr">
                ${escHtml(price)}${escHtml(liqStr)}
                <span class="safety-wrap" title="امتیاز ایمنی نقدینگی">
                  <span class="safety-bar"><span class="safety-fill" style="width:${score}%;background:${scoreColor}"></span></span>
                  <span>${score}%</span>
                </span>
              </div>
            </div>
          </div>
          <div class="item-actions">
            ${addr ? `<button class="btn btn-ghost btn-xs copy-addr-btn" data-addr="${escHtml(addr)}" title="کپی آدرس کانترکت">کپی</button>` : ''}
            <a href="${escHtml(twUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-cobalt btn-xs">سوآپ TW</a>
          </div>
        </div>`;
      })
      .join('');
  } catch (err) {
    els.dexList.innerHTML = `<div class="empty-card"><span class="empty-emoji">⚠️</span><p>خطا در رادار DEX: ${escHtml(err.message)}</p></div>`;
  }
}

document.querySelectorAll('.seg-tab').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelectorAll('.market-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.market-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.marketFilter = chip.dataset.filter || 'all';
    renderMarketsList();
  });
});

document.querySelectorAll('.dex-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.dex-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    const q = chip.dataset.q || '';
    els.dexSearchInput.value = q;
    void loadDexTokens(q);
  });
});

els.goSyncBtn.addEventListener('click', () => switchTab('sync'));

els.themeBtn.addEventListener('click', async () => {
  applyTheme(state.theme === 'cosmic' ? 'paper' : 'cosmic');
  await extStorage.set({ theme: state.theme });
});

els.toggleKeyVisBtn.addEventListener('click', () => {
  const isPwd = els.extKeyInput.type === 'password';
  els.extKeyInput.type = isPwd ? 'text' : 'password';
});

els.saveConfigBtn.addEventListener('click', async () => {
  state.apiBase = (els.apiBaseInput.value || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  state.extKey = els.extKeyInput.value.trim();
  await extStorage.set({ apiBase: state.apiBase, extKey: state.extKey });
  setToast('در حال تست و همگام‌سازی...');
  await loadOverview();
  if (els.connDot.classList.contains('online')) switchTab('bot');
});

els.clearConfigBtn.addEventListener('click', async () => {
  state.extKey = '';
  els.extKeyInput.value = '';
  await extStorage.remove('extKey');
  els.referralBox.classList.add('hidden');
  await loadOverview();
  setToast('اتصال اکستنشن قطع شد');
});

els.refreshBtn.addEventListener('click', async () => {
  els.refreshBtn.classList.add('spinning');
  setToast('در حال بروزرسانی زنده...');
  await loadOverview();
  if (state.activeTab === 'markets') await loadMarkets();
  if (state.activeTab === 'dex') await loadDexTokens(els.dexSearchInput.value.trim());
  setTimeout(() => els.refreshBtn.classList.remove('spinning'), 350);
});

els.refreshMarketsBtn.addEventListener('click', () => void loadMarkets());
els.marketSearchInput.addEventListener('input', () => renderMarketsList());

els.toggleBotBtn.addEventListener('click', async () => {
  if (!state.extKey) return switchTab('sync');
  try {
    setToast('در حال ارسال فرمان...');
    if (state.isRunning) {
      await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: false }) });
    } else {
      await apiFetch('/api/trading/bot/start', { method: 'POST', body: JSON.stringify({ mode: state.tradingMode }) });
    }
    await loadOverview();
  } catch (err) {
    setToast(`خطا: ${err.message}`, 'err');
  }
});

els.aiScanBtn.addEventListener('click', async () => {
  if (!state.extKey) return switchTab('sync');
  try {
    els.aiScanBtn.disabled = true;
    setToast('هوش مصنوعی در حال اسکن بازار...');
    await apiFetch('/api/trading/ai-scan-now', { method: 'POST', body: JSON.stringify({ autoExecute: false }) });
    setToast('اسکن هوشمند AI با موفقیت انجام شد', 'ok');
  } catch (err) {
    setToast(`خطا: ${err.message}`, 'err');
  } finally {
    els.aiScanBtn.disabled = false;
  }
});

els.killSwitchBtn.addEventListener('click', async () => {
  if (!state.extKey) return switchTab('sync');
  try {
    setToast('اجرای توقف اضطراری...');
    await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: true }) });
    await loadOverview();
  } catch (err) {
    setToast(`خطا: ${err.message}`, 'err');
  }
});

els.positionsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.close-pos-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id || !state.extKey) return;
  try {
    btn.disabled = true;
    setToast('در حال بستن پوزیشن...');
    await apiFetch(`/api/trading/positions/${encodeURIComponent(id)}/close`, { method: 'POST' });
    await loadOverview();
  } catch (err) {
    setToast(`خطا: ${err.message}`, 'err');
    btn.disabled = false;
  }
});

els.dexList.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-addr-btn');
  if (!btn) return;
  const addr = btn.dataset.addr;
  if (!addr) return;
  navigator.clipboard.writeText(addr).catch(() => {});
  btn.textContent = '✓';
  setToast('آدرس کانترکت کپی شد', 'ok');
  setTimeout(() => {
    btn.textContent = 'کپی';
  }, 1500);
});

els.dexSearchBtn.addEventListener('click', () => void loadDexTokens(els.dexSearchInput.value.trim()));
els.dexSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void loadDexTokens(els.dexSearchInput.value.trim());
});

els.copyRefBtn.addEventListener('click', () => {
  if (!state.referralUrl) return;
  navigator.clipboard.writeText(state.referralUrl).catch(() => {});
  els.copyRefBtn.textContent = 'کپی شد ✓';
  setToast('لینک رفرال با موفقیت کپی شد', 'ok');
  setTimeout(() => {
    els.copyRefBtn.textContent = 'کپی لینک';
  }, 1800);
});

window.addEventListener('resize', positionSegThumb);

(async () => {
  const saved = await extStorage.get(['apiBase', 'extKey', 'theme']);
  state.apiBase = saved.apiBase || DEFAULT_API_BASE;
  state.extKey = saved.extKey || '';
  applyTheme(saved.theme || 'cosmic');
  els.apiBaseInput.value = state.apiBase;
  els.extKeyInput.value = state.extKey;
  requestAnimationFrame(positionSegThumb);
  await loadOverview();
})();
