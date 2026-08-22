"use client";

import { type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

// Phase 5.2 — Confluence Core, rebuilt per the "final polish" brief: a glass-
// sphere AI entity, not a flat circle-and-lines diagram. Still CSS/SVG only —
// no three.js/@react-three/fiber/WebGL, per the confirmed Phase 5 decision.
// Every layer below is a *fake*-3D technique (layered gradients, an inset
// box-shadow for roundness, a blurred specular highlight, a masked
// conic-gradient rim) rather than real geometry — deliberately, since that's
// what stays cheap enough to keep LCP fast.
//
// This is still a literal visualization of how ElStand's AI actually reasons
// (fan-in — many signals converging into one verdict; the same model as the
// reasoning chain in components/intelligence/ui/NodeDrawer.tsx), not a
// generic ornament. No confidence number or score anywhere in it — this
// element is atmospheric/conceptual; real, clearly-labeled numbers live in
// the AI Reasoning section (Phase 5.3), never here.

const SIZE = 440;
const CENTER = SIZE / 2;
const NODE_RADIUS = 180;
const CORE_INNER_STOP = 74;

const NODE_LABELS = ["MACRO", "WHALE", "NEWS", "FUNDING", "ON-CHAIN", "DEX", "CEX", "SENTIMENT"] as const;
const HUES = ["violet", "cyan", "blue"] as const;

const NODES = NODE_LABELS.map((label, i) => ({
  label,
  angleDeg: -90 + (360 / NODE_LABELS.length) * i,
  hue: HUES[i % HUES.length],
}));

// Mirrors landing.violet/blue/cyan in tailwind.config.ts. Plain hex here (not
// Tailwind stroke-*/bg-* classes) because Tailwind's JIT scanner can't see
// color names built at runtime from a data array — if those tokens change,
// update both places.
const STROKE: Record<(typeof HUES)[number], string> = {
  violet: "#7C6AF6",
  blue: "#3E7BFA",
  cyan: "#22D3EE",
};

function pointOnCircle(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

// The sphere itself — isolated so the layer stack (bloom / rim / body /
// highlight / inner glow / label) reads clearly on its own.
function GlassSphere() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="animate-cardFloat">
        <div className="relative h-[132px] w-[132px] animate-coreBreathe">
          {/* Cast shadow — the one thing that actually sells "floating." */}
          <div
            className="absolute -bottom-7 left-1/2 h-4 w-20 -translate-x-1/2 rounded-full opacity-60"
            style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 75%)", filter: "blur(4px)" }}
          />

          {/* Outer bloom. */}
          <div
            className="absolute -inset-9 rounded-full opacity-80"
            style={{ background: "radial-gradient(circle, rgba(124,106,246,0.26), transparent 70%)", filter: "blur(18px)" }}
          />

          {/* Rim light — thin conic-gradient ring, masked to just the edge.
              Violet → cyan → one short gold arc (the only gold in the whole
              piece — a few degrees of a 360° ring is comfortably under the
              "max 5%" ceiling). Rotates slowly on its own. */}
          <div
            className="absolute -inset-[3px] animate-orbitSlow rounded-full"
            style={{
              background:
                "conic-gradient(from 200deg, transparent 0deg, rgba(124,106,246,0.75) 55deg, rgba(34,211,238,0.7) 140deg, transparent 205deg, transparent 300deg, rgba(212,175,55,0.9) 328deg, rgba(212,175,55,0.9) 340deg, transparent 356deg)",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            }}
          />

          {/* Sphere body — volumetric gradient + inset shadow for curvature. */}
          <div
            className="absolute inset-0 rounded-full backdrop-blur-[2px]"
            style={{
              background:
                "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.38) 0%, rgba(167,155,255,0.26) 16%, rgba(124,106,246,0.30) 44%, rgba(21,24,35,0.94) 80%)",
              boxShadow: "inset -14px -14px 34px rgba(0,0,0,0.55), inset 9px 9px 22px rgba(255,255,255,0.06)",
            }}
          />

          {/* Specular highlight — the "glass," not "flat circle," cue. */}
          <div
            className="absolute left-[20%] top-[15%] h-[26%] w-[38%] rounded-full opacity-80"
            style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0.6), transparent 72%)", filter: "blur(3px)", transform: "rotate(-18deg)" }}
            aria-hidden="true"
          />

          {/* Inner energy — slow pulse, distinct rhythm from the rim/breathe. */}
          <div
            className="absolute inset-5 animate-pulseGlow rounded-full"
            style={{ background: "radial-gradient(circle, rgba(167,155,255,0.3), transparent 70%)" }}
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="eyebrow text-[8px] tracking-[0.2em] text-landing-gold">AI CORE</span>
            <span className="mt-0.5 font-display text-xs text-ink">Confluence</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// A handful of small ambient motes — twinkle in place, no orbit of their own.
// Kept separate from the 7 labeled Oracle Nodes so "energy field" reads as
// atmosphere, not an 8th data source.
const MOTES = Array.from({ length: 9 }, (_, i) => ({
  x: 12 + ((i * 37) % 76),
  y: 10 + ((i * 53) % 80),
  delay: (i % 5) * 0.5,
  size: 2 + (i % 3),
}));

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
    <div className="mx-auto w-full max-w-[460px]" style={{ perspective: 1000 }}>
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative aspect-square"
      >
        {/* Cinematic backdrop: aurora wash + two independently-drifting soft
            "meshes" at different sizes/speeds (parallax-of-speed, not just
            one flat gradient) + grain so none of it reads as a flat digital wash. */}
        <div className="landing-aurora pointer-events-none absolute -inset-12 -z-20 rounded-full opacity-70" aria-hidden="true" />
        <div
          className="pointer-events-none absolute left-[8%] top-[10%] -z-10 h-[46%] w-[46%] rounded-full opacity-50 [animation:auroraDrift_38s_ease-in-out_infinite]"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.14), transparent 70%)", backgroundSize: "220% 220%", filter: "blur(28px)" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-[6%] right-[10%] -z-10 h-[40%] w-[40%] rounded-full opacity-50 [animation:auroraDrift_46s_ease-in-out_infinite_reverse]"
          style={{ background: "radial-gradient(circle, rgba(124,106,246,0.14), transparent 70%)", backgroundSize: "220% 220%", filter: "blur(26px)" }}
          aria-hidden="true"
        />
        <div className="landing-noise -z-10 rounded-full" aria-hidden="true" />

        {/* Ambient motes. */}
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="animate-pulseGlow absolute rounded-full bg-landing-cyan-glow"
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              width: m.size,
              height: m.size,
              opacity: 0.5,
              animationDelay: `${m.delay}s`,
              animationDuration: "3.2s",
            }}
            aria-hidden="true"
          />
        ))}

        {/* Oracle Node ring — rotates as one rigid group (orbitSlow); each
            label counter-rotates (orbitSlowReverse, identical duration) so
            text stays upright while still visibly carried around the sphere. */}
        <div className="absolute inset-0 animate-orbitSlow" aria-hidden="true">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
            {NODES.map((n) => {
              const outer = pointOnCircle(n.angleDeg, NODE_RADIUS);
              const inner = pointOnCircle(n.angleDeg, CORE_INNER_STOP);
              const stroke = STROKE[n.hue];
              return (
                <g key={n.label}>
                  <line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={stroke} strokeOpacity={0.25} strokeWidth={1.5} />
                  {!prefersReducedMotion && (
                    <line
                      x1={outer.x}
                      y1={outer.y}
                      x2={inner.x}
                      y2={inner.y}
                      stroke={stroke}
                      strokeWidth={2}
                      strokeDasharray="3 10"
                      strokeLinecap="round"
                      className="animate-dashFlowSlow"
                    />
                  )}
                  <circle cx={outer.x} cy={outer.y} r={4} fill={stroke} />
                  <circle cx={outer.x} cy={outer.y} r={9} fill={stroke} opacity={0.18} />
                </g>
              );
            })}
          </svg>

          {NODES.map((n) => {
            const p = pointOnCircle(n.angleDeg, NODE_RADIUS + 26);
            return (
              <span
                key={n.label}
                className="eyebrow animate-orbitSlowReverse absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] tracking-[0.2em] text-ink-faint"
                style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%` }}
              >
                {n.label}
              </span>
            );
          })}
        </div>

        <GlassSphere />
      </motion.div>
    </div>
  );
}
