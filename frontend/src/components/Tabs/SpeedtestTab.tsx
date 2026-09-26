import React, { useState, useEffect, useId } from 'react';
import { Peer, SpeedtestData } from '../../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ArrowRight, Gauge, Info, Loader2, Rocket, ShieldCheck, Target, Zap } from 'lucide-react';
import type { Translate } from '../../i18n/translations';
import { fillTemplate, formatText } from '../../i18n/fillTemplate';
import { formatCount, localizeDigits } from '../../i18n/format';
import { RoutePicker } from '../RoutePicker';
import { LoadingSpinner } from '../LoadingSpinner';
import { btnPrimary, cardClass, labelClass, Pill, SectionHeader, Segmented, selectClass } from '../ui';

interface SpeedtestTabProps {
  peers: Peer[];
  targetIp: string;
  onTargetChange: (ip: string) => void;
  isRunning: boolean;
  onRun: (target: string, protocol: 'tcp' | 'udp', duration: number, bandwidth: string, source?: string) => void;
  lastResult: SpeedtestData | null;
  /** Mirrors the chart's time axis for right-to-left reading. */
  isRtl: boolean;
  t: Translate;
}

type Preset = 'quick' | 'max' | 'udp';

const formatBytes = (bytes?: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const Metric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="p-3 rounded-xl bg-card border border-card-border">
    <p className="text-xs text-text-muted truncate">{label}</p>
    <p className="mt-1 font-mono text-sm font-semibold text-text-primary tabular-nums truncate">
      {value}
    </p>
  </div>
);

export const SpeedtestTab: React.FC<SpeedtestTabProps> = ({ peers, targetIp, onTargetChange, isRunning, onRun, lastResult, isRtl, t }) => {
  const [protocol, setProtocol] = useState<'tcp' | 'udp'>('tcp');
  const [duration, setDuration] = useState<number>(5);
  const [bandwidth, setBandwidth] = useState<string>('50M');
  const [preset, setPreset] = useState<Preset | null>(null);
  const fieldId = useId();

  const currentPeer = peers.find((p) => p.is_current);
  const [sourceIp, setSourceIp] = useState<string>(() => currentPeer?.ipv4 || (peers.length > 0 ? peers[0].ipv4 : ''));

  // Synchronize sourceIp when peers list updates
  useEffect(() => {
    if (!sourceIp && peers.length > 0) {
      const cur = peers.find((p) => p.is_current) || peers[0];
      if (cur) setSourceIp(cur.ipv4);
    }
  }, [peers, sourceIp]);

  // If targetIp is empty or identical to sourceIp, auto-pick another candidate peer
  useEffect(() => {
    if (peers.length > 1 && (!targetIp || targetIp === sourceIp)) {
      const candidate = peers.find((p) => p.ipv4 !== sourceIp);
      if (candidate) onTargetChange(candidate.ipv4);
    }
  }, [peers, sourceIp, targetIp, onTargetChange]);

  const sourcePeer = peers.find((p) => p.ipv4 === sourceIp);
  const selectedPeer = peers.find((p) => p.ipv4 === targetIp);

  const handleSourceChange = (newSource: string) => {
    setSourceIp(newSource);
    if (targetIp === newSource) {
      const nextTarget = peers.find((p) => p.ipv4 !== newSource);
      if (nextTarget) onTargetChange(nextTarget.ipv4);
    }
  };

  const handleTargetChange = (newTarget: string) => {
    onTargetChange(newTarget);
    if (sourceIp === newTarget) {
      const nextSource = peers.find((p) => p.ipv4 !== newTarget);
      if (nextSource) setSourceIp(nextSource.ipv4);
    }
  };

  const handleSwap = () => {
    if (!targetIp || !sourceIp) return;
    const oldSource = sourceIp;
    setSourceIp(targetIp);
    onTargetChange(oldSource);
  };

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'quick') {
      setProtocol('tcp');
      setDuration(3);
    } else if (p === 'max') {
      setProtocol('tcp');
      setDuration(10);
    } else {
      setProtocol('udp');
      setDuration(5);
      setBandwidth('50M');
    }
  };

  const handleStart = () => {
    if (!targetIp) return;
    onRun(targetIp, protocol, duration, bandwidth, sourceIp);
  };

  const isRemoteRunner = sourcePeer && !sourcePeer.is_current;
  const routeSource = lastResult?.source || sourceIp;
  const routeTarget = lastResult?.target || targetIp;
  const nameOf = (ip: string) => peers.find((p) => p.ipv4 === ip)?.hostname || ip;
  const speed = lastResult ? lastResult.summary.sent_mbps || lastResult.summary.received_mbps || lastResult.summary.mbps || '0.00' : null;
  const resultProto = lastResult?.summary.jitter_ms !== undefined ? 'udp' : protocol;
  const intervals = lastResult?.intervals || [];
  const num = (v: string | number) => localizeDigits(v, t);
  const percent = (v: string | number) => t('percent').replace('{n}', num(v));

  const presets: { id: Preset; icon: React.ReactNode; title: string; sub: string }[] = [
    { id: 'quick', icon: <Rocket className="w-4 h-4" />, title: t('speed_profile_quick'), sub: t('speed_profile_quick_sub') },
    { id: 'max', icon: <Gauge className="w-4 h-4" />, title: t('speed_profile_max'), sub: t('speed_profile_max_sub') },
    { id: 'udp', icon: <Target className="w-4 h-4" />, title: t('speed_profile_udp'), sub: t('speed_profile_udp_sub') },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Controls */}
      <section aria-labelledby="speed-heading" className={`${cardClass} lg:col-span-5 p-4 sm:p-6 space-y-5`}>
        <SectionHeader id="speed-heading" icon={<Zap className="w-[18px] h-[18px]" />} title={t('speed_panel_title')} description={t('speed_panel_desc')} />

        <div className="space-y-2">
          <p className={labelClass}>{t('speed_profiles_label')}</p>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyPreset(p.id)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                    active ? 'border-primary bg-primary-subtle' : 'border-card-border hover:border-border-strong hover:bg-hover'
                  }`}
                >
                  <span className={active ? 'text-primary' : 'text-text-muted'} aria-hidden="true">
                    {p.icon}
                  </span>
                  <span className="text-sm font-semibold text-text-primary">{p.title}</span>
                  <span className="text-2xs text-text-muted">{p.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        <RoutePicker
          peers={peers}
          source={sourceIp}
          target={targetIp}
          onSourceChange={handleSourceChange}
          onTargetChange={handleTargetChange}
          onSwap={handleSwap}
          sourceLabel={t('speed_source_label')}
          targetLabel={t('speed_dest_label')}
          sourcePlaceholder={t('speed_source_placeholder')}
          targetPlaceholder={t('speed_dest_placeholder')}
          swapLabel={t('speed_swap_nodes')}
          currentLabel={t('route_this_server')}
          stacked
        />

        <div className="space-y-2">
          <p className={labelClass}>{t('speed_proto_label')}</p>
          <Segmented
            block
            value={protocol}
            onChange={(v) => {
              setProtocol(v);
              setPreset(null);
            }}
            ariaLabel={t('speed_proto_label')}
            options={[
              { value: 'tcp', label: t('speed_proto_tcp') },
              { value: 'udp', label: t('speed_proto_udp') },
            ]}
          />
          <p className="text-xs text-text-muted leading-relaxed">{protocol === 'tcp' ? t('speed_proto_help_tcp') : t('speed_proto_help_udp')}</p>
        </div>

        <div className={`grid gap-4 ${protocol === 'udp' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {protocol === 'udp' && (
            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor={`${fieldId}-bw`} className={labelClass}>
                {t('speed_bandwidth_label')}
              </label>
              <select
                id={`${fieldId}-bw`}
                value={bandwidth}
                onChange={(e) => {
                  setBandwidth(e.target.value);
                  setPreset(null);
                }}
                className={`${selectClass} h-11`}
              >
                {[
                  ['20M', 20, 'Mbps'],
                  ['50M', 50, 'Mbps'],
                  ['100M', 100, 'Mbps'],
                  ['300M', 300, 'Mbps'],
                  ['1G', 1, 'Gbps'],
                ].map(([value, n, unit]) => (
                  <option key={value} value={value}>
                    {num(n)} {unit}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-0">
            <label htmlFor={`${fieldId}-dur`} className={labelClass}>
              {t('speed_duration_label')}
            </label>
            <select
              id={`${fieldId}-dur`}
              value={duration}
              onChange={(e) => {
                setDuration(Number(e.target.value));
                setPreset(null);
              }}
              className={`${selectClass} h-11`}
            >
              <option value={3}>{t('speed_duration_quick')}</option>
              <option value={5}>{t('speed_duration_std')}</option>
              <option value={10}>{t('speed_duration_ext')}</option>
              <option value={15}>{t('speed_duration_tho')}</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={!targetIp || !sourceIp || targetIp === sourceIp || isRunning}
          type="button"
          className={`${btnPrimary} w-full h-12`}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>{t('speed_running_short')}</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" aria-hidden="true" />
              <span>{t('speed_btn_start')}</span>
            </>
          )}
        </button>

        <p className="flex items-start gap-2 pt-4 border-t border-card-border text-xs text-text-muted leading-relaxed">
          <Info className="w-3.5 h-3.5 mt-[0.2em] shrink-0 text-text-subtle" aria-hidden="true" />
          <span>{t('speed_footer_note')}</span>
        </p>
      </section>

      {/* Result */}
      <section aria-label={t('speed_result_label')} aria-live="polite" className={`${cardClass} lg:col-span-7 relative overflow-hidden flex flex-col p-4 sm:p-6 min-h-[22rem]`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {routeSource && routeTarget ? (
            <span className="inline-flex items-center gap-2 min-w-0 max-w-full h-8 px-3 rounded-full bg-surface border border-card-border text-sm">
              <bdi className="font-medium text-text-primary truncate">{nameOf(routeSource)}</bdi>
              <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0 rtl:-scale-x-100" aria-hidden="true" />
              <bdi className="font-medium text-text-primary truncate">{nameOf(routeTarget)}</bdi>
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            {isRemoteRunner && <Pill tone="info">{t('ping_remote_runner')}</Pill>}
            <Pill tone="success" icon={<ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />} title={t('speed_isolation_badge')}>
              <span className="hidden sm:inline">{t('speed_isolation_short')}</span>
              <span className="sm:hidden">iperf3</span>
            </Pill>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <p className="text-xs font-medium text-text-muted">{t(resultProto === 'udp' ? 'speed_unit_udp' : 'speed_unit_tcp')}</p>
          <p className={`mt-1 font-mono text-5xl sm:text-6xl font-bold tabular-nums ${speed ? 'text-primary' : 'text-text-subtle'}`}>
            {num(speed ?? '0.00')}
            <span className="ms-2 text-lg sm:text-xl font-semibold text-text-muted">Mbps</span>
          </p>
          {!lastResult && !isRunning && <p className="mt-3 max-w-xs text-sm text-text-muted">{t('speed_idle_hint')}</p>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Metric
            label={t('speed_metric_transferred')}
            value={
              lastResult
                ? num(formatBytes(lastResult.summary.total_bytes_received || lastResult.summary.total_bytes_sent || lastResult.summary.total_bytes))
                : '—'
            }
          />
          <Metric
            label={t('speed_metric_jitter')}
            value={lastResult?.summary.jitter_ms !== undefined ? `${num(lastResult.summary.jitter_ms)} ms` : lastResult ? t('speed_na') : '—'}
          />
          <Metric
            label={t('speed_metric_loss')}
            value={lastResult?.summary.loss_percent !== undefined ? percent(lastResult.summary.loss_percent) : lastResult ? percent(0) : '—'}
          />
          <Metric label={t('speed_metric_retrans')} value={lastResult ? formatCount(Number(lastResult.summary.retransmits ?? lastResult.summary.lost_packets ?? 0), t) : '—'} />
        </div>

        {intervals.length > 0 && (
          <div className="mt-5 pt-4 border-t border-card-border">
            <div className="flex items-center justify-between mb-2 text-xs text-text-muted">
              <span>{t('speed_chart_title')}</span>
              <span>{formatText(t('speed_chart_duration'), { n: formatCount(intervals.length, t) })}</span>
            </div>
            <div className="h-32 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={intervals} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--primary-rgb))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="rgb(var(--primary-rgb))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="interval"
                    reversed={isRtl}
                    tick={{ fill: 'var(--text-subtle)', fontSize: 10 }}
                    tickFormatter={(v) => num(v)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    orientation={isRtl ? 'right' : 'left'}
                    width={36}
                    tick={{ fill: 'var(--text-subtle)', fontSize: 10 }}
                    tickFormatter={(v) => num(v)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--border-strong)' }}
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 10,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                    }}
                    itemStyle={{ color: 'rgb(var(--primary-rgb))' }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                    formatter={(val: any) => [`${num(val)} Mbps`, t('speed_chart_series')]}
                    labelFormatter={(label: any) => formatText(t('speed_chart_time'), { s: num(label) })}
                  />
                  <Area type="monotone" dataKey="mbps" stroke="rgb(var(--primary-rgb))" strokeWidth={2} fill="url(#speedGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6 text-center bg-card animate-fade-in">
            <LoadingSpinner size="lg" label={t('speed_running')} sublabel={fillTemplate(t('route_from_to'), { from: <bdi>{sourcePeer?.hostname || sourceIp}</bdi>, to: <bdi>{selectedPeer?.hostname || targetIp}</bdi> })} />
            {isRemoteRunner && <Pill tone="info">{formatText(t('speed_remote_runner'), { ip: sourceIp })}</Pill>}
          </div>
        )}
      </section>
    </div>
  );
};
