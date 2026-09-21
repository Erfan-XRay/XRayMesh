import React, { useState, useMemo } from 'react';
import { Peer } from '../../types';
import { Search, Copy, Check, Activity, Zap, RefreshCw, Server } from 'lucide-react';

interface PeersTabProps {
  peers: Peer[];
  onRefresh: () => void;
  onQuickPing: (ip: string) => void;
  onQuickSpeedtest: (ip: string) => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: (key: any) => string;
}

export const PeersTab: React.FC<PeersTabProps> = ({
  peers,
  onRefresh,
  onQuickPing,
  onQuickSpeedtest,
  onCopy,
  copiedKey,
  t,
}) => {
  const [search, setSearch] = useState('');

  const filteredPeers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return peers;
    return peers.filter((p) => {
      const ip = (p.ipv4 || '').toLowerCase();
      const host = (p.hostname || '').toLowerCase();
      const proto = (p.tunnel_proto || '').toLowerCase();
      return ip.includes(q) || host.includes(q) || proto.includes(q);
    });
  }, [peers, search]);

  return (
    <div className="p-5 rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-text-main flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            {t('peers_panel_title')}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">{t('peers_panel_desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/20">
            {search ? `${filteredPeers.length} / ${peers.length}` : `${peers.length}`} {t('peers_title')}
          </span>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('btn_refresh')}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('peers_search_placeholder')}
          className="w-full pl-9 pr-4 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs sm:text-sm font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>

      {/* Grid or Empty */}
      {filteredPeers.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-10 text-center rounded-xl bg-white/[0.02] border border-dashed border-white/10">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
            <Server className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-text-main mb-1">
            {search ? t('peers_no_match') : t('peers_empty_title')}
          </h3>
          <p className="text-xs text-text-muted max-w-sm mb-4">
            {search ? '' : t('peers_empty_desc')}
          </p>
          {!search && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-medium border border-primary/30 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('btn_refresh')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredPeers.map((p) => {
            const lat = parseFloat(String(p.lat_ms || '0')) || 0;
            const isDirect = p.cost === 1 || p.cost === '1' || Number(p.cost) <= 1;

            let latBadgeColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
            if (lat > 100) latBadgeColor = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
            if (lat > 200) latBadgeColor = 'text-rose-400 border-rose-500/30 bg-rose-500/10';

            return (
              <div
                key={p.ipv4}
                className="flex flex-col justify-between p-4 rounded-xl bg-slate-900/50 border border-white/10 hover:border-primary/30 interactive-card hover:shadow-lg transition-all shadow-sm"
              >
                {/* Card Top */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm sm:text-base font-bold font-mono text-primary tabular-nums">
                        {p.ipv4}
                      </span>
                      <button
                        onClick={() => onCopy(p.ipv4)}
                        className="p-1 rounded-lg bg-white/5 border border-white/10 text-text-muted hover:text-primary active:scale-90 transition-all"
                        title={t('btn_copied')}
                      >
                        {copiedKey === p.ipv4 ? (
                          <Check className="w-3 h-3 text-accent-green animate-bounce-subtle" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{p.hostname || 'EasyTier Node'}</div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium border ${latBadgeColor}`}>
                      {lat > 0 ? `${lat} ms` : '< 1ms'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        isDirect
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                      }`}
                    >
                      {isDirect ? t('peer_direct_badge') : `${t('peer_relayed_badge')} (${p.cost})`}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-black/20 border border-white/5 text-xs mb-3">
                  <div>
                    <div className="text-[11px] text-text-muted">{t('peer_card_protocol')}</div>
                    <div className="font-mono font-medium text-primary mt-0.5">{p.tunnel_proto || 'UDP'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-text-muted">{t('peer_card_cost')}</div>
                    <div className="font-mono text-text-main mt-0.5">{p.cost || '1'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-text-muted">{t('peer_card_rx')}</div>
                    <div className="font-mono text-text-main mt-0.5">{p.rx_bytes || '0 B'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-text-muted">{t('peer_card_tx')}</div>
                    <div className="font-mono text-text-main mt-0.5">{p.tx_bytes || '0 B'}</div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onQuickPing(p.ipv4)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-text-main border border-white/10 active:scale-95 transition-all"
                  >
                    <Activity className="w-3.5 h-3.5 text-text-muted" />
                    {t('peer_card_btn_ping')}
                  </button>
                  <button
                    onClick={() => onQuickSpeedtest(p.ipv4)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-xs font-semibold text-primary border border-primary/30 active:scale-95 transition-all"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {t('peer_card_btn_speedtest')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
