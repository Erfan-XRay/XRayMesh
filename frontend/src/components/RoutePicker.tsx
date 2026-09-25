import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Peer } from '../types';

interface RoutePickerProps {
  peers: Peer[];
  source: string;
  target: string;
  onSourceChange: (ip: string) => void;
  onTargetChange: (ip: string) => void;
  onSwap: () => void;
  sourceLabel: string;
  targetLabel: string;
  sourcePlaceholder: string;
  targetPlaceholder: string;
  swapLabel: string;
}

const optionText = (p: Peer) => `${p.hostname || p.ipv4} · ${p.ipv4}${p.is_current ? ' ★' : ''}`;

const selectClass =
  'w-full min-w-0 h-11 px-3 bg-input border border-card-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary truncate';

/** Source → destination node picker shared by Ping and Speedtest. Stacks on phones. */
export const RoutePicker: React.FC<RoutePickerProps> = ({
  peers,
  source,
  target,
  onSourceChange,
  onTargetChange,
  onSwap,
  sourceLabel,
  targetLabel,
  sourcePlaceholder,
  targetPlaceholder,
  swapLabel,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-2 sm:gap-3">
    <label className="block min-w-0">
      <span className="block text-xs font-medium text-text-muted mb-1.5">{sourceLabel}</span>
      <select value={source} onChange={(e) => onSourceChange(e.target.value)} className={selectClass}>
        <option value="">{sourcePlaceholder}</option>
        {peers.map((p) => (
          <option key={p.ipv4} value={p.ipv4}>
            {optionText(p)}
          </option>
        ))}
      </select>
    </label>

    <div className="flex justify-center -my-1 sm:my-0">
      <button
        type="button"
        onClick={onSwap}
        disabled={peers.length < 2 || !source || !target}
        title={swapLabel}
        aria-label={swapLabel}
        className="w-11 h-11 sm:w-10 sm:h-11 flex items-center justify-center rounded-full sm:rounded-xl bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 active:scale-95 transition-all disabled:opacity-40"
      >
        <ArrowUpDown className="w-4 h-4 sm:-rotate-90" />
      </button>
    </div>

    <label className="block min-w-0">
      <span className="block text-xs font-medium text-text-muted mb-1.5">{targetLabel}</span>
      <select
        value={peers.some((p) => p.ipv4 === target) ? target : ''}
        onChange={(e) => e.target.value && onTargetChange(e.target.value)}
        className={selectClass}
      >
        <option value="">{targetPlaceholder}</option>
        {peers
          .filter((p) => p.ipv4 !== source)
          .map((p) => (
            <option key={p.ipv4} value={p.ipv4}>
              {optionText(p)}
            </option>
          ))}
      </select>
    </label>
  </div>
);
