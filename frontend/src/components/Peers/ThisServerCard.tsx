import React from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { UpdateRun } from '../../hooks/useNodeUpdates';
import { SwitchField } from '../NodeConfig/FormControls';
import { cardClass, CopyButton, Pill } from '../ui';
import { channelOf } from './peerDisplay';
import { ChannelButton } from './PeerRow';
import { UpdateCell, UpdateFailure } from './UpdateStatus';

interface ThisServerCardProps {
  peer: Peer;
  run?: UpdateRun;
  channelBusy: boolean;
  onUpdate: (peer: Peer) => void;
  onDismissUpdate: (ip: string) => void;
  onChangeChannel: (peer: Peer) => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
}

/** The server whose panel is open: its version, update and the beta opt-in live here. */
export const ThisServerCard: React.FC<ThisServerCardProps> = ({
  peer,
  run,
  channelBusy,
  onUpdate,
  onDismissUpdate,
  onChangeChannel,
  onCopy,
  copiedKey,
  t,
}) => {
  const channel = channelOf(peer);
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
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="inline-flex items-center gap-0.5">
                <span className="font-mono" dir="ltr">
                  {peer.ipv4}
                </span>
                <CopyButton value={peer.ipv4} copied={copiedKey === peer.ipv4} onCopy={onCopy} label={copyLabel} className="w-6 h-6" />
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-text-secondary" dir="ltr">
                  {peer.xraymesh_version}
                </span>
                <ChannelButton peer={peer} onClick={() => onChangeChannel(peer)} t={t} />
              </span>
            </div>
            <p className="mt-1 text-xs text-text-subtle">{t('this_server_desc')}</p>
          </div>
        </div>
        <div className="shrink-0">
          <UpdateCell peer={peer} run={run} onUpdate={onUpdate} onDismiss={onDismissUpdate} t={t} />
        </div>
      </div>

      {run?.phase === 'failed' && (
        <div className="mt-4">
          <UpdateFailure peer={peer} run={run} onDismiss={onDismissUpdate} onCopy={onCopy} copiedKey={copiedKey} t={t} />
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-card-border">
        <SwitchField
          label={t('beta_switch_label')}
          hint={t('beta_switch_hint')}
          checked={channel === 'beta'}
          disabled={channelBusy}
          onChange={() => onChangeChannel(peer)}
        />
      </div>
    </section>
  );
};
