import { PaletteId } from '../types';

export interface PaletteDef {
  id: PaletteId;
  nameEn: string;
  nameFa: string;
  /** Swatches for the picker: accent on its dark and light surfaces. */
  swatch: { dark: string; light: string };
}

/** Accent values live in index.css under [data-palette]; this list only drives the picker. */
export const PALETTES: Record<PaletteId, PaletteDef> = {
  firouzeh: { id: 'firouzeh', nameEn: 'Firouzeh', nameFa: 'فیروزه‌ای', swatch: { dark: '#2dd4bf', light: '#0f766e' } },
  ocean: { id: 'ocean', nameEn: 'Ocean', nameFa: 'اقیانوسی', swatch: { dark: '#38bdf8', light: '#0369a1' } },
  iris: { id: 'iris', nameEn: 'Iris', nameFa: 'زنبقی', swatch: { dark: '#a5b4fc', light: '#4f46e5' } },
  saffron: { id: 'saffron', nameEn: 'Saffron', nameFa: 'زعفرانی', swatch: { dark: '#fbbf24', light: '#b45309' } },
  graphite: { id: 'graphite', nameEn: 'Graphite', nameFa: 'گرافیتی', swatch: { dark: '#e2e8f0', light: '#1e293b' } },
  midnight: { id: 'midnight', nameEn: 'Midnight', nameFa: 'نیمه‌شب', swatch: { dark: '#38bdf8', light: '#0369a1' } },
};

/** Palettes from earlier releases, so a saved choice survives the upgrade. */
export const LEGACY_PALETTES: Record<string, PaletteId> = {
  sky: 'ocean',
  emerald: 'firouzeh',
  violet: 'iris',
  amber: 'saffron',
  rose: 'firouzeh',
  oled: 'midnight',
};
