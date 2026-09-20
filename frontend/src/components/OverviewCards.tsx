import React from 'react';
import { NodeInfo, SystemStats } from '../types';
import { Copy, Check, Users, Activity, Cpu } from 'lucide-react';

interface OverviewCardsProps {
  node: NodeInfo;
  system: SystemStats;
  peerCount: number;
  avgLatency: string;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: (key: any) => string;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({
  node,
  system,
  peerCount,
  avgLatency,
  onCopy,
  copiedKey,
  t,
}) => {
  const cpuPct = typeof system.cpu_percent === 'number' ? system.cpu_percent : 0;
  const ramPct = typeof system.ram_percent === 'number' ? system.ram_percent : 0;

  const usedRamStr = system.ram_used_mb
    ? system.ram_used_mb >= 1024
      ? `${(system.ram_used_mb / 1024).toFixed(1)} GB`
      : `${system.ram_used_mb} MB`
    : '';

  const totalRamStr = system.ram_total_mb
    ? system.ram_total_mb >= 1024
      ? `${(system.ram_total_mb / 1024).toFixed(1)} GB`
      : `${system.ram_total_mb} MB`
    : '';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Mesh Virtual IP */}
      <div className="p-4 rounded-xl bg-card border border-card-border hover:border-card-border-hover transition-all backdrop-blur-md relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-text-muted">{t('vip_title')}</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
            IP
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xl font-bold font-mono text-text-main tabular-nums tracking-tight">
            {node.ipv4 || '--'}
          </span>
          {node.ipv4 && (
            <button
              onClick={() => onCopy(node.ipv4!)}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-text-muted hover:text-primary hover:border-primary/40 transition-colors"
              title={t('btn_copied')}
            >
              {copiedKey === node.ipv4 ? (
                <Check className="w-3.5 h-3.5 text-accent-green" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
        <div className="text-xs text-text-muted mt-2 truncate">
          {t('vip_desc_prefix')}: <span className="font-mono text-text-main">{node.hostname || '--'}</span>
        </div>
      </div>

      {/* 2. Connected Peers */}
      <div className="p-4 rounded-xl bg-card border border-card-border hover:border-card-border-hover transition-all backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-text-muted">{t('peers_title')}</span>
          <div className="p-1 rounded-md bg-primary/10 text-primary">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-2xl font-bold font-mono text-text-main tabular-nums">
          {peerCount}
        </div>
        <div className="text-xs text-text-muted mt-2">{t('peers_desc')}</div>
      </div>

      {/* 3. Average Latency */}
      <div className="p-4 rounded-xl bg-card border border-card-border hover:border-card-border-hover transition-all backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-text-muted">{t('latency_title')}</span>
          <div className="p-1 rounded-md bg-primary/10 text-primary">
            <Activity className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-2xl font-bold font-mono text-primary tabular-nums">
          {avgLatency}
        </div>
        <div className="text-xs text-text-muted mt-2">{t('latency_desc')}</div>
      </div>

      {/* 4. Host Server Resources (CPU & RAM) */}
      <div className="p-4 rounded-xl bg-card border border-card-border hover:border-card-border-hover transition-all backdrop-blur-md">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-text-muted">{t('resources_title')}</span>
          <div className="p-1 rounded-md bg-primary/10 text-primary">
            <Cpu className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* CPU Meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">{t('cpu_usage')}</span>
            <span className="font-mono font-semibold text-text-main tabular-nums">{cpuPct}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                cpuPct > 85
                  ? 'bg-accent-red'
                  : cpuPct > 60
                  ? 'bg-accent-yellow'
                  : 'bg-primary'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, cpuPct))}%` }}
            />
          </div>
        </div>

        {/* RAM Meter */}
        <div className="space-y-1 mt-2.5">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">{t('ram_usage')}</span>
            <span className="font-mono font-semibold text-text-main tabular-nums">
              {ramPct}% {usedRamStr && totalRamStr ? `(${usedRamStr}/${totalRamStr})` : ''}
            </span>
          </div>
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                ramPct > 85
                  ? 'bg-accent-red'
                  : ramPct > 70
                  ? 'bg-accent-yellow'
                  : 'bg-sky-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, ramPct))}%` }}
            />
          </div>
        </div>

        {/* Uptime & Load */}
        <div className="flex items-center justify-between text-[11px] text-text-subtle mt-2.5 pt-1.5 border-t border-white/5">
          <span>
            {t('uptime_prefix')}: {system.uptime_str || '--'}
          </span>
          <span className="font-mono">
            {t('load_prefix')}: {Array.isArray(system.load_avg) ? system.load_avg.join(', ') : '--'}
          </span>
        </div>
      </div>
    </div>
  );
};
