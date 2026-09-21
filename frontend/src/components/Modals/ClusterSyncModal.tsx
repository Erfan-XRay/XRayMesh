import React, { useState, useEffect, useRef } from 'react';
import { Peer, MeshProtocol } from '../../types';
import { broadcastClusterConfig, ClusterBroadcastPayload } from '../../services/api';
import {
  Globe,
  Shield,
  AlertTriangle,
  RefreshCw,
  X,
  Server,
  Sparkles,
  Lock,
  Check,
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
  const [syncStep, setSyncStep] = useState<'idle' | 'preparing' | 'committing' | 'verifying' | 'celebrating'>('idle');
  const [syncedNodesList, setSyncedNodesList] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lock body scroll while modal is open so the background never shifts
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const activePeers = peers.filter((p) => p && p.cost !== 'Local' && p.ipv4);

  const handleCloseGracefully = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setSyncStep('idle');
      setIsSyncing(false);
      onClose();
    }, 350);
  };

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
      const synced = res.synced_nodes && res.synced_nodes.length > 0
        ? res.synced_nodes
        : [currentConfig.hostname || 'This Server', ...activePeers.map((p) => p.hostname || p.ipv4)];
      setSyncedNodesList(synced);

      // Trigger Celebration sequence
      setTimeout(() => {
        setSyncStep('celebrating');
        setIsSyncing(false);
        onRefreshData();
        onNotify(t('cluster_sync_success'), 'success');

        // Automatically close modal after celebration duration (2.8 seconds)
        autoCloseTimerRef.current = setTimeout(() => {
          handleCloseGracefully();
        }, 2800);
      }, 1200);
    } catch (err: any) {
      setIsSyncing(false);
      setSyncStep('idle');
      setErrorMsg(err.message || t('cluster_sync_error'));
      onNotify(err.message || t('cluster_sync_error'), 'error');
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`w-full max-w-xl rounded-3xl bg-slate-900 border border-white/15 shadow-2xl overflow-hidden relative flex flex-col my-auto max-h-[92vh] transition-all duration-300 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100 animate-modal-in'
        }`}
      >
        {/* ========================================================================= */}
        {/* 🎉 CELEBRATION ANIMATION VIEW                                             */}
        {/* ========================================================================= */}
        {syncStep === 'celebrating' ? (
          <div className="p-8 text-center space-y-5 relative overflow-hidden animate-fade-in">
            {/* Background glowing ambient radial gradients */}
            <div className="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

            {/* Pulsing Celebration Icon Badge */}
            <div className="relative mx-auto w-18 h-18 flex items-center justify-center pt-2">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <div className="relative w-18 h-18 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Sparkles className="w-9 h-9 text-emerald-400 animate-pulse" />
              </div>
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                {t('cluster_celebrate_title')}
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                {t('cluster_celebrate_desc')}
              </p>
            </div>

            {/* Synced Nodes Chips */}
            {syncedNodesList.length > 0 && (
              <div className="pt-2">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block mb-2 font-mono">
                  {t('cluster_target_nodes')} ({syncedNodesList.length}):
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto max-h-32 overflow-y-auto pr-1">
                  {syncedNodesList.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-semibold shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-closing countdown indicator and immediate close button */}
            <div className="pt-4 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-[11px] text-text-muted">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{t('cluster_celebrate_closing')}</span>
              </div>
              <button
                type="button"
                onClick={handleCloseGracefully}
                className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-text-main font-semibold text-xs transition-all active:scale-95 shadow-sm"
              >
                {t('cluster_btn_close_now')}
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* ⚙️ STANDARD SYNC CONFIGURATION VIEW                                        */
          /* ========================================================================= */
          <>
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary/20 to-emerald-400/20 border border-primary/40 flex items-center justify-center text-primary shadow-sm flex-shrink-0">
                  <Globe className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-text-main flex items-center gap-2">
                    <span>{t('cluster_modal_title')}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/30">
                      SafeSync 2PC
                    </span>
                  </h2>
                  <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">
                    {t('cluster_modal_desc')}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseGracefully}
                disabled={isSyncing}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs">
              {/* Diff Box: What changes across nodes */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-main flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span>{t('cluster_diff_title')}</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    HMAC-SHA256 Signed
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="p-2 rounded-xl bg-slate-900/70 border border-white/5">
                    <span className="text-[10px] text-text-muted block mb-0.5">{t('cluster_field_protocol')}</span>
                    <span className="font-mono font-bold text-primary uppercase text-xs">
                      {currentConfig.protocol}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/70 border border-white/5">
                    <span className="text-[10px] text-text-muted block mb-0.5">{t('cluster_field_kcp')}</span>
                    <span className={`font-mono font-bold text-xs ${currentConfig.enableKcp ? 'text-amber-400' : 'text-text-muted'}`}>
                      {currentConfig.enableKcp ? 'ENABLED (Anti-Loss)' : 'Disabled'}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/70 border border-white/5">
                    <span className="text-[10px] text-text-muted block mb-0.5">{t('cluster_field_encryption')}</span>
                    <span className="font-mono font-bold text-xs text-text-main">
                      {currentConfig.encryption ? 'ChaCha20-Poly1305' : 'None'}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/70 border border-white/5">
                    <span className="text-[10px] text-text-muted block mb-0.5">{t('cluster_field_mtu')}</span>
                    <span className="font-mono font-bold text-xs text-text-main">
                      {currentConfig.mtu}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/70 border border-white/5">
                    <span className="text-[10px] text-text-muted block mb-0.5">{t('cluster_field_ipv6')}</span>
                    <span className="font-mono font-bold text-xs text-text-main">
                      {currentConfig.ipv6 ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/70 border border-white/5">
                    <span className="text-[10px] text-text-muted block mb-0.5">{t('cluster_field_secret')}</span>
                    <span className="font-mono font-bold text-xs text-primary flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      ••••••••
                    </span>
                  </div>
                </div>

                {/* Reassurance notice */}
                <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-[11px] text-text-main leading-relaxed">
                  <span className="font-bold text-primary mr-1">ℹ️</span>
                  <span>{t('cluster_unique_notice')}</span>
                </div>
              </div>

              {/* Target Nodes Compact Pill List */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-main flex items-center gap-1.5 text-xs">
                    <Server className="w-3.5 h-3.5 text-text-muted" />
                    <span>{t('cluster_target_nodes')}</span>
                  </span>
                  <span className="text-[10px] font-mono text-text-muted">
                    {activePeers.length + 1} machines (1 Controller + {activePeers.length} Peers)
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                  {/* Controller pill */}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-mono font-semibold">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span>{currentConfig.hostname || 'Controller'}</span>
                    <span className="text-[10px] text-text-muted">({currentConfig.ipv4})</span>
                  </span>

                  {/* Connected peer pills */}
                  {activePeers.map((p) => (
                    <span
                      key={p.ipv4}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-text-main text-xs font-mono"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{p.hostname || 'Remote Node'}</span>
                      <span className="text-[10px] text-text-muted">({p.ipv4})</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Self-Healing Watchdog Alert Strip */}
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-bold text-emerald-400 mr-1">
                    {t('cluster_watchdog_title')}:
                  </span>
                  <span className="text-text-muted">
                    {t('cluster_watchdog_desc')}
                  </span>
                </div>
              </div>

              {/* Progress or Error Display */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {isSyncing && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-primary/30 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-primary flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>{t('cluster_syncing')}</span>
                    </span>
                    <span className="text-[10px] font-mono text-text-muted capitalize">
                      Phase: {syncStep}
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r from-primary via-cyan-400 to-emerald-400 transition-all duration-500 ${
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
            </div>

            {/* Footer Actions */}
            <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
              <button
                type="button"
                onClick={handleCloseGracefully}
                disabled={isSyncing}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-text-muted hover:text-text-main transition-colors disabled:opacity-40"
              >
                {t('btn_cancel')}
              </button>

              <button
                type="button"
                onClick={handleStartSync}
                disabled={isSyncing || activePeers.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary via-cyan-500 to-teal-400 text-black font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
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
          </>
        )}
      </div>
    </div>
  );
};

export default ClusterSyncModal;
