import { SectionShell, Eyebrow, Lede, Split, TileGrid, Note, IllustrativePanel } from "./shared";
import { Reveal } from "./Reveal";

// Layer 01 — Macro Context. Maps to lib/intelligence/macroEvents.ts,
// macroKnowledge.ts, globalSentiment.ts, and app/economic-calendar/ per the
// Phase A audit's Verified Feature Inventory — all IMPLEMENTED.
export function MacroSection() {
  return (
    <SectionShell id="macro" layer="01" env="light">
      <Eyebrow>LAYER 01 — MACRO CONTEXT</Eyebrow>
      <Split>
        <div>
          <Reveal>
            <h2 className="elv-h2">
              The Chart Doesn&apos;t
              <br />
              Start At The Chart.
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <Lede>
              A candle doesn&apos;t know it&apos;s reacting to a CPI print or a headline out of the Fed. ELSTAND&apos;s
              Context Engine reads that world first — news flow, the economic calendar, macro data, prevailing
              sentiment — so the read that follows isn&apos;t blind to why price is moving.
            </Lede>
          </Reveal>
          <Reveal delay={0.1}>
            <TileGrid
              tiles={[
                { label: "NEWS", value: "Monitored" },
                { label: "CALENDAR", value: "Tracked" },
                { label: "MACRO DATA", value: "Ingested" },
                { label: "SENTIMENT", value: "Read" },
              ]}
            />
          </Reveal>
        </div>
        <div>
          <Reveal delay={0.1}>
            <IllustrativePanel label="MACRO CONTEXT NETWORK" />
            <Note>Illustrative network view. Live rendering depends on connected data sources.</Note>
          </Reveal>
        </div>
      </Split>
    </SectionShell>
  );
}
