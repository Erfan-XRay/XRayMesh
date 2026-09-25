import { useCallback, useEffect, useRef, useState } from 'react';
import { Peer, UpdateSummary } from '../types';
import { fetchLocalUpdateInfo, fetchNodeUpdateStatus, isPanelServing, NodeActionError, startNodeUpdate } from '../services/api';
import { isNewerVersion } from '../utils/version';

export type UpdatePhase =
  | 'starting'
  | 'queued'
  | 'download'
  | 'verify'
  | 'install'
  | 'restart'
  | 'rollback'
  | 'reconnecting'
  | 'working'
  | 'success'
  | 'up_to_date'
  | 'failed';

export interface UpdateRun {
  ip: string;
  hostname: string;
  isLocal: boolean;
  branch: string;
  phase: UpdatePhase;
  fromVersion: string;
  targetVersion: string;
  /** Peers older than 2.2.6-beta.5 update without step reports; success is detected from the version. */
  legacy: boolean;
  /** Server-side start time of our job, to ignore status left over from an earlier run. */
  jobStartedAt: number;
  clickedAt: number;
  errorCode?: string;
  errorDetail?: string;
  rolledBack?: boolean;
}

const POLL_MS = 2000;
/** A request to a restarting server can hang instead of failing; never wait on one longer. */
const REQUEST_TIMEOUT_MS = 5000;
/** Set before reloading after this panel's own server updated; read by the next page load. */
export const UPDATED_TO_KEY = 'xraymesh.updatedTo';
const TIMEOUT_MS = 4 * 60 * 1000;
const ACTIVE: UpdatePhase[] = ['starting', 'queued', 'download', 'verify', 'install', 'restart', 'rollback', 'reconnecting', 'working'];

export const isRunActive = (run?: UpdateRun) => Boolean(run && ACTIVE.includes(run.phase));

const STEP_PHASE: Record<string, UpdatePhase> = {
  queued: 'queued',
  download: 'download',
  verify: 'verify',
  backup: 'install',
  install: 'install',
  restart: 'restart',
  health: 'restart',
  rollback: 'rollback',
};

/**
 * One-click updates for any server in the mesh. Runs live in App so they keep
 * polling while the user switches tabs.
 */
export function useNodeUpdates(onFinished: () => void) {
  const [runs, setRuns] = useState<Record<string, UpdateRun>>({});
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  /** Consecutive failed status polls of this server's own update. */
  const localFailures = useRef(0);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const patch = useCallback((ip: string, changes: Partial<UpdateRun>) => {
    setRuns((prev) => (prev[ip] ? { ...prev, [ip]: { ...prev[ip], ...changes } } : prev));
    if (runsRef.current[ip]) runsRef.current = { ...runsRef.current, [ip]: { ...runsRef.current[ip], ...changes } };
  }, []);

  const finish = useCallback(
    (ip: string, changes: Partial<UpdateRun>) => {
      patch(ip, changes);
      const run = runsRef.current[ip];
      if (changes.phase === 'success' && run?.isLocal) {
        // This panel itself was replaced: load the new UI. The restart dropped the
        // session, so the reload lands on sign-in, which explains what happened.
        try {
          sessionStorage.setItem(UPDATED_TO_KEY, changes.targetVersion || run.targetVersion || '');
        } catch {
          // Only used for the notice after reload.
        }
        setTimeout(() => window.location.reload(), 2500);
      } else {
        onFinishedRef.current();
      }
    },
    [patch]
  );

  const apply = useCallback(
    (ip: string, reachable: boolean, legacy: boolean, status: UpdateSummary) => {
      const run = runsRef.current[ip];
      if (!run) return;
      const version = status.version || '';

      if (run.legacy || legacy) {
        if (version && isNewerVersion(version, run.fromVersion)) {
          finish(ip, { phase: 'success', targetVersion: version });
        } else {
          patch(ip, { phase: reachable ? 'working' : 'reconnecting', legacy: true });
        }
        return;
      }

      const job = status.update || {};
      if (!reachable) {
        patch(ip, { phase: 'reconnecting' });
        return;
      }
      if ((job.started_at ?? 0) < run.jobStartedAt) return; // an earlier job's record

      switch (job.state) {
        case 'queued':
        case 'running':
          patch(ip, { phase: STEP_PHASE[job.step || ''] || 'working', targetVersion: job.target_version || run.targetVersion });
          break;
        case 'success':
          finish(ip, { phase: 'success', targetVersion: job.target_version || version || run.targetVersion });
          break;
        case 'up_to_date':
          finish(ip, { phase: 'up_to_date' });
          break;
        case 'failed':
          finish(ip, {
            phase: 'failed',
            errorCode: job.rolled_back ? 'rolled_back' : 'update_failed',
            errorDetail: job.error || '',
            rolledBack: Boolean(job.rolled_back),
          });
          break;
        default:
          break;
      }
    },
    [finish, patch]
  );

  const poll = useCallback(
    (ip: string) => {
      const tick = async () => {
        const run = runsRef.current[ip];
        if (!isRunActive(run)) return;
        if (Date.now() - run.clickedAt > TIMEOUT_MS) {
          finish(ip, { phase: 'failed', errorCode: 'timeout' });
          return;
        }
        try {
          if (run.isLocal) {
            // Our own server restarts during the update and forgets the session, so the
            // signed-in status call would fail with 401 forever. Poll the public endpoint.
            const info = await fetchLocalUpdateInfo(REQUEST_TIMEOUT_MS);
            localFailures.current = 0;
            if (info.version && run.fromVersion && isNewerVersion(info.version, run.fromVersion)) {
              finish(ip, { phase: 'success', targetVersion: info.version });
            } else {
              apply(ip, true, run.legacy, info);
            }
          } else {
            const res = await fetchNodeUpdateStatus(ip);
            apply(ip, res.reachable, res.legacy, res.status);
          }
        } catch (err) {
          // Our own panel is down while it restarts; anything else is retried until the timeout.
          if (run.isLocal || !(err instanceof NodeActionError)) patch(ip, { phase: 'reconnecting' });
          if (run.isLocal && ++localFailures.current >= 3 && (await isPanelServing(REQUEST_TIMEOUT_MS))) {
            // The status endpoint keeps failing (proxy, odd network) but the panel itself
            // answers again: reloading is the reliable way out, and lands on sign-in.
            finish(ip, { phase: 'success', targetVersion: run.targetVersion });
            return;
          }
        }
        if (isRunActive(runsRef.current[ip])) timers.current[ip] = setTimeout(tick, POLL_MS);
      };
      timers.current[ip] = setTimeout(tick, POLL_MS);
    },
    [apply, finish, patch]
  );

  const start = useCallback(
    async (peer: Peer) => {
      const ip = peer.ipv4;
      if (isRunActive(runsRef.current[ip])) return;
      const run: UpdateRun = {
        ip,
        hostname: peer.hostname || ip,
        isLocal: Boolean(peer.is_current),
        branch: peer.xraymesh_branch || '',
        phase: 'starting',
        fromVersion: peer.xraymesh_version || '',
        targetVersion: peer.latest_version || '',
        legacy: false,
        jobStartedAt: 0,
        clickedAt: Date.now(),
      };
      if (run.isLocal) localFailures.current = 0;
      runsRef.current = { ...runsRef.current, [ip]: run };
      setRuns((prev) => ({ ...prev, [ip]: run }));
      try {
        const res = await startNodeUpdate(ip);
        patch(ip, { phase: 'queued', legacy: res.legacy, jobStartedAt: res.status.update?.started_at ?? 0 });
        poll(ip);
      } catch (err) {
        const code = err instanceof NodeActionError ? err.code : 'unreachable';
        if (code === 'already_running') {
          // Follow the job that is already in progress instead of failing.
          patch(ip, { phase: 'queued' });
          poll(ip);
          return;
        }
        if (code === 'request_timeout') {
          // The start request got no answer, but the job may well have started: follow
          // it (ignoring older jobs) and let the status report success or failure.
          patch(ip, { phase: 'queued', jobStartedAt: Math.floor(run.clickedAt / 1000) - 30 });
          poll(ip);
          return;
        }
        finish(ip, { phase: 'failed', errorCode: code || 'remote_error', errorDetail: err instanceof Error ? err.message : String(err) });
      }
    },
    [finish, patch, poll]
  );

  const dismiss = useCallback((ip: string) => {
    clearTimeout(timers.current[ip]);
    const next = { ...runsRef.current };
    delete next[ip];
    runsRef.current = next;
    setRuns((prev) => {
      const next = { ...prev };
      delete next[ip];
      return next;
    });
  }, []);

  return { runs, start, dismiss };
}
