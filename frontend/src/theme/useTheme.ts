import { useState, useEffect } from 'react';
import { PaletteId } from '../types';
import { PALETTES } from './palettes';

const THEME_STORAGE_KEY = 'xraymesh_theme_palette';

export function useTheme() {
  const [paletteId, setPaletteId] = useState<PaletteId>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return (saved && saved in PALETTES) ? (saved as PaletteId) : 'sky';
  });

  useEffect(() => {
    const def = PALETTES[paletteId] || PALETTES.sky;
    const root = document.documentElement;
    Object.entries(def.vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
    localStorage.setItem(THEME_STORAGE_KEY, paletteId);
  }, [paletteId]);

  return {
    paletteId,
    setPaletteId,
    currentPalette: PALETTES[paletteId] || PALETTES.sky,
    availablePalettes: Object.values(PALETTES),
  };
}
