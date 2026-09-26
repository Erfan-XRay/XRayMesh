import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Translate } from '../../i18n/translations';
import { fillTemplate } from '../../i18n/fillTemplate';
import { ConfirmModal } from './ConfirmModal';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  tunnelName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  t: Translate;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ isOpen, tunnelName, onConfirm, onCancel, isDeleting, t }) => (
  <ConfirmModal
    isOpen={isOpen}
    tone="danger"
    icon={<Trash2 className="w-5 h-5" />}
    busy={isDeleting}
    title={fillTemplate(t('modal_delete_title'), {
      name: (
        <bdi dir="ltr" className="font-mono">
          {tunnelName}
        </bdi>
      ),
    })}
    description={t('modal_delete_desc')}
    confirmLabel={t('btn_delete')}
    cancelLabel={t('btn_cancel')}
    onConfirm={onConfirm}
    onCancel={onCancel}
  />
);
