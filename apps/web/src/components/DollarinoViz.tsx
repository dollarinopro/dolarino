import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

/* ---------------- Animated Number ---------------- */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (Math.abs(diff) < 0.001) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const duration = 380;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + diff * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{format(display)}</>;
}

/* ---------------- Live Pulse Dot ---------------- */
export function LiveDot({ color = '#16e664', size = 8 }: { color?: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span
        className="absolute inset-0 rounded-full opacity-60 animate-ping"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative rounded-full"
        style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
    </span>
  );
}

/* ---------------- Mini Sparkline ---------------- */
export function Sparkline({
  values,
  color = '#16e664',
  height = 40,
  fill = true,
  endDot = false,
}: {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  endDot?: boolean;
}) {
  const gid = useId().replace(/:/g, '');
  const src = values.length >= 2 ? values : [1, 1.01];
  const w = 160;
  const h = height;
  const min = Math.min(...src);
  const max = Math.max(...src);
  const span = max - min || 1;
  const pts = src.map((v, i) => ({
    x: (i / (src.length - 1)) * w,
    y: 4 + ((max - v) / span) * (h - 8),
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1]!;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
      {fill && (
        <defs>
          <linearGradient id={`spk-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={area} fill={`url(#spk-${gid})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {endDot && <circle cx={last.x} cy={last.y} r="3.2" fill={color} />}
    </svg>
  );
}

/* ---------------- Interactive Smooth Area Chart ---------------- */
export function AreaChart({
  values,
  labels,
  color = '#3b7bff',
  height = 200,
  formatValue = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const gid = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const src = values.length >= 2 ? values : [0, 0];
  const w = 560;
  const h = height;

  const { coords, line, area } = useMemo(() => {
    const min = Math.min(...src);
    const max = Math.max(...src);
    const span = max - min || 1;
    const pts = src.map((v, i) => ({
      x: 8 + (i / (src.length - 1)) * (w - 16),
      y: 16 + ((max - v) / span) * (h - 32),
      val: v,
    }));
    const l = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const a = `${l} L ${pts[pts.length - 1]!.x.toFixed(1)} ${h} L ${pts[0]!.x.toFixed(1)} ${h} Z`;
    return { coords: pts, line: l, area: a };
  }, [src, h]);

  const active = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full overflow-visible"
        style={{ height }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={8}
            y1={h * p}
            x2={w - 8}
            y2={h * p}
            stroke="currentColor"
            strokeOpacity="0.07"
            strokeDasharray="4 4"
          />
        ))}

        <path d={area} fill={`url(#area-${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />

        {active && (
          <>
            <line
              x1={active.x}
              y1={8}
              x2={active.x}
              y2={h - 6}
              stroke={color}
              strokeOpacity="0.45"
              strokeDasharray="3 3"
            />
            <circle cx={active.x} cy={active.y} r="5.5" fill={color} stroke="#070d1e" strokeWidth="2" />
          </>
        )}

        {coords.map((pt, idx) => (
          <rect
            key={idx}
            x={pt.x - (w / coords.length) / 2}
            y={0}
            width={w / coords.length}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(idx)}
          />
        ))}
      </svg>

      {active && hoverIdx !== null && (
        <div
          dir="ltr"
          className="pointer-events-none absolute top-2 right-2 rounded-xl border border-white/15 bg-[#081024]/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg backdrop-blur-md font-mono-num"
        >
          {labels?.[hoverIdx] ? `${labels[hoverIdx]} · ` : ''}
          {formatValue(active.val)}
        </div>
      )}
    </div>
  );
}

/* ---------------- Progress Ring Gauge ---------------- */
export function ProgressRing({
  value,
  size = 76,
  stroke = 7,
  color = '#16e664',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.11"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)', filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {children}
      </div>
    </div>
  );
}

/* ---------------- Consensus Semi-Gauge (from ui_1) ---------------- */
export function ConsensusGauge({
  value,
  longLabel = 'LONG',
  shortLabel = 'SHORT',
}: {
  value: number; // 0..100 (50 neutral, >55 bullish, <45 bearish)
  longLabel?: string;
  shortLabel?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const v = Math.max(0, Math.min(100, value));
  const angle = -90 + (v / 100) * 180;
  const label = v >= 58 ? longLabel : v <= 42 ? shortLabel : 'NEUTRAL';
  const labelColor = v >= 58 ? '#16e664' : v <= 42 ? '#ff5b76' : '#e8c15a';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 112" className="w-full max-w-[220px] overflow-visible">
        <defs>
          <linearGradient id={`cg-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff5b76" />
            <stop offset="50%" stopColor="#e8c15a" />
            <stop offset="100%" stopColor="#16e664" />
          </linearGradient>
        </defs>
        <path
          d="M 20 98 A 80 80 0 0 1 180 98"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 20 98 A 80 80 0 0 1 180 98"
          fill="none"
          stroke={`url(#cg-${gid})`}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <g transform={`translate(100,98) rotate(${angle})`} style={{ transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}>
          <line x1="0" y1="0" x2="0" y2="-62" stroke={labelColor} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="0" cy="0" r="6" fill={labelColor} />
        </g>
      </svg>
      <div className="-mt-2 flex w-full items-center justify-between text-[11px] font-bold">
        <span className="text-loss">{shortLabel}</span>
        <span dir="ltr" className="font-mono-num text-sm font-black" style={{ color: labelColor }}>
          {Math.round(v)}% · {label}
        </span>
        <span className="text-signal">{longLabel}</span>
      </div>
    </div>
  );
}

/* ---------------- Allocation Donut (from ui_4) ---------------- */
export function DonutChart({
  segments,
  size = 152,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + Math.max(0, x.value), 0));
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth={stroke} />
      {segments.map((seg) => {
        const len = (Math.max(0, seg.value) / total) * c;
        const dash = `${Math.max(0, len - 3)} ${c}`;
        const dashOffset = -acc;
        acc += len;
        return (
          <circle
            key={seg.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={dash}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        );
      })}
    </svg>
  );
}

/* ---------------- Interactive Profit Bar Chart (from ui_2/ui_4) ---------------- */
export function ProfitBars({
  data,
  height = 170,
  format = (v: number) => `$${v.toFixed(0)}`,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  format?: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <div className="flex items-end gap-2 pt-6" style={{ height }}>
      {data.map((item, i) => {
        const pct = Math.max(10, Math.round((Math.abs(item.value) / maxAbs) * 100));
        const pos = item.value >= 0;
        const isHi = hovered === i;
        return (
          <div
            key={`${item.label}-${i}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="relative flex-1 flex flex-col items-center h-full justify-end group"
          >
            {isHi && (
              <div
                dir="ltr"
                className="absolute -top-2 z-10 rounded-lg bg-[#091229] text-white border border-white/15 px-2 py-0.5 text-[10px] font-mono-num font-bold whitespace-nowrap shadow"
              >
                {item.value >= 0 ? '+' : ''}
                {format(item.value)}
              </div>
            )}
            <div className="w-full flex items-end justify-center flex-1">
              <div
                className="w-full max-w-[34px] rounded-t-xl transition-all duration-300"
                style={{
                  height: `${pct}%`,
                  background: pos
                    ? isHi
                      ? 'linear-gradient(180deg, #d9f75c, #16e664)'
                      : 'linear-gradient(180deg, #3b7bff, rgba(59,123,255,0.42))'
                    : 'linear-gradient(180deg, #ff5b76, rgba(255,91,118,0.35))',
                  boxShadow: isHi ? '0 0 18px rgba(59,123,255,0.45)' : undefined,
                }}
              />
            </div>
            <span className="mt-2 text-[10px] font-bold text-dim truncate max-w-full">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
