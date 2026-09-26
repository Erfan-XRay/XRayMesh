import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  sublabel?: React.ReactNode;
  /** Kept for API compatibility; the ring already carries the accent. */
  glow?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-9 h-9 border-[3px]',
  xl: 'w-12 h-12 border-[3px]',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', label, sublabel, className = '' }) => (
  <div role="status" aria-live="polite" className={`inline-flex flex-col items-center justify-center gap-4 ${className}`}>
    <span
      aria-hidden="true"
      className={`${SIZES[size]} rounded-full border-primary/20 border-t-primary animate-spin-smooth`}
    />
    {(label || sublabel) && (
      <div className="text-center animate-fade-in">
        {label && <p className="text-sm font-semibold text-text-primary">{label}</p>}
        {sublabel && <p className="mt-1 max-w-xs text-xs text-text-muted leading-relaxed">{sublabel}</p>}
      </div>
    )}
  </div>
);

/** Three pulsing dots for inline "working" states. */
export const LoadingDots: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
    {[0, 150, 300].map((delay) => (
      <span key={delay} className="w-1 h-1 rounded-full bg-current animate-pulse-dot" style={{ animationDelay: `${delay}ms` }} />
    ))}
  </span>
);
