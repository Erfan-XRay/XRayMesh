import React from 'react';
import { ArrowRight } from 'lucide-react';

interface FlowRouteProps {
  from: string;
  to: string;
  /** Streams particles while traffic is flowing. */
  active: boolean;
  /** Current throughput; faster traffic moves the particles faster. */
  mbps: number;
}

const NodeChip: React.FC<{ name: string; lit: boolean }> = ({ name, lit }) => (
  <span className="inline-flex items-center gap-1.5 min-w-0 max-w-[42%] h-8 px-3 rounded-full bg-surface border border-card-border text-sm">
    <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${lit ? 'bg-primary' : 'bg-text-subtle'}`} aria-hidden="true" />
    <bdi className="font-medium text-text-primary truncate">{name}</bdi>
  </span>
);

const DOTS = 5;

/** "source → target" with a live stream of packets between the two servers. */
export const FlowRoute: React.FC<FlowRouteProps> = ({ from, to, active, mbps }) => {
  const seconds = Math.min(2.4, Math.max(0.55, 2.4 - 0.45 * Math.log10(Math.max(mbps, 1))));
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <NodeChip name={from} lit={active} />
      {/* Mirrored in RTL so packets always travel from source to target. */}
      <div className="relative flex-1 min-w-[2.5rem] h-3 rtl:-scale-x-100" aria-hidden="true">
        <span
          className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full ${active ? 'bg-primary/25' : 'bg-border-subtle'}`}
        />
        {active ? (
          Array.from({ length: DOTS }, (_, i) => (
            <span
              key={i}
              className="flow-dot"
              style={{ '--flow-duration': `${seconds}s`, animationDelay: `${(-i * seconds) / DOTS}s` } as React.CSSProperties}
            />
          ))
        ) : (
          <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary" />
        )}
      </div>
      <NodeChip name={to} lit={active} />
    </div>
  );
};
