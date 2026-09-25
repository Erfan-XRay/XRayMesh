import React, { useState, useEffect } from 'react';
import { Peer, PingResult } from '../../types';
import { Activity, Send, Terminal, ArrowRight } from 'lucide-react';
import { RoutePicker } from '../RoutePicker';
import { LoadingDots } from '../LoadingSpinner';

interface PingTabProps {
  peers: Peer[];
  targetIp: string;
  onTargetChange: (ip: string) => void;
  isRunning: boolean;
  onRun: (target: string, count: number, source?: string) => void;
  lastResult: PingResult | null;
  t: (key: any) => string;
}

export const PingTab: React.FC<PingTabProps> = ({
  peers,
  targetIp,
  onTargetChange,
  isRunning,
  onRun,
  lastResult,
  t,
}) => {
  const [count, setCount] = useState<number>(4);

  // Find default local node
  const currentPeer = peers.find((p) => p.is_current);
  const [sourceIp, setSourceIp] = useState<string>(() => {
    return currentPeer?.ipv4 || (peers.length > 0 ? peers[0].ipv4 : '');
  });

  // Synchronize sourceIp when peers become available
  useEffect(() => {
    if (!sourceIp && peers.length > 0) {
      const cur = peers.find((p) => p.is_current) || peers[0];
      if (cur) setSourceIp(cur.ipv4);
    }
  }, [peers, sourceIp]);

  // If targetIp is empty or identical to sourceIp, auto-pick candidate peer
  useEffect(() => {
    if (peers.length > 1) {
      if (!targetIp || targetIp === sourceIp) {
        const candidate = peers.find((p) => p.ipv4 !== sourceIp);
        if (candidate) {
          onTargetChange(candidate.ipv4);
        }
      }
    }
  }, [peers, sourceIp, targetIp, onTargetChange]);

  const sourcePeer = peers.find((p) => p.ipv4 === sourceIp);

  const handleSourceChange = (newSource: string) => {
    setSourceIp(newSource);
    if (targetIp === newSource) {
      const nextTarget = peers.find((p) => p.ipv4 !== newSource);
      if (nextTarget) {
        onTargetChange(nextTarget.ipv4);
      }
    }
  };

  const handleSwap = () => {
    if (!targetIp || !sourceIp) return;
    const oldSource = sourceIp;
    const oldTarget = targetIp;
    setSourceIp(oldTarget);
    onTargetChange(oldSource);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetIp.trim() || !sourceIp) return;
    onRun(targetIp.trim(), count, sourceIp);
  };

  const isRemoteRunner = sourcePeer && !sourcePeer.is_current;
  const lossPct = Number(lastResult?.packet_loss_percent ?? 0);
  const resultSource = lastResult?.source || sourceIp;
  const resultTarget = lastResult?.target || targetIp;
  const nameOf = (ip: string) => peers.find((p) => p.ipv4 === ip)?.hostname || ip;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0" aria-hidden="true">
            <Activity className="w-[18px] h-[18px]" />
          </span>
          <h2 className="text-base font-bold text-text-main leading-tight">{t('ping_panel_title')}</h2>
        </div>
        {isRemoteRunner && (
          <span className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
            {t('ping_remote_runner')}
          </span>
        )}
      </div>

      <form onSubmit={handleSend} className="space-y-4">
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
        />

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
          <label className="block min-w-0">
            <span className="block text-xs font-medium text-text-muted mb-1.5">{t('ping_target_ip_label')}</span>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={targetIp}
              onChange={(e) => onTargetChange(e.target.value)}
              placeholder="10.144.144.2"
              className="w-full h-11 px-3.5 bg-input border border-card-border rounded-xl text-sm font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary text-start"
            />
          </label>

          <div>
            <span className="block text-xs font-medium text-text-muted mb-1.5">{t('ping_count_label')}</span>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-input border border-card-border" role="radiogroup" aria-label={t('ping_count_label')}>
              {[4, 8, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={count === n}
                  onClick={() => setCount(n)}
                  className={`h-9 sm:w-14 rounded-lg text-sm font-mono font-semibold transition-colors ${
                    count === n ? 'bg-primary text-black' : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={!targetIp.trim() || !sourceIp || targetIp.trim() === sourceIp || isRunning}
          className="btn-interactive w-full sm:w-auto h-11 px-6 rounded-xl bg-primary text-black font-semibold text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
        >
          {isRunning ? (
            <>
              <div className="loader-dual-ring w-4 h-4" />
              <span>{t('ping_running')}</span>
              <LoadingDots />
            </>
          ) : (
            <>
              <Send className="w-4 h-4 rtl:-scale-x-100" />
              <span>{t('ping_btn_send')}</span>
            </>
          )}
        </button>
      </form>

      {lastResult && (
        <div className="mt-6 pt-5 border-t border-card-border space-y-4 animate-modal-in">
          {resultSource && resultTarget && (
            <div className="flex items-center gap-2 min-w-0 text-xs font-mono text-text-muted">
              <span className="text-text-main font-semibold truncate">{nameOf(resultSource)}</span>
              <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0 rtl:-scale-x-100" />
              <span className="text-text-main font-semibold truncate">{nameOf(resultTarget)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: t('ping_min'), value: `${lastResult.min_ms} ms`, cls: 'text-text-main' },
              { label: t('ping_avg'), value: `${lastResult.avg_ms} ms`, cls: 'text-primary' },
              { label: t('ping_max'), value: `${lastResult.max_ms} ms`, cls: 'text-text-main' },
              {
                label: t('ping_loss'),
                value: `${lastResult.packet_loss_percent}%`,
                cls: lossPct === 0 ? 'text-emerald-400' : lossPct < 10 ? 'text-amber-400' : 'text-rose-400',
              },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-xl bg-black/20 border border-white/5">
                <div className="text-[11px] text-text-muted">{m.label}</div>
                <div className={`text-lg font-bold font-mono mt-0.5 tabular-nums ${m.cls}`} dir="ltr">
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          <details className="group rounded-xl bg-black/30 border border-card-border">
            <summary className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-text-muted cursor-pointer select-none">
              <Terminal className="w-3.5 h-3.5" />
              {t('ping_raw_output')}
            </summary>
            <pre className="px-3.5 pb-3.5 text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed" dir="ltr">
              {lastResult.raw}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
};
