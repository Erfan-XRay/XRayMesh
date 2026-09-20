import React from 'react';
import { ToastItem } from '../types';
import { Info, CheckCircle2, AlertCircle } from 'lucide-react';

interface ToastProps {
  toasts: ToastItem[];
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        let Icon = Info;
        let borderClass = 'border-primary/30';
        let bgIconClass = 'text-primary';
        if (toast.type === 'success') {
          Icon = CheckCircle2;
          borderClass = 'border-accent-green/30';
          bgIconClass = 'text-accent-green';
        } else if (toast.type === 'error') {
          Icon = AlertCircle;
          borderClass = 'border-accent-red/30';
          bgIconClass = 'text-accent-red';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl bg-card border ${borderClass} shadow-xl backdrop-blur-md text-sm text-text-main transition-all duration-300 animate-modal-in`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 ${bgIconClass}`} />
            <span className="leading-snug">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
};
