// ---------------------------------------------------------------------------
// Phase 8.1.1 — Decision Evaluation Engine fixtures (dev-only, not part of
// the app). Pure/offline — hand-built DecisionExperienceRecord fixtures.
// No live Supabase database, no network, no LLM, no Binance.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-evaluation-fixtures.ts
// ---------------------------------------------------------------------------

import { evaluateDecision } from "@/lib/ai/decisionEvaluation/evaluate";
import type { DecisionExperienceRecord } from "@/lib/ai/decisionEvaluation/contracts";
import type { LearningContextSnapshot, DecisionExperienceOutcomePatch } from "@/lib/ai/decisionOutcome/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function outcome(overrides: Partial<DecisionExperienceOutcomePatch> = {}): DecisionExperienceOutcomePatch {
  return { outcomeResult: "win", outcomeRr: 2, outcomeProfitPercent: 1.5, outcomeDurationMinutes: 45, outcomeClosedAt: "2026-01-01T01:00:00.000Z", ...overrides };
}

function learningContext(overrides: Partial<LearningContextSnapshot> = {}): LearningContextSnapshot {
  return { version: 1, grade: "A", confidence: 80, hypotheses: [{ status: "SUPPORTED", uncertainty: "LOW" }], conflictState: "CONSISTENT", riskOverall: "LOW", riskContextQuality: "real", ...overrides };
}

function experience(overrides: Partial<DecisionExperienceRecord> = {}): DecisionExperienceRecord {
  return {
    id: "exp-fixture-001",
    source: "AI_SIGNAL",
    sourceSignalId: "sig-fixture-001",
    symbol: "BTCUSDT",
    side: "LONG",
    grade: "A",
    confidence: 80,
    decisionTimestamp: "2026-01-01T00:00:00.000Z",
    learningContext: null,
    outcome: outcome(),
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// AI_SIGNAL — TradeGrade scale
// ===========================================================================

// 1. High TradeGrade + win
{
  const e = experience({ grade: "A+", outcome: outcome({ outcomeResult: "win" }) });
  const r = evaluateDecision(e);
  check("1. High TradeGrade + win -> GOOD_DECISION_GOOD_OUTCOME", r.decisionQuality === "GOOD" && r.marketOutcome === "POSITIVE" && r.evaluationClass === "GOOD_DECISION_GOOD_OUTCOME", JSON.stringify(r));
}

// 2. High TradeGrade + loss
{
  const e = experience({ grade: "A++", outcome: outcome({ outcomeResult: "loss" }) });
  const r = evaluateDecision(e);
  check("2. High TradeGrade + loss -> GOOD_DECISION_BAD_OUTCOME (good process, bad outcome)", r.decisionQuality === "GOOD" && r.marketOutcome === "NEGATIVE" && r.evaluationClass === "GOOD_DECISION_BAD_OUTCOME", JSON.stringify(r));
}

// 3. Low TradeGrade + win
{
  const e = experience({ grade: "C", outcome: outcome({ outcomeResult: "win" }) });
  const r = evaluateDecision(e);
  check("3. Low TradeGrade + win -> BAD_DECISION_GOOD_OUTCOME (outcome does not validate poor grade)", r.decisionQuality === "BAD" && r.marketOutcome === "POSITIVE" && r.evaluationClass === "BAD_DECISION_GOOD_OUTCOME", JSON.stringify(r));
}

// 4. Low TradeGrade + loss
{
  const e = experience({ grade: "C+", outcome: outcome({ outcomeResult: "loss" }) });
  const r = evaluateDecision(e);
  check("4. Low TradeGrade + loss -> BAD_DECISION_BAD_OUTCOME", r.decisionQuality === "BAD" && r.marketOutcome === "NEGATIVE" && r.evaluationClass === "BAD_DECISION_BAD_OUTCOME", JSON.stringify(r));
}

// 5. Mid TradeGrade + win -> insufficient evidence
{
  const e = experience({ grade: "B", outcome: outcome({ outcomeResult: "win" }) });
  const r = evaluateDecision(e);
  check("5. Mid TradeGrade + win -> UNKNOWN decision quality -> INSUFFICIENT_EVIDENCE", r.decisionQuality === "UNKNOWN" && r.evaluationClass === "INSUFFICIENT_EVIDENCE", JSON.stringify(r));
}

// 6. Null grade
{
  const e = experience({ grade: null });
  const r = evaluateDecision(e);
  check("6. Null grade -> UNKNOWN decision quality", r.decisionQuality === "UNKNOWN", JSON.stringify(r));
}

// 7. Missing outcome
{
  const e = experience({ outcome: null });
  const r = evaluateDecision(e);
  check("7. Missing outcome -> UNKNOWN market outcome -> INSUFFICIENT_EVIDENCE, and MISSING_OUTCOME evidence tag present", r.marketOutcome === "UNKNOWN" && r.evaluationClass === "INSUFFICIENT_EVIDENCE" && r.evidence.includes("MISSING_OUTCOME"), JSON.stringify(r));
}

// 8. Breakeven + GOOD -> NEUTRAL_OUTCOME
{
  const e = experience({ grade: "A", outcome: outcome({ outcomeResult: "breakeven" }) });
  const r = evaluateDecision(e);
  check("8. High grade (GOOD) + breakeven -> NEUTRAL_OUTCOME, never GOOD/BAD outcome class", r.decisionQuality === "GOOD" && r.marketOutcome === "NEUTRAL" && r.evaluationClass === "NEUTRAL_OUTCOME", JSON.stringify(r));
}

// 9. Breakeven + BAD -> NEUTRAL_OUTCOME
{
  const e = experience({ grade: "C", outcome: outcome({ outcomeResult: "breakeven" }) });
  const r = evaluateDecision(e);
  check("9. Low grade (BAD) + breakeven -> NEUTRAL_OUTCOME, not INSUFFICIENT_EVIDENCE", r.decisionQuality === "BAD" && r.marketOutcome === "NEUTRAL" && r.evaluationClass === "NEUTRAL_OUTCOME", JSON.stringify(r));
}

// 10. Breakeven + UNKNOWN -> INSUFFICIENT_EVIDENCE
{
  const e = experience({ grade: "B", outcome: outcome({ outcomeResult: "breakeven" }) });
  const r = evaluateDecision(e);
  check("10. Mid grade (UNKNOWN) + breakeven -> INSUFFICIENT_EVIDENCE (UNKNOWN axis always wins over NEUTRAL)", r.decisionQuality === "UNKNOWN" && r.evaluationClass === "INSUFFICIENT_EVIDENCE", JSON.stringify(r));
}

// ===========================================================================
// ELVOID_PRO_ORACLE — OracleGrade scale + cognitive context
// ===========================================================================

// 11. High Oracle grade + consistent context
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", conflictState: "CONSISTENT" }), outcome: outcome({ outcomeResult: "win" }) });
  const r = evaluateDecision(e);
  check("11. High Oracle grade + consistent context -> GOOD", r.decisionQuality === "GOOD", JSON.stringify(r));
}

// 12. High Oracle grade + conflicted context -> UNKNOWN
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A+", learningContext: learningContext({ grade: "A+", conflictState: "CONFLICTED" }) });
  const r = evaluateDecision(e);
  check("12. High Oracle grade + CONFLICTED context -> UNKNOWN, never automatically BAD", r.decisionQuality === "UNKNOWN", JSON.stringify(r));
}

// 13. Low Oracle grade
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "NO_TRADE" }) });
  const r = evaluateDecision(e);
  check("13. Low Oracle grade (NO_TRADE via learningContext) -> BAD", r.decisionQuality === "BAD", JSON.stringify(r));
}

// 14. Mid Oracle grade
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "B+", learningContext: learningContext({ grade: "B+" }) });
  const r = evaluateDecision(e);
  check("14. Mid Oracle grade (B+) -> UNKNOWN, never forced", r.decisionQuality === "UNKNOWN", JSON.stringify(r));
}

// 15. CHALLENGED hypothesis present
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", hypotheses: [{ status: "CHALLENGED", uncertainty: "MEDIUM" }] }) });
  const r = evaluateDecision(e);
  check("15. High grade + CHALLENGED hypothesis -> UNKNOWN, and CHALLENGED_HYPOTHESIS_PRESENT tag", r.decisionQuality === "UNKNOWN" && r.evidence.includes("CHALLENGED_HYPOTHESIS_PRESENT"), JSON.stringify(r));
}

// 16. REJECTED hypothesis present
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", hypotheses: [{ status: "REJECTED", uncertainty: "HIGH" }] }) });
  const r = evaluateDecision(e);
  check("16. High grade + REJECTED hypothesis -> UNKNOWN, and REJECTED_HYPOTHESIS_PRESENT tag", r.decisionQuality === "UNKNOWN" && r.evidence.includes("REJECTED_HYPOTHESIS_PRESENT"), JSON.stringify(r));
}

// 17. SUPPORTED hypothesis present
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", hypotheses: [{ status: "SUPPORTED", uncertainty: "LOW" }] }) });
  const r = evaluateDecision(e);
  check("17. High grade + only SUPPORTED hypotheses -> GOOD, and SUPPORTED_HYPOTHESIS_PRESENT tag", r.decisionQuality === "GOOD" && r.evidence.includes("SUPPORTED_HYPOTHESIS_PRESENT"), JSON.stringify(r));
}

// 18. CONFLICTED state
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", conflictState: "CONFLICTED" }) });
  const r = evaluateDecision(e);
  check("18. CONFLICTED state present -> CONFLICTED_STATE_PRESENT tag", r.evidence.includes("CONFLICTED_STATE_PRESENT"), JSON.stringify(r));
}

// 19. CAUTIOUS state
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", conflictState: "CAUTIOUS" }) });
  const r = evaluateDecision(e);
  check("19. CAUTIOUS state present -> GOOD (not CONFLICTED) and CAUTIOUS_STATE_PRESENT tag, conflictAlignment UNKNOWN (ambiguous)", r.decisionQuality === "GOOD" && r.evidence.includes("CAUTIOUS_STATE_PRESENT") && r.conflictAlignment === "UNKNOWN", JSON.stringify(r));
}

// 20. CONSISTENT state
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", conflictState: "CONSISTENT" }) });
  const r = evaluateDecision(e);
  check("20. CONSISTENT state present -> CONSISTENT_STATE_PRESENT tag", r.evidence.includes("CONSISTENT_STATE_PRESENT"), JSON.stringify(r));
}

// 21. High risk
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", riskOverall: "HIGH" }), outcome: outcome({ outcomeResult: "loss" }) });
  const r = evaluateDecision(e);
  check("21. HIGH risk present -> HIGH_RISK_PRESENT tag; GOOD decision + HIGH risk -> riskAlignment MISALIGNED (structural note, not causal)", r.evidence.includes("HIGH_RISK_PRESENT") && r.riskAlignment === "MISALIGNED", JSON.stringify(r));
}

// 22. Moderate risk
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", riskOverall: "MODERATE" }) });
  const r = evaluateDecision(e);
  check("22. MODERATE risk present -> MODERATE_RISK_PRESENT tag; GOOD decision + non-HIGH risk -> riskAlignment ALIGNED", r.evidence.includes("MODERATE_RISK_PRESENT") && r.riskAlignment === "ALIGNED", JSON.stringify(r));
}

// 23. Low risk
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A", riskOverall: "LOW" }) });
  const r = evaluateDecision(e);
  check("23. LOW risk present -> LOW_RISK_PRESENT tag", r.evidence.includes("LOW_RISK_PRESENT"), JSON.stringify(r));
}

// ===========================================================================
// AI_SIGNAL structural behavior
// ===========================================================================

// 24. AI_SIGNAL with null learning_context
{
  const e = experience({ source: "AI_SIGNAL", learningContext: null });
  const r = evaluateDecision(e);
  check("24. AI_SIGNAL with null learning_context -> NO_COGNITIVE_CONTEXT tag, does not throw", r.evidence.includes("NO_COGNITIVE_CONTEXT"), JSON.stringify(r));
}

// 25. AI_SIGNAL mid-grade without context -> UNKNOWN
{
  const e = experience({ source: "AI_SIGNAL", grade: "B+", learningContext: null });
  const r = evaluateDecision(e);
  check("25. AI_SIGNAL mid-grade (B+) without context -> UNKNOWN", r.decisionQuality === "UNKNOWN", JSON.stringify(r));
}

// 26. AI_SIGNAL high grade -> valid GOOD
{
  const e = experience({ source: "AI_SIGNAL", grade: "A++", learningContext: null });
  const r = evaluateDecision(e);
  check("26. AI_SIGNAL high grade (A++), no context -> GOOD (absence of context is not treated as conflicting)", r.decisionQuality === "GOOD", JSON.stringify(r));
}

// 27. AI_SIGNAL low grade -> BAD
{
  const e = experience({ source: "AI_SIGNAL", grade: "C", learningContext: null });
  const r = evaluateDecision(e);
  check("27. AI_SIGNAL low grade (C) -> BAD", r.decisionQuality === "BAD", JSON.stringify(r));
}

// 28. AI_SIGNAL context alignment fields -> NOT_APPLICABLE
{
  const e = experience({ source: "AI_SIGNAL", grade: "A", learningContext: null });
  const r = evaluateDecision(e);
  check(
    "28. AI_SIGNAL (no context) -> riskAlignment/conflictAlignment/hypothesisAlignment all NOT_APPLICABLE, never fabricated",
    r.riskAlignment === "NOT_APPLICABLE" && r.conflictAlignment === "NOT_APPLICABLE" && r.hypothesisAlignment === "NOT_APPLICABLE",
    JSON.stringify(r)
  );
}

// ===========================================================================
// Oracle defensive behavior
// ===========================================================================

// 29. Oracle source but null learning_context
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A+", learningContext: null });
  const r = evaluateDecision(e);
  check("29. ELVOID_PRO_ORACLE with null learning_context falls back to persisted grade-only evaluation (GOOD) and reports NOT_APPLICABLE alignment, not NO context fabrication", r.decisionQuality === "GOOD" && r.riskAlignment === "NOT_APPLICABLE" && r.hypothesisAlignment === "NOT_APPLICABLE", JSON.stringify(r));
}

// 30. Missing confidence
{
  const e = experience({ confidence: undefined as unknown as number });
  const r = evaluateDecision(e);
  check("30. Missing confidence -> MISSING_CONFIDENCE tag, confidenceAlignment UNKNOWN, does not throw", r.evidence.includes("MISSING_CONFIDENCE") && r.confidenceAlignment === "UNKNOWN", JSON.stringify(r));
}

// 31. Missing outcome + valid grade/context
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext({ grade: "A" }), outcome: null });
  const r = evaluateDecision(e);
  check("31. Missing outcome with a fully valid GOOD decision -> INSUFFICIENT_EVIDENCE (outcome axis dominates), decisionQuality still correctly GOOD", r.decisionQuality === "GOOD" && r.marketOutcome === "UNKNOWN" && r.evaluationClass === "INSUFFICIENT_EVIDENCE", JSON.stringify(r));
}

// ===========================================================================
// Determinism & edge cases
// ===========================================================================

// 32. Same input twice -> deeply identical evaluation output
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext() });
  const r1 = evaluateDecision(e);
  const r2 = evaluateDecision(e);
  check("32. Same input evaluated twice -> byte-identical output", JSON.stringify(r1) === JSON.stringify(r2), `${JSON.stringify(r1)} vs ${JSON.stringify(r2)}`);
}

// 33. Unknown grade value must not crash
{
  const e = experience({ grade: "Z" as unknown as DecisionExperienceRecord["grade"] });
  let threw = false;
  let r;
  try {
    r = evaluateDecision(e);
  } catch {
    threw = true;
  }
  check("33. Unknown/unexpected grade string does not throw, resolves to UNKNOWN via MISSING_GRADE bucket", !threw && r?.decisionQuality === "UNKNOWN" && r.evidence.includes("MISSING_GRADE"), JSON.stringify(r));
}

// 34. Neutral outcome must never be classified as GOOD/BAD outcome
{
  const e1 = experience({ grade: "A", outcome: outcome({ outcomeResult: "breakeven" }) });
  const e2 = experience({ grade: "C", outcome: outcome({ outcomeResult: "breakeven" }) });
  const r1 = evaluateDecision(e1);
  const r2 = evaluateDecision(e2);
  check(
    "34. NEUTRAL outcome never appears as GOOD_DECISION_GOOD_OUTCOME/BAD_DECISION_BAD_OUTCOME/etc — always NEUTRAL_OUTCOME",
    r1.marketOutcome === "NEUTRAL" && r2.marketOutcome === "NEUTRAL" && r1.evaluationClass === "NEUTRAL_OUTCOME" && r2.evaluationClass === "NEUTRAL_OUTCOME",
    `${JSON.stringify(r1)} / ${JSON.stringify(r2)}`
  );
}

// ===========================================================================
// Additional cases identified during audit (35-36)
// ===========================================================================

// 35. Input immutability — evaluateDecision never mutates its input.
{
  const e = experience({ source: "ELVOID_PRO_ORACLE", grade: "A", learningContext: learningContext() });
  const before = JSON.stringify(e);
  evaluateDecision(e);
  check("35. evaluateDecision does not mutate its input DecisionExperienceRecord", JSON.stringify(e) === before, "input was mutated");
}

// 36. Purity / no external dependency surface (source inspection, comments stripped).
{
  const evaluateSource = await (await import("node:fs/promises")).readFile(new URL("../../lib/ai/decisionEvaluation/evaluate.ts", import.meta.url), "utf-8");
  // Strip `//` line comments and `/* */` block comments before scanning —
  // this file's own doc comments legitimately DESCRIBE these prohibitions
  // in prose (e.g. "Zero Date.now()... generation"), which would otherwise
  // false-positive against the same literal substrings used as actual code.
  const codeOnly = evaluateSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  const forbidden = ["fetch(", "Date.now(", "Math.random(", "Supabase", "supabase", 'from "@/lib/ai/oracle', 'from "@/lib/elvoid', 'from "@/lib/ai/core', "Binance", "binance"];
  const noneAppear = forbidden.every((f) => !codeOnly.includes(f));
  check("36. lib/ai/decisionEvaluation/evaluate.ts's actual code (comments excluded) contains none of: fetch/Date.now/Math.random/Supabase/Oracle-or-elvoid-or-core imports/Binance", noneAppear, `contains one of: ${forbidden.join(", ")}`);
}

console.log(failures === 0 ? `\n✓ ${passed}/${passed} Decision Evaluation fixtures passed.` : `\n${failures} Decision Evaluation fixture(s) FAILED (${passed} passed).`);
if (failures > 0) process.exitCode = 1;
