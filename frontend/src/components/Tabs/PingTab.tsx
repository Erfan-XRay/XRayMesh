import React, { useState, useEffect, useId } from 'react';
import { LivePing, Peer, PingResult } from '../../types';
import { Activity, ChevronDown, Loader2, Send, Terminal } from 'lucide-react';
import type { Translate } from '../../i18n/translations';
import { formatCount } from '../../i18n/format';
import { toAsciiDigits } from '../../utils/meshInvite';
import { RoutePicker } from '../RoutePicker';
import { PingLive } from '../Live/PingLive';
import { btnPrimary, cardClass, inputClass, labelClass, Pill, SectionHeader, Segmented } from '../ui';

interface PingTabProps {
  peers: Peer[];
  targetIp: string;
  onTargetChange: (ip: string) => void;
  isRunning: boolean;
  onRun: (target: string, count: number, source?: string) => void;
  lastResult: PingResult | null;
  /** Snapshot of the ping while it runs; each reply animates as it arrives. */
  live: LivePing | null;
  t: Translate;
}

export const PingTab: React.FC<PingTabProps> = ({ peers, targetIp, onTargetChange, isRunning, onRun, lastResult, live, t }) => {
  const [count, setCount] = useState<number>(4);
  const targetId = useId();

  const currentPeer = peers.find((p) => p.is_current);
  const [sourceIp, setSourceIp] = useState<string>(() => currentPeer?.ipv4 || (peers.length > 0 ? peers[0].ipv4 : ''));

  // Synchronize sourceIp when peers become available
  useEffect(() => {
    if (!sourceIp && peers.length > 0) {
      const cur = peers.find((p) => p.is_current) || peers[0];
      if (cur) setSourceIp(cur.ipv4);
    }
  }, [peers, sourceIp]);

  // If targetIp is empty or identical to sourceIp, auto-pick candidate peer
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

  const handleSwap = () => {
    if (!targetIp || !sourceIp) return;
    const oldSource = sourceIp;
    setSourceIp(targetIp);
    onTargetChange(oldSource);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetIp.trim() || !sourceIp) return;
    onRun(targetIp.trim(), count, sourceIp);
  };

  const isRemoteRunner = sourcePeer && !sourcePeer.is_current;
  const resultSource = (isRunning ? live?.params.source : lastResult?.source) || sourceIp;
  const resultTarget = (isRunning ? live?.params.target : lastResult?.target) || targetIp;
  const nameOf = (ip: string) => peers.find((p) => p.ipv4 === ip)?.hostname || ip;
  const canSend = Boolean(targetIp.trim() && sourceIp && targetIp.trim() !== sourceIp && !isRunning);
  const replies = isRunning ? live?.samples || [] : lastResult?.replies || [];
  const probeCount = (isRunning ? live?.params.count : lastResult?.count) || count;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <section aria-labelledby="ping-heading" className={`${cardClass} lg:col-span-5 p-4 sm:p-6`}>
        <SectionHeader
          id="ping-heading"
          icon={<Activity className="w-[18px] h-[18px]" />}
          title={t('ping_panel_title')}
          description={t('ping_panel_desc')}
          actions={isRemoteRunner ? <Pill tone="info">{t('ping_remote_runner')}</Pill> : undefined}
          className="mb-6"
        />

        <form onSubmit={handleSend} className="space-y-5">
          <RoutePicker
            peers={peers}
            source={sourceIp}
            target={targetIp}
            onSourceChange={handleSourceChange}
            onTargetChange={onTargetChange}
            onSwap={handleSwap}
            sourceLabel={t('ping_source_label')}
            targetLabel={t('ping_dest_label')}
            sourcePlaceholder={t('ping_source_placeholder')}
            targetPlaceholder={t('ping_dest_select_placeholder')}
            swapLabel={t('ping_swap_nodes')}
            currentLabel={t('route_this_server')}
            stacked
          />

          <div className="flex flex-col gap-1.5 min-w-0">
            <label htmlFor={targetId} className={labelClass}>
              {t('ping_target_ip_label')}
            </label>
            <input
              id={targetId}
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={targetIp}
              onChange={(e) => onTargetChange(toAsciiDigits(e.target.value))}
              placeholder="10.144.144.2"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass()} h-11 font-mono`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelClass} id={`${targetId}-count`}>
              {t('ping_count_label')}
            </span>
            <Segmented
              block
              value={count}
              onChange={setCount}
              ariaLabel={t('ping_count_label')}
              className="h-11"
              options={[4, 8, 10].map((n) => ({ value: n, label: formatCount(n, t) }))}
            />
          </div>

          <button type="submit" disabled={!canSend} className={`${btnPrimary} h-12 w-full`}>
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>{t('ping_running')}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
                <span>{t('ping_btn_send')}</span>
              </>
            )}
          </button>
        </form>
      </section>

      <section aria-label={t('ping_result_label')} className={`${cardClass} lg:col-span-7 flex flex-col gap-5 p-4 sm:p-6 min-h-[22rem]`}>
        <PingLive
          from={resultSource ? nameOf(resultSource) : '—'}
          to={resultTarget ? nameOf(resultTarget) : '—'}
          replies={replies}
          count={probeCount}
          running={isRunning}
          result={isRunning ? null : lastResult}
          t={t}
        />

        {lastResult && !isRunning && (
          <details className="group rounded-xl bg-surface border border-card-border overflow-hidden">
            <summary className="flex items-center gap-2 px-3.5 min-h-11 text-sm font-medium text-text-muted hover:text-text-primary cursor-pointer select-none">
              <Terminal className="w-4 h-4" aria-hidden="true" />
              <span className="flex-1">{t('ping_raw_output')}</span>
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <pre className="px-3.5 pb-3.5 max-h-72 overflow-auto text-start font-mono text-xs text-text-secondary whitespace-pre-wrap break-all leading-relaxed" dir="ltr">
              {lastResult.raw}
            </pre>
          </details>
        )}
      </section>
    </div>
  );
};
