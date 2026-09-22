import React from 'react';
import { TabId } from '../types';

export interface BottomNavItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
}

interface MobileBottomNavProps {
  activeTab: TabId;
  onSelectTab: (id: TabId) => void;
  items: BottomNavItem[];
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  items,
}) => {
  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-3 inset-x-3 z-40 md:hidden rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl shadow-2xl p-1.5 flex items-center justify-around transition-all"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      {items.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 ${
              isActive
                ? 'bg-primary text-black font-bold shadow-md shadow-primary/25'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <span className={`w-5 h-5 flex items-center justify-center ${isActive ? 'text-black' : 'text-primary'}`}>
                {item.icon}
              </span>
              {item.badge !== undefined && (
                <span
                  className={`absolute -top-1 -end-2 px-1 rounded-full text-[9px] font-mono font-bold leading-tight ${
                    isActive
                      ? 'bg-black text-primary'
                      : 'bg-primary text-black shadow'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[56px]">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
