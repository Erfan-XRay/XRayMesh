import React, { useState, useEffect } from 'react';
import { Peer, PingResult } from '../../types';
import { Activity, Send, Loader2, Terminal, ArrowLeftRight, ArrowRight, Server } from 'lucide-react';

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
  const targetPeer = peers.find((p) => p.ipv4 === targetIp);

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

  return (
    <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-bold text-text-main">{t('ping_panel_title')}</h2>
            <p className="text-xs text-text-muted mt-0.5">{t('ping_route_display')}</p>
          </div>
        </div>

        {isRemoteRunner && (
          <span className="text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
            Remote Runner
          </span>
        )}
      </div>

      {/* Input Controls Form */}
      <form onSubmit={handleSend} className="space-y-4 mb-6">
        {/* Route Selectors (Source & Target with Swap) */}
        <div className="p-3.5 rounded-xl bg-white/5 border border-card-border space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-primary" />
              {t('ping_route_display')}
            </label>
            {peers.length > 1 && (
              <button
                type="button"
                onClick={handleSwap}
                title={t('ping_swap_nodes')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium transition-all"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>{t('ping_swap_nodes')}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Source Node Selector */}
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                {t('ping_source_label')}
              </label>
              <select
                value={sourceIp}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-card-border rounded-xl text-xs sm:text-sm font-mono text-text-main focus:outline-none focus:border-primary"
              >
                <option value="">{t('ping_source_placeholder')}</option>
                {peers.map((p) => (
                  <option key={p.ipv4} value={p.ipv4}>
                    {p.hostname || p.ipv4} ({p.ipv4}){p.is_current ? ' ★ Local' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination Node Quick Selector */}
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                {t('ping_dest_label')}
              </label>
              <select
                value={peers.some((p) => p.ipv4 === targetIp) ? targetIp : ''}
                onChange={(e) => {
                  if (e.target.value) onTargetChange(e.target.value);
                }}
                className="w-full px-3 py-2 bg-black/40 border border-card-border rounded-xl text-xs sm:text-sm font-mono text-text-main focus:outline-none focus:border-primary"
              >
                <option value="">{t('ping_dest_select_placeholder')}</option>
                {peers.filter((p) => p.ipv4 !== sourceIp).map((p) => (
                  <option key={p.ipv4} value={p.ipv4}>
                    {p.hostname || p.ipv4} ({p.ipv4}){p.is_current ? ' ★ Local' : ''} - {p.lat_ms || '0'}ms
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Target IP Manual Input & Packet Count */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
            <div className="sm:col-span-8">
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                Target IP Address
              </label>
              <input
                type="text"
                value={targetIp}
                onChange={(e) => onTargetChange(e.target.value)}
                placeholder="10.144.144.2"
                className="w-full px-3.5 py-2 bg-black/40 border border-card-border rounded-xl text-xs sm:text-sm font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                {t('ping_count_label')}
              </label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-black/40 border border-card-border rounded-xl text-xs sm:text-sm font-mono text-text-main focus:outline-none focus:border-primary"
              >
                <option value={4}>{t('ping_count_4')}</option>
                <option value={8}>{t('ping_count_8')}</option>
                <option value={10}>{t('ping_count_10')}</option>
              </select>
            </div>
          </div>

          {/* Route Visual Indicator */}
          {sourceIp && targetIp && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-[10px] uppercase font-bold text-text-muted px-1.5 py-0.5 rounded bg-white/5 border border-card-border">
                  {t('ping_source_chip_prefix')}
                </span>
                <span className="font-mono font-semibold text-text-main truncate">
                  {sourcePeer?.hostname || sourceIp}
                </span>
                {sourcePeer?.is_current && (
                  <span className="text-[10px] text-primary font-bold">(Local)</span>
                )}
              </div>

              <div className="flex items-center px-1 text-primary font-bold">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>

              <div className="flex items-center gap-1.5 truncate">
                <span className="text-[10px] uppercase font-bold text-text-muted px-1.5 py-0.5 rounded bg-white/5 border border-card-border">
                  {t('ping_dest_chip_prefix')}
                </span>
                <span className="font-mono font-semibold text-text-main truncate">
                  {targetPeer?.hostname || targetIp}
                </span>
                {targetPeer?.lat_ms !== undefined && (
                  <span className="text-primary font-mono text-[10px] font-bold">
                    {targetPeer.lat_ms}ms
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!targetIp.trim() || !sourceIp || targetIp.trim() === sourceIp || isRunning}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs sm:text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('ping_running')}</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>{t('ping_btn_send')}</span>
            </>
          )}
        </button>
      </form>

      {/* Results Metric Cards */}
      {lastResult && (
        <div className="space-y-4 animate-modal-in">
          {/* Diagnostic Route Banner */}
          {(lastResult.source || sourceIp) && (lastResult.target || targetIp) && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-card-border text-xs font-mono text-text-muted">
              <span className="text-text-main font-semibold">
                {peers.find((p) => p.ipv4 === (lastResult.source || sourceIp))?.hostname || (lastResult.source || sourceIp)}
              </span>
              <ArrowRight className="w-3 h-3 text-primary" />
              <span className="text-text-main font-semibold">
                {peers.find((p) => p.ipv4 === (lastResult.target || targetIp))?.hostname || (lastResult.target || targetIp)}
              </span>
              {lastResult.source && !peers.find((p) => p.ipv4 === lastResult.source)?.is_current && (
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                  Cluster Proxy
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
              <div className="text-xs text-text-muted">{t('ping_min')}</div>
              <div className="text-lg font-bold font-mono text-text-main mt-1 tabular-nums">
                {lastResult.min_ms} ms
              </div>
            </div>
            <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
              <div className="text-xs text-text-muted">{t('ping_avg')}</div>
              <div className="text-lg font-bold font-mono text-primary mt-1 tabular-nums">
                {lastResult.avg_ms} ms
              </div>
            </div>
            <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
              <div className="text-xs text-text-muted">{t('ping_max')}</div>
              <div className="text-lg font-bold font-mono text-text-main mt-1 tabular-nums">
                {lastResult.max_ms} ms
              </div>
            </div>
            <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
              <div className="text-xs text-text-muted">{t('ping_loss')}</div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-1 tabular-nums">
                {lastResult.packet_loss_percent}%
              </div>
            </div>
          </div>

          {/* Raw Terminal Output */}
          <div className="rounded-xl bg-black/40 border border-card-border p-3.5">
            <div className="flex items-center gap-2 text-xs font-mono text-text-muted mb-2">
              <Terminal className="w-3.5 h-3.5" />
              <span>Diagnostic Raw Terminal</span>
            </div>
            <pre className="text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {lastResult.raw}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
