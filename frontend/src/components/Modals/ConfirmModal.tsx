import React, { useId } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { btnDanger, btnSecondary } from '../NodeConfig/FormControls';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation for destructive actions; the cancel button gets focus first. */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  return (
    <ModalShell isOpen={isOpen} onClose={onCancel} closable={!busy} labelledBy={titleId} maxWidth="sm:max-w-md">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-rose-500/15 text-rose-400" aria-hidden="true">
          <AlertTriangle className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-bold text-text-main">
            {title}
          </h2>
          <p className="mt-1 text-sm text-text-muted leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={btnDanger}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          <span>{confirmLabel}</span>
        </button>
      </div>
    </ModalShell>
  );
};
