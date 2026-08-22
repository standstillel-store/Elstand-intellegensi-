"use client";

import { type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { Container, LandingEyebrow } from "./shared";

// Phase 5 REBOOT — Terminal Preview (brief's own Section 2, called out as
// "the strongest section"). This is a cinematic MOCKUP, not live data —
// LiveMarketPreview.tsx (right below this, at #intelligence) already owns
// real data. Everything numeric here is fixed/illustrative on purpose, and
// says so in the frame footer, so it can't be mistaken for a live feed —
// same "no dummy data passed off as real" principle the rest of the app
// holds to, just applied to a preview instead of a data section.
//
// "Persis sama 3 gambar itu" — the brief this whole reboot is under
// (document 2) explicitly says the opposite: "Do NOT copy any website...
// must not resemble one specific website," and three mutually-incompatible
// visual languages (Tenor's cream minimalism, ChainGPT's orange brutalism,
// Flipside's saturated color-block chapters) can't literally be cloned at
// once anyway. What's actually pulled from each, concretely, in this file:
//   - Tenor + ChainGPT -> the framed "window" device (screenshot-in-a-card
//     vs. draggable-panel-with-x), merged into one chrome header below.
//   - ChainGPT -> corner marks, mono/technical labels, black+amber.
//   - Flipside -> the oversized ALL-CAPS chapter headline and a full-bleed
//     background distinct from Hero's, so this reads as its own "chapter"
//     on scroll instead of a continuation of the hero.
//
// "Animasi 3d HD" — no three.js/@react-three/fiber here, same reasoning as
// VoidCore (no network access to install or verify a WebGL scene, and a
// new heavy dependency is a worse debugging position for a GitHub-web-only
// workflow than a CSS/SVG miss would be). What this uses instead, that
// VoidCore didn't:
//   - Real SVG lighting: feSpecularLighting + fePointLight on the small
//     hex seal in the header, which computes actual per-pixel specular
//     highlights from a point-light position — genuinely dimensional, not
//     a gradient standing in for one. Filter attribute casing in JSX is a
//     known sharp edge; if it doesn't render, the badge just falls back to
//     a flat hexagon (fails quietly, doesn't break the build).
//   - True multi-layer parallax: chart plane, glow plane, and badge move
//     at three different rates off one pointer position, instead of one
//     flat surface tilting — that difference in speed is what actually
//     reads as depth, more than any single element's own shading does.

// Deterministic candle data — index-derived, not Math.random(), so server
// and client render identically (no hydration mismatch). Y is SVG-space:
// smaller y = higher price. Shape: a pullback (y climbs) then a rally into
// the AI callout (y drops sharply at the end).
const CLOSE_Y = [128, 136, 131, 144, 150, 158, 153, 146, 138, 126, 116, 104, 94, 77, 61, 47, 39, 34];
const CHART_W = 600;
const CHART_H = 210;
const CANDLE_GAP = CHART_W / CLOSE_Y.length;

const CANDLES = CLOSE_Y.map((closeY, i) => {
  const openY = i === 0 ? 124 : CLOSE_Y[i - 1];
  const up = closeY < openY; // smaller y = higher price = bullish candle
  const wickPad = 7 + (i % 3) * 3;
  const highY = Math.min(openY, closeY) - wickPad;
  const lowY = Math.max(openY, closeY) + wickPad;
  const x = i * CANDLE_GAP + CANDLE_GAP / 2;
  return { x, openY, closeY, highY, lowY, up };
});

function FearGreedArc({ value, label }: { value: number; label: string }) {
  // Semi-circle arc, 0-100. Pure SVG, no dependency on the dashboard's
  // RadialGauge (keeps landing's token isolation intact).
  const r = 26;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - value / 100);
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 64 34" className="h-8 w-16 shrink-0" aria-hidden="true">
        <path d="M 6 32 A 26 26 0 0 1 58 32" fill="none" stroke="rgba(244,242,250,0.1)" strokeWidth={4} strokeLinecap="round" />
        <path
          d="M 6 32 A 26 26 0 0 1 58 32"
          fill="none"
          stroke="#D4AF37"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div>
        <p className="mono-num text-sm text-ink">{value}</p>
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-faint">{label}</p>
      </div>
    </div>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between border-t border-landing-line/70 py-2.5 first:border-t-0 first:pt-0">
      <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">{label}</span>
      <span className={`mono-num text-[13px] ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>{value}</span>
    </div>
  );
}

export function TerminalPreview() {
  const reduceMotion = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 50, damping: 20 });
  const sy = useSpring(py, { stiffness: 50, damping: 20 });
  // Three layers reading off the same pointer position at different
  // multipliers — the differing speed between them is the actual depth
  // cue, more than any one layer's own shading.
  const glowX = useTransform(sx, (v) => v * 14);
  const glowY = useTransform(sy, (v) => v * 14);
  const chartX = useTransform(sx, (v) => v * 5);
  const chartY = useTransform(sy, (v) => v * 5);
  const badgeX = useTransform(sx, (v) => v * -8);
  const badgeY = useTransform(sy, (v) => v * -8);
  const tiltX = useTransform(sy, (v) => (reduceMotion ? 0 : v * -3));
  const tiltY = useTransform(sx, (v) => (reduceMotion ? 0 : v * 3));

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width - 0.5);
    py.set((e.clientY - rect.top) / rect.height - 0.5);
  }
  function onPointerLeave() {
    px.set(0);
    py.set(0);
  }

  return (
    <section id="terminal-preview" className="theme-invariant relative overflow-hidden border-t border-landing-line bg-black py-20 sm:py-28">
      {/* Distinct, stronger vignette than Hero's — this section is meant to read as its own chapter, not a continuation. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.10), transparent 55%)" }}
        aria-hidden="true"
      />

      <Container className="relative">
        <div className="max-w-2xl">
          <LandingEyebrow>Terminal Preview</LandingEyebrow>
          <h2 className="mt-4 font-display text-4xl font-black uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
            Watch it <span className="text-landing-gold">reason</span>
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-muted">
            Chart, funding, open interest, whale flow, and ElVoid's reasoning — one frame, not eleven tabs.
          </p>
        </div>

        <div
          className="relative mt-12"
          style={{ perspective: 1400 }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <motion.div style={{ x: glowX, y: glowY }} className="pointer-events-none absolute -inset-16 rounded-[2rem] opacity-60 blur-3xl" aria-hidden="true">
            <div className="h-full w-full rounded-[2rem]" style={{ background: "radial-gradient(circle, rgba(212,175,55,0.18), transparent 70%)" }} />
          </motion.div>

          <motion.div
            className="landing-glass relative overflow-hidden rounded-2xl"
            style={{ rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }}
          >
            {/* Window chrome */}
            <div className="flex items-center justify-between border-b border-landing-line px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full bg-landing-line" />
                  <span className="h-2 w-2 rounded-full bg-landing-line" />
                  <span className="h-2 w-2 rounded-full bg-landing-gold" />
                </span>
                <span className="mono-num text-[11px] tracking-[0.15em] text-ink-faint">ELVOID://TERMINAL</span>
              </div>

              <motion.svg style={{ x: badgeX, y: badgeY }} viewBox="0 0 40 40" className="h-6 w-6" aria-hidden="true">
                <defs>
                  <filter id="terminalEmboss" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
                    <feSpecularLighting in="blur" surfaceScale={4} specularConstant={0.85} specularExponent={15} lightingColor="#F0D584" result="spec">
                      <fePointLight x={-30} y={-40} z={60} />
                    </feSpecularLighting>
                    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specClip" />
                    <feMerge>
                      <feMergeNode in="SourceGraphic" />
                      <feMergeNode in="specClip" />
                    </feMerge>
                  </filter>
                </defs>
                <polygon points="20,3 35,11 35,29 20,37 5,29 5,11" fill="#151312" filter="url(#terminalEmboss)" />
              </motion.svg>
            </div>

            {/* Body */}
            <div className="grid gap-0 lg:grid-cols-[1fr_240px]">
              {/* Chart + AI callout */}
              <motion.div style={{ x: chartX, y: chartY }} className="relative border-b border-landing-line p-5 lg:border-b-0 lg:border-r">
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-[200px] w-full sm:h-[240px]" preserveAspectRatio="none" aria-hidden="true">
                  {CANDLES.map((c, i) => (
                    <g key={i}>
                      <line x1={c.x} y1={c.highY} x2={c.x} y2={c.lowY} stroke={c.up ? "#00E676" : "#FF5252"} strokeWidth={1} opacity={0.9} />
                      <rect
                        x={c.x - CANDLE_GAP * 0.28}
                        y={Math.min(c.openY, c.closeY)}
                        width={CANDLE_GAP * 0.56}
                        height={Math.max(2, Math.abs(c.closeY - c.openY))}
                        fill={c.up ? "#00E676" : "#FF5252"}
                        opacity={0.9}
                        rx={1}
                      />
                    </g>
                  ))}
                </svg>

                {/* AI callout, pinned near the breakout candle (index 14 of 18). */}
                <div className="pointer-events-none absolute left-[68%] top-[18%] max-w-[190px] sm:left-[64%]">
                  <div className="landing-glass rounded-lg px-3 py-2 text-[11px] leading-snug text-ink shadow-glow-landing-gold">
                    <span className="text-landing-gold">ElVoid —</span> bullish divergence, funding resetting
                  </div>
                </div>

                <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-ink-faint">Illustrative preview — not live data</p>
              </motion.div>

              {/* Sidebar stats */}
              <div className="p-5">
                <FearGreedArc value={71} label="Fear &amp; Greed" />
                <div className="mt-4">
                  <StatRow label="Funding" value="+0.014%" tone="up" />
                  <StatRow label="Open Interest" value="$2.41B" />
                  <StatRow label="Whale (1h)" value="+$18.6M" tone="up" />
                  <StatRow label="Liquidity Δ" value="-4.2%" tone="down" />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-landing-line px-2.5 py-1 text-[10px] text-ink-muted">MACRO: CPI in 2d</span>
                  <span className="rounded-full border border-landing-line px-2.5 py-1 text-[10px] text-ink-muted">NEWS: ETF inflow</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
