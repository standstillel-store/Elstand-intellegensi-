"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

// ============================================================================
// OrbIntelligence — full rebuild of the hero signature element (replaces
// VoidCore.tsx). Brief: "Futuristic AI Intelligence Core", premium/minimal/
// dark, Bloomberg Terminal + Apple + Perplexity in feel. Concrete changes
// from VoidCore:
//   1. The center is a bright, breathing gradient core (not a dark void) —
//      color-mixed via CSS variables so it can shift live with AI Energy.
//   2. Every node has a real hover affordance: a small insight tooltip
//      (Whale Score, MVRV, Funding Rate, ...), not just a static label.
//   3. Connector lines carry an actual flowing data-particle (SVG
//      animateMotion + mpath — same primitive VoidCore/GlobalIntelligenceMap
//      already use, so this introduces no new animation technique).
//   4. Color is driven by one `energyLevel` (0..1) value: green → yellow →
//      orange → red. AI Energy in this codebase (lib/energy.ts) is a
//      per-user balance with no meaning on a logged-out marketing page, so
//      here it free-runs as a slow ambient demo. Pass `energyLevel`
//      explicitly (e.g. from useEnergy()/dashboard state) to drive it from
//      the real balance instead — the demo loop is skipped whenever the
//      prop is provided.
//
// Sizing follows VoidCore's convention: everything is positioned as a
// percentage of a fixed reference frame, inside a container sized per
// breakpoint — so it scales cleanly from a 375px phone to a wide desktop
// without a fixed-pixel box overflowing or looking oversized.
// ============================================================================

const SIZE = 560;
const CENTER = SIZE / 2;
const CORE_RADIUS = 88;
const NODE_RADIUS = 232;

type NodeDef = {
  label: string;
  angle: number;
  metric: string;
  value: string;
};

const NODES: NodeDef[] = [
  { label: "MACRO", angle: -90, metric: "DXY Trend", value: "Bearish" },
  { label: "WHALE", angle: -45, metric: "Whale Score", value: "78 / 100" },
  { label: "FUNDING", angle: 0, metric: "Funding Rate", value: "+0.021%" },
  { label: "CEX", angle: 45, metric: "Net Flow", value: "-1,240 BTC" },
  { label: "SENTIMENT", angle: 90, metric: "Fear & Greed", value: "64 (Greed)" },
  { label: "DEX", angle: 135, metric: "DEX Volume", value: "$412M / 24h" },
  { label: "ON-CHAIN", angle: 180, metric: "MVRV", value: "1.85" },
  { label: "NEWS", angle: -135, metric: "News Impact", value: "Medium" },
];

function pt(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function pct(v: number) {
  return `${(v / SIZE) * 100}%`;
}

// energy stops: calm (green) -> active (yellow) -> high (orange) -> critical (red)
// c1 = hot core highlight, c2 = main glow/ring color, c3 = deep shadow/halo color
const ENERGY_STOPS = [
  { t: 0.0, c1: "#eafff3", c2: "#34d399", c3: "#0f5132" },
  { t: 0.35, c1: "#fff9e0", c2: "#fbbf24", c3: "#7a5a08" },
  { t: 0.68, c1: "#ffe9d6", c2: "#fb923c", c3: "#7a3d0f" },
  { t: 1.0, c1: "#ffe1e1", c2: "#ef4444", c3: "#6e1414" },
] as const;

function hexToRgb(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
function lerpColor(a: string, b: string, t: number) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bch = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r}, ${g}, ${bch})`;
}
function energyColors(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < ENERGY_STOPS.length - 1; i++) {
    const a = ENERGY_STOPS[i];
    const b = ENERGY_STOPS[i + 1];
    if (clamped >= a.t && clamped <= b.t) {
      const lt = (clamped - a.t) / (b.t - a.t);
      return { c1: lerpColor(a.c1, b.c1, lt), c2: lerpColor(a.c2, b.c2, lt), c3: lerpColor(a.c3, b.c3, lt) };
    }
  }
  const last = ENERGY_STOPS[ENERGY_STOPS.length - 1];
  return { c1: last.c1, c2: last.c2, c3: last.c3 };
}

export function OrbIntelligence({ energyLevel }: { energyLevel?: number }) {
  const reduceMotion = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Demo loop only runs when the caller doesn't control energyLevel directly.
  useEffect(() => {
    if (energyLevel !== undefined) {
      const { c1, c2, c3 } = energyColors(energyLevel);
      const el = wrapRef.current;
      if (el) {
        el.style.setProperty("--c1", c1);
        el.style.setProperty("--c2", c2);
        el.style.setProperty("--c3", c3);
      }
      return;
    }

    const el = wrapRef.current;
    if (!el) return;

    if (reduceMotion) {
      const { c1, c2, c3 } = energyColors(0.08);
      el.style.setProperty("--c1", c1);
      el.style.setProperty("--c2", c2);
      el.style.setProperty("--c3", c3);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const PERIOD_MS = 26000; // one slow calm->critical->calm sweep
    const tick = (now: number) => {
      const elapsed = (now - start) % PERIOD_MS;
      const phase = elapsed / PERIOD_MS; // 0..1
      // sine-shaped so it rests near "calm" most of the time and only
      // briefly touches the high end — ambient, not alarming.
      const t = Math.pow((Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2, 1.6);
      const { c1, c2, c3 } = energyColors(t);
      el.style.setProperty("--c1", c1);
      el.style.setProperty("--c2", c2);
      el.style.setProperty("--c3", c3);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [energyLevel, reduceMotion]);

  const paths = useMemo(
    () =>
      NODES.map((n) => {
        const outer = pt(n.angle, NODE_RADIUS - 20);
        const inner = pt(n.angle, CORE_RADIUS + 4);
        return { ...n, id: `orb-line-${n.label}`, d: `M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}` };
      }),
    [],
  );

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto aspect-square w-[260px] sm:w-[380px] lg:w-[480px]"
      style={
        {
          "--c1": "#fff9e0",
          "--c2": "#fbbf24",
          "--c3": "#7a5a08",
        } as CSSProperties
      }
    >
      {/* Outer ambient halo — separate blurred layer, kept well outside the
          core so it reads as atmosphere, not a hard ring. */}
      <div
        className="pointer-events-none absolute rounded-full blur-[26px] transition-colors duration-1000"
        style={{
          left: "19%",
          top: "19%",
          width: "62%",
          height: "62%",
          background: "radial-gradient(circle, var(--c2) 0%, var(--c3) 42%, transparent 72%)",
          opacity: 0.55,
        }}
      />

      {/* Connector lines + flowing data particles */}
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        {paths.map((p) => (
          <path key={p.id} id={p.id} d={p.d} fill="none" stroke="var(--c2)" strokeOpacity={0.35} strokeWidth={1} />
        ))}
        {!reduceMotion &&
          paths.map((p, i) => (
            <circle key={p.id} r={2} fill="var(--c1)">
              <animateMotion dur={`${2.2 + (i % 3) * 0.5}s`} begin={`${i * 0.3}s`} repeatCount="indefinite">
                <mpath href={`#${p.id}`} />
              </animateMotion>
            </circle>
          ))}
      </svg>

      {/* Pulse rings around the core */}
      <div
        className="pointer-events-none absolute animate-coreBreathe rounded-full border transition-colors duration-1000"
        style={{
          left: "50%",
          top: "50%",
          width: `${((CORE_RADIUS * 2 + 26) / SIZE) * 100}%`,
          height: `${((CORE_RADIUS * 2 + 26) / SIZE) * 100}%`,
          transform: "translate(-50%, -50%)",
          borderColor: "var(--c2)",
          opacity: 0.4,
        }}
      />

      {/* The core itself */}
      <div
        className="absolute animate-coreBreathe rounded-full transition-shadow duration-1000"
        style={{
          left: `${((CENTER - CORE_RADIUS) / SIZE) * 100}%`,
          top: `${((CENTER - CORE_RADIUS) / SIZE) * 100}%`,
          width: `${((CORE_RADIUS * 2) / SIZE) * 100}%`,
          height: `${((CORE_RADIUS * 2) / SIZE) * 100}%`,
          boxShadow: "0 0 26px 4px var(--c2), 0 0 60px 16px var(--c3), inset 0 0 30px rgba(0,0,0,0.4)",
        }}
      >
        {/* base color field — smooth blended gradients, no noise/grain so it
            stays crisp at any resolution */}
        <div
          className={reduceMotion ? "absolute inset-0 rounded-full" : "absolute inset-0 rounded-full animate-orbitSlow"}
          style={{
            background:
              "radial-gradient(circle at 62% 38%, var(--c1) 0%, var(--c2) 16%, transparent 40%)," +
              "radial-gradient(circle at 28% 68%, var(--c2) 0%, transparent 55%)," +
              "radial-gradient(circle at 78% 78%, var(--c3) 0%, transparent 50%)," +
              "conic-gradient(from 210deg at 42% 55%, var(--c3), var(--c2), var(--c1), var(--c2), var(--c3))",
          }}
        />
        <div
          className={
            reduceMotion ? "absolute inset-0 rounded-full" : "absolute inset-0 rounded-full animate-orbitSlowReverse"
          }
          style={{
            background:
              "radial-gradient(circle at 25% 28%, rgba(255,255,255,0.5), transparent 30%)," +
              "radial-gradient(circle at 70% 64%, rgba(0,0,0,0.4), transparent 45%)",
            mixBlendMode: "soft-light",
          }}
        />
        {/* glass highlight — fixed, gives sphere volume */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.12) 14%, transparent 32%)," +
              "radial-gradient(circle at 72% 80%, rgba(0,0,0,0.4) 0%, transparent 45%)," +
              "radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.35) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "inset 0 0 18px rgba(255,255,255,0.15), inset 0 0 3px rgba(255,255,255,0.45)" }}
        />
      </div>

      {/* Nodes */}
      {NODES.map((n) => {
        const p = pt(n.angle, NODE_RADIUS);
        const isHovered = hovered === n.label;
        return (
          <div
            key={n.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: pct(p.x), top: pct(p.y) }}
            onMouseEnter={() => setHovered(n.label)}
            onMouseLeave={() => setHovered((h) => (h === n.label ? null : h))}
            onFocus={() => setHovered(n.label)}
            onBlur={() => setHovered((h) => (h === n.label ? null : h))}
          >
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-full border border-landing-line bg-landing-card transition-all duration-200 sm:h-9 sm:w-9"
              style={{
                borderColor: isHovered ? "var(--c2)" : undefined,
                boxShadow: isHovered ? "0 0 20px var(--c3)" : "none",
                transform: isHovered ? "scale(1.12)" : "scale(1)",
              }}
              aria-describedby={`orb-tooltip-${n.label}`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full transition-colors duration-500"
                style={{ background: "var(--c1)", boxShadow: "0 0 8px 1px var(--c2)" }}
              />
            </button>

            {/* label */}
            <span
              className={`mono-num absolute left-1/2 top-[135%] -translate-x-1/2 whitespace-nowrap text-[9px] tracking-[0.15em] transition-colors sm:text-[10px] ${
                isHovered ? "text-ink" : "text-ink-faint"
              }`}
            >
              {n.label}
            </span>

            {/* insight tooltip */}
            <div
              id={`orb-tooltip-${n.label}`}
              role="tooltip"
              className={`pointer-events-none absolute left-1/2 bottom-[145%] -translate-x-1/2 whitespace-nowrap rounded-lg border border-landing-line bg-landing-card px-3 py-2 text-[11px] shadow-card transition-all duration-150 ${
                isHovered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
            >
              <span className="text-ink-faint">{n.metric}</span>
              <span className="ml-1.5 font-semibold text-ink">{n.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
