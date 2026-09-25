import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TunnelNodeState, TunnelsData, TunnelType } from '../types';
import { fetchNodeTunnels, fetchTunnelNodes } from '../services/api';

/** 'local' = this node only, 'all' = every mesh node, otherwise a single node IP. */
export type TunnelScope = 'local' | 'all' | string;

export const TUNNEL_TYPES: TunnelType[] = ['realm', 'haproxy', 'iptables', 'gost'];
const EMPTY: TunnelsData = { haproxy: [], iptables: [], gost: [], realm: [] };
const SCOPE_KEY = 'xraymesh.tunnels.scope';
const POLL_MS = 15000;

function readScope(): TunnelScope {
  try {
    return localStorage.getItem(SCOPE_KEY) || 'local';
  } catch {
    return 'local';
  }
}

/**
 * Loads tunnels node by node, so a slow or lossy peer only delays its own
 * section instead of the whole list. The local node is always loaded; remote
 * nodes only when the scope includes them.
 */
export function useTunnels(enabled: boolean) {
  const [scope, setScopeState] = useState<TunnelScope>(readScope);
  const [nodes, setNodes] = useState<TunnelNodeState[]>([]);
  const [byNode, setByNode] = useState<Record<string, TunnelsData>>({});
  const inFlight = useRef(new Set<string>());
  const nodesRef = useRef<TunnelNodeState[]>([]);
  nodesRef.current = nodes;

  const localIp = nodes.find((n) => n.is_local)?.ip || '';

  const patchNode = useCallback((ip: string, patch: Partial<TunnelNodeState>) => {
    setNodes((prev) => prev.map((n) => (n.ip === ip ? { ...n, ...patch } : n)));
  }, []);

  const loadNode = useCallback(
    async (ip: string) => {
      if (!ip || inFlight.current.has(ip)) return;
      inFlight.current.add(ip);
      patchNode(ip, { loading: true });
      try {
        const res = await fetchNodeTunnels(ip);
        setByNode((prev) => ({ ...prev, [res.node.ip]: { ...EMPTY, ...res.data } }));
        setNodes((prev) => {
          const exists = prev.some((n) => n.ip === res.node.ip);
          const next = { ...res.node, loading: false };
          return exists ? prev.map((n) => (n.ip === res.node.ip ? next : n)) : [next, ...prev];
        });
      } catch (e: any) {
        patchNode(ip, { loading: false, status: 'remote_error', error: e?.message });
      } finally {
        inFlight.current.delete(ip);
      }
    },
    [patchNode]
  );

  const remoteTargets = useCallback(
    (list: TunnelNodeState[], s: TunnelScope) =>
      list.filter((n) => !n.is_local && (s === 'all' || s === n.ip)).map((n) => n.ip),
    []
  );

  const refresh = useCallback(
    async (s: TunnelScope = scope) => {
      let list = nodesRef.current;
      try {
        const fresh = await fetchTunnelNodes();
        // Keep the last known status of nodes we already have, so the UI does not flash.
        setNodes((prev) =>
          fresh.map((n) => {
            const old = prev.find((p) => p.ip === n.ip);
            return old ? { ...old, name: n.name, is_local: n.is_local } : n;
          })
        );
        list = fresh;
      } catch {
        // Node list is best effort; fall back to what we already know.
      }
      const local = list.find((n) => n.is_local)?.ip;
      await Promise.all([loadNode(local || 'local'), ...remoteTargets(list, s).map(loadNode)]);
    },
    [scope, loadNode, remoteTargets]
  );

  const setScope = useCallback(
    (s: TunnelScope) => {
      setScopeState(s);
      try {
        localStorage.setItem(SCOPE_KEY, s);
      } catch {
        // Per-viewer convenience only.
      }
      remoteTargets(nodesRef.current, s)
        .filter((ip) => nodesRef.current.find((n) => n.ip === ip)?.status === 'idle')
        .forEach(loadNode);
    },
    [loadNode, remoteTargets]
  );

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    refreshRef.current();
    const id = window.setInterval(() => refreshRef.current(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  // A remembered single-node scope whose node has left the mesh falls back to this node.
  useEffect(() => {
    if (scope !== 'local' && scope !== 'all' && nodes.length > 0 && !nodes.some((n) => n.ip === scope)) {
      setScopeState('local');
    }
  }, [scope, nodes]);

  /** Tunnels of the nodes inside the current scope, merged into one list per type. */
  const tunnels = useMemo<TunnelsData>(() => {
    const ips =
      scope === 'all' ? Object.keys(byNode) : scope === 'local' ? [localIp || 'local'] : [scope];
    const out: TunnelsData = { haproxy: [], iptables: [], gost: [], realm: [] };
    for (const ip of ips) {
      const d = byNode[ip];
      if (!d) continue;
      for (const type of TUNNEL_TYPES) (out[type] as unknown[]).push(...((d[type] as unknown[]) || []));
    }
    return out;
  }, [byNode, scope, localIp]);

  const reloadNode = useCallback((ip?: string) => loadNode(ip && ip !== localIp ? ip : localIp || 'local'), [loadNode, localIp]);

  return { scope, setScope, nodes, byNode, tunnels, localIp, refresh, loadNode, reloadNode };
}
