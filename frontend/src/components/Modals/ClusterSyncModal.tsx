import React, { useState, useEffect, useRef } from 'react';
import { Peer, MeshProtocol } from '../../types';
import { broadcastClusterConfig, ClusterBroadcastPayload } from '../../services/api';
import { Check, CheckCircle2, Globe, Loader2, Lock, Server, ShieldCheck } from 'lucide-react';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { formatCount } from '../../i18n/format';
import { PROTOCOL_TEXT } from '../NodeConfig/FormControls';
import { btnPrimary, btnSecondary, Callout, Pill } from '../ui';
import { ModalClose, ModalShell } from './ModalShell';

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
  t: Translate;
}

type SyncStep = 'idle' | 'preparing' | 'committing' | 'verifying' | 'celebrating';

const STEPS: { id: Exclude<SyncStep, 'idle' | 'celebrating'>; label: 'cluster_status_prepared' | 'cluster_status_committed' | 'cluster_status_reconnected' }[] = [
  { id: 'preparing', label: 'cluster_status_prepared' },
  { id: 'committing', label: 'cluster_status_committed' },
  { id: 'verifying', label: 'cluster_status_reconnected' },
];

const Setting: React.FC<{ label: string; children: React.ReactNode; highlight?: boolean }> = ({ label, children, highlight }) => (
  <div className="flex items-center justify-between gap-3 py-2 min-w-0">
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className={`text-sm font-medium truncate ${highlight ? 'text-primary' : 'text-text-primary'}`}>{children}</dd>
  </div>
);

export const ClusterSyncModal: React.FC<ClusterSyncModalProps> = ({ isOpen, onClose, peers = [], currentConfig, onNotify, onRefreshData, t }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<SyncStep>('idle');
  const [syncedNodesList, setSyncedNodesList] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const peerList = Array.isArray(peers) ? peers : [];
  const activePeers = peerList.filter((p) => p && p.cost !== 'Local' && p.ipv4 && !p.is_current);

  const handleCloseGracefully = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setSyncStep('idle');
    setIsSyncing(false);
    setErrorMsg(null);
    onClose();
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
      const synced =
        res.synced_nodes && res.synced_nodes.length > 0
          ? res.synced_nodes
          : [currentConfig.hostname || currentConfig.ipv4, ...activePeers.map((p) => p.hostname || p.ipv4)];
      setSyncedNodesList(synced);

      // Brief pause on the last step so the progress is readable, then the success view.
      setTimeout(() => {
        setSyncStep('celebrating');
        setIsSyncing(false);
        onRefreshData();
        onNotify(t('cluster_sync_success'), 'success');
        autoCloseTimerRef.current = setTimeout(handleCloseGracefully, 2800);
      }, 1200);
    } catch (err: any) {
      setIsSyncing(false);
      setSyncStep('idle');
      setErrorMsg(err.message || t('cluster_sync_error'));
      onNotify(err.message || t('cluster_sync_error'), 'error');
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === syncStep);
  const onOff = (on: boolean) => (on ? t('state_on') : t('state_off'));

  return (
    <ModalShell isOpen={isOpen} onClose={handleCloseGracefully} closable={!isSyncing} labelledBy="cluster-sync-title" maxWidth="sm:max-w-xl">
      {syncStep === 'celebrating' ? (
        <div className="py-4 flex flex-col items-center text-center gap-4 animate-fade-in" role="status">
          <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-success-subtle text-success" aria-hidden="true">
            <CheckCircle2 className="w-7 h-7" />
          </span>
          <div className="space-y-1.5 max-w-sm">
            <h2 id="cluster-sync-title" className="text-lg font-semibold text-text-primary">
              {t('cluster_celebrate_title')}
            </h2>
            <p className="text-sm text-text-muted leading-relaxed">{t('cluster_celebrate_desc')}</p>
          </div>

          {syncedNodesList.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-1.5 max-h-32 overflow-y-auto" aria-label={t('cluster_target_nodes')}>
              {syncedNodesList.map((name) => (
                <li key={name}>
                  <Pill tone="success" icon={<Check className="w-3.5 h-3.5" aria-hidden="true" />}>
                    <bdi>{name}</bdi>
                  </Pill>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-text-subtle">{t('cluster_celebrate_closing')}</p>
          <button type="button" onClick={handleCloseGracefully} className={btnSecondary}>
            {t('cluster_btn_close_now')}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <header className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-primary-subtle text-primary" aria-hidden="true">
                <Globe className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h2 id="cluster-sync-title" className="text-lg font-semibold text-text-primary leading-snug">
                  {t('cluster_modal_title')}
                </h2>
                <p className="mt-0.5 text-sm text-text-muted leading-relaxed">{t('cluster_modal_desc')}</p>
              </div>
            </div>
            <ModalClose onClick={handleCloseGracefully} label={t('btn_cancel')} disabled={isSyncing} />
          </header>

          {/* What is broadcast */}
          <section aria-labelledby="cluster-diff" className="rounded-xl border border-card-border overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-surface border-b border-card-border">
              <h3 id="cluster-diff" className="text-sm font-semibold text-text-primary">
                {t('cluster_diff_title')}
              </h3>
              <Pill tone="success" icon={<ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />}>
                {t('cluster_signed')}
              </Pill>
            </div>
            <dl className="px-4 divide-y divide-card-border">
              <Setting label={t('cluster_field_protocol')} highlight>
                {t(PROTOCOL_TEXT[currentConfig.protocol]?.[0] ?? 'proto_dual')}
              </Setting>
              <Setting label={t('cluster_field_kcp')}>{onOff(currentConfig.enableKcp)}</Setting>
              <Setting label={t('cluster_field_encryption')}>
                {currentConfig.encryption ? (
                  <span className="font-mono" dir="ltr">
                    ChaCha20-Poly1305
                  </span>
                ) : (
                  t('state_off')
                )}
              </Setting>
              <Setting label={t('cluster_field_ipv6')}>{onOff(currentConfig.ipv6)}</Setting>
              <Setting label={t('cluster_field_mtu')}>
                <span className="font-mono" dir="ltr">
                  {currentConfig.mtu}
                </span>
              </Setting>
              <Setting label={t('cluster_field_secret')}>
                <span className="inline-flex items-center gap-1.5 font-mono text-text-muted" dir="ltr">
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  ••••••••
                </span>
              </Setting>
            </dl>
          </section>

          <p className="text-xs text-text-muted leading-relaxed">{t('cluster_unique_notice')}</p>

          {/* Who receives it */}
          <section aria-labelledby="cluster-targets" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="cluster-targets" className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <Server className="w-4 h-4 text-text-subtle" aria-hidden="true" />
                {t('cluster_target_nodes')}
              </h3>
              <span className="text-xs text-text-muted">
                {formatText(t('cluster_target_count'), { n: formatCount(activePeers.length + 1, t) })}
              </span>
            </div>
            <ul className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              <li>
                <Pill tone="primary" dot>
                  <bdi>{currentConfig.hostname || currentConfig.ipv4}</bdi>
                  <span className="text-2xs opacity-80">{t('route_this_server')}</span>
                </Pill>
              </li>
              {activePeers.map((p) => (
                <li key={p.ipv4}>
                  <Pill>
                    <bdi className="text-text-primary">{p.hostname || p.ipv4}</bdi>
                    <span className="font-mono text-2xs" dir="ltr">
                      {p.ipv4}
                    </span>
                  </Pill>
                </li>
              ))}
            </ul>
          </section>

          <Callout tone="success" icon={<ShieldCheck className="w-4 h-4" />} title={t('cluster_watchdog_title')}>
            {t('cluster_watchdog_desc')}
          </Callout>

          {activePeers.length === 0 && <Callout tone="warning">{t('cluster_no_peers')}</Callout>}

          {errorMsg && (
            <Callout tone="danger" role="alert">
              {errorMsg}
            </Callout>
          )}

          {isSyncing && stepIndex >= 0 && (
            <ol className="grid grid-cols-3 gap-2 animate-fade-in" aria-live="polite" aria-label={t('cluster_syncing')}>
              {STEPS.map((s, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <li key={s.id} className="flex flex-col gap-1.5">
                    <span className={`h-1.5 rounded-full transition-colors duration-500 ${done ? 'bg-success' : active ? 'bg-primary animate-pulse-dot' : 'bg-surface'}`} />
                    <span className={`text-2xs leading-snug ${done ? 'text-success' : active ? 'text-text-primary font-medium' : 'text-text-subtle'}`}>{t(s.label)}</span>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="grid grid-cols-1 sm:flex sm:justify-end gap-2 pt-4 border-t border-card-border">
            <button type="button" onClick={handleStartSync} disabled={isSyncing || activePeers.length === 0} className={`${btnPrimary} sm:order-last`}>
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Globe className="w-4 h-4" aria-hidden="true" />}
              <span>{isSyncing ? t('cluster_syncing') : t('cluster_btn_confirm_sync')}</span>
            </button>
            <button type="button" onClick={handleCloseGracefully} disabled={isSyncing} className={btnSecondary}>
              {t('btn_cancel')}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

export default ClusterSyncModal;
