import React, { useId } from 'react';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';

export type GaugePhase = 'idle' | 'connecting' | 'running' | 'done';

interface SpeedGaugeProps {
  /** Latest throughput in Mbps. */
  value: number;
  /** Highest throughput seen in this test; picks the dial's range. */
  peak: number;
  phase: GaugePhase;
  /** Localizes digits of the dial labels. */
  formatTick: (text: string) => string;
  children?: React.ReactNode;
}

// Non-linear dials, like a car speedometer: fine resolution at the low end.
const SCALES = [
  [0, 5, 10, 50, 100, 250, 500, 750, 1000],
  [0, 50, 100, 500, 1000, 2500, 5000, 7500, 10000],
  [0, 500, 1000, 5000, 10000, 25000, 50000, 75000, 100000],
];

const CX = 120;
const CY = 118;
const R = 96;
const START = 135; // degrees, clockwise from +x (SVG y points down)
const SWEEP = 270;

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
};

const arcPath = (r: number) => {
  const [x0, y0] = polar(START, r);
  const [x1, y1] = polar(START + SWEEP, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1}`;
};

/** 0‒1 position of value on a piecewise-linear dial. */
const fraction = (scale: number[], v: number) => {
  if (v <= 0) return 0;
  for (let i = 1; i < scale.length; i++) {
    if (v <= scale[i]) return (i - 1 + (v - scale[i - 1]) / (scale[i] - scale[i - 1])) / (scale.length - 1);
  }
  return 1;
};

const tickLabel = (v: number) => (v >= 1000 ? `${v / 1000}G` : String(v));

export const SpeedGauge: React.FC<SpeedGaugeProps> = ({ value, peak, phase, formatTick, children }) => {
  const uid = useId().replace(/:/g, '');
  const scale = SCALES.find((s) => s[s.length - 1] >= Math.max(peak, value)) ?? SCALES[SCALES.length - 1];
  const target = fraction(scale, value);
  const pos = useAnimatedNumber(target, { tau: 380, wobble: phase === 'running' && value > 0 ? 0.012 : 0 });
  const p = Math.max(0, Math.min(1, pos));
  const needleAngle = START + SWEEP * p;
  const peakAngle = START + SWEEP * fraction(scale, peak);
  const active = phase === 'running' || phase === 'done';
  const segments = scale.length - 1;

  return (
    <div className="w-full max-w-[19rem] mx-auto">
      <svg viewBox="0 0 240 196" className="block w-full h-auto overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-arc`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--primary-rgb))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="rgb(var(--primary-rgb))" stopOpacity={1} />
          </linearGradient>
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <radialGradient id={`${uid}-halo`}>
            <stop offset="0%" stopColor="rgb(var(--primary-rgb))" stopOpacity={0.18} />
            <stop offset="100%" stopColor="rgb(var(--primary-rgb))" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Soft halo that brightens with speed */}
        <circle cx={CX} cy={CY} r={R + 6} fill={`url(#${uid}-halo)`} style={{ opacity: active ? 0.4 + p * 0.6 : 0.25, transition: 'opacity 400ms' }} />

        {/* Track */}
        <path d={arcPath(R)} fill="none" stroke="var(--border-subtle)" strokeWidth={12} strokeLinecap="round" />

        {/* Progress with glow */}
        {p > 0.001 && (
          <>
            <path
              d={arcPath(R)}
              fill="none"
              stroke="rgb(var(--primary-rgb))"
              strokeWidth={12}
              strokeLinecap="round"
              pathLength={1000}
              strokeDasharray={`${p * 1000} 1000`}
              filter={`url(#${uid}-glow)`}
              opacity={0.55}
            />
            <path
              d={arcPath(R)}
              fill="none"
              stroke={`url(#${uid}-arc)`}
              strokeWidth={12}
              strokeLinecap="round"
              pathLength={1000}
              strokeDasharray={`${p * 1000} 1000`}
            />
          </>
        )}

        {/* Scanning arc while connecting */}
        {phase === 'connecting' && (
          <path className="gauge-scan" d={arcPath(R)} fill="none" stroke="rgb(var(--primary-rgb))" strokeWidth={12} strokeLinecap="round" pathLength={1000} strokeDasharray="90 1000" opacity={0.7} />
        )}

        {/* Ticks */}
        {Array.from({ length: segments * 4 + 1 }, (_, i) => {
          const major = i % 4 === 0;
          const angle = START + (SWEEP * i) / (segments * 4);
          const [x0, y0] = polar(angle, R - 12);
          const [x1, y1] = polar(angle, R - (major ? 20 : 16));
          const lit = active && i / (segments * 4) <= p + 0.001;
          return (
            <line
              key={i}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={lit ? 'rgb(var(--primary-rgb))' : 'var(--text-subtle)'}
              strokeOpacity={major ? 0.9 : 0.45}
              strokeWidth={major ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}
        {scale.map((v, i) => {
          const [x, y] = polar(START + (SWEEP * i) / segments, R - 31);
          return (
            <text
              key={v}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
            >
              {formatTick(tickLabel(v))}
            </text>
          );
        })}

        {/* Peak marker */}
        {active && peak > 0 && (
          <g transform={`rotate(${peakAngle} ${CX} ${CY})`} style={{ transition: 'transform 400ms' }}>
            <path d={`M ${CX + R + 9} ${CY} l 6 -4 v 8 z`} fill="rgb(var(--warning-rgb))" />
          </g>
        )}

        {/* Needle */}
        <g transform={`rotate(${needleAngle} ${CX} ${CY})`} opacity={phase === 'idle' ? 0.45 : 1}>
          <path d={`M ${CX - 10} ${CY - 2.2} L ${CX + R - 22} ${CY - 0.6} L ${CX + R - 22} ${CY + 0.6} L ${CX - 10} ${CY + 2.2} Z`} fill="var(--text-primary)" />
          <path d={`M ${CX + R - 40} ${CY - 1.1} L ${CX + R - 22} ${CY - 0.6} L ${CX + R - 22} ${CY + 0.6} L ${CX + R - 40} ${CY + 1.1} Z`} fill="rgb(var(--primary-rgb))" />
        </g>
        <circle cx={CX} cy={CY} r={8} fill="var(--bg-card)" stroke="var(--text-primary)" strokeWidth={2.5} />
        <circle cx={CX} cy={CY} r={2.5} fill="rgb(var(--primary-rgb))" />
      </svg>

      {/* Readout below the dial, so long values never run into the arc or its labels */}
      <div className="mt-1 flex flex-col items-center text-center">{children}</div>
    </div>
  );
};
