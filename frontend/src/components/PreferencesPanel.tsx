import React from 'react';
import { Check } from 'lucide-react';
import { Language, PaletteId, ThemeMode } from '../types';
import type { Translate } from '../i18n/translations';
import { PaletteDef } from '../theme/palettes';
import { ThemeModeSwitch } from './ThemeModeSwitch';
import { Segmented } from './ui';

export interface PreferencesProps {
  lang: Language;
  onSelectLang: (lang: Language) => void;
  paletteId: PaletteId;
  onSelectPalette: (id: PaletteId) => void;
  themeMode: ThemeMode;
  onSelectThemeMode: (mode: ThemeMode) => void;
  availablePalettes: PaletteDef[];
  resolvedTheme: 'light' | 'dark';
  t: Translate;
}

const Group: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2">
    <p className="text-xs font-medium text-text-muted">{label}</p>
    {children}
  </div>
);

/** Language, light/dark mode and accent palette. Shared by the header popover and the mobile menu. */
export const PreferencesPanel: React.FC<PreferencesProps> = ({
  lang,
  onSelectLang,
  paletteId,
  onSelectPalette,
  themeMode,
  onSelectThemeMode,
  availablePalettes,
  resolvedTheme,
  t,
}) => (
  <div className="space-y-4">
    <Group label={t('lang_selector')}>
      <Segmented
        block
        value={lang}
        onChange={onSelectLang}
        ariaLabel={t('lang_selector')}
        options={[
          { value: 'fa', label: <span lang="fa" className="font-persian">فارسی</span> },
          { value: 'en', label: <span lang="en">English</span> },
        ]}
      />
    </Group>

    <Group label={t('theme_mode')}>
      <ThemeModeSwitch value={themeMode} onChange={onSelectThemeMode} t={t} />
    </Group>

    <Group label={t('theme_selector')}>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('theme_selector')}>
        {availablePalettes.map((p) => {
          const active = p.id === paletteId;
          const name = lang === 'fa' ? p.nameFa : p.nameEn;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              title={p.id === 'midnight' ? `${name} (OLED)` : name}
              onClick={() => onSelectPalette(p.id)}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-2xs font-medium transition-colors cursor-pointer ${
                active ? 'border-primary bg-primary-subtle text-text-primary' : 'border-card-border text-text-muted hover:bg-hover hover:text-text-primary'
              }`}
            >
              <span
                className="relative flex items-center justify-center w-7 h-7 rounded-full ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: p.swatch[resolvedTheme] }}
                aria-hidden="true"
              >
                {active && <Check className="w-3.5 h-3.5 text-canvas" strokeWidth={3} />}
              </span>
              <span className="max-w-full truncate">{name}</span>
            </button>
          );
        })}
      </div>
    </Group>
  </div>
);
