export interface NodeInfo {
  configured?: boolean;
  network_name?: string;
  hostname?: string;
  ipv4?: string;
  protocol?: string;
  port?: string;
  encryption?: string;
  service_active?: boolean;
  easytier_version?: string;
  xraymesh_version?: string;
  branch?: string;
  web_port?: number;
  ssl_enabled?: boolean;
  web_domain?: string;
}

export interface SystemStats {
  cpu_percent: number;
  ram_total_mb: number;
  ram_used_mb: number;
  ram_percent: number;
  uptime_str: string;
  load_avg: [number, number, number];
}

export interface StatusResponse {
  node: NodeInfo;
  system: SystemStats;
}

export interface Peer {
  ipv4: string;
  hostname?: string;
  lat_ms?: string | number;
  tunnel_proto?: string;
  cost?: string | number;
  rx_bytes?: string;
  tx_bytes?: string;
  rx_packets?: string | number;
  tx_packets?: string | number;
  xraymesh_version?: string;
  xraymesh_branch?: string;
  interfaces?: string[];
  update_available?: boolean;
  /** False when the server could not reach GitHub, so "no update" is not known. */
  update_checked?: boolean;
  version_drift?: boolean;
  is_current?: boolean;
  latest_version?: string;
  update?: UpdateJob;
  connection?: 'direct' | 'relay' | 'local';
  /** Set when the direct connection runs across a BackPack link; `tunnel_proto` then only says "udp". */
  transport?: 'icmp' | 'pck';
  /** Runs the pre-2.2.6-beta.5 updater: no step reports. */
  legacy?: boolean;
  loss_rate?: string | number;
}

/** Self-update job recorded by xraymesh.sh node-update. */
export interface UpdateJob {
  state?: 'idle' | 'queued' | 'running' | 'success' | 'failed' | 'up_to_date';
  step?: string;
  target_version?: string;
  error?: string;
  rolled_back?: boolean;
  started_at?: number;
  finished_at?: number;
}

export interface UpdateSummary {
  version?: string;
  branch?: string;
  latest_version?: string;
  update_available?: boolean;
  update?: UpdateJob;
}

export interface HaproxyTunnel {
  TUNNEL_NAME: string;
  TARGET_IP: string;
  PORT_SPEC: string;
  _node_ip?: string;
  _node_name?: string;
  _is_local?: boolean;
}

export interface IptablesTunnel {
  TUNNEL_NAME: string;
  TARGET_IP: string;
  PORT_SPEC: string;
  FORWARD_PROTOCOL?: string;
  IN_IF?: string;
  SOURCE_CIDR?: string;
  _node_ip?: string;
  _node_name?: string;
  _is_local?: boolean;
}

export interface GostTunnel {
  TUNNEL_NAME: string;
  TARGET_IP: string;
  PORT_SPEC: string;
  PROTOCOL?: string;
  _node_ip?: string;
  _node_name?: string;
  _is_local?: boolean;
}

export interface RealmTunnel {
  TUNNEL_NAME: string;
  TARGET_IP: string;
  PORT_SPEC: string;
  PROTOCOL?: string;
  _node_ip?: string;
  _node_name?: string;
  _is_local?: boolean;
}

export interface TunnelsData {
  haproxy: HaproxyTunnel[];
  iptables: IptablesTunnel[];
  gost: GostTunnel[];
  realm: RealmTunnel[];
  haproxy_service?: string;
  iptables_service?: string;
  gost_service?: string;
  realm_service?: string;
}

export type TunnelType = 'realm' | 'haproxy' | 'iptables' | 'gost';

/** idle = not requested yet (outside the current scope); the rest after ok are failure codes from the server. */
export type TunnelNodeStatus = 'idle' | 'ok' | 'unreachable' | 'timeout' | 'auth_failed' | 'unsupported' | 'remote_error';

export interface TunnelNodeState {
  ip: string;
  name: string;
  is_local: boolean;
  status: TunnelNodeStatus;
  /** A request for this node is in flight; any tunnels already shown stay visible meanwhile. */
  loading?: boolean;
  /** True when the tunnels shown are the last good copy, not a live answer. */
  stale?: boolean;
  /** Unix seconds of the data being shown. */
  fetched_at?: number | null;
  latency_ms?: number;
  error?: string;
}

export interface TunnelNodeResponse {
  data: TunnelsData;
  node: TunnelNodeState;
}

export interface VersionInfo {
  current_version: string;
  latest_version: string;
  branch?: string;
  update_available: boolean;
  changelog?: string[];
  release_notes?: string;
  update_command?: string;
}

export interface SpeedtestInterval {
  interval: number;
  mbps: number;
  start?: number;
  end?: number;
  bytes?: number;
  retransmits?: number;
}

export interface SpeedtestSummary {
  sent_mbps?: string;
  received_mbps?: string;
  mbps?: string;
  total_bytes?: number;
  total_bytes_sent?: number;
  total_bytes_received?: number;
  jitter_ms?: number;
  loss_percent?: number;
  lost_packets?: number;
  retransmits?: number;
}

export interface SpeedtestData {
  source?: string;
  target?: string;
  protocol?: string;
  duration?: number;
  summary: SpeedtestSummary;
  intervals: SpeedtestInterval[];
}

export interface PingReply {
  seq: number;
  status: 'ok' | 'timeout' | 'error';
  time_ms: number | null;
  ttl?: number;
  message?: string;
}

export interface PingResult {
  source?: string;
  target?: string;
  count?: number;
  packets_received?: number;
  min_ms: number;
  avg_ms: number;
  max_ms: number;
  mdev_ms?: number;
  packet_loss_percent: number;
  raw: string;
  /** Per-probe replies; absent when an older node ran the ping. */
  replies?: PingReply[];
}

/** A test running on the server; its samples grow while the browser polls it. */
export interface LiveTest<Sample, Result> {
  id: string;
  kind: 'ping' | 'iperf';
  status: 'running' | 'done' | 'error';
  /** "connecting" until the first data arrives. */
  phase: 'connecting' | 'running' | 'done';
  params: { source?: string; target?: string; count?: number; protocol?: 'tcp' | 'udp'; duration?: number };
  samples: Sample[];
  result: Result | null;
  error: string | null;
  /** Seconds since the test started. */
  elapsed: number;
}

export type LivePing = LiveTest<PingReply, PingResult>;
export type LiveSpeedtest = LiveTest<SpeedtestInterval, SpeedtestData>;

export type Language = 'en' | 'fa';

export type PaletteId = 'firouzeh' | 'ocean' | 'iris' | 'saffron' | 'graphite' | 'midnight';
export type ThemeMode = 'auto' | 'light' | 'dark';
export type BackdropMode = 'animated' | 'static';

export type TabId = 'peers' | 'node' | 'speedtest' | 'ping' | 'tunnels';

export type MeshProtocol = 'dual' | 'udp' | 'tcp' | 'ws' | 'wss' | 'quic' | 'faketcp' | 'icmp' | 'pck';

export interface RollbackInfo {
  occurred: boolean;
  timestamp: number;
  reason: string;
  failed_protocol?: string;
  restored_protocol?: string;
  details?: string;
}

export interface NodeConfig {
  network_name: string;
  network_secret: string;
  hostname: string;
  ipv4: string;
  protocol: MeshProtocol | string;
  port: number;
  peers: string[];
  encryption: boolean;
  ipv6: boolean;
  mtu: number;
  enable_kcp: boolean;
  multi_thread?: boolean;
  public_ip?: string;
  node_configured: boolean;
  service_active: boolean;
  last_rollback?: RollbackInfo;
}

/** Answer on a server that joined over an ICMP/PCK link: codes come from the server it joined through. */
export interface MeshInviteJoinedVia {
  joined_via: string;
  proto: string;
}

export interface MeshInviteData {
  invite: string;
  details: {
    v: number;
    net: string;
    secret: string;
    endpoint: string;
    proto: string;
    /** The inviting server's mesh port; joining servers listen on the same one by default. */
    port?: number;
    enc?: boolean;
    kcp?: boolean;
    ipv6?: boolean;
    mtu?: number;
    /** ICMP invites carry one BackPack link: its token, port and address slot. */
    icmp?: { t: string; p: number; i: number };
    /** PCK invites carry their BackPack link here; `p` is the TCP port the joining server dials. */
    link?: { t: string; p: number; i: number };
  };
  public_ip: string;
  public_ipv6?: string;
  /** "[v6]:port" when other servers can reach this one over IPv6. */
  endpoint_ipv6?: string;
  /** Why IPv6 cannot be offered: IPv6 is off, the protocol has no IPv6 listener, or no public address. */
  ipv6_unavailable?: '' | 'disabled' | 'icmp' | 'pck' | 'faketcp' | 'not_detected';
  port: string | number;
}

export interface JoinMeshResult {
  network_name: string;
  hostname: string;
  ipv4: string;
  port: number;
  peer: string;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  /** Set shortly before removal so the toast can animate out. */
  leaving?: boolean;
}
