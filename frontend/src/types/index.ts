export interface NodeInfo {
  network_name?: string;
  hostname?: string;
  ipv4?: string;
  protocol?: string;
  port?: string;
  encryption?: string;
  service_active?: boolean;
  easytier_version?: string;
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
}

export interface HaproxyTunnel {
  TUNNEL_NAME: string;
  TARGET_IP: string;
  PORT_SPEC: string;
}

export interface IptablesTunnel {
  TUNNEL_NAME: string;
  TARGET_IP: string;
  PORT_SPEC: string;
  FORWARD_PROTOCOL?: string;
  IN_IF?: string;
  SOURCE_CIDR?: string;
}

export interface GostTunnel {
  TUNNEL_NAME: string;
  TARGET_IP: string;
  PORT_SPEC: string;
  PROTOCOL?: string;
}

export interface RealmTunnel {
  TUNNEL_NAME: string;
  TARGET_IP: string;
  PORT_SPEC: string;
  PROTOCOL?: string;
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

export interface SpeedtestInterval {
  interval: number;
  mbps: number;
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
  summary: SpeedtestSummary;
  intervals: SpeedtestInterval[];
}

export interface PingResult {
  min_ms: number;
  avg_ms: number;
  max_ms: number;
  packet_loss_percent: number;
  raw: string;
}

export type Language = 'en' | 'fa';

export type PaletteId = 'sky' | 'emerald' | 'violet' | 'amber' | 'rose' | 'oled';

export type TabId = 'peers' | 'node' | 'speedtest' | 'ping' | 'tunnels';

export type MeshProtocol = 'dual' | 'udp' | 'tcp' | 'ws' | 'wss' | 'quic' | 'faketcp';

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
  public_ip?: string;
  node_configured: boolean;
  service_active: boolean;
  last_rollback?: RollbackInfo;
}

export interface MeshInviteData {
  invite: string;
  details: {
    v: number;
    net: string;
    secret: string;
    endpoint: string;
    proto: string;
  };
  public_ip: string;
  port: string | number;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}
