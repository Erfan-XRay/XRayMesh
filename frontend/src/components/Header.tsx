import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeInfo, PaletteId, Language } from '../types';
import { PaletteDef } from '../theme/palettes';
import { RefreshCw, LogOut, Palette, Layers } from 'lucide-react';

interface HeaderProps {
  node: NodeInfo;
  isRefreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  lang: Language;
  onSelectLang: (l: Language) => void;
  paletteId: PaletteId;
  onSelectPalette: (p: PaletteId) => void;
  availablePalettes: PaletteDef[];
  t: (key: any) => string;
  isRtl: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  node,
  isRefreshing,
  onRefresh,
  onLogout,
  lang,
  onSelectLang,
  paletteId,
  onSelectPalette,
  availablePalettes,
  t,
  isRtl,
}) => {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const updateMenuPos = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        left: isRtl
          ? rect.left
          : Math.max(8, rect.right - 192), // 192px = w-48
      });
    }
  }, [isRtl]);

  useEffect(() => {
    if (themeMenuOpen) {
      updateMenuPos();
      window.addEventListener('scroll', updateMenuPos, true);
      window.addEventListener('resize', updateMenuPos);
      return () => {
        window.removeEventListener('scroll', updateMenuPos, true);
        window.removeEventListener('resize', updateMenuPos);
      };
    }
  }, [themeMenuOpen, updateMenuPos]);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-6 mb-6 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
      {/* Brand */}
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-sm">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-main tracking-tight leading-tight">
            {t('brand_title')}
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            {t('network_prefix')}: <span className="font-mono text-primary font-medium">{node.network_name || 'XRayMesh'}</span>
            {node.easytier_version && ` | v${node.easytier_version}`}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center flex-wrap gap-2.5">
        {/* Status indicator */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-semibold bg-accent-green/10 text-emerald-400 border border-accent-green/20">
          <div className="badge-pulse" />
          <span>{node.service_active !== false ? t('mesh_active') : t('mesh_connecting')}</span>
        </div>

        {/* Language Switcher */}
        <div className="relative inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 text-xs font-medium">
          <button
            onClick={() => onSelectLang('en')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              lang === 'en'
                ? 'bg-primary text-black font-semibold shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => onSelectLang('fa')}
            className={`px-2.5 py-1 rounded-md transition-all font-persian ${
              lang === 'fa'
                ? 'bg-primary text-black font-semibold shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            فارسی
          </button>
        </div>

        {/* Palette Selector */}
        <button
          ref={btnRef}
          onClick={() => setThemeMenuOpen(!themeMenuOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
          title={t('theme_selector')}
        >
          <Palette className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">{t('theme_selector')}</span>
        </button>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main hover:bg-white/10 transition-colors disabled:opacity-50"
          title={t('btn_refresh')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          <span className="hidden md:inline">{t('btn_refresh')}</span>
        </button>

        {/* Sign Out */}
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-red/10 border border-accent-red/20 text-rose-400 hover:bg-accent-red/20 text-xs font-medium transition-colors"
          title={t('btn_signout')}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('btn_signout')}</span>
        </button>
      </div>

      {/* Palette Dropdown — rendered as fixed portal to escape stacking context */}
      {themeMenuOpen && menuPos && (
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setThemeMenuOpen(false)}
          />
          <div
            className="fixed w-48 rounded-xl bg-slate-900 border border-white/15 shadow-2xl p-1.5 z-[9999] animate-modal-in"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {availablePalettes.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onSelectPalette(p.id);
                  setThemeMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  paletteId === p.id
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-text-muted hover:bg-white/5 hover:text-text-main'
                }`}
              >
                <span>{lang === 'fa' ? p.nameFa : p.nameEn}</span>
                <span
                  className="w-3 h-3 rounded-full border border-white/20"
                  style={{ backgroundColor: p.primaryColor }}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </header>
  );
};
