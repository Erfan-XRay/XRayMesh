import React from 'react';
import { Check, Copy, MonitorSmartphone } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { UpdateRun } from '../../hooks/useNodeUpdates';
import { cardClass, SwitchField } from '../NodeConfig/FormControls';
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
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-primary-subtle text-primary" aria-hidden="true">
            <MonitorSmartphone className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="this-server-heading" className="text-base font-semibold text-text-main truncate" dir="auto">
                {peer.hostname || peer.ipv4}
              </h3>
              <span className="px-1.5 py-0.5 rounded-md bg-primary-subtle text-primary text-xs font-medium">{t('node_section_identity')}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="font-mono" dir="ltr">
                  {peer.ipv4}
                </span>
                <button
                  type="button"
                  onClick={() => onCopy(peer.ipv4)}
                  aria-label={copyLabel}
                  title={copyLabel}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md text-text-subtle hover:text-text-main hover:bg-surface cursor-pointer"
                >
                  {copiedKey === peer.ipv4 ? <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                </button>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-text-main" dir="ltr">
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
