import React from 'react';
import { Activity, ArrowDown, ArrowLeftRight, ArrowUp, Signal, SignalHigh, SignalLow, SignalMedium, Waypoints, Zap } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { formatNumber, localizeDigits } from '../../i18n/format';
import { UpdateRun } from '../../hooks/useNodeUpdates';
import { btnGhostSm, CopyButton, iconBtn } from '../ui';
import { CHANNEL_TEXT, channelOf, formatProtocol, isLegacyPeer, LATENCY_TEXT, latencyOf, versionLabel } from './peerDisplay';
import { UpdateCell, UpdateFailure } from './UpdateStatus';

/** Shared column template so the header and every row line up on large screens. */
export const PEER_GRID =
  'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.7fr)_auto] lg:items-center lg:gap-4';

const LATENCY_ICON = { good: SignalHigh, fair: SignalMedium, poor: SignalLow, none: Signal };

interface PeerRowProps {
  peer: Peer;
  run?: UpdateRun;
  onUpdate: (peer: Peer) => void;
  onDismissUpdate: (ip: string) => void;
  onChangeChannel: (peer: Peer) => void;
  onPing: (ip: string) => void;
  onSpeedtest: (ip: string) => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
}

export const ChannelButton: React.FC<{ peer: Peer; onClick: () => void; t: Translate }> = ({ peer, onClick, t }) => {
  if (!peer.channel && !peer.xraymesh_branch) return null; // unreachable: channel unknown
  const channel = channelOf(peer);
  const label = t(CHANNEL_TEXT[channel]);
  const base = 'inline-flex items-center h-6 px-2 rounded-md border text-xs font-medium';
  if (isLegacyPeer(peer)) {
    // Old servers cannot switch channel remotely; a button would only lead to an error.
    return <span className={`${base} border-card-border text-text-subtle`}>{label}</span>;
  }
  const action = formatText(t('channel_change_label'), { host: peer.hostname || peer.ipv4, channel: label });
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={action}
      title={action}
      className={`${base} transition-colors cursor-pointer ${
        channel === 'beta'
          ? 'border-warning-border bg-warning-subtle text-warning hover:bg-warning/20'
          : 'border-card-border bg-surface text-text-muted hover:text-text-primary hover:border-border-strong'
      }`}
    >
      {label}
    </button>
  );
};

const Traffic: React.FC<{ peer: Peer; t: Translate; className?: string }> = ({ peer, t, className = '' }) => (
  <span className={`inline-flex items-center gap-3 font-mono text-xs text-text-muted tabular-nums ${className}`}>
    <span className="inline-flex items-center gap-1" title={t('peer_traffic_down')}>
      <ArrowDown className="w-3 h-3 text-success" aria-label={t('peer_traffic_down')} />
      {localizeDigits(peer.rx_bytes || '0 B', t)}
    </span>
    <span className="inline-flex items-center gap-1" title={t('peer_traffic_up')}>
      <ArrowUp className="w-3 h-3 text-info" aria-label={t('peer_traffic_up')} />
      {localizeDigits(peer.tx_bytes || '0 B', t)}
    </span>
  </span>
);

export const PeerRow: React.FC<PeerRowProps> = ({
  peer,
  run,
  onUpdate,
  onDismissUpdate,
  onChangeChannel,
  onPing,
  onSpeedtest,
  onCopy,
  copiedKey,
  t,
}) => {
  const relayed = peer.connection === 'relay';
  const latency = latencyOf(peer);
  const LatencyIcon = LATENCY_ICON[latency.tone];
  const copyLabel = formatText(t('peer_copy_ip'), { ip: peer.ipv4 });
  const connection = (
    <span className={`inline-flex items-center gap-1.5 ${relayed ? 'text-warning' : 'text-text-primary'}`}>
      {relayed ? (
        <Waypoints className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-success" aria-hidden="true" />
      )}
      {t(relayed ? 'peer_conn_relay' : 'peer_conn_direct')}
    </span>
  );

  return (
    <li className="px-4 py-3.5 sm:px-5 transition-colors hover:bg-hover">
      {/* Phones and tablets: three dense lines instead of a stacked table. */}
      <div className="lg:hidden space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">
              <bdi>{peer.hostname || peer.ipv4}</bdi>
            </p>
            <div className="flex items-center gap-0.5 -ms-0.5">
              <span className="font-mono text-xs text-text-muted" dir="ltr">
                {peer.ipv4}
              </span>
              <CopyButton value={peer.ipv4} copied={copiedKey === peer.ipv4} onCopy={onCopy} label={copyLabel} className="w-7 h-7" />
            </div>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${LATENCY_TEXT[latency.tone]}`}>
            <LatencyIcon className="w-4 h-4" aria-hidden="true" />
            {latency.ms === null ? t('peer_latency_none') : `${formatNumber(latency.ms, t)} ms`}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 min-w-0 text-text-muted">
            {connection}
            <span className="text-text-subtle" aria-hidden="true">
              ·
            </span>
            <span className="font-mono" dir="ltr">
              {formatProtocol(peer.tunnel_proto)}
            </span>
          </span>
          <Traffic peer={peer} t={t} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs text-text-secondary" dir="ltr">
              {versionLabel(peer)}
            </span>
            <ChannelButton peer={peer} onClick={() => onChangeChannel(peer)} t={t} />
            <UpdateCell peer={peer} run={run} onUpdate={onUpdate} onDismiss={onDismissUpdate} t={t} />
          </div>
          <div className="flex items-center shrink-0 -me-2">
            <button type="button" onClick={() => onPing(peer.ipv4)} aria-label={t('peer_card_btn_ping')} title={t('peer_card_btn_ping')} className={iconBtn}>
              <Activity className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onSpeedtest(peer.ipv4)}
              aria-label={t('peer_card_btn_speedtest')}
              title={t('peer_card_btn_speedtest')}
              className={iconBtn}
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Desktop: one aligned table row */}
      <div className={`hidden ${PEER_GRID}`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">
            <bdi>{peer.hostname || peer.ipv4}</bdi>
          </p>
          <div className="flex items-center gap-0.5">
            <span className="font-mono text-xs text-text-muted" dir="ltr">
              {peer.ipv4}
            </span>
            <CopyButton value={peer.ipv4} copied={copiedKey === peer.ipv4} onCopy={onCopy} label={copyLabel} className="w-6 h-6" />
          </div>
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 text-sm">
          {connection}
          <span className="font-mono text-xs text-text-subtle" dir="ltr">
            {formatProtocol(peer.tunnel_proto)}
          </span>
        </div>

        <span className={`inline-flex items-center gap-1.5 text-sm font-medium tabular-nums ${LATENCY_TEXT[latency.tone]}`}>
          <LatencyIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {latency.ms === null ? t('peer_latency_none') : `${formatNumber(latency.ms, t, 1)} ms`}
        </span>

        <Traffic peer={peer} t={t} className="flex-col items-start gap-0.5" />

        <div className="flex flex-col items-start gap-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-text-secondary" dir="ltr">
              {versionLabel(peer)}
            </span>
            <ChannelButton peer={peer} onClick={() => onChangeChannel(peer)} t={t} />
          </div>
          <UpdateCell peer={peer} run={run} onUpdate={onUpdate} onDismiss={onDismissUpdate} t={t} />
        </div>

        <div className="flex items-center gap-1 justify-end">
          <button type="button" onClick={() => onPing(peer.ipv4)} className={btnGhostSm}>
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('peer_card_btn_ping')}</span>
          </button>
          <button type="button" onClick={() => onSpeedtest(peer.ipv4)} className={btnGhostSm}>
            <Zap className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('peer_card_btn_speedtest')}</span>
          </button>
        </div>
      </div>

      {run?.phase === 'failed' && (
        <div className="mt-3">
          <UpdateFailure peer={peer} run={run} onDismiss={onDismissUpdate} onCopy={onCopy} copiedKey={copiedKey} t={t} />
        </div>
      )}
    </li>
  );
};
