import { SectionShell, Eyebrow, Lede, Split, FlowDiagram } from "./shared";
import { Reveal } from "./Reveal";

// Layer 01 — Propagation. Maps to lib/intelligence/marketMap.ts,
// marketPulse.ts, sectorRotation.ts, globalSentiment.ts (IMPLEMENTED).
export function IntelligenceMapSection() {
  return (
    <SectionShell id="map" layer="01" env="dark">
      <Eyebrow>LAYER 01 — PROPAGATION</Eyebrow>
      <Split>
        <div>
          <Reveal>
            <h2 className="elv-h2">
              Nothing Moves
              <br />
              Alone.
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <Lede>
              A headline doesn&apos;t stop at the market it&apos;s about. ELSTAND&apos;s Intelligence Map traces how it
              tends to travel — sentiment first, then correlated venues. It&apos;s a map of relationship, never a
              promise of cause and effect.
            </Lede>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <FlowDiagram nodes={["HIGH IMPACT NEWS", "MACRO SENTIMENT", "GLOBAL MARKETS", "CRYPTO · FOREX · EQUITIES"]} />
        </Reveal>
      </Split>
    </SectionShell>
  );
}
