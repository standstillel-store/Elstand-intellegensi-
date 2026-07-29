import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#08090D",
          surface: "#12141B",
          raised: "#181B24",
        },
        line: "#23262F",
        // Phase 2 palette — #6D5DF6 / #A78BFA / #00E676 / #FF5252 / #F5B942
        // map 1:1 onto the existing signal / up / down / amber tokens, so
        // every existing class name (text-signal-glow, bg-up/15, etc.)
        // across the whole app inherits the refined colors for free.
        // CSS-variable-backed (not a static hex) so the Settings > Appearance
        // > Accent Color picker can swap it at runtime without a rebuild.
        // <alpha-value> keeps every existing opacity modifier (bg-signal/10,
        // border-signal/40, etc.) working exactly as before.
        signal: {
          DEFAULT: "rgb(var(--signal-rgb) / <alpha-value>)",
          dim: "rgb(var(--signal-dim-rgb) / <alpha-value>)",
          glow: "rgb(var(--signal-glow-rgb) / <alpha-value>)",
        },
        amber: {
          DEFAULT: "#F5B942",
          dim: "#8A6118",
        },
        up: "#00E676",
        down: "#FF5252",
        rugpull: {
          DEFAULT: "#A855F7",
          dim: "#5B2E8A",
          glow: "#C084FC",
        },
        smartmoney: {
          DEFAULT: "#3B82F6",
          dim: "#1E4A8A",
          glow: "#60A5FA",
        },
        ink: {
          DEFAULT: "#E6E8EE",
          muted: "#8A8F98",
          faint: "#565A64",
        },
        // Phase 5 — landing page only. Deliberately isolated from bg/surface/
        // raised above (nearly identical hex values, not reused) so landing
        // redesign work can never accidentally bleed into the dashboard.
        landing: {
          bg: "#09090B",
          surface: "#111827",
          card: "#151823",
          line: "rgba(255,255,255,0.08)",
          violet: { DEFAULT: "#7C6AF6", dim: "#3B3480", glow: "#A79BFF" },
          blue: { DEFAULT: "#3E7BFA", dim: "#1E3B80", glow: "#7FA8FF" },
          cyan: { DEFAULT: "#22D3EE", dim: "#0E6B7A", glow: "#7EEBFB" },
          // Thin signature accent (confirmed Phase 5 decision) — used sparingly,
          // never as a wash. Kept separate from dashboard's `amber` (#F5B942,
          // means "WAIT/caution" there) so the two never carry each other's meaning.
          gold: { DEFAULT: "#D4AF37", dim: "#7A6220", glow: "#F0D584" },
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-signal": "0 0 0 1px rgb(var(--signal-rgb) / 0.35), 0 0 24px rgb(var(--signal-glow-rgb) / 0.20)",
        "glow-up": "0 0 0 1px rgba(0,230,118,0.35), 0 0 20px rgba(0,230,118,0.18)",
        "glow-down": "0 0 0 1px rgba(255,82,82,0.35), 0 0 20px rgba(255,82,82,0.18)",
        "glow-rugpull": "0 0 0 1px rgba(168,85,247,0.4), 0 0 20px rgba(168,85,247,0.22)",
        "glow-smartmoney": "0 0 0 1px rgba(59,130,246,0.4), 0 0 20px rgba(59,130,246,0.22)",
        "glow-amber": "0 0 0 1px rgba(245,185,66,0.35), 0 0 20px rgba(245,185,66,0.18)",
        "card": "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        "glow-landing-violet": "0 0 0 1px rgba(124,106,246,0.4), 0 0 24px rgba(167,155,255,0.22)",
        "glow-landing-cyan": "0 0 0 1px rgba(34,211,238,0.4), 0 0 22px rgba(126,235,251,0.22)",
        "glow-landing-gold": "0 0 0 1px rgba(212,175,55,0.35), 0 0 20px rgba(240,213,132,0.18)",
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        dashFlow: {
          "0%": { strokeDashoffset: "24" },
          "100%": { strokeDashoffset: "0" },
        },
        cardFloat: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
        gaugeSweep: {
          "0%": { strokeDashoffset: "var(--gauge-from, 283)" },
          "100%": { strokeDashoffset: "var(--gauge-to, 0)" },
        },
        typingDot: {
          "0%, 80%, 100%": { opacity: "0.25", transform: "scale(0.8)" },
          "40%": { opacity: "1", transform: "scale(1)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        // Phase 5 — landing hero ambient background. Pairs with `.landing-aurora`
        // (globals.css): shifts backgroundPosition on a large, low-opacity
        // gradient so it reads as a slow atmospheric drift, never a hard pan.
        auroraDrift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        ticker: "ticker 38s linear infinite",
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        fadeUp: "fadeUp 0.35s ease-out both",
        blink: "blink 1.4s ease-in-out infinite",
        dashFlow: "dashFlow 0.7s linear infinite",
        dashFlowSlow: "dashFlow 3s linear infinite",
        cardFloat: "cardFloat 4.5s ease-in-out infinite",
        gaugeSweep: "gaugeSweep 1s ease-out both",
        typingDot: "typingDot 1.2s ease-in-out infinite",
        slideInRight: "slideInRight 0.3s ease-out both",
        scanline: "scanline 2.4s linear infinite",
        auroraDrift: "auroraDrift 26s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
