import React from 'react';
import { Activity, ArrowDown, ArrowLeftRight, ArrowUp, Signal, SignalHigh, SignalLow, SignalMedium, Waypoints, Zap } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { formatMs, localizeDigits } from '../../i18n/format';
import { UpdateRun } from '../../hooks/useNodeUpdates';
import { btnGhostSm, CopyButton, iconBtn } from '../ui';
import { formatProtocol, LATENCY_TEXT, latencyOf, versionLabel } from './peerDisplay';
import { UpdateCell, UpdateFailure } from './UpdateStatus';

/** Columns of the desktop table. The header and rows take them through subgrid, so the auto-sized
 *  actions column is the same width everywhere and every column lines up with its header. */
export const PEER_TABLE =
  'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(max-content,0.8fr)_minmax(0,1fr)_minmax(0,1.7fr)_auto] lg:gap-x-4';

/** A header or row inside PEER_TABLE. */
export const PEER_SUBGRID = 'lg:grid lg:grid-cols-subgrid lg:col-span-full';

const LATENCY_ICON = { good: SignalHigh, fair: SignalMedium, poor: SignalLow, none: Signal };

interface PeerRowProps {
  peer: Peer;
  run?: UpdateRun;
  onUpdate: (peer: Peer) => void;
  onDismissUpdate: (ip: string) => void;
  onPing: (ip: string) => void;
  onSpeedtest: (ip: string) => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
}

/** Down and up traffic, side by side on phones or stacked in the desktop column (aligned to its start). */
const Traffic: React.FC<{ peer: Peer; t: Translate; stacked?: boolean }> = ({ peer, t, stacked = false }) => (
  <span
    className={`inline-flex font-mono text-xs text-text-muted tabular-nums ${stacked ? 'flex-col items-start gap-0.5' : 'items-center gap-3'}`}
  >
    <span className="inline-flex items-center gap-1" title={t('peer_traffic_down')}>
      <ArrowDown className="w-3 h-3 text-success" aria-label={t('peer_traffic_down')} />
      <bdi dir="ltr">{localizeDigits(peer.rx_bytes || '0 B', t)}</bdi>
    </span>
    <span className="inline-flex items-center gap-1" title={t('peer_traffic_up')}>
      <ArrowUp className="w-3 h-3 text-info" aria-label={t('peer_traffic_up')} />
      <bdi dir="ltr">{localizeDigits(peer.tx_bytes || '0 B', t)}</bdi>
    </span>
  </span>
);

export const PeerRow: React.FC<PeerRowProps> = ({
  peer,
  run,
  onUpdate,
  onDismissUpdate,
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
  // EasyTier reports a peer across an ICMP/PCK link as plain UDP; the link is what actually crosses the network.
  const protocol = peer.transport ? peer.transport.toUpperCase() : formatProtocol(peer.tunnel_proto);
  const protocolTitle = peer.transport ? formatText(t('peer_via_link'), { transport: protocol }) : undefined;

  return (
    <li className={`px-4 py-3.5 sm:px-5 transition-colors hover:bg-hover ${PEER_SUBGRID}`}>
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
          <span className={`shrink-0 inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold tabular-nums ${LATENCY_TEXT[latency.tone]}`}>
            <LatencyIcon className="w-4 h-4" aria-hidden="true" />
            {latency.ms === null ? t('peer_latency_none') : formatMs(latency.ms, t)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 min-w-0 text-text-muted">
            {connection}
            <span className="text-text-subtle" aria-hidden="true">
              ·
            </span>
            <span className="font-mono" dir="ltr" title={protocolTitle}>
              {protocol}
            </span>
          </span>
          <Traffic peer={peer} t={t} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs text-text-secondary" dir="ltr">
              {versionLabel(peer)}
            </span>
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
      <div className={`hidden ${PEER_SUBGRID} lg:items-center`}>
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

        <div className="flex flex-col items-start gap-0.5 min-w-0 text-sm">
          {connection}
          <span className="font-mono text-xs text-text-subtle" dir="ltr" title={protocolTitle}>
            {protocol}
          </span>
        </div>

        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium tabular-nums ${LATENCY_TEXT[latency.tone]}`}>
          <LatencyIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {latency.ms === null ? t('peer_latency_none') : formatMs(latency.ms, t, 1)}
        </span>

        <Traffic peer={peer} t={t} stacked />

        <div className="flex flex-col items-start gap-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-text-secondary" dir="ltr">
              {versionLabel(peer)}
            </span>
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
        <div className="mt-3 lg:col-span-full">
          <UpdateFailure peer={peer} run={run} onDismiss={onDismissUpdate} onCopy={onCopy} copiedKey={copiedKey} t={t} />
        </div>
      )}
    </li>
  );
};
