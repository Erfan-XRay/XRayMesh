import React from 'react';

/**
 * Peers of the backdrop mesh, in a 1600×900 scene. They sit along the edges, where the page
 * content leaves room. Each half is drawn anchored to its own screen edge, so narrow and
 * portrait screens crop the middle of the scene instead of the peers.
 */
const NODES: [number, number][] = [
  [90, 120], [260, 60], [180, 300], [40, 470], [240, 560], [120, 760], [330, 840],
  [1510, 100], [1340, 50], [1430, 290], [1570, 440], [1360, 540], [1500, 740], [1280, 850],
  [560, 40], [760, 90], [1040, 40],
];

const LINKS: [number, number][] = [
  [0, 1], [0, 2], [1, 2], [2, 3], [2, 4], [3, 4], [4, 5], [5, 6], [4, 6],
  [7, 8], [7, 9], [8, 9], [9, 10], [9, 11], [10, 11], [11, 12], [12, 13], [11, 13],
  [1, 14], [14, 15], [16, 8],
];

/** Links that carry a packet: [from, to, seconds per trip, start delay]. */
const TRAFFIC: [number, number, number, number][] = [
  [0, 2, 6, 0], [2, 4, 7, 2.2], [5, 4, 8, 4.1], [1, 14, 9, 1.3], [14, 15, 7, 5.2],
  [16, 8, 9, 6.4], [7, 9, 6.5, 0.8], [9, 11, 7.5, 3.6], [12, 11, 8, 1.9], [13, 12, 7, 5.8],
];

/** Peers that glow softly: [node, seconds per breath, delay]. */
const LIVE: [number, number, number][] = [
  [2, 5, 0], [4, 6, 1.5], [9, 5.5, 0.7], [11, 6.5, 2.4], [15, 7, 3.1], [0, 6, 4], [12, 5, 2],
];

const vars = (dur: number, delay: number) => ({ '--dur': `${dur}s`, '--delay': `${delay}s` }) as React.CSSProperties;

const HALF = 800;
const inHalf = (side: 'left' | 'right', i: number) => (NODES[i][0] < HALF) === (side === 'left');

const MeshHalf: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const own = (a: number, b: number) => inHalf(side, a) && inHalf(side, b);
  return (
    <svg
      className={`bd-mesh ${side === 'left' ? 'left-0' : 'left-1/2'}`}
      viewBox={`${side === 'left' ? 0 : HALF} 0 ${HALF} 900`}
      preserveAspectRatio={side === 'left' ? 'xMinYMin slice' : 'xMaxYMin slice'}
    >
      {LINKS.filter(([a, b]) => own(a, b)).map(([a, b]) => (
        <line key={`${a}-${b}`} className="bd-link" x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} />
      ))}
      {TRAFFIC.filter(([a, b]) => own(a, b)).map(([a, b, dur, delay]) => (
        <line
          key={`p${a}-${b}`}
          className="bd-packet"
          pathLength={100}
          style={vars(dur, delay)}
          x1={NODES[a][0]}
          y1={NODES[a][1]}
          x2={NODES[b][0]}
          y2={NODES[b][1]}
        />
      ))}
      {NODES.map(([x, y], i) => inHalf(side, i) && <circle key={i} className="bd-node" cx={x} cy={y} r={4.5} />)}
      {LIVE.filter(([i]) => inHalf(side, i)).map(([i, dur, delay]) => (
        <circle key={`l${i}`} className="bd-node--live" cx={NODES[i][0]} cy={NODES[i][1]} r={3} style={vars(dur, delay)} />
      ))}
    </svg>
  );
};

interface AppBackdropProps {
  /** `hero` centers and strengthens the scene for full-screen states such as sign-in and boot. */
  variant?: 'app' | 'hero';
  className?: string;
}

/**
 * Ambient page backdrop: drifting accent light, a dot lattice and a faint mesh with packets in
 * transit. Purely decorative, token-colored, and frozen by the "static background" preference
 * or the system's reduced-motion setting.
 */
export const AppBackdrop: React.FC<AppBackdropProps> = ({ variant = 'app', className = 'fixed inset-0 -z-10' }) => (
  <div className={`pointer-events-none overflow-hidden ${variant === 'hero' ? 'bd-hero' : ''} ${className}`} aria-hidden="true">
    <div className="bd-aurora bd-aurora--a" style={variant === 'hero' ? ({ '--bd-boost': 1.9 } as React.CSSProperties) : undefined} />
    <div className="bd-aurora bd-aurora--b" />
    <div className="bd-aurora bd-aurora--c" />
    <div className="bd-dots" />
    <MeshHalf side="left" />
    <MeshHalf side="right" />
  </div>
);
