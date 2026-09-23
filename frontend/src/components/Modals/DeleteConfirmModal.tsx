import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  tunnelName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  t: (key: any) => string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  tunnelName,
  onConfirm,
  onCancel,
  isDeleting,
  t,
}) => {
  React.useEffect(() => {
    if (!isOpen || isDeleting) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-tunnel-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-2xl bg-card border border-card-border shadow-2xl p-6 animate-modal-in">
        {/* Close button */}
        <button
          onClick={onCancel}
          aria-label={t('btn_cancel')}
          className="interactive-min-hit absolute top-4 end-4 p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="mx-auto w-12 h-12 rounded-xl bg-accent-red/15 border border-accent-red/25 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-accent-red" />
        </div>

        {/* Title */}
        <h3 id="delete-tunnel-title" className="text-lg font-bold text-text-main text-center mb-2">
          {t('modal_delete_title')}
        </h3>

        {/* Description */}
        <p className="text-sm text-text-muted text-center mb-1.5">
          {t('modal_delete_desc_1')}
        </p>
        <p className="text-center mb-2">
          <span className="inline-block px-3 py-1 rounded-lg bg-accent-red/10 border border-accent-red/20 font-mono text-sm font-semibold text-accent-red">
            {tunnelName}
          </span>
        </p>
        <p className="text-xs text-text-subtle text-center mb-6">
          {t('modal_delete_desc_2')}
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-text-muted hover:text-text-main hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {t('btn_cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-red text-white text-sm font-semibold hover:bg-accent-red/90 transition-colors disabled:opacity-60"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {t('btn_delete')}
          </button>
        </div>
      </div>
    </div>
  );
};
