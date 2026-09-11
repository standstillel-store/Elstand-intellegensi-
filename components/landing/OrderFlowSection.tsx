import { SectionShell, Eyebrow, Lede, Split, TileGrid } from "./shared";
import { Reveal } from "./Reveal";

// Layer 02 — Order Flow. Maps to lib/elvoid/footprint.ts, tpo.ts,
// liquidityVolumeMap.ts, marketProfile.ts, and app/api/footprint,
// app/api/tpo* (IMPLEMENTED). Note: the repo's Liquidity Heatmap is
// explicitly NOT wired up yet (Phase A audit, README "intentionally left
// as an MVP") — it's listed here as a tile label matching the template,
// but framed as part of the order-flow toolset being built out, not
// claimed as a shipped, populated feature.
//
// The footprint grid below is a deterministic pseudo-pattern (index-based,
// not Math.random()) so server and client render identically — it's
// decorative, not a claim of live footprint data. Phase 9: this framing
// used to live only in the (invisible-to-sighted-users) aria-label — now
// also stated as a small visible caption over the grid itself.
const FP_CELLS = Array.from({ length: 48 }, (_, i) => 0.08 + ((i * 37) % 100) / 130);

// Phase 9 — a deliberately small, fixed subset (8 of 48 cells, every 6th
// index) gets a slow brightness pulse so the grid doesn't read as
// completely inert. Deterministic, not random, and not all 48 cells —
// "limited subset," not a full-grid shimmer. Animates via `filter`, not
// `opacity`, so it layers on top of each cell's existing static opacity
// (set below) instead of overriding it.
const ANIMATED_CELL_INDICES = new Set([0, 6, 12, 18, 24, 30, 36, 42]);

export function OrderFlowSection() {
  return (
    <SectionShell id="orderflow" layer="02" env="dark">
      <Eyebrow>LAYER 02 — ORDER FLOW</Eyebrow>
      <Split>
        <div>
          <Reveal>
            <h2 className="elv-h2">
              Inside
              <br />
              The Candle.
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <Lede>
              A candlestick hides everything that happened inside it. Footprint and TPO open it back up — where
              volume actually traded, where liquidity built, where it got absorbed.
            </Lede>
          </Reveal>
          <Reveal delay={0.1}>
            <TileGrid
              tiles={[
                { label: "FOOTPRINT", value: "·" },
                { label: "TPO", value: "·" },
                { label: "HEATMAP", value: "Building" },
              ]}
            />
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div className="elv-fp-wrap">
            <span className="elv-fp-caption mono">ILLUSTRATIVE FOOTPRINT</span>
            <div
              className="elv-fp-grid"
              role="img"
              aria-label="Illustrative footprint volume grid — not live order-flow data"
            >
              {FP_CELLS.map((opacity, i) => {
                const isAnimated = ANIMATED_CELL_INDICES.has(i);
                return (
                  <div
                    key={i}
                    className={isAnimated ? "elv-fp-cell elv-fp-cell-pulse" : "elv-fp-cell"}
                    style={isAnimated ? { opacity, animationDelay: `${(i / 6) * 0.7}s` } : { opacity }}
                  />
                );
              })}
            </div>
          </div>
        </Reveal>
      </Split>
    </SectionShell>
  );
}
