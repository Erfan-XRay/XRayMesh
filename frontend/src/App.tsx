import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StatusResponse,
  Peer,
  TunnelsData,
  SpeedtestData,
  PingResult,
  ToastItem,
  HaproxyTunnel,
  IptablesTunnel,
  GostTunnel,
  RealmTunnel,
  TabId,
  MeshProtocol,
  VersionInfo,
} from './types';
import { useTheme } from './theme/useTheme';
import { useTranslation } from './i18n/useTranslation';
import * as api from './services/api';

import { Header } from './components/Header';
import { OverviewCards } from './components/OverviewCards';
import { MobileDrawer } from './components/MobileDrawer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ToastContainer } from './components/Toast';
import { LoginModal } from './components/Modals/LoginModal';
import { TunnelModal, TunnelModalType } from './components/Modals/TunnelModal';
import { DeleteConfirmModal } from './components/Modals/DeleteConfirmModal';
import { ClusterSyncModal } from './components/Modals/ClusterSyncModal';
import { PeersTab } from './components/Tabs/PeersTab';
import { NodeConfigTab } from './components/Tabs/NodeConfigTab';
import { SpeedtestTab } from './components/Tabs/SpeedtestTab';
import { PingTab } from './components/Tabs/PingTab';
import { TunnelsTab } from './components/Tabs/TunnelsTab';

import { Users, Zap, Activity, Network, Settings, ArrowUpCircle, Sparkles } from 'lucide-react';
import { copyToClipboard } from './utils/clipboard';

const EMPTY_STATUS: StatusResponse = {
  node: {},
  system: {
    cpu_percent: 0,
    ram_total_mb: 0,
    ram_used_mb: 0,
    ram_percent: 0,
    uptime_str: '',
    load_avg: [0, 0, 0],
  },
};

export default function App() {
  // Hooks
  const { paletteId, setPaletteId, availablePalettes } = useTheme();
  const { lang, setLang, isRtl, t } = useTranslation();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [passwordConfigured, setPasswordConfigured] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Dashboard data
  const [status, setStatus] = useState<StatusResponse>(EMPTY_STATUS);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [clusterVersionDrift, setClusterVersionDrift] = useState<boolean>(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [tunnels, setTunnels] = useState<TunnelsData>({ haproxy: [], iptables: [], gost: [], realm: [] });
  const [interfaces, setInterfaces] = useState<string[]>(['any']);

  // Active tab (Default to Node & Mesh Config)
  const [activeTab, setActiveTab] = useState<TabId>('node');

  // Speedtest state
  const [speedTarget, setSpeedTarget] = useState('');
  const [isSpeedtesting, setIsSpeedtesting] = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedtestData | null>(null);

  // Ping state
  const [pingTarget, setPingTarget] = useState('');
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  // Tunnel modal state
  const [tunnelModalOpen, setTunnelModalOpen] = useState(false);
  const [tunnelModalType, setTunnelModalType] = useState<TunnelModalType>('haproxy');
  const [tunnelModalEdit, setTunnelModalEdit] = useState(false);
  const [tunnelModalData, setTunnelModalData] = useState<
    HaproxyTunnel | IptablesTunnel | GostTunnel | RealmTunnel | null
  >(null);

  // Delete confirm state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'haproxy' | 'iptables' | 'gost' | 'realm';
    name: string;
    originNode?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cluster SafeSync state
  const [clusterSyncOpen, setClusterSyncOpen] = useState(false);
  const [clusterSyncConfig, setClusterSyncConfig] = useState<{
    protocol: MeshProtocol;
    enableKcp: boolean;
    encryption: boolean;
    ipv6: boolean;
    mtu: number;
    networkSecret: string;
    hostname: string;
    ipv4: string;
  } | null>(null);

  const handleOpenClusterSync = useCallback(
    (cfg: {
      protocol: MeshProtocol;
      enableKcp: boolean;
      encryption: boolean;
      ipv6: boolean;
      mtu: number;
      networkSecret: string;
      hostname: string;
      ipv4: string;
    }) => {
      setClusterSyncConfig(cfg);
      setClusterSyncOpen(true);
    },
    []
  );

  // UI state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Refs
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Toast Helpers ───────────────────────────────────────
  const addToast = useCallback(
    (message: string, type: ToastItem['type'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  // ─── Clipboard ───────────────────────────────────────────
  const handleCopy = useCallback(
    async (text: string) => {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopiedKey(text);
        addToast(t('btn_copied'), 'success');
        setTimeout(() => setCopiedKey(null), 2000);
      } else {
        addToast('Could not copy to clipboard', 'error');
      }
    },
    [addToast, t]
  );

  // ─── Data Fetching ──────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const [statusData, peersResult, tunnelsData, verData] = await Promise.all([
        api.fetchStatus(),
        api.fetchPeersData(),
        api.fetchTunnels(),
        api.fetchVersionInfo(),
      ]);
      setStatus(statusData);
      setPeers(peersResult.peers);
      setClusterVersionDrift(!!peersResult.clusterVersionDrift);
      setTunnels(tunnelsData);
      setVersionInfo(verData);
    } catch {
      // Silent fail on periodic poll
    }
  }, []);

  const loadInterfaces = useCallback(async () => {
    const ifaces = await api.fetchInterfaces();
    setInterfaces(ifaces);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadDashboard();
    setIsRefreshing(false);
    addToast(t('btn_refresh') + ' ✓', 'success');
  }, [loadDashboard, addToast, t]);

  // ─── Auth ───────────────────────────────────────────────
  useEffect(() => {
    api
      .fetchAuthStatus()
      .then((res) => {
        setIsAuthenticated(res.authenticated);
        setShowLogin(!res.authenticated);
        if (typeof res.password_configured === 'boolean') {
          setPasswordConfigured(res.password_configured);
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        setShowLogin(true);
      });
  }, []);

  // Start polling once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadDashboard();
      loadInterfaces();
      pollingRef.current = setInterval(loadDashboard, 8000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isAuthenticated, loadDashboard, loadInterfaces]);

  // ─── Login Handlers ─────────────────────────────────────
  const handleLoginPassword = useCallback(
    async (password: string) => {
      try {
        await api.loginWithPassword(password);
        setIsAuthenticated(true);
        setShowLogin(false);
        addToast('✓ Logged in', 'success');
      } catch (e: any) {
        addToast(e.message || 'Login failed', 'error');
        throw e;
      }
    },
    [addToast]
  );

  const handleLoginToken = useCallback(
    async (token: string) => {
      try {
        await api.loginWithToken(token);
        setIsAuthenticated(true);
        setShowLogin(false);
        addToast('✓ Token accepted', 'success');
      } catch (e: any) {
        addToast(e.message || 'Token invalid', 'error');
        throw e;
      }
    },
    [addToast]
  );

  const handleLogout = useCallback(async () => {
    await api.logout();
    setIsAuthenticated(false);
    setShowLogin(true);
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, []);

  // ─── Quick Actions from Peer Cards ──────────────────────
  const handleQuickPing = useCallback(
    (ip: string) => {
      setPingTarget(ip);
      setActiveTab('ping');
    },
    []
  );

  const handleQuickSpeedtest = useCallback(
    (ip: string) => {
      setSpeedTarget(ip);
      setActiveTab('speedtest');
    },
    []
  );

  // ─── Speedtest ──────────────────────────────────────────
  const handleRunSpeedtest = useCallback(
    async (
      target: string,
      protocol: 'tcp' | 'udp',
      duration: number,
      bandwidth: string
    ) => {
      setIsSpeedtesting(true);
      setSpeedResult(null);
      try {
        const data = await api.runSpeedtest(target, protocol, duration, bandwidth);
        setSpeedResult(data);
        const mbps =
          data.summary?.sent_mbps || data.summary?.received_mbps || data.summary?.mbps || '?';
        addToast(`Speedtest: ${mbps} Mbps`, 'success');
      } catch (e: any) {
        addToast(e.message || 'Speedtest failed', 'error');
      } finally {
        setIsSpeedtesting(false);
      }
    },
    [addToast]
  );

  // ─── Ping ───────────────────────────────────────────────
  const handleRunPing = useCallback(
    async (target: string, count: number) => {
      setIsPinging(true);
      setPingResult(null);
      try {
        const data = await api.runPing(target, count);
        setPingResult(data);
        addToast(`Ping: avg ${data.avg_ms} ms`, 'success');
      } catch (e: any) {
        addToast(e.message || 'Ping failed', 'error');
      } finally {
        setIsPinging(false);
      }
    },
    [addToast]
  );

  // ─── Tunnel CRUD ────────────────────────────────────────
  const openCreateTunnel = useCallback((type: TunnelModalType) => {
    setTunnelModalType(type);
    setTunnelModalEdit(false);
    setTunnelModalData(null);
    setTunnelModalOpen(true);
  }, []);

  const openEditTunnel = useCallback(
    (
      type: TunnelModalType,
      data: HaproxyTunnel | IptablesTunnel | GostTunnel | RealmTunnel
    ) => {
      setTunnelModalType(type);
      setTunnelModalEdit(true);
      setTunnelModalData(data);
      setTunnelModalOpen(true);
    },
    []
  );

  const handleTunnelSubmit = useCallback(
    async (formData: any) => {
      try {
        let msg = '';
        if (tunnelModalType === 'haproxy') {
          msg = await api.saveHaproxyTunnel(
            tunnelModalEdit,
            formData.name,
            formData.target,
            formData.ports,
            formData.originNode
          );
        } else if (tunnelModalType === 'iptables') {
          msg = await api.saveIptablesTunnel(
            tunnelModalEdit,
            formData.name,
            formData.target,
            formData.ports,
            formData.protocol || 'tcp',
            formData.interface || 'any',
            formData.source_cidr || '0.0.0.0/0',
            formData.originNode
          );
        } else if (tunnelModalType === 'gost') {
          msg = await api.saveGostTunnel(
            tunnelModalEdit,
            formData.name,
            formData.target,
            formData.ports,
            formData.protocol || 'tcp',
            formData.originNode
          );
        } else if (tunnelModalType === 'realm') {
          msg = await api.saveRealmTunnel(
            tunnelModalEdit,
            formData.name,
            formData.target,
            formData.ports,
            formData.protocol || 'tcp,udp',
            formData.originNode
          );
        }
        addToast(msg || '✓ Saved', 'success');
        setTunnelModalOpen(false);
        // Refresh tunnels list
        const updated = await api.fetchTunnels();
        setTunnels(updated);
      } catch (e: any) {
        addToast(e.message || 'Save failed', 'error');
        throw e;
      }
    },
    [tunnelModalType, tunnelModalEdit, addToast]
  );

  const handleDeleteTunnelRequest = useCallback(
    (type: 'haproxy' | 'iptables' | 'gost' | 'realm', name: string, originNode?: string) => {
      setDeleteTarget({ type, name, originNode });
      setDeleteModalOpen(true);
    },
    []
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      let msg = '';
      if (deleteTarget.type === 'haproxy') {
        msg = await api.deleteHaproxyTunnel(deleteTarget.name, deleteTarget.originNode);
      } else if (deleteTarget.type === 'iptables') {
        msg = await api.deleteIptablesTunnel(deleteTarget.name, deleteTarget.originNode);
      } else if (deleteTarget.type === 'gost') {
        msg = await api.deleteGostTunnel(deleteTarget.name, deleteTarget.originNode);
      } else if (deleteTarget.type === 'realm') {
        msg = await api.deleteRealmTunnel(deleteTarget.name, deleteTarget.originNode);
      }
      addToast(msg || '✓ Deleted', 'success');
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      // Refresh
      const updated = await api.fetchTunnels();
      setTunnels(updated);
    } catch (e: any) {
      addToast(e.message || 'Delete failed', 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, addToast]);

  // ─── Remote Node & Cluster Updating ─────────────────────
  const handleUpdateNode = useCallback(
    async (ip: string, hostname?: string) => {
      addToast(`${t('version_updating')} (${hostname || ip})...`, 'info');
      try {
        const res = await api.updateNode(ip);
        if (res.ok) {
          addToast(res.message || '✓ Update initiated', 'success');
        } else {
          addToast(res.message || 'Update failed', 'error');
        }
        setTimeout(handleRefresh, 3000);
      } catch (e: any) {
        addToast(e.message || 'Update failed', 'error');
      }
    },
    [addToast, handleRefresh, t]
  );

  const handleUpdateAllNodes = useCallback(async () => {
    addToast(`${t('version_updating')} (Mesh)...`, 'info');
    try {
      const res = await api.updateAllNodes();
      if (res.ok) {
        addToast(res.message || '✓ Mesh update initiated', 'success');
      } else {
        addToast(res.message || 'Mesh update failed', 'error');
      }
      setTimeout(handleRefresh, 5000);
    } catch (e: any) {
      addToast(e.message || 'Mesh update failed', 'error');
    }
  }, [addToast, handleRefresh, t]);

  // ─── Computed Values ────────────────────────────────────
  const avgLatency = (() => {
    const latencies = peers
      .map((p) => {
        const v = typeof p.lat_ms === 'string' ? parseFloat(p.lat_ms) : p.lat_ms;
        return typeof v === 'number' && !isNaN(v) ? v : null;
      })
      .filter((v): v is number => v !== null);
    if (latencies.length === 0) return '--';
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    return `${avg.toFixed(1)} ms`;
  })();

  // ─── Tab Config ─────────────────────────────────────────
  const totalTunnels =
    (tunnels.haproxy?.length || 0) +
    (tunnels.iptables?.length || 0) +
    (tunnels.gost?.length || 0) +
    (tunnels.realm?.length || 0);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    { id: 'node', label: t('tab_node'), icon: <Settings className="w-4 h-4" /> },
    { id: 'peers', label: t('tab_peers'), icon: <Users className="w-4 h-4" />, badge: peers.length > 0 ? peers.length : undefined },
    { id: 'tunnels', label: t('tab_tunnels'), icon: <Network className="w-4 h-4" />, badge: totalTunnels > 0 ? totalTunnels : undefined },
    { id: 'ping', label: t('tab_ping'), icon: <Activity className="w-4 h-4" /> },
    { id: 'speedtest', label: t('tab_speedtest'), icon: <Zap className="w-4 h-4" /> },
  ];

  // ─── Loading / Auth Gate ────────────────────────────────
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-canvas px-3.5 py-4 md:px-6 md:py-6 lg:px-8 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Login Modal */}
      <LoginModal
        isOpen={showLogin}
        passwordConfigured={passwordConfigured}
        onLoginPassword={handleLoginPassword}
        onLoginToken={handleLoginToken}
        onCopy={handleCopy}
        copiedKey={copiedKey}
        t={t}
      />

      {/* Dashboard (shown when authenticated) */}
      {isAuthenticated && (
        <>
          {/* Header */}
          <div className="relative z-50">
            <Header
              node={status.node}
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
              onLogout={handleLogout}
              lang={lang}
              onSelectLang={setLang}
              paletteId={paletteId}
              onSelectPalette={setPaletteId}
              availablePalettes={availablePalettes}
              t={t}
              isRtl={isRtl}
              onOpenDrawer={() => setDrawerOpen(true)}
            />
          </div>

          {/* Version Update Notification Banner */}
          {versionInfo?.update_available && (
            <div className="relative z-20 mb-6 p-4 md:p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-purple-900/30 to-slate-900/50 border border-purple-500/30 backdrop-blur-xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in">
              <div className="flex items-start md:items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0 mt-0.5 md:mt-0">
                  <ArrowUpCircle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-text-main">
                      {t('version_update_available')}: v{versionInfo.latest_version}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/20 text-primary border border-primary/30">
                      Current: v{versionInfo.current_version}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 max-w-2xl leading-relaxed">
                    {versionInfo.release_notes || 'A new update is available for XRayMesh.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                {versionInfo.update_command && (
                  <button
                    onClick={() => handleCopy(versionInfo.update_command!)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-black font-semibold text-xs shadow-md shadow-primary/20 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                    title={versionInfo.update_command}
                  >
                    <span>{t('version_copy_update_cmd')}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Welcome / First-Run Onboarding Banner (When node is not configured) */}
          {status.node && (!status.node.configured || !status.node.ipv4) && (
            <div className="relative z-20 mb-6 p-4 md:p-5 rounded-2xl bg-gradient-to-r from-teal-950/40 via-emerald-900/30 to-slate-900/50 border border-emerald-500/30 backdrop-blur-xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in">
              <div className="flex items-start md:items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5 md:mt-0">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text-main">
                    {t('onboarding_banner_title')}
                  </h4>
                  <p className="text-xs text-text-muted mt-1 max-w-2xl leading-relaxed">
                    {t('onboarding_banner_desc')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                <button
                  onClick={() => setActiveTab('node')}
                  className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-black font-semibold text-xs shadow-md shadow-primary/20 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('wizard_switch_wizard')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Overview Cards */}
          <div className="relative z-10">
            <OverviewCards
              node={status.node}
              system={status.system}
              peerCount={peers.length}
              avgLatency={avgLatency}
              onCopy={handleCopy}
              copiedKey={copiedKey}
              t={t}
            />
          </div>

          {/* Desktop Tab Navigation (Hidden on Mobile) */}
          <div className="hidden md:flex flex-wrap gap-1.5 mb-6 p-1.5 rounded-2xl bg-card/60 border border-card-border backdrop-blur-md shadow-sm">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                    isActive
                      ? 'bg-primary text-black shadow-md shadow-primary/20 font-bold scale-[1.01]'
                      : 'text-text-muted hover:text-text-main hover:bg-white/5'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none ${
                        isActive
                          ? 'bg-black/25 text-black'
                          : 'bg-primary/20 text-primary border border-primary/30'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content with Smooth Transition */}
          <div key={activeTab} className="animate-tab-in">
            {activeTab === 'node' && (
              <NodeConfigTab
                onRefreshStatus={handleRefresh}
                onNotify={addToast}
                onCopy={handleCopy}
                copiedKey={copiedKey}
                t={t}
                lang={lang}
                isRtl={isRtl}
                activePeers={peers}
                onOpenClusterSync={handleOpenClusterSync}
              />
            )}
            {activeTab === 'peers' && (
              <PeersTab
                peers={peers}
                clusterVersionDrift={clusterVersionDrift}
                onRefresh={handleRefresh}
                onQuickPing={handleQuickPing}
                onQuickSpeedtest={handleQuickSpeedtest}
                onUpdateNode={handleUpdateNode}
                onUpdateAllNodes={handleUpdateAllNodes}
                onCopy={handleCopy}
                copiedKey={copiedKey}
                t={t}
              />
            )}
            {activeTab === 'speedtest' && (
              <SpeedtestTab
                peers={peers}
                targetIp={speedTarget}
                onTargetChange={setSpeedTarget}
                isRunning={isSpeedtesting}
                onRun={handleRunSpeedtest}
                lastResult={speedResult}
                t={t}
              />
            )}
            {activeTab === 'ping' && (
              <PingTab
                targetIp={pingTarget}
                onTargetChange={setPingTarget}
                isRunning={isPinging}
                onRun={handleRunPing}
                lastResult={pingResult}
                t={t}
              />
            )}
            {activeTab === 'tunnels' && (
              <TunnelsTab
                tunnels={tunnels}
                onRefresh={handleRefresh}
                onOpenCreateHaproxy={() => openCreateTunnel('haproxy')}
                onOpenEditHaproxy={(t) => openEditTunnel('haproxy', t)}
                onOpenCreateIptables={() => openCreateTunnel('iptables')}
                onOpenEditIptables={(t) => openEditTunnel('iptables', t)}
                onOpenCreateGost={() => openCreateTunnel('gost')}
                onOpenEditGost={(t) => openEditTunnel('gost', t)}
                onOpenCreateRealm={() => openCreateTunnel('realm')}
                onOpenEditRealm={(t) => openEditTunnel('realm', t)}
                onDeleteTunnel={handleDeleteTunnelRequest}
                t={t}
              />
            )}
          </div>

          {/* Tunnel Create/Edit Modal */}
          <TunnelModal
            isOpen={tunnelModalOpen}
            type={tunnelModalType}
            isEdit={tunnelModalEdit}
            initialData={tunnelModalData}
            peers={peers}
            interfaces={interfaces}
            onClose={() => setTunnelModalOpen(false)}
            onSubmit={handleTunnelSubmit}
            t={t}
          />

          {/* Delete Confirm Modal */}
          <DeleteConfirmModal
            isOpen={deleteModalOpen}
            tunnelName={deleteTarget?.name || ''}
            onConfirm={handleDeleteConfirm}
            onCancel={() => {
              setDeleteModalOpen(false);
              setDeleteTarget(null);
            }}
            isDeleting={isDeleting}
            t={t}
          />

          {/* Cluster SafeSync Modal */}
          {clusterSyncConfig && (
            <ClusterSyncModal
              isOpen={clusterSyncOpen}
              onClose={() => setClusterSyncOpen(false)}
              peers={peers}
              currentConfig={clusterSyncConfig}
              onNotify={addToast}
              onRefreshData={handleRefresh}
              t={t}
              isRtl={isRtl}
            />
          )}

          {/* Mobile Bottom Navigation Bar (Thumb-friendly dock) */}
          <MobileBottomNav
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            items={tabs}
          />

          {/* Mobile Navigation & Settings Drawer */}
          <MobileDrawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            node={status.node}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            tabs={tabs}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onLogout={handleLogout}
            lang={lang}
            onSelectLang={setLang}
            paletteId={paletteId}
            onSelectPalette={setPaletteId}
            availablePalettes={availablePalettes}
            t={t}
            isRtl={isRtl}
          />
        </>
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
