/** @type {import("tailwindcss").Config} */

// Channel-based tokens (e.g. "45 212 191") so opacity modifiers like bg-primary/10 work.
const channel = (name) => `rgb(var(${name}) / <alpha-value>)`;
const tone = (name) => ({
  DEFAULT: channel(`--${name}-rgb`),
  subtle: `rgb(var(--${name}-rgb) / 0.12)`,
  border: `rgb(var(--${name}-rgb) / 0.32)`,
});

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Surfaces, from the page backdrop up to floating layers.
        canvas: "var(--bg-base)",
        surface: "var(--bg-subtle)",
        elevated: "var(--bg-elevated)",
        modal: "var(--bg-elevated)",
        input: "var(--input-bg)",
        hover: "var(--bg-hover)",
        pressed: "var(--bg-active)",
        card: {
          DEFAULT: "var(--bg-card)",
          border: "var(--border-subtle)",
          "border-hover": "var(--border-strong)",
        },
        border: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },

        // Text hierarchy.
        text: {
          primary: "var(--text-primary)",
          main: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          subtle: "var(--text-subtle)",
        },

        // Brand accent (palette-driven) and status tones (mode-driven).
        primary: {
          ...tone("primary"),
          hover: "var(--primary-hover)",
        },
        "on-primary": "var(--on-primary)",
        success: tone("success"),
        warning: tone("warning"),
        danger: tone("danger"),
        info: tone("info"),
        "on-danger": "var(--on-danger)",
        "on-warning": "var(--on-warning)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        persian: ["var(--font-fa)"],
        mono: ["var(--font-mono)"],
      },
      // Persian script needs a slightly larger size and taller lines at small sizes;
      // index.css raises these variables under [dir="rtl"].
      fontSize: {
        "2xs": ["var(--fs-2xs)", { lineHeight: "var(--lh-2xs)" }],
        xs: ["var(--fs-xs)", { lineHeight: "var(--lh-xs)" }],
        sm: ["var(--fs-sm)", { lineHeight: "var(--lh-sm)" }],
        base: ["var(--fs-base)", { lineHeight: "var(--lh-base)" }],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      animation: {
        "fade-in": "fadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "modal-in": "modalIn 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "sheet-up": "sheetUp 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pop-in": "popIn 160ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "tab-in": "tabIn 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "spin-smooth": "spin 0.9s linear infinite",
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        modalIn: {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        sheetUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "none" },
        },
        popIn: {
          from: { opacity: "0", transform: "translateY(-4px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        tabIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
