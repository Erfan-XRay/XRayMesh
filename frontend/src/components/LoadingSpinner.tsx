import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  sublabel?: React.ReactNode;
  /** Kept for API compatibility; the ring already carries the accent. */
  glow?: boolean;
  className?: string;
}

// Small sizes stay a plain ring; large ones use the animated mesh mark.
const RING_SIZES = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
};
const MESH_SIZES = { lg: 64, xl: 96 };

/** Corner peers in the order they fire, clockwise from the top left. */
const PEERS: [number, number][] = [
  [22, 22],
  [58, 22],
  [58, 58],
  [22, 58],
];

/**
 * The XRayMesh mark, alive: each peer sends a packet into the hub in turn, the hub fills and
 * answers with a ripple, and the orbit keeps turning so progress is visible at a glance.
 */
export const MeshLoader: React.FC<{ size?: number; className?: string }> = ({ size = 96, className = '' }) => (
  <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
    <span className="ml-glow absolute -inset-[35%] rounded-full" />
    <svg className="ml-svg relative w-full h-full" viewBox="0 0 80 80" fill="none">
      <circle className="ml-orbit-track" cx="40" cy="40" r="36" />
      <circle className="ml-orbit" cx="40" cy="40" r="36" pathLength={100} />
      <circle className="ml-orbit ml-orbit--slow" cx="40" cy="40" r="36" pathLength={100} />
      {PEERS.map(([x, y]) => (
        <path key={`t${x}${y}`} className="ml-track" d={`M${x} ${y} 40 40`} />
      ))}
      {PEERS.map(([x, y], i) => (
        <path key={`p${x}${y}`} className="ml-packet" d={`M${x} ${y} 40 40`} pathLength={100} style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
      {PEERS.map(([x, y], i) => (
        <circle key={`n${x}${y}`} className="ml-peer" cx={x} cy={y} r="5" style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
      <circle className="ml-ripple" cx="40" cy="40" r="7" />
      <circle className="ml-hub" cx="40" cy="40" r="7" />
      <circle className="ml-hub-core" cx="40" cy="40" r="3" />
    </svg>
  </span>
);

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', label, sublabel, className = '' }) => (
  <div role="status" aria-live="polite" className={`inline-flex flex-col items-center justify-center gap-5 ${className}`}>
    {size === 'lg' || size === 'xl' ? (
      <MeshLoader size={MESH_SIZES[size]} />
    ) : (
      <span aria-hidden="true" className={`${RING_SIZES[size]} rounded-full border-primary/20 border-t-primary animate-spin-smooth`} />
    )}
    {(label || sublabel) && (
      <div className="text-center animate-fade-in">
        {label && <p className="text-sm font-semibold text-text-primary">{label}</p>}
        {sublabel && <p className="mt-1 max-w-xs text-xs text-text-muted leading-relaxed">{sublabel}</p>}      </div>
    )}
  </div>
);

/** Three pulsing dots for inline "working" states. */
export const LoadingDots: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
    {[0, 150, 300].map((delay) => (
      <span key={delay} className="w-1 h-1 rounded-full bg-current animate-pulse-dot" style={{ animationDelay: `${delay}ms` }} />
    ))}
  </span>
);
