import { useState, useEffect } from 'react';
import { PaletteId, ThemeMode } from '../types';
import { PALETTES } from './palettes';

const THEME_STORAGE_KEY = 'xraymesh_theme_palette';
const THEME_MODE_STORAGE_KEY = 'xraymesh_theme_mode';

export function useTheme() {
  const [paletteId, setPaletteId] = useState<PaletteId>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return (saved && saved in PALETTES) ? (saved as PaletteId) : 'sky';
  });
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'dark';
  });
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme = themeMode === 'auto' ? systemTheme : themeMode;

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  };

  useEffect(() => {
    const def = PALETTES[paletteId] || PALETTES.sky;
    const root = document.documentElement;
    const vars = resolvedTheme === 'light' ? def.lightVars : def.vars;

    Object.entries(vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
    root.dataset.theme = resolvedTheme;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.classList.toggle('light', resolvedTheme === 'light');
    root.style.colorScheme = resolvedTheme;
    localStorage.setItem(THEME_STORAGE_KEY, paletteId);
  }, [paletteId, resolvedTheme]);

  return {
    paletteId,
    setPaletteId,
    themeMode,
    setThemeMode,
    resolvedTheme,
    currentPalette: PALETTES[paletteId] || PALETTES.sky,
    availablePalettes: Object.values(PALETTES),
  };
}
