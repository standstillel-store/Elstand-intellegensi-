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
        // Dashboard "Terminal Visual Overhaul" — new primary/premium accent.
        // Deliberately its own static token (not CSS-variable-backed like
        // `signal`): the Settings accent picker stays scoped to `signal`
        // (now AI-specific, see below), so gold is never swapped by it.
        // Same hex as the landing page's already-isolated `landing.gold`
        // (#D4AF37) — same brand color, kept as a separate token so
        // dashboard and landing can still never bleed into each other.
        gold: {
          DEFAULT: "#D4AF37",
          dim: "#7A6220",
          glow: "#F0D584",
        },
        // Intelligence Map V4 — third accent for the "AI neural network /
        // cyber" theme (data-flow lines, connection pulses). Static token
        // like gold, not CSS-var-backed — the accent picker stays scoped to
        // `signal` only.
        cyan: {
          DEFAULT: "#22D3EE",
          dim: "#0E7490",
          glow: "#67E8F9",
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
        // Phase 5 REBOOT — now CSS-variable-backed (globals.css defines
        // --landing-*-rgb) so the light/dark toggle can override them, using
        // the exact same <alpha-value> pattern the dashboard's own `signal`
        // token above already proved out for runtime-swappable color. Values
        // are unchanged in dark mode — only now expressed as variables.
        landing: {
          bg: "rgb(var(--landing-bg-rgb) / <alpha-value>)",
          surface: "rgb(var(--landing-surface-rgb) / <alpha-value>)",
          card: "rgb(var(--landing-card-rgb) / <alpha-value>)",
          line: "rgb(var(--landing-line-rgb) / var(--landing-line-alpha))",
          violet: {
            DEFAULT: "rgb(var(--landing-violet-rgb) / <alpha-value>)",
            dim: "rgb(var(--landing-violet-dim-rgb) / <alpha-value>)",
            glow: "rgb(var(--landing-violet-glow-rgb) / <alpha-value>)",
          },
          blue: {
            DEFAULT: "rgb(var(--landing-blue-rgb) / <alpha-value>)",
            dim: "rgb(var(--landing-blue-dim-rgb) / <alpha-value>)",
            glow: "rgb(var(--landing-blue-glow-rgb) / <alpha-value>)",
          },
          cyan: {
            DEFAULT: "rgb(var(--landing-cyan-rgb) / <alpha-value>)",
            dim: "rgb(var(--landing-cyan-dim-rgb) / <alpha-value>)",
            glow: "rgb(var(--landing-cyan-glow-rgb) / <alpha-value>)",
          },
          // Thin signature accent (confirmed Phase 5 decision) — used sparingly,
          // never as a wash. Kept separate from dashboard's `amber` (#F5B942,
          // means "WAIT/caution" there) so the two never carry each other's meaning.
          gold: {
            DEFAULT: "rgb(var(--landing-gold-rgb) / <alpha-value>)",
            dim: "rgb(var(--landing-gold-dim-rgb) / <alpha-value>)",
            glow: "rgb(var(--landing-gold-glow-rgb) / <alpha-value>)",
          },
          // New in the reboot: a landing-only text-color set, so sections that
          // opt into the light/dark toggle don't have to keep using the
          // dashboard's shared `ink` (which stays fixed — dashboard has no
          // light mode, and never should change because of a landing toggle).
          ink: {
            DEFAULT: "rgb(var(--landing-ink-rgb) / <alpha-value>)",
            muted: "rgb(var(--landing-ink-muted-rgb) / <alpha-value>)",
            faint: "rgb(var(--landing-ink-faint-rgb) / <alpha-value>)",
          },
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
        "glow-gold": "0 0 0 1px rgba(212,175,55,0.4), 0 0 24px rgba(240,213,132,0.22)",
        "glow-cyan": "0 0 0 1px rgba(34,211,238,0.4), 0 0 24px rgba(103,232,249,0.24)",
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
        // Phase 5.2 — Confluence Core rebuild. Sphere breathes (scale) and
        // floats (reuses cardFloat) on separate layers so the two transforms
        // never fight each other on one element. The node ring rotates via
        // orbitSlow; each label counter-rotates via orbitSlowReverse (same
        // duration, opposite direction) so text stays upright while its dot
        // still visibly orbits — a standard trick, not two unrelated spins.
        coreBreathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.035)" },
        },
        orbitSlow: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        orbitSlowReverse: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(-360deg)" },
        },
        // Terminal Visual Overhaul — dashboard-only additions below.
        // Slow opacity+scale breathing for the ambient glow sitting behind
        // "important" cards (Intelligence Map, AI Snapshot). Separate from
        // `coreBreathe` (Phase 5, scale-only, faster) so the two can be
        // tuned independently even though they look similar.
        ambientBreathe: {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.04)" },
        },
        // Gentle drift for the background particle field — small, slow,
        // never distracting (see "subtle animations only" in the brief).
        particleFloat: {
          "0%, 100%": { transform: "translate(0, 0)", opacity: "var(--particle-opacity, 0.5)" },
          "50%": { transform: "translate(var(--particle-drift-x, 6px), var(--particle-drift-y, -10px))", opacity: "var(--particle-opacity-peak, 0.9)" },
        },
        // Very slow pan for .bg-grid-animated — reads as "alive", not scrolling.
        gridPan: {
          "0%": { backgroundPosition: "0px 0px" },
          "100%": { backgroundPosition: "34px 34px" },
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
        coreBreathe: "coreBreathe 6s ease-in-out infinite",
        orbitSlow: "orbitSlow 90s linear infinite",
        orbitSlowReverse: "orbitSlowReverse 90s linear infinite",
        ambientBreathe: "ambientBreathe 5s ease-in-out infinite",
        particleFloat: "particleFloat 9s ease-in-out infinite",
        gridPan: "gridPan 22s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
