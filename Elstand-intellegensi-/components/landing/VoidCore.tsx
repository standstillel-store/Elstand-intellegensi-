"use client";

import { type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

// Phase 5 REBOOT — "ElVoid Core". Replaces HeroSignature.tsx's "Confluence
// Core" (glass sphere + orbiting labels) with a different idea: a
// gravitational void that market signals fall into, with one glow rising
// out of it. The AI is literally named "ElVoid" — this leans into that
// directly instead of a generic glowing orb. Darkness is the object here,
// not light: the void itself is the darkest point in the whole
// composition; only the rim and the infalling threads carry light.
//
// Primary accent is gold/amber, not violet — a deliberate nod to the actual
// phosphor color of the "Bloomberg Terminal" the product is named after
// (and to the black+orange reference in this round's moodboard). Violet/
// blue survive only as a thin secondary arc in the rim, not the dominant
// color — inverse of the previous version, which was violet-dominant with
// a thin gold arc.
//
// Same engineering constraints as before: CSS/SVG only (no three.js/
// @react-three/fiber — still no way to render/verify a WebGL scene in a
// sandbox with no browser and no network). The animateMotion/mpath
// infall-particle technique is copied from the already-working pattern in
// components/intelligence/GlobalIntelligenceMap.tsx, not invented fresh.
//
// Unlike the previous version, this is actually responsive: everything is
// positioned in percentages of a 560x560 reference frame (or via SVG
// viewBox, which scales natively) inside a container sized per breakpoint,
// instead of a fixed 440px box — a fixed-width object that size doesn't
// fit a 375px phone viewport without overflowing or looking oversized,
// which is one concrete, plausible piece of "why this didn't land."

const SIZE = 560;
const CENTER = SIZE / 2;
const VOID_RADIUS = 92;
const NODE_RADIUS = 246;
const COIN_RADIUS = VOID_RADIUS + 58;

// v2 addition, from the reference photo the user uploaded of a numbered
// hex-tessellated sphere with an ember particle field. Not embedded as an
// image asset — it's very likely a stock/generated render of unknown
// license, and dropping a found photo into a real product's codebase as a
// permanent visual asset is a different, riskier thing than using it for
// style reference the way the moodboard images earlier in this project
// were used. What's actually carried over into code below: a hex-faceted
// texture on the void's surface (fading in toward the rim, same "texture
// emerges from darkness" logic as everything else here) and a small ring
// of coin discs — CIRCLE + TICKER TEXT, not brand logo artwork, so there's
// no trademark-artwork question either.
const COINS = [
  { ticker: "BTC", angle: -66 },
  { ticker: "ETH", angle: 6 },
  { ticker: "SOL", angle: 78 },
  { ticker: "BNB", angle: 150 },
  { ticker: "XRP", angle: -138 },
] as const;

const NODES = [
  { label: "MACRO", angle: -90 },
  { label: "WHALE", angle: -45 },
  { label: "FUNDING", angle: 0 },
  { label: "CEX", angle: 45 },
  { label: "SENTIMENT", angle: 90 },
  { label: "DEX", angle: 135 },
  { label: "ON-CHAIN", angle: 180 },
  { label: "NEWS", angle: -135 },
] as const;

function pt(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function infallPath(angle: number) {
  const outer = pt(angle, NODE_RADIUS);
  // The control point is offset in angle, not just radius — three colinear
  // points on a quadratic Bezier produce a straight line (no bend at all),
  // which would just be a spoke, not an infall. The +14deg offset (same
  // sign for every node) makes every thread bend the same rotational way,
  // reading as one coherent swirl into the void rather than straight spokes.
  const mid = pt(angle + 14, VOID_RADIUS + (NODE_RADIUS - VOID_RADIUS) * 0.5);
  const edge = pt(angle, VOID_RADIUS + 6);
  return `M ${outer.x} ${outer.y} Q ${mid.x} ${mid.y} ${edge.x} ${edge.y}`;
}

export function VoidCore() {
  const reduceMotion = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const springRx = useSpring(rx, { stiffness: 60, damping: 18 });
  const springRy = useSpring(ry, { stiffness: 60, damping: 18 });
  const rotateX = useTransform(springRy, (v) => (reduceMotion ? 0 : v));
  const rotateY = useTransform(springRx, (v) => (reduceMotion ? 0 : v));

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rx.set(px * 10);
    ry.set(py * -10);
  }
  function onPointerLeave() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <div
      className="relative mx-auto aspect-square w-[280px] sm:w-[380px] lg:w-[520px]"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ perspective: 1000 }}
    >
      {/* Ambient bloom — much larger and softer than the object itself; this is the atmosphere the whole hero sits in, not a halo around one shape. */}
      <div
        className="pointer-events-none absolute -inset-24 rounded-full opacity-70 sm:-inset-32"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.16), transparent 68%)", filter: "blur(30px)" }}
      />

      <motion.div className="absolute inset-0" style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}>
        {/* Emission — the one thing coming OUT, rising above the void. */}
        <motion.div
          className="absolute left-1/2 top-[6%] h-[30%] w-px -translate-x-1/2"
          style={{ background: "linear-gradient(to top, rgba(240,213,132,0.55), transparent)", filter: "blur(1px)" }}
          animate={reduceMotion ? undefined : { opacity: [0.35, 0.85, 0.35] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Infalling threads + particles. */}
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          {NODES.map((n) => (
            <path key={n.label} id={`infall-${n.label}`} d={infallPath(n.angle)} fill="none" stroke="rgba(212,175,55,0.22)" strokeWidth={1} />
          ))}
          {!reduceMotion &&
            NODES.map((n, i) => (
              <circle key={n.label} r={1.6} fill="#F0D584">
                <animateMotion dur={`${3 + (i % 3)}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#infall-${n.label}`} />
                </animateMotion>
              </circle>
            ))}

          {/* Coin ring — circle + ticker text, not logo artwork. Static on
              purpose: VoidCore already has three moving layers (rim,
              particles, emission); a fourth spinning one would be more
              motion than signal. */}
          {COINS.map((c) => {
            const p = pt(c.angle, COIN_RADIUS);
            return (
              <g key={c.ticker} transform={`translate(${p.x} ${p.y})`}>
                <circle r={15} fill="rgba(9,9,11,0.85)" stroke="rgba(240,213,132,0.55)" strokeWidth={1} />
                <circle r={15} fill="none" stroke="rgba(126,235,251,0.25)" strokeWidth={0.5} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={7.5} fill="#F0D584" className="mono-num">
                  {c.ticker}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Labels — fixed, not orbiting. Legible at a glance; only the ring and particles carry motion. */}
        {NODES.map((n) => {
          const p = pt(n.angle, NODE_RADIUS + 16);
          return (
            <span
              key={n.label}
              className="mono-num absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] tracking-[0.15em] text-ink-faint sm:text-[10px]"
              style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%` }}
            >
              {n.label}
            </span>
          );
        })}

        {/* The void itself — the darkest point in the composition, not the brightest. */}
        <div
          className="absolute rounded-full"
          style={{
            left: `${((CENTER - VOID_RADIUS) / SIZE) * 100}%`,
            top: `${((CENTER - VOID_RADIUS) / SIZE) * 100}%`,
            width: `${((VOID_RADIUS * 2) / SIZE) * 100}%`,
            height: `${((VOID_RADIUS * 2) / SIZE) * 100}%`,
            background: "radial-gradient(circle at 35% 30%, #1c1712 0%, #0a0806 45%, #020202 100%)",
            boxShadow: "inset 0 0 40px 10px rgba(0,0,0,0.9), 0 0 60px 10px rgba(0,0,0,0.7)",
          }}
        >
          {/* Hex facet texture — the void's surface reads as made of many
              small panels, not a smooth gradient. Faded in via mask so it's
              invisible at the exact center and strongest at the rim, same
              "texture emerges from darkness" logic as the rest of the file.
              Circle-shaped mask/fill (not a rect) so there's no square-corner
              clipping to worry about — it can't poke outside a round parent
              if it was never square to begin with. */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <pattern id="voidHex" width="12" height="10.4" patternUnits="userSpaceOnUse">
                <polygon points="6,0 12,3 12,9 6,12 0,9 0,3" fill="none" stroke="rgba(126,235,251,0.4)" strokeWidth={0.5} />
              </pattern>
              <radialGradient id="voidHexFade" cx="50%" cy="50%" r="50%">
                <stop offset="45%" stopColor="white" stopOpacity={0} />
                <stop offset="100%" stopColor="white" stopOpacity={0.9} />
              </radialGradient>
              <mask id="voidHexMask">
                <circle cx={50} cy={50} r={50} fill="url(#voidHexFade)" />
              </mask>
            </defs>
            <circle cx={50} cy={50} r={50} fill="url(#voidHex)" mask="url(#voidHexMask)" />
          </svg>

          {/* Rim light — thin conic ring, gold-dominant with a short violet/blue arc for depth. Reuses the existing orbitSlow keyframe. */}
          <div
            className={reduceMotion ? "" : "animate-orbitSlow"}
            style={{
              position: "absolute",
              inset: -3,
              borderRadius: "9999px",
              padding: 2,
              background:
                "conic-gradient(from 0deg, #F0D584 0deg, #D4AF37 140deg, #7C6AF6 190deg, #3E7BFA 220deg, #D4AF37 280deg, #F0D584 360deg)",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}
