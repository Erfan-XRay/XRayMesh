import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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
      (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }
    return () => previous?.focus?.();
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
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={closable ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`relative w-full ${maxWidth} max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-modal border border-card-border shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 animate-modal-in focus:outline-none`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
