import React, { useEffect, useRef } from 'react';
import { LogOut, RefreshCw, X } from 'lucide-react';
import { NodeInfo, TabId } from '../types';
import type { Translate } from '../i18n/translations';
import { XRayMeshLogo } from './XRayMeshLogo';
import { PreferencesPanel, PreferencesProps } from './PreferencesPanel';
import { GithubIcon, NavTab } from './Header';
import { btnSecondary, iconBtn, StatusDot } from './ui';

interface MobileDrawerProps extends Omit<PreferencesProps, 't'> {
  isOpen: boolean;
  onClose: () => void;
  node: NodeInfo;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  tabs: NavTab[];
  /** The bottom bar already lists the sections once the node is configured. */
  showTabs: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  t: Translate;
}

/** Phone menu: node identity, sections (during setup), preferences and account actions. Slides in from the inline end. */
export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  node,
  activeTab,
  onSelectTab,
  tabs,
  showTabs,
  isRefreshing,
  onRefresh,
  onLogout,
  t,
  ...prefs
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav_menu')}>
      <div className="absolute inset-0 bg-[var(--overlay)] animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        className="sheet-from-end absolute inset-y-0 end-0 flex flex-col w-[88vw] max-w-sm bg-elevated border-s border-card-border shadow-pop"
      >
        <div className="flex items-center justify-between gap-3 px-4 h-14 border-b border-card-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <XRayMeshLogo className="w-8 h-8" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary leading-tight" lang="en">
                XRayMesh
              </p>
              <p className="font-mono text-2xs text-text-subtle">
                <bdi dir="ltr">
                  v{node.xraymesh_version || '3.0.0-beta.4'}
                  {node.branch === 'beta' && ' · beta'}
                </bdi>
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={iconBtn} aria-label={t('nav_close')}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* This node */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-card-border">
            <StatusDot tone={node.configured ? 'success' : 'warning'} pulse={Boolean(node.configured)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary truncate">
                <bdi>{node.hostname || t('drawer_server_info')}</bdi>
              </p>
              <p className="font-mono text-xs text-text-muted truncate">
                <bdi dir="ltr">{[node.ipv4, node.network_name].filter(Boolean).join(' · ') || '—'}</bdi>
              </p>
            </div>
          </div>

          {!showTabs && tabs.length > 0 && (
            <nav aria-label={t('drawer_tabs')} className="space-y-1">
              {tabs.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      onSelectTab(tab.id);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 min-h-11 px-3 rounded-xl text-sm font-medium transition-colors ${
                      active ? 'bg-primary-subtle text-primary' : 'text-text-secondary hover:bg-hover'
                    }`}
                  >
                    <span aria-hidden="true">{tab.icon}</span>
                    <span className="flex-1 text-start">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          <PreferencesPanel t={t} {...prefs} />
        </div>

        <div className="p-4 pb-safe border-t border-card-border space-y-2 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onRefresh} disabled={isRefreshing} className={btnSecondary}>
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin-smooth text-primary' : ''}`} aria-hidden="true" />
              <span className="truncate">{t('btn_refresh')}</span>
            </button>
            <a href="https://github.com/Erfan-XRay/XRayMesh" target="_blank" rel="noopener noreferrer" className={btnSecondary}>
              <GithubIcon />
              <span>GitHub</span>
            </a>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-xl text-sm font-semibold text-danger hover:bg-danger-subtle transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
            <span>{t('btn_signout')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
