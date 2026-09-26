import React, { useId } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Peer } from '../types';
import { labelClass, selectClass } from './ui';

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
  /** Suffix for the server running this panel, e.g. "(this server)". */
  currentLabel: string;
  /** Always stack the two pickers, for narrow columns. */
  stacked?: boolean;
}

const optionText = (p: Peer, currentLabel: string) =>
  `${p.hostname || p.ipv4} · ${p.ipv4}${p.is_current ? ` ${currentLabel}` : ''}`;

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
  currentLabel,
  stacked,
}) => {
  const id = useId();
  const row = !stacked;
  return (
    <div className={`grid grid-cols-1 items-end gap-2 ${row ? 'sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3' : ''}`}>
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor={`${id}-src`} className={labelClass}>
          {sourceLabel}
        </label>
        {/* Options are hostnames and IPs, so the control reads left to right and clips at its end. */}
        <select id={`${id}-src`} dir="ltr" value={source} onChange={(e) => onSourceChange(e.target.value)} className={`${selectClass} h-11 truncate`}>
          <option value="">{sourcePlaceholder}</option>
          {peers.map((p) => (
            <option key={p.ipv4} value={p.ipv4}>
              {optionText(p, currentLabel)}
            </option>
          ))}
        </select>
      </div>

      <div className={`flex justify-center -my-1 ${row ? 'sm:my-0' : ''}`}>
        <button
          type="button"
          onClick={onSwap}
          disabled={peers.length < 2 || !source || !target}
          title={swapLabel}
          aria-label={swapLabel}
          className={`flex items-center justify-center w-11 h-11 rounded-full ${row ? 'sm:rounded-xl' : ''} border border-card-border bg-card text-text-muted hover:text-primary hover:border-primary transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
        >
          <ArrowUpDown className={`w-4 h-4 ${row ? 'sm:rotate-90' : ''}`} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor={`${id}-dst`} className={labelClass}>
          {targetLabel}
        </label>
        <select
          id={`${id}-dst`}
          dir="ltr"
          value={peers.some((p) => p.ipv4 === target) ? target : ''}
          onChange={(e) => e.target.value && onTargetChange(e.target.value)}
          className={`${selectClass} h-11 truncate`}
        >
          <option value="">{targetPlaceholder}</option>
          {peers
            .filter((p) => p.ipv4 !== source)
            .map((p) => (
              <option key={p.ipv4} value={p.ipv4}>
                {optionText(p, currentLabel)}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
};
