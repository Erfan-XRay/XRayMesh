import React, { useMemo, useState } from 'react';
import { Check, Search, Server, X } from 'lucide-react';
import { formatCount } from '../../i18n/format';
import { Peer } from '../../types';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { fillTemplate, formatText } from '../../i18n/fillTemplate';
import { NodeActionError, setNodeUpdateChannel } from '../../services/api';
import { UpdateRun } from '../../hooks/useNodeUpdates';
import { cardClass, EmptyState, inputClass, SectionHeader, Segmented } from '../ui';
import { ConfirmModal } from '../Modals/ConfirmModal';
import { PEER_GRID, PeerRow } from '../Peers/PeerRow';
import { ThisServerCard } from '../Peers/ThisServerCard';
import { CHANNEL_TEXT, channelOf, isLegacyPeer, updateErrorText, versionLabel } from '../Peers/peerDisplay';

type Filter = 'all' | 'updates' | 'relayed';

interface PeersTabProps {
  peers: Peer[];
  updateRuns: Record<string, UpdateRun>;
  onStartUpdate: (peer: Peer) => void;
  onDismissUpdate: (ip: string) => void;
  /** Silent dashboard refresh after a channel change. */
  onRefresh: () => void;
  onQuickPing: (ip: string) => void;
  onQuickSpeedtest: (ip: string) => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
}

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2 text-sm text-text-muted leading-relaxed">
    <Check className="w-4 h-4 mt-[0.2em] shrink-0 text-success" aria-hidden="true" />
    <span>{children}</span>
  </li>
);

export const PeersTab: React.FC<PeersTabProps> = ({
  peers,
  updateRuns,
  onStartUpdate,
  onDismissUpdate,
  onRefresh,
  onQuickPing,
  onQuickSpeedtest,
  onNotify,
  onCopy,
  copiedKey,
  t,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingUpdate, setPendingUpdate] = useState<Peer | null>(null);
  const [pendingChannel, setPendingChannel] = useState<Peer | null>(null);
  const [channelBusy, setChannelBusy] = useState(false);

  const current = peers.find((p) => p.is_current);
  const others = useMemo(
    () => peers.filter((p) => !p.is_current).sort((a, b) => (a.hostname || a.ipv4).localeCompare(b.hostname || b.ipv4)),
    [peers]
  );
  const counts = {
    all: others.length,
    updates: others.filter((p) => p.update_available).length,
    relayed: others.filter((p) => p.connection === 'relay').length,
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return others.filter((p) => {
      if (filter === 'updates' && !p.update_available) return false;
      if (filter === 'relayed' && p.connection !== 'relay') return false;
      if (!q) return true;
      return [p.ipv4, p.hostname, p.tunnel_proto].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [others, search, filter]);

  const filters: { id: Filter; label: TranslationKey }[] = [
    { id: 'all', label: 'peers_filter_all' },
    ...(counts.updates > 0 ? [{ id: 'updates' as Filter, label: 'peers_filter_updates' as TranslationKey }] : []),
    ...(counts.relayed > 0 ? [{ id: 'relayed' as Filter, label: 'peers_filter_relayed' as TranslationKey }] : []),
  ];
  const activeFilter = filters.some((f) => f.id === filter) ? filter : 'all';

  const confirmUpdate = () => {
    if (pendingUpdate) onStartUpdate(pendingUpdate);
    setPendingUpdate(null);
  };

  const confirmChannel = async () => {
    if (!pendingChannel) return;
    const peer = pendingChannel;
    const next = channelOf(peer) === 'beta' ? 'stable' : 'beta';
    const host = peer.hostname || peer.ipv4;
    setChannelBusy(true);
    try {
      await setNodeUpdateChannel(peer.ipv4, next);
      onNotify(formatText(t('channel_changed'), { host, channel: t(CHANNEL_TEXT[next]) }), 'success');
      onRefresh();
    } catch (err) {
      onNotify(updateErrorText(err instanceof NodeActionError ? err.code : 'unreachable', host, t), 'error');
    } finally {
      setChannelBusy(false);
      setPendingChannel(null);
    }
  };

  const rowHandlers = {
    onUpdate: setPendingUpdate,
    onDismissUpdate,
    onChangeChannel: setPendingChannel,
    onCopy,
    copiedKey,
    t,
  };

  const updateHost = pendingUpdate ? pendingUpdate.hostname || pendingUpdate.ipv4 : '';
  const channelHost = pendingChannel ? pendingChannel.hostname || pendingChannel.ipv4 : '';
  const enablingBeta = pendingChannel ? channelOf(pendingChannel) !== 'beta' : false;

  return (
    <div className="space-y-4">
      {current && (
        <ThisServerCard peer={current} run={updateRuns[current.ipv4]} channelBusy={channelBusy} {...rowHandlers} />
      )}

      <section aria-labelledby="peers-heading" className={`${cardClass} overflow-hidden`}>
        <header className="p-4 sm:p-5 space-y-4">
          <SectionHeader id="peers-heading" title={t('peers_heading')} description={t('peers_subheading')} />
          {others.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1" role="search">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('peers_search_hint')}
                  aria-label={t('peers_search_label')}
                  className={`${inputClass()} ps-9 pe-9`}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label={t('btn_clear_search')}
                    className="absolute end-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-lg text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              {filters.length > 1 && (
                <Segmented
                  size="sm"
                  value={activeFilter}
                  onChange={setFilter}
                  ariaLabel={t('peers_filter_label')}
                  className="self-start"
                  options={filters.map(({ id, label }) => ({ value: id, label: t(label), count: formatCount(counts[id], t) }))}
                />
              )}
            </div>
          )}
        </header>

        {others.length === 0 ? (
          <div className="px-4 pb-5 sm:px-5">
            <EmptyState icon={<Server className="w-5 h-5" />} title={t('peers_none_title')} description={t('peers_none')} />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 pb-5 sm:px-5">
            <EmptyState compact icon={<Search className="w-5 h-5" />} title={t('peers_no_results')} />
          </div>
        ) : (
          <>
            <div className={`hidden ${PEER_GRID} px-5 py-2.5 border-y border-card-border bg-surface text-xs font-medium text-text-muted`} aria-hidden="true">
              <span>{t('peers_col_server')}</span>
              <span>{t('peers_col_connection')}</span>
              <span>{t('peers_col_latency')}</span>
              <span>{t('peers_col_traffic')}</span>
              <span>{t('peers_col_version')}</span>
              <span />
            </div>
            <ul className="divide-y divide-card-border border-t border-card-border lg:border-t-0">
              {visible.map((peer) => (
                <PeerRow
                  key={peer.ipv4}
                  peer={peer}
                  run={updateRuns[peer.ipv4]}
                  onPing={onQuickPing}
                  onSpeedtest={onQuickSpeedtest}
                  {...rowHandlers}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <ConfirmModal
        isOpen={Boolean(pendingUpdate)}
        tone="primary"
        title={fillTemplate(t('update_confirm_title'), {
          host: <bdi>{updateHost}</bdi>,
          version: <bdi dir="ltr">{pendingUpdate?.latest_version}</bdi>,
        })}
        description={fillTemplate(t('update_confirm_desc'), {
          from: <bdi dir="ltr">{pendingUpdate ? versionLabel(pendingUpdate) : ''}</bdi>,
          channel: pendingUpdate ? t(CHANNEL_TEXT[channelOf(pendingUpdate)]) : '',
        })}
        confirmLabel={t('update_confirm_btn')}
        cancelLabel={t('btn_cancel')}
        onConfirm={confirmUpdate}
        onCancel={() => setPendingUpdate(null)}
      >
        <ul className="space-y-2">
          {pendingUpdate && isLegacyPeer(pendingUpdate) ? (
            <li className="text-sm text-warning leading-relaxed">{t('update_point_legacy')}</li>
          ) : (
            <>
              <Bullet>{t('update_point_verify')}</Bullet>
              <Bullet>{t('update_point_rollback')}</Bullet>
            </>
          )}
          <Bullet>{t('update_point_restart')}</Bullet>
          {pendingUpdate?.is_current && <Bullet>{t('update_point_local')}</Bullet>}
        </ul>
      </ConfirmModal>

      <ConfirmModal
        isOpen={Boolean(pendingChannel)}
        tone={enablingBeta ? 'warning' : 'primary'}
        busy={channelBusy}
        title={fillTemplate(t(enablingBeta ? 'channel_beta_title' : 'channel_stable_title'), { host: <bdi>{channelHost}</bdi> })}
        description={
          enablingBeta
            ? t('channel_beta_desc')
            : fillTemplate(t('channel_stable_desc'), { version: <bdi dir="ltr">{pendingChannel ? versionLabel(pendingChannel) : ''}</bdi> })
        }
        confirmLabel={t(enablingBeta ? 'channel_beta_confirm' : 'channel_stable_confirm')}
        cancelLabel={t('btn_cancel')}
        onConfirm={confirmChannel}
        onCancel={() => setPendingChannel(null)}
      >
        {enablingBeta && (
          <ul className="space-y-2">
            <Bullet>{t('channel_beta_point_checks')}</Bullet>
            <Bullet>{t('channel_beta_point_manual')}</Bullet>
          </ul>
        )}
      </ConfirmModal>
    </div>
  );
};
