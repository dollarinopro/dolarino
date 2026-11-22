import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { DOLLARINO_LOGO_PNG_B64, VAZIRMATN_BOLD_TTF_B64 } from '../assets/card-assets.js';

let wasmReadyPromise: Promise<boolean> | null = null;
let cachedFontBytes: Uint8Array | null = null;

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function getFontBytes(): Uint8Array {
  if (!cachedFontBytes) {
    cachedFontBytes = b64ToUint8(VAZIRMATN_BOLD_TTF_B64);
  }
  return cachedFontBytes;
}

export async function ensureResvgReady(): Promise<boolean> {
  if (wasmReadyPromise) return wasmReadyPromise;
  wasmReadyPromise = (async () => {
    try {
      const mod = await import('@resvg/resvg-wasm/index_bg.wasm');
      await initWasm(mod.default as unknown as WebAssembly.Module);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already initialized/i.test(msg)) return true;
      // Fallback for Node.js / Vitest test runner where native `.wasm` ESM import isn't enabled
      try {
        const fsMod = await import('node:fs');
        const modCreate = await import('node:module');
        const req = modCreate.createRequire(import.meta.url);
        const wasmPath = req.resolve('@resvg/resvg-wasm/index_bg.wasm');
        const buf = fsMod.readFileSync(wasmPath);
        await initWasm(buf);
        return true;
      } catch (nodeErr) {
        const nMsg = nodeErr instanceof Error ? nodeErr.message : String(nodeErr);
        if (/already initialized/i.test(nMsg)) return true;
        return false;
      }
    }
  })();
  return wasmReadyPromise;
}

function escXml(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanSvgText(v: string): string {
  return escXml(
    String(v || '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function fmtSignedUsd(val: number): string {
  const n = Number.isFinite(val) ? val : 0;
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n >= 0 ? '+' : '-'}$${abs}`;
}

export function fmtSignedPct(val: number): string {
  const n = Number.isFinite(val) ? val : 0;
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
}

export function periodLabelFa(period: string): string {
  switch (period.toUpperCase()) {
    case '24H':
      return 'گزارش ۲۴ ساعته';
    case '7D':
      return 'گزارش هفتگی (۷ روز)';
    case '30D':
      return 'گزارش ماهانه (۳۰ روز)';
    case '1Y':
      return 'گزارش سالانه (۱۲ ماه)';
    case 'TRADE':
      return 'کارت تک‌معامله';
    default:
      return 'گزارش جامع کل دوره';
  }
}

export interface ProfitCardRenderInput {
  cardId: string;
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
  layout?: 'horizontal' | 'vertical';
}

export function buildProfitCardSvg(input: ProfitCardRenderInput): string {
  const layout = input.layout === 'vertical' ? 'vertical' : 'horizontal';
  const W = layout === 'vertical' ? 1080 : 1200;
  const H = layout === 'vertical' ? 1440 : 675;
  const isProfit = input.netPnlUsd >= 0;
  const isLive = input.mode === 'LIVE';

  const accent = isProfit ? '#10d9a3' : '#fb7185';
  const accentSoft = isProfit ? 'rgba(16, 217, 163, 0.14)' : 'rgba(251, 113, 133, 0.14)';
  const stampColor = isLive ? '#10d9a3' : '#f59e0b';
  const stampLabel = isLive ? 'حساب واقعی · LIVE VERIFIED' : 'حساب دمو · DEMO / PAPER';

  const roiStr = fmtSignedPct(input.roiPct);
  const pnlStr = fmtSignedUsd(input.netPnlUsd);
  const pfStr = input.profitFactor >= 99 ? 'MAX' : input.profitFactor.toFixed(2);
  const wrStr = `${Number(input.winRate || 0).toFixed(1)}%`;
  const dateStr = (input.issuedAt || '').slice(0, 10) || 'LIVE';

  const logoSize = layout === 'vertical' ? 560 : 440;
  const logoX = Math.round((W - logoSize) / 2);
  const logoY = Math.round((H - logoSize) / 2);

  if (layout === 'vertical') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgV" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050d24"/>
      <stop offset="55%" stop-color="#0b1b44"/>
      <stop offset="100%" stop-color="#071330"/>
    </linearGradient>
    <radialGradient id="glowV" cx="0.2" cy="0.22" r="0.7">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#050d24" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgV)"/>
  <rect width="${W}" height="${H}" fill="url(#glowV)"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="44" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>

  <!-- Large low-opacity Dollarino watermark logo -->
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.10"/>

  <!-- Top Brand Header -->
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="76" y="74" width="84" height="84"/>
  <text x="180" y="112" font-family="Vazirmatn" font-size="36" fill="#ffffff">کارت سود دلارینو · DOLLARINO</text>
  <text x="180" y="150" font-family="Vazirmatn" font-size="24" fill="#93c5fd">${escXml(periodLabelFa(input.period))}</text>

  <rect x="${W - 330}" y="82" width="254" height="58" rx="29" fill="rgba(255,255,255,0.08)" stroke="${stampColor}" stroke-width="2.5"/>
  <text x="${W - 203}" y="120" text-anchor="middle" font-family="Vazirmatn" font-size="22" fill="${stampColor}">${isLive ? 'حساب واقعی' : 'حساب دمو'}</text>

  <!-- Trader & Engine -->
  <text x="${W - 76}" y="255" text-anchor="end" font-family="Vazirmatn" font-size="28" fill="#cbd5e1">${cleanSvgText(input.displayName)}</text>
  <text x="${W - 76}" y="302" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="#38bdf8">${cleanSvgText(input.strategyName)} · ${escXml(input.exchangeProvider.toUpperCase())}</text>

  <!-- Main ROI Hero Box -->
  <rect x="76" y="355" width="${W - 152}" height="320" rx="36" fill="${accentSoft}" stroke="${accent}" stroke-width="2.5"/>
  <text x="${W / 2}" y="425" text-anchor="middle" font-family="Vazirmatn" font-size="26" fill="#e2e8f0">بازده خالص تاییدشده · ROI</text>
  <text x="${W / 2}" y="545" text-anchor="middle" font-family="Vazirmatn" font-size="112" fill="${accent}">${escXml(roiStr)}</text>
  <text x="${W / 2}" y="625" text-anchor="middle" font-family="Vazirmatn" font-size="48" fill="#ffffff">${escXml(pnlStr)}</text>

  <!-- Bold Diagonal Real/Demo Stamp -->
  <g transform="translate(${W / 2}, 785) rotate(-11)">
    <rect x="-270" y="-48" width="540" height="96" rx="20" fill="rgba(5,13,36,0.68)" stroke="${stampColor}" stroke-width="5"/>
    <text x="0" y="13" text-anchor="middle" font-family="Vazirmatn" font-size="32" fill="${stampColor}">${escXml(stampLabel)}</text>
  </g>

  <!-- 2x2 Metrics Grid -->
  <rect x="76" y="885" width="445" height="175" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="298" y="948" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="#94a3b8">نرخ موفقیت · WIN RATE</text>
  <text x="298" y="1022" text-anchor="middle" font-family="Vazirmatn" font-size="52" fill="#ffffff">${escXml(wrStr)}</text>

  <rect x="559" y="885" width="445" height="175" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="781" y="948" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="#94a3b8">تعداد معاملات</text>
  <text x="781" y="1022" text-anchor="middle" font-family="Vazirmatn" font-size="52" fill="#ffffff">${input.tradesCount}</text>

  <rect x="76" y="1088" width="445" height="175" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="298" y="1151" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="#94a3b8">ضریب سود · PF</text>
  <text x="298" y="1225" text-anchor="middle" font-family="Vazirmatn" font-size="52" fill="#fbbf24">${escXml(pfStr)}</text>

  <rect x="559" y="1088" width="445" height="175" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="781" y="1151" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="#94a3b8">تاریخ صدور</text>
  <text x="781" y="1225" text-anchor="middle" font-family="Vazirmatn" font-size="42" fill="#e2e8f0">${escXml(dateStr)}</text>

  <!-- Footer -->
  <text x="76" y="1365" font-family="Vazirmatn" font-size="24" fill="#94a3b8">ID: ${escXml(input.cardId.slice(0, 18))}</text>
  <text x="${W - 76}" y="1365" text-anchor="end" font-family="Vazirmatn" font-size="26" fill="#38bdf8">@Dollarino_official · dollarino.pages.dev</text>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050d24"/>
      <stop offset="55%" stop-color="#0b1b44"/>
      <stop offset="100%" stop-color="#071330"/>
    </linearGradient>
    <radialGradient id="glowH" cx="0.22" cy="0.45" r="0.65">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#050d24" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgH)"/>
  <rect width="${W}" height="${H}" fill="url(#glowH)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="34" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2.5"/>

  <!-- Large low-opacity Dollarino watermark logo -->
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.10"/>

  <!-- Top Header -->
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="56" y="48" width="66" height="66"/>
  <text x="138" y="80" font-family="Vazirmatn" font-size="30" fill="#ffffff">کارت سود دلارینو · DOLLARINO</text>
  <text x="138" y="112" font-family="Vazirmatn" font-size="20" fill="#93c5fd">${escXml(periodLabelFa(input.period))} · ${escXml(input.exchangeProvider.toUpperCase())}</text>

  <text x="${W - 56}" y="78" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="#e2e8f0">${cleanSvgText(input.displayName)}</text>
  <text x="${W - 56}" y="110" text-anchor="end" font-family="Vazirmatn" font-size="20" fill="#38bdf8">${cleanSvgText(input.strategyName)}</text>

  <!-- Main Left Hero (Pure LTR numeric texts to avoid SVG BiDi sign reversal) -->
  <text x="64" y="218" font-family="Vazirmatn" font-size="22" fill="#cbd5e1">بازده و سود خالص تاییدشده · ROI</text>
  <text x="64" y="334" font-family="Vazirmatn" font-size="108" fill="${accent}">${escXml(roiStr)}</text>
  <text x="64" y="406" font-family="Vazirmatn" font-size="44" fill="#ffffff">${escXml(pnlStr)} USDT</text>

  <!-- Bold Diagonal Real/Demo Stamp -->
  <g transform="translate(880, 295) rotate(-12)">
    <rect x="-245" y="-44" width="490" height="88" rx="18" fill="rgba(5,13,36,0.72)" stroke="${stampColor}" stroke-width="4.5"/>
    <text x="0" y="12" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="${stampColor}">${escXml(stampLabel)}</text>
  </g>

  <!-- Bottom 4 Metric Cards -->
  <rect x="56" y="458" width="256" height="122" rx="22" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="184" y="502" text-anchor="middle" font-family="Vazirmatn" font-size="19" fill="#94a3b8">نرخ موفقیت</text>
  <text x="184" y="555" text-anchor="middle" font-family="Vazirmatn" font-size="38" fill="#ffffff">${escXml(wrStr)}</text>

  <rect x="334" y="458" width="256" height="122" rx="22" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="462" y="502" text-anchor="middle" font-family="Vazirmatn" font-size="19" fill="#94a3b8">تعداد معاملات</text>
  <text x="462" y="555" text-anchor="middle" font-family="Vazirmatn" font-size="38" fill="#ffffff">${input.tradesCount}</text>

  <rect x="612" y="458" width="256" height="122" rx="22" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="740" y="502" text-anchor="middle" font-family="Vazirmatn" font-size="19" fill="#94a3b8">ضریب سود (PF)</text>
  <text x="740" y="555" text-anchor="middle" font-family="Vazirmatn" font-size="38" fill="#fbbf24">${escXml(pfStr)}</text>

  <rect x="890" y="458" width="254" height="122" rx="22" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="1017" y="502" text-anchor="middle" font-family="Vazirmatn" font-size="19" fill="#94a3b8">تاریخ</text>
  <text x="1017" y="555" text-anchor="middle" font-family="Vazirmatn" font-size="32" fill="#e2e8f0">${escXml(dateStr)}</text>

  <!-- Footer -->
  <text x="64" y="628" font-family="Vazirmatn" font-size="20" fill="#94a3b8">Verify ID: ${escXml(input.cardId.slice(0, 20))}</text>
  <text x="${W - 64}" y="628" text-anchor="end" font-family="Vazirmatn" font-size="22" fill="#38bdf8">@Dollarino_official · dollarino.pages.dev</text>
</svg>`;
}

export interface SignalClosedCardRenderInput {
  cardId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  engineLabel: string;
  mode: 'LIVE' | 'PAPER';
  entryPrice: string;
  exitPrice: string;
  pnlUsd: number;
  pnlPct: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  trailingActive: boolean;
  trailingSlPrice?: string;
  closeReason: string;
  openedAt: string;
  closedAt: string;
  layout?: 'horizontal' | 'vertical';
}

export function buildSignalClosedCardSvg(input: SignalClosedCardRenderInput): string {
  const layout = input.layout === 'vertical' ? 'vertical' : 'horizontal';
  const W = layout === 'vertical' ? 1080 : 1200;
  const H = layout === 'vertical' ? 1440 : 675;
  const isWin = input.pnlUsd >= 0;
  const accent = isWin ? '#10d9a3' : '#fb7185';
  const accentSoft = isWin ? 'rgba(16, 217, 163, 0.14)' : 'rgba(251, 113, 133, 0.14)';
  const isLive = input.mode === 'LIVE';
  const stampColor = isLive ? '#10d9a3' : '#f59e0b';
  const stampLabel = isLive ? 'حساب واقعی · LIVE SIGNAL' : 'حساب دمو · DEMO / PAPER';

  const roiStr = fmtSignedPct(input.pnlPct);
  const pnlStr = fmtSignedUsd(input.pnlUsd);
  const logoSize = layout === 'vertical' ? 540 : 440;
  const logoX = Math.round((W - logoSize) / 2);
  const logoY = Math.round((H - logoSize) / 2);

  const tp1Lbl = input.tp1Hit ? 'فعال شد' : 'در انتظار';
  const tp2Lbl = input.tp2Hit ? 'فعال شد' : 'در انتظار';
  const tp3Lbl = input.tp3Hit ? 'تکمیل شد' : 'در انتظار';
  const trailLbl = input.trailingActive
    ? input.trailingSlPrice || 'Risk-Free'
    : input.trailingSlPrice || 'Fixed SL';
  const engClean = cleanSvgText(input.engineLabel);

  if (layout === 'vertical') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgSCV" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#040b1f"/>
      <stop offset="100%" stop-color="#0b1c45"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgSCV)"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="42" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.10"/>

  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="76" y="70" width="80" height="80"/>
  <text x="176" y="108" font-family="Vazirmatn" font-size="34" fill="#ffffff">نتیجه بسته شدن سیگنال دلارینو</text>
  <text x="176" y="146" font-family="Vazirmatn" font-size="24" fill="#38bdf8">${engClean}</text>

  <text x="76" y="246" font-family="Vazirmatn" font-size="52" fill="#ffffff">${escXml(input.symbol)} · ${input.direction} · ${input.leverage}X</text>
  <rect x="76" y="285" width="${W - 152}" height="310" rx="34" fill="${accentSoft}" stroke="${accent}" stroke-width="2.5"/>
  <text x="${W / 2}" y="352" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="#e2e8f0">${isWin ? 'تبریک! تارگت با سود بسته شد' : 'معامله با مدیریت ریسک بسته شد'}</text>
  <text x="${W / 2}" y="472" text-anchor="middle" font-family="Vazirmatn" font-size="110" fill="${accent}">${escXml(roiStr)}</text>
  <text x="${W / 2}" y="555" text-anchor="middle" font-family="Vazirmatn" font-size="44" fill="#ffffff">${escXml(pnlStr)} USDT</text>

  <g transform="translate(${W / 2}, 675) rotate(-10)">
    <rect x="-260" y="-44" width="520" height="88" rx="18" fill="rgba(4,11,31,0.72)" stroke="${stampColor}" stroke-width="4.5"/>
    <text x="0" y="12" text-anchor="middle" font-family="Vazirmatn" font-size="30" fill="${stampColor}">${escXml(stampLabel)}</text>
  </g>

  <!-- TP1 / TP2 / TP3 / Trailing SL Badges -->
  <rect x="76" y="765" width="445" height="125" rx="24" fill="rgba(255,255,255,0.07)" stroke="${input.tp1Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="298" y="814" text-anchor="middle" font-family="Vazirmatn" font-size="26" fill="#94a3b8">TP1</text>
  <text x="298" y="860" text-anchor="middle" font-family="Vazirmatn" font-size="30" fill="${input.tp1Hit ? '#10d9a3' : '#cbd5e1'}">${tp1Lbl}</text>

  <rect x="559" y="765" width="445" height="125" rx="24" fill="rgba(255,255,255,0.07)" stroke="${input.tp2Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="781" y="814" text-anchor="middle" font-family="Vazirmatn" font-size="26" fill="#94a3b8">TP2</text>
  <text x="781" y="860" text-anchor="middle" font-family="Vazirmatn" font-size="30" fill="${input.tp2Hit ? '#10d9a3' : '#cbd5e1'}">${tp2Lbl}</text>

  <rect x="76" y="915" width="445" height="125" rx="24" fill="rgba(255,255,255,0.07)" stroke="${input.tp3Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="298" y="964" text-anchor="middle" font-family="Vazirmatn" font-size="26" fill="#94a3b8">TP3</text>
  <text x="298" y="1010" text-anchor="middle" font-family="Vazirmatn" font-size="30" fill="${input.tp3Hit ? '#10d9a3' : '#cbd5e1'}">${tp3Lbl}</text>

  <rect x="559" y="915" width="445" height="125" rx="24" fill="rgba(255,255,255,0.07)" stroke="${input.trailingActive ? '#38bdf8' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="781" y="964" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="#94a3b8">${input.trailingActive ? 'Trailing SL فعال' : 'Stop Loss'}</text>
  <text x="781" y="1010" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="${input.trailingActive ? '#38bdf8' : '#cbd5e1'}">${escXml(trailLbl)}</text>

  <!-- Prices & Times (Pure LTR numeric lines to preserve reading order) -->
  <rect x="76" y="1075" width="${W - 152}" height="210" rx="28" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="${W - 110}" y="1138" text-anchor="end" font-family="Vazirmatn" font-size="28" fill="#e2e8f0">Entry: ${escXml(input.entryPrice)}  ·  Exit: ${escXml(input.exitPrice)}</text>
  <text x="${W - 110}" y="1192" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="#94a3b8">Opened: ${escXml(input.openedAt.slice(0, 19).replace('T', ' '))} UTC</text>
  <text x="${W - 110}" y="1244" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="#94a3b8">Closed: ${escXml(input.closedAt.slice(0, 19).replace('T', ' '))} UTC</text>

  <text x="76" y="1368" font-family="Vazirmatn" font-size="22" fill="#94a3b8">Card: ${escXml(input.cardId.slice(0, 18))}</text>
  <text x="${W - 76}" y="1368" text-anchor="end" font-family="Vazirmatn" font-size="26" fill="#38bdf8">@Dollarino_official · dollarino.pages.dev</text>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgSCH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#040b1f"/>
      <stop offset="100%" stop-color="#0b1c45"/>
    </linearGradient>
    <radialGradient id="glowSCH" cx="0.22" cy="0.45" r="0.65">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#040b1f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgSCH)"/>
  <rect width="${W}" height="${H}" fill="url(#glowSCH)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="34" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2.5"/>
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.10"/>

  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="54" y="44" width="62" height="62"/>
  <text x="132" y="76" font-family="Vazirmatn" font-size="28" fill="#ffffff">نتیجه بسته شدن سیگنال دلارینو</text>
  <text x="132" y="106" font-family="Vazirmatn" font-size="20" fill="#38bdf8">${engClean}</text>

  <text x="${W - 54}" y="76" text-anchor="end" font-family="Vazirmatn" font-size="34" fill="#ffffff">${escXml(input.symbol)} · ${input.direction} · ${input.leverage}X</text>
  <text x="${W - 54}" y="110" text-anchor="end" font-family="Vazirmatn" font-size="20" fill="#94a3b8">Entry: ${escXml(input.entryPrice)}  ·  Exit: ${escXml(input.exitPrice)}</text>

  <text x="60" y="205" font-family="Vazirmatn" font-size="22" fill="#e2e8f0">${isWin ? 'تبریک! معامله با سود بسته شد' : 'معامله با مدیریت ریسک بسته شد'}</text>
  <text x="60" y="316" font-family="Vazirmatn" font-size="104" fill="${accent}">${escXml(roiStr)}</text>
  <text x="60" y="384" font-family="Vazirmatn" font-size="40" fill="#ffffff">${escXml(pnlStr)} USDT</text>

  <g transform="translate(880, 275) rotate(-11)">
    <rect x="-240" y="-42" width="480" height="84" rx="18" fill="rgba(4,11,31,0.74)" stroke="${stampColor}" stroke-width="4.5"/>
    <text x="0" y="11" text-anchor="middle" font-family="Vazirmatn" font-size="26" fill="${stampColor}">${escXml(stampLabel)}</text>
  </g>

  <!-- 4 TP & Trailing SL Boxes -->
  <rect x="54" y="438" width="256" height="114" rx="20" fill="rgba(255,255,255,0.06)" stroke="${input.tp1Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="182" y="482" text-anchor="middle" font-family="Vazirmatn" font-size="21" fill="#94a3b8">TP1</text>
  <text x="182" y="524" text-anchor="middle" font-family="Vazirmatn" font-size="25" fill="${input.tp1Hit ? '#10d9a3' : '#cbd5e1'}">${tp1Lbl}</text>

  <rect x="332" y="438" width="256" height="114" rx="20" fill="rgba(255,255,255,0.06)" stroke="${input.tp2Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="460" y="482" text-anchor="middle" font-family="Vazirmatn" font-size="21" fill="#94a3b8">TP2</text>
  <text x="460" y="524" text-anchor="middle" font-family="Vazirmatn" font-size="25" fill="${input.tp2Hit ? '#10d9a3' : '#cbd5e1'}">${tp2Lbl}</text>

  <rect x="610" y="438" width="256" height="114" rx="20" fill="rgba(255,255,255,0.06)" stroke="${input.tp3Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="738" y="482" text-anchor="middle" font-family="Vazirmatn" font-size="21" fill="#94a3b8">TP3</text>
  <text x="738" y="524" text-anchor="middle" font-family="Vazirmatn" font-size="25" fill="${input.tp3Hit ? '#10d9a3' : '#cbd5e1'}">${tp3Lbl}</text>

  <rect x="888" y="438" width="258" height="114" rx="20" fill="rgba(255,255,255,0.06)" stroke="${input.trailingActive ? '#38bdf8' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="1017" y="482" text-anchor="middle" font-family="Vazirmatn" font-size="20" fill="#94a3b8">${input.trailingActive ? 'Trailing SL فعال' : 'Stop Loss'}</text>
  <text x="1017" y="524" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="${input.trailingActive ? '#38bdf8' : '#cbd5e1'}">${escXml(trailLbl)}</text>

  <text x="56" y="618" font-family="Vazirmatn" font-size="19" fill="#94a3b8">${escXml(input.closedAt.slice(0, 19).replace('T', ' '))} UTC · ${escXml(input.closeReason)}</text>
  <text x="${W - 56}" y="618" text-anchor="end" font-family="Vazirmatn" font-size="22" fill="#38bdf8">@Dollarino_official · dollarino.pages.dev</text>
</svg>`;
}

export async function renderSvgToPngBuffer(svg: string): Promise<Uint8Array | null> {
  const ok = await ensureResvgReady();
  if (!ok) return null;
  try {
    const resvg = new Resvg(svg, {
      font: {
        fontBuffers: [getFontBytes()],
        defaultFontFamily: 'Vazirmatn',
      },
    });
    const rendered = resvg.render();
    return rendered.asPng();
  } catch {
    return null;
  }
}

export async function renderProfitCardPng(input: ProfitCardRenderInput): Promise<Uint8Array | null> {
  return renderSvgToPngBuffer(buildProfitCardSvg(input));
}

export async function renderSignalClosedCardPng(input: SignalClosedCardRenderInput): Promise<Uint8Array | null> {
  return renderSvgToPngBuffer(buildSignalClosedCardSvg(input));
}
