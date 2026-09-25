import React from 'react';
import { Loader2, Play, RefreshCw, RotateCw, Server, Square } from 'lucide-react';
import { MeshProtocol, NodeConfig } from '../../types';
import type { Translate } from '../../i18n/translations';
import { MESH_PROTOCOLS } from '../../utils/meshInvite';
import { btnSecondary, cardClass, iconBtn, PROTOCOL_TEXT } from './FormControls';

export type ServiceAction = 'start' | 'stop' | 'restart';

interface NodeHeaderProps {
  config: NodeConfig;
  pending: ServiceAction | null;
  refreshing: boolean;
  onAction: (action: ServiceAction) => void;
  onRefresh: () => void;
  t: Translate;
}

/** Service status and controls. Hostname and VIP already live in the overview cards above. */
export const NodeHeader: React.FC<NodeHeaderProps> = ({ config, pending, refreshing, onAction, onRefresh, t }) => {
  const running = config.service_active;
  const proto = (MESH_PROTOCOLS.includes(config.protocol as MeshProtocol) ? config.protocol : 'dual') as MeshProtocol;
  const busy = pending !== null;

  return (
    <header className={`${cardClass} p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <span
          aria-hidden="true"
          className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-xl ${
            running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
          }`}
        >
          <Server className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-text-main">{t('node_header_title')}</h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${
                running ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400' : 'bg-rose-400'}`} aria-hidden="true" />
              {running ? t('node_status_running') : t('node_status_stopped')}
            </span>
          </div>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-muted">
            <div className="flex items-center gap-1.5 min-w-0">
              <dt>{t('node_label_network')}</dt>
              <dd className="font-mono text-text-main truncate" dir="ltr">
                {config.network_name}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>{t('node_label_protocol')}</dt>
              <dd className="text-text-main">{t(PROTOCOL_TEXT[proto][0])}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>{t('node_label_port')}</dt>
              <dd className="font-mono text-text-main" dir="ltr">
                {config.port}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {running ? (
          <>
            <button
              type="button"
              onClick={() => onAction('restart')}
              disabled={busy}
              title={t('node_btn_restart')}
              aria-label={t('node_btn_restart')}
              className={iconBtn}
            >
              <RotateCw className={`w-4 h-4 ${pending === 'restart' ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onAction('stop')}
              disabled={busy}
              title={t('node_btn_stop')}
              aria-label={t('node_btn_stop')}
              className={`${iconBtn} hover:text-rose-400`}
            >
              {pending === 'stop' ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Square className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onAction('start')} disabled={busy} className={btnSecondary}>
            {pending === 'start' ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            )}
            <span>{t('node_btn_start')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title={t('btn_refresh')}
          aria-label={t('btn_refresh')}
          className={iconBtn}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
