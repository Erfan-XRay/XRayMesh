import { PaletteId } from "../types";

export interface PaletteDef {
  id: PaletteId;
  nameEn: string;
  nameFa: string;
  primaryColor: string;
  vars: Record<string, string>;
  lightVars: Record<string, string>;
}

export const PALETTES: Record<PaletteId, PaletteDef> = {
  sky: {
    id: "sky",
    nameEn: "Sky Tech",
    nameFa: "آبی آسمانی (پیش‌فرض)",
    primaryColor: "#0ea5e9",
    vars: {
      // 60% Base Canvas & Surfaces (Rich Obsidian Slate)
      "--bg-base": "#070a12",
      "--bg-subtle": "#0b1120",
      "--bg-card": "rgba(15, 23, 42, 0.78)",
      "--bg-elevated": "#0f172a",
      "--input-bg": "rgba(11, 17, 32, 0.85)",
      "--modal-bg": "#0c1326",

      // Legacy Aliases for seamless backward compatibility
      "--bg-dark": "#070a12",
      "--surface-dark": "#0b1120",

      // Borders & Dividers
      "--border-subtle": "rgba(255, 255, 255, 0.08)",
      "--border-strong": "rgba(14, 165, 233, 0.45)",
      "--card-border": "rgba(255, 255, 255, 0.08)",
      "--card-border-hover": "rgba(14, 165, 233, 0.45)",

      // 10% Accent & Brand Tokens
      "--primary": "#38bdf8",
      "--primary-hover": "#0ea5e9",
      "--primary-subtle": "rgba(56, 189, 248, 0.14)",
      "--primary-border": "rgba(56, 189, 248, 0.32)",
      "--accent-glow": "rgba(14, 165, 233, 0.25)",
      "--on-primary": "#030712",

      // Functional Status Indicators
      "--accent-green": "#10b981",
      "--accent-yellow": "#f59e0b",
      "--accent-red": "#f43f5e",

      // 30% Text & Typography Hierarchy
      "--text-primary": "#f8fafc",
      "--text-secondary": "#cbd5e1",
      "--text-muted": "#94a3b8",
      "--text-subtle": "#64748b",
      "--text-main": "#f8fafc",

      // Background Ambiance
      "--bg-radial-1": "rgba(14, 165, 233, 0.12)",
      "--bg-radial-2": "rgba(99, 102, 241, 0.06)",
      "--dot-pattern": "rgba(255, 255, 255, 0.04)",
    },
    lightVars: {
      // 60% Base Canvas & Surfaces (Tailored Slate/Zinc Foundation - Zero Harsh Glare)
      "--bg-base": "#f1f5f9",
      "--bg-subtle": "#e2e8f0",
      "--bg-card": "rgba(255, 255, 255, 0.92)",
      "--bg-elevated": "#ffffff",
      "--input-bg": "#ffffff",
      "--modal-bg": "#ffffff",

      // Legacy Aliases
      "--bg-dark": "#f1f5f9",
      "--surface-dark": "#e2e8f0",

      // Borders & Dividers
      "--border-subtle": "rgba(15, 23, 42, 0.12)",
      "--border-strong": "rgba(2, 132, 199, 0.60)",
      "--card-border": "rgba(15, 23, 42, 0.12)",
      "--card-border-hover": "rgba(2, 132, 199, 0.60)",

      // 10% Accent & Brand Tokens
      "--primary": "#0284c7",
      "--primary-hover": "#0369a1",
      "--primary-subtle": "rgba(2, 132, 199, 0.12)",
      "--primary-border": "rgba(2, 132, 199, 0.35)",
      "--accent-glow": "rgba(2, 132, 199, 0.20)",
      "--on-primary": "#ffffff",

      // Functional Status Indicators (High-Contrast AA Compliance)
      "--accent-green": "#059669",
      "--accent-yellow": "#d97706",
      "--accent-red": "#e11d48",

      // 30% Text & Typography Hierarchy (Clear Contrast against #f1f5f9)
      "--text-primary": "#0f172a",
      "--text-secondary": "#334155",
      "--text-muted": "#475569",
      "--text-subtle": "#64748b",
      "--text-main": "#0f172a",

      // High-Contrast Status Text
      "--success-text": "#047857",
      "--warning-text": "#b45309",
      "--danger-text": "#be123c",
      "--info-text": "#0284c7",

      // Background Ambiance
      "--bg-radial-1": "rgba(2, 132, 199, 0.10)",
      "--bg-radial-2": "rgba(99, 102, 241, 0.05)",
      "--dot-pattern": "rgba(15, 23, 42, 0.06)",
    },
  },

  emerald: {
    id: "emerald",
    nameEn: "Cyber Emerald",
    nameFa: "زمردی سایبری",
    primaryColor: "#10b981",
    vars: {
      "--bg-base": "#04100c",
      "--bg-subtle": "#061812",
      "--bg-card": "rgba(6, 28, 21, 0.80)",
      "--bg-elevated": "#09241b",
      "--input-bg": "rgba(4, 18, 14, 0.85)",
      "--modal-bg": "#061c15",

      "--bg-dark": "#04100c",
      "--surface-dark": "#061812",

      "--border-subtle": "rgba(16, 185, 129, 0.14)",
      "--border-strong": "rgba(16, 185, 129, 0.50)",
      "--card-border": "rgba(16, 185, 129, 0.14)",
      "--card-border-hover": "rgba(16, 185, 129, 0.50)",

      "--primary": "#10b981",
      "--primary-hover": "#059669",
      "--primary-subtle": "rgba(16, 185, 129, 0.14)",
      "--primary-border": "rgba(16, 185, 129, 0.35)",
      "--accent-glow": "rgba(16, 185, 129, 0.25)",
      "--on-primary": "#022c22",

      "--accent-green": "#10b981",
      "--accent-yellow": "#f59e0b",
      "--accent-red": "#f43f5e",

      "--text-primary": "#f0fdf4",
      "--text-secondary": "#bbf7d0",
      "--text-muted": "#86efac",
      "--text-subtle": "#4ade80",
      "--text-main": "#f0fdf4",

      "--bg-radial-1": "rgba(16, 185, 129, 0.12)",
      "--bg-radial-2": "rgba(6, 182, 212, 0.05)",
      "--dot-pattern": "rgba(16, 185, 129, 0.06)",
    },
    lightVars: {
      "--bg-base": "#f0fdf4",
      "--bg-subtle": "#dcfce7",
      "--bg-card": "rgba(255, 255, 255, 0.94)",
      "--bg-elevated": "#ffffff",
      "--input-bg": "#ffffff",
      "--modal-bg": "#ffffff",

      "--bg-dark": "#f0fdf4",
      "--surface-dark": "#dcfce7",

      "--border-subtle": "rgba(22, 101, 52, 0.16)",
      "--border-strong": "rgba(5, 150, 105, 0.65)",
      "--card-border": "rgba(22, 101, 52, 0.16)",
      "--card-border-hover": "rgba(5, 150, 105, 0.65)",

      "--primary": "#059669",
      "--primary-hover": "#047857",
      "--primary-subtle": "rgba(5, 150, 105, 0.12)",
      "--primary-border": "rgba(5, 150, 105, 0.38)",
      "--accent-glow": "rgba(5, 150, 105, 0.20)",
      "--on-primary": "#ffffff",

      "--accent-green": "#059669",
      "--accent-yellow": "#d97706",
      "--accent-red": "#e11d48",

      "--text-primary": "#064e3b",
      "--text-secondary": "#065f46",
      "--text-muted": "#166534",
      "--text-subtle": "#374151",
      "--text-main": "#064e3b",

      "--success-text": "#047857",
      "--warning-text": "#b45309",
      "--danger-text": "#be123c",
      "--info-text": "#059669",

      "--bg-radial-1": "rgba(5, 150, 105, 0.10)",
      "--bg-radial-2": "rgba(13, 148, 136, 0.06)",
      "--dot-pattern": "rgba(22, 101, 52, 0.08)",
    },
  },

  violet: {
    id: "violet",
    nameEn: "Neon Violet",
    nameFa: "بنفش نئونی",
    primaryColor: "#a855f7",
    vars: {
      "--bg-base": "#0c0817",
      "--bg-subtle": "#130d24",
      "--bg-card": "rgba(23, 15, 41, 0.80)",
      "--bg-elevated": "#1c1233",
      "--input-bg": "rgba(16, 10, 29, 0.85)",
      "--modal-bg": "#150e26",

      "--bg-dark": "#0c0817",
      "--surface-dark": "#130d24",

      "--border-subtle": "rgba(168, 85, 247, 0.14)",
      "--border-strong": "rgba(168, 85, 247, 0.50)",
      "--card-border": "rgba(168, 85, 247, 0.14)",
      "--card-border-hover": "rgba(168, 85, 247, 0.50)",

      "--primary": "#a855f7",
      "--primary-hover": "#9333ea",
      "--primary-subtle": "rgba(168, 85, 247, 0.14)",
      "--primary-border": "rgba(168, 85, 247, 0.35)",
      "--accent-glow": "rgba(168, 85, 247, 0.25)",
      "--on-primary": "#2e1065",

      "--accent-green": "#10b981",
      "--accent-yellow": "#f59e0b",
      "--accent-red": "#f43f5e",

      "--text-primary": "#faf5ff",
      "--text-secondary": "#e9d5ff",
      "--text-muted": "#d8b4fe",
      "--text-subtle": "#c084fc",
      "--text-main": "#faf5ff",

      "--bg-radial-1": "rgba(168, 85, 247, 0.12)",
      "--bg-radial-2": "rgba(236, 72, 153, 0.05)",
      "--dot-pattern": "rgba(168, 85, 247, 0.06)",
    },
    lightVars: {
      "--bg-base": "#faf5ff",
      "--bg-subtle": "#f3e8ff",
      "--bg-card": "rgba(255, 255, 255, 0.94)",
      "--bg-elevated": "#ffffff",
      "--input-bg": "#ffffff",
      "--modal-bg": "#ffffff",

      "--bg-dark": "#faf5ff",
      "--surface-dark": "#f3e8ff",

      "--border-subtle": "rgba(107, 33, 168, 0.16)",
      "--border-strong": "rgba(126, 34, 206, 0.65)",
      "--card-border": "rgba(107, 33, 168, 0.16)",
      "--card-border-hover": "rgba(126, 34, 206, 0.65)",

      "--primary": "#7e22ce",
      "--primary-hover": "#6b21a8",
      "--primary-subtle": "rgba(126, 34, 206, 0.12)",
      "--primary-border": "rgba(126, 34, 206, 0.38)",
      "--accent-glow": "rgba(126, 34, 206, 0.20)",
      "--on-primary": "#ffffff",

      "--accent-green": "#059669",
      "--accent-yellow": "#d97706",
      "--accent-red": "#e11d48",

      "--text-primary": "#3b0764",
      "--text-secondary": "#581c87",
      "--text-muted": "#6b21a8",
      "--text-subtle": "#475569",
      "--text-main": "#3b0764",

      "--success-text": "#047857",
      "--warning-text": "#b45309",
      "--danger-text": "#be123c",
      "--info-text": "#7e22ce",

      "--bg-radial-1": "rgba(126, 34, 206, 0.10)",
      "--bg-radial-2": "rgba(219, 39, 119, 0.05)",
      "--dot-pattern": "rgba(107, 33, 168, 0.08)",
    },
  },

  amber: {
    id: "amber",
    nameEn: "Solar Amber",
    nameFa: "کهربایی خورشیدی",
    primaryColor: "#f59e0b",
    vars: {
      "--bg-base": "#120a02",
      "--bg-subtle": "#1a1005",
      "--bg-card": "rgba(34, 20, 7, 0.80)",
      "--bg-elevated": "#291809",
      "--input-bg": "rgba(23, 13, 4, 0.85)",
      "--modal-bg": "#1c1106",

      "--bg-dark": "#120a02",
      "--surface-dark": "#1a1005",

      "--border-subtle": "rgba(245, 158, 11, 0.14)",
      "--border-strong": "rgba(245, 158, 11, 0.50)",
      "--card-border": "rgba(245, 158, 11, 0.14)",
      "--card-border-hover": "rgba(245, 158, 11, 0.50)",

      "--primary": "#f59e0b",
      "--primary-hover": "#d97706",
      "--primary-subtle": "rgba(245, 158, 11, 0.14)",
      "--primary-border": "rgba(245, 158, 11, 0.35)",
      "--accent-glow": "rgba(245, 158, 11, 0.25)",
      "--on-primary": "#451a03",

      "--accent-green": "#10b981",
      "--accent-yellow": "#f59e0b",
      "--accent-red": "#f43f5e",

      "--text-primary": "#fffbeb",
      "--text-secondary": "#fef3c7",
      "--text-muted": "#fde68a",
      "--text-subtle": "#fcd34d",
      "--text-main": "#fffbeb",

      "--bg-radial-1": "rgba(245, 158, 11, 0.12)",
      "--bg-radial-2": "rgba(234, 88, 12, 0.05)",
      "--dot-pattern": "rgba(245, 158, 11, 0.06)",
    },
    lightVars: {
      "--bg-base": "#fffbeb",
      "--bg-subtle": "#fef3c7",
      "--bg-card": "rgba(255, 255, 255, 0.94)",
      "--bg-elevated": "#ffffff",
      "--input-bg": "#ffffff",
      "--modal-bg": "#ffffff",

      "--bg-dark": "#fffbeb",
      "--surface-dark": "#fef3c7",

      "--border-subtle": "rgba(146, 64, 14, 0.18)",
      "--border-strong": "rgba(180, 83, 9, 0.65)",
      "--card-border": "rgba(146, 64, 14, 0.18)",
      "--card-border-hover": "rgba(180, 83, 9, 0.65)",

      "--primary": "#b45309",
      "--primary-hover": "#92400e",
      "--primary-subtle": "rgba(180, 83, 9, 0.12)",
      "--primary-border": "rgba(180, 83, 9, 0.38)",
      "--accent-glow": "rgba(180, 83, 9, 0.20)",
      "--on-primary": "#ffffff",

      "--accent-green": "#059669",
      "--accent-yellow": "#d97706",
      "--accent-red": "#e11d48",

      "--text-primary": "#451a03",
      "--text-secondary": "#78350f",
      "--text-muted": "#92400e",
      "--text-subtle": "#475569",
      "--text-main": "#451a03",

      "--success-text": "#047857",
      "--warning-text": "#b45309",
      "--danger-text": "#be123c",
      "--info-text": "#b45309",

      "--bg-radial-1": "rgba(180, 83, 9, 0.10)",
      "--bg-radial-2": "rgba(217, 119, 6, 0.05)",
      "--dot-pattern": "rgba(146, 64, 14, 0.08)",
    },
  },

  rose: {
    id: "rose",
    nameEn: "Crimson Rose",
    nameFa: "زرشکی متالیک",
    primaryColor: "#f43f5e",
    vars: {
      "--bg-base": "#120509",
      "--bg-subtle": "#1a080e",
      "--bg-card": "rgba(34, 10, 18, 0.80)",
      "--bg-elevated": "#2a0d17",
      "--input-bg": "rgba(23, 7, 12, 0.85)",
      "--modal-bg": "#1c0910",

      "--bg-dark": "#120509",
      "--surface-dark": "#1a080e",

      "--border-subtle": "rgba(244, 63, 94, 0.14)",
      "--border-strong": "rgba(244, 63, 94, 0.50)",
      "--card-border": "rgba(244, 63, 94, 0.14)",
      "--card-border-hover": "rgba(244, 63, 94, 0.50)",

      "--primary": "#f43f5e",
      "--primary-hover": "#e11d48",
      "--primary-subtle": "rgba(244, 63, 94, 0.14)",
      "--primary-border": "rgba(244, 63, 94, 0.35)",
      "--accent-glow": "rgba(244, 63, 94, 0.25)",
      "--on-primary": "#4c0519",

      "--accent-green": "#10b981",
      "--accent-yellow": "#f59e0b",
      "--accent-red": "#f43f5e",

      "--text-primary": "#fff1f2",
      "--text-secondary": "#ffe4e6",
      "--text-muted": "#fecdd3",
      "--text-subtle": "#fda4af",
      "--text-main": "#fff1f2",

      "--bg-radial-1": "rgba(244, 63, 94, 0.12)",
      "--bg-radial-2": "rgba(168, 85, 247, 0.05)",
      "--dot-pattern": "rgba(244, 63, 94, 0.06)",
    },
    lightVars: {
      "--bg-base": "#fff1f2",
      "--bg-subtle": "#ffe4e6",
      "--bg-card": "rgba(255, 255, 255, 0.94)",
      "--bg-elevated": "#ffffff",
      "--input-bg": "#ffffff",
      "--modal-bg": "#ffffff",

      "--bg-dark": "#fff1f2",
      "--surface-dark": "#ffe4e6",

      "--border-subtle": "rgba(159, 18, 57, 0.18)",
      "--border-strong": "rgba(190, 18, 60, 0.65)",
      "--card-border": "rgba(159, 18, 57, 0.18)",
      "--card-border-hover": "rgba(190, 18, 60, 0.65)",

      "--primary": "#be123c",
      "--primary-hover": "#9f1239",
      "--primary-subtle": "rgba(190, 18, 60, 0.12)",
      "--primary-border": "rgba(190, 18, 60, 0.38)",
      "--accent-glow": "rgba(190, 18, 60, 0.20)",
      "--on-primary": "#ffffff",

      "--accent-green": "#059669",
      "--accent-yellow": "#d97706",
      "--accent-red": "#e11d48",

      "--text-primary": "#4c0519",
      "--text-secondary": "#881337",
      "--text-muted": "#9f1239",
      "--text-subtle": "#475569",
      "--text-main": "#4c0519",

      "--success-text": "#047857",
      "--warning-text": "#b45309",
      "--danger-text": "#be123c",
      "--info-text": "#be123c",

      "--bg-radial-1": "rgba(190, 18, 60, 0.10)",
      "--bg-radial-2": "rgba(225, 29, 72, 0.05)",
      "--dot-pattern": "rgba(159, 18, 57, 0.08)",
    },
  },

  oled: {
    id: "oled",
    nameEn: "OLED Midnight",
    nameFa: "مشکی مطلق (OLED)",
    primaryColor: "#38bdf8",
    vars: {
      "--bg-base": "#000000",
      "--bg-subtle": "#050505",
      "--bg-card": "rgba(12, 12, 14, 0.94)",
      "--bg-elevated": "#121214",
      "--input-bg": "rgba(14, 14, 16, 0.95)",
      "--modal-bg": "#0a0a0c",

      "--bg-dark": "#000000",
      "--surface-dark": "#050505",

      "--border-subtle": "rgba(255, 255, 255, 0.12)",
      "--border-strong": "rgba(56, 189, 248, 0.50)",
      "--card-border": "rgba(255, 255, 255, 0.12)",
      "--card-border-hover": "rgba(56, 189, 248, 0.50)",

      "--primary": "#38bdf8",
      "--primary-hover": "#0ea5e9",
      "--primary-subtle": "rgba(56, 189, 248, 0.14)",
      "--primary-border": "rgba(56, 189, 248, 0.32)",
      "--accent-glow": "rgba(56, 189, 248, 0.25)",
      "--on-primary": "#000000",

      "--accent-green": "#10b981",
      "--accent-yellow": "#f59e0b",
      "--accent-red": "#f43f5e",

      "--text-primary": "#ffffff",
      "--text-secondary": "#e4e4e7",
      "--text-muted": "#a1a1aa",
      "--text-subtle": "#71717a",
      "--text-main": "#ffffff",

      "--bg-radial-1": "rgba(56, 189, 248, 0.08)",
      "--bg-radial-2": "rgba(14, 165, 233, 0.04)",
      "--dot-pattern": "rgba(255, 255, 255, 0.05)",
    },
    lightVars: {
      "--bg-base": "#f8fafc",
      "--bg-subtle": "#f1f5f9",
      "--bg-card": "rgba(255, 255, 255, 0.95)",
      "--bg-elevated": "#ffffff",
      "--input-bg": "#ffffff",
      "--modal-bg": "#ffffff",

      "--bg-dark": "#f8fafc",
      "--surface-dark": "#f1f5f9",

      "--border-subtle": "rgba(15, 23, 42, 0.12)",
      "--border-strong": "rgba(15, 23, 42, 0.65)",
      "--card-border": "rgba(15, 23, 42, 0.12)",
      "--card-border-hover": "rgba(15, 23, 42, 0.65)",

      "--primary": "#0f172a",
      "--primary-hover": "#1e293b",
      "--primary-subtle": "rgba(15, 23, 42, 0.10)",
      "--primary-border": "rgba(15, 23, 42, 0.35)",
      "--accent-glow": "rgba(15, 23, 42, 0.20)",
      "--on-primary": "#ffffff",

      "--accent-green": "#059669",
      "--accent-yellow": "#d97706",
      "--accent-red": "#e11d48",

      "--text-primary": "#020617",
      "--text-secondary": "#1e293b",
      "--text-muted": "#334155",
      "--text-subtle": "#64748b",
      "--text-main": "#020617",

      "--success-text": "#047857",
      "--warning-text": "#b45309",
      "--danger-text": "#be123c",
      "--info-text": "#0f172a",

      "--bg-radial-1": "rgba(15, 23, 42, 0.08)",
      "--bg-radial-2": "rgba(71, 85, 105, 0.04)",
      "--dot-pattern": "rgba(15, 23, 42, 0.06)",
    },
  },
};
