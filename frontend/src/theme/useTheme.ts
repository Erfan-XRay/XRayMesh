import { useState, useEffect } from 'react';
import { PaletteId, ThemeMode } from '../types';
import { LEGACY_PALETTES, PALETTES } from './palettes';

const THEME_STORAGE_KEY = 'xraymesh_theme_palette';
const THEME_MODE_STORAGE_KEY = 'xraymesh_theme_mode';

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice just won't persist.
  }
};

function initialPalette(): PaletteId {
  const saved = read(THEME_STORAGE_KEY) || '';
  const id = LEGACY_PALETTES[saved] || saved;
  return id in PALETTES ? (id as PaletteId) : 'firouzeh';
}

export function useTheme() {
  const [paletteId, setPaletteIdState] = useState<PaletteId>(initialPalette);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = read(THEME_MODE_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
  });
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light');
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme = themeMode === 'auto' ? systemTheme : themeMode;

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    write(THEME_MODE_STORAGE_KEY, mode);
  };

  const setPaletteId = (id: PaletteId) => {
    setPaletteIdState(id);
    write(THEME_STORAGE_KEY, id);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.palette = paletteId;
    // Keeps the mobile browser chrome in step with the page background.
    const bg = getComputedStyle(root).getPropertyValue('--bg-base').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0b0e13');
  }, [paletteId, resolvedTheme]);

  return {
    paletteId,
    setPaletteId,
    themeMode,
    setThemeMode,
    resolvedTheme,
    currentPalette: PALETTES[paletteId],
    availablePalettes: Object.values(PALETTES),
  };
}
