import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemeMode } from '../types';
import type { Translate, TranslationKey } from '../i18n/translations';
import { Segmented } from './ui';

interface ThemeModeSwitchProps {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  t: Translate;
}

const OPTIONS: { value: ThemeMode; labelKey: TranslationKey; icon: React.ReactNode }[] = [
  { value: 'auto', labelKey: 'theme_auto', icon: <Monitor className="w-4 h-4" aria-hidden="true" /> },
  { value: 'light', labelKey: 'theme_light', icon: <Sun className="w-4 h-4" aria-hidden="true" /> },
  { value: 'dark', labelKey: 'theme_dark', icon: <Moon className="w-4 h-4" aria-hidden="true" /> },
];

export const ThemeModeSwitch: React.FC<ThemeModeSwitchProps> = ({ value, onChange, t }) => (
  <Segmented
    block
    value={value}
    onChange={onChange}
    ariaLabel={t('theme_mode')}
    options={OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey), icon: o.icon }))}
  />
);
