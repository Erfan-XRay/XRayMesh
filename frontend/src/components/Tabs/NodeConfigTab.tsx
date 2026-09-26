import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings, Share2 } from 'lucide-react';
import { JoinMeshResult, NodeConfig } from '../../types';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import {
  deleteNodeConfig,
  dismissClusterRollback,
  fetchNodeConfig,
  restartMeshNode,
  startMeshNode,
  stopMeshNode,
} from '../../services/api';
import { formFromConfig } from '../../utils/nodeForm';
import { LoadingSpinner } from '../LoadingSpinner';
import { ErrorPanel } from '../NodeConfig/FormControls';
import { btnGhost, btnSecondary, Callout, cardClass } from '../ui';
import { formatCount } from '../../i18n/format';
import { NodeHeader, ServiceAction } from '../NodeConfig/NodeHeader';
import { SetupFlow } from '../NodeConfig/SetupFlow';
import { ClusterSyncConfig, SettingsPanel } from '../NodeConfig/SettingsPanel';
import { ConnectionsPanel } from '../NodeConfig/ConnectionsPanel';
import { JoinMeshModal } from '../Modals/JoinMeshModal';
import { ConfirmModal } from '../Modals/ConfirmModal';

interface NodeConfigTabProps {
  /** Refreshes the dashboard around this tab without a toast. */
  onRefreshStatus: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
  onOpenClusterSync?: (cfg: ClusterSyncConfig) => void;
  /** Bumped by the parent when the config changed elsewhere (e.g. after a SafeSync broadcast). */
  reloadKey?: number;
}

type NodeTab = 'settings' | 'connections';

const SERVICE_ACTIONS: Record<ServiceAction, { run: () => Promise<string>; done: TranslationKey }> = {
  start: { run: startMeshNode, done: 'node_service_online' },
  stop: { run: stopMeshNode, done: 'node_service_offline' },
  restart: { run: restartMeshNode, done: 'node_restarted' },
};

export const NodeConfigTab: React.FC<NodeConfigTabProps> = ({
  onRefreshStatus,
  onNotify,
  onCopy,
  copiedKey,
  t,
  onOpenClusterSync,
  reloadKey,
}) => {
  const [config, setConfig] = useState<NodeConfig | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<NodeTab>('settings');
  const [pendingAction, setPendingAction] = useState<ServiceAction | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Keeps the setup success screen on display after the node becomes configured.
  const [setupInProgress, setSetupInProgress] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await fetchNodeConfig();
      setConfig(cfg);
      setPeers(cfg.peers || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig, reloadKey]);

  // The settings form resets only when saved values change, not on every status poll.
  const settingsKey = useMemo(() => (config ? JSON.stringify(formFromConfig(config)) : ''), [config]);

  const refreshAll = async () => {
    setRefreshing(true);
    await loadConfig();
    onRefreshStatus();
    setRefreshing(false);
  };

  const runServiceAction = async (action: ServiceAction) => {
    setPendingAction(action);
    try {
      await SERVICE_ACTIONS[action].run();
      onNotify(t(SERVICE_ACTIONS[action].done), action === 'stop' ? 'info' : 'success');
      await loadConfig();
      onRefreshStatus();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setPendingAction(null);
    }
  };

  const handleJoined = async (result: JoinMeshResult) => {
    setJoinOpen(false);
    onNotify(formatText(t('join_success'), { network: result.network_name }), 'success');
    setTab('settings');
    await loadConfig();
    onRefreshStatus();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteNodeConfig();
      onNotify(t('node_delete_success'), 'success');
      setDeleteOpen(false);
      await loadConfig();
      onRefreshStatus();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDismissRollback = async () => {
    try {
      await dismissClusterRollback();
    } finally {
      setConfig((prev) => (prev ? { ...prev, last_rollback: undefined } : prev));
    }
  };

  if (!config) {
    if (loadError) {
      return (
        <div className={`${cardClass} max-w-xl mx-auto p-6 space-y-4`}>
          <ErrorPanel message={t('node_load_error')} details={loadError} t={t} />
          <button type="button" onClick={refreshAll} disabled={refreshing} className={btnSecondary}>
            {t('btn_retry')}
          </button>
        </div>
      );
    }
    return (
      <div className={`${cardClass} flex flex-col items-center justify-center p-16`}>
        <LoadingSpinner size="lg" label={t('mesh_connecting')} />
      </div>
    );
  }

  if (!config.node_configured || setupInProgress) {
    return (
      <SetupFlow
        config={config}
        t={t}
        onCopy={onCopy}
        copiedKey={copiedKey}
        onConfigured={() => {
          setSetupInProgress(true);
          onRefreshStatus();
        }}
        onFinished={async () => {
          await loadConfig();
          setSetupInProgress(false);
          setTab('settings');
        }}
      />
    );
  }

  const tabs: { id: NodeTab; label: TranslationKey; icon: React.ReactNode }[] = [
    { id: 'settings', label: 'node_tab_settings', icon: <Settings className="w-4 h-4" aria-hidden="true" /> },
    { id: 'connections', label: 'node_tab_connections', icon: <Share2 className="w-4 h-4" aria-hidden="true" /> },
  ];

  return (
    <div className="space-y-4">
      {config.last_rollback?.occurred && (
        <Callout
          role="status"
          tone="warning"
          title={t('cluster_rollback_alert_title')}
          action={
            <button type="button" onClick={handleDismissRollback} className={btnGhost}>
              {t('cluster_rollback_dismiss_btn')}
            </button>
          }
        >
          <p>{t('cluster_rollback_alert_desc')}</p>
          {config.last_rollback.reason && (
            <p dir="ltr" className="mt-2 text-start font-mono text-xs text-text-muted break-words">
              {config.last_rollback.reason}
            </p>
          )}
        </Callout>
      )}

      <NodeHeader
        config={config}
        pending={pendingAction}
        refreshing={refreshing}
        onAction={runServiceAction}
        onRefresh={refreshAll}
        t={t}
      />

      <div
        role="tablist"
        aria-label={t('tab_node')}
        className="grid grid-cols-2 sm:inline-grid gap-1 p-1 rounded-xl bg-surface border border-card-border"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const next = tab === 'settings' ? 'connections' : 'settings';
            setTab(next);
            document.getElementById(`node-tab-${next}`)?.focus();
          }
        }}
      >
        {tabs.map(({ id, label, icon }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              id={`node-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`node-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(id)}
              className={`inline-flex items-center justify-center gap-2 min-h-9 px-3.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                selected ? 'bg-card text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <span className={selected ? 'text-primary' : ''}>{icon}</span>
              <span>{t(label)}</span>
              {id === 'connections' && peers.length > 0 && (
                <span className="text-xs tabular-nums text-text-subtle">{formatCount(peers.length, t)}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Both panels stay mounted so unsaved settings survive a tab switch. */}
      <div id="node-panel-settings" role="tabpanel" aria-labelledby="node-tab-settings" hidden={tab !== 'settings'}>
        <SettingsPanel
          key={settingsKey}
          config={config}
          peers={peers}
          t={t}
          onSaved={async () => {
            await loadConfig();
            onRefreshStatus();
          }}
          onNotify={onNotify}
          onOpenClusterSync={onOpenClusterSync}
          onDeleteRequest={() => setDeleteOpen(true)}
        />
      </div>
      <div id="node-panel-connections" role="tabpanel" aria-labelledby="node-tab-connections" hidden={tab !== 'connections'}>
        <ConnectionsPanel
          port={config.port}
          peers={peers}
          onPeersChange={setPeers}
          onServiceChanged={onRefreshStatus}
          onJoinRequest={() => setJoinOpen(true)}
          onNotify={onNotify}
          onCopy={onCopy}
          copiedKey={copiedKey}
          t={t}
        />
      </div>

      {joinOpen && <JoinMeshModal current={{ ...config, peers }} t={t} onClose={() => setJoinOpen(false)} onJoined={handleJoined} />}

      <ConfirmModal
        isOpen={deleteOpen}
        title={t('node_delete_confirm_title')}
        description={t('node_delete_confirm_desc')}
        confirmLabel={t('node_btn_delete')}
        cancelLabel={t('btn_cancel')}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
};
