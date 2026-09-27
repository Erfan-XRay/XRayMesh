import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { ToastItem } from '../types';

/** How long a toast stays up, and how much of that its exit animation takes. */
export const TOAST_LIFE_MS = 4000;
export const TOAST_EXIT_MS = 240;

interface ToastProps {
  toasts: ToastItem[];
}

const STYLES: Record<ToastItem['type'], { icon: React.ReactNode; bar: string; tint: string }> = {
  success: { icon: <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" />, bar: 'bg-success', tint: 'bg-success-subtle' },
  error: { icon: <AlertCircle className="w-4 h-4 text-danger" aria-hidden="true" />, bar: 'bg-danger', tint: 'bg-danger-subtle' },
  info: { icon: <Info className="w-4 h-4 text-info" aria-hidden="true" />, bar: 'bg-info', tint: 'bg-info-subtle' },
};

/** Stacked notices: bottom center above the phone nav bar, bottom inline end on larger screens. */
export const ToastContainer: React.FC<ToastProps> = ({ toasts }) => (
  <div
    className="fixed z-[110] inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:inset-x-auto md:end-6 md:bottom-6 flex flex-col items-center md:items-end gap-2 pointer-events-none"
    role="status"
    aria-live="polite"
  >
    {toasts.map((toast) => {
      const style = STYLES[toast.type];
      return (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : undefined}
          className={`pointer-events-auto relative flex items-start gap-2.5 w-full max-w-sm ps-4 pe-4 py-3 rounded-xl bg-elevated border border-card-border shadow-pop overflow-hidden ${
            toast.leaving ? 'animate-toast-out' : 'animate-toast-in'
          }`}
        >
          <span className={`absolute inset-y-0 start-0 w-1 ${style.bar}`} aria-hidden="true" />
          <span className={`flex items-center justify-center w-6 h-6 -my-0.5 rounded-full shrink-0 animate-nav-pop ${style.tint}`}>{style.icon}</span>
          <span className="text-sm text-text-primary leading-snug" dir="auto">
            {toast.message}
          </span>
          <span
            className={`toast-timer absolute bottom-0 inset-x-0 h-0.5 opacity-60 ${style.bar}`}
            style={{ '--toast-life': `${TOAST_LIFE_MS - TOAST_EXIT_MS}ms` } as React.CSSProperties}
            aria-hidden="true"
          />
        </div>
      );
    })}
  </div>
);
