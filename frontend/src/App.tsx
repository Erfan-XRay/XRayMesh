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
} from './types';
import { useTheme } from './theme/useTheme';
import { useTranslation } from './i18n/useTranslation';
import * as api from './services/api';

import { Header } from './components/Header';
import { OverviewCards } from './components/OverviewCards';
import { ToastContainer } from './components/Toast';
import { LoginModal } from './components/Modals/LoginModal';
import { TunnelModal, TunnelModalType } from './components/Modals/TunnelModal';
import { DeleteConfirmModal } from './components/Modals/DeleteConfirmModal';
import { PeersTab } from './components/Tabs/PeersTab';
import { SpeedtestTab } from './components/Tabs/SpeedtestTab';
import { PingTab } from './components/Tabs/PingTab';
import { TunnelsTab } from './components/Tabs/TunnelsTab';

import { Users, Zap, Activity, Network } from 'lucide-react';

type TabId = 'peers' | 'speedtest' | 'ping' | 'tunnels';

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

  // Dashboard data
  const [status, setStatus] = useState<StatusResponse>(EMPTY_STATUS);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [tunnels, setTunnels] = useState<TunnelsData>({ haproxy: [], iptables: [], gost: [] });
  const [interfaces, setInterfaces] = useState<string[]>(['any']);

  // Active tab
  const [activeTab, setActiveTab] = useState<TabId>('peers');

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
    HaproxyTunnel | IptablesTunnel | GostTunnel | null
  >(null);

  // Delete confirm state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'haproxy' | 'iptables' | 'gost';
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedKey(text);
        addToast(t('btn_copied'), 'success');
        setTimeout(() => setCopiedKey(null), 2000);
      });
    },
    [addToast, t]
  );

  // ─── Data Fetching ──────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const [statusData, peersData, tunnelsData] = await Promise.all([
        api.fetchStatus(),
        api.fetchPeers(),
        api.fetchTunnels(),
      ]);
      setStatus(statusData);
      setPeers(peersData);
      setTunnels(tunnelsData);
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
    (type: TunnelModalType, data: HaproxyTunnel | IptablesTunnel | GostTunnel) => {
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
            formData.ports
          );
        } else if (tunnelModalType === 'iptables') {
          msg = await api.saveIptablesTunnel(
            tunnelModalEdit,
            formData.name,
            formData.target,
            formData.ports,
            formData.protocol || 'tcp',
            formData.interface || 'any',
            formData.source_cidr || '0.0.0.0/0'
          );
        } else if (tunnelModalType === 'gost') {
          msg = await api.saveGostTunnel(
            tunnelModalEdit,
            formData.name,
            formData.target,
            formData.ports,
            formData.protocol || 'tcp'
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
    (type: 'haproxy' | 'iptables' | 'gost', name: string) => {
      setDeleteTarget({ type, name });
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
        msg = await api.deleteHaproxyTunnel(deleteTarget.name);
      } else if (deleteTarget.type === 'iptables') {
        msg = await api.deleteIptablesTunnel(deleteTarget.name);
      } else {
        msg = await api.deleteGostTunnel(deleteTarget.name);
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
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'peers', label: t('tab_peers'), icon: <Users className="w-4 h-4" /> },
    { id: 'speedtest', label: t('tab_speedtest'), icon: <Zap className="w-4 h-4" /> },
    { id: 'ping', label: t('tab_ping'), icon: <Activity className="w-4 h-4" /> },
    { id: 'tunnels', label: t('tab_tunnels'), icon: <Network className="w-4 h-4" /> },
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
    <div className="min-h-screen bg-canvas px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Login Modal */}
      <LoginModal
        isOpen={showLogin}
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
          />

          {/* Overview Cards */}
          <OverviewCards
            node={status.node}
            system={status.system}
            peerCount={peers.length}
            avgLatency={avgLatency}
            onCopy={handleCopy}
            copiedKey={copiedKey}
            t={t}
          />

          {/* Tab Navigation */}
          <div className="flex flex-wrap gap-1.5 mb-6 p-1 rounded-xl bg-card/50 border border-card-border backdrop-blur-sm">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary/15 text-primary border border-primary/25 shadow-sm'
                    : 'text-text-muted hover:text-text-main hover:bg-white/5'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'peers' && (
            <PeersTab
              peers={peers}
              onRefresh={handleRefresh}
              onQuickPing={handleQuickPing}
              onQuickSpeedtest={handleQuickSpeedtest}
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
              onDeleteTunnel={handleDeleteTunnelRequest}
              t={t}
            />
          )}

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
        </>
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
