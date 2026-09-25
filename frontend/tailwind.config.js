/** @type {import("tailwindcss").Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 60% Surfaces & Background Layers
        bg: {
          base: "var(--bg-base)",
          subtle: "var(--bg-subtle)",
          card: "var(--bg-card)",
          elevated: "var(--bg-elevated)",
        },
        // Backward-compatible surface aliases
        canvas: "var(--bg-base, var(--bg-dark))",
        surface: "var(--bg-subtle, var(--surface-dark))",
        input: "var(--input-bg)",
        modal: "var(--modal-bg)",
        card: {
          DEFAULT: "var(--bg-card, var(--card-bg))",
          border: "var(--card-border)",
          "border-hover": "var(--card-border-hover)",
        },

        // Borders & Dividers Hierarchy
        border: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },

        // 30% Text & Typography Hierarchy
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          subtle: "var(--text-subtle)",
          main: "var(--text-primary, var(--text-main))",
        },

        // 10% Brand / Primary & Accent Tokens
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          subtle: "var(--primary-subtle)",
          border: "var(--primary-border)",
          glow: "var(--accent-glow)",
        },
        "on-primary": "var(--on-primary, #000000)",

        // Functional Indicators
        accent: {
          green: "var(--accent-green)",
          yellow: "var(--accent-yellow)",
          red: "var(--accent-red)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        persian: ["Vazirmatn", "Shabnam", "Tahoma", "sans-serif"],
      },
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.16, 1, 0.3, 1)",
        "bounce-soft": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      animation: {
        "pulse-subtle": "pulseSubtle 2.5s ease-in-out infinite",
        "modal-in": "modalIn 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "tab-in": "tabEnter 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "card-in": "cardEnter 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "radar-ping": "radarPing 2.5s cubic-bezier(0, 0, 0.2, 1) infinite",
        "shimmer": "shimmer 2s linear infinite",
        "spin-smooth": "spinSmooth 1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "orbit-spin": "orbitSpin 2.4s linear infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "ping-wave": "pingWave 1.8s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
      keyframes: {
        modalIn: {
          from: { opacity: "0", transform: "scale(0.96) translateY(6px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        tabEnter: {
          from: { opacity: "0", transform: "translateY(8px) scale(0.995)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        cardEnter: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(1.08)" },
        },
        radarPing: {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "75%, 100%": { transform: "scale(2.2)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        spinSmooth: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        orbitSpin: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.95)" },
          "50%": { opacity: "0.85", transform: "scale(1.05)" },
        },
        pingWave: {
          "0%": { transform: "scale(0.8)", opacity: "0.9" },
          "70%, 100%": { transform: "scale(2)", opacity: "0" },
        },
      }
    },
  },
  plugins: [],
};
