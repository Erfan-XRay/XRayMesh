import React from 'react';

interface XRayMeshLogoProps {
  className?: string;
  size?: number;
  glow?: boolean;
}

export const XRayMeshLogo: React.FC<XRayMeshLogoProps> = ({
  className = 'w-10 h-10',
  size = 40,
  glow = true,
}) => {
  return (
    <div className={`relative flex items-center justify-center flex-shrink-0 group ${className}`}>
      {/* Ambient Neon Glow behind logo */}
      {glow && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-primary/30 to-emerald-400/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      )}

      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 w-full h-full drop-shadow-[0_2px_12px_var(--primary-subtle)] transition-transform duration-300 group-hover:scale-105"
      >
        <defs>
          {/* Main Primary Gradient */}
          <linearGradient id="xrmGradPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="1" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.9" />
          </linearGradient>

          {/* Core Beam Gradient */}
          <linearGradient id="xrmGradBeam" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>

          {/* Background Squircle Gradient */}
          <linearGradient id="xrmBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.95" />
          </linearGradient>

          {/* Cyber Glow Filter */}
          <filter id="xrmGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Squircle Container */}
        <rect
          x="4"
          y="4"
          width="92"
          height="92"
          rx="24"
          fill="url(#xrmBg)"
          stroke="url(#xrmGradPrimary)"
          strokeWidth="2.5"
          strokeOpacity="0.5"
        />

        {/* Diagonal Mesh Hex Grid Guides (Subtle background topology) */}
        <path
          d="M24 50 L50 24 M76 50 L50 76 M50 24 L76 50 M50 76 L24 50"
          stroke="var(--primary)"
          strokeWidth="1"
          strokeOpacity="0.15"
          strokeDasharray="2 3"
        />

        {/* X-Ray Laser Cross Beams (The "X") */}
        {/* Beam 1: Top-Left to Bottom-Right */}
        <line
          x1="26"
          y1="26"
          x2="74"
          y2="74"
          stroke="url(#xrmGradBeam)"
          strokeWidth="4.5"
          strokeLinecap="round"
          filter="url(#xrmGlow)"
        />
        {/* Beam 2: Bottom-Left to Top-Right */}
        <line
          x1="26"
          y1="74"
          x2="74"
          y2="26"
          stroke="url(#xrmGradBeam)"
          strokeWidth="4.5"
          strokeLinecap="round"
          filter="url(#xrmGlow)"
        />

        {/* Secondary Inner Overlay Connectors (Mesh Network Topology) */}
        <path
          d="M26 26 L50 15 L74 26 L85 50 L74 74 L50 85 L26 74 L15 50 Z"
          stroke="var(--primary)"
          strokeWidth="1.5"
          strokeOpacity="0.3"
          strokeDasharray="3 3"
          fill="none"
        />

        {/* Outer Constellation Mesh Nodes (Peers) */}
        {/* Top-Left Node */}
        <circle cx="26" cy="26" r="5" fill="#0f172a" stroke="var(--primary)" strokeWidth="2.5" />
        <circle cx="26" cy="26" r="2" fill="var(--primary)" />

        {/* Top-Right Node */}
        <circle cx="74" cy="26" r="5" fill="#0f172a" stroke="#6366f1" strokeWidth="2.5" />
        <circle cx="74" cy="26" r="2" fill="#818cf8" />

        {/* Bottom-Left Node */}
        <circle cx="26" cy="74" r="5" fill="#0f172a" stroke="#10b981" strokeWidth="2.5" />
        <circle cx="26" cy="74" r="2" fill="#34d399" />

        {/* Bottom-Right Node */}
        <circle cx="74" cy="74" r="5" fill="#0f172a" stroke="var(--primary)" strokeWidth="2.5" />
        <circle cx="74" cy="74" r="2" fill="var(--primary)" />

        {/* Perimeter Satellite Nodes */}
        <circle cx="50" cy="15" r="2.5" fill="var(--primary)" fillOpacity="0.8" />
        <circle cx="85" cy="50" r="2.5" fill="var(--primary)" fillOpacity="0.8" />
        <circle cx="50" cy="85" r="2.5" fill="var(--primary)" fillOpacity="0.8" />
        <circle cx="15" cy="50" r="2.5" fill="var(--primary)" fillOpacity="0.8" />

        {/* Central Core Pulse Hub (Intersection of X & Mesh Center) */}
        <circle cx="50" cy="50" r="10" fill="var(--primary)" fillOpacity="0.15" />
        <circle cx="50" cy="50" r="6.5" fill="#0f172a" stroke="url(#xrmGradBeam)" strokeWidth="2" />
        <circle cx="50" cy="50" r="3.5" fill="var(--primary)">
          <animate attributeName="r" values="3;4.2;3" dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;1;0.8" dur="2.5s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
};
export default XRayMeshLogo;
