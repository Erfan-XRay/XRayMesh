import React, { useState } from 'react';
import { Peer, MeshProtocol } from '../../types';
import { broadcastClusterConfig, ClusterBroadcastPayload } from '../../services/api';
import {
  Globe,
  Shield,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Server,
  Sparkles,
  Lock,
} from 'lucide-react';

interface ClusterSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  peers: Peer[];
  currentConfig: {
    protocol: MeshProtocol;
    enableKcp: boolean;
    encryption: boolean;
    ipv6: boolean;
    mtu: number;
    networkSecret: string;
    hostname: string;
    ipv4: string;
  };
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onRefreshData: () => void;
  t: (key: any) => string;
  isRtl: boolean;
}

export const ClusterSyncModal: React.FC<ClusterSyncModalProps> = ({
  isOpen,
  onClose,
  peers,
  currentConfig,
  onNotify,
  onRefreshData,
  t,
  isRtl,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<'idle' | 'preparing' | 'committing' | 'verifying' | 'done'>('idle');
  const [syncedNodesList, setSyncedNodesList] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const activePeers = peers.filter((p) => p && p.cost !== 'Local' && p.ipv4);

  const handleStartSync = async () => {
    setIsSyncing(true);
    setErrorMsg(null);
    setSyncStep('preparing');

    try {
      const payload: ClusterBroadcastPayload = {
        protocol: currentConfig.protocol,
        enable_kcp: currentConfig.enableKcp,
        encryption: currentConfig.encryption,
        ipv6: currentConfig.ipv6,
        mtu: currentConfig.mtu,
        network_secret: currentConfig.networkSecret,
      };

      setSyncStep('committing');
      const res = await broadcastClusterConfig(payload);

      setSyncStep('verifying');
      setSyncedNodesList(res.synced_nodes || []);

      setTimeout(() => {
        setSyncStep('done');
        setIsSyncing(false);
        onNotify(t('cluster_sync_success'), 'success');
        onRefreshData();
      }, 2500);
    } catch (err: any) {
      setIsSyncing(false);
      setSyncStep('idle');
      setErrorMsg(err.message || t('cluster_sync_error'));
      onNotify(err.message || t('cluster_sync_error'), 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-modal-in">
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-white/15 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary/20 to-emerald-400/20 border border-primary/40 flex items-center justify-center text-primary shadow-sm">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main flex items-center gap-2">
                <span>{t('cluster_modal_title')}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/30">
                  SafeSync 2PC
                </span>
              </h2>
              <p className="text-xs text-text-muted mt-0.5 max-w-md line-clamp-1">
                {t('cluster_modal_desc')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSyncing}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Diff Box: What changes vs what stays local */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-text-main flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>{t('cluster_diff_title')}</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                HMAC-SHA256 Signed
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
                <span className="text-[10px] text-text-muted block mb-1">{t('cluster_field_protocol')}</span>
                <span className="font-mono font-bold text-primary uppercase text-xs">
                  {currentConfig.protocol}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
                <span className="text-[10px] text-text-muted block mb-1">{t('cluster_field_kcp')}</span>
                <span className={`font-mono font-bold text-xs ${currentConfig.enableKcp ? 'text-amber-400' : 'text-text-muted'}`}>
                  {currentConfig.enableKcp ? 'ENABLED (Anti-Loss)' : 'Disabled'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
                <span className="text-[10px] text-text-muted block mb-1">{t('cluster_field_encryption')}</span>
                <span className="font-mono font-bold text-xs text-text-main">
                  {currentConfig.encryption ? 'ChaCha20-Poly1305' : 'None'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
                <span className="text-[10px] text-text-muted block mb-1">{t('cluster_field_mtu')}</span>
                <span className="font-mono font-bold text-xs text-text-main">
                  {currentConfig.mtu}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
                <span className="text-[10px] text-text-muted block mb-1">{t('cluster_field_ipv6')}</span>
                <span className="font-mono font-bold text-xs text-text-main">
                  {currentConfig.ipv6 ? 'Active' : 'Disabled'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/5">
                <span className="text-[10px] text-text-muted block mb-1">{t('cluster_field_secret')}</span>
                <span className="font-mono font-bold text-xs text-primary flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  ••••••••
                </span>
              </div>
            </div>

            {/* Crucial reassurance notice */}
            <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] text-text-main leading-relaxed">
              <span className="font-bold text-primary mr-1">ℹ️</span>
              <span>{t('cluster_unique_notice')}</span>
            </div>
          </div>

          {/* Target Nodes List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-text-main flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-text-muted" />
                <span>{t('cluster_target_nodes')}</span>
              </span>
              <span className="text-[11px] font-mono text-text-muted">
                {activePeers.length + 1} machines total (1 Controller + {activePeers.length} Peers)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {/* Local machine */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/10 border border-primary/30">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="font-bold text-text-main truncate">{currentConfig.hostname || 'This Server'}</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary text-black">
                    Controller
                  </span>
                </div>
                <span className="font-mono text-[11px] text-primary">{currentConfig.ipv4}</span>
              </div>

              {/* Connected peers */}
              {activePeers.map((p) => (
                <div
                  key={p.ipv4}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-white/10"
                >
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-medium text-text-main truncate">{p.hostname || 'Remote Node'}</span>
                  </div>
                  <span className="font-mono text-[11px] text-text-muted">{p.ipv4}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Self-Healing Watchdog Box */}
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3">
            <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-emerald-400 text-xs block">
                {t('cluster_watchdog_title')}
              </span>
              <p className="text-[11px] text-text-muted leading-relaxed">
                {t('cluster_watchdog_desc')}
              </p>
            </div>
          </div>

          {/* Progress or Error Display */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isSyncing && (
            <div className="p-4 rounded-xl bg-slate-950 border border-primary/30 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-bold text-primary flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                  <span>{t('cluster_syncing')}</span>
                </span>
                <span className="text-[10px] font-mono text-text-muted capitalize">
                  Phase: {syncStep}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500 ${
                    syncStep === 'preparing'
                      ? 'w-1/3'
                      : syncStep === 'committing'
                      ? 'w-2/3'
                      : 'w-full'
                  }`}
                />
              </div>
            </div>
          )}

          {syncStep === 'done' && (
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>
                {t('cluster_sync_success')}
                {syncedNodesList.length > 0 && (
                  <span className="opacity-90 font-mono ms-1">
                    ({syncedNodesList.join(', ')})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-text-muted hover:text-text-main transition-colors disabled:opacity-40"
          >
            {t('btn_cancel')}
          </button>

          <button
            type="button"
            onClick={handleStartSync}
            disabled={isSyncing || activePeers.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-emerald-400 text-black font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{t('cluster_syncing')}</span>
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5" />
                <span>{t('cluster_btn_confirm_sync')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
export default ClusterSyncModal;
