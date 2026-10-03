import React from 'react';
import { TimerReset } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { Pill } from '../ui';
import { formatInterval } from './restartDisplay';

/** Shows that a server restarts itself on a schedule; nothing when it does not. */
export const RestartBadge: React.FC<{ peer: Peer; t: Translate; className?: string }> = ({ peer, t, className = '' }) => {
  const schedule = peer.auto_restart;
  if (!schedule?.enabled) return null;
  return (
    <Pill tone="info" icon={<TimerReset className="w-3 h-3" aria-hidden="true" />} className={className}>
      {formatText(t('restart_pill'), { interval: formatInterval(schedule.interval_minutes, t) })}
    </Pill>
  );
};
