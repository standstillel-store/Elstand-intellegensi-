import { SectionShell, Eyebrow, Lede, FlowDiagram, Note } from "./shared";
import { Reveal } from "./Reveal";

// Layer 03 — Evaluation. Maps to AI Journal / AI Performance
// (app/ai-journal/, lib/elvoid/review.ts, performance.ts) and Paper Trading
// (lib/elvoid/paperTrader.ts) — all IMPLEMENTED. Deliberately does NOT
// describe this as "self-learning AI": per the Phase A audit, Decision
// Outcome Capture exists but has no automatic trigger yet, and scoring /
// pattern-detection / adaptive learning are explicitly deferred, not
// shipped. This section stays scoped to what's real today — a visible,
// checkable track record — not a learning claim.
export function EvidenceLedgerSection() {
  return (
    <SectionShell id="performance" layer="03" env="dark">
      <Eyebrow>LAYER 03 — EVALUATION</Eyebrow>
      <Reveal>
        <h2 className="elv-h2">
          The Evidence
          <br />
          Ledger.
        </h2>
      </Reveal>
      <Reveal delay={0.05}>
        <Lede>
          A call means nothing if nobody checks it later. Every ElVoid decision is logged forward — paper trade,
          outcome, performance review — so the track record stays visible in the journal, not asserted in a headline.
        </Lede>
      </Reveal>
      <Reveal delay={0.1} className="elv-flow-reveal-row">
        <FlowDiagram
          nodes={["AI DECISION", "PAPER TRADE", "OUTCOME", "PERFORMANCE", "REVIEW"]}
          direction="row"
        />
      </Reveal>
      <Reveal delay={0.15}>
        <Note>Example pipeline shown — figures populate from your own connected account, not simulated here.</Note>
      </Reveal>
    </SectionShell>
  );
}
