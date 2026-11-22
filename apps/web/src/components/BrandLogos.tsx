import React from 'react';

export function ExchangeLogo({
  provider,
  size = 28,
  className = '',
}: {
  provider: string;
  size?: number;
  className?: string;
}) {
  const p = provider.toLowerCase();
  if (p === 'toobit') {
    return (
      <svg viewBox="0 0 36 36" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <defs>
          <linearGradient id="exToobit" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1652F0" />
            <stop offset="100%" stopColor="#091E5A" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="11" fill="url(#exToobit)" />
        <path d="M9 11.5h18v4.2h-6.8V26h-4.4V15.7H9v-4.2Z" fill="#FFFFFF" />
        <circle cx="25.5" cy="23.5" r="3" fill="#10E066" />
      </svg>
    );
  }
  if (p === 'bitunix') {
    return (
      <svg viewBox="0 0 36 36" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <defs>
          <linearGradient id="exBitunix" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#141824" />
            <stop offset="100%" stopColor="#080B12" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="11" fill="url(#exBitunix)" stroke="#232B3E" strokeWidth="1" />
        <path d="M11 10l6.2 8-6.2 8h4.5l4-5.2 4 5.2H28l-6.2-8L28 10h-4.5l-4 5.2-4-5.2H11Z" fill="#A3E635" />
      </svg>
    );
  }
  if (p === 'kcex') {
    return (
      <svg viewBox="0 0 36 36" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <defs>
          <linearGradient id="exKcex" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="11" fill="url(#exKcex)" />
        <path d="M11 10v16h3.6v-6.2l5.8 6.2H25l-6.8-7.4L24.8 10h-4.6l-5.6 6V10H11Z" fill="#FFFFFF" />
      </svg>
    );
  }
  // Paper / Simulator
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="exPaper" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="11" fill="url(#exPaper)" />
      <rect x="9.5" y="18" width="4" height="8" rx="1.5" fill="#6EE7B7" />
      <rect x="16" y="13" width="4" height="13" rx="1.5" fill="#FFFFFF" />
      <rect x="22.5" y="9.5" width="4" height="16.5" rx="1.5" fill="#6EE7B7" />
    </svg>
  );
}

export function WalletLogo({
  wallet,
  size = 24,
  className = '',
}: {
  wallet: 'trustwallet' | 'evm' | 'solana' | 'ton' | 'tron';
  size?: number;
  className?: string;
}) {
  if (wallet === 'trustwallet') {
    return (
      <svg viewBox="0 0 36 36" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <defs>
          <linearGradient id="twShield" x1="6" y1="4" x2="30" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0500FF" />
            <stop offset="55%" stopColor="#1652F0" />
            <stop offset="100%" stopColor="#00E676" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="11" fill="#F0F5FF" />
        <path
          d="M18 6.5c3.8 3.2 8.2 3.3 9.5 3.3 0 9.6-1.2 15.6-9.5 19.7-8.3-4.1-9.5-10.1-9.5-19.7 1.3 0 5.7-.1 9.5-3.3Z"
          fill="url(#twShield)"
        />
      </svg>
    );
  }
  return <ChainLogo chain={wallet === 'evm' ? 'ethereum' : wallet} size={size} className={className} />;
}

const CHAIN_BADGES: Record<string, { bg: string; fg: string; label: string }> = {
  ethereum: { bg: '#627EEA', fg: '#FFFFFF', label: 'ETH' },
  bsc: { bg: '#F3BA2F', fg: '#0B1220', label: 'BSC' },
  solana: { bg: '#9945FF', fg: '#FFFFFF', label: 'SOL' },
  ton: { bg: '#0098EA', fg: '#FFFFFF', label: 'TON' },
  tron: { bg: '#EB0029', fg: '#FFFFFF', label: 'TRX' },
  base: { bg: '#0052FF', fg: '#FFFFFF', label: 'BASE' },
  arbitrum: { bg: '#28A0F0', fg: '#FFFFFF', label: 'ARB' },
  polygon: { bg: '#8247E5', fg: '#FFFFFF', label: 'POL' },
  optimism: { bg: '#FF0420', fg: '#FFFFFF', label: 'OP' },
  avalanche: { bg: '#E84142', fg: '#FFFFFF', label: 'AVAX' },
  sui: { bg: '#4DA2FF', fg: '#FFFFFF', label: 'SUI' },
  aptos: { bg: '#111827', fg: '#FFFFFF', label: 'APT' },
  linea: { bg: '#121212', fg: '#61DFFF', label: 'LNA' },
  blast: { bg: '#FCFC03', fg: '#111827', label: 'BLST' },
  pulsechain: { bg: '#9B00FF', fg: '#FFFFFF', label: 'PLS' },
  cronos: { bg: '#002D74', fg: '#FFFFFF', label: 'CRO' },
};

export function ChainLogo({
  chain,
  size = 22,
  className = '',
}: {
  chain: string;
  size?: number;
  className?: string;
}) {
  const c = chain.toLowerCase();
  if (c === 'ethereum' || c === 'eth') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <path fill="#FFF" fillOpacity=".65" d="M16 5v8.2l6.8 3z" />
        <path fill="#FFF" d="M16 5l-6.8 11.2 6.8-3z" />
        <path fill="#FFF" fillOpacity=".65" d="M16 21.3v5.7l6.8-9.5z" />
        <path fill="#FFF" d="M16 27v-5.7l-6.8-3.8z" />
      </svg>
    );
  }
  if (c === 'bsc' || c === 'bnb') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
        <path fill="#111827" d="M16 8l3.1 3.1-5.2 5.2L10.8 13 16 8zm5.3 5.3L24.4 16l-3.1 3.1-3.1-3.1 3.1-2.7zm-10.6 0L13.8 16l-3.1 3.1L7.6 16l3.1-2.7zM16 17.5l3.1 3.1L16 23.7l-3.1-3.1 3.1-3.1z" />
      </svg>
    );
  }
  if (c === 'solana' || c === 'sol') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <defs>
          <linearGradient id="solGrad" x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9945FF" />
            <stop offset="100%" stopColor="#14F195" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="16" fill="#0B1120" />
        <path fill="url(#solGrad)" d="M9.5 20.5h11.3l2.2 2.4H11.7l-2.2-2.4zm0-5.7h13l-2.2 2.4H7.3l2.2-2.4zm2.2-5.7H23l-2.2 2.4H9.5l2.2-2.4z" />
      </svg>
    );
  }
  if (c === 'ton') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="#0098EA" />
        <path fill="#FFF" d="M16 24.4l-6.4-10.7c-.5-.8.1-1.8 1-1.8h10.8c.9 0 1.5 1 1 1.8L16 24.4zm-.7-10.6h-3.4l3.4 5.7v-5.7zm1.4 0v5.7l3.4-5.7h-3.4z" />
      </svg>
    );
  }
  if (c === 'tron' || c === 'trx') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="#EB0029" />
        <path fill="#FFF" d="M9 9.5l14.5 2.7-6.7 12.1L9 9.5zm2.4 2.1l5.2 9.4 4.2-7.6-9.4-1.8z" />
      </svg>
    );
  }
  const meta = CHAIN_BADGES[c] || {
    bg: '#1652F0',
    fg: '#FFFFFF',
    label: c.slice(0, 3).toUpperCase() || 'NET',
  };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-black shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: meta.bg,
        color: meta.fg,
        fontSize: Math.max(8, Math.round(size * 0.34)),
        lineHeight: 1,
      }}
      aria-hidden="true"
    >
      {meta.label.slice(0, 3)}
    </span>
  );
}
