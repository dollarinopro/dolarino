export function DollarinoBrandMark({
  size = 44,
  glow = false,
  className = '',
}: {
  size?: number;
  glow?: boolean;
  className?: string;
}) {
  return (
    <img
      src="/logo.png"
      alt="Dollarino"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        filter: glow ? 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.16))' : undefined,
      }}
      className={`object-contain shrink-0 select-none ${className}`}
    />
  );
}

export function ModeGraphicAI() {
  return (
    <svg viewBox="0 0 120 76" className="w-full h-[76px]" fill="none">
      <defs>
        <linearGradient id="aiGrad1" x1="0" y1="0" x2="120" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0C44C8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#00B4FF" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="aiOrb" x1="36" y1="14" x2="84" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1464F6" />
          <stop offset="100%" stopColor="#00B4FF" />
        </linearGradient>
      </defs>
      <rect width="120" height="76" rx="16" fill="url(#aiGrad1)" />
      <circle cx="60" cy="38" r="26" stroke="#1464F6" strokeOpacity="0.28" strokeDasharray="4 4" />
      <circle cx="60" cy="38" r="18" fill="url(#aiOrb)" />
      {/* AI Neural Spark */}
      <path
        d="M60 25L63.2 34.8L73 38L63.2 41.2L60 51L56.8 41.2L47 38L56.8 34.8L60 25Z"
        fill="#FFFFFF"
      />
      {/* Orbiting nodes */}
      <circle cx="30" cy="24" r="5" fill="#10D856" />
      <circle cx="92" cy="26" r="4" fill="#FF8A00" />
      <circle cx="88" cy="56" r="5" fill="#00B4FF" />
    </svg>
  );
}

export function ModeGraphicCodex() {
  return (
    <svg viewBox="0 0 120 76" className="w-full h-[76px]" fill="none">
      <defs>
        <linearGradient id="cdxGrad" x1="0" y1="0" x2="120" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#059669" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#10D856" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <rect width="120" height="76" rx="16" fill="url(#cdxGrad)" />
      {/* 3 Ascending Green Candles matching the Dollarino Logo */}
      <line x1="34" y1="34" x2="34" y2="64" stroke="#10D856" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="27" y="42" width="14" height="16" rx="3" fill="#10D856" />
      <line x1="60" y1="22" x2="60" y2="58" stroke="#10D856" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="53" y="30" width="14" height="21" rx="3" fill="#10D856" />
      <line x1="86" y1="12" x2="86" y2="52" stroke="#16E664" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="79" y="19" width="14" height="25" rx="3" fill="#16E664" />
      {/* Trend curve */}
      <path d="M22 58C42 52 58 34 98 16" stroke="#0C44C8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" />
    </svg>
  );
}

export function ModeGraphicTelegram() {
  return (
    <svg viewBox="0 0 120 76" className="w-full h-[76px]" fill="none">
      <defs>
        <linearGradient id="tgGrad" x1="0" y1="0" x2="120" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00B4FF" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FF8A00" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect width="120" height="76" rx="16" fill="url(#tgGrad)" />
      {/* Signal Wave Rings */}
      <circle cx="42" cy="38" r="24" stroke="#00B4FF" strokeOpacity="0.25" strokeWidth="1.5" />
      <circle cx="42" cy="38" r="16" fill="#00B4FF" />
      {/* Paper Plane */}
      <path d="M34 38.5L49 31L45.5 46L41 41.5L38 44V39.5L46 33.5L36.5 39L34 38.5Z" fill="#FFFFFF" />
      {/* Signal Execution Card */}
      <rect x="66" y="20" width="38" height="36" rx="8" fill="#0C44C8" />
      <rect x="72" y="27" width="18" height="4" rx="2" fill="#16E664" />
      <rect x="72" y="35" width="26" height="3" rx="1.5" fill="#FFFFFF" fillOpacity="0.7" />
      <rect x="72" y="42" width="20" height="3" rx="1.5" fill="#FF8A00" />
    </svg>
  );
}
