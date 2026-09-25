import React from "react";
import { NodeInfo, SystemStats } from "../types";
import { Copy, Check, Users, Activity, Cpu, Server } from "lucide-react";

interface OverviewCardsProps {
  node: NodeInfo;
  system: SystemStats;
  peerCount: number;
  avgLatency: string;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: (key: any) => string;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({
  node,
  system,
  peerCount,
  avgLatency,
  onCopy,
  copiedKey,
  t,
}) => {
  const cpuPct = typeof system.cpu_percent === "number" ? Math.round(system.cpu_percent) : 0;
  const ramPct = typeof system.ram_percent === "number" ? Math.round(system.ram_percent) : 0;

  const usedRamStr = system.ram_used_mb
    ? system.ram_used_mb >= 1024
      ? `${(system.ram_used_mb / 1024).toFixed(1)} GB`
      : `${system.ram_used_mb} MB`
    : "";

  const totalRamStr = system.ram_total_mb
    ? system.ram_total_mb >= 1024
      ? `${(system.ram_total_mb / 1024).toFixed(1)} GB`
      : `${system.ram_total_mb} MB`
    : "";

  const latNum = parseFloat(avgLatency);
  const latencyColorClass =
    isNaN(latNum) || latNum === 0
      ? "text-primary"
      : latNum < 40
      ? "text-emerald-400"
      : latNum < 100
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 mb-4 sm:mb-6">
      {/* 1. Bento Card: Mesh Virtual IP & Node Identity */}
      <div className="interactive-card relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-card/90 border border-card-border hover:border-primary/40 shadow-lg backdrop-blur-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted truncate">
              {t("vip_title")}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              IPv4
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-lg sm:text-xl md:text-2xl font-bold font-mono text-text-main tabular-nums tracking-tight truncate tech-val">
              {node.ipv4 || "--"}
            </span>
            {node.ipv4 && (
              <button
                onClick={() => onCopy(node.ipv4!)}
                className="btn-interactive p-2 rounded-xl bg-white/5 border border-white/10 text-text-muted hover:text-primary hover:border-primary/40 active:scale-95 transition-all cursor-pointer shrink-0"
                title={copiedKey === node.ipv4 ? t("btn_copied") : t("vip_title")}
                aria-label={copiedKey === node.ipv4 ? t("btn_copied") : t("vip_title")}
                aria-pressed={copiedKey === node.ipv4}
              >
                {copiedKey === node.ipv4 ? (
                  <Check className="w-4 h-4 text-accent-green" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="text-xs text-text-muted mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <Server className="w-3.5 h-3.5 text-text-subtle shrink-0" />
            <span className="font-mono text-text-main truncate tech-val">{node.hostname || "--"}</span>
          </div>
          {node.network_name && (
            <span className="px-2 py-0.5 rounded-md text-xs font-mono text-primary font-medium truncate shrink-0 max-w-[120px] bg-primary/10 border border-primary/20">
              {node.network_name}
            </span>
          )}
        </div>
      </div>

      {/* 2. Bento Card: Connected Peers & Mesh Topology */}
      <div className="interactive-card relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-card/90 border border-card-border hover:border-emerald-500/40 shadow-lg backdrop-blur-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted truncate">
              {t("peers_title")}
            </span>
            <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono text-text-main tabular-nums">
              {peerCount}
            </span>
            <span className="text-xs text-text-muted font-medium truncate">
              {peerCount === 1 ? "peer" : "peers"}
            </span>
          </div>
        </div>

        <div className="text-xs text-text-muted mt-3 pt-2.5 border-t border-white/5 flex items-center gap-2 truncate">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              peerCount > 0
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                : "bg-slate-600"
            }`}
          />
          <span className="truncate">{t("peers_desc")}</span>
        </div>
      </div>

      {/* 3. Bento Card: Real-Time RTT & Latency */}
      <div className="interactive-card relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-card/90 border border-card-border hover:border-purple-500/40 shadow-lg backdrop-blur-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted truncate">
              {t("latency_title")}
            </span>
            <div className="p-1.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
              <Activity className="w-4 h-4" />
            </div>
          </div>

          <div className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums truncate tech-val ${latencyColorClass}`}>
            {avgLatency}
          </div>
        </div>

        <div className="text-xs text-text-muted mt-3 pt-2.5 border-t border-white/5 truncate flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary/70 shrink-0" />
          <span className="truncate">{t("latency_desc")}</span>
        </div>
      </div>

      {/* 4. Bento Card: Host Server Resources (CPU & RAM) */}
      <div className="interactive-card relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-card/90 border border-card-border hover:border-amber-500/40 shadow-lg backdrop-blur-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted truncate">
              {t("resources_title")}
            </span>
            <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
          </div>

          {/* CPU Meter */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-text-muted truncate">{t("cpu_usage")}</span>
              <span className="font-mono font-semibold text-text-main tabular-nums tech-val">{cpuPct}%</span>
            </div>
            <div
              className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5"
              role="progressbar"
              aria-label={t("cpu_usage")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={cpuPct}
            >
              <div
                className={`h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-sm ${
                  cpuPct > 85
                    ? "bg-rose-500 shadow-rose-500/50"
                    : cpuPct > 60
                    ? "bg-amber-400 shadow-amber-400/50"
                    : "bg-primary shadow-primary/50"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, cpuPct))}%` }}
              />
            </div>
          </div>

          {/* RAM Meter */}
          <div className="space-y-1 mt-2.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-text-muted truncate">{t("ram_usage")}</span>
              <span className="font-mono font-semibold text-text-main tabular-nums truncate tech-val">
                {ramPct}%
                {usedRamStr && totalRamStr ? ` (${usedRamStr} / ${totalRamStr})` : ""}
              </span>
            </div>
            <div
              className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5"
              role="progressbar"
              aria-label={t("ram_usage")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={ramPct}
            >
              <div
                className={`h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-sm ${
                  ramPct > 85
                    ? "bg-rose-500 shadow-rose-500/50"
                    : ramPct > 65
                    ? "bg-amber-400 shadow-amber-400/50"
                    : "bg-primary shadow-primary/50"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, ramPct))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="text-xs text-text-muted mt-3 pt-2.5 border-t border-white/5 truncate flex items-center justify-between">
          <span className="truncate">{system.uptime_str || "--"}</span>
          {Array.isArray(system.load_avg) && (
            <span className="font-mono text-text-subtle text-xs tabular-nums ms-2 shrink-0">
              {system.load_avg.map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join(" ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
