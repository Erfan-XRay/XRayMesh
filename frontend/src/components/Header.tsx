import React, { useState } from 'react';
import { NodeInfo, PaletteId, Language } from '../types';
import { PaletteDef } from '../theme/palettes';
import { RefreshCw, LogOut, Palette, Menu, Lock } from 'lucide-react';
import { XRayMeshLogo } from './XRayMeshLogo';

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
  onOpenDrawer: () => void;
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
  onOpenDrawer,
}) => {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  return (
    <header className="relative z-50 flex items-center justify-between gap-3 p-3.5 md:p-5 mb-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg transition-all">
      {/* Brand & Custom Logo */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <XRayMeshLogo className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 shrink-0" size={40} glow={true} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap min-w-0">
            <h1 className="text-sm sm:text-base md:text-lg font-bold text-text-main tracking-tight leading-tight truncate">
              {t('brand_title')}
            </h1>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
              v{node.xraymesh_version || '2.0.5'}
            </span>
            {node.ssl_enabled && (
              <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0" title="SSL/TLS Active" aria-label="SSL/TLS Active">
                <Lock className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                <span>SSL</span>
              </span>
            )}
          </div>
          <p className="text-[10px] sm:text-[11px] md:text-xs text-text-muted mt-0.5 truncate">
            {node.configured ? (
              <>
                {t('network_prefix')}: <span className="font-mono text-primary font-medium">{node.network_name || 'XRayMesh'}</span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {t('header_status_setup_mode')}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Mobile Controls (< md) */}
      <div className="flex md:hidden items-center gap-1.5 shrink-0">
        <a
          href="https://github.com/Erfan-XRay/XRayMesh"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-text-muted hover:text-text-main active:scale-95 transition-all"
          title="GitHub Repository"
          aria-label="GitHub Repository"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </a>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-text-muted hover:text-text-main active:scale-95 transition-all disabled:opacity-50"
          title={t('btn_refresh')}
          aria-label={t('btn_refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
        </button>

        <button
          onClick={onOpenDrawer}
          className="p-2 rounded-xl bg-primary text-black font-semibold text-xs shadow-md shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
          aria-label={t('nav_menu') || 'Menu'}
          title={t('nav_menu') || 'Menu'}
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* Desktop Controls (>= md) */}
      <div className="hidden md:flex items-center flex-wrap gap-2.5 shrink-0">
        {/* Status indicator */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-semibold bg-accent-green/10 text-emerald-400 border border-accent-green/20">
          <div className="badge-pulse" />
          <span>{node.service_active !== false ? t('mesh_active') : t('mesh_connecting')}</span>
        </div>

        {/* Language Switcher */}
        <div className="relative inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 text-xs font-medium">
          <button
            onClick={() => onSelectLang('en')}
            aria-pressed={lang === 'en'}
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
            aria-pressed={lang === 'fa'}
            className={`px-2.5 py-1 rounded-md transition-all font-persian ${
              lang === 'fa'
                ? 'bg-primary text-black font-semibold shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            فارسی
          </button>
        </div>

        {/* Palette Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            aria-expanded={themeMenuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
            title={t('theme_selector')}
          >
            <Palette className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">{t('theme_selector')}</span>
          </button>

          {themeMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setThemeMenuOpen(false)}
              />
              <div
                className={`absolute ${
                  isRtl ? 'left-0' : 'right-0'
                } top-full mt-2 w-48 rounded-xl bg-slate-900 border border-white/20 shadow-2xl p-1.5 z-50 animate-modal-in`}
              >
                {availablePalettes.map((p) => (
                  <button
                    key={p.id}
                    aria-current={paletteId === p.id}
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
        </div>

        {/* GitHub Project Link */}
        <a
          href="https://github.com/Erfan-XRay/XRayMesh"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-white hover:bg-white/10 transition-colors"
          title="GitHub Repository"
          aria-label="GitHub Repository"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          <span className="hidden lg:inline">GitHub</span>
        </a>

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
          <span className="hidden md:inline">{t('btn_signout')}</span>
        </button>
      </div>
    </header>
  );
};
