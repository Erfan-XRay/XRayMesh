import React, { useState } from 'react';
import { Peer, SpeedtestData } from '../../types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ShieldCheck, Zap, Rocket, Target, Loader2 } from 'lucide-react';

interface SpeedtestTabProps {
  peers: Peer[];
  targetIp: string;
  onTargetChange: (ip: string) => void;
  isRunning: boolean;
  onRun: (target: string, protocol: 'tcp' | 'udp', duration: number, bandwidth: string) => void;
  lastResult: SpeedtestData | null;
  t: (key: any) => string;
}

export const SpeedtestTab: React.FC<SpeedtestTabProps> = ({
  peers,
  targetIp,
  onTargetChange,
  isRunning,
  onRun,
  lastResult,
  t,
}) => {
  const [protocol, setProtocol] = useState<'tcp' | 'udp'>('tcp');
  const [duration, setDuration] = useState<number>(5);
  const [bandwidth, setBandwidth] = useState<string>('50M');

  // Selected peer preview
  const selectedPeer = peers.find((p) => p.ipv4 === targetIp);

  const applyPreset = (preset: 'quick' | 'max' | 'udp') => {
    if (preset === 'quick') {
      setProtocol('tcp');
      setDuration(3);
    } else if (preset === 'max') {
      setProtocol('tcp');
      setDuration(10);
    } else if (preset === 'udp') {
      setProtocol('udp');
      setDuration(5);
      setBandwidth('50M');
    }
  };

  const handleStart = () => {
    if (!targetIp) return;
    onRun(targetIp, protocol, duration, bandwidth);
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-base font-bold text-text-main flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            {t('speed_panel_title')}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">{t('speed_panel_desc')}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            <ShieldCheck className="w-4 h-4" />
            <span>{t('speed_isolation_badge')}</span>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            iperf3
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Quick Profiles */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              {t('speed_profiles_label')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('quick')}
                className="flex flex-col items-center p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-primary/10 text-xs transition-all"
              >
                <Rocket className="w-4 h-4 text-primary mb-1" />
                <span className="font-semibold text-text-main">{t('speed_profile_quick')}</span>
                <span className="text-[10px] text-text-muted">{t('speed_profile_quick_sub')}</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('max')}
                className="flex flex-col items-center p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-primary/10 text-xs transition-all"
              >
                <Zap className="w-4 h-4 text-amber-400 mb-1" />
                <span className="font-semibold text-text-main">{t('speed_profile_max')}</span>
                <span className="text-[10px] text-text-muted">{t('speed_profile_max_sub')}</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('udp')}
                className="flex flex-col items-center p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-primary/10 text-xs transition-all"
              >
                <Target className="w-4 h-4 text-emerald-400 mb-1" />
                <span className="font-semibold text-text-main">{t('speed_profile_udp')}</span>
                <span className="text-[10px] text-text-muted">{t('speed_profile_udp_sub')}</span>
              </button>
            </div>
          </div>

          {/* Target Selector */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              {t('speed_dest_label')}
            </label>
            <select
              value={targetIp}
              onChange={(e) => onTargetChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/80 border border-white/15 rounded-xl text-xs sm:text-sm font-mono text-text-main focus:outline-none focus:border-primary"
            >
              <option value="">{t('speed_dest_placeholder')}</option>
              {peers.filter((p) => !p.is_current).map((p) => (
                <option key={p.ipv4} value={p.ipv4}>
                  {p.ipv4} ({p.hostname || 'Peer'}) - {p.lat_ms || '0'}ms
                </option>
              ))}
            </select>

            {/* Target Preview Chip */}
            {selectedPeer && (
              <div className="flex items-center gap-2 mt-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-text-muted">
                <Target className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="truncate">
                  {t('speed_target_chip_prefix')}: <strong className="text-text-main font-mono">{selectedPeer.ipv4}</strong> ({selectedPeer.hostname || 'Node'}) &bull;{' '}
                  <span className="text-primary font-mono">{selectedPeer.lat_ms ? `${selectedPeer.lat_ms} ms` : '< 1ms'}</span> &bull;{' '}
                  <span className="text-emerald-400">{selectedPeer.cost === 1 || selectedPeer.cost === '1' ? t('peer_direct_badge') : `${t('peer_relayed_badge')} (${selectedPeer.cost})`}</span>
                </span>
              </div>
            )}
          </div>

          {/* Protocol Selection */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              {t('speed_proto_label')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProtocol('tcp')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                  protocol === 'tcp'
                    ? 'bg-primary/15 border-primary text-primary font-semibold shadow-sm'
                    : 'bg-white/5 border-white/10 text-text-muted hover:text-text-main'
                }`}
              >
                {t('speed_proto_tcp')}
              </button>
              <button
                type="button"
                onClick={() => setProtocol('udp')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                  protocol === 'udp'
                    ? 'bg-primary/15 border-primary text-primary font-semibold shadow-sm'
                    : 'bg-white/5 border-white/10 text-text-muted hover:text-text-main'
                }`}
              >
                {t('speed_proto_udp')}
              </button>
            </div>
            <p className="text-[11px] text-text-subtle mt-1.5">
              {protocol === 'tcp' ? t('speed_proto_help_tcp') : t('speed_proto_help_udp')}
            </p>
          </div>

          {/* UDP Bandwidth (only if UDP) */}
          {protocol === 'udp' && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                {t('speed_bandwidth_label')}
              </label>
              <select
                value={bandwidth}
                onChange={(e) => setBandwidth(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/80 border border-white/15 rounded-xl text-xs sm:text-sm font-mono text-text-main focus:outline-none focus:border-primary"
              >
                <option value="20M">20 Mbps</option>
                <option value="50M">50 Mbps</option>
                <option value="100M">100 Mbps</option>
                <option value="300M">300 Mbps</option>
                <option value="1G">1 Gbps</option>
              </select>
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              {t('speed_duration_label')}
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900/80 border border-white/15 rounded-xl text-xs sm:text-sm font-mono text-text-main focus:outline-none focus:border-primary"
            >
              <option value={3}>{t('speed_duration_quick')}</option>
              <option value={5}>{t('speed_duration_std')}</option>
              <option value={10}>{t('speed_duration_ext')}</option>
              <option value={15}>{t('speed_duration_tho')}</option>
            </select>
          </div>

          {/* Run Button */}
          <button
            onClick={handleStart}
            disabled={!targetIp || isRunning}
            className="w-full py-3 px-4 rounded-xl bg-primary text-black font-semibold text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('speed_running')}</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>{t('speed_btn_start')}</span>
              </>
            )}
          </button>

          {/* Footer note */}
          <div className="pt-3 border-t border-white/5 text-[11px] text-text-muted leading-relaxed">
            {t('speed_footer_note')}
          </div>
        </div>

        {/* Right Column: Visualization & Metrics */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 rounded-2xl bg-slate-900/40 border border-white/10 relative overflow-hidden min-h-[380px]">
          {isRunning && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
              <p className="text-sm font-medium text-primary">{t('speed_running')}</p>
            </div>
          )}

          {/* Speed Number Display */}
          <div className="text-center my-auto py-4">
            <div className="text-5xl md:text-6xl font-black font-mono text-primary tracking-tight tabular-nums">
              {lastResult
                ? protocol === 'tcp'
                  ? lastResult.summary.received_mbps || lastResult.summary.sent_mbps || '0.00'
                  : lastResult.summary.mbps || '0.00'
                : '0.00'}
            </div>
            <div className="text-xs md:text-sm font-mono text-text-muted mt-1 uppercase tracking-wider">
              {protocol === 'tcp' ? 'Mbps (TCP Throughput)' : 'Mbps (UDP Bandwidth)'}
            </div>

            {/* Metrics Chips Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6">
              <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-center">
                <div className="text-[10px] text-text-muted">{t('speed_metric_transferred')}</div>
                <div className="text-sm font-bold font-mono text-text-main mt-0.5 tabular-nums">
                  {lastResult
                    ? formatBytes(
                        lastResult.summary.total_bytes_received ||
                          lastResult.summary.total_bytes_sent ||
                          lastResult.summary.total_bytes
                      )
                    : '--'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-center">
                <div className="text-[10px] text-text-muted">{t('speed_metric_jitter')}</div>
                <div className="text-sm font-bold font-mono text-text-main mt-0.5 tabular-nums">
                  {lastResult?.summary.jitter_ms !== undefined ? `${lastResult.summary.jitter_ms} ms` : 'N/A (TCP)'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-center">
                <div className="text-[10px] text-text-muted">{t('speed_metric_loss')}</div>
                <div className="text-sm font-bold font-mono text-text-main mt-0.5 tabular-nums">
                  {lastResult?.summary.loss_percent !== undefined ? `${lastResult.summary.loss_percent}%` : '0%'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-center">
                <div className="text-[10px] text-text-muted">{t('speed_metric_retrans')}</div>
                <div className="text-sm font-bold font-mono text-text-main mt-0.5 tabular-nums">
                  {lastResult?.summary.retransmits ?? lastResult?.summary.lost_packets ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Recharts Interval Area Chart */}
          {lastResult && lastResult.intervals && lastResult.intervals.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="text-xs font-mono text-text-muted mb-2 flex items-center justify-between">
                <span>{t('speed_chart_title')}</span>
                <span>{lastResult.intervals.length}s</span>
              </div>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lastResult.intervals}>
                    <defs>
                      <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="interval"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      unit="s"
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      unit="M"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                      }}
                      itemStyle={{ color: 'var(--primary)' }}
                      formatter={(val: any) => [`${val} Mbps`, 'Throughput']}
                      labelFormatter={(label: any) => `Time: ${label}s`}
                    />
                    <Area
                      type="monotone"
                      dataKey="mbps"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#speedGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
