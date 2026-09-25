import React from 'react';
import { Activity, ArrowDown, ArrowLeftRight, ArrowUp, Check, Copy, Signal, SignalHigh, SignalLow, SignalMedium, Waypoints, Zap } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { UpdateRun } from '../../hooks/useNodeUpdates';
import { btnGhostSm } from '../NodeConfig/FormControls';
import { CHANNEL_TEXT, channelOf, formatProtocol, isLegacyPeer, LATENCY_TEXT, latencyOf, versionLabel } from './peerDisplay';
import { UpdateCell, UpdateFailure } from './UpdateStatus';

/** Shared column template so the header and every row line up on large screens. */
export const PEER_GRID = 'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.7fr)_auto] lg:items-center lg:gap-4';

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

/** Label shown only in the stacked mobile layout, where there is no column header. */
const CellLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="lg:hidden text-xs text-text-subtle">{children}</span>
);

export const ChannelButton: React.FC<{ peer: Peer; onClick: () => void; t: Translate }> = ({ peer, onClick, t }) => {
  if (!peer.channel && !peer.xraymesh_branch) return null; // unreachable: channel unknown
  const channel = channelOf(peer);
  const label = t(CHANNEL_TEXT[channel]);
  if (isLegacyPeer(peer)) {
    // Old servers cannot switch channel remotely; a button would only lead to an error.
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-card-border text-xs text-text-subtle">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={formatText(t('channel_change_label'), { host: peer.hostname || peer.ipv4, channel: label })}
      title={formatText(t('channel_change_label'), { host: peer.hostname || peer.ipv4, channel: label })}
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
        channel === 'beta'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
          : 'border-card-border bg-surface text-text-muted hover:text-text-main hover:border-card-border-hover'
      }`}
    >
      {label}
    </button>
  );
};

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

  return (
    <li className="px-4 py-3.5 sm:px-5">
      {/* Phones: three dense lines instead of a stacked table. */}
      <div className="lg:hidden space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-main truncate" dir="auto">
              {peer.hostname || peer.ipv4}
            </p>
            <button
              type="button"
              onClick={() => onCopy(peer.ipv4)}
              aria-label={copyLabel}
              className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-text-muted active:text-text-main"
              dir="ltr"
            >
              {peer.ipv4}
              {copiedKey === peer.ipv4 ? <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" /> : <Copy className="w-3 h-3 opacity-60" aria-hidden="true" />}
            </button>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${LATENCY_TEXT[latency.tone]}`}>
            <LatencyIcon className="w-4 h-4" aria-hidden="true" />
            {latency.ms === null ? t('peer_latency_none') : <bdi dir="ltr">{`${latency.ms.toFixed(0)} ms`}</bdi>}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
          <span className={`inline-flex items-center gap-1.5 min-w-0 ${relayed ? 'text-amber-400' : ''}`}>
            {relayed ? <Waypoints className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-emerald-400" aria-hidden="true" />}
            <span className="truncate">
              {t(relayed ? 'peer_conn_relay' : 'peer_conn_direct')} · <span dir="ltr">{formatProtocol(peer.tunnel_proto)}</span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 shrink-0 tabular-nums" dir="ltr">
            <span className="inline-flex items-center gap-0.5"><ArrowDown className="w-3 h-3" aria-label={t('peer_traffic_down')} />{peer.rx_bytes || '0 B'}</span>
            <span className="inline-flex items-center gap-0.5"><ArrowUp className="w-3 h-3" aria-label={t('peer_traffic_up')} />{peer.tx_bytes || '0 B'}</span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs text-text-main" dir="ltr">{versionLabel(peer)}</span>
            <ChannelButton peer={peer} onClick={() => onChangeChannel(peer)} t={t} />
            <UpdateCell peer={peer} run={run} onUpdate={onUpdate} onDismiss={onDismissUpdate} t={t} />
          </div>
          <div className="flex items-center shrink-0 -me-1.5">
            <button
              type="button"
              onClick={() => onPing(peer.ipv4)}
              aria-label={t('peer_card_btn_ping')}
              title={t('peer_card_btn_ping')}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-main hover:bg-surface active:scale-95"
            >
              <Activity className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onSpeedtest(peer.ipv4)}
              aria-label={t('peer_card_btn_speedtest')}
              title={t('peer_card_btn_speedtest')}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-main hover:bg-surface active:scale-95"
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className={`hidden ${PEER_GRID}`}>
        {/* Server */}
        <div className="col-span-2 lg:col-span-1 min-w-0">
          <p className="text-sm font-semibold text-text-main truncate" dir="auto">
            {peer.hostname || peer.ipv4}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="font-mono text-xs text-text-muted" dir="ltr">
              {peer.ipv4}
            </span>
            <button
              type="button"
              onClick={() => onCopy(peer.ipv4)}
              aria-label={copyLabel}
              title={copyLabel}
              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-text-subtle hover:text-text-main hover:bg-surface transition-colors cursor-pointer"
            >
              {copiedKey === peer.ipv4 ? <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Connection */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <CellLabel>{t('peers_col_connection')}</CellLabel>
          <span className={`inline-flex items-center gap-1.5 text-sm ${relayed ? 'text-amber-400' : 'text-text-main'}`}>
            {relayed ? <Waypoints className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-emerald-400" aria-hidden="true" />}
            {t(relayed ? 'peer_conn_relay' : 'peer_conn_direct')}
          </span>
          <span className="font-mono text-xs text-text-subtle" dir="ltr">
            {formatProtocol(peer.tunnel_proto)}
          </span>
        </div>

        {/* Latency */}
        <div className="flex flex-col gap-0.5">
          <CellLabel>{t('peers_col_latency')}</CellLabel>
          <span className={`inline-flex items-center gap-1.5 text-sm font-medium tabular-nums ${LATENCY_TEXT[latency.tone]}`}>
            <LatencyIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {latency.ms === null ? t('peer_latency_none') : <bdi dir="ltr">{`${latency.ms.toFixed(1)} ms`}</bdi>}
          </span>
        </div>

        {/* Traffic */}
        <div className="flex flex-col gap-0.5">
          <CellLabel>{t('peers_col_traffic')}</CellLabel>
          <span className="inline-flex items-center gap-1 text-xs text-text-muted tabular-nums" title={t('peer_traffic_down')}>
            <ArrowDown className="w-3 h-3 shrink-0" aria-label={t('peer_traffic_down')} />
            <bdi dir="ltr">{peer.rx_bytes || '0 B'}</bdi>
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-text-muted tabular-nums" title={t('peer_traffic_up')}>
            <ArrowUp className="w-3 h-3 shrink-0" aria-label={t('peer_traffic_up')} />
            <bdi dir="ltr">{peer.tx_bytes || '0 B'}</bdi>
          </span>
        </div>

        {/* Version & update */}
        <div className="col-span-2 lg:col-span-1 flex flex-col items-start gap-1 min-w-0">
          <CellLabel>{t('peers_col_version')}</CellLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-text-main" dir="ltr">
              {versionLabel(peer)}
            </span>
            <ChannelButton peer={peer} onClick={() => onChangeChannel(peer)} t={t} />
          </div>
          <UpdateCell peer={peer} run={run} onUpdate={onUpdate} onDismiss={onDismissUpdate} t={t} />
        </div>

        {/* Actions */}
        <div className="col-span-2 lg:col-span-1 flex items-center gap-1 lg:justify-end">
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
