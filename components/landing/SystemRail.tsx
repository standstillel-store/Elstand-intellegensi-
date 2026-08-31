"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Phase B — Landing Redesign. Reproduces the template's fixed left "system
// rail" using a plain IntersectionObserver instead of GSAP ScrollTrigger
// (no new dependency — this app doesn't currently ship GSAP). Desktop-only,
// exactly like the template (hidden under 901px via CSS in globals.css).
//
// Each <SectionShell> in this redesign sets `data-elv-layer` on its
// <section>; this component just watches for whichever one is most in view
// and highlights the matching rail node. Clicking a node is a plain anchor
// scroll — no state elsewhere depends on it.
// ---------------------------------------------------------------------------

const LAYERS = [
  { key: "00", label: "00 · SYSTEM", href: "#hero" },
  { key: "01", label: "01 · MACRO", href: "#macro" },
  { key: "02", label: "02 · STRUCTURE", href: "#quant" },
  { key: "03", label: "03 · ORACLE", href: "#oracle" },
  { key: "04", label: "04 · WEB3", href: "#web3" },
] as const;

export function SystemRail() {
  const [active, setActive] = useState("00");

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".landing-root section[data-elv-layer]"));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the vertical center of the viewport
        // among those currently intersecting — more stable than "first
        // intersecting entry" when two short sections are both partly
        // visible at once.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const best = visible.reduce((a, b) =>
          Math.abs(a.boundingClientRect.top) < Math.abs(b.boundingClientRect.top) ? a : b
        );
        const layer = best.target.getAttribute("data-elv-layer");
        if (layer) setActive(layer);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="elv-rail-brand mono" aria-hidden="true">
        <span className="elv-rail-brand-mark" />
        ELSTAND // INTELLIGENCE
      </div>
      <nav className="elv-rail" aria-label="Section navigation">
        <div className="elv-rail-inner">
          {LAYERS.map((layer) => (
            <a
              key={layer.key}
              href={layer.href}
              className={`elv-rail-node mono ${active === layer.key ? "elv-rail-node-active" : ""}`}
            >
              <span className="elv-rail-dot" aria-hidden />
              {layer.label}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}
