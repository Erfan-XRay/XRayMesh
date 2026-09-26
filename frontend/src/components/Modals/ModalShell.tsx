import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { iconBtnSm } from '../ui';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  /** False while an operation runs, so Escape and the backdrop cannot interrupt it. */
  closable?: boolean;
  labelledBy: string;
  maxWidth?: string;
  children: React.ReactNode;
}

/** Accessible dialog frame: portal, backdrop, Escape, focus trap and focus restore. Bottom sheet on phones. */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  closable = true,
  labelledBy,
  maxWidth = 'sm:max-w-lg',
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closable) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closable, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px] animate-fade-in" onClick={closable ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`relative w-full ${maxWidth} max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-elevated border border-card-border shadow-pop p-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 animate-sheet-up sm:animate-modal-in focus:outline-none`}
      >
        {/* Grab handle hints that the phone sheet can be dismissed. */}
        <span className="sm:hidden absolute top-2 inset-x-0 mx-auto w-10 h-1 rounded-full bg-border-strong" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body
  );
};

/** Close button placed at the dialog's top inline end. */
export const ModalClose: React.FC<{ onClick: () => void; label: string; disabled?: boolean }> = ({ onClick, label, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`${iconBtnSm} w-9 h-9 -me-2 -mt-1`}>
    <X className="w-4 h-4" aria-hidden="true" />
  </button>
);
