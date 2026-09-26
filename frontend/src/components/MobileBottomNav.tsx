import React from 'react';
import { TabId } from '../types';
import type { Translate } from '../i18n/translations';
import { NavTab } from './Header';

interface MobileBottomNavProps {
  activeTab: TabId;
  onSelectTab: (id: TabId) => void;
  tabs: NavTab[];
  t: Translate;
}

/** Phone section bar: icon over a short label, with a tonal pill behind the active icon. */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, onSelectTab, tabs, t }) => (
  <nav aria-label={t('drawer_tabs')} className="glass-bar md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-card-border pb-safe">
    <div className="grid grid-flow-col auto-cols-fr max-w-lg mx-auto px-1 pt-1.5">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.badge !== undefined ? `${tab.label} (${tab.badge})` : tab.label}
            className={`relative min-w-0 flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl transition-colors cursor-pointer ${
              active ? 'text-primary' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <span
              className={`relative flex items-center justify-center w-12 h-7 rounded-full transition-colors duration-200 ${
                active ? 'bg-primary-subtle' : ''
              }`}
              aria-hidden="true"
            >
              {tab.icon}
              {tab.badge !== undefined && (
                <span className="absolute -top-1 end-1 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold leading-none tabular-nums flex items-center justify-center bg-primary text-on-primary ring-2 ring-[var(--bg-base)]">
                  {tab.badge}
                </span>
              )}
            </span>
            <span className={`text-2xs leading-tight max-w-full truncate px-0.5 ${active ? 'font-semibold' : 'font-medium'}`} aria-hidden="true">
              {tab.short || tab.label}
            </span>
          </button>
        );
      })}
    </div>
  </nav>
);
