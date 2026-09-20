import React, { useState } from 'react';
import { PingResult } from '../../types';
import { Activity, Send, Loader2, Terminal } from 'lucide-react';

interface PingTabProps {
  targetIp: string;
  onTargetChange: (ip: string) => void;
  isRunning: boolean;
  onRun: (target: string, count: number) => void;
  lastResult: PingResult | null;
  t: (key: any) => string;
}

export const PingTab: React.FC<PingTabProps> = ({
  targetIp,
  onTargetChange,
  isRunning,
  onRun,
  lastResult,
  t,
}) => {
  const [count, setCount] = useState<number>(4);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetIp.trim()) return;
    onRun(targetIp.trim(), count);
  };

  return (
    <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold text-text-main">{t('ping_panel_title')}</h2>
      </div>

      {/* Input Controls Form */}
      <form onSubmit={handleSend} className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            {t('ping_dest_label')}
          </label>
          <input
            type="text"
            value={targetIp}
            onChange={(e) => onTargetChange(e.target.value)}
            placeholder="10.144.144.2"
            className="w-full px-3.5 py-2 bg-slate-900/80 border border-white/15 rounded-xl text-xs sm:text-sm font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
          />
        </div>

        <div className="w-36">
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            {t('ping_count_label')}
          </label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-900/80 border border-white/15 rounded-xl text-xs sm:text-sm font-mono text-text-main focus:outline-none focus:border-primary"
          >
            <option value={4}>{t('ping_count_4')}</option>
            <option value={8}>{t('ping_count_8')}</option>
            <option value={10}>{t('ping_count_10')}</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!targetIp.trim() || isRunning}
          className="px-6 py-2 rounded-xl bg-primary text-black font-semibold text-xs sm:text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-md"
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
          <div className="rounded-xl bg-black/40 border border-white/10 p-3.5">
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
