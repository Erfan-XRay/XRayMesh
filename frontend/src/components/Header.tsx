import React, { useState } from "react";
import { NodeInfo, PaletteId, Language, ThemeMode } from "../types";
import { PaletteDef } from "../theme/palettes";
import { RefreshCw, LogOut, Palette, Menu, Lock, Check } from "lucide-react";
import { XRayMeshLogo } from "./XRayMeshLogo";
import { ThemeModeSwitch } from "./ThemeModeSwitch";

interface HeaderProps {
  node: NodeInfo;
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
  themeMode,
  onSelectThemeMode,
  availablePalettes,
  t,
  isRtl,
  onOpenDrawer,
}) => {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  return (
    <header className="relative z-40 flex items-center justify-between gap-2.5 px-3 py-2.5 sm:p-4 mb-3 sm:mb-6 rounded-2xl bg-card/85 border border-card-border backdrop-blur-2xl shadow-xl transition-all">
      {/* Brand & Custom Logo */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <XRayMeshLogo className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" size={38} glow={true} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-text-main tracking-tight leading-tight truncate">
              <span className="sm:hidden">XRayMesh</span>
              <span className="hidden sm:inline">{t("brand_title")}</span>
            </h1>
            <span className="hidden sm:inline px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
              v{node.xraymesh_version || "3.0.0-beta.3"}
            </span>
            {node.branch === "beta" && (
              <span className="hidden sm:inline px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0 uppercase tracking-wider">
                Beta
              </span>
            )}
            {node.ssl_enabled && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0" title="SSL/TLS Active">
                <Lock className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span>SSL</span>
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {node.configured ? (
              <>
                {/* Mobile: one quiet line instead of stacked badges. */}
                <span className="sm:hidden flex min-w-0 font-mono" dir="ltr">
                  <span className="truncate">{node.network_name || "XRayMesh"}</span>
                  <span className="shrink-0">
                    &nbsp;· v{node.xraymesh_version || "3.0.0-beta.3"}
                    {node.branch === "beta" && <span className="text-amber-400"> β</span>}
                  </span>
                </span>
                <span className="hidden sm:inline">
                  {t("network_prefix")}: <span className="font-mono text-primary font-medium">{node.network_name || "XRayMesh"}</span>
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {t("header_status_setup_mode")}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Mobile Controls (< md) */}
      <div className="flex md:hidden items-center gap-0.5 shrink-0">
        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-text-muted hover:text-text-main hover:bg-white/5 active:scale-95 transition-all disabled:opacity-50"
          title={t("btn_refresh")}
          aria-label={t("btn_refresh")}
        >
          <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${isRefreshing ? "animate-spin-smooth text-primary" : ""}`} />
        </button>

        {/* Drawer Toggle */}
        <button
          onClick={onOpenDrawer}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-card-border text-text-main hover:bg-white/10 active:scale-95 transition-all"
          aria-label={t("nav_menu")}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Desktop Controls (>= md) */}
      <div className="hidden md:flex items-center gap-2 shrink-0">
        {/* Language Switcher */}
        <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10 text-xs">
          <button
            onClick={() => onSelectLang("en")}
            aria-pressed={lang === "en"}
            className={`px-2.5 py-1 rounded-lg transition-all font-medium ${
              lang === "en"
                ? "bg-primary text-black font-bold shadow-sm"
                : "text-text-muted hover:text-text-main"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => onSelectLang("fa")}
            aria-pressed={lang === "fa"}
            className={`px-2.5 py-1 rounded-lg transition-all font-persian font-medium ${
              lang === "fa"
                ? "bg-primary text-black font-bold shadow-sm"
                : "text-text-muted hover:text-text-main"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
            title={t("theme_selector")}
          >
            <Palette className="w-3.5 h-3.5 text-primary" />
            <span>{t("theme_selector")}</span>
            <span
              className="w-2.5 h-2.5 rounded-full ms-1 border border-white/30"
              style={{
                backgroundColor: availablePalettes.find((p) => p.id === paletteId)?.primaryColor,
              }}
            />
          </button>

          {themeMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setThemeMenuOpen(false)} />
              <div
                className={`absolute ${isRtl ? "left-0" : "right-0"} top-full mt-2 w-72 rounded-xl bg-card border border-card-border shadow-2xl p-2 z-50 animate-modal-in`}
              >
                <div className="mb-2">
                  <div className="px-1 mb-1.5 text-xs font-bold uppercase tracking-wider text-text-subtle">
                    {t("theme_mode")}
                  </div>
                  <ThemeModeSwitch value={themeMode} onChange={onSelectThemeMode} t={t} />
                </div>
                <div className="px-1 mb-1 text-xs font-bold uppercase tracking-wider text-text-subtle">
                  {t("theme_selector")}
                </div>
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
                        ? "bg-primary/20 text-primary font-bold"
                        : "text-text-muted hover:bg-white/5 hover:text-text-main"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                        style={{ backgroundColor: p.primaryColor }}
                      />
                      <span>{lang === "fa" ? p.nameFa : p.nameEn}</span>
                    </div>
                    {paletteId === p.id && <Check className="w-3.5 h-3.5 text-primary" />}
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main hover:bg-white/10 transition-colors disabled:opacity-50"
          title={t("btn_refresh")}
        >
          <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-500 ${isRefreshing ? "animate-spin-smooth text-primary" : "group-hover:rotate-45"}`} />
          <span className="hidden md:inline">{t("btn_refresh")}</span>
        </button>

        {/* Sign Out */}
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-red/10 border border-accent-red/20 text-rose-400 hover:bg-accent-red/20 text-xs font-medium transition-colors"
          title={t("btn_signout")}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">{t("btn_signout")}</span>
        </button>
      </div>
    </header>
  );
};
