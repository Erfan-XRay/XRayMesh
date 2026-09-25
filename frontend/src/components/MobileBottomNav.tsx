import React from "react";
import { TabId } from "../types";

export interface MobileBottomNavTab {
  id: TabId;
  label: string;
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
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-2xl border-t border-card-border pb-safe pt-1.5 px-2 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] transition-all"
    >
      <div className="flex items-center justify-around gap-1 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? "text-primary font-bold"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              {/* Active pill background */}
              {isActive && (
                <span className="absolute inset-x-1 inset-y-1 rounded-xl bg-primary/15 border border-primary/25 -z-10 animate-fade-in" />
              )}

              {/* Icon with optional badge */}
              <div className="relative flex items-center justify-center w-6 h-6">
                <span className={`transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>
                  {tab.icon}
                </span>
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -end-2.5 min-w-[18px] h-[18px] px-1 rounded-full text-xs font-mono font-bold leading-none flex items-center justify-center bg-primary text-black shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span className="text-xs mt-1 font-medium truncate max-w-[72px] leading-tight">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
