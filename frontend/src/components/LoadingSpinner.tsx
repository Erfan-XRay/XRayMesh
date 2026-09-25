import React from "react";

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  sublabel?: string;
  glow?: boolean;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  label,
  sublabel,
  glow = false,
  className = "",
}) => {
  const sizeMap = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-10 h-10",
    xl: "w-16 h-16",
  };

  const dim = sizeMap[size] || sizeMap.md;

  return (
    <div className={`inline-flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className={`relative ${dim} ${glow ? "loader-orbit-glow" : ""}`}>
        {/* Outer ambient glow */}
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-sm scale-110 animate-pulse-subtle pointer-events-none" />
        
        {/* High performance 60fps dual-ring spinner */}
        <div className={`loader-dual-ring ${dim}`} />
        
        {/* Center luminous core */}
        <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-primary animate-glow-pulse" />
      </div>

      {(label || sublabel) && (
        <div className="text-center animate-fade-in">
          {label && (
            <p className="text-xs sm:text-sm font-semibold text-text-main tracking-tight">
              {label}
            </p>
          )}
          {sublabel && (
            <p className="text-xs text-text-muted mt-0.5">
              {sublabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const LoadingDots: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <span className={`loader-dots ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
};
