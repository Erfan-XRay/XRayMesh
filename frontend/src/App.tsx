import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StatusResponse,
  Peer,
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
import { useNodeUpdates } from './hooks/useNodeUpdates';
import { useTunnels } from './hooks/useTunnels';
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
import { LoadingSpinner } from './components/LoadingSpinner';

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
  const { paletteId, setPaletteId, themeMode, setThemeMode, availablePalettes } = useTheme();
  const { lang, setLang, isRtl, t } = useTranslation();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [passwordConfigured, setPasswordConfigured] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Dashboard data
  const [status, setStatus] = useState<StatusResponse>(EMPTY_STATUS);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [interfaces, setInterfaces] = useState<string[]>(['any']);
  const tunnelStore = useTunnels(isAuthenticated === true);
  const { tunnels } = tunnelStore;

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
  const [nodeReloadKey, setNodeReloadKey] = useState(0);
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
  const [initialLoaded, setInitialLoaded] = useState(false);
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
      const [statusData, peersResult, verData] = await Promise.all([
        api.fetchStatus(),
        api.fetchPeersData(),
        api.fetchVersionInfo(),
      ]);
      setStatus(statusData);
      const localIp = peersResult.local_ip || statusData?.node?.ipv4 || '';
      const markedPeers = peersResult.peers.map((p) => ({
        ...p,
        is_current: p.is_current ?? (localIp ? p.ipv4 === localIp : false),
      }));
      markedPeers.sort((a, b) => Number(b.is_current ?? false) - Number(a.is_current ?? false));
      setPeers(markedPeers);
      setVersionInfo(verData);
    } catch {
      // Silent fail on periodic poll
    } finally {
      setInitialLoaded(true);
    }
  }, []);

  // Update runs live here so their progress survives switching tabs.
  const { runs: updateRuns, start: startUpdate, dismiss: dismissUpdate } = useNodeUpdates(loadDashboard);

  const loadInterfaces = useCallback(async () => {
    const ifaces = await api.fetchInterfaces();
    setInterfaces(ifaces);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // Re-check GitHub first so the peers list below reflects a release published minutes ago.
    await api.fetchVersionInfo(true).catch(() => undefined);
    await Promise.all([loadDashboard(), tunnelStore.refresh()]);
    setIsRefreshing(false);
    addToast(t('btn_refresh') + ' ✓', 'success');
  }, [loadDashboard, tunnelStore, addToast, t]);

  // ─── Auth ───────────────────────────────────────────────
  useEffect(() => {
    // Check if a one-click token is present in the URL query string
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');

    if (tokenParam) {
      // Strip token from browser address bar history immediately for security
      urlParams.delete('token');
      const cleanSearch = urlParams.toString();
      const cleanUrl =
        window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);

      // Exchange token for active session
      api
        .loginWithToken(tokenParam)
        .then(() => {
          setIsAuthenticated(true);
          setShowLogin(false);
          addToast('✓ Logged in via access token', 'success');
        })
        .catch(() => {
          // Token exchange failed or was already consumed by server 302, check status
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
        });
      return;
    }

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
  }, [addToast]);

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
    // Errors propagate to the login page, which shows them inline.
    async (password: string) => {
      await api.loginWithPassword(password);
      setIsAuthenticated(true);
      setShowLogin(false);
      addToast('✓ Logged in', 'success');
    },
    [addToast]
  );

  const handleLoginToken = useCallback(
    async (token: string) => {
      await api.loginWithToken(token);
      setIsAuthenticated(true);
      setShowLogin(false);
      addToast('✓ Token accepted', 'success');
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
      bandwidth: string,
      source?: string
    ) => {
      setIsSpeedtesting(true);
      setSpeedResult(null);
      try {
        const data = await api.runSpeedtest(target, protocol, duration, bandwidth, source);
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
    async (target: string, count: number, source?: string) => {
      setIsPinging(true);
      setPingResult(null);
      try {
        const data = await api.runPing(target, count, source);
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
            formData.source_cidr || formData.sourceCidr || '0.0.0.0/0',
            undefined
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
        await tunnelStore.reloadNode(formData.originNode || (tunnelModalEdit ? tunnelModalData?._node_ip : undefined));
      } catch (e: any) {
        addToast(e.message || 'Save failed', 'error');
        throw e;
      }
    },
    [tunnelModalType, tunnelModalEdit, tunnelModalData, addToast, tunnelStore]
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
      await tunnelStore.reloadNode(deleteTarget.originNode);
    } catch (e: any) {
      addToast(e.message || 'Delete failed', 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, addToast, tunnelStore]);


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

  const isNodeConfigured = Boolean(status.node?.configured && status.node?.ipv4);

  useEffect(() => {
    if (initialLoaded && !isNodeConfigured && activeTab !== 'node') {
      setActiveTab('node');
    }
  }, [initialLoaded, isNodeConfigured, activeTab]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number | string }[] = isNodeConfigured
    ? [
        { id: 'node', label: t('tab_node'), icon: <Settings className="w-4 h-4" /> },
        { id: 'peers', label: t('tab_peers'), icon: <Users className="w-4 h-4" />, badge: peers.length > 0 ? peers.length : undefined },
        { id: 'tunnels', label: t('tab_tunnels'), icon: <Network className="w-4 h-4" />, badge: totalTunnels > 0 ? totalTunnels : undefined },
        { id: 'ping', label: t('tab_ping'), icon: <Activity className="w-4 h-4" /> },
        { id: 'speedtest', label: t('tab_speedtest'), icon: <Zap className="w-4 h-4" /> },
      ]
    : [
        { id: 'node', label: t('setup_title'), icon: <Sparkles className="w-4 h-4 text-primary" />, badge: t('setup_mode_badge') || 'Setup' },
      ];

  // ─── Loading / Auth Gate ────────────────────────────────
  if (isAuthenticated === null || (isAuthenticated && !initialLoaded)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-5 bg-transparent px-4">
        <LoadingSpinner
          size="xl"
          glow={true}
          label={lang === 'fa' ? 'در حال بارگذاری و بررسی وضعیت نود...' : 'Connecting to XRayMesh Node...'}
          sublabel={lang === 'fa' ? 'دریافت مشخصات شبکه و وضعیت نودها' : 'Synchronizing node status and mesh topology'}
        />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-transparent px-3 sm:px-6 py-3.5 sm:py-6 lg:px-8 max-w-7xl mx-auto pb-24 md:pb-12">
      {/* Login Modal */}
      <LoginModal
        isOpen={showLogin}
        passwordConfigured={passwordConfigured}
        onLoginPassword={handleLoginPassword}
        onLoginToken={handleLoginToken}
        onCopy={handleCopy}
        copiedKey={copiedKey}
        lang={lang}
        onSelectLang={setLang}
        themeMode={themeMode}
        onSelectThemeMode={setThemeMode}
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
              themeMode={themeMode}
              onSelectThemeMode={setThemeMode}
              availablePalettes={availablePalettes}
              t={t}
              isRtl={isRtl}
              onOpenDrawer={() => setDrawerOpen(true)}
            />
          </div>

          {/* Update notice for this server; the Peers tab holds the one-click update. */}
          {isNodeConfigured && versionInfo?.update_available && activeTab !== 'peers' && (
            <div className="relative z-20 mb-4 sm:mb-6 p-3.5 sm:p-4 rounded-2xl bg-card border border-primary-border backdrop-blur-xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-primary-subtle text-primary flex items-center justify-center shrink-0" aria-hidden="true">
                  <ArrowUpCircle className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-main">
                    {t('version_update_available')}: <bdi dir="ltr" className="font-mono">{versionInfo.latest_version}</bdi>
                  </p>
                  {(versionInfo.release_notes || typeof versionInfo.changelog === 'string') && (
                    <p className="text-xs text-text-muted mt-0.5 max-w-2xl leading-relaxed" dir="auto">
                      {versionInfo.release_notes || (versionInfo.changelog as unknown as string)}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('peers')}
                className="w-full md:w-auto shrink-0 inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors cursor-pointer"
              >
                {t('version_view_updates')}
              </button>
            </div>
          )}

          {/* Overview Cards (Only shown after mesh node is configured) */}
          {isNodeConfigured && (
            <div className="relative z-10 animate-fade-in">
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
          )}

          {/* Tab Navigation (only once the node is configured) */}
          {isNodeConfigured && (
            <nav aria-label={t('drawer_tabs')} className="horizontal-scroll hidden md:flex flex-wrap gap-1.5 mb-4 sm:mb-6 p-1.5 rounded-2xl bg-card/80 border border-card-border backdrop-blur-xl shadow-lg" role="tablist">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    aria-selected={isActive}
                    aria-label={tab.label}
                    tabIndex={isActive ? 0 : -1}
                    className={`interactive-min-hit flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-primary text-black shadow-md shadow-primary/20 font-bold'
                        : 'text-text-muted hover:text-text-main hover:bg-white/5'
                    }`}
                  >
                    <span className="shrink-0">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold leading-none shrink-0 ${
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
            </nav>
          )}

          {/* Tab Content with Smooth Transition */}
          <main id="dashboard-content" key={activeTab} role="tabpanel" aria-label={tabs.find((item) => item.id === activeTab)?.label} className="animate-tab-in">
            {activeTab === 'node' && (
              <NodeConfigTab
                onRefreshStatus={loadDashboard}
                onNotify={addToast}
                onCopy={handleCopy}
                copiedKey={copiedKey}
                t={t}
                onOpenClusterSync={handleOpenClusterSync}
                reloadKey={nodeReloadKey}
              />
            )}
            {activeTab === 'peers' && (
              <PeersTab
                peers={peers}
                updateRuns={updateRuns}
                onStartUpdate={startUpdate}
                onDismissUpdate={dismissUpdate}
                onRefresh={loadDashboard}
                onQuickPing={handleQuickPing}
                onQuickSpeedtest={handleQuickSpeedtest}
                onNotify={addToast}
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
                peers={peers}
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
                nodes={tunnelStore.nodes}
                byNode={tunnelStore.byNode}
                scope={tunnelStore.scope}
                onScopeChange={tunnelStore.setScope}
                onRetryNode={tunnelStore.loadNode}
                onRefresh={() => tunnelStore.refresh()}
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
          </main>

          {/* Tunnel Create/Edit Modal */}
          <TunnelModal
            isOpen={tunnelModalOpen}
            type={tunnelModalType}
            isEdit={tunnelModalEdit}
            initialData={tunnelModalData}
            peers={peers}
            nodeStates={tunnelStore.nodes}
            defaultOriginNode={
              tunnelStore.scope !== 'local' && tunnelStore.scope !== 'all' ? tunnelStore.scope : ''
            }
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
              onRefreshData={() => {
                handleRefresh();
                setNodeReloadKey((key) => key + 1);
              }}
              t={t}
              isRtl={isRtl}
            />
          )}

          {/* Mobile Navigation & Settings Drawer */}
          {/* Mobile Sticky Bottom Navigation Bar */}
          {isNodeConfigured && (
            <MobileBottomNav
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              tabs={tabs}
              t={t}
            />
          )}

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
            themeMode={themeMode}
            onSelectThemeMode={setThemeMode}
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
