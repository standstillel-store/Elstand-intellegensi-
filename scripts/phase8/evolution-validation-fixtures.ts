// ---------------------------------------------------------------------------
// Phase 8.6.6 — Versioned Learning Validation + Regression Guard fixtures
// (dev-only). Pure/offline — exercises validate.ts only.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-validation-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { validateEvolutionCandidate } from "@/lib/ai/evolutionValidation/validate";
import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { DecisionSource, GapCategory, GapSeverity, CandidateStatus, ReplayComparison, ReplaySlice } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvaluationCoverageReport, SelfPerformanceAggregate, EvaluationCoverageStatus } from "@/lib/ai/selfPerformance/contracts";

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

function coverage(status: EvaluationCoverageStatus, closedExperienceCount = 20): EvaluationCoverageReport {
  return {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    closedExperienceCount,
    evaluatedExperienceCount: status === "INSUFFICIENT_DATA" ? closedExperienceCount : closedExperienceCount,
    unevaluatedExperienceCount: 0,
    coverageRatio: 1,
    status,
  };
}

function performance(totalEvaluated: number): SelfPerformanceAggregate {
  return {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    totalEvaluated,
    evaluationClassCounts: { GOOD_DECISION_GOOD_OUTCOME: totalEvaluated, GOOD_DECISION_BAD_OUTCOME: 0, BAD_DECISION_GOOD_OUTCOME: 0, BAD_DECISION_BAD_OUTCOME: 0, NEUTRAL_OUTCOME: 0, INSUFFICIENT_EVIDENCE: 0 },
    decisionQualityCounts: { GOOD: totalEvaluated, BAD: 0, UNKNOWN: 0 },
    marketOutcomeCounts: { POSITIVE: totalEvaluated, NEGATIVE: 0, NEUTRAL: 0, UNKNOWN: 0 },
    confidenceAlignmentCounts: { ALIGNED: totalEvaluated, MISALIGNED: 0, UNKNOWN: 0 },
  };
}

// Phase 8.6.6b: which other categories a hand-built slice reports as active — the first N of this fixed list, so a larger N is a strict superset.
const OTHER_CATEGORIES: readonly GapCategory[] = ["CONTEXT_GAP", "EVIDENCE_GAP", "REASONING_CONSISTENCY_GAP", "CONFIDENCE_ALIGNMENT_GAP"];

function slice(windowLabel: ReplaySlice["windowLabel"], targetGapRate: number, otherActiveGapCount: number, sufficientData = true): ReplaySlice {
  const totalEvaluated = 20;
  return {
    windowLabel,
    decisionTimestampFrom: "2026-08-01T00:00:00.000Z",
    decisionTimestampTo: "2026-08-15T00:00:00.000Z",
    coverage: coverage(sufficientData ? "COMPLETE" : "INSUFFICIENT_DATA", sufficientData ? totalEvaluated : 2),
    performance: performance(totalEvaluated),
    targetGapOccurrenceCount: Math.round(targetGapRate * totalEvaluated),
    targetGapRate,
    otherActiveGapCount,
    // Phase 8.6.5b: the hand-built slice is all-eligible, matching performance(totalEvaluated).
    sampleAccounting: { scopedTotal: totalEvaluated, eligible: totalEvaluated, excluded: 0, exclusionReasons: [{ reason: "OPEN_NO_OUTCOME", count: 0 }, { reason: "CLOSED_UNEVALUATED", count: 0 }] },
    // Phase 8.6.6b: the raw figures equal the hand-built rate; identity lists the first N categories.
    targetRawOccurrenceCount: Math.round(targetGapRate * totalEvaluated),
    targetRawGapRate: targetGapRate,
    otherActiveGapCategories: OTHER_CATEGORIES.slice(0, otherActiveGapCount),
  };
}

function comparison(baselineRate: number, candidateRate: number, baselineOther: number, candidateOther: number, sufficientData = true): ReplayComparison {
  const baseline = slice("BASELINE", baselineRate, baselineOther, sufficientData);
  const candidate = slice("CANDIDATE", candidateRate, candidateOther, sufficientData);
  const baselineOthers = baseline.otherActiveGapCategories ?? [];
  const newlyActiveGapCategories = (candidate.otherActiveGapCategories ?? []).filter((c) => !baselineOthers.includes(c)).sort();
  return { baseline, candidate, targetGapRateDelta: candidate.targetGapRate - baseline.targetGapRate, otherActiveGapCountDelta: candidate.otherActiveGapCount - baseline.otherActiveGapCount, newlyActiveGapCategories };
}

function candidate(overrides: { status?: CandidateStatus; replay?: ReplayComparison | null; violatingKeywords?: readonly string[] } = {}): EvolutionCandidateWithoutTimestamp {
  return {
    candidateId: "candidate:ELVOID_PRO_ORACLE:BTCUSDT:CONTRADICTION_GAP",
    proposalId: "ELVOID_PRO_ORACLE:BTCUSDT:CONTRADICTION_GAP",
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    gapCategory: "CONTRADICTION_GAP",
    gapSeverity: "HIGH",
    hypothesis: "fixture hypothesis",
    proposedChange: "fixture proposed change",
    baselineVersion: "phase-8.6.4",
    candidateVersion: "phase-8.6.5:candidate:x",
    scope: { withinScope: (overrides.violatingKeywords ?? []).length === 0, domainsChecked: ["risk", "execution"], violatingKeywords: overrides.violatingKeywords ?? [] },
    replayApplicability: { applicable: true, reason: null },
    replayLimitation: null,
    status: overrides.status ?? "REPLAY_PASSED",
    replay: overrides.replay === undefined ? comparison(0.5, 0.1, 0, 0) : overrides.replay,
  };
}

// ---------------------------------------------------------------------------
// validateEvolutionCandidate — decision table
// ---------------------------------------------------------------------------

{
  const v = validateEvolutionCandidate(candidate({ status: "VALIDATION_BLOCKED", replay: null, violatingKeywords: ["risk"] }));
  check("1. VALIDATION_BLOCKED candidate -> INVALID outright, not merely INCONCLUSIVE", v.result === "INVALID", JSON.stringify(v.result));
}

{
  const v = validateEvolutionCandidate(candidate({ status: "REPLAY_FAILED", replay: null }));
  check("2. REPLAY_FAILED / insufficient historical data -> INSUFFICIENT_EVIDENCE", v.result === "INSUFFICIENT_EVIDENCE", JSON.stringify(v.result));
}

{
  const v = validateEvolutionCandidate(candidate({ replay: comparison(0.5, 0.1, 0, 0) }));
  check("3. Target gap rate fell (0.5 -> 0.1), no other category regressed -> VALID", v.result === "VALID" && v.regressionCheck.regressionDetected === false, JSON.stringify(v));
}

{
  const v = validateEvolutionCandidate(candidate({ replay: comparison(0.3, 0.3, 0, 0) }));
  check("4. No measurable improvement (rate unchanged) -> INCONCLUSIVE", v.result === "INCONCLUSIVE", JSON.stringify(v.result));
}

{
  const v = validateEvolutionCandidate(candidate({ replay: comparison(0.3, 0.4, 0, 0) }));
  check("4b. Target gap rate rose, nothing else regressed -> INCONCLUSIVE (never claimed VALID)", v.result === "INCONCLUSIVE", JSON.stringify(v.result));
}

{
  const v = validateEvolutionCandidate(candidate({ replay: comparison(0.5, 0.1, 0, 2) }));
  check("5. Target metric improved (0.5 -> 0.1) BUT 2 other gap categories became active -> REGRESSION_DETECTED / INVALID, never VALID despite the improved target metric", v.result === "INVALID" && v.regressionCheck.regressionDetected === true && v.regressionCheck.otherActiveGapCountDelta === 2, JSON.stringify(v));
}

{
  const v = validateEvolutionCandidate(candidate({ replay: null }));
  check("6. UNKNOWN remains UNKNOWN — metricsObserved is null (never a fabricated empty comparison) when no replay ran", v.metricsObserved === null, JSON.stringify(v.metricsObserved));
}

{
  const v = validateEvolutionCandidate(candidate({ replay: comparison(0.5, 0.1, 0, 0) }));
  check("7. No fabricated improvement claim — result VALID never asserts a numeric magnitude beyond what evidence shows; evidence array states the two observed rates plainly", v.evidence.some((e) => e.includes("0.500")) && v.evidence.some((e) => e.includes("0.100")), JSON.stringify(v.evidence));
}

{
  const a = validateEvolutionCandidate(candidate({ replay: comparison(0.5, 0.1, 0, 0) }));
  const b = validateEvolutionCandidate(candidate({ replay: comparison(0.5, 0.1, 0, 0) }));
  check("8. Deterministic — same candidate input always produces the same result/evidence", JSON.stringify(a) === JSON.stringify(b), "two calls with identical input produced different output");
}

{
  const v = validateEvolutionCandidate(candidate());
  check("9. Invariant checks report qualification/arbitration/risk/execution untouched (always true by construction — see static scan)", v.invariantChecks.qualificationUntouched && v.invariantChecks.arbitrationUntouched && v.invariantChecks.riskUntouched && v.invariantChecks.executionUntouched, JSON.stringify(v.invariantChecks));
}

{
  const v = validateEvolutionCandidate(candidate({ replay: comparison(0.5, 0.1, 0, 0) }));
  check("10. Source/symbol isolation preserved and reported (data-level check against the candidate's own replay slices)", v.invariantChecks.sourceIsolationPreserved && v.invariantChecks.symbolIsolationPreserved, JSON.stringify(v.invariantChecks));
}

{
  const v = validateEvolutionCandidate(candidate({ replay: comparison(0.5, 0.1, 0, 0) }));
  check("11. Evidence, limitations, baseline/candidate references, and dataset reference are all non-empty (auditability)", v.evidence.length > 0 && v.limitations.length > 0 && v.baselineReference.length > 0 && v.candidateReference.length > 0 && v.replayDatasetReference.length > 0, JSON.stringify({ evidence: v.evidence.length, limitations: v.limitations.length }));
}

// ---------------------------------------------------------------------------
// Static scope audit
// ---------------------------------------------------------------------------

{
  const files = ["../../lib/ai/evolutionValidation/contracts.ts", "../../lib/ai/evolutionValidation/validate.ts", "../../lib/ai/evolutionValidation/repository.ts"];
  const forbiddenStatuses = ["APPROVED", "ACTIVE", "DEPLOYED", "PRODUCTION_MUTATED"];
  let found: string[] = [];
  for (const f of files) {
    const source = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const status of forbiddenStatuses) if (source.includes(`"${status}"`)) found.push(`${f}:${status}`);
  }
  check("12. No file in lib/ai/evolutionValidation contains APPROVED/ACTIVE/DEPLOYED/PRODUCTION_MUTATED as a literal", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const files = ["../../lib/ai/evolutionValidation/validate.ts", "../../lib/ai/evolutionValidation/repository.ts"];
  const forbiddenImports = ['from "@/lib/ai/oracle/arbitration', 'from "@/lib/ai/autonomousExecution', 'from "@/lib/ai/decisionQualification', 'from "@/lib/ai/oracle/risk', "fetch(", "Date.now(", "Math.random(", "openai", "anthropic", "execSync", "child_process", "octokit", "github", "vercel", "telegram"];
  let found: string[] = [];
  for (const f of files) {
    const source = readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const token of forbiddenImports) if (source.toLowerCase().includes(token.toLowerCase())) found.push(`${f}:${token}`);
  }
  check("13. No validation file imports qualification/arbitration/execution/risk, calls an LLM, shells out, or touches GitHub/Vercel/Telegram", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const qualifySource = readFileSync(new URL("../../lib/ai/decisionQualification/qualify.ts", import.meta.url), "utf8");
  const executeSource = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");
  check("14. qualify.ts and execute.ts do not import evolutionValidation — validation never touches the live decision path", !qualifySource.includes("evolutionValidation") && !executeSource.includes("evolutionValidation"), "qualify.ts or execute.ts references evolutionValidation");
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Evolution Validation + Regression Guard fixtures passed.`);
if (failures > 0) process.exit(1);
