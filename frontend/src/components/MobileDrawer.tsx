import React, { useEffect } from "react";
import { NodeInfo, PaletteId, Language, TabId, ThemeMode } from "../types";
import { PaletteDef } from "../theme/palettes";
import { X, RefreshCw, LogOut, Palette, Globe, ShieldCheck, Check } from "lucide-react";
import { XRayMeshLogo } from "./XRayMeshLogo";
import { ThemeModeSwitch } from "./ThemeModeSwitch";

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
  themeMode: ThemeMode;
  onSelectThemeMode: (mode: ThemeMode) => void;
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
  themeMode,
  onSelectThemeMode,
  availablePalettes,
  t,
  isRtl,
}) => {
  // ESC listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden flex" role="dialog" aria-modal="true" aria-label={t("nav_menu")}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        className={`relative z-10 w-[86vw] max-w-sm h-full bg-card/98 border-card-border backdrop-blur-2xl flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-out overflow-y-auto ${
          isRtl
            ? "ms-auto border-s animate-slide-in-right"
            : "me-auto border-e animate-slide-in-left"
        }`}
      >
        {/* Top Header */}
        <div className="p-4 border-b border-card-border">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <XRayMeshLogo className="w-8 h-8 shrink-0" size={32} glow={true} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-sm text-text-main tracking-tight truncate">XRayMesh</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/15 text-primary border border-primary/25 shrink-0">
                    v{node.xraymesh_version || "2.2.6-beta.2"}
                  </span>
                  {node.branch === "beta" && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0 uppercase tracking-wider">
                      Beta
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-muted font-mono truncate max-w-[170px] tech-val mt-0.5">
                  {node.network_name || "XRayMesh Network"}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main border border-white/10 active:scale-90 transition-all shrink-0"
              aria-label={t("nav_close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Node Status Banner */}
          <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-xs gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="badge-status-dot shrink-0" />
              <div className="font-mono font-semibold text-text-main text-xs truncate tech-val">
                {node.ipv4 || node.hostname || t("mesh_active")}
              </div>
            </div>
            {node.ssl_enabled && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>SSL</span>
              </span>
            )}
          </div>
        </div>

        {/* Navigation Tabs List */}
        <div className="flex-1 p-3 space-y-1">
          <div className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-text-subtle">
            {t("drawer_tabs")}
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
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-98 ${
                  isActive
                    ? "bg-primary text-black shadow-md shadow-primary/25 font-bold"
                    : "text-text-muted hover:text-text-main hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="shrink-0">{tab.icon}</span>
                  <span>{tab.label}</span>
                </div>
                {tab.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold leading-none ${
                      isActive ? "bg-black/30 text-black" : "bg-white/10 text-primary"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom Preferences & Actions */}
        <div className="p-4 border-t border-card-border space-y-3 bg-black/20 pb-safe">
          {/* Language Switcher */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-black/30 border border-white/5">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
              <Globe className="w-4 h-4 text-primary" />
              <span>{t("lang_selector")}</span>
            </div>
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 text-xs">
              <button
                onClick={() => onSelectLang("en")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  lang === "en"
                    ? "bg-primary text-black shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => onSelectLang("fa")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all font-persian ${
                  lang === "fa"
                    ? "bg-primary text-black shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                فارسی
              </button>
            </div>
          </div>

          {/* Theme Palette Swatches */}
          <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-text-muted">
              <div className="flex items-center gap-1.5 min-w-0">
                <Palette className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">{t("theme_selector")}</span>
              </div>
              <span className="text-xs font-mono text-primary font-semibold shrink-0">
                {lang === "fa"
                  ? availablePalettes.find((p) => p.id === paletteId)?.nameFa
                  : availablePalettes.find((p) => p.id === paletteId)?.nameEn}
              </span>
            </div>
            <div>
              <div className="px-1 mb-1.5 text-xs font-bold uppercase tracking-wider text-text-subtle">
                {t("theme_mode")}
              </div>
              <ThemeModeSwitch value={themeMode} onChange={onSelectThemeMode} t={t} />
            </div>
            <div className="grid grid-cols-6 gap-1.5 pt-1">
              {availablePalettes.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPalette(p.id)}
                  className={`h-8 rounded-xl border flex items-center justify-center transition-all ${
                    paletteId === p.id
                      ? "border-white ring-2 ring-primary ring-offset-1 ring-offset-black scale-105"
                      : "border-white/10 hover:border-white/30"
                  }`}
                  style={{ backgroundColor: p.primaryColor }}
                  title={lang === "fa" ? p.nameFa : p.nameEn}
                >
                  {paletteId === p.id && <Check className="w-3.5 h-3.5 text-black" />}
                </button>
              ))}
            </div>
          </div>

          {/* GitHub Repository Link */}
          <a
            href="https://github.com/Erfan-XRay/XRayMesh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub Repository</span>
          </a>

          {/* Action Buttons: Refresh & Logout */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => {
                onRefresh();
              }}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-text-main transition-colors disabled:opacity-50 min-w-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              <span className="truncate">{t("btn_refresh")}</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium text-rose-400 transition-colors min-w-0"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t("btn_signout")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
