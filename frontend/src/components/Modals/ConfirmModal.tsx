import React, { useId } from 'react';
import { AlertTriangle, ArrowUpCircle, FlaskConical, Loader2 } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { btnDanger, btnPrimary, btnSecondary, btnWarning } from '../NodeConfig/FormControls';

type Tone = 'danger' | 'warning' | 'primary';

const TONES: Record<Tone, { icon: React.ReactNode; badge: string; confirm: string }> = {
  danger: {
    icon: <AlertTriangle className="w-5 h-5" />,
    badge: 'bg-rose-500/15 text-rose-400',
    confirm: btnDanger,
  },
  warning: {
    icon: <FlaskConical className="w-5 h-5" />,
    badge: 'bg-amber-500/15 text-amber-400',
    confirm: btnWarning,
  },
  primary: {
    icon: <ArrowUpCircle className="w-5 h-5" />,
    badge: 'bg-primary-subtle text-primary',
    confirm: btnPrimary,
  },
};

interface ConfirmModalProps {
  isOpen: boolean;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: Tone;
  busy?: boolean;
  /** Extra content below the description, e.g. a list of consequences. */
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation before consequential actions; the cancel button gets focus first. */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  busy = false,
  children,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  const style = TONES[tone];
  return (
    <ModalShell isOpen={isOpen} onClose={onCancel} closable={!busy} labelledBy={titleId} maxWidth="sm:max-w-md">
      <div className="flex items-start gap-3">
        <span className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-xl ${style.badge}`} aria-hidden="true">
          {style.icon}
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-bold text-text-main">
            {title}
          </h2>
          <p className="mt-1 text-sm text-text-muted leading-relaxed">{description}</p>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={style.confirm}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          <span>{confirmLabel}</span>
        </button>
      </div>
    </ModalShell>
  );
};
