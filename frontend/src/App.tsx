import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useNodeUpdates, UPDATED_TO_KEY } from './hooks/useNodeUpdates';
import { useTunnels } from './hooks/useTunnels';
import * as api from './services/api';

import { Header, NavTab } from './components/Header';
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
import { formatText } from './i18n/fillTemplate';
import { formatCount, localizeDigits } from './i18n/format';
import { btnPrimary } from './components/ui';

/** Version this server was just updated to, read once per page load (null when no update happened). */
const JUST_UPDATED_TO: string | null = (() => {
  try {
    const v = sessionStorage.getItem(UPDATED_TO_KEY);
    if (v !== null) sessionStorage.removeItem(UPDATED_TO_KEY);
    return v;
  } catch {
    return null;
  }
})();

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
  const { paletteId, setPaletteId, themeMode, setThemeMode, availablePalettes, resolvedTheme } = useTheme();
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
  // A new tab starts at its top; otherwise mobile users land mid-page after switching.
  const firstTabRender = useRef(true);
  useEffect(() => {
    if (firstTabRender.current) {
      firstTabRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab]);

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
        addToast(t('toast_copy_failed'), 'error');
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
  // This server's own update, once it reaches the restart: the panel goes away for a moment.
  const localRestart = Object.values(updateRuns).find(
    (r) => r.isLocal && ['restart', 'reconnecting', 'rollback', 'success'].includes(r.phase)
  );
  const [updatedTo, setUpdatedTo] = useState<string | null>(JUST_UPDATED_TO);

  useEffect(() => {
    if (isAuthenticated && updatedTo !== null) {
      addToast(formatText(t('update_after_reload_toast'), { version: updatedTo ? `v${updatedTo}` : '' }), 'success');
      setUpdatedTo(null);
    }
  }, [isAuthenticated, updatedTo, addToast, t]);

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
    addToast(t('toast_refreshed'), 'success');
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
          addToast(t('toast_token_accepted'), 'success');
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
  }, [addToast]); // Runs once on load; t only changes the toast wording.

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
      addToast(t('toast_logged_in'), 'success');
    },
    [addToast, t]
  );

  const handleLoginToken = useCallback(
    async (token: string) => {
      await api.loginWithToken(token);
      setIsAuthenticated(true);
      setShowLogin(false);
      addToast(t('toast_token_accepted'), 'success');
    },
    [addToast, t]
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
        addToast(formatText(t('toast_speedtest_done'), { mbps: localizeDigits(mbps, t) }), 'success');
      } catch (e: any) {
        addToast(e.message || t('toast_speedtest_failed'), 'error');
      } finally {
        setIsSpeedtesting(false);
      }
    },
    [addToast, t]
  );

  // ─── Ping ───────────────────────────────────────────────
  const handleRunPing = useCallback(
    async (target: string, count: number, source?: string) => {
      setIsPinging(true);
      setPingResult(null);
      try {
        const data = await api.runPing(target, count, source);
        setPingResult(data);
        addToast(formatText(t('toast_ping_done'), { avg: localizeDigits(data.avg_ms, t) }), 'success');
      } catch (e: any) {
        addToast(e.message || t('toast_ping_failed'), 'error');
      } finally {
        setIsPinging(false);
      }
    },
    [addToast, t]
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
        addToast(msg || t('toast_saved'), 'success');
        setTunnelModalOpen(false);
        await tunnelStore.reloadNode(formData.originNode || (tunnelModalEdit ? tunnelModalData?._node_ip : undefined));
      } catch (e: any) {
        addToast(e.message || t('toast_save_failed'), 'error');
        throw e;
      }
    },
    [tunnelModalType, tunnelModalEdit, tunnelModalData, addToast, tunnelStore, t]
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
      addToast(msg || t('toast_deleted'), 'success');
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      await tunnelStore.reloadNode(deleteTarget.originNode);
    } catch (e: any) {
      addToast(e.message || t('toast_delete_failed'), 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, addToast, tunnelStore, t]);


  // ─── Computed Values ────────────────────────────────────
  const avgLatency = (() => {
    const latencies = peers
      .filter((p) => !p.is_current)
      .map((p) => (typeof p.lat_ms === 'string' ? parseFloat(p.lat_ms) : p.lat_ms))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (latencies.length === 0) return null;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  })();
  const otherPeers = peers.filter((p) => !p.is_current).length;

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

  const tabs: NavTab[] = isNodeConfigured
    ? [
        { id: 'node', label: t('tab_node'), short: t('tab_short_node'), icon: <Settings className="w-[18px] h-[18px]" /> },
        { id: 'peers', label: t('tab_peers'), short: t('tab_short_peers'), icon: <Users className="w-[18px] h-[18px]" />, badge: otherPeers > 0 ? formatCount(otherPeers, t) : undefined },
        { id: 'tunnels', label: t('tab_tunnels'), short: t('tab_short_tunnels'), icon: <Network className="w-[18px] h-[18px]" />, badge: totalTunnels > 0 ? formatCount(totalTunnels, t) : undefined },
        { id: 'ping', label: t('tab_ping'), short: t('tab_short_ping'), icon: <Activity className="w-[18px] h-[18px]" /> },
        { id: 'speedtest', label: t('tab_speedtest'), short: t('tab_short_speedtest'), icon: <Zap className="w-[18px] h-[18px]" /> },
      ]
    : [{ id: 'node', label: t('setup_title'), icon: <Sparkles className="w-[18px] h-[18px]" /> }];

  const preferences = {
    lang,
    onSelectLang: setLang,
    paletteId,
    onSelectPalette: setPaletteId,
    themeMode,
    onSelectThemeMode: setThemeMode,
    availablePalettes,
    resolvedTheme,
  };

  // ─── Loading / Auth Gate ────────────────────────────────
  if (isAuthenticated === null || (isAuthenticated && !initialLoaded)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-4">
        <LoadingSpinner size="xl" label={t('boot_loading')} sublabel={t('boot_loading_hint')} />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────
  return (
    <>
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
        notice={updatedTo !== null ? formatText(t('update_login_notice'), { version: updatedTo ? `v${updatedTo}` : '' }) : undefined}
        t={t}
      />

      {/* This server is restarting to finish its own update */}
      {localRestart && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label={t('update_overlay_title')}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-[var(--overlay)] backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-sm rounded-2xl bg-elevated border border-card-border shadow-pop px-6 py-8 text-center animate-modal-in">
            <LoadingSpinner
              size="lg"
              label={
                localRestart.phase === 'success'
                  ? formatText(t('update_overlay_done'), { version: localRestart.targetVersion ? `v${localRestart.targetVersion}` : '' })
                  : localRestart.phase === 'rollback'
                    ? t('update_phase_rollback')
                    : t('update_overlay_title')
              }
              sublabel={localRestart.phase === 'success' ? t('update_overlay_done_hint') : t('update_overlay_hint')}
            />
          </div>
        </div>
      )}

      {isAuthenticated && (
        <div className="min-h-dvh flex flex-col">
          <Header
            node={status.node}
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            showTabs={isNodeConfigured}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onLogout={handleLogout}
            onOpenDrawer={() => setDrawerOpen(true)}
            t={t}
            {...preferences}
          />

          <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 pb-28 md:pb-12">
            {/* Update notice for this server; the Peers tab holds the one-click update. */}
            {isNodeConfigured && versionInfo?.update_available && activeTab !== 'peers' && (
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 sm:ps-4 rounded-2xl bg-primary-subtle border border-primary-border animate-fade-in">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-primary text-on-primary" aria-hidden="true">
                    <ArrowUpCircle className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {t('version_update_available')}{' '}
                      <bdi dir="ltr" className="font-mono text-primary">
                        {versionInfo.latest_version}
                      </bdi>
                    </p>
                    {(versionInfo.release_notes || typeof versionInfo.changelog === 'string') && (
                      <p className="mt-0.5 text-xs text-text-muted leading-relaxed line-clamp-2" dir="auto">
                        {versionInfo.release_notes || (versionInfo.changelog as unknown as string)}
                      </p>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => setActiveTab('peers')} className={`${btnPrimary} w-full sm:w-auto shrink-0`}>
                  {t('version_view_updates')}
                </button>
              </div>
            )}

            {isNodeConfigured && (
              <OverviewCards
                node={status.node}
                system={status.system}
                peers={peers}
                avgLatency={avgLatency}
                onCopy={handleCopy}
                copiedKey={copiedKey}
                t={t}
              />
            )}

            <main
              id="dashboard-content"
              key={activeTab}
              role="tabpanel"
              aria-labelledby={isNodeConfigured ? `tab-${activeTab}` : undefined}
              aria-label={isNodeConfigured ? undefined : tabs[0]?.label}
              className="animate-tab-in"
            >
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
                  isRtl={isRtl}
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
                  onOpenEditHaproxy={(item) => openEditTunnel('haproxy', item)}
                  onOpenCreateIptables={() => openCreateTunnel('iptables')}
                  onOpenEditIptables={(item) => openEditTunnel('iptables', item)}
                  onOpenCreateGost={() => openCreateTunnel('gost')}
                  onOpenEditGost={(item) => openEditTunnel('gost', item)}
                  onOpenCreateRealm={() => openCreateTunnel('realm')}
                  onOpenEditRealm={(item) => openEditTunnel('realm', item)}
                  onDeleteTunnel={handleDeleteTunnelRequest}
                  t={t}
                />
              )}
            </main>
          </div>

          <TunnelModal
            isOpen={tunnelModalOpen}
            type={tunnelModalType}
            isEdit={tunnelModalEdit}
            initialData={tunnelModalData}
            peers={peers}
            nodeStates={tunnelStore.nodes}
            defaultOriginNode={tunnelStore.scope !== 'local' && tunnelStore.scope !== 'all' ? tunnelStore.scope : ''}
            interfaces={interfaces}
            onClose={() => setTunnelModalOpen(false)}
            onSubmit={handleTunnelSubmit}
            t={t}
          />

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
            />
          )}

          {isNodeConfigured && <MobileBottomNav activeTab={activeTab} onSelectTab={setActiveTab} tabs={tabs} t={t} />}

          <MobileDrawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            node={status.node}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            tabs={tabs}
            showTabs={isNodeConfigured}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onLogout={handleLogout}
            t={t}
            {...preferences}
          />
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </>
  );
}
