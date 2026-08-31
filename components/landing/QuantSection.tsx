import { SectionShell, Eyebrow, Lede, Split, TileGrid, Note, IllustrativePanel } from "./shared";
import { Reveal } from "./Reveal";

// Layer 02 — Market Structure. Maps to the ElVoid AI Signal Engine's
// indicator layer (lib/elvoid/indicators.ts — RSI/EMA/MACD/structure) and
// lib/intelligence/btcMicrostructure.ts (IMPLEMENTED). Tile values are
// deliberately "·" placeholders with an honest note, not fabricated
// numbers — matching the source template's own approach.
export function QuantSection() {
  return (
    <SectionShell id="quant" layer="02" env="light">
      <Eyebrow>LAYER 02 — MARKET STRUCTURE</Eyebrow>
      <Split>
        <div>
          <Reveal>
            <h2 className="elv-h2">
              Where Price
              <br />
              Actually Forms.
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <Lede>
              Context narrows into microstructure here. ELVOID Quant is the Structure Engine — momentum, volume,
              positioning, support and resistance read directly off the tape, not a macro guess about where it&apos;s
              headed.
            </Lede>
          </Reveal>
        </div>
        <div>
          <Reveal delay={0.1}>
            <IllustrativePanel label="STRUCTURE WAVE" />
            <TileGrid
              tiles={[
                { label: "RSI", value: "·" },
                { label: "VWAP", value: "·" },
                { label: "SNR", value: "·" },
                { label: "VOLUME", value: "·" },
                { label: "STRUCTURE", value: "·" },
                { label: "LIQUIDITY", value: "·" },
              ]}
            />
            <Note>Illustrative view — connect a live feed to populate real values.</Note>
          </Reveal>
        </div>
      </Split>
    </SectionShell>
  );
}
