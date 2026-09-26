import React, { useId } from 'react';

interface XRayMeshLogoProps {
  className?: string;
  size?: number;
  /** Soft accent halo behind the mark, for hero placements such as the login page. */
  glow?: boolean;
}

/** The mark: an X of two links joining four peers through a central hub, in the palette accent. */
export const XRayMeshLogo: React.FC<XRayMeshLogoProps> = ({ className = 'w-9 h-9', size = 36, glow = false }) => {
  const gradientId = useId();
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} aria-hidden="true">
      {glow && <span className="absolute -inset-3 rounded-[40%] bg-primary/20 blur-xl pointer-events-none" />}
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative w-full h-full">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="rgb(var(--primary-rgb))" />
            <stop offset="1" stopColor="rgb(var(--primary-rgb))" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="62" height="62" rx="17" fill="var(--bg-elevated)" stroke="var(--border-strong)" strokeWidth="1.5" />
        <path d="M20 20 44 44M44 20 20 44" stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinecap="round" />
        <circle cx="20" cy="20" r="5" fill="rgb(var(--primary-rgb))" />
        <circle cx="44" cy="20" r="5" fill="rgb(var(--primary-rgb))" fillOpacity="0.75" />
        <circle cx="20" cy="44" r="5" fill="rgb(var(--primary-rgb))" fillOpacity="0.75" />
        <circle cx="44" cy="44" r="5" fill="rgb(var(--primary-rgb))" />
        <circle cx="32" cy="32" r="6.5" fill="var(--bg-elevated)" stroke="rgb(var(--primary-rgb))" strokeWidth="3" />
      </svg>
    </span>
  );
};

export default XRayMeshLogo;
