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
import {
  Network,
  Plus,
  RefreshCw,
  Trash2,
  Edit3,
  Cpu,
  Zap,
  Server,
  Search,
  AlertTriangle,
  Globe,
  Lock,
  History,
} from 'lucide-react';

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
  t: (key: any) => string;
}

// Full class strings so Tailwind can see them.
const ACCENTS = {
  emerald: {
    text: 'text-emerald-400',
    soft: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    button: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/30',
    pill: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    bar: 'bg-emerald-400',
  },
  primary: {
    text: 'text-primary',
    soft: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
    button: 'bg-primary/15 text-primary hover:bg-primary/25 border-primary/30',
    pill: 'bg-primary/20 text-primary border-primary/30',
    bar: 'bg-primary',
  },
  amber: {
    text: 'text-amber-400',
    soft: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    button: 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border-amber-500/30',
    pill: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    bar: 'bg-amber-400',
  },
} as const;

interface SectionConfig {
  type: TunnelType;
  icon: React.ReactNode;
  accent: keyof typeof ACCENTS;
  titleKey: string;
  descKey: string;
  newKey: string;
  emptyKey: string;
  emptyDescKey: string;
  subtabKey: string;
  badge: (item: AnyTunnel) => string;
  details: (item: AnyTunnel, t: (key: any) => string) => React.ReactNode;
}

const SECTIONS: SectionConfig[] = [
  {
    type: 'realm',
    icon: <Cpu className="w-4 h-4 text-emerald-400" />,
    accent: 'emerald',
    titleKey: 'tunnels_realm_title',
    descKey: 'tunnels_realm_desc',
    newKey: 'tunnels_btn_new_realm',
    emptyKey: 'tunnels_empty_realm',
    emptyDescKey: 'tunnels_empty_realm_desc',
    subtabKey: 'tunnels_subtab_realm',
    badge: (i) => `${((i as RealmTunnel).PROTOCOL || 'both').toUpperCase()} Relay`,
    details: (i, t) => (
      <span>
        {t('tunnels_col_protocol')}: {((i as RealmTunnel).PROTOCOL || 'both').toUpperCase()}
      </span>
    ),
  },
  {
    type: 'haproxy',
    icon: <Network className="w-4 h-4 text-primary" />,
    accent: 'primary',
    titleKey: 'tunnels_haproxy_title',
    descKey: 'tunnels_haproxy_desc',
    newKey: 'tunnels_btn_new_haproxy',
    emptyKey: 'tunnels_empty_haproxy',
    emptyDescKey: 'tunnels_empty_haproxy_desc',
    subtabKey: 'tunnels_subtab_haproxy',
    badge: () => 'TCP Proxy',
    details: () => null,
  },
  {
    type: 'iptables',
    icon: <Cpu className="w-4 h-4 text-emerald-400" />,
    accent: 'emerald',
    titleKey: 'tunnels_iptables_title',
    descKey: 'tunnels_iptables_desc',
    newKey: 'tunnels_btn_new_iptables',
    emptyKey: 'tunnels_empty_iptables',
    emptyDescKey: 'tunnels_empty_iptables_desc',
    subtabKey: 'tunnels_subtab_iptables',
    badge: (i) => `${((i as IptablesTunnel).FORWARD_PROTOCOL || 'udp').toUpperCase()} DNAT`,
    details: (i, t) => {
      const ipt = i as IptablesTunnel;
      return (
        <span className="flex flex-wrap justify-between gap-x-3">
          <span>
            {t('tunnels_col_interface')}: <span dir="ltr">{ipt.IN_IF || 'any'}</span>
          </span>
          <span>
            {t('tunnels_col_source_cidr')}: <span dir="ltr">{ipt.SOURCE_CIDR || '0.0.0.0/0'}</span>
          </span>
        </span>
      );
    },
  },
  {
    type: 'gost',
    icon: <Zap className="w-4 h-4 text-amber-400" />,
    accent: 'amber',
    titleKey: 'tunnels_gost_title',
    descKey: 'tunnels_gost_desc',
    newKey: 'tunnels_btn_new_gost',
    emptyKey: 'tunnels_empty_gost',
    emptyDescKey: 'tunnels_empty_gost_desc',
    subtabKey: 'tunnels_subtab_gost',
    badge: (i) => `${((i as GostTunnel).PROTOCOL || 'both').toUpperCase()} Forwarder`,
    details: (i, t) => (
      <span>
        {t('tunnels_col_protocol')}: {((i as GostTunnel).PROTOCOL || 'both').toUpperCase()}
      </span>
    ),
  },
];

const isFailed = (n?: TunnelNodeState) => Boolean(n && n.status !== 'ok' && n.status !== 'idle');

function timeAgo(ts: number | null | undefined, t: (key: any) => string): string {
  if (!ts) return '';
  const sec = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (sec < 60) return t('tunnels_ago_seconds').replace('{n}', String(sec));
  if (sec < 3600) return t('tunnels_ago_minutes').replace('{n}', String(Math.round(sec / 60)));
  return t('tunnels_ago_hours').replace('{n}', String(Math.round(sec / 3600)));
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
    if (n.status === 'ok') return n.latency_ms ? `${n.latency_ms} ms` : t('tunnels_node_ok');
    if (n.status === 'idle') return t('tunnels_node_idle');
    return t(`tunnels_node_error_${n.status}`);
  };

  const dotClass = (n: TunnelNodeState) => {
    if (n.loading) return 'bg-sky-400 animate-pulse';
    if (n.status === 'ok') return 'bg-emerald-400';
    if (n.status === 'idle') return 'bg-slate-500';
    return n.stale ? 'bg-amber-400' : 'bg-rose-400';
  };

  const segBtn = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-primary/20 text-primary border border-primary/30 font-semibold' : 'text-text-muted hover:text-text-main hover:bg-white/5 border border-transparent'
    }`;

  return (
    <div className="space-y-4">
      {/* Toolbar: scope, search, refresh */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-2 rounded-xl bg-card border border-card-border backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('tunnels_scope_label')}>
          <button type="button" aria-pressed={scope === 'local'} onClick={() => onScopeChange('local')} className={segBtn(scope === 'local')}>
            <Server className="w-3.5 h-3.5" />
            {t('tunnels_scope_local')}
          </button>
          {remoteNodes.length > 0 && (
            <>
              <button type="button" aria-pressed={scope === 'all'} onClick={() => onScopeChange('all')} className={segBtn(scope === 'all')}>
                <Globe className="w-3.5 h-3.5" />
                {t('tunnels_scope_all')}
              </button>
              <select
                value={scope !== 'local' && scope !== 'all' ? scope : ''}
                onChange={(e) => e.target.value && onScopeChange(e.target.value)}
                aria-label={t('tunnels_scope_pick')}
                className={`bg-input border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-primary ${
                  scope !== 'local' && scope !== 'all' ? 'border-primary/40 text-primary' : 'border-card-border text-text-muted'
                }`}
              >
                <option value="">{t('tunnels_scope_pick')}</option>
                {remoteNodes.map((n) => (
                  <option key={n.ip} value={n.ip}>
                    {n.name} ({n.ip}){isFailed(n) ? ` - ${t('tunnels_node_unreachable_short')}` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 lg:ms-auto">
          <div className="relative flex-1 lg:w-64">
            <Search className="w-3.5 h-3.5 text-text-subtle absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tunnels_search_placeholder')}
              aria-label={t('tunnels_search_placeholder')}
              className="w-full bg-input border border-card-border rounded-lg ps-8 pe-2.5 py-1.5 text-xs text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={anyLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-card-border text-xs font-medium text-text-muted hover:text-text-main transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${anyLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('btn_refresh')}</span>
          </button>
        </div>
      </div>

      {/* Node health strip (only when looking beyond this node) */}
      {scope !== 'local' && nodesInScope.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {nodesInScope.map((n) => {
            const failed = isFailed(n);
            return (
              <div
                key={n.ip}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border bg-card transition-colors ${
                  failed ? (n.stale ? 'border-amber-500/30' : 'border-rose-500/30') : 'border-card-border'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(n)}`} aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onScopeChange(n.ip)}
                  className="min-w-0 flex-1 text-start"
                  title={n.error || undefined}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text-main truncate">
                    {n.name}
                    {n.is_local && <span className="text-[10px] font-normal text-text-subtle">({t('tunnels_scope_local')})</span>}
                  </div>
                  <div className="text-[11px] text-text-muted font-mono truncate">
                    <span dir="ltr">{n.ip}</span> · {countTunnels(byNode[n.ip])} · {statusLabel(n)}
                    {failed && n.stale && ` · ${timeAgo(n.fetched_at, t)}`}
                  </div>
                </button>
                {failed && (
                  <button
                    type="button"
                    onClick={() => onRetryNode(n.ip)}
                    disabled={n.loading}
                    aria-label={t('tunnels_retry')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-white/5 border border-card-border text-text-muted hover:text-text-main disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3 h-3 ${n.loading ? 'animate-spin' : ''}`} />
                    {t('tunnels_retry')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {failedInScope.length > 0 && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{t('tunnels_nodes_failed_banner').replace('{n}', String(failedInScope.length))}</p>
        </div>
      )}

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('tunnels_subtab_all')}>
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={segBtn(filter === 'all')}>
          {t('tunnels_subtab_all')} <span className="opacity-70">{totalCount}</span>
        </button>
        {SECTIONS.map((s) => (
          <button
            key={s.type}
            type="button"
            aria-pressed={filter === s.type}
            onClick={() => setFilter(s.type)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              filter === s.type ? `${ACCENTS[s.accent].pill} font-semibold` : 'text-text-muted hover:text-text-main hover:bg-white/5 border-transparent'
            }`}
          >
            {t(s.subtabKey)} <span className="opacity-70">{filtered[s.type].length}</span>
          </button>
        ))}
      </div>

      {initialLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true" aria-label={t('tunnels_loading')}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-card border border-card-border animate-pulse" />
          ))}
        </div>
      ) : query && totalCount === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-card border border-dashed border-card-border text-xs text-text-muted">
          {t('tunnels_no_results')}
        </div>
      ) : (
        SECTIONS.filter((s) => filter === 'all' || filter === s.type)
          .filter((s) => !query || filtered[s.type].length > 0)
          .map((s) => {
            const accent = ACCENTS[s.accent];
            const items = filtered[s.type];
            const compactEmpty = filter === 'all';
            return (
              <section key={s.type} className="p-4 sm:p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                      {s.icon}
                      {t(s.titleKey)}
                      <span className="text-xs font-mono font-normal text-text-subtle">{items.length}</span>
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">{t(s.descKey)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handlers[s.type].create}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${accent.button}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t(s.newKey).replace(/^\+\s*/, '')}
                  </button>
                </div>

                {items.length === 0 ? (
                  compactEmpty ? (
                    <p className="text-xs text-text-subtle px-3 py-2.5 rounded-xl bg-white/[0.02] border border-dashed border-card-border">
                      {t(s.emptyKey)}
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl bg-white/[0.02] border border-dashed border-card-border">
                      <p className="text-xs font-semibold text-text-main mb-1">{t(s.emptyKey)}</p>
                      <p className="text-xs text-text-muted max-w-sm mb-3">{t(s.emptyDescKey)}</p>
                      <button
                        type="button"
                        onClick={handlers[s.type].create}
                        className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${accent.button}`}
                      >
                        {t(s.newKey)}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((item) => {
                      const node = item._node_ip ? nodeByIp.get(item._node_ip) : undefined;
                      const readOnly = !item._is_local && isFailed(node);
                      const details = s.details(item, t);
                      return (
                        <div
                          key={`${item._node_ip || 'local'}:${item.TUNNEL_NAME}`}
                          className={`interactive-card relative overflow-hidden p-4 rounded-2xl bg-card/90 border border-card-border hover:border-card-border-hover shadow-md transition-all ${
                            readOnly ? 'opacity-75' : ''
                          }`}
                        >
                          <span className={`absolute inset-y-0 start-0 w-0.5 ${accent.bar}`} aria-hidden="true" />
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <div className={`text-sm font-bold font-mono truncate ${accent.text}`} dir="ltr">
                                {item.TUNNEL_NAME}
                              </div>
                              {showOrigin && item._node_name && (
                                <div className="flex items-center gap-1 mt-1 text-[11px] text-text-muted">
                                  <Server className="w-3 h-3 text-primary shrink-0" />
                                  <span className="text-primary font-medium truncate">{item._node_name}</span>
                                  <span className="text-text-subtle font-mono" dir="ltr">
                                    {item._node_ip}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className={`px-2 py-0.5 rounded border text-[11px] font-mono ${accent.soft}`}>{s.badge(item)}</span>
                              {readOnly && node?.stale && (
                                <span
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/25"
                                  title={timeAgo(node.fetched_at, t)}
                                >
                                  <History className="w-2.5 h-2.5" />
                                  {t('tunnels_node_stale')}
                                </span>
                              )}
                            </div>
                          </div>

                          <dl className="p-2.5 rounded-lg bg-black/20 text-xs mb-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-text-muted">{t('tunnels_col_destination')}</dt>
                              <dd className="font-mono text-text-main truncate" dir="ltr">
                                {item.TARGET_IP || '--'}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-text-muted">{t('tunnels_col_ports')}</dt>
                              <dd className="font-mono text-text-main font-medium truncate" dir="ltr">
                                {item.PORT_SPEC}
                              </dd>
                            </div>
                            {details && <div className="text-text-subtle pt-1 border-t border-white/5">{details}</div>}
                          </dl>

                          {readOnly ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-text-subtle">
                              <Lock className="w-3 h-3 shrink-0" />
                              {t('tunnels_readonly_hint')}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handlers[s.type].edit(item)}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-text-main border border-card-border transition-colors"
                              >
                                <Edit3 className="w-3 h-3 text-text-muted" />
                                {t('btn_edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteTunnel(s.type, item.TUNNEL_NAME, item._node_ip)}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400 border border-rose-500/25 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                                {t('btn_delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
      )}
    </div>
  );
};
