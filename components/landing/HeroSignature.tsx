"use client";

import { type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

// Phase 5 hero signature element — "Confluence Core."
// Not a generic floating-crystal 3D ornament: this is a literal visualization
// of how ElStand's AI actually reasons (fan-in — many signals converging into
// one verdict), the same mental model as the reasoning chain in
// components/intelligence/ui/NodeDrawer.tsx. CSS/SVG only per the confirmed
// Phase 5 decision — zero new dependencies, no three.js/@react-three/fiber.
//
// Deliberately shows no confidence number or score here: this element is
// atmospheric/conceptual, not a data readout, so there's nothing here that
// could be mistaken for a real (or fake) figure — the actual AI Reasoning
// section (Phase 5.3) is where real, clearly-labeled output belongs.

const SIZE = 420;
const CENTER = SIZE / 2;
const NODE_RADIUS = 175;
const CORE_RADIUS = 62;

const THREADS = [
  { label: "RSI", angleDeg: -125, hue: "violet" as const },
  { label: "WHALE", angleDeg: -55, hue: "cyan" as const },
  { label: "FUNDING", angleDeg: -5, hue: "blue" as const },
  { label: "NEWS", angleDeg: 55, hue: "violet" as const },
  { label: "MACRO", angleDeg: 125, hue: "cyan" as const },
];

// Mirrors landing.violet/blue/cyan in tailwind.config.ts. Kept as plain hex
// here (not Tailwind stroke-* classes) because Tailwind's JIT scanner can't
// see color names built at runtime from a data array — if those tokens ever
// change, update both places.
const STROKE: Record<(typeof THREADS)[number]["hue"], string> = {
  violet: "#7C6AF6",
  blue: "#3E7BFA",
  cyan: "#22D3EE",
};

function pointOnCircle(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

export function HeroSignature() {
  const prefersReducedMotion = useReducedMotion();

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const springX = useSpring(px, { stiffness: 60, damping: 18 });
  const springY = useSpring(py, { stiffness: 60, damping: 18 });
  const rotateX = useTransform(springY, [-40, 40], [6, -6]);
  const rotateY = useTransform(springX, [-40, 40], [-6, 6]);

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    px.set(((e.clientX - rect.left) / rect.width - 0.5) * 80);
    py.set(((e.clientY - rect.top) / rect.height - 0.5) * 80);
  }
  function handlePointerLeave() {
    px.set(0);
    py.set(0);
  }

  return (
    <div className="mx-auto w-full max-w-[420px]" style={{ perspective: 1000 }}>
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative aspect-square"
      >
        <div className="landing-aurora pointer-events-none absolute -inset-10 -z-10 rounded-full opacity-70" aria-hidden="true" />

        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" aria-hidden="true">
          <defs>
            <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#A79BFF" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#7C6AF6" stopOpacity="0" />
            </radialGradient>
            {/* The one gold thread — an accent on the ring, never a fill. */}
            <linearGradient id="core-ring" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7C6AF6" />
              <stop offset="55%" stopColor="#22D3EE" />
              <stop offset="100%" stopColor="#D4AF37" />
            </linearGradient>
          </defs>

          {THREADS.map((t) => {
            const outer = pointOnCircle(t.angleDeg, NODE_RADIUS);
            const inner = pointOnCircle(t.angleDeg, CORE_RADIUS + 4);
            const stroke = STROKE[t.hue];
            return (
              <g key={t.label}>
                <line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={stroke} strokeOpacity={0.28} strokeWidth={1.5} />
                <line
                  x1={outer.x}
                  y1={outer.y}
                  x2={inner.x}
                  y2={inner.y}
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray="3 9"
                  strokeLinecap="round"
                  className={prefersReducedMotion ? undefined : "animate-dashFlowSlow"}
                />
                <circle cx={outer.x} cy={outer.y} r={4} fill={stroke} />
              </g>
            );
          })}

          <circle cx={CENTER} cy={CENTER} r={CORE_RADIUS + 30} fill="url(#core-glow)" />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={CORE_RADIUS}
            fill="rgba(21,24,35,0.65)"
            stroke="url(#core-ring)"
            strokeWidth={1.5}
            className={prefersReducedMotion ? undefined : "animate-pulseGlow"}
          />
        </svg>

        {THREADS.map((t) => {
          const p = pointOnCircle(t.angleDeg, NODE_RADIUS + 24);
          return (
            <span
              key={t.label}
              className="eyebrow absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] tracking-[0.2em] text-ink-faint"
              style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%` }}
            >
              {t.label}
            </span>
          );
        })}

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="eyebrow text-[9px] tracking-[0.2em] text-landing-gold">AI CORE</span>
          <span className="mt-1 font-display text-sm text-ink">Confluence</span>
        </div>
      </motion.div>
    </div>
  );
}
