import React from "react";
import { TabId } from "../types";

export interface MobileBottomNavTab {
  id: TabId;
  label: string;
  /** Fits the 5-column bottom bar; falls back to label. */
  short?: string;
  icon: React.ReactNode;
  badge?: number | string;
}

interface MobileBottomNavProps {
  activeTab: TabId;
  onSelectTab: (id: TabId) => void;
  tabs: MobileBottomNavTab[];
  t: (key: any) => string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  tabs,
  t,
}) => {
  return (
    <nav
      role="navigation"
      aria-label={t("drawer_tabs")}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-2xl border-t border-card-border pb-safe pt-1 px-1 shadow-[0_-8px_30px_rgba(0,0,0,0.35)]"
    >
      <div className="grid grid-flow-col auto-cols-fr max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
              aria-label={tab.badge !== undefined ? `${tab.label} (${tab.badge})` : tab.label}
              className={`relative min-w-0 flex flex-col items-center justify-center min-h-[52px] py-1 rounded-xl transition-colors duration-200 active:scale-95 ${
                isActive ? "text-primary font-semibold" : "text-text-muted hover:text-text-main"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-primary animate-fade-in" aria-hidden="true" />
              )}

              <span className="relative flex items-center justify-center w-6 h-6" aria-hidden="true">
                <span className={`transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>{tab.icon}</span>
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -end-2.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-mono font-bold leading-none flex items-center justify-center bg-primary text-black">
                    {tab.badge}
                  </span>
                )}
              </span>

              <span className="text-[11px] mt-0.5 font-medium leading-tight max-w-full truncate px-0.5" aria-hidden="true">
                {tab.short || tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
