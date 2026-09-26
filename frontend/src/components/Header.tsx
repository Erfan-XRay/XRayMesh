import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Menu, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { NodeInfo, TabId } from '../types';
import type { Translate } from '../i18n/translations';
import { XRayMeshLogo } from './XRayMeshLogo';
import { PreferencesPanel, PreferencesProps } from './PreferencesPanel';
import { iconBtn, Pill, StatusDot } from './ui';

export interface NavTab {
  id: TabId;
  label: string;
  /** Fits the five-column bottom bar on phones; falls back to label. */
  short?: string;
  icon: React.ReactNode;
  badge?: number | string;
}

interface HeaderProps extends Omit<PreferencesProps, 't'> {
  node: NodeInfo;
  tabs: NavTab[];
  activeTab: TabId;
  onSelectTab: (id: TabId) => void;
  /** Tabs are hidden until the node is configured. */
  showTabs: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenDrawer: () => void;
  t: Translate;
}

const GITHUB_URL = 'https://github.com/Erfan-XRay/XRayMesh';

export const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

/** Appearance and language popover anchored under its trigger at the inline end. */
const PreferencesPopover: React.FC<PreferencesProps> = (props) => {
  const { t } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('prefs_title')}
        title={t('prefs_title')}
        className={`${iconBtn} ${open ? 'bg-hover text-text-primary' : ''}`}
      >
        <SlidersHorizontal className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('prefs_title')}
          className="absolute end-0 top-full mt-2 w-80 p-4 rounded-2xl bg-elevated border border-card-border shadow-pop z-50 animate-pop-in origin-top"
        >
          <PreferencesPanel {...props} />
        </div>
      )}
    </div>
  );
};

/** Sticky app bar: brand and node identity, actions, and (from md up) the section tabs. */
export const Header: React.FC<HeaderProps> = ({
  node,
  tabs,
  activeTab,
  onSelectTab,
  showTabs,
  isRefreshing,
  onRefresh,
  onLogout,
  onOpenDrawer,
  t,
  ...prefs
}) => {
  const version = node.xraymesh_version || '3.0.0-beta.4';
  const isBeta = node.branch === 'beta';

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const rtl = document.documentElement.dir === 'rtl';
    const forward = (e.key === 'ArrowRight') !== rtl;
    const idx = tabs.findIndex((tab) => tab.id === activeTab);
    const next = tabs[(idx + (forward ? 1 : -1) + tabs.length) % tabs.length];
    onSelectTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
    e.preventDefault();
  };

  return (
    <header className="glass-bar sticky top-0 z-40 border-b border-card-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 h-14 md:h-16">
          {/* Brand and node identity */}
          <div className="flex items-center gap-3 min-w-0">
            <XRayMeshLogo className="w-8 h-8 md:w-9 md:h-9" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[15px] font-bold text-text-primary leading-tight" lang="en">
                  XRayMesh
                </span>
                <span className="hidden sm:inline font-mono text-2xs text-text-subtle" dir="ltr">
                  v{version}
                </span>
                {isBeta && (
                  <Pill tone="warning" className="hidden sm:inline-flex h-5 px-1.5 text-2xs">
                    {t('channel_beta')}
                  </Pill>
                )}
              </div>
              <div className="flex items-center gap-1.5 min-w-0 mt-0.5 text-xs text-text-muted">
                {node.configured ? (
                  <>
                    <StatusDot tone="success" />
                    <span className="truncate font-mono" dir="ltr">
                      {node.network_name || 'xraymesh'}
                    </span>
                    {node.ssl_enabled && <span className="hidden sm:inline text-text-subtle">· TLS</span>}
                  </>
                ) : (
                  <>
                    <StatusDot tone="warning" />
                    <span className="truncate">{t('header_status_setup_mode')}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className={iconBtn}
              title={t('btn_refresh')}
              aria-label={t('btn_refresh')}
            >
              <RefreshCw className={`w-[18px] h-[18px] ${isRefreshing ? 'animate-spin-smooth text-primary' : ''}`} aria-hidden="true" />
            </button>
            <div className="hidden md:flex items-center gap-1">
              <PreferencesPopover t={t} {...prefs} />
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={iconBtn}
                title="GitHub"
                aria-label={t('nav_github')}
              >
                <GithubIcon className="w-[18px] h-[18px]" />
              </a>
              <span className="w-px h-6 mx-1 bg-card-border" aria-hidden="true" />
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-2 min-h-10 px-3 rounded-xl text-sm font-medium text-text-muted hover:text-danger hover:bg-danger-subtle transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
                <span className="hidden lg:inline">{t('btn_signout')}</span>
                <span className="sr-only lg:hidden">{t('btn_signout')}</span>
              </button>
            </div>
            <button type="button" onClick={onOpenDrawer} className={`${iconBtn} md:hidden`} aria-label={t('nav_menu')}>
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Section tabs (tablet and desktop; phones use the bottom bar) */}
        {showTabs && (
          <nav aria-label={t('drawer_tabs')} className="hidden md:block -mb-px">
            <div role="tablist" aria-label={t('drawer_tabs')} onKeyDown={onTabKeyDown} className="flex items-end gap-1 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls="dashboard-content"
                    tabIndex={active ? 0 : -1}
                    onClick={() => onSelectTab(tab.id)}
                    className={`group relative inline-flex items-center gap-2 h-11 px-3 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      active ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <span className={`shrink-0 transition-colors ${active ? 'text-primary' : 'text-text-subtle group-hover:text-text-muted'}`} aria-hidden="true">
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span
                        className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-2xs font-semibold tabular-nums ${
                          active ? 'bg-primary text-on-primary' : 'bg-surface text-text-muted border border-card-border'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors ${active ? 'bg-primary' : 'bg-transparent'}`}
                    />
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};
