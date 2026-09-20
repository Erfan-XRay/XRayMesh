import React, { useState } from 'react';
import { TunnelsData, HaproxyTunnel, IptablesTunnel, GostTunnel } from '../../types';
import { Network, Plus, RefreshCw, Trash2, Edit3, Cpu, Zap } from 'lucide-react';

interface TunnelsTabProps {
  tunnels: TunnelsData;
  onRefresh: () => void;
  onOpenCreateHaproxy: () => void;
  onOpenEditHaproxy: (t: HaproxyTunnel) => void;
  onOpenCreateIptables: () => void;
  onOpenEditIptables: (t: IptablesTunnel) => void;
  onOpenCreateGost: () => void;
  onOpenEditGost: (t: GostTunnel) => void;
  onDeleteTunnel: (type: 'haproxy' | 'iptables' | 'gost', name: string) => void;
  t: (key: any) => string;
}

export const TunnelsTab: React.FC<TunnelsTabProps> = ({
  tunnels,
  onRefresh,
  onOpenCreateHaproxy,
  onOpenEditHaproxy,
  onOpenCreateIptables,
  onOpenEditIptables,
  onOpenCreateGost,
  onOpenEditGost,
  onDeleteTunnel,
  t,
}) => {
  const [filter, setFilter] = useState<'all' | 'haproxy' | 'iptables' | 'gost'>('all');

  const haproxyCount = tunnels.haproxy.length;
  const iptablesCount = tunnels.iptables.length;
  const gostCount = tunnels.gost.length;
  const totalCount = haproxyCount + iptablesCount + gostCount;

  return (
    <div className="space-y-6">
      {/* Sub-Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-xl bg-card border border-card-border backdrop-blur-md">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                : 'text-text-muted hover:text-text-main hover:bg-white/5'
            }`}
          >
            {t('tunnels_subtab_all')} ({totalCount})
          </button>
          <button
            onClick={() => setFilter('haproxy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === 'haproxy'
                ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                : 'text-text-muted hover:text-text-main hover:bg-white/5'
            }`}
          >
            {t('tunnels_subtab_haproxy')} ({haproxyCount})
          </button>
          <button
            onClick={() => setFilter('iptables')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === 'iptables'
                ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                : 'text-text-muted hover:text-text-main hover:bg-white/5'
            }`}
          >
            {t('tunnels_subtab_iptables')} ({iptablesCount})
          </button>
          <button
            onClick={() => setFilter('gost')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === 'gost'
                ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                : 'text-text-muted hover:text-text-main hover:bg-white/5'
            }`}
          >
            {t('tunnels_subtab_gost')} ({gostCount})
          </button>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>{t('btn_refresh')}</span>
        </button>
      </div>

      {/* 1. HAProxy Section */}
      {(filter === 'all' || filter === 'haproxy') && (
        <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" />
                {t('tunnels_haproxy_title')}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">{t('tunnels_haproxy_desc')}</p>
            </div>
            <button
              onClick={onOpenCreateHaproxy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('tunnels_btn_new_haproxy')}
            </button>
          </div>

          {tunnels.haproxy.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl bg-white/[0.02] border border-dashed border-white/10">
              <p className="text-xs font-semibold text-text-main mb-1">{t('tunnels_empty_haproxy')}</p>
              <p className="text-xs text-text-muted max-w-sm mb-3">{t('tunnels_empty_haproxy_desc')}</p>
              <button
                onClick={onOpenCreateHaproxy}
                className="px-3.5 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-medium border border-primary/30 transition-colors"
              >
                {t('tunnels_btn_new_haproxy')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tunnels.haproxy.map((tItem) => (
                <div
                  key={tItem.TUNNEL_NAME}
                  className="p-4 rounded-xl bg-slate-900/50 border border-white/10 hover:border-card-border-hover transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-sm font-bold font-mono text-primary truncate">
                        {tItem.TUNNEL_NAME}
                      </div>
                      <div className="text-xs text-text-muted mt-0.5 font-mono">
                        {t('tunnels_col_destination')}: {tItem.TARGET_IP || '--'}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/25">
                      TCP Proxy
                    </span>
                  </div>

                  <div className="p-2 rounded bg-black/20 text-xs mb-3">
                    <span className="text-text-muted">{t('tunnels_col_ports')}: </span>
                    <span className="font-mono text-text-main font-medium">{tItem.PORT_SPEC}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenEditHaproxy(tItem)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-text-main border border-white/10 transition-colors"
                    >
                      <Edit3 className="w-3 h-3 text-text-muted" />
                      {t('btn_edit')}
                    </button>
                    <button
                      onClick={() => onDeleteTunnel('haproxy', tItem.TUNNEL_NAME)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400 border border-rose-500/25 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('btn_delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. iptables Section */}
      {(filter === 'all' || filter === 'iptables') && (
        <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                {t('tunnels_iptables_title')}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">{t('tunnels_iptables_desc')}</p>
            </div>
            <button
              onClick={onOpenCreateIptables}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('tunnels_btn_new_iptables')}
            </button>
          </div>

          {tunnels.iptables.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl bg-white/[0.02] border border-dashed border-white/10">
              <p className="text-xs font-semibold text-text-main mb-1">{t('tunnels_empty_iptables')}</p>
              <p className="text-xs text-text-muted max-w-sm mb-3">{t('tunnels_empty_iptables_desc')}</p>
              <button
                onClick={onOpenCreateIptables}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-medium border border-emerald-500/30 transition-colors"
              >
                {t('tunnels_btn_new_iptables')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tunnels.iptables.map((tItem) => {
                const proto = (tItem.FORWARD_PROTOCOL || 'udp').toUpperCase();
                return (
                  <div
                    key={tItem.TUNNEL_NAME}
                    className="p-4 rounded-xl bg-slate-900/50 border border-white/10 hover:border-card-border-hover transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="text-sm font-bold font-mono text-emerald-400 truncate">
                          {tItem.TUNNEL_NAME}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5 font-mono">
                          {t('tunnels_col_destination')}: {tItem.TARGET_IP || '--'}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                        {proto} DNAT
                      </span>
                    </div>

                    <div className="p-2 rounded bg-black/20 text-xs mb-3 space-y-1">
                      <div>
                        <span className="text-text-muted">{t('tunnels_col_ports')}: </span>
                        <span className="font-mono text-text-main font-medium">{tItem.PORT_SPEC}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-text-subtle">
                        <span>{t('tunnels_col_interface')}: {tItem.IN_IF || 'any'}</span>
                        <span>{t('tunnels_col_source_cidr')}: {tItem.SOURCE_CIDR || '0.0.0.0/0'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onOpenEditIptables(tItem)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-text-main border border-white/10 transition-colors"
                      >
                        <Edit3 className="w-3 h-3 text-text-muted" />
                        {t('btn_edit')}
                      </button>
                      <button
                        onClick={() => onDeleteTunnel('iptables', tItem.TUNNEL_NAME)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400 border border-rose-500/25 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('btn_delete')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. GOST Section */}
      {(filter === 'all' || filter === 'gost') && (
        <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                {t('tunnels_gost_title')}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">{t('tunnels_gost_desc')}</p>
            </div>
            <button
              onClick={onOpenCreateGost}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('tunnels_btn_new_gost')}
            </button>
          </div>

          {tunnels.gost.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl bg-white/[0.02] border border-dashed border-white/10">
              <p className="text-xs font-semibold text-text-main mb-1">{t('tunnels_empty_gost')}</p>
              <p className="text-xs text-text-muted max-w-sm mb-3">{t('tunnels_empty_gost_desc')}</p>
              <button
                onClick={onOpenCreateGost}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-medium border border-amber-500/30 transition-colors"
              >
                {t('tunnels_btn_new_gost')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tunnels.gost.map((tItem) => {
                const proto = (tItem.PROTOCOL || 'both').toUpperCase();
                return (
                  <div
                    key={tItem.TUNNEL_NAME}
                    className="p-4 rounded-xl bg-slate-900/50 border border-white/10 hover:border-card-border-hover transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="text-sm font-bold font-mono text-amber-400 truncate">
                          {tItem.TUNNEL_NAME}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5 font-mono">
                          {t('tunnels_col_destination')}: {tItem.TARGET_IP || '--'}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/25">
                        {proto} Forwarder
                      </span>
                    </div>

                    <div className="p-2 rounded bg-black/20 text-xs mb-3 space-y-1">
                      <div>
                        <span className="text-text-muted">{t('tunnels_col_ports')}: </span>
                        <span className="font-mono text-text-main font-medium">{tItem.PORT_SPEC}</span>
                      </div>
                      <div className="text-[11px] text-text-subtle">
                        {t('tunnels_col_protocol')}: {proto}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onOpenEditGost(tItem)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-text-main border border-white/10 transition-colors"
                      >
                        <Edit3 className="w-3 h-3 text-text-muted" />
                        {t('btn_edit')}
                      </button>
                      <button
                        onClick={() => onDeleteTunnel('gost', tItem.TUNNEL_NAME)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400 border border-rose-500/25 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('btn_delete')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
