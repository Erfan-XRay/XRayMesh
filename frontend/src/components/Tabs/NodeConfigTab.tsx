import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { NodeConfig, MeshProtocol, MeshInviteData, Language, Peer, RollbackInfo } from '../../types';
import {
  fetchNodeConfig,
  saveNodeConfig,
  addMeshPeer,
  removeMeshPeer,
  fetchMeshInvite,
  joinMeshNetwork,
  deleteNodeConfig,
  startMeshNode,
  stopMeshNode,
  restartMeshNode,
  dismissClusterRollback,
} from '../../services/api';
import { copyToClipboard } from '../../utils/clipboard';
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
  AlertCircle,
  AlertTriangle,
  Play,
  Square,
  RotateCw,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Globe,
} from 'lucide-react';

interface NodeConfigTabProps {
  onRefreshStatus: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: (key: any) => string;
  lang: Language;
  isRtl: boolean;
  activePeers?: Peer[];
  onOpenClusterSync?: (cfg: {
    protocol: MeshProtocol;
    enableKcp: boolean;
    encryption: boolean;
    ipv6: boolean;
    mtu: number;
    networkSecret: string;
    hostname: string;
    ipv4: string;
  }) => void;
}

function sanitizePeerInput(raw: string, defaultPort?: number): string {
  if (!raw) return '';
  let p = raw.trim().replace(/\/+$/, '').replace(/:+$/, '');
  if (!p || p.startsWith(':') || /^\d+$/.test(p)) return '';
  let scheme = '';
  if (p.includes('://')) {
    const parts = p.split('://');
    scheme = parts[0].toLowerCase();
    p = parts[1];
  }
  p = p.replace(/:+$/, '');
  if (!p || p.startsWith(':') || /^\d+$/.test(p)) return '';

  let host = '';
  let pPort = defaultPort ? String(defaultPort) : '11010';

  if (p.includes('[') && p.includes(']')) {
    const m = p.match(/^(\[[^\]]+\])(?::+(\d+))?$/);
    if (!m) return '';
    host = m[1];
    pPort = m[2] || pPort;
  } else {
    const m = p.match(/^(.+?):+(\d+)$/);
    if (m) {
      host = m[1].replace(/:+$/, '');
      pPort = m[2];
    } else {
      host = p.replace(/:+$/, '');
    }
  }

  if (!host || host.startsWith(':') || host === ':' || /^\d+$/.test(host)) return '';
  const hp = `${host}:${pPort}`;
  if (scheme) {
    if (scheme === 'ws' || scheme === 'wss') return `${scheme}://${hp}/`;
    return `${scheme}://${hp}`;
  }
  return hp;
}

function parseInviteToken(raw: string): {
  net?: string;
  secret?: string;
  endpoint?: string;
  proto?: MeshProtocol;
} | null {
  if (!raw) return null;
  const token = raw.trim().replace(/^xrmesh:\/\//i, '');
  try {
    const decoded = decodeURIComponent(
      atob(token)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const data = JSON.parse(decoded);
    return {
      net: data.net || data.network_name || '',
      secret: data.secret || data.network_secret || '',
      endpoint: data.endpoint || data.peer || '',
      proto: (data.proto || data.protocol || 'dual') as MeshProtocol,
    };
  } catch {
    try {
      const data = JSON.parse(atob(token));
      return {
        net: data.net || data.network_name || '',
        secret: data.secret || data.network_secret || '',
        endpoint: data.endpoint || data.peer || '',
        proto: (data.proto || data.protocol || 'dual') as MeshProtocol,
      };
    } catch {
      return null;
    }
  }
}

export const NodeConfigTab: React.FC<NodeConfigTabProps> = ({
  onRefreshStatus,
  onNotify,
  onCopy,
  copiedKey,
  t,
  isRtl,
  onOpenClusterSync,
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
  const [peers, setPeers] = useState<string[]>([]);
  const [newPeer, setNewPeer] = useState('');
  const [addingPeer, setAddingPeer] = useState(false);

  const triggerClusterSync = () => {
    if (onOpenClusterSync) {
      onOpenClusterSync({
        protocol,
        enableKcp,
        encryption,
        ipv6,
        mtu: Number(mtu),
        networkSecret,
        hostname,
        ipv4,
      });
    }
  };

  // Invite & Join (Manual Mode)
  const [inviteData, setInviteData] = useState<MeshInviteData | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [overrideEndpoint, setOverrideEndpoint] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [joining, setJoining] = useState(false);

  // Wizard & Sub-Tab State
  const [wizardActive, setWizardActive] = useState(false);
  const [subTab, setSubTab] = useState<'identity' | 'protocol' | 'cluster' | 'danger'>('identity');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [setupMode, setSetupMode] = useState<'new' | 'join'>('new');
  const [wizardInviteInput, setWizardInviteInput] = useState('');
  const [decodedInvite, setDecodedInvite] = useState<{
    net?: string;
    secret?: string;
    endpoint?: string;
    proto?: MeshProtocol;
  } | null>(null);
  const [hostnameTouched, setHostnameTouched] = useState(false);

  // First-Save Celebration State
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationStep, setCelebrationStep] = useState(1);
  const [celebrationClosing, setCelebrationClosing] = useState(false);

  const computedInvite = useMemo(() => {
    if (!inviteData) return null;
    const baseObj = { ...inviteData.details };
    const rawEp = overrideEndpoint.trim() || baseObj.endpoint || '';
    const cleanEp = sanitizePeerInput(rawEp, port);
    const finalObj = { ...baseObj, endpoint: cleanEp };
    try {
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(finalObj))));
      return {
        invite: `xrmesh://${b64}`,
        details: finalObj,
      };
    } catch {
      return inviteData;
    }
  }, [inviteData, overrideEndpoint, port]);

  // Invite Token Copy State & Animation
  const [copiedInvite, setCopiedInvite] = useState(false);
  const handleCopyInviteToken = async (text: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedInvite(true);
      onCopy(text);
      setTimeout(() => setCopiedInvite(false), 2500);
    } else {
      onNotify('Could not copy invite token to clipboard', 'error');
    }
  };

  // Step 2 Comprehensive Input Validation State & Handlers
  const [step2Attempted, setStep2Attempted] = useState(false);
  const [step2Touched, setStep2Touched] = useState<{ [key: string]: boolean }>({});

  const markTouched = (field: string) => {
    setStep2Touched((prev) => ({ ...prev, [field]: true }));
  };

  const step2Errors = useMemo(() => {
    const errs: { [key: string]: string } = {};

    // 1. Hostname (Server Name)
    const h = hostname.trim();
    if (!h) {
      errs.hostname = t('wizard_val_hostname_empty');
    } else if (!/^[a-zA-Z0-9_.-]+$/.test(h)) {
      errs.hostname = t('wizard_val_hostname_invalid');
    }

    // 2. Virtual IPv4
    const ip = ipv4.trim();
    const ipv4Regex = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
    if (!ip) {
      errs.ipv4 = t('wizard_val_vip_empty');
    } else if (!ipv4Regex.test(ip)) {
      errs.ipv4 = t('wizard_val_vip_invalid');
    }

    // 3. Port
    const p = Number(port);
    if (!port && port !== 0) {
      errs.port = t('wizard_val_port_empty');
    } else if (isNaN(p) || p < 1 || p > 65535) {
      errs.port = t('wizard_val_port_invalid');
    }

    // 4. Network Name
    const net = networkName.trim();
    if (!net) {
      errs.networkName = t('wizard_val_net_empty');
    }

    // 5. Network Secret
    const sec = networkSecret.trim();
    if (!sec) {
      errs.networkSecret = t('wizard_val_secret_empty');
    } else if (sec.length < 4) {
      errs.networkSecret = t('wizard_val_secret_short');
    }

    // 6. MTU
    const m = Number(mtu);
    if (isNaN(m) || m < 576 || m > 9000) {
      errs.mtu = t('wizard_val_mtu_invalid');
    }

    return errs;
  }, [hostname, ipv4, port, networkName, networkSecret, mtu, t]);

  const isFieldInvalid = (f: string) => {
    return Boolean((step2Attempted || step2Touched[f] || (f === 'hostname' && hostnameTouched)) && step2Errors[f]);
  };

  const isFieldValid = (f: string, val: any) => {
    return Boolean(!step2Errors[f] && val !== undefined && val !== null && String(val).trim() !== '');
  };

  const handleStep2Next = () => {
    setStep2Attempted(true);
    setHostnameTouched(true);
    setStep2Touched({
      hostname: true,
      ipv4: true,
      port: true,
      networkName: true,
      networkSecret: true,
      mtu: true,
    });

    const errKeys = Object.keys(step2Errors);
    if (errKeys.length > 0) {
      const firstError = Object.values(step2Errors)[0];
      onNotify(firstError || t('wizard_val_fix_errors'), 'error');
      return;
    }

    setWizardStep(3);
  };

  // Delete Node State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingNode, setDeletingNode] = useState(false);

  // Watchdog Rollback Alert State
  const [lastRollback, setLastRollback] = useState<RollbackInfo | null>(null);

  const handleDismissRollback = async () => {
    try {
      await dismissClusterRollback();
      setLastRollback(null);
    } catch {
      setLastRollback(null);
    }
  };

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
      setPeers(cfg.peers || []);

      if (cfg.last_rollback?.occurred) {
        setLastRollback(cfg.last_rollback);
      } else {
        setLastRollback(null);
      }

      // If node is unconfigured, start in Wizard mode by default
      if (!cfg.node_configured) {
        setWizardActive(true);
      }

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

  // Handle Token Input in Wizard
  const handleWizardInviteChange = (val: string) => {
    setWizardInviteInput(val);
    const parsed = parseInviteToken(val);
    if (parsed && parsed.net && parsed.secret) {
      setDecodedInvite(parsed);
      // Auto-populate form states
      setNetworkName(parsed.net);
      setNetworkSecret(parsed.secret);
      if (parsed.proto) setProtocol(parsed.proto);
      if (parsed.endpoint) {
        const cleanEp = sanitizePeerInput(parsed.endpoint, port);
        if (cleanEp) {
          setPeers((prev) => (prev.includes(cleanEp) ? prev : [cleanEp, ...prev]));
        }
      }
      // Suggest random IP if default
      if (ipv4 === '10.144.144.1' || !ipv4) {
        const randLast = Math.floor(Math.random() * 200) + 2;
        setIpv4(`10.144.144.${randLast}`);
      }
    } else {
      setDecodedInvite(null);
    }
  };

  // Handle Token Input in Manual Mode
  const handleManualJoinInputChange = (val: string) => {
    setJoinInput(val);
    const parsed = parseInviteToken(val);
    if (parsed && parsed.net && parsed.secret) {
      setNetworkName(parsed.net);
      setNetworkSecret(parsed.secret);
      if (parsed.proto) setProtocol(parsed.proto);
      if (parsed.endpoint) {
        const cleanEp = sanitizePeerInput(parsed.endpoint, port);
        if (cleanEp) {
          setPeers((prev) => (prev.includes(cleanEp) ? prev : [cleanEp, ...prev]));
        }
      }
      if (ipv4 === '10.144.144.1' || !ipv4) {
        const randLast = Math.floor(Math.random() * 200) + 2;
        setIpv4(`10.144.144.${randLast}`);
      }
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setHostnameTouched(true);

    if (!hostname.trim()) {
      onNotify(t('wizard_hostname_required_hint'), 'error');
      return;
    }
    if (!networkName.trim() || !networkSecret.trim() || !ipv4.trim() || !port) {
      onNotify('Please fill in required fields (Network Name, Secret, VIP, Port)', 'error');
      return;
    }

    const isFirstTime = !config?.node_configured;
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
        peers,
      });

      if (isFirstTime) {
        // Trigger celebratory animated sequence
        setShowCelebration(true);
        setCelebrationStep(1);
        setTimeout(() => setCelebrationStep(2), 700);
        setTimeout(() => setCelebrationStep(3), 1500);
        setTimeout(async () => {
          setCelebrationClosing(true);
          setTimeout(async () => {
            setShowCelebration(false);
            setCelebrationClosing(false);
            setWizardActive(false);
            await loadData();
            onRefreshStatus();
            onNotify(msg || t('node_save_success'), 'success');
          }, 500);
        }, 3200);
      } else {
        onNotify(msg || t('node_save_success'), 'success');
        onRefreshStatus();
        loadInvite();
        await loadData();
      }
    } catch (err: any) {
      onNotify(err.message || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const closeCelebrationImmediately = async () => {
    setShowCelebration(false);
    setWizardActive(false);
    await loadData();
    onRefreshStatus();
  };

  const handleAddPeer = async () => {
    if (!newPeer.trim()) return;
    const clean = sanitizePeerInput(newPeer, port);
    if (!clean) {
      onNotify(t('node_peers_desc') || 'Invalid peer format', 'error');
      return;
    }
    setAddingPeer(true);
    try {
      await addMeshPeer(clean);
      setPeers((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
      setNewPeer('');
      onNotify(`Peer '${clean}' added`, 'success');
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
    setHostnameTouched(true);
    if (!hostname.trim()) {
      onNotify(t('wizard_hostname_required_hint'), 'error');
      return;
    }
    setJoining(true);
    try {
      const msg = await joinMeshNetwork(joinInput.trim(), {
        hostname: hostname.trim(),
        ipv4: ipv4.trim(),
      });
      onNotify(msg || 'Joined mesh successfully!', 'success');
      setJoinInput('');
      await loadData();
      onRefreshStatus();
    } catch (err: any) {
      onNotify(err.message || 'Failed to join mesh', 'error');
    } finally {
      setJoining(false);
    }
  };

  const [controllingService, setControllingService] = useState(false);

  const handleStartNode = async () => {
    setControllingService(true);
    try {
      const msg = await startMeshNode();
      onNotify(msg || t('node_service_online'), 'success');
      await loadData();
      onRefreshStatus();
    } catch (err: any) {
      onNotify(err.message || 'Failed to start node service', 'error');
    } finally {
      setControllingService(false);
    }
  };

  const handleRestartNode = async () => {
    setControllingService(true);
    try {
      const msg = await restartMeshNode();
      onNotify(msg || 'Node service restarted', 'success');
      await loadData();
      onRefreshStatus();
    } catch (err: any) {
      onNotify(err.message || 'Failed to restart node service', 'error');
    } finally {
      setControllingService(false);
    }
  };

  const handleStopNode = async () => {
    setControllingService(true);
    try {
      const msg = await stopMeshNode();
      onNotify(msg || t('node_service_offline'), 'info');
      await loadData();
      onRefreshStatus();
    } catch (err: any) {
      onNotify(err.message || 'Failed to stop node service', 'error');
    } finally {
      setControllingService(false);
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

  const handleDeleteNode = async () => {
    setDeletingNode(true);
    try {
      const msg = await deleteNodeConfig();
      onNotify(msg || t('node_delete_success'), 'success');
      setShowDeleteModal(false);
      onRefreshStatus();
      loadData();
    } catch (e: any) {
      onNotify(e.message || 'Failed to delete node', 'error');
    } finally {
      setDeletingNode(false);
    }
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
  ];

  const renderInlineActions = () => (
    <div className="pt-4 mt-5 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-[11px] text-text-muted">{t('node_save_card_hint')}</p>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          onClick={() => handleSave()}
          disabled={saving}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-card-border text-text-main font-semibold text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-text-muted" />}
          <span>{t('cluster_btn_save_local')}</span>
        </button>
        <button
          type="button"
          onClick={triggerClusterSync}
          disabled={saving}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-primary via-cyan-500 to-teal-400 text-black font-bold text-xs hover:opacity-95 transition-all shadow-md shadow-primary/20 active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{t('cluster_sync_btn')}</span>
        </button>
      </div>
    </div>
  );

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
      {/* Celebration Modal Overlay */}
      {showCelebration &&
        createPortal(
          <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-opacity duration-500 ${
              celebrationClosing ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <div className="w-full max-w-lg p-8 rounded-3xl bg-card/90 border border-emerald-500/40 shadow-2xl relative overflow-hidden text-center animate-modal-in">
              {/* Background glowing gradients */}
              <div className="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

              {/* Pulsing Icon Badge */}
              <div className="relative mx-auto mb-5 w-20 h-20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                <div className="relative w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <Sparkles className="w-10 h-10 text-emerald-400 animate-pulse" />
                </div>
              </div>

              <h3 className="text-xl font-bold text-white mb-2 tracking-wide">
                {t('wizard_celebration_title')}
              </h3>
              <p className="text-xs text-text-muted mb-6 leading-relaxed max-w-md mx-auto">
                {t('wizard_celebration_desc')}
              </p>

              {/* Step Progression Checkmarks */}
              <div className="space-y-2.5 mb-6 text-xs text-left bg-black/35 p-4 rounded-2xl border border-card-border">
                <div
                  className={`flex items-center gap-3 transition-all duration-300 ${
                    celebrationStep >= 1 ? 'text-emerald-400 font-medium' : 'text-text-muted opacity-40'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      celebrationStep >= 1
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-white/5 text-text-muted'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>{t('wizard_celebration_step1')}</span>
                </div>

                <div
                  className={`flex items-center gap-3 transition-all duration-300 ${
                    celebrationStep >= 2 ? 'text-emerald-400 font-medium' : 'text-text-muted opacity-40'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      celebrationStep >= 2
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-white/5 text-text-muted'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>{t('wizard_celebration_step2')}</span>
                </div>

                <div
                  className={`flex items-center gap-3 transition-all duration-300 ${
                    celebrationStep >= 3 ? 'text-emerald-400 font-medium' : 'text-text-muted opacity-40'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      celebrationStep >= 3
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-white/5 text-text-muted'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    {t('wizard_celebration_step3')} ({ipv4})
                  </span>
                </div>
              </div>

              {/* Node Summary Badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-6 font-mono text-xs">
                <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Node: {hostname}
                </span>
                <span className="px-3 py-1 rounded-lg bg-primary/10 text-primary border border-primary/30">
                  VIP: {ipv4}
                </span>
                <span className="px-3 py-1 rounded-lg bg-white/5 text-text-muted border border-card-border">
                  Net: {networkName}
                </span>
              </div>

              <button
                onClick={closeCelebrationImmediately}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('wizard_celebration_btn')}</span>
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Watchdog Rollback Alert Banner */}
      {lastRollback?.occurred && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-300 flex items-start gap-3.5 shadow-xl animate-modal-in">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400 animate-pulse" />
          <div className="flex-1 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="font-bold text-sm text-amber-200">
                {t('cluster_rollback_alert_title')}
              </h4>
              <span className="font-mono text-[10px] text-amber-400/90 bg-amber-500/25 px-2 py-0.5 rounded border border-amber-500/30 font-semibold">
                Self-Healing Watchdog
              </span>
            </div>
            <p className="text-amber-300/90 leading-relaxed mb-2.5">
              {t('cluster_rollback_alert_desc')}
            </p>
            {lastRollback.reason && (
              <div className="p-2.5 rounded-lg bg-black/40 border border-amber-500/20 font-mono text-[11px] text-amber-400 mb-3 leading-relaxed">
                {lastRollback.reason}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDismissRollback}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition-colors shadow-md flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t('cluster_rollback_dismiss_btn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unconfigured Alert Banner (Only when not in wizard) */}
      {!wizardActive && config && !config.node_configured && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-start gap-3 animate-modal-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-sm text-amber-300 mb-1">{t('node_unconfigured_banner')}</h4>
            <p className="text-amber-400/90 leading-relaxed mb-3">{t('node_unconfigured_desc')}</p>
            <button
              onClick={() => setWizardActive(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('wizard_switch_wizard')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Header Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />
              {wizardActive ? t('wizard_title') : t('node_panel_title')}
            </h2>
            {config?.node_configured && (
              config.service_active ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t('node_service_online')}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  {t('node_service_offline')}
                </span>
              )
            )}
            {ipv4 && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-primary/10 text-primary border border-primary/25">
                {ipv4}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            {wizardActive ? t('wizard_desc') : t('node_panel_desc')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Switch Wizard / Manual Mode Toggle */}
          <button
            type="button"
            onClick={() => setWizardActive(!wizardActive)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-xs font-semibold text-primary transition-all active:scale-95 cursor-pointer"
          >
            {wizardActive ? <Sliders className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{wizardActive ? t('wizard_switch_manual') : t('wizard_switch_wizard')}</span>
          </button>

          {/* Quick Service Control Icons */}
          {!wizardActive && config?.node_configured && (
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/20 border border-white/5">
              {config.service_active ? (
                <>
                  <button
                    type="button"
                    onClick={handleRestartNode}
                    disabled={controllingService}
                    title={t('node_btn_restart')}
                    className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/15 transition-colors disabled:opacity-50"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${controllingService ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={handleStopNode}
                    disabled={controllingService}
                    title={t('node_btn_stop')}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 transition-colors disabled:opacity-50"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleStartNode}
                  disabled={controllingService}
                  title={t('node_btn_start')}
                  className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${controllingService ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={loadData}
            title={t('btn_refresh')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-card-border text-xs font-medium text-text-muted hover:text-text-main transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {!wizardActive && (
            <div className="flex items-center gap-2">
              {/* Single Node Save Button */}
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                title={t('cluster_btn_save_local_desc')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-card-border text-text-main font-semibold text-xs transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-text-muted" />}
                <span>{t('cluster_btn_save_local')}</span>
              </button>

              {/* Broadcast to All Nodes (Cluster SafeSync) Button */}
              <button
                type="button"
                onClick={triggerClusterSync}
                disabled={saving}
                title={t('cluster_btn_sync_all_desc')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-primary via-cyan-500 to-teal-400 text-black font-bold text-xs hover:opacity-95 transition-all shadow-md shadow-primary/20 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{t('cluster_sync_btn')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🧙 ONBOARDING WIZARD VIEW                                                 */}
      {/* ========================================================================= */}
      {wizardActive ? (
        <div className="p-6 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-xl space-y-6 animate-fade-in">
          {/* Wizard Step Progress Tracker */}
          <div className="flex items-center justify-between gap-2 max-w-2xl mx-auto pb-4 border-b border-white/5">
            {/* Step 1 indicator */}
            <div
              onClick={() => setWizardStep(1)}
              className={`flex items-center gap-2.5 cursor-pointer select-none transition-all ${
                wizardStep === 1
                  ? 'text-primary font-bold'
                  : wizardStep > 1
                  ? 'text-emerald-400 font-medium'
                  : 'text-text-muted opacity-50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                  wizardStep === 1
                    ? 'bg-primary text-black shadow-lg shadow-primary/30'
                    : wizardStep > 1
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-white/5 border border-card-border'
                }`}
              >
                {wizardStep > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
              </div>
              <span className="text-xs hidden sm:inline">{t('wizard_step_1')}</span>
            </div>

            <div
              className={`flex-1 h-[2px] rounded transition-all ${
                wizardStep > 1 ? 'bg-emerald-500/40' : 'bg-white/10'
              }`}
            />

            {/* Step 2 indicator */}
            <div
              onClick={() => {
                if (setupMode === 'new' || decodedInvite) setWizardStep(2);
              }}
              className={`flex items-center gap-2.5 cursor-pointer select-none transition-all ${
                wizardStep === 2
                  ? 'text-primary font-bold'
                  : wizardStep > 2
                  ? 'text-emerald-400 font-medium'
                  : 'text-text-muted opacity-50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                  wizardStep === 2
                    ? 'bg-primary text-black shadow-lg shadow-primary/30'
                    : wizardStep > 2
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-white/5 border border-card-border'
                }`}
              >
                {wizardStep > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
              </div>
              <span className="text-xs hidden sm:inline">{t('wizard_step_2')}</span>
            </div>

            <div
              className={`flex-1 h-[2px] rounded transition-all ${
                wizardStep > 2 ? 'bg-emerald-500/40' : 'bg-white/10'
              }`}
            />

            {/* Step 3 indicator */}
            <div
              onClick={() => {
                if (hostname.trim()) setWizardStep(3);
              }}
              className={`flex items-center gap-2.5 cursor-pointer select-none transition-all ${
                wizardStep === 3
                  ? 'text-primary font-bold'
                  : 'text-text-muted opacity-50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                  wizardStep === 3
                    ? 'bg-primary text-black shadow-lg shadow-primary/30'
                    : 'bg-white/5 border border-card-border'
                }`}
              >
                3
              </div>
              <span className="text-xs hidden sm:inline">{t('wizard_step_3')}</span>
            </div>
          </div>

          {/* STEP 1: SETUP MODE SELECTION */}
          {wizardStep === 1 && (
            <div className="space-y-6 animate-tab-in">
              <div className="text-center max-w-lg mx-auto">
                <h3 className="text-base font-bold text-text-main mb-1">
                  {t('wizard_step_1')}
                </h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  {t('wizard_desc')}
                </p>
              </div>

              {/* Mode Selection Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {/* Option A: Create New Mesh */}
                <div
                  onClick={() => {
                    setSetupMode('new');
                    if (!networkName) setNetworkName('xraymesh');
                    if (!networkSecret) generateRandomSecret();
                    if (!ipv4) setIpv4('10.144.144.1');
                  }}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    setupMode === 'new'
                      ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10'
                      : 'bg-black/25 border-card-border hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
                        <Radio className="w-5 h-5" />
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/30">
                        Seed / First Node
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-text-main mb-1">
                      {t('wizard_mode_new_title')}
                    </h4>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {t('wizard_mode_new_desc')}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-primary font-medium">
                    <span>Select New Network</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Option B: Join via Invite Token */}
                <div
                  onClick={() => setSetupMode('join')}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    setupMode === 'join'
                      ? 'bg-accent-green/10 border-accent-green shadow-lg shadow-accent-green/10'
                      : 'bg-black/25 border-card-border hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-accent-green/20 text-accent-green flex items-center justify-center">
                        <Share2 className="w-5 h-5" />
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-accent-green/15 text-emerald-400 border border-accent-green/30">
                        1-Click Connect
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-text-main mb-1">
                      {t('wizard_mode_join_title')}
                    </h4>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {t('wizard_mode_join_desc')}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <span>Select Join Mode</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* If Join Mode is selected, render the Token Input Box */}
              {setupMode === 'join' && (
                <div className="max-w-2xl mx-auto p-4 rounded-2xl bg-black/40 border border-accent-green/30 space-y-3 animate-modal-in">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-emerald-400">
                      {t('wizard_token_label')}
                    </label>
                    <span className="text-[10px] text-text-muted font-mono">Format: xrmesh://...</span>
                  </div>
                  <textarea
                    rows={2}
                    value={wizardInviteInput}
                    onChange={(e) => handleWizardInviteChange(e.target.value)}
                    placeholder={t('wizard_token_placeholder')}
                    className="w-full p-3 bg-input border border-card-border rounded-xl font-mono text-xs text-text-main placeholder-text-subtle focus:outline-none focus:border-accent-green resize-none min-h-24"
                  />

                  {/* Decoded Token Preview Card */}
                  {decodedInvite ? (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs animate-modal-in">
                      <div className="flex items-center gap-2 font-bold text-emerald-400 mb-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{t('wizard_token_detected_title')}</span>
                      </div>
                      <p className="text-[11px] text-text-muted mb-2.5">
                        {t('wizard_token_detected_desc')}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-text-muted block text-[10px]">Network:</span>
                          <span className="text-text-main font-semibold truncate block">
                            {decodedInvite.net}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-text-muted block text-[10px]">Protocol:</span>
                          <span className="text-emerald-400 font-semibold block uppercase">
                            {decodedInvite.proto}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-text-muted block text-[10px]">Peer Endpoint:</span>
                          <span className="text-text-main font-semibold truncate block">
                            {decodedInvite.endpoint || 'Relayed Node'}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-text-muted block text-[10px]">Secret:</span>
                          <span className="text-text-muted font-semibold block">••••••••</span>
                        </div>
                      </div>
                    </div>
                  ) : wizardInviteInput.trim() ? (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>Invalid invite code format. Please check the code and paste again.</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Step 1 Actions */}
              <div className="flex items-center justify-between max-w-2xl mx-auto pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setWizardActive(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-text-muted hover:text-text-main transition-colors"
                >
                  {t('wizard_switch_manual')}
                </button>
                <button
                  type="button"
                  disabled={setupMode === 'join' && !decodedInvite}
                  onClick={() => setWizardStep(2)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs hover:bg-primary-hover transition-all shadow-md disabled:opacity-40"
                >
                  <span>{t('wizard_btn_next')}</span>
                  {isRtl ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: NODE IDENTITY & MANDATORY HOSTNAME */}
          {wizardStep === 2 && (
            <div className="space-y-6 animate-tab-in max-w-2xl mx-auto">
              <div>
                <h3 className="text-base font-bold text-text-main mb-1">
                  {t('wizard_step_2')}
                </h3>
                <p className="text-xs text-text-muted">
                  Configure this server's identity and parameters within the mesh.
                </p>
              </div>

              {/* Mandatory Server Name (Hostname) Box */}
              <div className={`p-4 rounded-2xl border transition-all duration-300 ${
                isFieldInvalid('hostname')
                  ? 'bg-rose-500/[0.08] border-rose-500/60 shadow-lg shadow-rose-500/10'
                  : isFieldValid('hostname', hostname)
                  ? 'bg-emerald-500/[0.04] border-emerald-500/30'
                  : 'bg-primary/5 border-primary/30'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-text-main flex items-center gap-2">
                    <Server className={`w-4 h-4 transition-colors ${isFieldInvalid('hostname') ? 'text-rose-400' : 'text-primary'}`} />
                    <span>{t('node_hostname')}</span>
                    {isFieldInvalid('hostname') ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t('wizard_required_tag')} *
                      </span>
                    ) : isFieldValid('hostname', hostname) ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {t('wizard_valid_tag')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {t('wizard_hostname_required_badge')} *
                      </span>
                    )}
                  </label>
                </div>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => {
                    setHostname(e.target.value);
                    if (!hostnameTouched) setHostnameTouched(true);
                  }}
                  onBlur={() => markTouched('hostname')}
                  placeholder="e.g. germany-node-1, ir-relay, node-alpha"
                  className={`w-full px-3.5 py-2.5 bg-black/40 border rounded-xl font-mono text-xs text-text-main placeholder-text-subtle focus:outline-none transition-all duration-200 ${
                    isFieldInvalid('hostname')
                      ? 'border-rose-500 bg-rose-500/[0.04] focus:border-rose-400 focus:ring-1 focus:ring-rose-500/30'
                      : isFieldValid('hostname', hostname)
                      ? 'border-emerald-500/40 focus:border-primary'
                      : 'border-card-border focus:border-primary'
                  }`}
                />
                {isFieldInvalid('hostname') ? (
                  <p className="text-[11px] text-rose-400 mt-2 flex items-center gap-1.5 font-medium animate-pulse">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{step2Errors.hostname || t('wizard_hostname_required_hint')}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-text-muted mt-1.5">
                    This friendly name will appear in peer listings and speedtest targets across all nodes.
                  </p>
                )}
              </div>

              {/* IP & Network Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Virtual IP */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-text-muted flex items-center gap-1.5">
                      <span>{t('node_vip')}</span>
                    </label>
                    {isFieldInvalid('ipv4') ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-0.5">
                        <AlertCircle className="w-2.5 h-2.5" />
                        {t('wizard_required_tag')} *
                      </span>
                    ) : isFieldValid('ipv4', ipv4) ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        {t('wizard_valid_tag')}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-text-subtle">
                        {t('wizard_required_tag')} *
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={ipv4}
                    onChange={(e) => setIpv4(e.target.value)}
                    onBlur={() => markTouched('ipv4')}
                    placeholder="10.144.144.1"
                    className={`w-full px-3.5 py-2 bg-black/40 border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none transition-all duration-200 ${
                      isFieldInvalid('ipv4')
                        ? 'border-rose-500 bg-rose-500/[0.04] focus:border-rose-400 focus:ring-1 focus:ring-rose-500/30'
                        : isFieldValid('ipv4', ipv4)
                        ? 'border-emerald-500/40 focus:border-primary'
                        : 'border-card-border focus:border-primary'
                    }`}
                  />
                  {isFieldInvalid('ipv4') ? (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span>{step2Errors.ipv4}</span>
                    </p>
                  ) : (
                    <span className="text-[10px] text-text-muted block">
                      Unique private IP inside the encrypted mesh overlay.
                    </span>
                  )}
                </div>

                {/* Listen Port */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-text-muted flex items-center gap-1.5">
                      <span>{t('node_port')}</span>
                    </label>
                    {isFieldInvalid('port') ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-0.5">
                        <AlertCircle className="w-2.5 h-2.5" />
                        {t('wizard_required_tag')} *
                      </span>
                    ) : isFieldValid('port', port) ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        {t('wizard_valid_tag')}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-text-subtle">
                        {t('wizard_required_tag')} *
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    onBlur={() => markTouched('port')}
                    placeholder="11010"
                    className={`w-full px-3.5 py-2 bg-black/40 border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none transition-all duration-200 ${
                      isFieldInvalid('port')
                        ? 'border-rose-500 bg-rose-500/[0.04] focus:border-rose-400 focus:ring-1 focus:ring-rose-500/30'
                        : isFieldValid('port', port)
                        ? 'border-emerald-500/40 focus:border-primary'
                        : 'border-card-border focus:border-primary'
                    }`}
                  />
                  {isFieldInvalid('port') ? (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span>{step2Errors.port}</span>
                    </p>
                  ) : (
                    <span className="text-[10px] text-text-muted block">
                      WAN listen port for mesh peer connections.
                    </span>
                  )}
                </div>

                {/* Network Name */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-text-muted flex items-center gap-1.5">
                      <span>{t('node_net_name')}</span>
                    </label>
                    {isFieldInvalid('networkName') ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-0.5">
                        <AlertCircle className="w-2.5 h-2.5" />
                        {t('wizard_required_tag')} *
                      </span>
                    ) : isFieldValid('networkName', networkName) ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        {t('wizard_valid_tag')}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-text-subtle">
                        {t('wizard_required_tag')} *
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={networkName}
                    onChange={(e) => setNetworkName(e.target.value)}
                    onBlur={() => markTouched('networkName')}
                    placeholder="e.g. xraymesh"
                    className={`w-full px-3.5 py-2 bg-black/40 border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none transition-all duration-200 ${
                      isFieldInvalid('networkName')
                        ? 'border-rose-500 bg-rose-500/[0.04] focus:border-rose-400 focus:ring-1 focus:ring-rose-500/30'
                        : isFieldValid('networkName', networkName)
                        ? 'border-emerald-500/40 focus:border-primary'
                        : 'border-card-border focus:border-primary'
                    }`}
                  />
                  {isFieldInvalid('networkName') && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span>{step2Errors.networkName}</span>
                    </p>
                  )}
                </div>

                {/* Network Secret */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="font-medium text-text-muted">{t('node_net_secret')}</label>
                      {isFieldInvalid('networkSecret') ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-0.5">
                          <AlertCircle className="w-2.5 h-2.5" />
                          {t('wizard_required_tag')} *
                        </span>
                      ) : isFieldValid('networkSecret', networkSecret) ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          {t('wizard_valid_tag')}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-text-subtle">
                          {t('wizard_required_tag')} *
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={generateRandomSecret}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Generate New
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={networkSecret}
                      onChange={(e) => setNetworkSecret(e.target.value)}
                      onBlur={() => markTouched('networkSecret')}
                      placeholder="Shared secret across all nodes..."
                      className={`w-full pl-3.5 pr-10 py-2 bg-black/40 border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none transition-all duration-200 ${
                        isFieldInvalid('networkSecret')
                          ? 'border-rose-500 bg-rose-500/[0.04] focus:border-rose-400 focus:ring-1 focus:ring-rose-500/30'
                          : isFieldValid('networkSecret', networkSecret)
                          ? 'border-emerald-500/40 focus:border-primary'
                          : 'border-card-border focus:border-primary'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {isFieldInvalid('networkSecret') && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span>{step2Errors.networkSecret}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Protocol Selector */}
              <div>
                <label className="block font-medium text-text-muted mb-2 text-xs">
                  {t('node_protocol')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {protocolsList.map((p) => {
                    const isSelected = protocol === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProtocol(p.id)}
                        className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-primary font-bold shadow-sm'
                            : 'bg-black/25 border-card-border text-text-muted hover:border-white/20'
                        } ${isRtl ? 'text-right' : 'text-left'}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold truncate">{p.badge}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                        </div>
                        <span className="text-[10px] text-text-muted block leading-tight truncate">
                          {p.id === 'dual' ? 'Auto hybrid' : p.id.toUpperCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Performance & Security Tuning (KCP, Encryption, IPv6, MTU) */}
              <div className="space-y-3.5 pt-4 border-t border-white/5">
                <span className="block text-xs font-bold text-text-main">
                  Performance & Network Tuning
                </span>

                {/* KCP Loss-Resistance Proxy */}
                <div className="p-3.5 rounded-xl bg-card/90/60 border border-card-border flex items-start justify-between gap-4 transition-all hover:border-amber-500/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="font-bold text-xs text-text-main">{t('node_kcp_label')}</span>
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

                {/* Extra Flags (Encryption, IPv6, MTU) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-black/25 border border-white/5 cursor-pointer hover:border-white/20 transition-all active:scale-[0.98]">
                    <input
                      type="checkbox"
                      checked={encryption}
                      onChange={(e) => setEncryption(e.target.checked)}
                      className="rounded bg-black/40 border-white/20 text-primary focus:ring-0"
                    />
                    <span className="font-medium text-text-main">{t('node_encryption_label')}</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-black/25 border border-white/5 cursor-pointer hover:border-white/20 transition-all active:scale-[0.98]">
                    <input
                      type="checkbox"
                      checked={ipv6}
                      onChange={(e) => setIpv6(e.target.checked)}
                      className="rounded bg-black/40 border-white/20 text-primary focus:ring-0"
                    />
                    <span className="font-medium text-text-main">{t('node_ipv6_label')}</span>
                  </label>

                  <div className={`flex flex-col p-2.5 rounded-xl bg-black/25 border transition-all duration-200 ${
                    isFieldInvalid('mtu') ? 'border-rose-500/60 bg-rose-500/[0.04]' : 'border-white/5'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                      <span className="text-[11px] text-text-muted flex-shrink-0">MTU:</span>
                      <input
                        type="number"
                        value={mtu}
                        onChange={(e) => setMtu(Number(e.target.value))}
                        onBlur={() => markTouched('mtu')}
                        className={`w-full px-2 py-1 bg-black/40 border rounded font-mono text-xs text-text-main focus:outline-none transition-all ${
                          isFieldInvalid('mtu') ? 'border-rose-500 focus:border-rose-400' : 'border-card-border focus:border-primary'
                        }`}
                      />
                    </div>
                    {isFieldInvalid('mtu') && (
                      <span className="text-[10px] text-rose-400 mt-1 font-medium">{step2Errors.mtu}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2 Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-text-muted hover:text-text-main transition-colors"
                >
                  {isRtl ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                  <span>{t('wizard_btn_prev')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleStep2Next}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs hover:bg-primary-hover transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <span>{t('wizard_btn_next')}</span>
                  {isRtl ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & DEPLOY */}
          {wizardStep === 3 && (
            <div className="space-y-6 animate-tab-in max-w-2xl mx-auto">
              <div>
                <h3 className="text-base font-bold text-text-main mb-1">
                  {t('wizard_review_title')}
                </h3>
                <p className="text-xs text-text-muted">
                  {t('wizard_review_desc')}
                </p>
              </div>

              {/* Review Summary Grid */}
              <div className="p-5 rounded-2xl bg-black/40 border border-card-border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-card/90/60 border border-white/5">
                    <span className="text-[10px] text-text-muted uppercase font-sans block mb-1">
                      {t('node_hostname')} (Server Name)
                    </span>
                    <span className="text-sm font-bold text-primary flex items-center gap-1.5">
                      <Server className="w-4 h-4" />
                      {hostname}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-card/90/60 border border-white/5">
                    <span className="text-[10px] text-text-muted uppercase font-sans block mb-1">
                      {t('node_vip')} (Virtual Mesh IP)
                    </span>
                    <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                      <Globe className="w-4 h-4" />
                      {ipv4}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-card/90/60 border border-white/5">
                    <span className="text-[10px] text-text-muted uppercase font-sans block mb-1">
                      {t('node_net_name')} & Port
                    </span>
                    <span className="text-xs text-text-main font-semibold">
                      {networkName} : {port}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-card/90/60 border border-white/5">
                    <span className="text-[10px] text-text-muted uppercase font-sans block mb-1">
                      Protocol & Security
                    </span>
                    <span className="text-xs text-text-main font-semibold flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-accent-green" />
                      {protocol.toUpperCase()} • {encryption ? 'ChaCha20' : 'Plaintext'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-card/90/60 border border-white/5 sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Zap className={`w-4 h-4 ${enableKcp ? 'text-amber-400' : 'text-text-muted'}`} />
                      <div>
                        <span className="text-[10px] text-text-muted uppercase font-sans block">
                          Acceleration & Tunnel Tuning
                        </span>
                        <span className="text-xs text-text-main font-semibold">
                          {enableKcp ? 'KCP Loss-Resistance Active' : 'Standard Transport'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-card-border text-text-muted">
                        MTU: <strong className="text-text-main">{mtu}</strong>
                      </span>
                      {ipv6 && (
                        <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                          IPv6 Enabled
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {peers.length > 0 && (
                  <div className="pt-3 border-t border-white/5 text-xs">
                    <span className="text-[10px] text-text-muted uppercase block mb-1.5">
                      Target Connected Peers ({peers.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {peers.map((p) => (
                        <span
                          key={p}
                          className="px-2.5 py-1 rounded-lg bg-white/5 border border-card-border font-mono text-[11px] text-primary"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3 Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-text-muted hover:text-text-main transition-colors"
                >
                  {isRtl ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                  <span>{t('wizard_btn_prev')}</span>
                </button>
                <button
                  type="button"
                  disabled={saving || !hostname.trim()}
                  onClick={() => handleSave()}
                  className="flex items-center gap-2.5 px-7 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-bold text-xs hover:from-emerald-400 hover:to-teal-300 transition-all shadow-xl shadow-emerald-500/25 disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>{t('wizard_btn_finish')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* 🛠️ ADVANCED / MANUAL CONFIGURATION VIEW                                   */}
      {/* ========================================================================= */}
      {!wizardActive && (
        <div className="space-y-4 animate-tab-in">
          {/* Sub-Tab Navigation Bar */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-card/90/60 border border-card-border overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setSubTab('identity')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                subTab === 'identity'
                  ? 'bg-primary text-black shadow-md shadow-primary/25'
                  : 'text-text-muted hover:text-text-main hover:bg-white/5'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>{t('node_subtab_identity')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('protocol')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                subTab === 'protocol'
                  ? 'bg-primary text-black shadow-md shadow-primary/25'
                  : 'text-text-muted hover:text-text-main hover:bg-white/5'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span>{t('node_subtab_protocol')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('cluster')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                subTab === 'cluster'
                  ? 'bg-primary text-black shadow-md shadow-primary/25'
                  : 'text-text-muted hover:text-text-main hover:bg-white/5'
              }`}
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t('node_subtab_cluster')}</span>
              {peers.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold leading-none ${
                    subTab === 'cluster'
                      ? 'bg-black/25 text-black'
                      : 'bg-primary/20 text-primary border border-primary/30'
                  }`}
                >
                  {peers.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('danger')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                subTab === 'danger'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                  : 'text-text-muted hover:text-rose-400 hover:bg-white/5'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('node_subtab_danger')}</span>
            </button>
          </div>

          {/* Sub-Tab 1: Network Identity & Addresses */}
          {subTab === 'identity' && (
            <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg space-y-4 animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div>
                  <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    {t('node_identity_title')}
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    {t('node_panel_desc')}
                  </p>
                </div>
                {ipv4 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                    VIP: {ipv4}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                {/* Hostname (Server Name) - Strictly Required */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-text-main flex items-center gap-1">
                      <span>{t('node_hostname')}</span>
                      <span className="text-rose-400">*</span>
                    </label>
                    {!hostname.trim() && hostnameTouched && (
                      <span className="text-[10px] text-rose-400 font-medium">Required</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={hostname}
                    onChange={(e) => {
                      setHostname(e.target.value);
                      if (!hostnameTouched) setHostnameTouched(true);
                    }}
                    placeholder="e.g. server-germany"
                    className={`w-full px-3.5 py-2 bg-black/40 border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none transition-all ${
                      !hostname.trim() && hostnameTouched
                        ? 'border-rose-500 focus:border-rose-400'
                        : 'border-card-border focus:border-primary'
                    }`}
                  />
                </div>

                {/* Virtual IP (IPv4) */}
                <div>
                  <label className="block font-medium text-text-muted mb-1.5">{t('node_vip')}</label>
                  <input
                    type="text"
                    value={ipv4}
                    onChange={(e) => setIpv4(e.target.value)}
                    placeholder="10.144.144.1"
                    className="w-full px-3.5 py-2 bg-black/40 border border-card-border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
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
                    className="w-full px-3.5 py-2 bg-black/40 border border-card-border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Network Name */}
                <div>
                  <label className="block font-medium text-text-muted mb-1.5">{t('node_net_name')}</label>
                  <input
                    type="text"
                    value={networkName}
                    onChange={(e) => setNetworkName(e.target.value)}
                    placeholder="e.g. xraymesh"
                    className="w-full px-3.5 py-2 bg-black/40 border border-card-border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Network Secret */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-medium text-text-muted">{t('node_net_secret')}</label>
                    <button
                      type="button"
                      onClick={generateRandomSecret}
                      className="text-[11px] text-primary hover:underline cursor-pointer"
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
                      className="w-full pl-3.5 pr-10 py-2 bg-black/40 border border-card-border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Detected Public IP */}
                <div>
                  <label className="block font-medium text-text-muted mb-1.5">{t('node_public_ip')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={config?.public_ip || 'Detecting...'}
                      className="w-full px-3.5 py-2 bg-card/90/60 border border-white/5 rounded-xl font-mono text-text-muted cursor-not-allowed"
                    />
                    {config?.public_ip && (
                      <button
                        onClick={() => onCopy(config.public_ip!)}
                        className="p-2 rounded-xl bg-white/5 border border-card-border text-text-muted hover:text-primary transition-colors cursor-pointer"
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

              {renderInlineActions()}
            </div>
          )}

          {/* Sub-Tab 2: Transport Protocol & Accelerators */}
          {subTab === 'protocol' && (
            <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg space-y-4 animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div>
                  <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                    <Radio className="w-4 h-4 text-primary" />
                    {t('node_protocol_title')}
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    {t('node_protocol')}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                  {protocol.toUpperCase()}
                </span>
              </div>

              {/* Protocol Grid Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {protocolsList.map((p) => {
                  const isSelected = protocol === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProtocol(p.id)}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary/10 border-primary ring-1 ring-primary/30 shadow-sm'
                          : 'bg-black/25 border-card-border hover:border-white/20'
                      } ${isRtl ? 'text-right' : 'text-left'}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-xs text-text-main">{p.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${p.badgeColor}`}
                        >
                          {p.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">{p.desc}</p>
                    </button>
                  );
                })}
              </div>

              {protocol === 'udp' && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300 animate-fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                  <p className="leading-relaxed text-[11px]">
                    {t('node_proto_udp_hint')}
                  </p>
                </div>
              )}

              {/* Accelerators & Toggles */}
              <div className="pt-2 border-t border-white/5 space-y-3 text-xs">
                {/* KCP Loss-Resistance Proxy */}
                <div className="p-3.5 rounded-xl bg-card/90/50 border border-card-border flex items-start justify-between gap-4">
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

                {/* Extra Flags (Encryption, IPv6, MTU) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-card/90/30 border border-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={encryption}
                      onChange={(e) => setEncryption(e.target.checked)}
                      className="rounded bg-black/40 border-white/20 text-primary focus:ring-0"
                    />
                    <span className="font-medium text-text-main">{t('node_encryption_label')}</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-card/90/30 border border-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ipv6}
                      onChange={(e) => setIpv6(e.target.checked)}
                      className="rounded bg-black/40 border-white/20 text-primary focus:ring-0"
                    />
                    <span className="font-medium text-text-main">{t('node_ipv6_label')}</span>
                  </label>

                  <div className="flex items-center gap-2 p-2 rounded-xl bg-card/90/30 border border-white/5">
                    <Sliders className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                    <span className="text-[11px] text-text-muted flex-shrink-0">MTU:</span>
                    <input
                      type="number"
                      value={mtu}
                      onChange={(e) => setMtu(Number(e.target.value))}
                      className="w-full px-2 py-1 bg-black/40 border border-card-border rounded font-mono text-xs text-text-main"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Cluster-Wide Sync Prompt for Protocol & Acceleration */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 via-cyan-500/10 to-transparent border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Globe className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-main flex items-center gap-1.5">
                      <span>{t('cluster_quick_sync_title')}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        Mesh-Wide
                      </span>
                    </h4>
                    <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                      {t('cluster_quick_sync_desc')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={triggerClusterSync}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-black font-bold text-xs transition-all shadow-md shadow-primary/20 whitespace-nowrap self-stretch sm:self-auto justify-center cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{t('cluster_sync_btn')}</span>
                </button>
              </div>

              {renderInlineActions()}
            </div>
          )}

          {/* Sub-Tab 3: Multi-Server Meshing & Peers */}
          {subTab === 'cluster' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Share Invite Card */}
                <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-text-main flex items-center gap-2 mb-1">
                      <Share2 className="w-4 h-4 text-accent-green" />
                      {t('node_invite_title')}
                    </h3>
                    <p className="text-xs text-text-muted mb-3">{t('node_invite_desc')}</p>

                    {inviteData && (
                      <div className="mb-3">
                        <label className="block text-[11px] text-text-muted mb-1 font-medium">
                          {t('node_invite_public_endpoint_label')}
                        </label>
                        <input
                          type="text"
                          value={overrideEndpoint}
                          onChange={(e) => setOverrideEndpoint(e.target.value)}
                          placeholder={inviteData.details.endpoint || t('node_invite_endpoint_placeholder')}
                          className="w-full px-3 py-1.5 bg-black/40/90 border border-card-border rounded-lg font-mono text-xs text-text-main placeholder-text-subtle focus:outline-none focus:border-accent-green"
                        />
                        {!overrideEndpoint &&
                          (!computedInvite?.details.endpoint || computedInvite.details.endpoint.startsWith(':')) && (
                            <p className="text-[10px] text-amber-400 mt-1 font-medium leading-normal">
                              {t('node_invite_no_ip_warning')}
                            </p>
                          )}
                      </div>
                    )}

                    {computedInvite ? (
                      <div className="p-3.5 rounded-xl bg-black/40 border border-card-border mb-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[11px] font-mono text-accent-green font-semibold">
                            {computedInvite.details.net} ({computedInvite.details.proto.toUpperCase()})
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {computedInvite.details.endpoint || 'No endpoint (relay only)'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-input border border-card-border font-mono text-[11px] text-text-main whitespace-pre-wrap break-all select-all" dir="ltr">
                          {computedInvite.invite}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-dashed border-card-border text-center text-xs text-text-muted mb-4">
                        {loadingInvite
                          ? 'Generating invite token...'
                          : 'Save node configuration to enable mesh invite token.'}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => computedInvite && handleCopyInviteToken(computedInvite.invite)}
                    disabled={!computedInvite}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs border transition-all duration-200 active:scale-95 disabled:opacity-50 cursor-pointer ${
                      copiedInvite || copiedKey === computedInvite?.invite
                        ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                        : 'bg-accent-green/15 text-emerald-400 hover:bg-accent-green/25 border-accent-green/30'
                    }`}
                  >
                    {copiedInvite || copiedKey === computedInvite?.invite ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-bounce-subtle" />
                        <span>{t('btn_copied')} ✓</span>
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
                      onChange={(e) => handleManualJoinInputChange(e.target.value)}
                      placeholder={t('node_join_placeholder')}
                      rows={3}
                      className="w-full p-3 bg-input border border-card-border rounded-xl font-mono text-xs text-text-main placeholder-text-subtle focus:outline-none focus:border-primary resize-none min-h-24 mb-3"
                    />

                    {/* Detected token hint */}
                    {parseInviteToken(joinInput) && (
                      <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-400 flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Invite token recognized! Fields auto-populated. Click Join.</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleJoin}
                    disabled={joining || !joinInput.trim() || !hostname.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs hover:bg-primary-hover transition-all shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {joining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                    <span>{t('node_btn_join')}</span>
                  </button>
                </div>
              </div>

              {/* Live Mesh Peers Manager */}
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
                    className="flex-1 px-3.5 py-2 bg-black/40 border border-card-border rounded-xl font-mono text-xs text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleAddPeer}
                    disabled={addingPeer || !newPeer.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {addingPeer ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{t('node_btn_add_peer')}</span>
                  </button>
                </div>

                {/* Peers List */}
                {peers.length === 0 ? (
                  <div className="p-6 rounded-xl bg-white/[0.02] border border-dashed border-card-border text-center text-xs text-text-muted">
                    {t('node_no_peers')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {peers.map((p) => (
                      <div
                        key={p}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-card/90/60 border border-card-border hover:border-white/20 transition-all text-xs"
                      >
                        <span className="font-mono text-primary font-medium truncate mr-2">{p}</span>
                        <button
                          onClick={() => handleRemovePeer(p)}
                          className="p-1 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove peer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {renderInlineActions()}
              </div>
            </div>
          )}

          {/* Sub-Tab 4: Maintenance & Danger Zone */}
          {subTab === 'danger' && (
            <div className="space-y-4 animate-fade-in">
              {/* Service Control Card */}
              <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-white/5">
                  <div>
                    <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                      <Settings className="w-4 h-4 text-primary" />
                      <span>{t('node_service_online')} / {t('node_service_offline')}</span>
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      EasyTier Systemd Service Controller
                    </p>
                  </div>
                  {config?.service_active ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      {t('node_service_online')}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      {t('node_service_offline')}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRestartNode}
                    disabled={controllingService}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-semibold text-amber-400 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${controllingService ? 'animate-spin' : ''}`} />
                    <span>{t('node_btn_restart')}</span>
                  </button>
                  {config?.service_active ? (
                    <button
                      type="button"
                      onClick={handleStopNode}
                      disabled={controllingService}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-400 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>{t('node_btn_stop')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartNode}
                      disabled={controllingService}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold text-emerald-400 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Play className={`w-3.5 h-3.5 ${controllingService ? 'animate-spin' : ''}`} />
                      <span>{t('node_btn_start')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Danger Zone: Delete Node */}
              <div className="p-5 rounded-2xl bg-rose-500/5 border border-rose-500/25 backdrop-blur-xl shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-rose-500" />
                      {t('node_danger_zone')}
                    </h3>
                    <p className="text-xs text-text-muted mt-1 max-w-xl">
                      {t('node_delete_desc')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-semibold transition-all whitespace-nowrap cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('node_btn_delete')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-modal-in">
            <div className="w-full max-w-md p-6 rounded-2xl bg-card/90 border border-rose-500/30 shadow-2xl relative">
              <div className="flex items-center gap-3 text-rose-400 mb-3">
                <AlertCircle className="w-6 h-6 flex-shrink-0" />
                <h3 className="text-base font-bold text-text-main">{t('node_delete_confirm_title')}</h3>
              </div>
              <p className="text-xs text-text-muted leading-relaxed mb-6">
                {t('node_delete_confirm_desc')}
              </p>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingNode}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-text-main transition-colors"
                >
                  {t('btn_cancel')}
                </button>
                <button
                  onClick={handleDeleteNode}
                  disabled={deletingNode}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {deletingNode && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('node_btn_delete')}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
