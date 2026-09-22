import React, { useEffect } from 'react';
import { NodeInfo, PaletteId, Language, TabId } from '../types';
import { PaletteDef } from '../theme/palettes';
import { X, RefreshCw, LogOut, Palette, Globe, ShieldCheck } from 'lucide-react';
import { XRayMeshLogo } from './XRayMeshLogo';

export interface MobileDrawerTabItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
}

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  node: NodeInfo;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  tabs: MobileDrawerTabItem[];
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

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  node,
  activeTab,
  onSelectTab,
  tabs,
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
  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        className={`relative z-10 w-[82vw] max-w-xs h-full bg-slate-950/95 border-white/15 backdrop-blur-2xl flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-out overflow-y-auto ${
          isRtl
            ? 'ms-auto border-s animate-slide-in-right'
            : 'me-auto border-e animate-slide-in-left'
        }`}
      >
        {/* Top Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5">
              <XRayMeshLogo className="w-8 h-8" size={32} glow={true} />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-text-main tracking-tight">XRayMesh</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                    v{node.xraymesh_version || '2.0.1'}
                  </span>
                </div>
                <div className="text-[10px] text-text-muted font-mono truncate max-w-[140px]">
                  {node.network_name || 'XRayMesh Network'}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main border border-white/10 active:scale-90 transition-all"
              aria-label={t('nav_close') || 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Node Status Banner */}
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="badge-pulse shrink-0" />
              <div className="font-mono font-semibold text-text-main text-[11px] truncate">
                {node.ipv4 || node.hostname || t('mesh_active')}
              </div>
            </div>
            {node.ssl_enabled && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>SSL</span>
              </span>
            )}
          </div>
        </div>

        {/* Navigation Tabs List */}
        <div className="flex-1 p-3 space-y-1">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted/70">
            {t('drawer_tabs')}
          </div>

          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onSelectTab(tab.id);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'bg-primary text-black font-bold shadow-md shadow-primary/20'
                    : 'text-text-muted hover:text-text-main hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={isActive ? 'text-black' : 'text-primary'}>{tab.icon}</span>
                  <span>{tab.label}</span>
                </div>
                {tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isActive
                        ? 'bg-black/20 text-black'
                        : 'bg-white/10 text-text-muted border border-white/10'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Controls & Preferences Section */}
        <div className="p-3 border-t border-white/10 space-y-3 bg-white/[0.02]">
          <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-text-muted/70">
            {t('drawer_controls')}
          </div>

          {/* Language Switcher */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span>Language</span>
            </div>
            <div className="inline-flex rounded-lg bg-black/40 border border-white/10 p-0.5 text-xs font-medium">
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
          </div>

          {/* Theme Palette Swatches */}
          <div className="p-2 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-text-muted px-1">
              <div className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-primary" />
                <span>{t('theme_selector')}</span>
              </div>
              <span className="text-[10px] font-mono text-primary font-semibold">
                {lang === 'fa'
                  ? availablePalettes.find((p) => p.id === paletteId)?.nameFa
                  : availablePalettes.find((p) => p.id === paletteId)?.nameEn}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {availablePalettes.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPalette(p.id)}
                  className={`h-7 rounded-lg border flex items-center justify-center transition-all ${
                    paletteId === p.id
                      ? 'border-white ring-2 ring-primary ring-offset-1 ring-offset-black scale-105'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ backgroundColor: p.primaryColor }}
                  title={lang === 'fa' ? p.nameFa : p.nameEn}
                />
              ))}
            </div>
          </div>

          {/* Action Buttons: Refresh & Logout */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => {
                onRefresh();
              }}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-text-main transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
              <span>{t('btn_refresh')}</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium text-rose-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('btn_signout')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
