import React from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { ThemeMode } from '../types';

interface ThemeModeSwitchProps {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  t: (key: any) => string;
}

const OPTIONS: { value: ThemeMode; labelKey: string; icon: React.ReactNode }[] = [
  { value: 'auto', labelKey: 'theme_auto', icon: <Monitor className="w-3.5 h-3.5" /> },
  { value: 'light', labelKey: 'theme_light', icon: <Sun className="w-3.5 h-3.5" /> },
  { value: 'dark', labelKey: 'theme_dark', icon: <Moon className="w-3.5 h-3.5" /> },
];

export const ThemeModeSwitch: React.FC<ThemeModeSwitchProps> = ({ value, onChange, t }) => {
  return (
    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface border border-card-border" role="group" aria-label={t('theme_mode')}>
      {OPTIONS.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={`min-h-11 flex items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-all active:scale-95 ${
              isActive
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-text-muted hover:bg-card hover:text-text-main'
            }`}
          >
            {option.icon}
            <span>{t(option.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
};
