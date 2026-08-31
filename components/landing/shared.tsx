import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Phase B (Landing Redesign) — shared building blocks for the new template-
// matched design. Deliberately plain CSS classes (defined in app/globals.css
// under the `.landing-root` scope, prefixed `elv-` for "ElVoid") rather than
// new Tailwind theme tokens — this keeps the whole redesign inside
// components/landing/* + the landing-scoped part of globals.css, with zero
// changes to tailwind.config.ts. See the Phase B implementation report for
// the reasoning.
//
// Phase C — regression fix: `Container` and `Eyebrow` turned out to still
// be imported by three pre-existing public pages that render outside
// `.landing-root` (app/terms, app/privacy-policy, app/contact — via their
// own use of LandingHeader/LandingFooter). `Container` is restored below
// exactly as it was before Phase B (plain Tailwind, no `.landing-root`
// dependency, so it already works everywhere). `Eyebrow` now carries both
// class systems at once: `elv-eyebrow` (landing-scoped — wins by selector
// specificity inside `.landing-root`, so every existing landing section's
// eyebrow keeps its exact current appearance, unchanged) plus the original
// `eyebrow` + Tailwind utility classes as a fallback for anywhere outside
// `.landing-root`, where `.elv-eyebrow`'s rules simply don't match. The dot
// marker moved from `.elv-eyebrow::before` (CSS-generated, landing-only) to
// an explicit `<span className="eyebrow-dot">` so it renders correctly in
// both contexts without doubling up inside `.landing-root`.
// `LandingEyebrow`/`SectionIntro` are not restored — nothing currently
// imports them (verified via a repo-wide grep before this fix).
// ---------------------------------------------------------------------------

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-6 ${className}`}>{children}</div>;
}

export function SectionShell({
  id,
  layer,
  env = "dark",
  children,
  className = "",
}: {
  id: string;
  layer: string;
  env?: "dark" | "light";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-elv-layer={layer}
      className={`elv-section ${env === "light" ? "elv-env-light" : "elv-env-dark"} ${className}`}
    >
      <div className="elv-section-inner">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="elv-eyebrow eyebrow inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-signal-glow">
      <span className="eyebrow-dot" aria-hidden="true" />
      {children}
    </div>
  );
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="elv-lede">{children}</p>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="elv-note">{children}</p>;
}

export function Split({ children }: { children: ReactNode }) {
  return <div className="elv-split">{children}</div>;
}

export function TileGrid({
  tiles,
}: {
  tiles: { label: string; value: string }[];
}) {
  return (
    <div className="elv-tile-grid">
      {tiles.map((tile) => (
        <div key={tile.label} className="elv-tile">
          <div className="elv-tile-label">{tile.label}</div>
          <div className="elv-tile-value">{tile.value}</div>
        </div>
      ))}
    </div>
  );
}

export function FlowDiagram({
  nodes,
  direction = "column",
}: {
  nodes: string[];
  direction?: "column" | "row";
}) {
  return (
    <div className={`elv-flow ${direction === "row" ? "elv-flow-row" : ""}`}>
      {nodes.map((node, i) => (
        <div key={node} className="elv-flow-node">
          <span className="elv-flow-pulse" aria-hidden />
          {node}
          {direction === "column" && i < nodes.length - 1 && <span className="elv-flow-arrow-inline">↓</span>}
        </div>
      ))}
    </div>
  );
}

// Illustrative decorative panel — replaces the template's canvas mock
// visualizations (macro network / quant wave / web3 blocks). Deliberately
// static/CSS-only (no fabricated "live" numbers) and always paired with an
// honest <Note> saying it's illustrative — see the Phase B implementation
// report for why canvas/WebGL animation wasn't reproduced here.
export function IllustrativePanel({ label }: { label: string }) {
  return (
    <div className="elv-mock-panel" role="img" aria-label={`${label} — illustrative visualization`}>
      <div className="elv-mock-panel-grid" aria-hidden />
      <span className="elv-mock-panel-label mono">{label}</span>
    </div>
  );
}
