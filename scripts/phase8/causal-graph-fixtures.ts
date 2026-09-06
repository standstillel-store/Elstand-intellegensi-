// ---------------------------------------------------------------------------
// Phase 8.3.8 — Causal Graph fixtures (dev-only, not part of the app).
//
// derive.ts's only executable imports are `NEGATIVE_EVALUATION_CLASSES`/
// `MIN_OCCURRENCE_COUNT` (lib/ai/failurePatterns/detect.ts) and
// `buildLearningLoopChains` (lib/ai/learningLoop/traceChain.ts) — both
// pure, zero-supabase files (verified: neither transitively imports
// lib/ai/learning/db.ts). So this script really imports and calls
// `deriveLearningLineage()`/`deriveMemoryInfluence()` with real
// constructed fixture rows — not just a shape/syntax check.
// repository.ts transitively imports @supabase/supabase-js (via the
// repository modules it calls), so that file is checked by static source
// scan instead — same pattern every fixture script in this tree uses.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/causal-graph-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { deriveLearningLineage, deriveMemoryInfluence } from "@/lib/ai/causalGraph/derive";
import type { LearningLineageInput, RepresentativeTrade } from "@/lib/ai/causalGraph/derive";
import type { DecisionExperienceRecord } from "@/lib/ai/decisionOutcome/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";
import type { FailurePatternCandidate } from "@/lib/ai/failurePatterns/contracts";
import type { AdaptiveConstraint } from "@/lib/ai/adaptiveConstraint/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import type { LearningLineageGroupKey, CausalEdge } from "@/lib/ai/causalGraph/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

function findEdge(edges: readonly CausalEdge[], sourceKind: string, targetKind: string): CausalEdge | undefined {
  return edges.find((e) => e.source.kind === sourceKind && e.target.kind === targetKind);
}

// ---------------------------------------------------------------------------
// Fixture builders — a single, consistent (source, symbol, evidenceTag) group
// ---------------------------------------------------------------------------

const KEY: LearningLineageGroupKey = { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", evidenceTag: "HIGH_RISK_PRESENT" };

function experience(sourceSignalId: string, decisionTimestamp: string): DecisionExperienceRecord {
  return {
    id: "exp-1",
    source: KEY.source,
    sourceSignalId,
    symbol: KEY.symbol,
    side: "LONG",
    grade: "B",
    confidence: 0.4,
    decisionTimestamp,
    learningContext: null,
    outcome: { outcomeResult: "loss", outcomeRr: -1, outcomeProfitPercent: -2.1, outcomeDurationMinutes: 45, outcomeClosedAt: "2026-08-15T12:00:00.000Z" },
    createdAt: "2026-08-10T00:00:00.000Z",
  };
}

function negativeEvaluation(sourceSignalId: string, evidence: readonly DecisionEvaluation["evidence"][number][] = [KEY.evidenceTag]): DecisionEvaluation {
  return {
    version: 1,
    sourceSignalId,
    decisionQuality: "BAD",
    marketOutcome: "NEGATIVE",
    evaluationClass: "BAD_DECISION_BAD_OUTCOME",
    confidenceAlignment: "MISALIGNED",
    riskAlignment: "MISALIGNED",
    conflictAlignment: "UNKNOWN",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence,
    evaluatedAt: "2026-08-15T12:00:05.000Z",
  };
}

function positiveEvaluation(sourceSignalId: string): DecisionEvaluation {
  return { ...negativeEvaluation(sourceSignalId), decisionQuality: "GOOD", marketOutcome: "POSITIVE", evaluationClass: "GOOD_DECISION_GOOD_OUTCOME" };
}

function failurePattern(overrides: Partial<FailurePatternCandidate> = {}): FailurePatternCandidate {
  return {
    version: 1,
    source: KEY.source,
    symbol: KEY.symbol,
    evidenceTag: KEY.evidenceTag,
    dominantEvaluationClass: "BAD_DECISION_BAD_OUTCOME",
    occurrenceCount: 8,
    dominantClassShare: 0.75,
    confidence: 0.28,
    firstObservedAt: "2026-08-01T00:00:00.000Z",
    lastObservedAt: "2026-08-20T00:00:00.000Z",
    computedAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

function adaptiveConstraint(overrides: Partial<AdaptiveConstraint> = {}): AdaptiveConstraint {
  const p = failurePattern();
  return {
    version: 1,
    source: KEY.source,
    symbol: KEY.symbol,
    evidenceTag: KEY.evidenceTag,
    constraintType: "INCREASE_CAUTION",
    basis: { occurrenceCount: p.occurrenceCount, dominantClassShare: p.dominantClassShare, statisticalConfidence: p.confidence, firstObservedAt: p.firstObservedAt, lastObservedAt: p.lastObservedAt },
    generatedAt: "2026-08-21T00:05:00.000Z",
    ...overrides,
  };
}

function constraintValidation(status: ConstraintValidation["status"] = "VALID", overrides: Partial<ConstraintValidation> = {}): ConstraintValidation {
  const c = adaptiveConstraint();
  return {
    version: 1,
    source: KEY.source,
    symbol: KEY.symbol,
    evidenceTag: KEY.evidenceTag,
    constraintType: c.constraintType,
    status,
    signals: { sampleSizeAdequate: true, withinFreshnessWindow: true, structurallyConsistent: true, overfitRiskFlag: false },
    basis: { ...c.basis },
    validatedAt: "2026-08-21T00:10:00.000Z",
    ...overrides,
  };
}

function fullInput(overrides: Partial<LearningLineageInput> = {}): LearningLineageInput {
  const signalId = "signal-lineage-1";
  const exp = experience(signalId, "2026-08-10T00:00:00.000Z");
  const evalRow = negativeEvaluation(signalId);
  const representative: RepresentativeTrade = { experience: exp, evaluation: evalRow };
  return {
    key: KEY,
    representative,
    failurePattern: failurePattern(),
    constraint: adaptiveConstraint(),
    validation: constraintValidation("VALID"),
    memory: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Complete proven chain — every hop provable
// ---------------------------------------------------------------------------
{
  const result = deriveLearningLineage(fullInput());
  check("complete chain: 6 proven edges, 0 rejected", result.proven.length === 6 && result.rejected.length === 0, `proven=${result.proven.length} rejected=${result.rejected.length} rejections=${JSON.stringify(result.rejected)}`);

  const outcomeToEval = findEdge(result.proven, "decision_experiences", "decision_evaluations");
  check("complete chain: Outcome->Evaluation edge present, DERIVATION type", !!outcomeToEval && outcomeToEval.relationshipType === "DERIVATION", JSON.stringify(outcomeToEval));

  const evalToPattern = findEdge(result.proven, "decision_evaluations", "failure_pattern_candidates");
  check("complete chain: Evaluation->FailurePattern edge present, AGGREGATION type, confidence is the REAL persisted number (not fabricated)", !!evalToPattern && evalToPattern.relationshipType === "AGGREGATION" && evalToPattern.confidence === 0.28, JSON.stringify(evalToPattern));

  const patternToConstraint = findEdge(result.proven, "failure_pattern_candidates", "adaptive_constraints");
  check("complete chain: FailurePattern->Constraint edge present, COPY_FORWARD type, confidence null (structural proof, not a probability)", !!patternToConstraint && patternToConstraint.relationshipType === "COPY_FORWARD" && patternToConstraint.confidence === null, JSON.stringify(patternToConstraint));

  const constraintToValidation = findEdge(result.proven, "adaptive_constraints", "constraint_validations");
  check("complete chain: Constraint->Validation edge present, COPY_FORWARD type", !!constraintToValidation && constraintToValidation.relationshipType === "COPY_FORWARD", JSON.stringify(constraintToValidation));

  const validationToQual = findEdge(result.proven, "constraint_validations", "qualification");
  check("complete chain: Validation->Qualification edge present, GATING_INFLUENCE, cites real qualify.ts branch", !!validationToQual && validationToQual.relationshipType === "GATING_INFLUENCE" && validationToQual.mechanism.includes("qualify.ts"), JSON.stringify(validationToQual));

  const qualToDecision = findEdge(result.proven, "qualification", "decision");
  check("complete chain: Qualification->Decision edge present, cites real decide.ts::decideAutonomous()", !!qualToDecision && qualToDecision.mechanism.includes("decideAutonomous"), JSON.stringify(qualToDecision));

  check("complete chain: no edge anywhere has a fabricated confidence (only the one real aggregate number, else null)", result.proven.every((e) => e.confidence === null || e.confidence === 0.28), JSON.stringify(result.proven.map((e) => e.confidence)));
}

// ---------------------------------------------------------------------------
// 2. Direct behavioral chain: VALID constraint -> CAUTION -> WAIT (cited, not fabricated)
// ---------------------------------------------------------------------------
{
  const result = deriveLearningLineage(fullInput());
  const validationToQual = findEdge(result.proven, "constraint_validations", "qualification")!;
  check("VALID->CAUTION: mechanism cites cautionConstraintPresent -> CAUTION", validationToQual.mechanism.includes("cautionConstraintPresent") && validationToQual.mechanism.includes('"CAUTION"'), validationToQual.mechanism);
  const qualToDecision = findEdge(result.proven, "qualification", "decision")!;
  check("CAUTION->WAIT: mechanism cites the real fallthrough to WAIT (never claims EXECUTE)", qualToDecision.mechanism.toLowerCase().includes("wait") && !qualToDecision.mechanism.includes("-> EXECUTE for a CAUTION"), qualToDecision.mechanism);
}

// ---------------------------------------------------------------------------
// 3. Rejected edges — each with an explicit, checkable reason, never silently dropped
// ---------------------------------------------------------------------------
{
  // 3a. No evaluation row at all.
  {
    const input = fullInput({ representative: { experience: experience("s2", "2026-08-11T00:00:00.000Z"), evaluation: null } });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "decision_experiences" && r.target.kind === "decision_evaluations");
    check("rejected: no evaluation row -> reason cites evaluateAndPersistDecision() not wired", !!rejection && rejection.reason.includes("evaluateAndPersistDecision"), JSON.stringify(rejection));
  }

  // 3b. Evaluation class is NOT negative (structurally cannot feed a failure pattern).
  {
    const signalId = "s3";
    const input = fullInput({ representative: { experience: experience(signalId, "2026-08-11T00:00:00.000Z"), evaluation: positiveEvaluation(signalId) } });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "decision_evaluations" && r.target.kind === "failure_pattern_candidates");
    check("rejected: non-negative evaluationClass -> reason cites NEGATIVE_EVALUATION_CLASSES", !!rejection && rejection.reason.includes("NEGATIVE_EVALUATION_CLASSES"), JSON.stringify(rejection));
    // Outcome->Evaluation itself should still be PROVEN even though the next hop is rejected.
    check("rejected: Outcome->Evaluation still proven independently of the next hop's rejection", !!findEdge(result.proven, "decision_experiences", "decision_evaluations"), JSON.stringify(result.proven));
  }

  // 3c. Evaluation does not carry this group's evidenceTag.
  {
    const signalId = "s4";
    const input = fullInput({ representative: { experience: experience(signalId, "2026-08-11T00:00:00.000Z"), evaluation: negativeEvaluation(signalId, ["LOW_RISK_PRESENT"]) } });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "decision_evaluations" && r.target.kind === "failure_pattern_candidates");
    check("rejected: evidenceTag not in evaluation.evidence -> reason names the missing tag", !!rejection && rejection.reason.includes("HIGH_RISK_PRESENT"), JSON.stringify(rejection));
  }

  // 3d. No failure_pattern_candidates row persisted.
  {
    const input = fullInput({ failurePattern: null });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "decision_evaluations" && r.target.kind === "failure_pattern_candidates");
    check("rejected: no failure_pattern_candidates row -> reason cites MIN_OCCURRENCE_COUNT", !!rejection && rejection.reason.includes("MIN_OCCURRENCE_COUNT"), JSON.stringify(rejection));
  }

  // 3e. Decision falls outside the persisted aggregate's observed window.
  {
    const signalId = "s5";
    const input = fullInput({ representative: { experience: experience(signalId, "2020-01-01T00:00:00.000Z"), evaluation: negativeEvaluation(signalId) } });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "decision_evaluations" && r.target.kind === "failure_pattern_candidates");
    check("rejected: decision_timestamp outside [firstObservedAt,lastObservedAt] -> reason names the window", !!rejection && rejection.reason.includes("outside") && rejection.reason.includes("window"), JSON.stringify(rejection));
  }

  // 3f. No adaptive_constraints row persisted.
  {
    const input = fullInput({ constraint: null });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "failure_pattern_candidates" && r.target.kind === "adaptive_constraints");
    check("rejected: no adaptive_constraints row -> reason cites recomputeAdaptiveConstraints() not run", !!rejection && rejection.reason.includes("recomputeAdaptiveConstraints"), JSON.stringify(rejection));
  }

  // 3g. Constraint basis diverges (stale relative to latest recompute).
  {
    const staleConstraint = adaptiveConstraint({ basis: { ...adaptiveConstraint().basis, occurrenceCount: 3 } });
    const input = fullInput({ constraint: staleConstraint });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "failure_pattern_candidates" && r.target.kind === "adaptive_constraints");
    check("rejected: constraint.basis diverges from current failure_pattern_candidates -> reason cites staleness, never silently accepted", !!rejection && rejection.reason.includes("stale"), JSON.stringify(rejection));
  }

  // 3h. No constraint_validations row persisted.
  {
    const input = fullInput({ validation: null });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "adaptive_constraints" && r.target.kind === "constraint_validations");
    check("rejected: no constraint_validations row -> reason cites recomputeConstraintValidations() not run", !!rejection && rejection.reason.includes("recomputeConstraintValidations"), JSON.stringify(rejection));
  }

  // 3i. Validation status is not VALID (e.g. STALE) -> Qualification edge rejected.
  {
    const input = fullInput({ validation: constraintValidation("STALE") });
    const result = deriveLearningLineage(input);
    const rejection = result.rejected.find((r) => r.source.kind === "constraint_validations" && r.target.kind === "qualification");
    check("rejected: status=STALE -> currentlyInfluencesDecisions=false, no fabricated CAUTION edge", !!rejection && rejection.reason.includes("STALE") && rejection.reason.includes("currentlyInfluencesDecisions"), JSON.stringify(rejection));
    check("rejected: no Qualification->Decision edge fabricated when Validation->Qualification itself is rejected", !findEdge(result.proven, "qualification", "decision"), JSON.stringify(result.proven));
  }
}

// ---------------------------------------------------------------------------
// 4. Memory -> Qualification -> Decision: code-proven, never a historical claim
// ---------------------------------------------------------------------------
{
  // 4a. Negative-class matched evaluation present -> proven, CONFLICTED -> REJECT.
  {
    const memory: DecisionMemoryResult = { matchedExperiences: [], matchedEvaluations: [negativeEvaluation("m1")], matchedPatterns: [] };
    const result = deriveMemoryInfluence("BTCUSDT", memory);
    check("memory chain: 2 proven edges (Memory->Qualification, Qualification->Decision)", result.proven.length === 2 && result.rejected.length === 0, JSON.stringify(result));
    const memToQual = findEdge(result.proven, "decision_evaluations", "qualification")!;
    check("memory chain: cites hasNegativeMemorySignal() -> CONFLICTED", memToQual.mechanism.includes("hasNegativeMemorySignal") && memToQual.mechanism.includes("CONFLICTED"), memToQual.mechanism);
    check("memory chain: limitation explicitly disclaims this is a historical replay claim", memToQual.limitations.some((l) => l.includes("Code-behavior proof only") && l.includes("query-time-only")), JSON.stringify(memToQual.limitations));
    const qualToDecision = findEdge(result.proven, "qualification", "decision")!;
    check("memory chain: Qualification->Decision cites qualificationConflicted -> REJECT", qualToDecision.mechanism.includes("qualificationConflicted") && qualToDecision.mechanism.includes("REJECT"), qualToDecision.mechanism);
  }

  // 4b. Matched failure pattern present (no negative evaluation) -> still proven via matchedPatterns.
  {
    const memory: DecisionMemoryResult = { matchedExperiences: [], matchedEvaluations: [], matchedPatterns: [failurePattern()] };
    const result = deriveMemoryInfluence("BTCUSDT", memory);
    check("memory chain: matchedPatterns alone is sufficient for hasNegativeMemorySignal", result.proven.length === 2, JSON.stringify(result));
  }

  // 4c. No negative signal at all -> rejected, explicit reason.
  {
    const memory: DecisionMemoryResult = { matchedExperiences: [], matchedEvaluations: [positiveEvaluation("m2")], matchedPatterns: [] };
    const result = deriveMemoryInfluence("BTCUSDT", memory);
    check("memory chain: no negative signal -> 0 proven, 1 rejected with explicit reason", result.proven.length === 0 && result.rejected.length === 1 && result.rejected[0].reason.includes("hasNegativeMemorySignal"), JSON.stringify(result));
  }

  // 4d. Null memory -> rejected, never fabricated.
  {
    const result = deriveMemoryInfluence("BTCUSDT", null);
    check("memory chain: null memory -> 0 proven, 1 rejected", result.proven.length === 0 && result.rejected.length === 1, JSON.stringify(result));
  }
}

// ---------------------------------------------------------------------------
// 5. Deterministic rerun
// ---------------------------------------------------------------------------
{
  const input = fullInput();
  const a = deriveLearningLineage(input);
  const b = deriveLearningLineage(input);
  check("deterministic rerun: identical LearningLineageInput -> byte-identical output", JSON.stringify(a) === JSON.stringify(b), "outputs diverged");

  const memory: DecisionMemoryResult = { matchedExperiences: [], matchedEvaluations: [negativeEvaluation("m3")], matchedPatterns: [] };
  const c = deriveMemoryInfluence("BTCUSDT", memory);
  const d = deriveMemoryInfluence("BTCUSDT", memory);
  check("deterministic rerun: identical memory input -> byte-identical output", JSON.stringify(c) === JSON.stringify(d), "outputs diverged");
}

// ---------------------------------------------------------------------------
// 6. No causal inference from naming/correlation/timestamp-proximity/UI adjacency —
//    a group key mismatch must never produce a proven edge even when every other field lines up.
// ---------------------------------------------------------------------------
{
  const mismatchedConstraint = adaptiveConstraint({ symbol: "ETHUSDT" }); // same basis numbers, different symbol
  const input = fullInput({ constraint: mismatchedConstraint });
  const result = deriveLearningLineage(input);
  const rejection = result.rejected.find((r) => r.source.kind === "failure_pattern_candidates" && r.target.kind === "adaptive_constraints");
  check("no inference from coincidental basis match: symbol mismatch still rejects the edge", !!rejection && rejection.reason.includes("identity mismatch"), JSON.stringify(rejection));
}

// ---------------------------------------------------------------------------
// 7. Static source-scan checks — repository.ts (supabase-touching), contracts.ts
// ---------------------------------------------------------------------------
{
  const repoSrc = readFileSync(new URL("../../lib/ai/causalGraph/repository.ts", import.meta.url), "utf8");
  check("repository.ts: no write/insert/update/upsert call anywhere (read-only module)", !/\.(insert|update|upsert|delete)\(/.test(repoSrc), "found a write-shaped call");
  check("repository.ts: never falls back to Date.now()/Math.random for any id, score, or timestamp", !/Date\.now\(\)|Math\.random\(\)/.test(repoSrc), "found a non-deterministic call");
  check("repository.ts: handles getConstraintValidations() null return (Learning DB unconfigured) before .find()", repoSrc.includes("(validations ?? [])"), "unsafe null handling on validations");

  const contractsSrc = readFileSync(new URL("../../lib/ai/causalGraph/contracts.ts", import.meta.url), "utf8");
  check("contracts.ts: confidence documented as null-unless-naturally-derivable, never fabricated", contractsSrc.includes("Never fabricated"), "fabrication guard doc missing");
  check("contracts.ts: rejection type exists and is distinct from a proven edge (never silently merged)", contractsSrc.includes("CausalEdgeRejection"), "rejection type missing");

  const deriveSrc = readFileSync(new URL("../../lib/ai/causalGraph/derive.ts", import.meta.url), "utf8");
  check("derive.ts: zero direct Learning DB / supabase import (pure module)", !/supabase|learning\/db/i.test(deriveSrc), "unexpected I/O-adjacent import found");
  check("derive.ts: reuses buildLearningLoopChains() rather than re-deriving currentlyInfluencesDecisions a second way", deriveSrc.includes("buildLearningLoopChains"), "expected reuse not found");
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed (Phase 8.3.8 Causal Graph)`);
if (failures > 0) process.exit(1);
