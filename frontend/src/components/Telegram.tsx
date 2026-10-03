import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Translate } from '../i18n/translations';
import { btnTonal, cardClass } from './ui';

export const TELEGRAM_URL = 'https://t.me/Erfan_Xray';
export const TELEGRAM_HANDLE = '@Erfan_Xray';

export const TelegramIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.78 15.17 9.4 20.5c.54 0 .78-.23 1.06-.51l2.55-2.44 5.29 3.87c.97.54 1.66.26 1.92-.9l3.48-16.3c.31-1.44-.52-2-1.46-1.65L1.79 10.4c-1.4.54-1.38 1.32-.24 1.67l5.23 1.63L18.93 6.06c.57-.35 1.09-.16.66.19L9.78 15.17Z" />
  </svg>
);

/** The channel, offered to every signed-in user at the end of each section. */
export const TelegramCard: React.FC<{ t: Translate }> = ({ t }) => (
  <aside className={`${cardClass} mt-6 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`} aria-label={t('telegram_card_title')}>
    <div className="flex items-start gap-3 min-w-0">
      <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-info-subtle text-info" aria-hidden="true">
        <TelegramIcon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">{t('telegram_card_title')}</p>
        <p className="mt-0.5 text-xs text-text-muted leading-relaxed">
          {t('telegram_card_desc')}{' '}
          <bdi dir="ltr" className="font-mono text-text-secondary">
            {TELEGRAM_HANDLE}
          </bdi>
        </p>
      </div>
    </div>
    <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className={`${btnTonal} w-full sm:w-auto shrink-0`}>
      <span>{t('telegram_card_btn')}</span>
      <ArrowUpRight className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
    </a>
  </aside>
);
