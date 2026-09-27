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

/** Phone section bar: icon over a short label, with a tonal pill that glides to the active icon. */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, onSelectTab, tabs, t }) => {
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));
  return (
    <nav aria-label={t('drawer_tabs')} className="glass-bar md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-card-border pb-safe">
      <div className="relative grid grid-flow-col auto-cols-fr max-w-lg mx-auto px-1 pt-1.5">
        {/* Columns share the width equally, so the pill's slot is a plain fraction; inset-inline-start mirrors it in RTL. */}
        <span
          className="absolute top-1.5 flex justify-center h-7 pointer-events-none transition-[inset-inline-start] duration-300 ease-spring"
          style={{ width: `calc((100% - 0.5rem) / ${tabs.length})`, insetInlineStart: `calc(0.25rem + (100% - 0.5rem) * ${activeIndex} / ${tabs.length})` }}
          aria-hidden="true"
        >
          <span className="w-12 h-full rounded-full bg-primary-subtle" />
        </span>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.badge !== undefined ? `${tab.label} (${tab.badge})` : tab.label}
              className={`relative min-w-0 flex flex-col items-center justify-start gap-1 min-h-[52px] rounded-xl transition-colors cursor-pointer ${
                active ? 'text-primary' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <span className="relative flex items-center justify-center w-12 h-7 rounded-full" aria-hidden="true">
                <span key={active ? 'on' : 'off'} className={`flex ${active ? 'animate-nav-pop' : ''}`}>
                  {tab.icon}
                </span>
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
};
