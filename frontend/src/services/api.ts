import { StatusResponse, Peer, TunnelsData, TunnelNodeState, TunnelNodeResponse, PingResult, SpeedtestData, NodeConfig, MeshInviteData, JoinMeshResult, RollbackInfo, VersionInfo, UpdateSummary } from '../types';

export async function fetchAuthStatus(): Promise<{ authenticated: boolean; password_configured: boolean }> {
  const res = await fetch('/api/auth/status');
  if (!res.ok) throw new Error('Auth check failed');
  return res.json();
}

export async function loginWithPassword(password: string): Promise<boolean> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Password login failed');
  return true;
}

export async function loginWithToken(token: string): Promise<boolean> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Token login failed');
  return true;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

export interface PeersResult {
  peers: Peer[];
  cluster_version_drift?: boolean;
  clusterVersionDrift?: boolean;
  current_version?: string;
  latest_version?: string;
  branch?: string;
  update_command?: string;
  local_ip?: string;
  local_hostname?: string;
}

export async function fetchPeersData(): Promise<PeersResult> {
  const res = await fetch('/api/peers');
  if (!res.ok) throw new Error('Failed to fetch peers');
  const d = await res.json();
  const rawPeers = d.data;
  let list: Peer[] = [];
  if (Array.isArray(rawPeers)) {
    list = rawPeers;
  } else if (rawPeers && typeof rawPeers === 'object') {
    if (Array.isArray(rawPeers.peers)) list = rawPeers.peers;
    else list = Object.values(rawPeers);
  }
  const filtered = list.filter((p) => p && p.ipv4 && (p.cost !== 'Local' || p.is_current));
  return {
    peers: filtered,
    cluster_version_drift: d.cluster_version_drift,
    clusterVersionDrift: d.cluster_version_drift,
    current_version: d.current_version,
    latest_version: d.latest_version,
    local_ip: d.local_ip,
    local_hostname: d.local_hostname,
    branch: d.branch,
    update_command: d.update_command,
  };
}

export async function fetchPeers(): Promise<Peer[]> {
  const data = await fetchPeersData();
  const list = data.peers;
  (list as any).cluster_version_drift = data.cluster_version_drift;
  (list as any).current_version = data.current_version;
  (list as any).latest_version = data.latest_version;
  return list;
}

export async function fetchTunnels(): Promise<TunnelsData> {
  const res = await fetch('/api/tunnels');
  if (!res.ok) throw new Error('Failed to fetch tunnels');
  const d = await res.json();
  return d.data || { haproxy: [], iptables: [], gost: [] };
}

export async function fetchTunnelNodes(): Promise<TunnelNodeState[]> {
  const res = await fetch('/api/tunnels/nodes');
  if (!res.ok) throw new Error('Failed to fetch tunnel nodes');
  const d = await res.json();
  return (d.nodes || []).map((n: TunnelNodeState) => ({ ...n, status: 'idle' as const }));
}

/** One node's tunnels. Remote failures still resolve, carrying the cached copy and a status. */
export async function fetchNodeTunnels(node: string, signal?: AbortSignal): Promise<TunnelNodeResponse> {
  const res = await fetch(`/api/tunnels?node=${encodeURIComponent(node)}`, { signal });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to fetch tunnels');
  return { data: d.data, node: d.node };
}

export async function fetchInterfaces(node?: string, signal?: AbortSignal): Promise<string[]> {
  const url = node && node !== 'local' ? `/api/interfaces?node=${encodeURIComponent(node)}` : '/api/interfaces';
  const res = await fetch(url, { signal });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(d.error || `Failed to load interfaces (HTTP ${res.status})`);
  }
  if (!Array.isArray(d.data)) throw new Error('Interface API returned an invalid response');

  const interfaces: string[] = [...new Set<string>(
    d.data
      .filter((item: unknown): item is string => typeof item === 'string')
      .map((item: string) => item.trim())
      .filter(Boolean),
  )];
  if (interfaces.length === 0) throw new Error('No network interfaces were returned');
  return interfaces;
}

export async function runPing(
  target: string,
  count: number,
  source?: string
): Promise<PingResult> {
  const res = await fetch('/api/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, count, source }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Ping failed');
  return d.data;
}

export async function runSpeedtest(
  target: string,
  protocol: 'tcp' | 'udp',
  duration: number,
  bandwidth: string,
  source?: string
): Promise<SpeedtestData> {
  const res = await fetch('/api/iperf/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, protocol, duration, bandwidth, source }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Speedtest failed');
  return d.data;
}

// Tunnel mutations
export async function saveHaproxyTunnel(
  isEdit: boolean,
  name: string,
  target: string,
  ports: string,
  originNode?: string
): Promise<string> {
  const endpoint = isEdit ? '/api/tunnels/haproxy/edit' : '/api/tunnels/haproxy/create';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, target, ports, origin_node: originNode }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to save HAProxy tunnel');
  return d.message;
}

export async function deleteHaproxyTunnel(name: string, originNode?: string): Promise<string> {
  const res = await fetch('/api/tunnels/haproxy/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, origin_node: originNode }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to delete tunnel');
  return d.message;
}

export async function saveIptablesTunnel(
  isEdit: boolean,
  name: string,
  target: string,
  ports: string,
  protocol: string,
  iface: string,
  sourceCidr: string,
  originNode?: string
): Promise<string> {
  const endpoint = isEdit ? '/api/tunnels/iptables/edit' : '/api/tunnels/iptables/create';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      target,
      ports,
      protocol,
      interface: iface,
      source_cidr: sourceCidr || '0.0.0.0/0',
      origin_node: originNode,
    }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to save iptables tunnel');
  return d.message;
}

export async function deleteIptablesTunnel(name: string, originNode?: string): Promise<string> {
  const res = await fetch('/api/tunnels/iptables/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, origin_node: originNode }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to delete tunnel');
  return d.message;
}

export async function saveGostTunnel(
  isEdit: boolean,
  name: string,
  target: string,
  ports: string,
  protocol: string,
  originNode?: string
): Promise<string> {
  const endpoint = isEdit ? '/api/tunnels/gost/edit' : '/api/tunnels/gost/create';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, target, ports, protocol, origin_node: originNode }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to save GOST tunnel');
  return d.message;
}

export async function deleteGostTunnel(name: string, originNode?: string): Promise<string> {
  const res = await fetch('/api/tunnels/gost/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, origin_node: originNode }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to delete tunnel');
  return d.message;
}

export async function saveRealmTunnel(
  isEdit: boolean,
  name: string,
  target: string,
  ports: string,
  protocol: string,
  originNode?: string
): Promise<string> {
  const endpoint = isEdit ? '/api/tunnels/realm/edit' : '/api/tunnels/realm/create';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, target, ports, protocol, origin_node: originNode }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to save Realm tunnel');
  return d.message;
}

export async function deleteRealmTunnel(name: string, originNode?: string): Promise<string> {
  const res = await fetch('/api/tunnels/realm/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, origin_node: originNode }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to delete Realm tunnel');
  return d.message;
}

/** Parse a JSON API response; a garbled body becomes a readable error instead of a raw JSON.parse message. */
async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Unexpected response from the server (HTTP ${res.status}).`);
  }
}

export async function deleteNodeConfig(): Promise<string> {
  const res = await fetch('/api/node/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to delete node');
  return d.message;
}

export async function fetchNodeConfig(): Promise<NodeConfig> {
  const res = await fetch('/api/node/config');
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to fetch node configuration');
  return d.data;
}

export async function saveNodeConfig(config: Partial<NodeConfig>): Promise<string> {
  const res = await fetch('/api/node/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to save node configuration');
  return d.message || 'Configuration saved successfully.';
}

export async function addMeshPeer(peer: string): Promise<string[]> {
  const res = await fetch('/api/node/peers/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peer }),
  });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to add peer');
  return d.peers || [];
}

export async function removeMeshPeer(peer: string): Promise<string[]> {
  const res = await fetch('/api/node/peers/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peer }),
  });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to remove peer');
  return d.peers || [];
}

export async function fetchMeshInvite(): Promise<MeshInviteData> {
  const res = await fetch('/api/node/invite');
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to generate invite');
  return d.data;
}

/** Error from /api/node/join; `code` identifies the failure and `restored` means the old config is back. */
export class JoinMeshError extends Error {
  code: string;
  restored: boolean;

  constructor(message: string, code = '', restored = false) {
    super(message);
    this.name = 'JoinMeshError';
    this.code = code;
    this.restored = restored;
  }
}

/** Replace this node's mesh configuration with the one from an invite code. */
export async function joinMeshNetwork(
  invite: string,
  options: { hostname: string; ipv4: string; port?: number }
): Promise<JoinMeshResult> {
  const res = await fetch('/api/node/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite, ...options }),
  });
  const d = await readJson(res);
  if (!res.ok || !d.ok) {
    throw new JoinMeshError(d.error || 'Failed to join mesh network', d.code, Boolean(d.restored));
  }
  return d.data;
}

export async function startMeshNode(): Promise<string> {
  const res = await fetch('/api/node/start', { method: 'POST' });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to start mesh node');
  return d.message || 'Mesh node started successfully.';
}

export async function stopMeshNode(): Promise<string> {
  const res = await fetch('/api/node/stop', { method: 'POST' });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to stop mesh node');
  return d.message || 'Mesh node stopped.';
}

export async function restartMeshNode(): Promise<string> {
  const res = await fetch('/api/node/restart', { method: 'POST' });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to restart mesh node');
  return d.message || 'Mesh node restarted successfully.';
}

export interface ClusterBroadcastPayload {
  protocol?: string;
  enable_kcp?: boolean;
  encryption?: boolean;
  ipv6?: boolean;
  mtu?: number;
  network_secret?: string;
}

export interface ClusterBroadcastResponse {
  ok: boolean;
  message: string;
  synced_nodes: string[];
  applied_settings: Record<string, any>;
}

export async function broadcastClusterConfig(payload: ClusterBroadcastPayload): Promise<ClusterBroadcastResponse> {
  const res = await fetch('/api/cluster/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to broadcast cluster configuration');
  return d;
}

export async function fetchClusterStatus(): Promise<{
  watchdog_armed: boolean;
  watchdog_remaining_sec: number;
  backup_exists: boolean;
  staged_exists: boolean;
  last_rollback?: RollbackInfo;
}> {
  const res = await fetch('/api/cluster/status');
  if (!res.ok) throw new Error('Failed to fetch cluster status');
  return res.json();
}

export async function dismissClusterRollback(): Promise<void> {
  const res = await fetch('/api/cluster/rollback/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error('Failed to dismiss rollback notice');
}

/** `refresh` skips the server's cache and asks GitHub again. */
export async function fetchVersionInfo(refresh = false): Promise<VersionInfo> {
  const res = await fetch(refresh ? '/api/version?refresh=1' : '/api/version');
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to fetch version info');
  return d.data;
}

/** Error from a node action; `code` explains why (unreachable, auth_failed, unsupported, already_running...). */
export class NodeActionError extends Error {
  code: string;

  constructor(message: string, code = '') {
    super(message);
    this.name = 'NodeActionError';
    this.code = code;
  }
}

async function postNodeAction(path: string, body: object): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new NodeActionError(d.error || 'The request failed', d.code || '');
  return d;
}

/** Start a verified self-update on any mesh server (this one included). */
export async function startNodeUpdate(
  targetIp: string
): Promise<{ legacy: boolean; status: UpdateSummary }> {
  const d = await postNodeAction('/api/cluster/update', { target_ip: targetIp });
  return { legacy: Boolean(d.legacy), status: d.status || {} };
}

/**
 * This server's version and update job from the public cluster endpoint. Works
 * without a session, which a restart of this panel's own server drops.
 */
export async function fetchLocalUpdateInfo(): Promise<UpdateSummary> {
  const res = await fetch(`/api/cluster/info?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Server not ready');
  return res.json();
}

/** Poll a server's update job. `reachable` is false while it restarts. */
export async function fetchNodeUpdateStatus(
  targetIp: string
): Promise<{ reachable: boolean; legacy: boolean; status: UpdateSummary }> {
  const d = await postNodeAction('/api/cluster/update/status', { target_ip: targetIp });
  return { reachable: d.reachable !== false, legacy: Boolean(d.legacy), status: d.status || {} };
}

export async function setNodeUpdateChannel(targetIp: string, channel: 'stable' | 'beta'): Promise<UpdateSummary> {
  const d = await postNodeAction('/api/cluster/channel', { target_ip: targetIp, channel });
  return d.status || {};
}


