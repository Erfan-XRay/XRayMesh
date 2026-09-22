import { StatusResponse, Peer, TunnelsData, PingResult, SpeedtestData, NodeConfig, MeshInviteData, RollbackInfo, VersionInfo } from '../types';

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

export async function fetchInterfaces(node?: string): Promise<string[]> {
  try {
    const url = node && node !== 'local' ? `/api/interfaces?node=${encodeURIComponent(node)}` : '/api/interfaces';
    const res = await fetch(url);
    const d = await res.json();
    return d.data || ['any'];
  } catch {
    return ['any'];
  }
}

export async function runPing(target: string, count: number): Promise<PingResult> {
  const res = await fetch('/api/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, count }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Ping failed');
  return d.data;
}

export async function runSpeedtest(
  target: string,
  protocol: 'tcp' | 'udp',
  duration: number,
  bandwidth: string
): Promise<SpeedtestData> {
  const res = await fetch('/api/iperf/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, protocol, duration, bandwidth }),
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

export async function deleteNodeConfig(): Promise<string> {
  const res = await fetch('/api/node/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to delete node');
  return d.message;
}

export async function fetchNodeConfig(): Promise<NodeConfig> {
  const res = await fetch('/api/node/config');
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to fetch node configuration');
  return d.data;
}

export async function saveNodeConfig(config: Partial<NodeConfig>): Promise<string> {
  const res = await fetch('/api/node/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to save node configuration');
  return d.message || 'Configuration saved successfully.';
}

export async function addMeshPeer(peer: string): Promise<string> {
  const res = await fetch('/api/node/peers/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peer }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to add peer');
  return d.message;
}

export async function removeMeshPeer(peer: string): Promise<string> {
  const res = await fetch('/api/node/peers/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peer }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to remove peer');
  return d.message;
}

export async function fetchMeshInvite(): Promise<MeshInviteData> {
  const res = await fetch('/api/node/invite');
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to generate invite');
  return d.data;
}

export async function joinMeshNetwork(
  invite: string,
  options?: { hostname?: string; ipv4?: string }
): Promise<string> {
  const res = await fetch('/api/node/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invite,
      hostname: options?.hostname,
      ipv4: options?.ipv4,
    }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to join mesh network');
  return d.message;
}

export async function startMeshNode(): Promise<string> {
  const res = await fetch('/api/node/start', { method: 'POST' });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to start mesh node');
  return d.message || 'Mesh node started successfully.';
}

export async function stopMeshNode(): Promise<string> {
  const res = await fetch('/api/node/stop', { method: 'POST' });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to stop mesh node');
  return d.message || 'Mesh node stopped.';
}

export async function restartMeshNode(): Promise<string> {
  const res = await fetch('/api/node/restart', { method: 'POST' });
  const d = await res.json();
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

export async function fetchVersionInfo(): Promise<VersionInfo> {
  const res = await fetch('/api/version');
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to fetch version info');
  return d.data;
}

export async function updateNode(targetIp?: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/cluster/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_ip: targetIp || 'local' }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to update node');
  return d;
}

export async function updateAllNodes(): Promise<{ ok: boolean; message: string; results?: Record<string, any> }> {
  const res = await fetch('/api/cluster/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_ip: 'all' }),
  });
  const d = await res.json();
  if (!res.ok || !d.ok) throw new Error(d.error || 'Failed to update all nodes');
  return d;
}


