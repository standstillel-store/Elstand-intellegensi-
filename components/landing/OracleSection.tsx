import { SectionShell, Eyebrow, Lede, Split, FlowDiagram, Note } from "./shared";
import { Reveal } from "./Reveal";

// Layer 03 — Decision Support. This section is specifically about the
// ELVOID PRO Oracle (app/api/elvoid-pro/oracle/route.ts, lib/ai/oracle/*),
// NOT the separate ElVoid AI Signal Engine (lib/elvoid/engine.ts) — the
// Phase A/B audits are explicit that the two must not be conflated in copy.
// The Oracle is a deterministic multi-stage pipeline (confluence -> risk ->
// grading -> scenario -> contradiction -> arbitration), not a trained model
// and not a "prediction." The Cognitive Layer downstream of it is
// deliberately described as a read-only, non-authoritative observer — the
// README itself is emphatic that it never overrides or duplicates the
// canonical decision, so this copy avoids implying it decides anything on
// its own or "learns" (Decision Outcome Capture exists but has no wired
// evaluation/learning logic yet, per the audit).
export function OracleSection() {
  return (
    <SectionShell id="oracle" layer="03" env="light">
      <Eyebrow>LAYER 03 — DECISION SUPPORT</Eyebrow>
      <Split>
        <div>
          <Reveal>
            <h2 className="elv-h2">
              The Case,
              <br />
              Before The Call.
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <Lede>
              Market data, macro context and structure all land on the same desk: the ELVOID PRO Oracle. It&apos;s a
              deterministic, evidence-based decision-support pipeline — not a prediction engine, and it never gives
              you a direction without showing the reasoning behind it.
            </Lede>
          </Reveal>
          <Reveal delay={0.08}>
            <Note>
              Separate from ElVoid AI Signal (the rule-based Entry/SL/TP engine used across the app) — the Oracle is
              a distinct, deeper reasoning pipeline built for ELVOID PRO.
            </Note>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <FlowDiagram
            nodes={["MARKET DATA + MACRO + MICRO + CONFLUENCE", "DIRECTION", "CONFIDENCE", "REASON", "EVIDENCE"]}
          />
        </Reveal>
      </Split>
    </SectionShell>
  );
}
