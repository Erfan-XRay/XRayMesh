import React, { useId } from 'react';
import { AlertTriangle, ArrowUpCircle, FlaskConical, Loader2 } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { btnDanger, btnPrimary, btnSecondary, btnWarning } from '../ui';

type Tone = 'danger' | 'warning' | 'primary';

const TONES: Record<Tone, { icon: React.ReactNode; badge: string; confirm: string }> = {
  danger: { icon: <AlertTriangle className="w-5 h-5" />, badge: 'bg-danger-subtle text-danger', confirm: btnDanger },
  warning: { icon: <FlaskConical className="w-5 h-5" />, badge: 'bg-warning-subtle text-warning', confirm: btnWarning },
  primary: { icon: <ArrowUpCircle className="w-5 h-5" />, badge: 'bg-primary-subtle text-primary', confirm: btnPrimary },
};

interface ConfirmModalProps {
  isOpen: boolean;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: Tone;
  busy?: boolean;
  /** Replaces the tone's default icon. */
  icon?: React.ReactNode;
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
  icon,
  children,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  const style = TONES[tone];
  return (
    <ModalShell isOpen={isOpen} onClose={onCancel} closable={!busy} labelledBy={titleId} maxWidth="sm:max-w-md">
      <div className="flex items-start gap-3.5">
        <span className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-xl ${style.badge}`} aria-hidden="true">
          {icon ?? style.icon}
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 id={titleId} className="text-base font-semibold text-text-primary leading-snug">
            {title}
          </h2>
          <div className="mt-1.5 text-sm text-text-muted leading-relaxed">{description}</div>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 grid grid-cols-1 sm:flex sm:justify-end gap-2">
        <button type="button" onClick={onConfirm} disabled={busy} className={`${style.confirm} sm:order-last`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          <span>{confirmLabel}</span>
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary} data-autofocus>
          {cancelLabel}
        </button>
      </div>
    </ModalShell>
  );
};
