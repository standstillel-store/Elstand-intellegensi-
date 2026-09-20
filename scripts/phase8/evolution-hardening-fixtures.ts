// ---------------------------------------------------------------------------
// Phase 8.6.5b — Replay/Validation hardening fixtures (dev-only).
// Pure/offline — exercises create.ts + replay.ts + semantics.ts +
// validate.ts, plus static source checks. repository.ts files need a live
// Learning DB (and @supabase/supabase-js) and are inspected statically only.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-hardening-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { checkCandidateScope, finalizeCandidate } from "@/lib/ai/evolutionCandidate/create";
import { buildReplayComparison, buildSampleAccounting, normalizePersistedReplay } from "@/lib/ai/evolutionCandidate/replay";
import { COUNTERFACTUAL_AVAILABLE, COUNTERFACTUAL_MISSING_INPUTS, SAMPLE_EXCLUSION_REASONS, VALIDATION_MODE, replayApplicabilityFor } from "@/lib/ai/evolutionCandidate/semantics";
import { validateEvolutionCandidate } from "@/lib/ai/evolutionValidation/validate";
import { draftEvolutionProposals } from "@/lib/ai/evolutionProposal/propose";
import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { DecisionSource, GapCategory, ReplayComparison, EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";
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
// Fixture builders
// ---------------------------------------------------------------------------

type RowKind = "EVALUATED" | "OPEN" | "CLOSED_UNEVALUATED";

let idCounter = 0;
function row(overrides: { kind?: RowKind; source?: DecisionSource; symbol?: string; decisionTimestamp: string }): DecisionMemoryJoinedRow {
  idCounter++;
  const kind = overrides.kind ?? "EVALUATED";
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
    decisionTimestamp: overrides.decisionTimestamp,
    learningContext: null,
    createdAt: overrides.decisionTimestamp,
    outcome: kind === "OPEN" ? null : { outcomeResult: "win", outcomeRr: 1.5, outcomeProfitPercent: 2.1, outcomeDurationMinutes: 60, outcomeClosedAt: "2026-09-01T01:00:00.000Z" },
  };
  const evaluation: DecisionEvaluation | null =
    kind === "EVALUATED"
      ? {
          version: 1,
          sourceSignalId: `sig-${idCounter}`,
          decisionQuality: "GOOD",
          marketOutcome: "POSITIVE",
          evaluationClass: "GOOD_DECISION_GOOD_OUTCOME",
          confidenceAlignment: "ALIGNED",
          riskAlignment: "NOT_APPLICABLE",
          conflictAlignment: "NOT_APPLICABLE",
          hypothesisAlignment: "NOT_APPLICABLE",
          evidence: [],
          evaluatedAt: "2026-09-01T01:05:00.000Z",
        }
      : null;
  return { experience, evaluation };
}

function ts(day: number): string {
  // Day offsets beyond 31 roll into the next month — populations below can exceed a calendar month.
  return new Date(Date.UTC(2026, 7, day)).toISOString();
}

function proposal(gapCategory: GapCategory = "CONTRADICTION_GAP", overrides: { hypothesis?: string; proposedChange?: string } = {}): EvolutionProposalWithoutTimestamp {
  return {
    proposalId: `ELVOID_PRO_ORACLE:BTCUSDT:${gapCategory}`,
    proposalVersion: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    currentSystemVersion: "phase-8.6.4",
    gapCategory,
    gapSeverity: "HIGH",
    evidence: { occurrenceCount: MIN_OCCURRENCE_COUNT, evaluatedCount: 20, triggeringTags: [] },
    hypothesis: overrides.hypothesis ?? "Repeated unresolved contradiction observed for this source/symbol.",
    proposedChange: overrides.proposedChange ?? "Investigate whether the current contradiction-resolution logic under-resolves disagreement for this source/symbol; validate through historical replay before considering any production change.",
    expectedEffect: "Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol"],
    status: "DRAFT",
  };
}

/** The REAL 8.6.4 REJECT_DOMINANCE_GAP template, obtained through draftEvolutionProposals() rather than hand-written. */
function realRejectDominanceProposal(): EvolutionProposalWithoutTimestamp {
  const gap: CognitiveGap = {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    category: "REJECT_DOMINANCE_GAP",
    severity: "HIGH",
    evidence: { occurrenceCount: 40, evaluatedCount: 45, triggeringTags: [] },
    reasons: ["fixture"],
  };
  const need: EvolutionNeedAssessment = { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", need: "EVOLUTION_WARRANTED", consideredGaps: [gap], hasValidConstraint: false, reasons: ["fixture"] };
  const drafted = draftEvolutionProposals(need);
  return drafted[0];
}

function pipeline(p: EvolutionProposalWithoutTimestamp, rows: readonly DecisionMemoryJoinedRow[] | null): { candidate: EvolutionCandidateWithoutTimestamp; validation: EvolutionValidationWithoutTimestamp } {
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  const replay = rows === null ? null : buildReplayComparison(p.source, p.symbol, p.gapCategory, rows);
  const candidate = finalizeCandidate(p, scope, replay);
  return { candidate, validation: validateEvolutionCandidate(candidate) };
}

// Controlled population: 12 in-scope rows, distinct timestamps -> older half = days 1-6, newer half = days 7-12.
//   older: 4 EVALUATED, 1 OPEN, 1 CLOSED_UNEVALUATED
//   newer: 3 EVALUATED, 2 OPEN, 1 CLOSED_UNEVALUATED
const controlledInScope: DecisionMemoryJoinedRow[] = [
  row({ decisionTimestamp: ts(1) }),
  row({ decisionTimestamp: ts(2) }),
  row({ decisionTimestamp: ts(3), kind: "OPEN" }),
  row({ decisionTimestamp: ts(4) }),
  row({ decisionTimestamp: ts(5), kind: "CLOSED_UNEVALUATED" }),
  row({ decisionTimestamp: ts(6) }),
  row({ decisionTimestamp: ts(7) }),
  row({ decisionTimestamp: ts(8), kind: "OPEN" }),
  row({ decisionTimestamp: ts(9) }),
  row({ decisionTimestamp: ts(10), kind: "CLOSED_UNEVALUATED" }),
  row({ decisionTimestamp: ts(11), kind: "OPEN" }),
  row({ decisionTimestamp: ts(12) }),
];
const outOfScope: DecisionMemoryJoinedRow[] = [row({ decisionTimestamp: ts(3), symbol: "ETHUSDT" }), row({ decisionTimestamp: ts(9), source: "AI_SIGNAL" })];
const controlledRows: DecisionMemoryJoinedRow[] = [...controlledInScope, ...outOfScope];

// ---------------------------------------------------------------------------
// 1-3. Explicit mode, counterfactualAvailable, missing inputs — on EVERY result branch
// ---------------------------------------------------------------------------

// Phase 8.6.6b: 40 evaluated rows -> 20 per window, the minimum eligible samples the VALID gate requires.
const sufficientRows: DecisionMemoryJoinedRow[] = Array.from({ length: MIN_OCCURRENCE_COUNT * 8 }, (_, i) => row({ decisionTimestamp: ts(1 + i) }));

const branches: { name: string; validation: EvolutionValidationWithoutTimestamp }[] = [
  { name: "replay ran (VALID/INCONCLUSIVE/INVALID family)", validation: pipeline(proposal(), sufficientRows).validation },
  { name: "REPLAY_FAILED (insufficient data)", validation: pipeline(proposal(), [row({ decisionTimestamp: ts(1) }), row({ decisionTimestamp: ts(2) })]).validation },
  { name: "REPLAY_FAILED (no population available)", validation: pipeline(proposal(), null).validation },
  { name: "VALIDATION_BLOCKED", validation: pipeline(proposal("CONTRADICTION_GAP", { hypothesis: "mentions wallet access directly" }), null).validation },
  { name: "NOT_APPLICABLE", validation: pipeline(realRejectDominanceProposal(), sufficientRows).validation },
];

check("1. validationMode is OBSERVATIONAL_SPLIT_HISTORY on every result branch", VALIDATION_MODE === "OBSERVATIONAL_SPLIT_HISTORY" && branches.every((b) => b.validation.validationMode === "OBSERVATIONAL_SPLIT_HISTORY"), JSON.stringify(branches.map((b) => [b.name, b.validation.validationMode])));

check("2. counterfactualAvailable is false on every result branch", COUNTERFACTUAL_AVAILABLE === false && branches.every((b) => b.validation.counterfactualAvailable === false), JSON.stringify(branches.map((b) => [b.name, b.validation.counterfactualAvailable])));

{
  const codes = COUNTERFACTUAL_MISSING_INPUTS.map((m) => m.code);
  const expected = ["PER_CYCLE_ORACLE_INPUT_NOT_PERSISTED", "PER_CYCLE_DECISION_MEMORY_NOT_PERSISTED", "PER_CYCLE_DECISION_RULE_CONFIGURATION_NOT_PERSISTED", "NON_EXECUTED_DECISION_OUTCOMES_NOT_TRACKED", "NO_ENGINE_FOR_MODIFIED_DECISION_LOGIC"];
  check("3a. missing counterfactual inputs are explicit, non-empty, unique, in fixed order", JSON.stringify(codes) === JSON.stringify(expected) && new Set(codes).size === codes.length && COUNTERFACTUAL_MISSING_INPUTS.every((m) => m.description.length > 20), JSON.stringify(codes));
  check("3b. every result branch carries the identical missing-input list", branches.every((b) => JSON.stringify(b.validation.missingCounterfactualInputs) === JSON.stringify(COUNTERFACTUAL_MISSING_INPUTS)), "a branch carried a different list");
}

// ---------------------------------------------------------------------------
// 4-5. Sample accounting — consistency and determinism
// ---------------------------------------------------------------------------

const controlled = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", controlledRows);

{
  const b = controlled.baseline.sampleAccounting;
  const c = controlled.candidate.sampleAccounting;
  check(
    "4a. older-window accounting matches the constructed population exactly (6 scoped, 4 eligible, 2 excluded: 1 OPEN_NO_OUTCOME + 1 CLOSED_UNEVALUATED)",
    b !== null && b.scopedTotal === 6 && b.eligible === 4 && b.excluded === 2 && b.exclusionReasons[0].count === 1 && b.exclusionReasons[1].count === 1,
    JSON.stringify(b)
  );
  check(
    "4b. newer-window accounting matches the constructed population exactly (6 scoped, 3 eligible, 3 excluded: 2 OPEN_NO_OUTCOME + 1 CLOSED_UNEVALUATED)",
    c !== null && c.scopedTotal === 6 && c.eligible === 3 && c.excluded === 3 && c.exclusionReasons[0].count === 2 && c.exclusionReasons[1].count === 1,
    JSON.stringify(c)
  );
}

{
  const slices = [controlled.baseline, controlled.candidate];
  const consistent = slices.every((s) => {
    const a = s.sampleAccounting;
    if (a === null) return false;
    const reasonSum = a.exclusionReasons.reduce((sum, r) => sum + r.count, 0);
    return a.eligible + a.excluded === a.scopedTotal && reasonSum === a.excluded && a.eligible === s.performance.totalEvaluated;
  });
  check("4c. internally consistent per slice: eligible + excluded === scopedTotal, reasons sum to excluded, eligible === performance.totalEvaluated", consistent, JSON.stringify(slices.map((s) => s.sampleAccounting)));
}

{
  const scopedRows = controlledInScope.length;
  const total = (controlled.baseline.sampleAccounting?.scopedTotal ?? -1) + (controlled.candidate.sampleAccounting?.scopedTotal ?? -1);
  check("4d. out-of-scope rows (other symbol, other source) appear in neither slice's accounting", total === scopedRows, `slice totals ${total} vs in-scope ${scopedRows}`);
}

{
  const acc = buildSampleAccounting([]);
  check("4e. empty slice -> zeros, and BOTH reasons still listed in the fixed order (deterministic shape)", acc.scopedTotal === 0 && acc.eligible === 0 && acc.excluded === 0 && JSON.stringify(acc.exclusionReasons.map((r) => r.reason)) === JSON.stringify(SAMPLE_EXCLUSION_REASONS) && acc.exclusionReasons.every((r) => r.count === 0), JSON.stringify(acc));
}

{
  const shuffled = [...controlledRows].reverse();
  const a = JSON.stringify(buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", controlledRows));
  const b = JSON.stringify(buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", controlledRows));
  const c = JSON.stringify(buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", shuffled));
  check("5. exclusion reasons are deterministic — repeated calls and reversed input order produce byte-identical comparisons", a === b && a === c, "comparison JSON differed");
}

{
  const snapshot = JSON.stringify(controlledRows);
  buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", controlledRows);
  check("5b. accounting never mutates its input rows", JSON.stringify(controlledRows) === snapshot, "input rows were mutated");
}

// ---------------------------------------------------------------------------
// 6. REJECT_DOMINANCE_GAP -> NOT_APPLICABLE, never forced through executed-only replay
// ---------------------------------------------------------------------------

{
  const p = realRejectDominanceProposal();
  check("6a. the REAL 8.6.4 REJECT_DOMINANCE_GAP template is obtained and stays within candidate scope", p !== undefined && p.gapCategory === "REJECT_DOMINANCE_GAP" && checkCandidateScope(p.hypothesis, p.proposedChange).withinScope === true, JSON.stringify(p?.gapCategory));

  const { candidate, validation } = pipeline(p, sufficientRows); // replay is computed by the helper but must be discarded
  check("6b. candidate is CANDIDATE_CREATED with replay null and replayApplicability.applicable false — never REPLAY_PASSED/REPLAY_FAILED", candidate.status === "CANDIDATE_CREATED" && candidate.replay === null && candidate.replayApplicability.applicable === false && typeof candidate.replayApplicability.reason === "string", JSON.stringify({ s: candidate.status, r: candidate.replay === null, a: candidate.replayApplicability }));
  check("6c. validation result is NOT_APPLICABLE even though an executed-only replay population was available", validation.result === "NOT_APPLICABLE", JSON.stringify(validation.result));
  check("6d. NOT_APPLICABLE carries no fabricated metrics, no regression claim, an honest dataset reference, and states why", validation.metricsObserved === null && validation.regressionCheck.regressionDetected === false && validation.replayDatasetReference.includes("none") && validation.evidence.some((e) => e.includes("REJECT_DOMINANCE_GAP") && e.includes("WAIT")), JSON.stringify(validation));

  const withNull = pipeline(p, null);
  check("6e. same NOT_APPLICABLE result when no historical population was supplied at all", withNull.validation.result === "NOT_APPLICABLE" && withNull.candidate.status === "CANDIDATE_CREATED", JSON.stringify(withNull.validation.result));
}

{
  const unsafe = pipeline(proposal("REJECT_DOMINANCE_GAP", { hypothesis: "mentions wallet access directly" }), null);
  check("6f. scope still wins over applicability — an unsafe not-applicable proposal is INVALID (VALIDATION_BLOCKED), not NOT_APPLICABLE", unsafe.candidate.status === "VALIDATION_BLOCKED" && unsafe.validation.result === "INVALID", JSON.stringify({ s: unsafe.candidate.status, r: unsafe.validation.result }));
}

{
  const categories: GapCategory[] = ["CONTRADICTION_GAP", "CONTEXT_GAP", "REASONING_CONSISTENCY_GAP", "CONFIDENCE_ALIGNMENT_GAP", "EVIDENCE_GAP", "PATTERN_GAP"];
  const allApplicable = categories.every((c) => replayApplicabilityFor(c).applicable === true && replayApplicabilityFor(c).reason === null);
  const statuses = categories.map((c) => pipeline(proposal(c), sufficientRows).candidate.status);
  check("6g. the six executed/evaluated-population categories stay applicable and still reach REPLAY_PASSED with sufficient data (unchanged)", allApplicable && statuses.every((s) => s === "REPLAY_PASSED"), JSON.stringify(statuses));
}

// ---------------------------------------------------------------------------
// 7. Backward compatibility of the four original results
// ---------------------------------------------------------------------------

function handBuilt(replay: ReplayComparison | null, status: EvolutionCandidateWithoutTimestamp["status"]): EvolutionCandidateWithoutTimestamp {
  const base = pipeline(proposal(), sufficientRows).candidate;
  return { ...base, status, replay };
}

const OTHER_CATEGORIES: readonly GapCategory[] = ["CONTEXT_GAP", "EVIDENCE_GAP", "REASONING_CONSISTENCY_GAP", "CONFIDENCE_ALIGNMENT_GAP"];

function withRates(baselineRate: number, candidateRate: number, baselineOther: number, candidateOther: number): ReplayComparison {
  const base = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", sufficientRows);
  const baseline = {
    ...base.baseline,
    targetGapRate: baselineRate,
    otherActiveGapCount: baselineOther,
    targetRawOccurrenceCount: Math.round(baselineRate * base.baseline.performance.totalEvaluated),
    targetRawGapRate: baselineRate,
    otherActiveGapCategories: OTHER_CATEGORIES.slice(0, baselineOther),
  };
  const candidate = {
    ...base.candidate,
    targetGapRate: candidateRate,
    otherActiveGapCount: candidateOther,
    targetRawOccurrenceCount: Math.round(candidateRate * base.candidate.performance.totalEvaluated),
    targetRawGapRate: candidateRate,
    otherActiveGapCategories: OTHER_CATEGORIES.slice(0, candidateOther),
  };
  const newlyActiveGapCategories = candidate.otherActiveGapCategories.filter((c) => !baseline.otherActiveGapCategories.includes(c)).sort();
  return { baseline, candidate, targetGapRateDelta: candidateRate - baselineRate, otherActiveGapCountDelta: candidateOther - baselineOther, newlyActiveGapCategories };
}

{
  const valid = validateEvolutionCandidate(handBuilt(withRates(0.5, 0.1, 0, 0), "REPLAY_PASSED"));
  const inconclusive = validateEvolutionCandidate(handBuilt(withRates(0.3, 0.3, 0, 0), "REPLAY_PASSED"));
  const invalidRegression = validateEvolutionCandidate(handBuilt(withRates(0.5, 0.1, 0, 2), "REPLAY_PASSED"));
  const invalidBlocked = validateEvolutionCandidate(handBuilt(null, "VALIDATION_BLOCKED"));
  const insufficient = validateEvolutionCandidate(handBuilt(null, "REPLAY_FAILED"));
  check(
    "7a. original semantics unchanged: rate fell -> VALID, flat -> INCONCLUSIVE, regression -> INVALID (regressionDetected), blocked -> INVALID, failed replay -> INSUFFICIENT_EVIDENCE",
    valid.result === "VALID" && inconclusive.result === "INCONCLUSIVE" && invalidRegression.result === "INVALID" && invalidRegression.regressionCheck.regressionDetected === true && invalidBlocked.result === "INVALID" && insufficient.result === "INSUFFICIENT_EVIDENCE",
    JSON.stringify([valid.result, inconclusive.result, invalidRegression.result, invalidBlocked.result, insufficient.result])
  );
  check("7b. existing evidence lines still state both observed rates plainly", valid.evidence.some((e) => e.includes("0.500")) && valid.evidence.some((e) => e.includes("0.100")), JSON.stringify(valid.evidence));
}

{
  const contractsSource = readFileSync(new URL("../../lib/ai/evolutionCandidate/contracts.ts", import.meta.url), "utf8");
  const validationContracts = readFileSync(new URL("../../lib/ai/evolutionValidation/contracts.ts", import.meta.url), "utf8");
  const statusesKept = ["CANDIDATE_CREATED", "REPLAYING", "REPLAY_PASSED", "REPLAY_FAILED", "VALIDATION_BLOCKED"].every((s) => contractsSource.includes(`"${s}"`));
  const resultsKept = ["VALID", "INVALID", "INSUFFICIENT_EVIDENCE", "INCONCLUSIVE", "NOT_APPLICABLE"].every((s) => validationContracts.includes(`"${s}"`));
  check("7c. no existing CandidateStatus or ValidationResult name was renamed or removed (NOT_APPLICABLE is the only addition)", statusesKept && resultsKept, JSON.stringify({ statusesKept, resultsKept }));
}

// ---------------------------------------------------------------------------
// 8. Database compatibility — no schema change, refusal instead of constraint error
// ---------------------------------------------------------------------------

{
  const schema = readFileSync(new URL("../../supabase/learning/schema.sql", import.meta.url), "utf8");
  const resultCheckOriginal = schema.includes("result in ('VALID', 'INVALID', 'INSUFFICIENT_EVIDENCE', 'INCONCLUSIVE')");
  const candidateStatusOriginal = schema.includes("'CANDIDATE_CREATED','REPLAYING','REPLAY_PASSED','REPLAY_FAILED','VALIDATION_BLOCKED'");
  // Phase 8.6.6b appended a NEW table after this one; the check concerns the LEGACY table's own definition only.
  const validationsTable = schema.slice(schema.indexOf("create table if not exists evolution_validations "), schema.indexOf("create index if not exists evolution_validations_source_symbol_idx"));
  const candidatesTable = schema.slice(schema.indexOf("create table if not exists evolution_candidates"), schema.indexOf("create table if not exists evolution_validations"));
  check(
    "8a. supabase/learning/schema.sql still holds the ORIGINAL result and status CHECK lists; neither evolution table mentions NOT_APPLICABLE or REJECT_DOMINANCE_GAP (no speculative migration)",
    resultCheckOriginal && candidateStatusOriginal && !validationsTable.includes("NOT_APPLICABLE") && !candidatesTable.includes("NOT_APPLICABLE") && !candidatesTable.includes("REJECT_DOMINANCE_GAP"),
    JSON.stringify({ resultCheckOriginal, candidateStatusOriginal })
  );
}

{
  const validationRepo = readFileSync(new URL("../../lib/ai/evolutionValidation/repository.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  const candidateRepo = readFileSync(new URL("../../lib/ai/evolutionCandidate/repository.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  const vGuard = validationRepo.indexOf('"NOT_APPLICABLE"');
  const vDb = validationRepo.indexOf("getLearningSupabase();", validationRepo.indexOf("export async function persistEvolutionValidation"));
  const cGuard = candidateRepo.indexOf("replayApplicability.applicable", candidateRepo.indexOf("export async function persistEvolutionCandidate"));
  const cDb = candidateRepo.indexOf("getLearningSupabase();", candidateRepo.indexOf("export async function persistEvolutionCandidate"));
  check("8b. both persist functions refuse not-applicable results (reason not_persistable) BEFORE touching the database client", vGuard !== -1 && vGuard < vDb && cGuard !== -1 && cGuard < cDb && validationRepo.includes("not_persistable") && candidateRepo.includes("not_persistable"), JSON.stringify({ vGuard, vDb, cGuard, cDb }));
}

{
  const candidateRepo = readFileSync(new URL("../../lib/ai/evolutionCandidate/repository.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  const build = candidateRepo.slice(candidateRepo.indexOf("export async function buildEvolutionCandidate"), candidateRepo.indexOf("export type PersistEvolutionCandidateResult"));
  const applicabilityAt = build.indexOf("replayApplicabilityFor(proposal.gapCategory)");
  const readAt = build.indexOf("getDecisionMemoryJoinedExperiences()");
  check("8c. buildEvolutionCandidate() decides applicability BEFORE any historical read — a not-applicable category never reaches executed-only replay", applicabilityAt !== -1 && readAt !== -1 && applicabilityAt < readAt, JSON.stringify({ applicabilityAt, readAt }));
}

// ---------------------------------------------------------------------------
// 9. Legacy (pre-8.6.5b) persisted rows — reported as not recorded, never reconstructed
// ---------------------------------------------------------------------------

{
  const legacy = JSON.parse(JSON.stringify(controlled)) as ReplayComparison;
  delete (legacy.baseline as { sampleAccounting?: unknown }).sampleAccounting;
  delete (legacy.candidate as { sampleAccounting?: unknown }).sampleAccounting;
  const normalized = normalizePersistedReplay(legacy);
  check("9a. legacy replay without sampleAccounting -> null (not recorded), nothing fabricated", normalized !== null && normalized.baseline.sampleAccounting === null && normalized.candidate.sampleAccounting === null, JSON.stringify(normalized?.baseline.sampleAccounting));
  check("9b. current replay passes through normalization unchanged; null stays null", JSON.stringify(normalizePersistedReplay(controlled)) === JSON.stringify(controlled) && normalizePersistedReplay(null) === null, "normalization altered a current replay");

  const legacyValidation = validateEvolutionCandidate(handBuilt(normalized, "REPLAY_PASSED"));
  check("9c. validation of a legacy replay does not throw and states accounting was not recorded", legacyValidation.evidence.some((e) => e.includes("not recorded")), JSON.stringify(legacyValidation.evidence));
}

// ---------------------------------------------------------------------------
// 10. No causal / proof / validated-candidate wording in generated output or UI
// ---------------------------------------------------------------------------

const CAUSAL = /\b(caus(?:e|es|ed|ing|al|ally)|because|due to|led to|leads to|resulted in|results in|proves?|proved|proven|proof|improv(?:e|es|ed|ing|ement)|validated|works|effective)\b/i;

{
  const strings: string[] = [];
  for (const b of branches) {
    strings.push(...b.validation.evidence, ...b.validation.limitations, ...b.validation.regressionCheck.reasons, b.validation.replayDatasetReference);
    strings.push(...b.validation.missingCounterfactualInputs.map((m) => m.description));
  }
  strings.push(...["VALID", "INCONCLUSIVE", "INVALID"].flatMap((r) => (r === "VALID" ? validateEvolutionCandidate(handBuilt(withRates(0.5, 0.1, 0, 0), "REPLAY_PASSED")) : r === "INVALID" ? validateEvolutionCandidate(handBuilt(withRates(0.5, 0.1, 0, 2), "REPLAY_PASSED")) : validateEvolutionCandidate(handBuilt(withRates(0.3, 0.3, 0, 0), "REPLAY_PASSED"))).evidence));
  const notApplicableReason = replayApplicabilityFor("REJECT_DOMINANCE_GAP").reason ?? "";
  strings.push(notApplicableReason);
  const offenders = strings.filter((s) => CAUSAL.test(s));
  check("10a. no causal/proof wording in any generated validation string (evidence, limitations, reasons, dataset ref, missing inputs, not-applicable reason)", offenders.length === 0, JSON.stringify(offenders));
  check("10b. limitations explicitly state observational mode and 'not counterfactual validation'", branches.every((b) => b.validation.limitations.some((l) => l.includes("OBSERVATIONAL_SPLIT_HISTORY")) && b.validation.limitations.some((l) => l.toLowerCase().includes("not counterfactual validation"))), "a branch omitted the explicit statement");
}

{
  const panel = readFileSync(new URL("../../components/ai-performance/SelfPerformancePanel.tsx", import.meta.url), "utf8");
  const code = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const labelBlock = code.slice(code.indexOf("const CANDIDATE_STATUS_LABEL"), code.indexOf("export function SelfPerformancePanel"));
  const jsxBlock = code.slice(code.indexOf("Evolution Candidates</p>"));
  check("10c. UI code no longer says 'Validated candidate'", !/validated candidate/i.test(code), "found 'Validated candidate' in UI code");
  check("10d. UI carries the required observational wording (Observational evidence / Observed split-history result / Not counterfactual validation)", code.includes("Observational evidence") && code.includes("Observed split-history result") && code.includes("Not counterfactual validation"), "required wording missing");
  check("10e. UI labels every ValidationResult including NOT_APPLICABLE", ["VALID", "INVALID", "INSUFFICIENT_EVIDENCE", "INCONCLUSIVE", "NOT_APPLICABLE"].every((k) => new RegExp(`${k}:\\s*"`).test(labelBlock)), "a ValidationResult has no label");
  const offenders = [...labelBlock.matchAll(/"([^"]+)"/g), ...jsxBlock.matchAll(/>([^<>{}]{8,})</g)].map((m) => m[1]).filter((t) => CAUSAL.test(t));
  check("10f. no causal/proof wording in the candidate label maps or the Evolution Candidates JSX text", offenders.length === 0, JSON.stringify(offenders));
  check("10g. UI shows regression as 'Not evaluated' when no replay ran, and renders sample accounting", jsxBlock.includes("Not evaluated") && jsxBlock.includes("describeSlice(") && labelBlock.includes("accounting.eligible") && labelBlock.includes("accounting.excluded"), "regression/accounting rendering missing");
}

// ---------------------------------------------------------------------------
// 11. Static scope audit — production decision path untouched, P1/P2 not wired, no new authority
// ---------------------------------------------------------------------------

function stripComments(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

{
  const files = [
    "../../lib/ai/evolutionCandidate/contracts.ts",
    "../../lib/ai/evolutionCandidate/create.ts",
    "../../lib/ai/evolutionCandidate/replay.ts",
    "../../lib/ai/evolutionCandidate/semantics.ts",
    "../../lib/ai/evolutionCandidate/repository.ts",
    "../../lib/ai/evolutionValidation/contracts.ts",
    "../../lib/ai/evolutionValidation/validate.ts",
    "../../lib/ai/evolutionValidation/repository.ts",
  ];
  const forbidden = ['from "@/lib/ai/oracle/arbitration', 'from "@/lib/ai/autonomousExecution', 'from "@/lib/ai/decisionQualification', 'from "@/lib/ai/preEntryValidation', 'from "@/lib/ai/autonomousDecision', 'from "@/lib/ai/oracle/risk', "fetch(", "Date.now(", "Math.random(", "openai", "anthropic", "execSync", "child_process", "octokit", "github", "vercel", "telegram"];
  const found: string[] = [];
  for (const f of files) {
    const source = stripComments(readFileSync(new URL(f, import.meta.url), "utf8")).toLowerCase();
    for (const token of forbidden) if (source.includes(token.toLowerCase())) found.push(`${f}:${token}`);
  }
  check("11a. no candidate/validation file (including new semantics.ts) imports decision-path modules, calls an LLM, shells out, or touches GitHub/Vercel/Telegram", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const files = ["../../lib/ai/evolutionCandidate/semantics.ts", "../../lib/ai/evolutionCandidate/create.ts", "../../lib/ai/evolutionCandidate/replay.ts", "../../lib/ai/evolutionValidation/validate.ts", "../../lib/ai/evolutionValidation/contracts.ts"];
  const found: string[] = [];
  for (const f of files) {
    const source = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const status of ["APPROVED", "ACTIVE", "DEPLOYED", "PRODUCTION_MUTATED"]) if (source.includes(`"${status}"`)) found.push(`${f}:${status}`);
  }
  check("11b. no APPROVED/ACTIVE/DEPLOYED/PRODUCTION_MUTATED literal in any touched module (8.6.7 states do not exist)", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const livePath = ["decisionQualification/qualify.ts", "decisionQualification/contracts.ts", "autonomousExecution/execute.ts", "autonomousDecision/decide.ts", "preEntryValidation/validate.ts", "autonomousRuntime/orchestrator.ts"];
  const found: string[] = [];
  for (const f of livePath) {
    const source = readFileSync(new URL(`../../lib/ai/${f}`, import.meta.url), "utf8");
    for (const token of ["evolutionCandidate", "evolutionValidation", "evolutionProposal", "evolutionNeed"]) if (source.includes(token)) found.push(`${f}:${token}`);
  }
  check("11c. no live decision-path file (qualification, pre-entry, decide, execute, orchestrator) references any evolution module", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const need = stripComments(readFileSync(new URL("../../lib/ai/evolutionNeed/evaluate.ts", import.meta.url), "utf8"));
  const propose = stripComments(readFileSync(new URL("../../lib/ai/evolutionProposal/propose.ts", import.meta.url), "utf8"));
  // Identifier/import level, not substring: propose.ts's REJECT_DOMINANCE_GAP template legitimately NAMES lib/ai/decisionPopulation inside a prose string.
  const wired = [/from\s+"@\/lib\/ai\/(decisionPopulation|confluenceAttribution|cognitiveGap\/detectPopulationGap)/, /\bpopulationGaps\b/, /\bconfluenceEvidence\b/, /\bconfluenceAttribution\b/].filter((re) => re.test(need) || re.test(propose));
  check("11d. P1 populationGaps / decisionPopulation and P2 confluenceAttribution are still NOT imported or referenced as identifiers by evolutionNeed or proposals", wired.length === 0, `wired: ${wired.map(String).join(", ")}`);
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Phase 8.6.5b hardening fixtures passed.`);
if (failures > 0) process.exit(1);
