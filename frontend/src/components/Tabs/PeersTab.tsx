import React, { useState, useMemo } from "react";
import { Peer } from "../../types";
import { Search, Copy, Check, Activity, Zap, RefreshCw, Server, ArrowUpCircle, AlertTriangle, Terminal, X } from "lucide-react";

interface PeersTabProps {
  peers: Peer[];
  clusterVersionDrift?: boolean;
  updateCommand?: string;
  onRefresh: () => void;
  onQuickPing: (ip: string) => void;
  onQuickSpeedtest: (ip: string) => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: (key: any) => string;
}

function formatTunnelProto(proto?: string): string {
  if (!proto) return "UDP";
  const clean = proto.trim();
  const lower = clean.toLowerCase();
  if (lower.includes("udp") && lower.includes("tcp")) {
    return "Dual (UDP + TCP)";
  }
  return clean.toUpperCase();
}

export const PeersTab: React.FC<PeersTabProps> = ({
  peers,
  clusterVersionDrift,
  updateCommand,
  onRefresh,
  onQuickPing,
  onQuickSpeedtest,
  onCopy,
  copiedKey,
  t,
}) => {
  const [search, setSearch] = useState("");

  const defaultUpdateCmd = "bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/beta/xraymesh.sh) update";
  const effectiveUpdateCmd = updateCommand || defaultUpdateCmd;

  const hasDrift = clusterVersionDrift || peers.some((p) => p.update_available || p.version_drift);

  const filteredPeers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? peers
      : peers.filter((p) => {
          const ip = (p.ipv4 || "").toLowerCase();
          const host = (p.hostname || "").toLowerCase();
          const proto = (p.tunnel_proto || "").toLowerCase();
          return ip.includes(q) || host.includes(q) || proto.includes(q);
        });
    // Always show local/current node first
    return [...base].sort((a, b) => Number(b.is_current ?? false) - Number(a.is_current ?? false));
  }, [peers, search]);

  return (
    <div className="p-4 sm:p-5 md:p-6 rounded-2xl bg-card/85 border border-card-border backdrop-blur-2xl shadow-xl">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-5">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-text-main flex items-center gap-2">
            <Server className="w-4 h-4 text-primary shrink-0" />
            <span>{t("peers_panel_title")}</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">{t("peers_panel_desc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
            {search ? `${filteredPeers.length} / ${peers.length}` : `${peers.length}`} {t("peers_title")}
          </span>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-text-main hover:bg-white/10 active:scale-95 transition-all"
            title={t("btn_refresh")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{t("btn_refresh")}</span>
          </button>
        </div>
      </div>

      {/* Cluster Version Drift Warning Banner */}
      {hasDrift && (
        <div className="mb-4 sm:mb-5 p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-amber-300">{t("version_drift_warning_title")}</h3>
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{t("version_drift_warning_desc")}</p>
            </div>
          </div>
          {effectiveUpdateCmd && (
            <button
              onClick={() => onCopy(effectiveUpdateCmd)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-black hover:bg-amber-400 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
              title={effectiveUpdateCmd}
            >
              {copiedKey === effectiveUpdateCmd ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{t("version_cmd_copied")}</span>
                </>
              ) : (
                <>
                  <Terminal className="w-3.5 h-3.5" />
                  <span>{t("version_copy_update_cmd")}</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="relative mb-4 sm:mb-5" role="search">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("peers_filter_placeholder")}
          className="w-full ps-9 pe-9 py-2.5 bg-black/30 border border-card-border rounded-xl text-xs sm:text-sm text-text-main placeholder-text-subtle focus:outline-none focus:border-primary transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-main rounded-md active:scale-90 transition-all"
            title={t("btn_clear_search")}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Peers Bento Grid */}
      {filteredPeers.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl bg-black/20 border border-dashed border-card-border">
          <Server className="w-10 h-10 text-text-subtle mb-3" />
          <p className="text-sm font-semibold text-text-main">{t("peers_empty_title")}</p>
          <p className="text-xs text-text-muted mt-1 max-w-sm">{t("peers_empty_desc")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredPeers.map((p) => {
            const isCurrent = Boolean(p.is_current);
            const latNum = typeof p.lat_ms === "number" ? p.lat_ms : parseFloat(String(p.lat_ms || ""));
            const hasLatency = !isNaN(latNum) && latNum > 0;
            const latencyColor = !hasLatency
              ? "text-text-muted"
              : latNum < 40
              ? "text-emerald-400"
              : latNum < 100
              ? "text-amber-400"
              : "text-rose-400";

            return (
              <div
                key={p.ipv4}
                className={`interactive-card relative overflow-hidden p-4 rounded-2xl bg-card/90 border transition-all duration-300 flex flex-col justify-between ${
                  isCurrent
                    ? "border-primary/40 shadow-lg shadow-primary/5 before:absolute before:top-0 before:inset-x-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-primary before:to-transparent"
                    : "border-card-border hover:border-card-border-hover shadow-md"
                }`}
              >
                <div>
                  {/* Card Header: Hostname & Status Badges */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Server className="w-3.5 h-3.5 text-primary shrink-0" />
                        <h3 className="text-sm font-bold text-text-main truncate tech-val">
                          {p.hostname || p.ipv4}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="font-mono text-xs font-semibold text-text-main tech-val">
                          {p.ipv4}
                        </span>
                        <button
                          onClick={() => onCopy(p.ipv4)}
                          className="interactive-min-hit p-1 rounded-lg bg-white/5 border border-white/10 text-text-muted hover:text-primary hover:border-primary/40 active:scale-90 transition-all cursor-pointer"
                          title={copiedKey === p.ipv4 ? t("btn_copied") : "Copy IP"}
                          aria-label="Copy IP"
                        >
                          {copiedKey === p.ipv4 ? (
                            <Check className="w-3 h-3 text-accent-green" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isCurrent ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/30 flex items-center gap-1.5 shrink-0">
                          <span className="w-2 h-2 rounded-full bg-primary" />
                          <span>{t("peer_badge_current")}</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>P2P</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* High-Density Bento Metrics Grid (2x2) */}
                  <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-black/30 border border-white/5 text-xs mb-3">
                    <div>
                      <div className="text-xs text-text-muted">{t("peer_card_protocol")}</div>
                      <div className="font-mono font-semibold text-primary mt-0.5 truncate tech-val">
                        {formatTunnelProto(p.tunnel_proto)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted">{t("latency_title")}</div>
                      <div className={`font-mono font-bold mt-0.5 tabular-nums tech-val ${latencyColor}`}>
                        {hasLatency ? `${latNum.toFixed(1)} ms` : "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted">{t("peer_card_rx")}</div>
                      <div className="font-mono text-text-main mt-0.5 truncate tabular-nums tech-val">
                        {p.rx_bytes || "0 B"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted">{t("peer_card_tx")}</div>
                      <div className="font-mono text-text-main mt-0.5 truncate tabular-nums tech-val">
                        {p.tx_bytes || "0 B"}
                      </div>
                    </div>
                  </div>

                  {/* Version & Update Indicator */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/30 border border-white/5 text-xs mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-text-muted">{t("version_title")}:</span>
                      <span className="font-mono font-semibold text-text-main tech-val">
                        {p.xraymesh_version || "2.2.6-beta.4"}
                      </span>
                      {p.xraymesh_branch && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-white/10 text-text-muted border border-white/10 uppercase tracking-wide">
                          {p.xraymesh_branch}
                        </span>
                      )}
                    </div>
                    {p.update_available ? (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        <span>{t("version_update_available")}</span>
                      </span>
                    ) : p.version_drift ? (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1.5" title="Version mismatch with cluster">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Drift</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                        {t("version_up_to_date")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div>
                  {isCurrent ? (
                    <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-text-muted text-center">
                      {t("peer_current_desc")}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onQuickPing(p.ipv4)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-text-main border border-white/10 active:scale-95 transition-all cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5 text-text-muted" />
                        <span>{t("peer_card_btn_ping")}</span>
                      </button>
                      <button
                        onClick={() => onQuickSpeedtest(p.ipv4)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/15 hover:bg-primary/25 text-xs font-bold text-primary border border-primary/30 active:scale-95 transition-all cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{t("peer_card_btn_speedtest")}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
