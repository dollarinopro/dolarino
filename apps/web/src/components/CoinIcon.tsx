import { useEffect, useState } from 'react';

interface Props {
  symbol: string;
  size?: number;
  className?: string;
  imageUrl?: string | null;
  showPair?: boolean;
}

const PALETTE: Record<string, string> = {
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
  ZEC: '#F4B728',
  HYPE: '#4CE6B0',
  LTC: '#345D9D',
  UNI: '#FF007A',
  SHIB: '#FFA409',
  NEAR: '#00EC97',
  APT: '#1AD1A5',
  ATOM: '#2E3148',
  INJ: '#00B2FF',
  WIF: '#B97E56',
  BONK: '#F59E0B',
  TRUMP: '#D97706',
  XAU: '#EAB308',
  PAXG: '#EAB308',
  GOLD: '#EAB308',
  NVDA: '#76B900',
  SOXL: '#2563EB',
  SOXS: '#E11D48',
  TSLA: '#CC0000',
  AAPL: '#374151',
};

const STOCK_AND_COMMODITY_SET = new Set([
  'XAU', 'PAXG', 'GOLD', 'XAG', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOG', 'GOOGL', 'META', 'NFLX', 'AMD', 'SOXL', 'SOXS', 'SPY', 'QQQ', 'TQQQ', 'SQQQ', 'COIN', 'MSTR',
]);

function extractParts(raw: string): { base: string; quote: string } {
  let clean = (raw || '').trim().toUpperCase().replace(/[^A-Z0-9/_-]/g, '');
  if (clean.includes('/')) {
    const [b, q] = clean.split('/');
    return { base: (b || 'COIN').replace(/^\d+/, ''), quote: q || 'USDT' };
  }
  if (clean.includes('_')) {
    const [b, q] = clean.split('_');
    return { base: (b || 'COIN').replace(/^\d+/, ''), quote: q || 'USDT' };
  }
  if (clean.includes('-')) {
    const [b, q] = clean.split('-');
    return { base: (b || 'COIN').replace(/^\d+/, ''), quote: q || 'USDT' };
  }
  const quotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH'];
  for (const q of quotes) {
    if (clean.length > q.length && clean.endsWith(q)) {
      clean = clean.slice(0, -q.length);
      return { base: clean.replace(/^1000+/, '') || clean, quote: q };
    }
  }
  return { base: (clean || 'COIN').replace(/^1000+/, '') || 'COIN', quote: 'USDT' };
}

function renderInlineBrandSvg(base: string, size: number) {
  switch (base) {
    case 'BTC':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#F7931A" />
          <path
            fill="#FFF"
            d="M22.5 14.1c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.7-1.6-.4-.7 2.7c-.4-.1-.7-.2-1-.2l-2.3-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 0 .1 0 .2.1h-.2l-1.1 4.5c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.5.1.9.2 1.3.3l-.7 2.7 1.6.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2-.1-3.2-1.5-3.9 1.1-.3 1.9-1 2.1-2.5zm-3.8 5.3c-.5 2-4 .9-5.1.7l.9-3.7c1.1.3 4.7.8 4.2 3zm.5-5.3c-.5 1.8-3.4.9-4.3.7l.8-3.3c1 .2 4 .7 3.5 2.6z"
          />
        </svg>
      );
    case 'ETH':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path fill="#FFF" fillOpacity=".6" d="M16 4v8.87l7.5 3.35L16 4z" />
          <path fill="#FFF" d="M16 4L8.5 16.22 16 12.87V4z" />
          <path fill="#FFF" fillOpacity=".6" d="M16 21.97v6.02l7.5-10.38L16 21.97z" />
          <path fill="#FFF" d="M16 28v-6.03l-7.5-4.36L16 28z" />
          <path fill="#FFF" fillOpacity=".2" d="M16 20.57l7.5-4.35L16 12.87v7.7z" />
          <path fill="#FFF" fillOpacity=".6" d="M8.5 16.22l7.5 4.35v-7.7l-7.5 3.35z" />
        </svg>
      );
    case 'SOL':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <defs>
            <linearGradient id="sol_grad_svg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9945FF" />
              <stop offset="50%" stopColor="#19FB9B" />
              <stop offset="100%" stopColor="#00FFA3" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="16" fill="#0B111E" />
          <path fill="url(#sol_grad_svg)" d="M9.6 20.5a.8.8 0 0 1 .56-.23h13.5c.36 0 .54.43.28.68l-2.3 2.3a.8.8 0 0 1-.56.23H7.58a.4.4 0 0 1-.28-.68l2.3-2.3zm0-9.6a.8.8 0 0 1 .56-.23h13.5c.36 0 .54.43.28.68l-2.3 2.3a.8.8 0 0 1-.56.23H7.58a.4.4 0 0 1-.28-.68l2.3-2.3zm11.9 4.8a.8.8 0 0 0-.56-.23H7.44a.4.4 0 0 0-.28.68l2.3 2.3a.8.8 0 0 0 .56.23h13.5c.36 0 .54-.43.28-.68l-2.3-2.3z" />
        </svg>
      );
    case 'BNB':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
          <path fill="#FFF" d="M12.1 14.3L16 10.4l3.9 3.9 2.3-2.3L16 5.9 9.8 12l2.3 2.3zm-6.2 1.7l2.3-2.3 2.3 2.3-2.3 2.3-2.3-2.3zm6.2 1.7L16 21.6l3.9-3.9 2.3 2.3L16 26.1 9.8 20l2.3-2.3zm9.4-1.7l2.3-2.3 2.3 2.3-2.3 2.3-2.3-2.3zM16 13.7L18.3 16 16 18.3 13.7 16 16 13.7z" />
        </svg>
      );
    case 'TON':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#0098EA" />
          <path fill="#FFF" d="M21.8 9.2H10.2c-2.1 0-3.4 2.3-2.3 4.1l7.1 11.4c.5.8 1.6.8 2.1 0l7.1-11.4c1.1-1.8-.2-4.1-2.4-4.1zm-6.7 11.9l-4.9-8.3c-.2-.4.1-.9.5-.9h4.4v9.2zm6.7-8.3l-4.9 8.3v-9.2h4.4c.4 0 .7.5.5.9z" />
        </svg>
      );
    case 'XRP':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#111827" />
          <path fill="#FFF" d="M22.7 8h2.6l-5.7 5.6a5.1 5.1 0 0 1-7.2 0L6.7 8h2.6l4.4 4.3a3.2 3.2 0 0 0 4.6 0L22.7 8zm-13.4 16H6.7l5.7-5.6a5.1 5.1 0 0 1 7.2 0L25.3 24h-2.6l-4.4-4.3a3.2 3.2 0 0 0-4.6 0L9.3 24z" />
        </svg>
      );
    case 'USDT':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#26A17B" />
          <path fill="#FFF" d="M17.9 17.5v-.1c-.1 0-.7.1-1.9.1s-1.7-.1-1.9-.1v.1c-3.6-.2-6.3-.9-6.3-1.7 0-.8 2.7-1.5 6.3-1.7v2.7c.2 0 .8.1 1.9.1s1.7-.1 1.9-.1v-2.7c3.6.2 6.3.9 6.3 1.7 0 .8-2.7 1.5-6.3 1.7zm0-3.7v-2.4h5.3V7.8H8.8v3.6h5.3v2.4c-4.1.2-7.2 1.1-7.2 2.1s3.1 1.9 7.2 2.1v6.2h3.8v-6.2c4.1-.2 7.2-1.1 7.2-2.1s-3.1-1.9-7.2-2.1z" />
        </svg>
      );
    case 'USDC':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#2775CA" />
          <circle cx="16" cy="16" r="10.5" fill="none" stroke="#FFF" strokeWidth="1.8" strokeDasharray="16 6" />
          <path fill="#FFF" d="M16.8 21.8v1.6h-1.6v-1.6c-1.8-.3-3-1.4-3.1-3h1.8c.1.9.7 1.5 1.8 1.5 1.1 0 1.8-.6 1.8-1.4 0-.7-.5-1.1-1.7-1.4l-1.1-.3c-1.7-.4-2.6-1.3-2.6-2.7 0-1.5 1.1-2.6 2.9-2.9v-1.6h1.6v1.6c1.6.3 2.7 1.3 2.8 2.8h-1.8c-.1-.8-.6-1.3-1.6-1.3-1 0-1.6.5-1.6 1.3 0 .7.5 1 1.5 1.3l1.1.3c1.9.5 2.8 1.4 2.8 2.8 0 1.6-1.1 2.7-3 3z" />
        </svg>
      );
    case 'TRX':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#EF0027" />
          <path fill="#FFF" d="M8.5 9.2l14.7 2.5-7.4 12.6-7.3-15.1zm2.2 1.8l4.9 10.2 5.1-8.6-10-1.6z" />
        </svg>
      );
    case 'LINK':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#2A5ADA" />
          <path fill="#FFF" d="M16 6l-8.5 4.9v10.2L16 26l8.5-4.9V10.9L16 6zm5.3 13.2L16 22.3l-5.3-3.1v-6.4L16 9.7l5.3 3.1v6.4z" />
        </svg>
      );
    case 'AVAX':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#E84142" />
          <path fill="#FFF" d="M20.2 21.6h3.6c.7 0 1-.5.7-1.1l-7.8-13.6c-.3-.6-1-.6-1.3 0L7.5 20.5c-.3.6 0 1.1.7 1.1h3.5c.4 0 .8-.2 1-.6l3.3-5.8 3.2 5.8c.2.4.6.6 1 .6z" />
        </svg>
      );
    case 'DOGE':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#C2A633" />
          <path fill="#FFF" d="M12.2 9.5h4.2c4.1 0 6.8 2.5 6.8 6.5s-2.7 6.5-6.8 6.5h-4.2v-5.3H10v-2.2h2.2V9.5zm2.8 2.4v3.1h2.4v2.2H15v2.9h1.4c2.4 0 3.9-1.5 3.9-4.1s-1.5-4.1-3.9-4.1H15z" />
        </svg>
      );
    case 'ADA':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#0033AD" />
          <circle cx="16" cy="16" r="2.6" fill="#FFF" />
          <circle cx="16" cy="8.5" r="1.4" fill="#FFF" />
          <circle cx="16" cy="23.5" r="1.4" fill="#FFF" />
          <circle cx="9.5" cy="12.2" r="1.4" fill="#FFF" />
          <circle cx="22.5" cy="12.2" r="1.4" fill="#FFF" />
          <circle cx="9.5" cy="19.8" r="1.4" fill="#FFF" />
          <circle cx="22.5" cy="19.8" r="1.4" fill="#FFF" />
        </svg>
      );
    case 'DOT':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#E6007A" />
          <ellipse cx="16" cy="9" rx="3.2" ry="1.9" fill="#FFF" />
          <ellipse cx="16" cy="23" rx="3.2" ry="1.9" fill="#FFF" />
          <ellipse cx="9.8" cy="12.5" rx="3.2" ry="1.9" transform="rotate(-60 9.8 12.5)" fill="#FFF" />
          <ellipse cx="22.2" cy="19.5" rx="3.2" ry="1.9" transform="rotate(-60 22.2 19.5)" fill="#FFF" />
          <ellipse cx="9.8" cy="19.5" rx="3.2" ry="1.9" transform="rotate(60 9.8 19.5)" fill="#FFF" />
          <ellipse cx="22.2" cy="12.5" rx="3.2" ry="1.9" transform="rotate(60 22.2 12.5)" fill="#FFF" />
        </svg>
      );
    case 'SUI':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#3B82F6" />
          <path fill="#FFF" d="M16 6.8c2.6 3.7 6 7.5 6 11.4a6 6 0 1 1-12 0c0-3.9 3.4-7.7 6-11.4zm-3.2 11.4c0 1.9 1.4 3.4 3.2 3.4 1.3 0 2.4-.7 2.9-1.8-.8.2-1.8 0-2.5-.6-.8-.7-1.1-1.9-.6-3.1l.4-.9c-1.8 1-3.4 2.1-3.4 3z" />
        </svg>
      );
    case 'ZEC':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#F4B728" />
          <path fill="#111827" d="M14.7 6.5h2.6v2.7h4.3v2.3l-6.7 8.8h6.8v2.7h-4.4v2.6h-2.6v-2.6h-4.4v-2.3l6.8-8.8h-6.7V9.2h4.3V6.5z" />
        </svg>
      );
    case 'HYPE':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#0B1917" />
          <path fill="#4CE6B0" d="M9.5 11.5c2.2-2.6 5.2-1.3 6.5 1.1 1.3-2.4 4.3-3.7 6.5-1.1 2.1 2.5 1.8 6.6-.4 9-2.2 2.4-5.2 1.2-6.1-1.1-.9 2.3-3.9 3.5-6.1 1.1-2.2-2.4-2.5-6.5-.4-9z" />
        </svg>
      );
    case 'XAU':
    case 'PAXG':
    case 'GOLD':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <defs>
            <linearGradient id="gold_bar_svg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="55%" stopColor="#EAB308" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="16" fill="#1C1917" />
          <path fill="url(#gold_bar_svg)" d="M9.5 19.5l3-7h7l3 7h-13zm3.8-5l-1.5 3.4h8.4l-1.5-3.4h-5.4z" />
          <path fill="#FEF08A" d="M12.8 11.5l1.2-2.5h4l1.2 2.5h-6.4z" />
        </svg>
      );
    case 'NVDA':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#76B900" />
          <path fill="#FFF" d="M15.2 11.1c2.8 0 5.3 1.7 6.3 4.3-.9 2.5-3.3 4.2-6.1 4.2-2.1 0-4-1.1-5.1-2.9 1.2-1.8 2.8-2.9 4.9-2.9 1.3 0 2.5.7 3.2 1.8-.5.9-1.4 1.5-2.5 1.5-1.2 0-2.1-.8-2.3-1.9h-1.8c.2 2 1.9 3.6 4.1 3.6 2 0 3.7-1.2 4.4-3.1-.9-1.9-2.9-3.1-5.1-3.1-2.7 0-5.1 1.6-6.2 4.1 1.3 2.8 4.1 4.6 7.3 4.6 3.7 0 6.8-2.3 8.1-5.8-1.3-3.5-4.5-5.8-8.3-5.8-2.9 0-5.6 1.4-7.2 3.7l1.5 1c1.3-1.8 3.4-2.8 5.8-2.8z" />
        </svg>
      );
    case 'SOXL':
    case 'SOXS':
    case 'TSLA':
    case 'AAPL':
    case 'SPY':
    case 'QQQ':
    case 'AMD':
    case 'COIN':
    case 'MSTR': {
      const bg = PALETTE[base] || '#2563EB';
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
          <circle cx="16" cy="16" r="16" fill={bg} />
          <rect x="7" y="8" width="18" height="16" rx="4" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
          <path fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10 19l4-4 3 2.5 5-5.5" />
          <circle cx="22" cy="12" r="1.6" fill="#FFF" />
        </svg>
      );
    }
    default:
      return null;
  }
}

export function CoinIcon({ symbol, size = 28, className = '', imageUrl, showPair = false }: Props) {
  const { base, quote } = extractParts(symbol);
  const inlineSvg = renderInlineBrandSvg(base, size);

  const lower = base.toLowerCase();
  const sources: string[] = [];
  if (imageUrl && imageUrl.startsWith('http')) sources.push(imageUrl);
  if (!STOCK_AND_COMMODITY_SET.has(base)) {
    sources.push(
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${lower}.svg`,
      `https://assets.coincap.io/assets/icons/${lower}@2x.png`,
      `https://bin.bnbstatic.com/static/assets/logos/${base}.png`,
      `https://cdn.jsdelivr.net/gh/vadimmalykhin/binance-icons/crypto/${lower}.svg`
    );
  }

  const [srcIdx, setSrcIdx] = useState(0);
  useEffect(() => {
    setSrcIdx(0);
  }, [base, imageUrl]);

  const bg = PALETTE[base] ?? '#3B82F6';
  const showImg = !inlineSvg && srcIdx < sources.length;

  const primaryBadge = (
    <div
      className={`rounded-full shrink-0 inline-flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-white/15 ${className}`}
      style={{ width: size, height: size, background: inlineSvg ? 'transparent' : showImg ? 'rgba(255,255,255,0.06)' : bg }}
      aria-label={base}
      title={base}
    >
      {inlineSvg ? (
        inlineSvg
      ) : showImg ? (
        <img
          src={sources[srcIdx]}
          alt={base}
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover rounded-full"
          onError={() => setSrcIdx((i) => i + 1)}
        />
      ) : (
        <span
          className="font-display font-black text-white select-none leading-none tracking-tight"
          style={{ fontSize: Math.max(8, Math.round(size * (base.length >= 4 ? 0.28 : 0.34))) }}
        >
          {base.slice(0, 4)}
        </span>
      )}
    </div>
  );

  if (!showPair || !quote || quote === base) {
    return primaryBadge;
  }

  const qSize = Math.max(12, Math.round(size * 0.56));
  const quoteSvg = renderInlineBrandSvg(quote, qSize);
  return (
    <div className="relative inline-flex items-center shrink-0" style={{ width: size + Math.round(qSize * 0.45), height: size }}>
      {primaryBadge}
      <div
        className="rounded-full overflow-hidden ring-2 ring-[var(--panel)] -ms-2 z-10 inline-flex items-center justify-center"
        style={{ width: qSize, height: qSize, background: PALETTE[quote] || '#26A17B' }}
      >
        {quoteSvg || (
          <span className="text-[7px] font-black text-white">{quote.slice(0, 2)}</span>
        )}
      </div>
    </div>
  );
}
