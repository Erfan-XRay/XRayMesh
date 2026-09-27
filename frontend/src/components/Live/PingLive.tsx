import React from 'react';
import { Server, X } from 'lucide-react';
import type { PingReply, PingResult } from '../../types';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { formatCount, formatMs, formatNumber } from '../../i18n/format';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { LoadingDots } from '../LoadingSpinner';
import { Pill, StatusDot, Tone } from '../ui';

export interface PingStats {
  min: number;
  avg: number;
  max: number;
  jitter: number;
  loss: number;
  received: number;
}

/** Stats from the replies seen so far, matching ping's own min/avg/max/mdev. */
export function statsFromReplies(replies: PingReply[]): PingStats {
  const times = replies.filter((r) => r.status === 'ok' && r.time_ms !== null).map((r) => r.time_ms as number);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const variance = times.length ? times.reduce((a, b) => a + b * b, 0) / times.length - avg * avg : 0;
  return {
    min: times.length ? Math.min(...times) : 0,
    avg,
    max: times.length ? Math.max(...times) : 0,
    jitter: Math.sqrt(Math.max(0, variance)),
    loss: replies.length ? (100 * (replies.length - times.length)) / replies.length : 0,
    received: times.length,
  };
}

/** Enough decimals for sub-millisecond LAN replies without cluttering slow ones. */
const msDecimals = (v: number) => (v < 1 ? 2 : v < 100 ? 1 : 0);

export const latencyTone = (ms: number): Tone => (ms < 80 ? 'success' : ms < 150 ? 'warning' : 'danger');

const BAR_BG: Record<string, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' };

export function qualityOf(stats: PingStats, done: boolean): { key: TranslationKey; tone: Tone } | null {
  if (!stats.received) return done ? { key: 'ping_quality_down', tone: 'danger' } : null;
  const penalty = stats.loss >= 20 ? 2 : stats.loss > 0 ? 1 : 0;
  const base = stats.avg < 30 ? 0 : stats.avg < 80 ? 1 : stats.avg < 150 ? 2 : 3;
  const levels = [
    { key: 'ping_quality_excellent', tone: 'success' },
    { key: 'ping_quality_good', tone: 'success' },
    { key: 'ping_quality_fair', tone: 'warning' },
    { key: 'ping_quality_poor', tone: 'danger' },
  ] as const;
  return levels[Math.min(3, base + penalty)];
}

const NodeBubble: React.FC<{ name: string; children?: React.ReactNode; active: boolean }> = ({ name, children, active }) => (
  <div className="flex flex-col items-center gap-1.5 w-20 sm:w-24 shrink-0 min-w-0">
    <span
      className={`relative flex items-center justify-center w-12 h-12 rounded-full border transition-colors ${
        active ? 'bg-primary-subtle border-primary-border text-primary' : 'bg-surface border-card-border text-text-muted'
      }`}
    >
      {children}
      <Server className="relative w-5 h-5" aria-hidden="true" />
    </span>
    <bdi className="max-w-full text-xs font-medium text-text-primary truncate">{name}</bdi>
  </div>
);

interface PingLiveProps {
  from: string;
  to: string;
  replies: PingReply[];
  count: number;
  running: boolean;
  /** Final result, once the ping finished (its replies may be missing on older nodes). */
  result: PingResult | null;
  t: Translate;
}

export const PingLive: React.FC<PingLiveProps> = ({ from, to, replies, count, running, result, t }) => {
  const latest = replies[replies.length - 1];
  const stats: PingStats = result
    ? {
        min: result.min_ms,
        avg: result.avg_ms,
        max: result.max_ms,
        jitter: result.mdev_ms ?? statsFromReplies(replies).jitter,
        loss: result.packet_loss_percent,
        received: result.packets_received ?? (result.packet_loss_percent < 100 ? 1 : 0),
      }
    : statsFromReplies(replies);
  const quality = qualityOf(stats, Boolean(result));
  const latestOk = latest?.status === 'ok' ? (latest.time_ms as number) : null;
  // Live: the latest reply. Finished: the average, as labelled.
  const shownLatency = useAnimatedNumber(result && !running ? stats.avg : latestOk ?? 0, { tau: 220 });
  const idle = !running && !result;
  // Every reply replays the echo animation: out to the destination and back.
  const echoKey = latest ? `${replies.length}-${latest.seq}-${latest.status}` : '';
  const scaleMax = Math.max(5, ...replies.map((r) => (r.status === 'ok' ? (r.time_ms as number) * 1.15 : 0)));
  const slots = Math.max(count, replies.length);
  const bySlot = replies.slice(0, slots);
  const ms = (v: number) => formatMs(v, t, msDecimals(v));

  return (
    <div className="flex flex-col gap-5">
      {/* Route with echo packets */}
      <div className="flex items-start">
        <NodeBubble name={from} active={running}>
          {running && <span className="ping-ripple ping-ripple--loop text-primary" aria-hidden="true" />}
        </NodeBubble>
        <div className="relative flex-1 h-12 min-w-[3rem] rtl:-scale-x-100" aria-hidden="true">
          <span className="absolute inset-x-1 top-1/2 border-t-2 border-dashed border-border-strong opacity-60" />
          {echoKey && (running || result) && (
            <>
              <span
                key={`p-${echoKey}`}
                className={`ping-packet ${latest.status === 'ok' ? 'bg-success shadow-[0_0_10px_rgb(var(--success-rgb)/0.8)]' : 'ping-packet--lost bg-danger'}`}
              />
              {latest.status !== 'ok' && (
                <span key={`x-${echoKey}`} className="absolute left-[62%] top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <X className="block w-4 h-4 text-danger animate-pop-in" style={{ animationDelay: '600ms' }} />
                </span>
              )}
            </>
          )}
        </div>
        <NodeBubble name={to} active={latest?.status === 'ok'}>
          {echoKey && latest.status === 'ok' && (
            <span key={`r-${echoKey}`} className="ping-ripple text-success" style={{ animationDelay: '420ms' }} aria-hidden="true" />
          )}
        </NodeBubble>
      </div>

      {/* Readout */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-muted">{result && !running ? t('ping_avg') : t('ping_latest')}</p>
          <div className="h-12 flex items-end">
            {idle ? (
              <p className="font-mono text-4xl font-bold tabular-nums text-text-subtle">
                {formatNumber(0, t, 1)}
                <span className="ms-1.5 text-base font-semibold text-text-muted">{t('unit_ms')}</span>
              </p>
            ) : latest && latest.status !== 'ok' && running ? (
              <p className="pb-1 text-lg font-semibold text-danger">{t('ping_no_reply')}</p>
            ) : !latest && running ? (
              <p className="pb-1.5 inline-flex items-center gap-2 text-sm text-text-muted">
                {t('ping_waiting')}
                <LoadingDots className="text-primary" />
              </p>
            ) : (
              <p className={`font-mono text-4xl font-bold tabular-nums ${stats.received ? 'text-primary' : 'text-text-subtle'}`}>
                {formatNumber(shownLatency, t, msDecimals(shownLatency))}
                <span className="ms-1.5 text-base font-semibold text-text-muted">{t('unit_ms')}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="status">
          {running && (
            <Pill tone="primary" icon={<StatusDot tone="primary" pulse />}>
              {formatText(t('ping_replies'), { n: formatCount(stats.received, t), total: formatCount(count, t) })}
            </Pill>
          )}
          {quality && <Pill tone={quality.tone}>{t(quality.key)}</Pill>}
        </div>
      </div>

      {idle && <p className="-mt-2 text-sm text-text-muted">{t('ping_idle_hint')}</p>}

      {/* One bar per probe */}
      {!idle && (bySlot.length > 0 || running) && (
        <div className="flex items-stretch gap-1.5 h-28" aria-hidden="true">
          {Array.from({ length: slots }, (_, i) => {
            const reply = bySlot[i];
            const next = running && i === bySlot.length;
            return (
              <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={formatText(t('ping_packet'), { n: formatCount(i + 1, t) })}>
                <div className="relative flex-1 w-full flex items-end justify-center">
                  {reply?.status === 'ok' ? (
                    <div
                      className={`ping-bar w-full max-w-[2.25rem] rounded-t-md rounded-b-sm ${BAR_BG[latencyTone(reply.time_ms as number)]}`}
                      style={{ height: `${Math.max(6, (100 * (reply.time_ms as number)) / scaleMax)}%` }}
                    />
                  ) : reply ? (
                    <div className="w-full max-w-[2.25rem] h-full flex items-center justify-center rounded-md border border-dashed border-danger-border bg-danger-subtle animate-fade-in">
                      <X className="w-3.5 h-3.5 text-danger" />
                    </div>
                  ) : (
                    <div
                      className={`w-full max-w-[2.25rem] h-full rounded-md border border-dashed ${
                        next ? 'border-primary-border bg-primary-subtle animate-pulse-dot' : 'border-card-border'
                      }`}
                    />
                  )}
                </div>
                <span className="h-4 max-w-full text-2xs font-mono tabular-nums text-text-muted truncate">
                  {reply?.status === 'ok' ? formatNumber(reply.time_ms as number, t, msDecimals(reply.time_ms as number)) : reply ? '×' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats */}
      {!idle && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: t('ping_min'), value: stats.received ? ms(stats.min) : '—' },
            { label: t('ping_avg'), value: stats.received ? ms(stats.avg) : '—', className: 'text-primary' },
            { label: t('ping_max'), value: stats.received ? ms(stats.max) : '—' },
            { label: t('ping_jitter'), value: stats.received ? ms(stats.jitter) : '—' },
            {
              label: t('ping_loss'),
              value: replies.length || result ? t('percent').replace('{n}', formatNumber(stats.loss, t, stats.loss % 1 ? 1 : 0)) : '—',
              className: stats.loss === 0 ? 'text-success' : stats.loss < 10 ? 'text-warning' : 'text-danger',
            },
          ].map((s, i) => (
            <div key={s.label} className={`p-3 rounded-xl bg-surface border border-card-border ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}>
              <p className="text-xs text-text-muted truncate">{s.label}</p>
              <p className={`mt-1 font-mono text-base font-semibold tabular-nums truncate ${s.className || 'text-text-primary'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
