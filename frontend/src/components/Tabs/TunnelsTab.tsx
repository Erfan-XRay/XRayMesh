import React, { useMemo, useState } from 'react';
import {
  TunnelsData,
  TunnelNodeState,
  TunnelType,
  HaproxyTunnel,
  IptablesTunnel,
  GostTunnel,
  RealmTunnel,
} from '../../types';
import { TunnelScope } from '../../hooks/useTunnels';
import { ArrowRight, Boxes, Cpu, Globe, History, Lock, Network, Pencil, Plus, RefreshCw, Search, Server, Trash2, Waypoints, X, Zap } from 'lucide-react';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { formatCount, localizeDigits } from '../../i18n/format';
import {
  btnSecondarySm,
  btnTonalSm,
  Callout,
  cardClass,
  EmptyState,
  iconBtnSm,
  inputClass,
  Pill,
  SectionHeader,
  Segmented,
  selectClass,
  StatusDot,
  Tone,
  toneSoft,
} from '../ui';

type AnyTunnel = HaproxyTunnel | IptablesTunnel | GostTunnel | RealmTunnel;

interface TunnelsTabProps {
  tunnels: TunnelsData;
  nodes: TunnelNodeState[];
  byNode: Record<string, TunnelsData>;
  scope: TunnelScope;
  onScopeChange: (scope: TunnelScope) => void;
  onRetryNode: (ip: string) => void;
  onRefresh: () => void;
  onOpenCreateRealm: () => void;
  onOpenEditRealm: (t: RealmTunnel) => void;
  onOpenCreateHaproxy: () => void;
  onOpenEditHaproxy: (t: HaproxyTunnel) => void;
  onOpenCreateIptables: () => void;
  onOpenEditIptables: (t: IptablesTunnel) => void;
  onOpenCreateGost: () => void;
  onOpenEditGost: (t: GostTunnel) => void;
  onDeleteTunnel: (type: TunnelType, name: string, originNode?: string) => void;
  t: Translate;
}

const protoLabel = (p?: string) => {
  const v = (p || 'both').toLowerCase();
  return v === 'both' || v === 'tcp,udp' ? 'TCP + UDP' : v.toUpperCase();
};

interface SectionConfig {
  type: TunnelType;
  icon: React.ReactNode;
  tone: Tone;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  newKey: TranslationKey;
  emptyKey: TranslationKey;
  emptyDescKey: TranslationKey;
  subtabKey: TranslationKey;
  protocol: (item: AnyTunnel) => string;
  details?: (item: AnyTunnel, t: Translate) => React.ReactNode;
}

const SECTIONS: SectionConfig[] = [
  {
    type: 'realm',
    icon: <Cpu className="w-[18px] h-[18px]" />,
    tone: 'success',
    titleKey: 'tunnels_realm_title',
    descKey: 'tunnels_realm_desc',
    newKey: 'tunnels_btn_new_realm',
    emptyKey: 'tunnels_empty_realm',
    emptyDescKey: 'tunnels_empty_realm_desc',
    subtabKey: 'tunnels_subtab_realm',
    protocol: (i) => protoLabel((i as RealmTunnel).PROTOCOL),
  },
  {
    type: 'haproxy',
    icon: <Network className="w-[18px] h-[18px]" />,
    tone: 'primary',
    titleKey: 'tunnels_haproxy_title',
    descKey: 'tunnels_haproxy_desc',
    newKey: 'tunnels_btn_new_haproxy',
    emptyKey: 'tunnels_empty_haproxy',
    emptyDescKey: 'tunnels_empty_haproxy_desc',
    subtabKey: 'tunnels_subtab_haproxy',
    protocol: () => 'TCP',
  },
  {
    type: 'iptables',
    icon: <Boxes className="w-[18px] h-[18px]" />,
    tone: 'info',
    titleKey: 'tunnels_iptables_title',
    descKey: 'tunnels_iptables_desc',
    newKey: 'tunnels_btn_new_iptables',
    emptyKey: 'tunnels_empty_iptables',
    emptyDescKey: 'tunnels_empty_iptables_desc',
    subtabKey: 'tunnels_subtab_iptables',
    protocol: (i) => protoLabel((i as IptablesTunnel).FORWARD_PROTOCOL || 'udp'),
    details: (i, t) => {
      const ipt = i as IptablesTunnel;
      return (
        <>
          <Meta label={t('tunnels_col_interface')} value={ipt.IN_IF || 'any'} />
          <Meta label={t('tunnels_col_source_cidr')} value={ipt.SOURCE_CIDR || '0.0.0.0/0'} />
        </>
      );
    },
  },
  {
    type: 'gost',
    icon: <Zap className="w-[18px] h-[18px]" />,
    tone: 'warning',
    titleKey: 'tunnels_gost_title',
    descKey: 'tunnels_gost_desc',
    newKey: 'tunnels_btn_new_gost',
    emptyKey: 'tunnels_empty_gost',
    emptyDescKey: 'tunnels_empty_gost_desc',
    subtabKey: 'tunnels_subtab_gost',
    protocol: (i) => protoLabel((i as GostTunnel).PROTOCOL),
  },
];

const Meta: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 min-w-0">
    <dt className="text-text-subtle shrink-0">{label}</dt>
    <dd className="font-mono text-text-secondary truncate" dir="ltr">
      {value}
    </dd>
  </div>
);

const isFailed = (n?: TunnelNodeState) => Boolean(n && n.status !== 'ok' && n.status !== 'idle');

function timeAgo(ts: number | null | undefined, t: Translate): string {
  if (!ts) return '';
  const sec = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (sec < 60) return formatText(t('tunnels_ago_seconds'), { n: formatCount(sec, t) });
  if (sec < 3600) return formatText(t('tunnels_ago_minutes'), { n: formatCount(Math.round(sec / 60), t) });
  return formatText(t('tunnels_ago_hours'), { n: formatCount(Math.round(sec / 3600), t) });
}

function countTunnels(d?: TunnelsData): number {
  if (!d) return 0;
  return (d.realm?.length || 0) + (d.haproxy?.length || 0) + (d.iptables?.length || 0) + (d.gost?.length || 0);
}

export const TunnelsTab: React.FC<TunnelsTabProps> = ({
  tunnels,
  nodes,
  byNode,
  scope,
  onScopeChange,
  onRetryNode,
  onRefresh,
  onOpenCreateRealm,
  onOpenEditRealm,
  onOpenCreateHaproxy,
  onOpenEditHaproxy,
  onOpenCreateIptables,
  onOpenEditIptables,
  onOpenCreateGost,
  onOpenEditGost,
  onDeleteTunnel,
  t,
}) => {
  const [filter, setFilter] = useState<'all' | TunnelType>('all');
  const [query, setQuery] = useState('');

  const handlers: Record<TunnelType, { create: () => void; edit: (item: any) => void }> = {
    realm: { create: onOpenCreateRealm, edit: onOpenEditRealm },
    haproxy: { create: onOpenCreateHaproxy, edit: onOpenEditHaproxy },
    iptables: { create: onOpenCreateIptables, edit: onOpenEditIptables },
    gost: { create: onOpenCreateGost, edit: onOpenEditGost },
  };

  const nodeByIp = useMemo(() => new Map(nodes.map((n) => [n.ip, n])), [nodes]);
  const localNode = nodes.find((n) => n.is_local);
  const remoteNodes = nodes.filter((n) => !n.is_local);
  const showOrigin = scope !== 'local';
  const pickedNode = scope !== 'local' && scope !== 'all' ? scope : '';
  const nodesInScope =
    scope === 'all' ? nodes : scope === 'local' ? (localNode ? [localNode] : []) : nodes.filter((n) => n.ip === scope);
  const failedInScope = nodesInScope.filter(isFailed);
  const anyLoading = nodesInScope.some((n) => n.loading);
  const initialLoading = nodesInScope.length === 0 || nodesInScope.every((n) => n.loading && !byNode[n.ip]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = {} as Record<TunnelType, AnyTunnel[]>;
    for (const s of SECTIONS) {
      const list = (tunnels[s.type] || []) as AnyTunnel[];
      out[s.type] = q
        ? list.filter((i) =>
            [i.TUNNEL_NAME, i.TARGET_IP, i.PORT_SPEC, i._node_name, i._node_ip]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
          )
        : list;
    }
    return out;
  }, [tunnels, query]);

  const totalCount = SECTIONS.reduce((sum, s) => sum + filtered[s.type].length, 0);

  const statusLabel = (n: TunnelNodeState) => {
    if (n.loading && !byNode[n.ip]) return t('tunnels_node_loading');
    if (n.status === 'ok') return n.latency_ms ? `${localizeDigits(n.latency_ms, t)} ms` : t('tunnels_node_ok');
    if (n.status === 'idle') return t('tunnels_node_idle');
    return t(`tunnels_node_error_${n.status}` as TranslationKey);
  };

  const nodeTone = (n: TunnelNodeState): Tone => {
    if (n.loading) return 'info';
    if (n.status === 'ok') return 'success';
    if (n.status === 'idle') return 'neutral';
    return n.stale ? 'warning' : 'danger';
  };

  const visibleSections = SECTIONS.filter((s) => filter === 'all' || filter === s.type).filter((s) => !query || filtered[s.type].length > 0);

  return (
    <div className="space-y-4">
      {/* Toolbar: where to look, what to find */}
      <div className={`${cardClass} p-3 flex flex-col lg:flex-row lg:items-center gap-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <Segmented
            value={scope === 'local' ? 'local' : scope === 'all' ? 'all' : 'node'}
            onChange={(v) => (v === 'node' ? undefined : onScopeChange(v))}
            ariaLabel={t('tunnels_scope_label')}
            block
            className="sm:w-auto"
            options={[
              { value: 'local', label: t('tunnels_scope_local'), icon: <Server className="w-4 h-4" /> },
              ...(remoteNodes.length > 0 ? [{ value: 'all' as const, label: t('tunnels_scope_all'), icon: <Globe className="w-4 h-4" /> }] : []),
            ]}
          />
          {remoteNodes.length > 0 && (
            <select
              value={pickedNode}
              onChange={(e) => e.target.value && onScopeChange(e.target.value)}
              aria-label={t('tunnels_scope_pick')}
              className={`${selectClass} sm:w-60 ${pickedNode ? 'border-primary text-primary' : ''}`}
            >
              <option value="">{t('tunnels_scope_pick')}</option>
              {remoteNodes.map((n) => (
                <option key={n.ip} value={n.ip}>
                  {n.name} ({n.ip}){isFailed(n) ? ` · ${t('tunnels_node_unreachable_short')}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2 lg:ms-auto">
          <div className="relative flex-1 lg:w-72" role="search">
            <Search className="w-4 h-4 text-text-subtle absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tunnels_search_placeholder')}
              aria-label={t('tunnels_search_placeholder')}
              className={`${inputClass()} ps-9 pe-9`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('btn_clear_search')}
                className="absolute end-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-lg text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <button type="button" onClick={onRefresh} disabled={anyLoading} className={`${btnSecondarySm} min-h-10 rounded-xl px-3`}>
            <RefreshCw className={`w-4 h-4 ${anyLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">{t('btn_refresh')}</span>
            <span className="sr-only sm:hidden">{t('btn_refresh')}</span>
          </button>
        </div>
      </div>

      {/* Node health (only when looking beyond this node) */}
      {scope !== 'local' && nodesInScope.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2" aria-label={t('tunnels_nodes_label')}>
          {nodesInScope.map((n) => {
            const failed = isFailed(n);
            const tone = nodeTone(n);
            return (
              <li
                key={n.ip}
                className={`flex items-center gap-3 p-2.5 ps-3 rounded-xl border bg-card transition-colors ${
                  failed ? (n.stale ? 'border-warning-border' : 'border-danger-border') : pickedNode === n.ip ? 'border-primary' : 'border-card-border'
                }`}
              >
                <StatusDot tone={tone} pulse={n.loading} />
                <button type="button" onClick={() => onScopeChange(n.ip)} className="min-w-0 flex-1 text-start cursor-pointer" title={n.error || undefined}>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary truncate">
                    <span className="truncate" dir="auto">
                      {n.name}
                    </span>
                    {n.is_local && <span className="text-2xs font-normal text-text-subtle shrink-0">({t('tunnels_scope_local')})</span>}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-text-muted truncate">
                    <span className="font-mono" dir="ltr">
                      {n.ip}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatText(t('tunnels_count'), { n: formatCount(countTunnels(byNode[n.ip]), t) })}</span>
                    <span aria-hidden="true">·</span>
                    <span className={failed ? (n.stale ? 'text-warning' : 'text-danger') : ''}>{statusLabel(n)}</span>
                    {failed && n.stale && <span className="text-text-subtle">· {timeAgo(n.fetched_at, t)}</span>}
                  </span>
                </button>
                {failed && (
                  <button type="button" onClick={() => onRetryNode(n.ip)} disabled={n.loading} className={btnSecondarySm}>
                    <RefreshCw className={`w-3.5 h-3.5 ${n.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {t('tunnels_retry')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {failedInScope.length > 0 && (
        <Callout tone="warning" role="status">
          {formatText(t('tunnels_nodes_failed_banner'), { n: formatCount(failedInScope.length, t) })}
        </Callout>
      )}

      {/* Engine filter */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap" role="group" aria-label={t('tunnels_filter_label')}>
        {[{ id: 'all' as const, label: t('tunnels_subtab_all'), count: totalCount, tone: 'primary' as Tone }, ...SECTIONS.map((s) => ({ id: s.type, label: t(s.subtabKey), count: filtered[s.type].length, tone: s.tone }))].map(
          (f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-2 h-9 px-3 rounded-full border text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active ? toneSoft(f.tone) : 'border-card-border bg-card text-text-muted hover:text-text-primary hover:border-border-strong'
                }`}
              >
                {f.label}
                <span className={`text-xs tabular-nums ${active ? '' : 'text-text-subtle'}`}>{formatCount(f.count, t)}</span>
              </button>
            );
          }
        )}
      </div>

      {initialLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true" aria-label={t('tunnels_loading')}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-2xl skeleton" />
          ))}
        </div>
      ) : query && totalCount === 0 ? (
        <EmptyState icon={<Search className="w-5 h-5" />} title={t('tunnels_no_results')} />
      ) : (
        visibleSections.map((s) => {
          const items = filtered[s.type];
          const compactEmpty = filter === 'all';
          return (
            <section key={s.type} aria-labelledby={`tunnels-${s.type}`} className={`${cardClass} p-4 sm:p-5`}>
              <SectionHeader
                id={`tunnels-${s.type}`}
                as="h3"
                title={
                  <span className="inline-flex items-center gap-2">
                    {t(s.titleKey)}
                    <span className="text-sm font-medium text-text-subtle tabular-nums">{formatCount(items.length, t)}</span>
                  </span>
                }
                description={<span className="hidden sm:inline">{t(s.descKey)}</span>}
                icon={s.icon}
                iconClassName={`border ${toneSoft(s.tone)}`}
                actions={
                  <button type="button" onClick={handlers[s.type].create} className={btnTonalSm}>
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    {t(s.newKey)}
                  </button>
                }
                className="mb-4"
              />

              {items.length === 0 ? (
                compactEmpty ? (
                  <p className="px-3.5 py-3 rounded-xl border border-dashed border-card-border text-sm text-text-subtle">{t(s.emptyKey)}</p>
                ) : (
                  <EmptyState
                    icon={<Waypoints className="w-5 h-5" />}
                    title={t(s.emptyKey)}
                    description={t(s.emptyDescKey)}
                    action={
                      <button type="button" onClick={handlers[s.type].create} className={btnTonalSm}>
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        {t(s.newKey)}
                      </button>
                    }
                  />
                )
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map((item) => {
                    const node = item._node_ip ? nodeByIp.get(item._node_ip) : undefined;
                    const readOnly = !item._is_local && isFailed(node);
                    return (
                      <li
                        key={`${item._node_ip || 'local'}:${item.TUNNEL_NAME}`}
                        className={`group flex flex-col gap-3 p-3.5 rounded-xl border border-card-border bg-surface transition-colors hover:border-border-strong ${
                          readOnly ? 'opacity-75' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-semibold text-text-primary truncate" dir="ltr">
                              {item.TUNNEL_NAME}
                            </p>
                            {showOrigin && item._node_name && (
                              <p className="flex items-center gap-1 mt-0.5 text-xs text-text-muted min-w-0">
                                <Server className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span className="truncate" dir="auto">
                                  {item._node_name}
                                </span>
                              </p>
                            )}
                          </div>
                          {readOnly ? (
                            <span className="inline-flex items-center gap-1 text-xs text-text-subtle" title={t('tunnels_readonly_hint')}>
                              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                            </span>
                          ) : (
                            <div className="flex items-center -me-1.5 -mt-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handlers[s.type].edit(item)}
                                aria-label={formatText(t('tunnels_edit_label'), { name: item.TUNNEL_NAME })}
                                title={t('btn_edit')}
                                className={iconBtnSm}
                              >
                                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteTunnel(s.type, item.TUNNEL_NAME, item._node_ip)}
                                aria-label={formatText(t('tunnels_delete_label'), { name: item.TUNNEL_NAME })}
                                title={t('btn_delete')}
                                className={`${iconBtnSm} hover:text-danger hover:bg-danger-subtle`}
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Route: listen ports on the origin → destination in the mesh */}
                        <div dir="ltr" className="flex items-center gap-2 min-w-0 px-3 py-2 rounded-lg bg-card border border-card-border font-mono text-xs">
                          <span className="text-text-primary font-medium truncate" title={t('tunnels_col_ports')}>
                            :{item.PORT_SPEC}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
                          <span className="text-text-secondary truncate" title={t('tunnels_col_destination')}>
                            {item.TARGET_IP || '—'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Pill tone={s.tone} mono>
                            {s.protocol(item)}
                          </Pill>
                          {readOnly && node?.stale && (
                            <Pill tone="warning" icon={<History className="w-3 h-3" aria-hidden="true" />} title={timeAgo(node.fetched_at, t)}>
                              {t('tunnels_node_stale')}
                            </Pill>
                          )}
                        </div>

                        {s.details && <dl className="space-y-1 text-xs pt-2 border-t border-card-border">{s.details(item, t)}</dl>}

                        {readOnly && <p className="text-xs text-text-subtle">{t('tunnels_readonly_hint')}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
};
