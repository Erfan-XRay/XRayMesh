import React from 'react';
import { MonitorSmartphone, TimerReset } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { UpdateRun } from '../../hooks/useNodeUpdates';
import { btnSecondarySm, cardClass, CopyButton, Pill } from '../ui';
import { PublicIp } from './PublicIp';
import { RestartBadge } from './RestartBadge';
import { UpdateCell, UpdateFailure } from './UpdateStatus';

interface ThisServerCardProps {
  peer: Peer;
  run?: UpdateRun;
  onUpdate: (peer: Peer) => void;
  onDismissUpdate: (ip: string) => void;
  onSchedule: (peer: Peer) => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
}

/** The server whose panel is open: its version and update live here. */
export const ThisServerCard: React.FC<ThisServerCardProps> = ({
  peer,
  run,
  onUpdate,
  onDismissUpdate,
  onSchedule,
  onCopy,
  copiedKey,
  t,
}) => {
  const copyLabel = formatText(t('peer_copy_ip'), { ip: peer.ipv4 });
  return (
    <section aria-labelledby="this-server-heading" className={`${cardClass} p-4 sm:p-5`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-primary-subtle text-primary" aria-hidden="true">
            <MonitorSmartphone className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="this-server-heading" className="text-base font-semibold text-text-primary truncate">
                <bdi>{peer.hostname || peer.ipv4}</bdi>
              </h2>
              <Pill tone="primary">{t('node_section_identity')}</Pill>
              <RestartBadge peer={peer} t={t} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="inline-flex items-center gap-0.5">
                <span className="font-mono" dir="ltr">
                  {peer.ipv4}
                </span>
                <CopyButton value={peer.ipv4} copied={copiedKey === peer.ipv4} onCopy={onCopy} label={copyLabel} className="w-6 h-6" />
              </span>
              <span className="font-mono text-text-secondary" dir="ltr">
                {peer.xraymesh_version}
              </span>
            </div>
            <div className="mt-0.5 text-xs">
              <PublicIp peer={peer} onCopy={onCopy} copiedKey={copiedKey} t={t} />
            </div>
            <p className="mt-1 text-xs text-text-subtle">{t('this_server_desc')}</p>
          </div>
        </div>
        <div className="shrink-0 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onSchedule(peer)} className={btnSecondarySm}>
            <TimerReset className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('restart_btn')}</span>
          </button>
          <UpdateCell peer={peer} run={run} onUpdate={onUpdate} onDismiss={onDismissUpdate} t={t} />
        </div>
      </div>

      {run?.phase === 'failed' && (
        <div className="mt-4">
          <UpdateFailure peer={peer} run={run} onDismiss={onDismissUpdate} onCopy={onCopy} copiedKey={copiedKey} t={t} />
        </div>
      )}
    </section>
  );
};
