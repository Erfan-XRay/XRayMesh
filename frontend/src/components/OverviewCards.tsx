import React from 'react';
import { Activity, Cpu, Network, Users } from 'lucide-react';
import { NodeInfo, Peer, SystemStats } from '../types';
import type { Translate } from '../i18n/translations';
import { formatCount, formatNumber, formatUptime, localizeDigits } from '../i18n/format';
import { formatText } from '../i18n/fillTemplate';
import { CopyButton, Meter } from './ui';
import { LATENCY_TEXT, latencyTone } from './Peers/peerDisplay';

interface OverviewCardsProps {
  node: NodeInfo;
  system: SystemStats;
  peers: Peer[];
  /** Mean latency across peers in ms, or null when no peer reported one. */
  avgLatency: number | null;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
}

const formatMb = (mb?: number) => (!mb ? '' : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

const Cell: React.FC<{ icon: React.ReactNode; label: string; aside?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }> = ({
  icon,
  label,
  aside,
  children,
  footer,
}) => (
  <div className="flex flex-col min-w-0 p-3.5 sm:p-4 lg:p-5 bg-card">
    <div className="flex items-center justify-between gap-2 min-h-8">
      <span className="flex items-center gap-2 min-w-0 text-xs font-medium text-text-muted">
        <span className="text-text-subtle shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      {aside}
    </div>
    <div className="mt-1.5 min-w-0">{children}</div>
    {footer && <div className="mt-auto pt-2 text-xs text-text-subtle truncate">{footer}</div>}
  </div>
);

/** One strip of live numbers for this node: address, peers, latency and host load. */
export const OverviewCards: React.FC<OverviewCardsProps> = ({ node, system, peers, avgLatency, onCopy, copiedKey, t }) => {
  const cpuPct = typeof system.cpu_percent === 'number' ? Math.round(system.cpu_percent) : 0;
  const ramPct = typeof system.ram_percent === 'number' ? Math.round(system.ram_percent) : 0;
  const ramDetail =
    system.ram_used_mb && system.ram_total_mb ? localizeDigits(`${formatMb(system.ram_used_mb)} / ${formatMb(system.ram_total_mb)}`, t) : '';
  const percent = (n: number) => t('percent').replace('{n}', formatCount(n, t));
  const others = peers.filter((p) => !p.is_current);
  const relayed = others.filter((p) => p.connection === 'relay').length;
  const direct = others.length - relayed;
  const tone = latencyTone(avgLatency);
  const ipCopied = Boolean(node.ipv4) && copiedKey === node.ipv4;

  return (
    <section
      aria-label={t('overview_label')}
      className="grid grid-cols-2 lg:grid-cols-4 gap-px mb-5 rounded-2xl overflow-hidden bg-card-border border border-card-border shadow-card"
    >
      <Cell
        icon={<Network className="w-4 h-4" />}
        label={t('vip_title')}
        aside={
          node.ipv4 ? (
            <CopyButton value={node.ipv4} copied={ipCopied} onCopy={onCopy} label={ipCopied ? t('btn_copied') : t('btn_copy_ip')} className="-me-1.5" />
          ) : undefined
        }
        footer={
          <span className="font-mono" dir="ltr">
            {node.hostname || '—'}
          </span>
        }
      >
        <p className="font-mono text-lg sm:text-xl font-semibold text-text-primary tabular-nums truncate">
          <bdi dir="ltr">{node.ipv4 || '—'}</bdi>
        </p>
      </Cell>

      <Cell
        icon={<Users className="w-4 h-4" />}
        label={t('peers_title')}
        footer={
          others.length > 0
            ? formatText(t('overview_peers_split'), { direct: formatCount(direct, t), relayed: formatCount(relayed, t) })
            : t('peers_desc')
        }
      >
        <p className="text-lg sm:text-xl font-semibold text-text-primary tabular-nums">{formatCount(others.length, t)}</p>
      </Cell>

      <Cell icon={<Activity className="w-4 h-4" />} label={t('latency_title')} footer={t('latency_desc')}>
        <p className={`font-mono text-lg sm:text-xl font-semibold tabular-nums ${avgLatency === null ? 'text-text-subtle' : LATENCY_TEXT[tone]}`}>
          {avgLatency === null ? '—' : `${formatNumber(avgLatency, t, 1)} ms`}
        </p>
      </Cell>

      <Cell
        icon={<Cpu className="w-4 h-4" />}
        label={t('resources_title')}
        footer={
          <span className="flex items-center justify-between gap-2">
            <span className="truncate" title={t('uptime_prefix')}>
              {formatUptime(system.uptime_str, t)}
            </span>
            {Array.isArray(system.load_avg) && (
              <span className="hidden sm:inline font-mono tabular-nums shrink-0" title={t('load_prefix')}>
                {system.load_avg.map((v) => (typeof v === 'number' ? formatNumber(v, t, 2) : localizeDigits(v, t))).join('  ')}
              </span>
            )}
          </span>
        }
      >
        <div className="space-y-2">
          {[
            { label: t('cpu_usage'), short: 'CPU', pct: cpuPct, warn: 60, detail: '' },
            { label: t('ram_usage'), short: 'RAM', pct: ramPct, warn: 70, detail: ramDetail },
          ].map((m) => (
            <div key={m.short}>
              <div className="flex items-baseline justify-between gap-2 mb-1 text-xs">
                <span className="text-text-muted" lang="en">
                  {m.short}
                </span>
                <span className="font-mono text-text-primary tabular-nums truncate">
                  <span className="font-semibold">{percent(m.pct)}</span>
                  {m.detail && <span className="hidden xl:inline text-text-subtle">{t('detail_sep')}{m.detail}</span>}
                </span>
              </div>
              <Meter value={m.pct} warn={m.warn} danger={85} label={m.label} />
            </div>
          ))}
        </div>
      </Cell>
    </section>
  );
};
