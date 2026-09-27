import React, { useState, useEffect, useId } from 'react';
import { LiveSpeedtest, Peer, SpeedtestData } from '../../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CheckCircle2, Gauge, Info, Loader2, Rocket, ShieldCheck, Target, Zap } from 'lucide-react';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { formatCount, formatNumber, localizeDigits } from '../../i18n/format';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { RoutePicker } from '../RoutePicker';
import { LoadingDots } from '../LoadingSpinner';
import { FlowRoute } from '../Live/FlowRoute';
import { GaugePhase, SpeedGauge } from '../Live/SpeedGauge';
import { btnPrimary, cardClass, labelClass, Pill, SectionHeader, Segmented, selectClass, StatusDot } from '../ui';

interface SpeedtestTabProps {
  peers: Peer[];
  targetIp: string;
  onTargetChange: (ip: string) => void;
  isRunning: boolean;
  onRun: (target: string, protocol: 'tcp' | 'udp', duration: number, bandwidth: string, source?: string) => void;
  lastResult: SpeedtestData | null;
  /** Snapshot of the test while it runs; drives the gauge and chart in real time. */
  live: LiveSpeedtest | null;
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

export const SpeedtestTab: React.FC<SpeedtestTabProps> = ({ peers, targetIp, onTargetChange, isRunning, onRun, lastResult, live, isRtl, t }) => {
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
  const routeSource = (isRunning ? live?.params.source : lastResult?.source) || sourceIp;
  const routeTarget = (isRunning ? live?.params.target : lastResult?.target) || targetIp;
  const nameOf = (ip: string) => peers.find((p) => p.ipv4 === ip)?.hostname || ip;
  const num = (v: string | number) => localizeDigits(v, t);
  const percent = (v: string | number) => t('percent').replace('{n}', num(v));

  // While running, everything is derived from the live samples; afterwards from the final result.
  const liveSamples = (isRunning && live?.samples) || [];
  const intervals = isRunning ? liveSamples : lastResult?.intervals || [];
  const summary = lastResult?.summary;
  const finalSpeed = summary ? Number(summary.sent_mbps || summary.received_mbps || summary.mbps || 0) : 0;
  const liveSpeed = liveSamples.length ? liveSamples[liveSamples.length - 1].mbps : 0;
  const speed = isRunning ? liveSpeed : finalSpeed;
  const peak = Math.max(speed, ...intervals.map((i) => i.mbps));
  const average = intervals.length ? intervals.reduce((sum, i) => sum + i.mbps, 0) / intervals.length : 0;
  const phase: GaugePhase = isRunning
    ? liveSamples.length || live?.phase === 'running'
      ? 'running'
      : 'connecting'
    : lastResult
      ? 'done'
      : 'idle';
  const resultProto = (isRunning ? live?.params.protocol : summary?.jitter_ms !== undefined ? 'udp' : lastResult ? 'tcp' : undefined) || protocol;
  const testDuration = (isRunning ? live?.params.duration : lastResult?.duration) || duration;
  const secondsDone = isRunning ? liveSamples[liveSamples.length - 1]?.end ?? 0 : lastResult ? testDuration : 0;
  const progress = Math.min(1, secondsDone / testDuration);
  const liveBytes = liveSamples.reduce((sum, i) => sum + (i.bytes || 0), 0);
  const liveRetransmits = liveSamples.reduce((sum, i) => sum + (i.retransmits || 0), 0);
  const shownSpeed = useAnimatedNumber(speed, { tau: 380 });
  const speedText = formatNumber(shownSpeed, t, shownSpeed >= 1000 ? 0 : shownSpeed >= 100 ? 1 : 2);
  const mbpsText = (v: number) => `${formatNumber(v, t, v >= 1000 ? 0 : 1)} Mbps`;

  const transferred = isRunning
    ? liveSamples.length
      ? num(formatBytes(liveBytes))
      : '—'
    : summary
      ? num(formatBytes(summary.total_bytes_received || summary.total_bytes_sent || summary.total_bytes))
      : '—';
  const pending = isRunning ? '…' : '—';
  const jitter = summary?.jitter_ms !== undefined ? `${num(summary.jitter_ms)} ${t('unit_ms')}` : summary ? t('speed_na') : pending;
  const loss = summary?.loss_percent !== undefined ? percent(summary.loss_percent) : summary ? percent(0) : pending;
  const retransmits = isRunning
    ? resultProto === 'tcp' && liveSamples.length
      ? formatCount(liveRetransmits, t)
      : pending
    : summary
      ? formatCount(Number(summary.retransmits ?? summary.lost_packets ?? 0), t)
      : '—';

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
      <section aria-label={t('speed_result_label')} className={`${cardClass} lg:col-span-7 relative overflow-hidden flex flex-col p-4 sm:p-6 min-h-[22rem]`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {routeSource && routeTarget ? (
            <FlowRoute from={nameOf(routeSource)} to={nameOf(routeTarget)} active={phase === 'running'} mbps={speed} />
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            {isRemoteRunner && <Pill tone="info" title={formatText(t('speed_remote_runner'), { ip: sourceIp })}>{t('ping_remote_runner')}</Pill>}
            <Pill tone="success" icon={<ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />} title={t('speed_isolation_badge')}>
              <span className="hidden sm:inline">{t('speed_isolation_short')}</span>
              <span className="sm:hidden">iperf3</span>
            </Pill>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center pt-6 pb-4">
          <SpeedGauge value={speed} peak={peak} phase={phase} formatTick={num}>
            <p className="text-xs font-medium text-text-muted">{t(resultProto === 'udp' ? 'speed_unit_udp' : 'speed_unit_tcp')}</p>
            <p
              className={`font-mono font-bold tabular-nums leading-tight whitespace-nowrap ${
                speedText.length > 5 ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl'
              } ${phase === 'idle' ? 'text-text-subtle' : 'text-primary'}`}
            >
              {speedText}
              <span className="ms-1.5 text-base sm:text-lg font-semibold text-text-muted">Mbps</span>
            </p>
          </SpeedGauge>

          <div className="mt-3 w-full max-w-[16rem] flex flex-col items-center gap-2">
            <p role="status" className="inline-flex items-center gap-2 h-6 text-sm font-medium">
              {phase === 'connecting' && (
                <>
                  <span className="text-text-muted">{t('speed_phase_connecting')}</span>
                  <LoadingDots className="text-primary" />
                </>
              )}
              {phase === 'running' && (
                <>
                  <StatusDot tone="primary" pulse />
                  <span className="text-primary">{t('speed_phase_running')}</span>
                </>
              )}
              {phase === 'done' && (
                <>
                  <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" />
                  <span className="text-text-primary">{t('speed_phase_done')}</span>
                </>
              )}
            </p>
            {phase !== 'idle' ? (
              <>
                <div className="w-full h-1.5 rounded-full bg-surface border border-card-border overflow-hidden" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-linear"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <p className="text-2xs text-text-muted tabular-nums">
                  {formatText(t('speed_progress'), { s: formatCount(Math.round(secondsDone), t), total: formatCount(testDuration, t) })}
                </p>
              </>
            ) : (
              <p className="max-w-xs text-center text-sm text-text-muted">{t('speed_idle_hint')}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <Metric label={t('speed_metric_transferred')} value={transferred} />
          <Metric label={t('speed_metric_peak')} value={intervals.length ? mbpsText(peak) : phase === 'idle' ? '—' : pending} />
          <Metric label={t('speed_metric_avg')} value={intervals.length ? mbpsText(average) : phase === 'idle' ? '—' : pending} />
          <Metric label={t('speed_metric_jitter')} value={jitter} />
          <Metric label={t('speed_metric_loss')} value={loss} />
          <Metric label={t('speed_metric_retrans')} value={retransmits} />
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
                    type="number"
                    // A fixed time axis lets the curve grow across the chart as seconds arrive.
                    domain={[0, Math.max(1, testDuration - 1)]}
                    allowDecimals={false}
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
                  <Area
                    type="monotone"
                    dataKey="mbps"
                    stroke="rgb(var(--primary-rgb))"
                    strokeWidth={2}
                    fill="url(#speedGradient)"
                    dot={isRunning ? { r: 2.5, fill: 'rgb(var(--primary-rgb))', strokeWidth: 0 } : false}
                    isAnimationActive={!isRunning}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
