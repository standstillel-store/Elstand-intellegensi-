// ---------------------------------------------------------------------------
// Phase 8.6.6b — Validation gates, deterministic replay, regression identity,
// truncation guard fixtures (dev-only). Pure/offline.
//
// The gates are ENGINEERING validation gates for an observational replay —
// not statistical significance and not evidence of causal improvement. These
// fixtures test that the gates are applied exactly as specified, never that
// a passing result "proves" anything.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-validation-gates-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { checkCandidateScope, finalizeCandidate } from "@/lib/ai/evolutionCandidate/create";
import { buildReplayComparison, compareReplayRows, normalizePersistedReplay } from "@/lib/ai/evolutionCandidate/replay";
import { POPULATION_TRUNCATION_GUARD_ROW_COUNT, isPopulationPossiblyTruncated } from "@/lib/ai/evolutionCandidate/semantics";
import { validateEvolutionCandidate } from "@/lib/ai/evolutionValidation/validate";
import { VALIDATION_GATE_ORDER, VALIDATION_GATE_THRESHOLDS } from "@/lib/ai/evolutionValidation/gates";
import { countRawGapOccurrences, detectCognitiveGaps } from "@/lib/ai/cognitiveGap/detect";
import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { DecisionSource, GapCategory, ReplayComparison, ReplaySlice, EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { DecisionMemoryJoinedRow, DecisionExperienceRecord } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

type Tag = "CONFLICTED_STATE_PRESENT" | "INSUFFICIENT_CONTEXT_STATE_PRESENT" | "CAUTIOUS_STATE_PRESENT";

let idCounter = 0;
function row(decisionTimestamp: string, tags: Tag[] = [], sourceSignalId?: string): DecisionMemoryJoinedRow {
  idCounter++;
  const experience: DecisionExperienceRecord = {
    id: `exp-${String(idCounter).padStart(5, "0")}`,
    source: "ELVOID_PRO_ORACLE",
    sourceSignalId: sourceSignalId ?? `sig-${String(idCounter).padStart(5, "0")}`,
    symbol: "BTCUSDT",
    side: "LONG",
    grade: "A",
    confidence: 70,
    decisionTimestamp,
    learningContext: null,
    createdAt: decisionTimestamp,
    outcome: { outcomeResult: "win", outcomeRr: 1.5, outcomeProfitPercent: 2.1, outcomeDurationMinutes: 60, outcomeClosedAt: decisionTimestamp },
  };
  const evaluation: DecisionEvaluation = {
    version: 1,
    sourceSignalId: experience.sourceSignalId,
    decisionQuality: "GOOD",
    marketOutcome: "POSITIVE",
    evaluationClass: "GOOD_DECISION_GOOD_OUTCOME",
    confidenceAlignment: "ALIGNED",
    riskAlignment: "NOT_APPLICABLE",
    conflictAlignment: "NOT_APPLICABLE",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: tags as never,
    evaluatedAt: decisionTimestamp,
  };
  return { experience, evaluation };
}

const day = (d: number) => new Date(Date.UTC(2026, 7, d)).toISOString();

function proposal(gapCategory: GapCategory = "CONTRADICTION_GAP"): EvolutionProposalWithoutTimestamp {
  return {
    proposalId: `ELVOID_PRO_ORACLE:BTCUSDT:${gapCategory}`,
    proposalVersion: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    currentSystemVersion: "phase-8.6.4",
    gapCategory,
    gapSeverity: "HIGH",
    evidence: { occurrenceCount: 8, evaluatedCount: 40, triggeringTags: [] },
    hypothesis: "Repeated unresolved contradiction observed for this source/symbol.",
    proposedChange: "Investigate whether the current contradiction-resolution logic under-resolves disagreement for this source/symbol; validate through historical replay before considering any production change.",
    expectedEffect: "Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol"],
    status: "DRAFT",
  };
}

function run(rows: readonly DecisionMemoryJoinedRow[], gapCategory: GapCategory = "CONTRADICTION_GAP"): { replay: ReplayComparison; candidate: EvolutionCandidateWithoutTimestamp; validation: EvolutionValidationWithoutTimestamp } {
  const p = proposal(gapCategory);
  const replay = buildReplayComparison(p.source, p.symbol, p.gapCategory, rows);
  const candidate = finalizeCandidate(p, checkCandidateScope(p.hypothesis, p.proposedChange), replay);
  return { replay, candidate, validation: validateEvolutionCandidate(candidate) };
}

/** A window of `n` evaluated rows starting at `startDay`, the first `tagged` of which carry `tag`, plus optional extra rows carrying `extraTag`. */
function window(startDay: number, n: number, tagged: number, tag: Tag = "CONFLICTED_STATE_PRESENT", extra: { count: number; tag: Tag } | null = null): DecisionMemoryJoinedRow[] {
  return Array.from({ length: n }, (_, i) => {
    const tags: Tag[] = [];
    if (i < tagged) tags.push(tag);
    else if (extra !== null && i < tagged + extra.count) tags.push(extra.tag);
    return row(day(startDay + i), tags);
  });
}

/** Hand-built comparison with exact raw counts and eligible totals — for boundary cases the row pipeline cannot express directly. */
function synthetic(baselineRaw: number, baselineN: number, candidateRaw: number, candidateN: number, baselineOthers: GapCategory[] = [], candidateOthers: GapCategory[] = []): ReplayComparison {
  const base = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", window(1, 40, 0));
  const mk = (slice: ReplaySlice, raw: number, n: number, others: GapCategory[]): ReplaySlice => ({
    ...slice,
    performance: { ...slice.performance, totalEvaluated: n },
    sampleAccounting: { scopedTotal: n, eligible: n, excluded: 0, exclusionReasons: [{ reason: "OPEN_NO_OUTCOME", count: 0 }, { reason: "CLOSED_UNEVALUATED", count: 0 }] },
    targetRawOccurrenceCount: raw,
    targetRawGapRate: n === 0 ? 0 : raw / n,
    targetGapOccurrenceCount: raw >= MIN_OCCURRENCE_COUNT ? raw : 0,
    targetGapRate: raw >= MIN_OCCURRENCE_COUNT && n > 0 ? raw / n : 0,
    otherActiveGapCount: others.length,
    otherActiveGapCategories: [...others].sort(),
  });
  const baseline = mk(base.baseline, baselineRaw, baselineN, baselineOthers);
  const candidate = mk(base.candidate, candidateRaw, candidateN, candidateOthers);
  const newly = (candidate.otherActiveGapCategories ?? []).filter((c) => !(baseline.otherActiveGapCategories ?? []).includes(c)).sort();
  return { baseline, candidate, targetGapRateDelta: candidate.targetGapRate - baseline.targetGapRate, otherActiveGapCountDelta: candidate.otherActiveGapCount - baseline.otherActiveGapCount, newlyActiveGapCategories: newly };
}

function validateSynthetic(replay: ReplayComparison): EvolutionValidationWithoutTimestamp {
  const p = proposal();
  return validateEvolutionCandidate(finalizeCandidate(p, checkCandidateScope(p.hypothesis, p.proposedChange), replay));
}

// ---------------------------------------------------------------------------
// D1 — deterministic ordering
// ---------------------------------------------------------------------------

{
  // Every row shares ONE timestamp; only the tag placement and input order vary.
  const sameTs = day(1);
  const rows = [...Array.from({ length: 10 }, (_, i) => row(sameTs, ["CONFLICTED_STATE_PRESENT"], `tied-${String(i).padStart(2, "0")}`)), ...Array.from({ length: 10 }, (_, i) => row(sameTs, [], `tied-${String(10 + i).padStart(2, "0")}`))];
  const forward = JSON.stringify(buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows));
  const reversed = JSON.stringify(buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", [...rows].reverse()));
  const rotated = JSON.stringify(buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", [...rows.slice(7), ...rows.slice(0, 7)]));
  const interleaved = JSON.stringify(buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows.filter((_, i) => i % 2 === 0).concat(rows.filter((_, i) => i % 2 === 1))));
  check("D1a. fully tied timestamps: the SAME rows in forward / reversed / rotated / interleaved input order give byte-identical comparisons", forward === reversed && forward === rotated && forward === interleaved, "comparison JSON differed by input order");

  const cmp = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", [...rows].reverse());
  check("D1b. ties are broken by sourceSignalId — the tagged rows (lowest ids) all land in the older window", cmp.baseline.targetRawOccurrenceCount === 10 && cmp.candidate.targetRawOccurrenceCount === 0, JSON.stringify([cmp.baseline.targetRawOccurrenceCount, cmp.candidate.targetRawOccurrenceCount]));
}

{
  const a = row(day(1), [], "same-signal");
  const b = row(day(1), [], "same-signal");
  const c = row(day(2), [], "aaa");
  const sorted = [c, b, a].sort(compareReplayRows);
  check("D1c. compareReplayRows is a total order: timestamp first, then sourceSignalId, then experience id; antisymmetric and self-equal", sorted[0] === a && sorted[1] === b && sorted[2] === c && compareReplayRows(a, b) === -compareReplayRows(b, a) && compareReplayRows(a, a) === 0, JSON.stringify(sorted.map((r) => r.experience.id)));
}

// ---------------------------------------------------------------------------
// D2 — raw occurrence counts, no detection-threshold cliff
// ---------------------------------------------------------------------------

{
  const four = window(1, 20, 4);
  const five = window(1, 20, 5);
  const gaps4 = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows: four, matchedPatternCount: 0, constraintValidations: [] });
  const gaps5 = detectCognitiveGaps({ source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", rows: five, matchedPatternCount: 0, constraintValidations: [] });
  const evals = (rows: DecisionMemoryJoinedRow[]) => rows.map((r) => r.evaluation as DecisionEvaluation);
  check(
    "D2a. countRawGapOccurrences reports the raw count below the detection threshold (4) and equals the detected occurrenceCount at/above it (5)",
    countRawGapOccurrences(evals(four), "CONTRADICTION_GAP") === 4 && gaps4.length === 0 && countRawGapOccurrences(evals(five), "CONTRADICTION_GAP") === 5 && gaps5[0]?.evidence.occurrenceCount === 5,
    JSON.stringify({ raw4: countRawGapOccurrences(evals(four), "CONTRADICTION_GAP"), gaps4: gaps4.length })
  );
  check("D2b. REJECT_DOMINANCE_GAP has no evaluation-based raw count (null), never a fabricated 0", countRawGapOccurrences(evals(five), "REJECT_DOMINANCE_GAP") === null, "expected null");
}

{
  // The audit probe: raw 5 -> 4 of 20 per window. Thresholded, that reads as 0.25 -> 0.00; raw, it is 0.25 -> 0.20.
  const { replay } = run([...window(1, 20, 5), ...window(21, 20, 4)]);
  check(
    "D2c. cliff removed: 5 -> 4 occurrences reads as a one-row change on the RAW rate (0.25 -> 0.20) while the thresholded figure still shows the cliff (0.25 -> 0)",
    replay.baseline.targetRawGapRate === 0.25 && replay.candidate.targetRawGapRate === 0.2 && replay.baseline.targetGapRate === 0.25 && replay.candidate.targetGapRate === 0,
    JSON.stringify({ raw: [replay.baseline.targetRawGapRate, replay.candidate.targetRawGapRate], thresholded: [replay.baseline.targetGapRate, replay.candidate.targetGapRate] })
  );
}

// ---------------------------------------------------------------------------
// VALID gates — exact boundaries and each gate individually
// ---------------------------------------------------------------------------

{
  check("G0. thresholds are exactly the specified engineering gates (20 samples, 5 percentage points, 20 percent)", VALIDATION_GATE_THRESHOLDS.minEligibleSamplesPerWindow === 20 && VALIDATION_GATE_THRESHOLDS.minAbsoluteReductionPercentagePoints === 5 && VALIDATION_GATE_THRESHOLDS.minRelativeReductionPercent === 20, JSON.stringify(VALIDATION_GATE_THRESHOLDS));
}

{
  // 5/20 -> 4/20: exactly 5 points and exactly 20%. Floating-point subtraction gets this WRONG (0.25 - 0.2 = 0.04999999999999999).
  const v = validateSynthetic(synthetic(5, 20, 4, 20));
  check("G1. exactly on both thresholds (5/20 -> 4/20: 5.0 points, 20.0%) -> VALID, computed with exact integer arithmetic (floats would give 0.04999999999999999)", 0.25 - 0.2 < 0.05 && v.result === "VALID" && v.gates.every((g) => g.passed), JSON.stringify(v.gates));
}

{
  const v = validateSynthetic(synthetic(10, 20, 9, 20));
  check("G2. absolute reduction met (5.0 points) but relative reduction not (10%) -> INCONCLUSIVE, and the relative gate is the one that failed", v.result === "INCONCLUSIVE" && v.gates.find((g) => g.gate === "MIN_RELATIVE_REDUCTION")?.passed === false && v.gates.find((g) => g.gate === "MIN_ABSOLUTE_REDUCTION")?.passed === true, JSON.stringify(v.gates.map((g) => [g.gate, g.passed])));
}

{
  const v = validateSynthetic(synthetic(10, 100, 7, 100));
  check("G3. relative reduction met (30%) but absolute not (3.0 points) -> INCONCLUSIVE, and the absolute gate is the one that failed", v.result === "INCONCLUSIVE" && v.gates.find((g) => g.gate === "MIN_ABSOLUTE_REDUCTION")?.passed === false && v.gates.find((g) => g.gate === "MIN_RELATIVE_REDUCTION")?.passed === true, JSON.stringify(v.gates.map((g) => [g.gate, g.passed])));
}

{
  const flat = validateSynthetic(synthetic(5, 20, 5, 20));
  const rose = validateSynthetic(synthetic(4, 20, 8, 20));
  const zero = validateSynthetic(synthetic(0, 20, 0, 20));
  check("G4. rate must actually fall: unchanged -> INCONCLUSIVE, rose -> INCONCLUSIVE, baseline 0 -> INCONCLUSIVE (relative reduction undefined), never VALID", flat.result === "INCONCLUSIVE" && rose.result === "INCONCLUSIVE" && zero.result === "INCONCLUSIVE" && [flat, rose, zero].every((v) => v.gates.find((g) => g.gate === "TARGET_RATE_DECREASED")?.passed === false), JSON.stringify([flat.result, rose.result, zero.result]));
}

{
  const fewCandidate = validateSynthetic(synthetic(10, 20, 2, 19));
  const fewBaseline = validateSynthetic(synthetic(10, 19, 2, 20));
  check("G5. fewer than 20 eligible samples in EITHER window -> INSUFFICIENT_EVIDENCE even with a large reduction (19 in newer / 19 in older)", fewCandidate.result === "INSUFFICIENT_EVIDENCE" && fewBaseline.result === "INSUFFICIENT_EVIDENCE" && fewCandidate.gates[0].gate === "MIN_ELIGIBLE_SAMPLES_BOTH_WINDOWS" && fewCandidate.gates[0].passed === false, JSON.stringify([fewCandidate.result, fewBaseline.result]));
  const exactly = validateSynthetic(synthetic(10, 20, 2, 20));
  check("G5b. exactly 20 eligible in each window with a large reduction -> VALID (the minimum is inclusive)", exactly.result === "VALID", JSON.stringify(exactly.result));
}

{
  const v = validateSynthetic(synthetic(10, 20, 2, 20, ["CONTEXT_GAP"], ["CONTEXT_GAP", "EVIDENCE_GAP"]));
  check("G6. a large reduction alongside a newly active gap category -> INVALID (regression), never VALID", v.result === "INVALID" && v.regressionCheck.regressionDetected === true && v.gates.find((g) => g.gate === "NO_NEWLY_ACTIVE_GAP_CATEGORIES")?.passed === false, JSON.stringify(v.regressionCheck));
}

{
  const v = validateSynthetic(synthetic(10, 20, 2, 20));
  check(
    "G7. the gates array lists all 7 gates in the fixed order with thresholds recorded, when a replay was evaluated",
    JSON.stringify(v.gates.map((g) => g.gate)) === JSON.stringify(VALIDATION_GATE_ORDER) && v.gates.length === 7 && JSON.stringify(v.gateThresholds) === JSON.stringify(VALIDATION_GATE_THRESHOLDS),
    JSON.stringify(v.gates.map((g) => g.gate))
  );
}

// ---------------------------------------------------------------------------
// D3 — regression identity (a swap is no longer masked by an equal count)
// ---------------------------------------------------------------------------

{
  // Older: target CONTRADICTION (6) + CONTEXT (5).  Newer: target (2) + EVIDENCE (5). Count of other gaps is 1 -> 1.
  const older = [...window(1, 20, 6, "CONFLICTED_STATE_PRESENT", { count: 5, tag: "INSUFFICIENT_CONTEXT_STATE_PRESENT" })];
  const newer = [...window(21, 20, 2, "CONFLICTED_STATE_PRESENT", { count: 5, tag: "CAUTIOUS_STATE_PRESENT" })];
  const { replay, validation } = run([...older, ...newer]);
  check(
    "D3a. swap (CONTEXT_GAP leaves, EVIDENCE_GAP arrives): count delta is 0 but the newly active list is [EVIDENCE_GAP] -> INVALID, regression evaluated and detected, despite the target rate falling 30% -> 10%",
    replay.otherActiveGapCountDelta === 0 &&
      JSON.stringify(replay.newlyActiveGapCategories) === JSON.stringify(["EVIDENCE_GAP"]) &&
      validation.result === "INVALID" &&
      validation.regressionCheck.evaluated === true &&
      validation.regressionCheck.regressionDetected === true &&
      JSON.stringify(validation.regressionCheck.newlyActiveGapCategories) === JSON.stringify(["EVIDENCE_GAP"]),
    JSON.stringify({ delta: replay.otherActiveGapCountDelta, newly: replay.newlyActiveGapCategories, result: validation.result })
  );
  check(
    "D3b. each slice names WHICH other categories were active (older [CONTEXT_GAP], newer [EVIDENCE_GAP])",
    JSON.stringify(replay.baseline.otherActiveGapCategories) === JSON.stringify(["CONTEXT_GAP"]) && JSON.stringify(replay.candidate.otherActiveGapCategories) === JSON.stringify(["EVIDENCE_GAP"]),
    JSON.stringify([replay.baseline.otherActiveGapCategories, replay.candidate.otherActiveGapCategories])
  );
}

{
  const v = validateSynthetic(synthetic(10, 15, 2, 15, [], ["EVIDENCE_GAP"]));
  check("D3c. a regression is surfaced, not hidden behind the sample gate: a newly active category with only 15 eligible samples is INVALID, not INSUFFICIENT_EVIDENCE", v.result === "INVALID", JSON.stringify(v.result));
}

// ---------------------------------------------------------------------------
// End-to-end through the real pipeline
// ---------------------------------------------------------------------------

{
  // Older: 8 of 20 carry the target evidence (40%); newer: 3 of 20 (15%) — below the detection threshold, so the THRESHOLDED newer rate is 0.
  const { validation, replay } = run([...window(1, 20, 8), ...window(21, 20, 3)]);
  check(
    "E1. real pipeline, 40% -> 15% raw (25 points, 62.5%), 20 eligible per window, nothing else active -> VALID with all 7 gates passed",
    validation.result === "VALID" && validation.gates.length === 7 && validation.gates.every((g) => g.passed) && validation.regressionCheck.evaluated === true && replay.candidate.targetGapRate === 0,
    JSON.stringify({ r: validation.result, g: validation.gates.map((x) => [x.gate, x.passed]) })
  );
}

{
  // 40 rows -> 20 per window but only a 1-row change.
  const { validation } = run([...window(1, 20, 6), ...window(21, 20, 5)]);
  check("E2. real pipeline, 30% -> 25% (5 points but only 16.7% relative) -> INCONCLUSIVE", validation.result === "INCONCLUSIVE", JSON.stringify(validation.result));
}

// ---------------------------------------------------------------------------
// D4 — regressionCheck.evaluated separates "none found" from "not evaluated"
// ---------------------------------------------------------------------------

{
  const p = proposal();
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  const blocked = validateEvolutionCandidate(finalizeCandidate({ ...p, hypothesis: "mentions wallet access directly" }, checkCandidateScope("mentions wallet access directly", p.proposedChange), null));
  const notApplicable = validateEvolutionCandidate(finalizeCandidate(proposal("REJECT_DOMINANCE_GAP"), checkCandidateScope(p.hypothesis, p.proposedChange), null));
  const failed = validateEvolutionCandidate(finalizeCandidate(p, scope, null));
  const valid = validateSynthetic(synthetic(10, 20, 2, 20));
  const inconclusive = validateSynthetic(synthetic(5, 20, 5, 20));
  const insufficientBySamples = validateSynthetic(synthetic(10, 19, 2, 20));
  const invalid = validateSynthetic(synthetic(10, 20, 2, 20, [], ["EVIDENCE_GAP"]));
  const expected: [string, EvolutionValidationWithoutTimestamp, boolean][] = [
    ["blocked", blocked, false],
    ["not applicable", notApplicable, false],
    ["replay failed", failed, false],
    ["VALID", valid, true],
    ["INCONCLUSIVE", inconclusive, true],
    ["INSUFFICIENT (samples)", insufficientBySamples, true],
    ["INVALID (regression)", invalid, true],
  ];
  const wrong = expected.filter(([, v, evaluated]) => v.regressionCheck.evaluated !== evaluated).map(([n]) => n);
  check("D4a. regressionCheck.evaluated is false when no replay was evaluated (blocked, not applicable, failed) and true whenever the regression axis actually ran", wrong.length === 0, `wrong: ${wrong.join(", ")}`);
  check("D4b. results: blocked -> INVALID, not applicable -> NOT_APPLICABLE, failed -> INSUFFICIENT_EVIDENCE; gates empty when no replay was evaluated", blocked.result === "INVALID" && notApplicable.result === "NOT_APPLICABLE" && failed.result === "INSUFFICIENT_EVIDENCE" && [blocked, notApplicable, failed].every((v) => v.gates.length === 0 && v.gateThresholds !== null), JSON.stringify([blocked.result, notApplicable.result, failed.result]));
}

// ---------------------------------------------------------------------------
// D5 — truncation guard, and legacy (not-recorded) data
// ---------------------------------------------------------------------------

{
  check("D5a. guard threshold is 1000 rows, inclusive: 999 -> not flagged, 1000 -> flagged", POPULATION_TRUNCATION_GUARD_ROW_COUNT === 1000 && !isPopulationPossiblyTruncated(999) && isPopulationPossiblyTruncated(1000) && isPopulationPossiblyTruncated(5000), "guard boundary wrong");

  const p = proposal();
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  const goodReplay = buildReplayComparison(p.source, p.symbol, p.gapCategory, [...window(1, 20, 8), ...window(21, 20, 3)]);
  const limited = finalizeCandidate(p, scope, goodReplay, "POPULATION_POSSIBLY_TRUNCATED");
  const v = validateEvolutionCandidate(limited);
  check(
    "D5b. a truncated-looking population fails closed: REPLAY_FAILED, replay forced to null even though a replay was passed in, replayLimitation recorded, result INSUFFICIENT_EVIDENCE with an explicit reason",
    limited.status === "REPLAY_FAILED" && limited.replay === null && limited.replayLimitation === "POPULATION_POSSIBLY_TRUNCATED" && v.result === "INSUFFICIENT_EVIDENCE" && v.evidence.some((e) => e.includes("truncated")) && v.gates.length === 0,
    JSON.stringify({ s: limited.status, l: limited.replayLimitation, r: v.result })
  );
  const normal = finalizeCandidate(p, scope, goodReplay);
  check("D5c. with no limitation the candidate is unchanged: REPLAY_PASSED, replayLimitation null", normal.status === "REPLAY_PASSED" && normal.replayLimitation === null && normal.replay !== null, JSON.stringify(normal.status));
}

{
  const source = readFileSync(new URL("../../lib/ai/evolutionCandidate/repository.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  const build = source.slice(source.indexOf("export async function buildEvolutionCandidate"), source.indexOf("export type PersistEvolutionCandidateResult"));
  const readAt = build.indexOf("getDecisionMemoryJoinedExperiences()");
  const guardAt = build.indexOf("isPopulationPossiblyTruncated(rows.length)");
  const replayAt = build.indexOf("buildReplayComparison(");
  check("D5d. buildEvolutionCandidate applies the guard AFTER the read and BEFORE any replay", readAt !== -1 && guardAt > readAt && replayAt > guardAt, JSON.stringify({ readAt, guardAt, replayAt }));
}

{
  const p = proposal();
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  const complete = buildReplayComparison(p.source, p.symbol, p.gapCategory, [...window(1, 20, 8), ...window(21, 20, 3)]);
  const legacyJson = JSON.parse(JSON.stringify(complete)) as Record<string, unknown> & { baseline: Record<string, unknown>; candidate: Record<string, unknown> };
  for (const key of ["targetRawOccurrenceCount", "targetRawGapRate", "otherActiveGapCategories"]) {
    delete legacyJson.baseline[key];
    delete legacyJson.candidate[key];
  }
  delete legacyJson.newlyActiveGapCategories;
  const normalized = normalizePersistedReplay(legacyJson as unknown as ReplayComparison);
  check(
    "L1. a replay persisted before 8.6.6b normalizes to null (not recorded) for every new field — nothing reconstructed",
    normalized !== null && normalized.newlyActiveGapCategories === null && normalized.baseline.otherActiveGapCategories === null && normalized.candidate.targetRawOccurrenceCount === null && normalized.baseline.targetRawGapRate === null,
    JSON.stringify(normalized?.baseline)
  );
  const legacyCandidate = finalizeCandidate(p, scope, normalized);
  const vNormalized = validateEvolutionCandidate(legacyCandidate);
  const vRaw = validateEvolutionCandidate(finalizeCandidate(p, scope, legacyJson as unknown as ReplayComparison)); // un-normalized: fields are undefined, not null
  check(
    "L2. legacy replay (null or undefined regression identity) -> INSUFFICIENT_EVIDENCE, regression NOT evaluated, no throw, and never VALID",
    vNormalized.result === "INSUFFICIENT_EVIDENCE" && vRaw.result === "INSUFFICIENT_EVIDENCE" && vNormalized.regressionCheck.evaluated === false && vRaw.regressionCheck.evaluated === false && vNormalized.evidence.some((e) => e.includes("not recorded")),
    JSON.stringify([vNormalized.result, vRaw.result])
  );
}

// ---------------------------------------------------------------------------
// Wording — every generated string, including gates
// ---------------------------------------------------------------------------

const CAUSAL = /\b(caus(?:e|es|ed|ing|al|ally)|because|due to|led to|leads to|resulted in|results in|proves?|proved|proven|proof|improv(?:e|es|ed|ing|ement)|validated|works|effective)\b/i;

{
  const all: EvolutionValidationWithoutTimestamp[] = [
    validateSynthetic(synthetic(10, 20, 2, 20)),
    validateSynthetic(synthetic(5, 20, 5, 20)),
    validateSynthetic(synthetic(10, 19, 2, 20)),
    validateSynthetic(synthetic(10, 20, 2, 20, [], ["EVIDENCE_GAP"])),
    validateEvolutionCandidate(finalizeCandidate(proposal("REJECT_DOMINANCE_GAP"), checkCandidateScope("x", "y"), null)),
    validateEvolutionCandidate(finalizeCandidate(proposal(), checkCandidateScope("x", "y"), null, "POPULATION_POSSIBLY_TRUNCATED")),
  ];
  const strings = all.flatMap((v) => [...v.evidence, ...v.limitations, ...v.regressionCheck.reasons, ...v.gates.map((g) => g.observed), ...v.missingCounterfactualInputs.map((m) => m.description)]);
  const offenders = strings.filter((s) => CAUSAL.test(s));
  check("W1. no causal/proof wording in any generated string — evidence, limitations, regression reasons, gate observations, missing inputs", offenders.length === 0, JSON.stringify(offenders));

  const required = ["engineering thresholds", "not statistical significance", "does not demonstrate an effect", "does not indicate any profit outcome", "is not counterfactual evidence", "does not indicate production safety", "does not authorize promotion"];
  const text = (v: EvolutionValidationWithoutTimestamp) => v.limitations.join(" ");
  check("W2. every result — VALID or not — carries the explicit statement of what VALID does and does not mean", all.every((v) => required.every((phrase) => text(v).includes(phrase))), "a result omitted part of the VALID disclaimer");
}

// ---------------------------------------------------------------------------
// Scope — nothing here reaches the production decision path
// ---------------------------------------------------------------------------

function strip(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

{
  const files = ["../../lib/ai/evolutionValidation/gates.ts", "../../lib/ai/evolutionValidation/validate.ts", "../../lib/ai/evolutionCandidate/replay.ts", "../../lib/ai/evolutionCandidate/create.ts", "../../lib/ai/evolutionCandidate/semantics.ts"];
  const forbidden = ['from "@/lib/ai/oracle/arbitration', 'from "@/lib/ai/autonomousExecution', 'from "@/lib/ai/decisionQualification', 'from "@/lib/ai/preEntryValidation', 'from "@/lib/ai/autonomousDecision', "fetch(", "Date.now(", "Math.random(", "openai", "anthropic", "execSync", "child_process", "octokit", "github", "vercel", "telegram"];
  const found: string[] = [];
  for (const f of files) {
    const source = strip(readFileSync(new URL(f, import.meta.url), "utf8")).toLowerCase();
    for (const token of forbidden) if (source.includes(token.toLowerCase())) found.push(`${f}:${token}`);
  }
  check("S1. gates/validate/replay/create/semantics import no decision-path module, call no LLM/network, no clock or randomness, touch no GitHub/Vercel/Telegram", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const gates = strip(readFileSync(new URL("../../lib/ai/evolutionValidation/gates.ts", import.meta.url), "utf8"));
  check("S2. the gate comparisons use integer cross-multiplication (no rate subtraction or float division decides pass/fail)", gates.includes("100 * reductionNumerator >=") && !/targetRawGapRate|targetGapRate/.test(gates), "gate logic appears to use float rates");
}

{
  const live = ["decisionQualification/qualify.ts", "decisionQualification/contracts.ts", "autonomousExecution/execute.ts", "autonomousDecision/decide.ts", "preEntryValidation/validate.ts", "autonomousRuntime/orchestrator.ts", "decisionMemory/repository.ts"];
  const found: string[] = [];
  for (const f of live) {
    const source = readFileSync(new URL(`../../lib/ai/${f}`, import.meta.url), "utf8");
    for (const token of ["evolutionCandidate", "evolutionValidation", "evolutionProposal", "evolutionNeed", "countRawGapOccurrences"]) if (source.includes(token)) found.push(`${f}:${token}`);
  }
  check("S3. no live decision-path file (qualification, pre-entry, decide, execute, orchestrator, the shared memory reader) references any evolution module", found.length === 0, `found: ${found.join(", ")}`);
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Phase 8.6.6b gates/determinism/regression-identity fixtures passed.`);
if (failures > 0) process.exit(1);
