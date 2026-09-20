import React, { useState, useEffect, useCallback } from 'react';
import { NodeConfig, MeshProtocol, MeshInviteData, Language } from '../../types';
import {
  fetchNodeConfig,
  saveNodeConfig,
  addMeshPeer,
  removeMeshPeer,
  fetchMeshInvite,
  joinMeshNetwork,
} from '../../services/api';
import {
  Settings,
  Shield,
  Radio,
  Server,
  Share2,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Save,
  Zap,
  Eye,
  EyeOff,
  Link,
  Sliders,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface NodeConfigTabProps {
  onRefreshStatus: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: (key: any) => string;
  lang: Language;
  isRtl: boolean;
}

export const NodeConfigTab: React.FC<NodeConfigTabProps> = ({
  onRefreshStatus,
  onNotify,
  onCopy,
  copiedKey,
  t,
  isRtl,
}) => {
  const [config, setConfig] = useState<NodeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Form State
  const [networkName, setNetworkName] = useState('');
  const [networkSecret, setNetworkSecret] = useState('');
  const [hostname, setHostname] = useState('');
  const [ipv4, setIpv4] = useState('');
  const [port, setPort] = useState(11010);
  const [protocol, setProtocol] = useState<MeshProtocol>('dual');
  const [encryption, setEncryption] = useState(true);
  const [ipv6, setIpv6] = useState(false);
  const [mtu, setMtu] = useState(1380);
  const [enableKcp, setEnableKcp] = useState(false);
  const [wgPortal, setWgPortal] = useState(false);
  const [wgPortalPort, setWgPortalPort] = useState(22022);
  const [wgClientCidr, setWgClientCidr] = useState('10.99.11.0/24');
  const [peers, setPeers] = useState<string[]>([]);

  // Peer management
  const [newPeer, setNewPeer] = useState('');
  const [addingPeer, setAddingPeer] = useState(false);

  // Invite & Join
  const [inviteData, setInviteData] = useState<MeshInviteData | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joining, setJoining] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetchNodeConfig();
      setConfig(cfg);
      setNetworkName(cfg.network_name || 'xraymesh');
      setNetworkSecret(cfg.network_secret || '');
      setHostname(cfg.hostname || '');
      setIpv4(cfg.ipv4 || '10.144.144.1');
      setPort(cfg.port || 11010);
      setProtocol((cfg.protocol as MeshProtocol) || 'dual');
      setEncryption(cfg.encryption !== false);
      setIpv6(Boolean(cfg.ipv6));
      setMtu(cfg.mtu || 1380);
      setEnableKcp(Boolean(cfg.enable_kcp));
      setWgPortal(Boolean(cfg.wg_portal));
      setWgPortalPort(cfg.wg_portal_port || 22022);
      setWgClientCidr(cfg.wg_client_cidr || '10.99.11.0/24');
      setPeers(cfg.peers || []);

      if (cfg.node_configured) {
        loadInvite();
      }
    } catch (e: any) {
      onNotify(e.message || 'Failed to load configuration', 'error');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  const loadInvite = async () => {
    setLoadingInvite(true);
    try {
      const inv = await fetchMeshInvite();
      setInviteData(inv);
    } catch (e) {
      // ignore
    } finally {
      setLoadingInvite(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!networkName.trim() || !networkSecret.trim() || !ipv4.trim() || !port) {
      onNotify('Please fill in required fields (Network Name, Secret, VIP, Port)', 'error');
      return;
    }
    setSaving(true);
    try {
      const msg = await saveNodeConfig({
        network_name: networkName.trim(),
        network_secret: networkSecret.trim(),
        hostname: hostname.trim(),
        ipv4: ipv4.trim(),
        port: Number(port),
        protocol,
        encryption,
        ipv6,
        mtu: Number(mtu),
        enable_kcp: enableKcp,
        wg_portal: wgPortal,
        wg_portal_port: Number(wgPortalPort),
        wg_client_cidr: wgClientCidr.trim(),
        peers,
      });
      onNotify(msg || t('node_save_success'), 'success');
      onRefreshStatus();
      loadInvite();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPeer = async () => {
    if (!newPeer.trim()) return;
    setAddingPeer(true);
    try {
      const trimmed = newPeer.trim();
      await addMeshPeer(trimmed);
      setPeers((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      setNewPeer('');
      onNotify(`Peer '${trimmed}' added`, 'success');
      onRefreshStatus();
    } catch (err: any) {
      onNotify(err.message || 'Failed to add peer', 'error');
    } finally {
      setAddingPeer(false);
    }
  };

  const handleRemovePeer = async (peer: string) => {
    try {
      await removeMeshPeer(peer);
      setPeers((prev) => prev.filter((p) => p !== peer));
      onNotify(`Peer '${peer}' removed`, 'info');
      onRefreshStatus();
    } catch (err: any) {
      onNotify(err.message || 'Failed to remove peer', 'error');
    }
  };

  const handleJoin = async () => {
    if (!joinInput.trim()) return;
    setJoining(true);
    try {
      const msg = await joinMeshNetwork(joinInput.trim());
      onNotify(msg || 'Joined mesh successfully!', 'success');
      setJoinInput('');
      loadData();
      onRefreshStatus();
    } catch (err: any) {
      onNotify(err.message || 'Failed to join mesh', 'error');
    } finally {
      setJoining(false);
    }
  };

  const generateRandomSecret = () => {
    const chars = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < 32; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNetworkSecret(s);
  };

  const protocolsList: {
    id: MeshProtocol;
    label: string;
    desc: string;
    badge: string;
    badgeColor: string;
  }[] = [
    {
      id: 'dual',
      label: t('proto_dual'),
      desc: t('proto_dual_desc'),
      badge: 'TCP + UDP',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    },
    {
      id: 'udp',
      label: t('proto_udp'),
      desc: t('proto_udp_desc'),
      badge: 'UDP Only',
      badgeColor: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
    },
    {
      id: 'tcp',
      label: t('proto_tcp'),
      desc: t('proto_tcp_desc'),
      badge: 'TCP Only',
      badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    },
    {
      id: 'ws',
      label: t('proto_ws'),
      desc: t('proto_ws_desc'),
      badge: 'WebSocket (ws)',
      badgeColor: 'text-primary bg-primary/10 border-primary/30',
    },
    {
      id: 'wss',
      label: t('proto_wss'),
      desc: t('proto_wss_desc'),
      badge: 'WSS / TLS',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    },
    {
      id: 'quic',
      label: t('proto_quic'),
      desc: t('proto_quic_desc'),
      badge: 'QUIC / BBR',
      badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    },
    {
      id: 'faketcp',
      label: t('proto_faketcp'),
      desc: t('proto_faketcp_desc'),
      badge: 'FakeTCP',
      badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    },
    {
      id: 'wg',
      label: t('proto_wg'),
      desc: t('proto_wg_desc'),
      badge: 'WireGuard',
      badgeColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 rounded-2xl bg-card border border-card-border backdrop-blur-xl">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-text-muted">{t('mesh_connecting')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unconfigured Alert Banner */}
      {config && !config.node_configured && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-start gap-3 animate-modal-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-sm text-amber-300 mb-1">{t('node_unconfigured_banner')}</h4>
            <p className="text-amber-400/90 leading-relaxed">{t('node_unconfigured_desc')}</p>
          </div>
        </div>
      )}

      {/* Top Header Card */}
      <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text-main flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            {t('node_panel_title')}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">{t('node_panel_desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('btn_refresh')}
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-black font-semibold text-xs hover:bg-primary-hover transition-all shadow-md disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('btn_save')}
          </button>
        </div>
      </div>

      {/* Section 1: Network Identity Card */}
      <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
        <h3 className="text-sm font-bold text-text-main flex items-center gap-2 mb-4 pb-2 border-b border-white/5">
          <Shield className="w-4 h-4 text-primary" />
          {t('node_identity_title')}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* Network Name */}
          <div>
            <label className="block font-medium text-text-muted mb-1.5">{t('node_net_name')}</label>
            <input
              type="text"
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
              placeholder="e.g. xraymesh"
              className="w-full px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
            />
          </div>

          {/* Network Secret */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-medium text-text-muted">{t('node_net_secret')}</label>
              <button
                type="button"
                onClick={generateRandomSecret}
                className="text-[11px] text-primary hover:underline"
              >
                Generate
              </button>
            </div>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={networkSecret}
                onChange={(e) => setNetworkSecret(e.target.value)}
                placeholder="Shared secret across all nodes..."
                className="w-full pl-3.5 pr-10 py-2 bg-slate-950 border border-white/10 rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Virtual IP */}
          <div>
            <label className="block font-medium text-text-muted mb-1.5">{t('node_vip')}</label>
            <input
              type="text"
              value={ipv4}
              onChange={(e) => setIpv4(e.target.value)}
              placeholder="10.144.144.1"
              className="w-full px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
            />
          </div>

          {/* Hostname */}
          <div>
            <label className="block font-medium text-text-muted mb-1.5">{t('node_hostname')}</label>
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="e.g. server-germany"
              className="w-full px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
            />
          </div>

          {/* Listen Port */}
          <div>
            <label className="block font-medium text-text-muted mb-1.5">{t('node_port')}</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              placeholder="11010"
              className="w-full px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
            />
          </div>

          {/* Detected Public IP */}
          <div>
            <label className="block font-medium text-text-muted mb-1.5">{t('node_public_ip')}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={config?.public_ip || 'Detecting...'}
                className="w-full px-3.5 py-2 bg-slate-900/60 border border-white/5 rounded-xl font-mono text-text-muted cursor-not-allowed"
              />
              {config?.public_ip && (
                <button
                  onClick={() => onCopy(config.public_ip!)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-text-muted hover:text-primary transition-colors"
                  title="Copy IP"
                >
                  {copiedKey === config.public_ip ? (
                    <Check className="w-4 h-4 text-accent-green" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Transport Protocol & Acceleration */}
      <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
        <h3 className="text-sm font-bold text-text-main flex items-center gap-2 mb-4 pb-2 border-b border-white/5">
          <Radio className="w-4 h-4 text-primary" />
          {t('node_protocol_title')}
        </h3>

        {/* Protocol Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          {protocolsList.map((p) => {
            const isSelected = protocol === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProtocol(p.id)}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-slate-900/40 border-white/10 hover:border-white/20'
                } ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-bold text-xs text-text-main">{p.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${p.badgeColor}`}>
                    {p.badge}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">{p.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Accelerators & Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5 text-xs">
          {/* KCP Loss-Resistance Proxy */}
          <div className="p-3.5 rounded-xl bg-slate-900/50 border border-white/10 flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-bold text-text-main">{t('node_kcp_label')}</span>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">{t('node_kcp_desc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={enableKcp}
                onChange={(e) => setEnableKcp(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>

          {/* WireGuard VPN Portal */}
          <div className="p-3.5 rounded-xl bg-slate-900/50 border border-white/10 flex flex-col justify-between gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-bold text-text-main">{t('node_wg_portal_label')}</span>
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">{t('node_wg_portal_desc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={wgPortal}
                  onChange={(e) => setWgPortal(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>

            {/* Ingress port and CIDR (if enabled) */}
            {wgPortal && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 mt-1 animate-modal-in">
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('node_wg_port')}</label>
                  <input
                    type="number"
                    value={wgPortalPort}
                    onChange={(e) => setWgPortalPort(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg font-mono text-xs text-text-main"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('node_wg_cidr')}</label>
                  <input
                    type="text"
                    value={wgClientCidr}
                    onChange={(e) => setWgClientCidr(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg font-mono text-xs text-text-main"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Extra Flags (Encryption, IPv6, MTU) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 mt-4 border-t border-white/5 text-xs">
          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/30 border border-white/5 cursor-pointer">
            <input
              type="checkbox"
              checked={encryption}
              onChange={(e) => setEncryption(e.target.checked)}
              className="rounded bg-slate-950 border-white/20 text-primary focus:ring-0"
            />
            <span className="font-medium text-text-main">{t('node_encryption_label')}</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/30 border border-white/5 cursor-pointer">
            <input
              type="checkbox"
              checked={ipv6}
              onChange={(e) => setIpv6(e.target.checked)}
              className="rounded bg-slate-950 border-white/20 text-primary focus:ring-0"
            />
            <span className="font-medium text-text-main">{t('node_ipv6_label')}</span>
          </label>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/30 border border-white/5">
            <Sliders className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <span className="text-[11px] text-text-muted flex-shrink-0">MTU:</span>
            <input
              type="number"
              value={mtu}
              onChange={(e) => setMtu(Number(e.target.value))}
              className="w-full px-2 py-1 bg-slate-950 border border-white/10 rounded font-mono text-xs text-text-main"
            />
          </div>
        </div>
      </div>

      {/* Section 3: One-Click Multi-Server Meshing (Invite & Join) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Share Invite Card */}
        <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2 mb-1">
              <Share2 className="w-4 h-4 text-accent-green" />
              {t('node_invite_title')}
            </h3>
            <p className="text-xs text-text-muted mb-4">{t('node_invite_desc')}</p>

            {inviteData ? (
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/10 mb-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono text-accent-green font-semibold">
                    {inviteData.details.net} ({inviteData.details.proto.toUpperCase()})
                  </span>
                  <span className="text-[10px] text-text-muted font-mono">{inviteData.details.endpoint}</span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/5 font-mono text-[11px] text-text-main break-all line-clamp-3 select-all">
                  {inviteData.invite}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-center text-xs text-text-muted mb-4">
                {loadingInvite ? 'Generating invite token...' : 'Save node configuration to enable mesh invite token.'}
              </div>
            )}
          </div>

          <button
            onClick={() => inviteData && onCopy(inviteData.invite)}
            disabled={!inviteData}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-green/15 text-emerald-400 hover:bg-accent-green/25 font-semibold text-xs border border-accent-green/30 transition-all disabled:opacity-50"
          >
            {copiedKey === inviteData?.invite ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('btn_copied')}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>{t('node_btn_copy_invite')}</span>
              </>
            )}
          </button>
        </div>

        {/* Join Existing Mesh Card */}
        <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2 mb-1">
              <Link className="w-4 h-4 text-primary" />
              {t('node_join_title')}
            </h3>
            <p className="text-xs text-text-muted mb-4">{t('node_join_desc')}</p>

            <textarea
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder={t('node_join_placeholder')}
              rows={3}
              className="w-full p-3 bg-slate-950 border border-white/10 rounded-xl font-mono text-xs text-text-main placeholder-text-subtle focus:outline-none focus:border-primary resize-none mb-4"
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={joining || !joinInput.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs hover:bg-primary-hover transition-all shadow-md disabled:opacity-50"
          >
            {joining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
            <span>{t('node_btn_join')}</span>
          </button>
        </div>
      </div>

      {/* Section 4: Live Mesh Peers Manager */}
      <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-2 border-b border-white/5">
          <div>
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              {t('node_peers_title')}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">{t('node_peers_desc')}</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/20">
            {peers.length} {t('peers_title')}
          </span>
        </div>

        {/* Add Peer Row */}
        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={newPeer}
            onChange={(e) => setNewPeer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPeer()}
            placeholder={t('node_peer_add_placeholder')}
            className="flex-1 px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl font-mono text-xs text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleAddPeer}
            disabled={addingPeer || !newPeer.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-semibold transition-all disabled:opacity-50"
          >
            {addingPeer ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {t('node_btn_add_peer')}
          </button>
        </div>

        {/* Peers List */}
        {peers.length === 0 ? (
          <div className="p-6 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-center text-xs text-text-muted">
            {t('node_no_peers')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {peers.map((p) => (
              <div
                key={p}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-white/10 hover:border-white/20 transition-all text-xs"
              >
                <span className="font-mono text-primary font-medium truncate mr-2">{p}</span>
                <button
                  onClick={() => handleRemovePeer(p)}
                  className="p-1 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Remove peer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
