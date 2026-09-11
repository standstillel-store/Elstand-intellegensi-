import type { CSSProperties, ReactNode } from "react";

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

// `accent` is an opt-in modifier only — default ("gold") is byte-identical
// to the pre-Phase-9 markup/behavior. "violet" is used exclusively by the
// three intelligence-layer sections (Intelligence Map, Oracle, Evidence
// Ledger) per the Phase 9 color-system brief; every other section keeps
// using the default, so nothing here changes their appearance.
export function Eyebrow({ children, accent = "gold" }: { children: ReactNode; accent?: "gold" | "violet" }) {
  return (
    <div
      className={`elv-eyebrow eyebrow inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-signal-glow ${
        accent === "violet" ? "elv-eyebrow-violet" : ""
      }`}
    >
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

// Phase 9 fix — TileGrid used to hard-code 3 columns (>640px) / 2 columns
// (<=640px) with no awareness of how many tiles it was given. Any count that
// doesn't divide evenly into the active column count (Macro's 4 tiles at 3
// desktop columns; Order Flow's 3 tiles at 2 mobile columns) left an empty
// orphaned grid cell — a real, verified bug, not a design choice.
//
// Fix: compute, per tile, how many columns it should span at each of the
// two breakpoints so the trailing/incomplete row always sums to the full
// column count instead of leaving a gap. Column counts with no remainder
// (e.g. 6 tiles at 3 or 2 columns) get spans of 1 everywhere — pixel-
// identical to the old output. This is general (works for any future tile
// count), not a special case for 3/4/6, so it doesn't need revisiting the
// next time a section's tile count changes.
function trailingRowSpans(count: number, columns: number): number[] {
  const spans = new Array(count).fill(1);
  if (count === 0) return spans;
  const remainder = count % columns;
  if (remainder === 0) return spans;

  const trailingStart = count - remainder;
  const base = Math.floor(columns / remainder);
  for (let i = trailingStart; i < count; i++) spans[i] = base;
  // Give any leftover column width (from the floor() above) to the last
  // tile in the row so the spans always sum to exactly `columns` — never
  // more (overflow into a new row) and never less (an orphan gap).
  spans[count - 1] += columns - base * remainder;
  return spans;
}

export function TileGrid({
  tiles,
}: {
  tiles: { label: string; value: string }[];
}) {
  const desktopSpans = trailingRowSpans(tiles.length, 3);
  const mobileSpans = trailingRowSpans(tiles.length, 2);

  return (
    <div className="elv-tile-grid">
      {tiles.map((tile, i) => (
        <div
          key={tile.label}
          className="elv-tile"
          style={
            {
              "--elv-tile-desktop-span": desktopSpans[i],
              "--elv-tile-mobile-span": mobileSpans[i],
            } as CSSProperties
          }
        >
          <div className="elv-tile-label">{tile.label}</div>
          <div className="elv-tile-value">{tile.value}</div>
        </div>
      ))}
    </div>
  );
}

// `accent` — same opt-in pattern as Eyebrow above. Default "gold" is
// byte-identical to before; "violet" (Intelligence Map / Oracle / Evidence
// Ledger only) swaps every node's pulse-dot color+glow to violet instead of
// the default amber/teal alternation. Node borders, labels and arrows are
// untouched either way — only the pulse accent changes, per the brief
// ("purple should primarily affect... flow pulse accents", not a repaint).
export function FlowDiagram({
  nodes,
  direction = "column",
  accent = "gold",
}: {
  nodes: string[];
  direction?: "column" | "row";
  accent?: "gold" | "violet";
}) {
  return (
    <div
      className={`elv-flow ${direction === "row" ? "elv-flow-row" : ""} ${
        accent === "violet" ? "elv-flow-violet" : ""
      }`.trim()}
    >
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
// static/CSS-only where it doesn't have a `visual` (no fabricated "live"
// numbers) and always paired with an honest <Note> saying it's illustrative
// — see the Phase B implementation report for why canvas/WebGL animation
// wasn't reproduced here.
//
// Phase 9 — `visual` is a new optional slot (default: none, same bare grid
// as before) so Macro/Quant/Web3 can each render their own dedicated,
// restrained SVG illustration (MacroNetworkVisual / StructureWaveVisual /
// SettlementFlowVisual) layered on top of the existing dot-grid background
// and underneath the label, instead of duplicating this wrapper three times.
// This keeps one source of truth for the panel's sizing/border/label
// positioning instead of three near-identical copies.
export function IllustrativePanel({ label, visual }: { label: string; visual?: ReactNode }) {
  return (
    <div className="elv-mock-panel" role="img" aria-label={`${label} — illustrative visualization`}>
      <div className="elv-mock-panel-grid" aria-hidden />
      {visual}
      <span className="elv-mock-panel-label mono">{label}</span>
    </div>
  );
}
