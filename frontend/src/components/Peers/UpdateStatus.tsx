import React from 'react';
import { AlertCircle, ArrowUpCircle, Check, CircleCheck, Copy, Loader2, RotateCcw, X } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { fillTemplate, formatText } from '../../i18n/fillTemplate';
import { isRunActive, UpdateRun } from '../../hooks/useNodeUpdates';
import { ErrorPanel } from '../NodeConfig/FormControls';
import { btnGhostSm, btnPrimarySm, btnSecondarySm, iconBtnSm } from '../ui';
import { CHANNEL_TEXT, channelOf, cliUpdateCommand, needsCliFallback, PHASE_TEXT, updateErrorText } from './peerDisplay';

interface UpdateCellProps {
  peer: Peer;
  run?: UpdateRun;
  onUpdate: (peer: Peer) => void;
  onDismiss: (ip: string) => void;
  t: Translate;
}

/** The one place a server's update state and action live: button, live progress, or result. */
export const UpdateCell: React.FC<UpdateCellProps> = ({ peer, run, onUpdate, onDismiss, t }) => {
  const host = peer.hostname || peer.ipv4;

  if (run && isRunActive(run)) {
    return (
      <span role="status" aria-live="polite" className="inline-flex items-center gap-2 h-8 px-2.5 rounded-lg bg-primary-subtle text-xs font-medium text-primary">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
        <span>{t(PHASE_TEXT[run.phase] || 'update_phase_working')}</span>
      </span>
    );
  }

  if (run?.phase === 'success' || run?.phase === 'up_to_date') {
    const text =
      run.phase === 'success'
        ? fillTemplate(t(run.isLocal ? 'update_done_reload' : 'update_done'), { version: <bdi dir="ltr">{run.targetVersion}</bdi> })
        : formatText(t('update_result_up_to_date'), { channel: t(CHANNEL_TEXT[channelOf(peer)]) });
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <CircleCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{text}</span>
        {!run.isLocal && (
          <button type="button" onClick={() => onDismiss(peer.ipv4)} aria-label={t('update_dismiss')} title={t('update_dismiss')} className={`${iconBtnSm} w-6 h-6`}>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </span>
    );
  }

  if (run?.phase === 'failed') {
    return (
      <span className="inline-flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 text-danger" aria-label={t('update_failed_short')} />
        <button type="button" onClick={() => onUpdate(peer)} className={btnSecondarySm}>
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('btn_retry')}</span>
        </button>
      </span>
    );
  }

  if (peer.update_available && peer.latest_version) {
    return (
      <button
        type="button"
        onClick={() => onUpdate(peer)}
        className={btnPrimarySm}
        aria-label={`${formatText(t('update_btn'), { version: peer.latest_version })} (${host})`}
      >
        <ArrowUpCircle className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{fillTemplate(t('update_btn'), { version: <bdi dir="ltr">{peer.latest_version}</bdi> })}</span>
      </button>
    );
  }

  if (peer.update_checked === false) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-warning" title={t('update_check_failed_hint')}>
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{t('update_check_failed')}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      <Check className="w-3.5 h-3.5 shrink-0 text-success" aria-hidden="true" />
      <span>{t('update_up_to_date')}</span>
    </span>
  );
};

interface UpdateFailureProps {
  peer: Peer;
  run: UpdateRun;
  onDismiss: (ip: string) => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
}

/** Full explanation of a failed update, with the terminal command as a last resort. */
export const UpdateFailure: React.FC<UpdateFailureProps> = ({ peer, run, onDismiss, onCopy, copiedKey, t }) => {
  const command = cliUpdateCommand(peer.xraymesh_branch || run.branch);
  return (
    <div className="space-y-2">
      <ErrorPanel message={updateErrorText(run.errorCode, run.hostname, t)} details={run.errorDetail || undefined} t={t} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {needsCliFallback(run) ? (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs text-text-muted">{t('update_cli_fallback')}</span>
            <button type="button" onClick={() => onCopy(command)} className={btnSecondarySm} title={command}>
              {copiedKey === command ? <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{t('update_copy_cmd')}</span>
            </button>
          </div>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => onDismiss(peer.ipv4)} className={btnGhostSm}>
          {t('update_dismiss')}
        </button>
      </div>
    </div>
  );
};
