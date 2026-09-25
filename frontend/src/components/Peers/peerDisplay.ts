import { Peer, UpdateChannel } from '../../types';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { UpdatePhase, UpdateRun } from '../../hooks/useNodeUpdates';

export type LatencyTone = 'good' | 'fair' | 'poor' | 'none';

export function latencyOf(peer: Peer): { ms: number | null; tone: LatencyTone } {
  const ms = typeof peer.lat_ms === 'number' ? peer.lat_ms : parseFloat(String(peer.lat_ms ?? ''));
  if (!Number.isFinite(ms) || ms <= 0) return { ms: null, tone: 'none' };
  return { ms, tone: ms < 60 ? 'good' : ms < 150 ? 'fair' : 'poor' };
}

export const LATENCY_TEXT: Record<LatencyTone, string> = {
  good: 'text-emerald-400',
  fair: 'text-amber-400',
  poor: 'text-rose-400',
  none: 'text-text-subtle',
};

export function formatProtocol(proto?: string): string {
  const lower = (proto || '').toLowerCase();
  if (!lower) return 'UDP';
  if (lower.includes('udp') && lower.includes('tcp')) return 'TCP + UDP';
  return lower.toUpperCase();
}

export const CHANNEL_TEXT: Record<UpdateChannel, TranslationKey> = {
  stable: 'channel_stable',
  beta: 'channel_beta',
  custom: 'channel_custom',
};

export const channelOf = (peer: Peer): UpdateChannel =>
  peer.channel || (peer.xraymesh_branch === 'main' ? 'stable' : peer.xraymesh_branch === 'beta' ? 'beta' : 'custom');

/** Servers older than 2.2.6-beta.5 do not report their channel and use the untracked updater. */
export const isLegacyPeer = (peer: Peer) => !peer.is_current && Boolean(peer.legacy);

/** Version for display; unreachable servers report "unknown". */
export const versionLabel = (peer: Peer) =>
  peer.xraymesh_version && peer.xraymesh_version !== 'unknown' ? peer.xraymesh_version : '?';

export const PHASE_TEXT: Partial<Record<UpdatePhase, TranslationKey>> = {
  starting: 'update_phase_starting',
  queued: 'update_phase_starting',
  download: 'update_phase_download',
  verify: 'update_phase_verify',
  install: 'update_phase_install',
  restart: 'update_phase_restart',
  rollback: 'update_phase_rollback',
  reconnecting: 'update_phase_reconnecting',
  working: 'update_phase_working',
};

const ERROR_TEXT: Record<string, TranslationKey> = {
  rolled_back: 'update_err_rolled_back',
  update_failed: 'update_err_update_failed',
  timeout: 'update_err_timeout',
  unreachable: 'update_err_unreachable',
  auth_failed: 'update_err_auth_failed',
  unsupported: 'update_err_unsupported',
  launch_failed: 'update_err_launch_failed',
};

export function updateErrorText(code: string | undefined, host: string, t: Translate): string {
  return formatText(t(ERROR_TEXT[code || ''] || 'update_err_generic'), { host });
}

/** When the panel cannot reach or drive a server, its own terminal still can. */
export function cliUpdateCommand(branch: string): string {
  const b = branch === 'main' || branch === 'beta' ? branch : 'beta';
  return `bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/${b}/xraymesh.sh) update`;
}

/** Remote failures the CLI command can still fix. */
export const needsCliFallback = (run?: UpdateRun) =>
  Boolean(run && run.phase === 'failed' && ['unreachable', 'auth_failed', 'unsupported', 'timeout', 'launch_failed'].includes(run.errorCode || ''));
