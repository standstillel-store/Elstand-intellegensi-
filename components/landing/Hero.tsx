"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AuthAwareCta } from "./AuthAwareCta";

// ---------------------------------------------------------------------------
// Phase B — Landing Redesign. Reproduces the template's per-letter canvas
// "ParticleText" headline as a Framer Motion staggered-line reveal instead —
// same visual beat (headline assembles itself on load), no canvas, no new
// dependency, and it degrades cleanly to a static heading under
// prefers-reduced-motion via Framer's own useReducedMotion() (same pattern
// Reveal.tsx already uses elsewhere in this folder).
// ---------------------------------------------------------------------------

const HEADLINE_LINES = ["MARKET", "INTELLIGENCE,", "REENGINEERED."];

const HERO_TAGS = [
  { label: "MACRO", style: { top: "16%", right: "6%" } },
  { label: "MICRO", style: { top: "30%", right: "22%" } },
  { label: "LIQUIDITY", style: { top: "46%", right: "4%" } },
  { label: "ORDER FLOW", style: { top: "60%", right: "18%" } },
  { label: "AI", style: { top: "74%", right: "6%" } },
  { label: "WEB3", style: { top: "88%", right: "24%" } },
];

export function Hero() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="hero" data-elv-layer="00" className="elv-section elv-env-dark elv-hero">
      <div className="elv-hero-tags" aria-hidden="true">
        {HERO_TAGS.map((tag, i) => (
          <motion.span
            key={tag.label}
            className="elv-hero-tag mono"
            style={tag.style}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: [0, -14, 0] }}
            transition={
              reducedMotion
                ? undefined
                : {
                    opacity: { duration: 1, delay: 0.4 + i * 0.12 },
                    y: { duration: 3 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: 1 },
                  }
            }
          >
            {tag.label}
          </motion.span>
        ))}
      </div>

      <div className="elv-section-inner elv-hero-content">
        <div className="elv-eyebrow">ELSTAND // ELVOID CORE ONLINE</div>

        <h1 className="elv-h1" aria-label="Market Intelligence, Reengineered.">
          {HEADLINE_LINES.map((line, i) => (
            <motion.span
              key={line}
              className="elv-h1-line"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reducedMotion ? undefined : { duration: 0.6, delay: 0.15 + i * 0.14, ease: "easeOut" }}
            >
              {line}
            </motion.span>
          ))}
        </h1>

        <p className="elv-lede">
          Most tools give you a signal and walk away. ELVOID shows the case file: the macro context, the structure
          underneath, the order flow inside the candle — and the reasoning that connects them before it says a
          direction out loud.
        </p>

        <div className="elv-cta-row">
          <AuthAwareCta guestLabel="Get Started" authLabel="Enter Dashboard" />
          <AuthAwareCta guestLabel="Enter ELVOID" authLabel="Open Terminal" variant="secondary" icon={false} />
        </div>
      </div>

      <div className="elv-scroll-hint mono" aria-hidden="true">
        <span className="elv-scroll-hint-line" />
        SCROLL TO DESCEND
      </div>
    </section>
  );
}
