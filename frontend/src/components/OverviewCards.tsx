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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-4 sm:mb-6">
      {/* 1. Mesh Virtual IP */}
      <div className="interactive-card relative overflow-hidden p-3 sm:p-4 md:p-5 rounded-2xl bg-card border border-card-border hover:border-primary/40 shadow-sm hover:shadow-xl hover:shadow-primary/5 backdrop-blur-xl transition-all duration-300 before:absolute before:top-0 before:inset-x-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-primary/50 before:to-transparent">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2.5">
          <span className="text-[11px] sm:text-xs font-semibold text-text-muted truncate">{t('vip_title')}</span>
          <span className="hidden xs:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            IPv4
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="text-sm sm:text-xl md:text-2xl font-bold font-mono text-text-main tabular-nums tracking-tight truncate">
            {node.ipv4 || '--'}
          </span>
          {node.ipv4 && (
            <button
              onClick={() => onCopy(node.ipv4!)}
              className="interactive-min-hit p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 text-text-muted hover:text-primary hover:border-primary/40 active:scale-90 transition-all cursor-pointer shrink-0"
              title={copiedKey === node.ipv4 ? t('btn_copied') : t('vip_title')}
              aria-label={copiedKey === node.ipv4 ? t('btn_copied') : t('vip_title')}
              aria-pressed={copiedKey === node.ipv4}
            >
              {copiedKey === node.ipv4 ? (
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-green" />
              ) : (
                <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </button>
          )}
        </div>
        <div className="text-[10px] sm:text-xs text-text-muted mt-1.5 sm:mt-2.5 truncate flex items-center gap-1">
          <span className="shrink-0">{t('vip_desc_prefix')}:</span>
          <span className="font-mono text-primary font-medium truncate">{node.hostname || '--'}</span>
        </div>
      </div>

      {/* 2. Connected Peers */}
      <div className="interactive-card relative overflow-hidden p-3 sm:p-4 md:p-5 rounded-2xl bg-card border border-card-border hover:border-primary/40 shadow-sm hover:shadow-xl hover:shadow-primary/5 backdrop-blur-xl transition-all duration-300 before:absolute before:top-0 before:inset-x-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-emerald-500/50 before:to-transparent">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2.5">
          <span className="text-[11px] sm:text-xs font-semibold text-text-muted truncate">{t('peers_title')}</span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl sm:text-2xl md:text-3xl font-bold font-mono text-text-main tabular-nums">
            {peerCount}
          </span>
          <span className="text-[10px] sm:text-xs text-text-muted font-medium truncate">
            {peerCount === 1 ? 'peer' : 'peers'}
          </span>
        </div>
        <div className="text-[10px] sm:text-xs text-text-muted mt-1.5 sm:mt-2.5 flex items-center gap-1.5 truncate">
          <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${peerCount > 0 ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-600'}`} />
          <span className="truncate">{t('peers_desc')}</span>
        </div>
      </div>

      {/* 3. Average Latency */}
      <div className="interactive-card relative overflow-hidden p-3 sm:p-4 md:p-5 rounded-2xl bg-card border border-card-border hover:border-primary/40 shadow-sm hover:shadow-xl hover:shadow-primary/5 backdrop-blur-xl transition-all duration-300 before:absolute before:top-0 before:inset-x-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-purple-500/50 before:to-transparent">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2.5">
          <span className="text-[11px] sm:text-xs font-semibold text-text-muted truncate">{t('latency_title')}</span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="text-xl sm:text-2xl md:text-3xl font-bold font-mono text-primary tabular-nums truncate">
          {avgLatency}
        </div>
        <div className="text-[10px] sm:text-xs text-text-muted mt-1.5 sm:mt-2.5 truncate">{t('latency_desc')}</div>
      </div>

      {/* 4. Host Server Resources (CPU & RAM) */}
      <div className="interactive-card relative overflow-hidden p-3 sm:p-4 md:p-5 rounded-2xl bg-card border border-card-border hover:border-primary/40 shadow-sm hover:shadow-xl hover:shadow-primary/5 backdrop-blur-xl transition-all duration-300 before:absolute before:top-0 before:inset-x-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-amber-500/50 before:to-transparent">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          <span className="text-[11px] sm:text-xs font-semibold text-text-muted truncate">{t('resources_title')}</span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>

        {/* CPU Meter */}
        <div className="space-y-0.5 sm:space-y-1">
          <div className="flex justify-between text-[10px] sm:text-xs font-medium">
            <span className="text-text-muted truncate">{t('cpu_usage')}</span>
            <span className="font-mono font-semibold text-text-main tabular-nums">{cpuPct}%</span>
          </div>
          <div className="h-1.5 sm:h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5" role="progressbar" aria-label={t('cpu_usage')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={cpuPct}>
            <div
              className={`h-full rounded-full transition-all duration-500 shadow-sm ${
                cpuPct > 85
                  ? 'bg-rose-500 shadow-rose-500/50'
                  : cpuPct > 60
                  ? 'bg-amber-400 shadow-amber-400/50'
                  : 'bg-primary shadow-primary/50'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, cpuPct))}%` }}
            />
          </div>
        </div>

        {/* RAM Meter */}
        <div className="space-y-0.5 sm:space-y-1 mt-1.5 sm:mt-2.5">
          <div className="flex justify-between text-[10px] sm:text-xs font-medium">
            <span className="text-text-muted truncate">{t('ram_usage')}</span>
            <span className="font-mono font-semibold text-text-main tabular-nums truncate">
              {ramPct}%{usedRamStr && totalRamStr ? <span className="hidden sm:inline text-text-muted font-normal"> ({usedRamStr})</span> : ''}
            </span>
          </div>
          <div className="h-1.5 sm:h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5" role="progressbar" aria-label={t('ram_usage')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ramPct}>
            <div
              className={`h-full rounded-full transition-all duration-500 shadow-sm ${
                ramPct > 85
                  ? 'bg-rose-500 shadow-rose-500/50'
                  : ramPct > 70
                  ? 'bg-amber-400 shadow-amber-400/50'
                  : 'bg-sky-400 shadow-sky-400/50'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, ramPct))}%` }}
            />
          </div>
        </div>

        {/* Uptime & Load */}
        <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-text-muted mt-2 sm:mt-3 pt-1.5 sm:pt-2 border-t border-white/5 font-mono">
          <span className="truncate max-w-[70px] sm:max-w-[120px]">
            {system.uptime_str || '--'}
          </span>
          <span className="truncate max-w-[70px] sm:max-w-none">
            {Array.isArray(system.load_avg) && system.load_avg.length ? `${system.load_avg[0]}` : '--'}
          </span>
        </div>
      </div>
    </div>
  );
};
