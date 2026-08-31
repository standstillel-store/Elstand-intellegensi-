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
// decorative, not a claim of live footprint data.
const FP_CELLS = Array.from({ length: 48 }, (_, i) => 0.08 + ((i * 37) % 100) / 130);

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
          <div className="elv-fp-grid" role="img" aria-label="Illustrative footprint volume grid">
            {FP_CELLS.map((opacity, i) => (
              <div key={i} className="elv-fp-cell" style={{ opacity }} />
            ))}
          </div>
        </Reveal>
      </Split>
    </SectionShell>
  );
}
