// ---------------------------------------------------------------------------
// Phase 8.6.2 — Cognitive Gap Detector + Familiarity fixtures (dev-only).
// Pure/offline — exercises familiarity.ts + detect.ts only.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-gap-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { buildFamiliarityEvidence } from "@/lib/ai/cognitiveGap/familiarity";
import { detectCognitiveGaps } from "@/lib/ai/cognitiveGap/detect";
import { MIN_OCCURRENCE_COUNT, CONFIDENCE_SAMPLE_CAP } from "@/lib/ai/failurePatterns/detect";
import type { DecisionSource, EvaluationEvidenceTag } from "@/lib/ai/cognitiveGap/contracts";
import type { DecisionMemoryJoinedRow, DecisionMemoryResult, DecisionExperienceRecord } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation, EvaluationClass, ConfidenceAlignment } from "@/lib/ai/decisionEvaluation/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";

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

let idCounter = 0;
function row(overrides: { source?: DecisionSource; symbol?: string; evidence?: readonly EvaluationEvidenceTag[]; confidenceAlignment?: ConfidenceAlignment; evaluationClass?: EvaluationClass } = {}): DecisionMemoryJoinedRow {
  idCounter++;
  const source = overrides.source ?? "ELVOID_PRO_ORACLE";
  const symbol = overrides.symbol ?? "BTCUSDT";
  const experience: DecisionExperienceRecord = {
    id: `exp-${idCounter}`,
    source,
    sourceSignalId: `sig-${idCounter}`,
    symbol,
    side: "LONG",
    grade: "A",
    confidence: 70,
    decisionTimestamp: "2026-09-01T00:00:00.000Z",
    learningContext: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    outcome: { outcomeResult: "win", outcomeRr: 1.5, outcomeProfitPercent: 2.1, outcomeDurationMinutes: 60, outcomeClosedAt: "2026-09-01T01:00:00.000Z" },
  };
  const evaluation: DecisionEvaluation = {
    version: 1,
    sourceSignalId: `sig-${idCounter}`,
    decisionQuality: "GOOD",
    marketOutcome: "POSITIVE",
    evaluationClass: overrides.evaluationClass ?? "GOOD_DECISION_GOOD_OUTCOME",
    confidenceAlignment: overrides.confidenceAlignment ?? "ALIGNED",
    riskAlignment: "NOT_APPLICABLE",
    conflictAlignment: "NOT_APPLICABLE",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: overrides.evidence ?? [],
    evaluatedAt: "2026-09-01T01:05:00.000Z",
  };
  return { experience, evaluation };
}

function repeat<T>(count: number, build: (i: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => build(i));
}

function validation(status: ConstraintValidation["status"]): ConstraintValidation {
  return {
    version: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    evidenceTag: "HIGH_RISK_PRESENT",
    constraintType: "INCREASE_CAUTION",
    status,
    signals: { sampleSizeAdequate: status === "VALID", withinFreshnessWindow: true, structurallyConsistent: true, overfitRiskFlag: false },
    basis: { occurrenceCount: MIN_OCCURRENCE_COUNT, dominantClassShare: 1, statisticalConfidence: 0.5, firstObservedAt: "2026-08-01T00:00:00.000Z", lastObservedAt: "2026-08-05T00:00:00.000Z" },
    validatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function memoryWith(experienceCount: number, patternCount: number, evidence: readonly EvaluationEvidenceTag[] = []): DecisionMemoryResult {
  return {
    matchedExperiences: repeat(experienceCount, () => row()).map((r) => r.experience),
    matchedEvaluations: repeat(experienceCount, () => row({ evidence })).map((r) => r.evaluation as DecisionEvaluation),
    matchedPatterns: repeat(patternCount, () => ({
      version: 1 as const,
      source: "ELVOID_PRO_ORACLE" as const,
      symbol: "BTCUSDT",
      evidenceTag: "HIGH_RISK_PRESENT" as const,
      dominantEvaluationClass: "BAD_DECISION_BAD_OUTCOME" as const,
      occurrenceCount: MIN_OCCURRENCE_COUNT,
      dominantClassShare: 1,
      confidence: 0.5,
      firstObservedAt: "2026-08-01T00:00:00.000Z",
      lastObservedAt: "2026-08-05T00:00:00.000Z",
      computedAt: "2026-09-01T00:00:00.000Z",
    })),
  };
}

// ---------------------------------------------------------------------------
// Familiarity — reuses classifyNovelty(); confirm no behavior drift
// ---------------------------------------------------------------------------

{
  const evidence = buildFamiliarityEvidence("ELVOID_PRO_ORACLE", "BTCUSDT", null);
  check("1. Unavailable memory -> familiarity classification UNAVAILABLE, zero relevant tags", evidence.familiarity.classification === "UNAVAILABLE" && evidence.relevantEvidenceTags.length === 0, JSON.stringify(evidence));
}

{
  const evidence = buildFamiliarityEvidence("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(0, 0));
  check("2. Zero-match memory -> familiarity classification NOVEL", evidence.familiarity.classification === "NOVEL", JSON.stringify(evidence.familiarity));
}

{
  const evidence = buildFamiliarityEvidence("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(MIN_OCCURRENCE_COUNT, 1));
  check("3. Familiar memory (>=MIN_OCCURRENCE_COUNT experiences + pattern) -> FAMILIAR", evidence.familiarity.classification === "FAMILIAR", JSON.stringify(evidence.familiarity));
}

{
  const evidence = buildFamiliarityEvidence("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(1, 0));
  check("4. Partially familiar memory (1 experience, 0 patterns) -> PARTIALLY_FAMILIAR", evidence.familiarity.classification === "PARTIALLY_FAMILIAR", JSON.stringify(evidence.familiarity));
}

{
  const evidence = buildFamiliarityEvidence("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(2, 0, ["HIGH_RISK_PRESENT", "CONFLICTED_STATE_PRESENT"]));
  check("5. relevantEvidenceTags is deduped across matchedEvaluations", evidence.relevantEvidenceTags.length === 2 && evidence.relevantEvidenceTags.includes("HIGH_RISK_PRESENT") && evidence.relevantEvidenceTags.includes("CONFLICTED_STATE_PRESENT"), JSON.stringify(evidence.relevantEvidenceTags));
}

// ---------------------------------------------------------------------------
// detectCognitiveGaps — insufficient evidence vs repeated evidence
// ---------------------------------------------------------------------------

{
  const rows = repeat(MIN_OCCURRENCE_COUNT - 1, () => row({ evidence: ["CONFLICTED_STATE_PRESENT"] }));
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  check(`6. Cognitive gap with insufficient evidence (${MIN_OCCURRENCE_COUNT - 1} < MIN_OCCURRENCE_COUNT) -> zero gaps raised`, gaps.length === 0, JSON.stringify(gaps));
}

{
  const rows = repeat(MIN_OCCURRENCE_COUNT, () => row({ evidence: ["CONFLICTED_STATE_PRESENT"] }));
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  check(`7. Repeated evidence supporting a gap (exactly MIN_OCCURRENCE_COUNT=${MIN_OCCURRENCE_COUNT}) -> CONTRADICTION_GAP raised, LOW severity (only 1 active category)`, gaps.length === 1 && gaps[0].category === "CONTRADICTION_GAP" && gaps[0].severity === "LOW" && gaps[0].evidence.occurrenceCount === MIN_OCCURRENCE_COUNT, JSON.stringify(gaps));
}

{
  const rows = repeat(CONFIDENCE_SAMPLE_CAP, () => row({ evidence: ["CONFLICTED_STATE_PRESENT"] }));
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  check(`8. Occurrence count >= CONFIDENCE_SAMPLE_CAP (${CONFIDENCE_SAMPLE_CAP}) -> HIGH severity even with only 1 active category`, gaps.length === 1 && gaps[0].severity === "HIGH", JSON.stringify(gaps));
}

{
  const rows = [...repeat(MIN_OCCURRENCE_COUNT, () => row({ evidence: ["CONFLICTED_STATE_PRESENT"] })), ...repeat(MIN_OCCURRENCE_COUNT, () => row({ evidence: ["CAUTIOUS_STATE_PRESENT"] }))];
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  const contradiction = gaps.find((g) => g.category === "CONTRADICTION_GAP");
  check("9. Two independently active categories -> each bumped to MEDIUM severity via corroboration", gaps.length === 2 && contradiction?.severity === "MEDIUM", JSON.stringify(gaps));
}

{
  const rows = repeat(MIN_OCCURRENCE_COUNT, () => row({ confidenceAlignment: "MISALIGNED" }));
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  check("10. Confidence alignment mismatch (repeated MISALIGNED) -> CONFIDENCE_ALIGNMENT_GAP raised, zero triggeringTags (top-level field, not a tag)", gaps.length === 1 && gaps[0].category === "CONFIDENCE_ALIGNMENT_GAP" && gaps[0].evidence.triggeringTags.length === 0, JSON.stringify(gaps));
}

{
  const rows = repeat(MIN_OCCURRENCE_COUNT, () => row({ evaluationClass: "BAD_DECISION_BAD_OUTCOME" }));
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  check("11. Repeated negative evaluation class -> PATTERN_GAP raised", gaps.length === 1 && gaps[0].category === "PATTERN_GAP", JSON.stringify(gaps));
}

{
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows: [], matchedPatternCount: 3, constraintValidations: [] });
  check("11b. Already-qualified failure pattern (matchedPatternCount > 0) alone -> PATTERN_GAP raised even with zero decision_evaluations rows", gaps.length === 1 && gaps[0].category === "PATTERN_GAP", JSON.stringify(gaps));
}

{
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows: [], matchedPatternCount: 0, constraintValidations: [validation("INCONSISTENT")] });
  check("11c. A single non-VALID constraint_validations row alone -> PATTERN_GAP raised (already-aggregate signal, no MIN_OCCURRENCE_COUNT re-applied)", gaps.length === 1 && gaps[0].category === "PATTERN_GAP", JSON.stringify(gaps));
}

{
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows: [], matchedPatternCount: 0, constraintValidations: [validation("VALID")] });
  check("11d. A VALID constraint_validations row does NOT raise PATTERN_GAP", gaps.length === 0, JSON.stringify(gaps));
}

// ---------------------------------------------------------------------------
// Source / symbol isolation
// ---------------------------------------------------------------------------

{
  const rows = repeat(MIN_OCCURRENCE_COUNT, () => row({ source: "AI_SIGNAL", evidence: ["CONFLICTED_STATE_PRESENT"] }));
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  check("12a. Source isolation — AI_SIGNAL rows never counted when querying ELVOID_PRO_ORACLE", gaps.length === 0, JSON.stringify(gaps));
}

{
  const rows = repeat(MIN_OCCURRENCE_COUNT, () => row({ symbol: "ETHUSDT", evidence: ["CONFLICTED_STATE_PRESENT"] }));
  const gaps = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  check("12b. Symbol isolation — ETHUSDT rows never counted when querying BTCUSDT", gaps.length === 0, JSON.stringify(gaps));
}

{
  const rows = repeat(MIN_OCCURRENCE_COUNT, () => row({ evidence: ["CONFLICTED_STATE_PRESENT"] }));
  const snapshot = JSON.stringify(rows);
  detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows, matchedPatternCount: 0, constraintValidations: [] });
  check("13. detectCognitiveGaps does not mutate its input rows", JSON.stringify(rows) === snapshot, "input rows array was mutated");
}

// ---------------------------------------------------------------------------
// Static scope audit
// ---------------------------------------------------------------------------

{
  const source = readFileSync(new URL("../../lib/ai/cognitiveGap/detect.ts", import.meta.url), "utf8");
  const withoutComments = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const forbidden = ["fetch(", "Date.now(", "Math.random(", "Supabase", "supabase", "openai", "anthropic"];
  const found = forbidden.filter((token) => withoutComments.toLowerCase().includes(token.toLowerCase()));
  check("14. detect.ts contains none of: fetch/Date.now/Math.random/Supabase/LLM-call (comments excluded)", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const qualifySource = readFileSync(new URL("../../lib/ai/decisionQualification/qualify.ts", import.meta.url), "utf8");
  check("15. decisionQualification/qualify.ts does not import cognitiveGap (gaps stay out of qualification)", !qualifySource.includes("cognitiveGap"), "qualify.ts references cognitiveGap");
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Cognitive Gap Detector fixtures passed.`);
if (failures > 0) process.exit(1);
