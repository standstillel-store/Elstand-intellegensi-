// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Candidate + Replay Engine (Phase 8.6.5)
//
// ARCHITECTURE / AUTHORITY:
//   - FORENSIC AUDIT FINDING (read before anything else in this module):
//     lib/ai/cognitiveReplay (Phase 8.3.7) is NOT a "run different logic
//     against history" engine — its own header is explicit that it is a
//     "READ-ONLY RECONSTRUCTION" of a single past cycle already recorded,
//     never a simulation. There is no execution engine anywhere in this
//     repository that can run a hypothetical modified decision rule
//     against historical inputs, and building one would mean writing and
//     executing real candidate code — explicitly forbidden ("no automatic
//     code generation followed by execution"). An `EvolutionCandidate`
//     therefore is NOT a counterfactual re-execution. It is a
//     split-history REPLICATION CHECK: the same already-existing, already
//     pure 8.6.1/8.6.2 functions (`computeEvaluationCoverage`,
//     `aggregatePerformance`, `detectCognitiveGaps`) are run twice —
//     once on the OLDER half and once on the NEWER half of the exact
//     same historical (source, symbol) population the proposal's gap
//     was originally detected from — asking one honest question: does
//     the evidence for this gap still hold up, or was it a one-off in an
//     older window? See replay.ts's header for the full reasoning and
//     its explicit limitation.
//   - `EvolutionCandidate` NEVER contains executable code, a diff, or a
//     patch — only the SAME structured proposal fields (`hypothesis`,
//     `proposedChange`) carried through, plus the replay comparison.
//   - Status is closed to the 4 values below — `REPLAYING` is included
//     for fidelity to the Phase 8.6.5 brief's own vocabulary but is
//     never actually produced or persisted by this synchronous
//     implementation (replay/scope-check/validation all complete within
//     one function call — there is no long-running job to be "in
//     progress" for). `APPROVED`/`ACTIVE`/`DEPLOYED` do not exist here,
//     by design, matching evolutionProposal/contracts.ts's own rule.
//   - `candidateId` is a deterministic composite (`candidate:<proposalId>`),
//     never a random UUID or a mutable sequential counter — the SAME
//     proposal always identifies the SAME candidate, matching
//     evolutionProposal's own `proposalId` discipline.
//   - PHASE 8.6.5b HARDENING (additive only — no enum was renamed and no
//     database column was added): the replay here is, and always was, an
//     OBSERVATIONAL split-history comparison. 8.6.5b makes that explicit
//     in the data itself rather than only in prose:
//       * every replay slice carries `sampleAccounting` (eligible /
//         excluded / exclusionReasons) — see `SampleAccounting` below;
//       * every candidate carries `replayApplicability`. A gap category
//         whose evidence lives outside the executed-only replay
//         population (currently `REJECT_DOMINANCE_GAP`) is never forced
//         through that replay — see semantics.ts. Such a candidate is
//         `CANDIDATE_CREATED` with `replay: null`, the status this file
//         already documented as "replay never ran" — never
//         `REPLAY_PASSED` / `REPLAY_FAILED`;
//       * the validation mode and the inputs a true counterfactual replay
//         would need (but this repository does not persist) are constants
//         in semantics.ts, surfaced on every validation result
//         (lib/ai/evolutionValidation).
//   - PHASE 8.6.6b (audit-driven, additive): replay is now deterministic
//     and its regression axis carries identity, not just a count.
//       * rows are ordered by decisionTimestamp, THEN sourceSignalId, THEN
//         experience id — input order (an unordered database read) can no
//         longer change which half a tied row lands in;
//       * each slice carries the RAW target-gap occurrence count and rate
//         (before the detection threshold) — `targetGapRate` above is the
//         thresholded figure and is kept unchanged for compatibility;
//       * each slice lists WHICH other gap categories were active, and the
//         comparison lists the `newlyActiveGapCategories` — a category
//         that leaves while a different one arrives is no longer masked by
//         an equal count;
//       * a historical population large enough that the database read may
//         have been silently truncated makes replay fail closed
//         (`replayLimitation`), never proceed on a possibly partial set.
//     Every new field that a row persisted before 8.6.6b cannot carry is
//     `| null` ("not recorded") — never reconstructed.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { GapCategory, GapSeverity } from "@/lib/ai/cognitiveGap/contracts";
import type { EvaluationCoverageReport, SelfPerformanceAggregate } from "@/lib/ai/selfPerformance/contracts";

export type { DecisionSource, GapCategory, GapSeverity, EvaluationCoverageReport, SelfPerformanceAggregate };

/**
 * The only validation mode this repository can honestly run: an older
 * versus a newer window of ALREADY-RECORDED outcomes compared side by
 * side. No candidate logic is applied to either window. Closed to this
 * single value on purpose — a true counterfactual mode would need inputs
 * this repository does not persist (see `MissingCounterfactualInput`) and
 * belongs to a separately-approved phase, not to this union.
 */
export type ValidationMode = "OBSERVATIONAL_SPLIT_HISTORY";

/** Closed set of reasons a true counterfactual replay cannot run today — each names a real, checkable absence, never a generic "unknown". */
export type MissingCounterfactualInputCode =
  | "PER_CYCLE_ORACLE_INPUT_NOT_PERSISTED"
  | "PER_CYCLE_DECISION_MEMORY_NOT_PERSISTED"
  | "PER_CYCLE_DECISION_RULE_CONFIGURATION_NOT_PERSISTED"
  | "NON_EXECUTED_DECISION_OUTCOMES_NOT_TRACKED"
  | "NO_ENGINE_FOR_MODIFIED_DECISION_LOGIC";

export interface MissingCounterfactualInput {
  readonly code: MissingCounterfactualInputCode;
  /** Plain, deterministic description of what is absent and where that was verified. Never a causal claim. */
  readonly description: string;
}

/** Whether replay can meaningfully measure a proposal's gap category with the population it reads. See semantics.ts. */
export type ReplayApplicability = { readonly applicable: true; readonly reason: null } | { readonly applicable: false; readonly reason: string };

/** Why a scoped row is NOT counted toward a slice's metrics. Every scoped row is either eligible or carries exactly one of these. */
export type SampleExclusionReason = "OPEN_NO_OUTCOME" | "CLOSED_UNEVALUATED";

export interface SampleExclusionReasonCount {
  readonly reason: SampleExclusionReason;
  readonly count: number;
}

/**
 * Exact accounting of one replay slice's rows.
 *   - `scopedTotal`: rows in this slice after (source, symbol) scoping.
 *   - `eligible`: rows carrying a persisted evaluation — precisely the
 *     rows `aggregatePerformance()` and `detectCognitiveGaps()` consume,
 *     so `eligible === performance.totalEvaluated` always.
 *   - `excluded`: `scopedTotal - eligible`.
 *   - `exclusionReasons`: ALWAYS both reasons, in the fixed order of
 *     `SAMPLE_EXCLUSION_REASONS` (zero counts included) so the shape is
 *     deterministic; their counts sum to `excluded`.
 */
export interface SampleAccounting {
  readonly scopedTotal: number;
  readonly eligible: number;
  readonly excluded: number;
  readonly exclusionReasons: readonly SampleExclusionReasonCount[];
}

/** See this file's header — `REPLAYING` is never actually reachable in this synchronous implementation. */
export type CandidateStatus = "CANDIDATE_CREATED" | "REPLAYING" | "REPLAY_PASSED" | "REPLAY_FAILED" | "VALIDATION_BLOCKED";

/** The outcome of the defensive scope check (Phase 8.6.5 B6) — whether `hypothesis`/`proposedChange` text (never `validationRequirements`, which always safely mentions qualification/arbitration as a human-review reminder — see propose.ts) stays clear of forbidden domains. Every real 8.6.4 template already stays in scope by construction; this check exists to catch it explicitly rather than assume it. */
export interface CandidateScopeCheck {
  readonly withinScope: boolean;
  /** The forbidden-domain keywords actually checked for — always the same fixed list, never inferred. */
  readonly domainsChecked: readonly string[];
  /** Populated only when `withinScope` is `false`. */
  readonly violatingKeywords: readonly string[];
}

/** One half of the historical population used for replay — see replay.ts. */
export interface ReplaySlice {
  readonly windowLabel: "BASELINE" | "CANDIDATE";
  /** Verbatim `decisionTimestamp` bounds of the experiences in this slice — never fabricated, `null` when the slice is empty. */
  readonly decisionTimestampFrom: string | null;
  readonly decisionTimestampTo: string | null;
  readonly coverage: EvaluationCoverageReport;
  readonly performance: SelfPerformanceAggregate;
  /** How many decisions in this slice carry the proposal's own targeted `GapCategory`'s evidence — the same counting rule detectCognitiveGaps already uses, applied to this slice alone. */
  readonly targetGapOccurrenceCount: number;
  /** `targetGapOccurrenceCount / performance.totalEvaluated`, 0 when totalEvaluated is 0 — never NaN. */
  readonly targetGapRate: number;
  /** Count of OTHER (non-targeted) gap categories active in this slice alone — the input to the regression check in evolutionValidation. */
  readonly otherActiveGapCount: number;
  /** Phase 8.6.5b. Always non-null when produced by `buildReplayComparison()`. `null` ONLY when reading a row persisted before 8.6.5b — accounting that was never recorded is reported as not recorded, never reconstructed. */
  readonly sampleAccounting: SampleAccounting | null;
  /** Phase 8.6.6b. Evaluated decisions in this slice carrying the target gap's evidence, BEFORE the detection threshold — `targetGapOccurrenceCount` above is 0 whenever this is below MIN_OCCURRENCE_COUNT. `null` only for a row persisted before 8.6.6b. */
  readonly targetRawOccurrenceCount: number | null;
  /** `targetRawOccurrenceCount / performance.totalEvaluated` (0 when nothing is evaluated — never NaN); `null` exactly when `targetRawOccurrenceCount` is. */
  readonly targetRawGapRate: number | null;
  /** Phase 8.6.6b. WHICH other (non-targeted) gap categories are active in this slice, sorted alphabetically; `otherActiveGapCount` above is its length. `null` only for a row persisted before 8.6.6b. */
  readonly otherActiveGapCategories: readonly GapCategory[] | null;
}

export interface ReplayComparison {
  readonly baseline: ReplaySlice;
  readonly candidate: ReplaySlice;
  /** candidate.targetGapRate - baseline.targetGapRate. Negative means the targeted gap's rate fell in the more recent window — the only "improvement direction" this module ever reports, and never claimed as proof the proposal's hypothesis was correct. */
  readonly targetGapRateDelta: number;
  /** candidate.otherActiveGapCount - baseline.otherActiveGapCount. Positive means MORE other gap categories became active in the more recent window — the regression signal evolutionValidation checks. */
  readonly otherActiveGapCountDelta: number;
  /** Phase 8.6.6b. Categories active in the newer window that were NOT active in the older one, sorted alphabetically. Non-empty is a regression signal even when `otherActiveGapCountDelta` is 0 (one category left while a different one arrived). `null` only for a row persisted before 8.6.6b. */
  readonly newlyActiveGapCategories: readonly GapCategory[] | null;
}

/** Why replay was deliberately NOT run for an otherwise applicable candidate. Closed to what is actually checked today. */
export type ReplayLimitation = "POPULATION_POSSIBLY_TRUNCATED";

export interface EvolutionCandidateWithoutTimestamp {
  readonly candidateId: string;
  readonly proposalId: string;
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly gapCategory: GapCategory;
  readonly gapSeverity: GapSeverity;
  readonly hypothesis: string;
  readonly proposedChange: string;
  /** Reuses evolutionProposal's own "static marker for which implementation phase produced this" convention (see evolutionProposal/contracts.ts) — never a package/build version. */
  readonly baselineVersion: string;
  readonly candidateVersion: string;
  readonly scope: CandidateScopeCheck;
  /** Phase 8.6.5b — deterministic from `gapCategory` alone (see semantics.ts). When `applicable` is `false`, replay was never attempted. */
  readonly replayApplicability: ReplayApplicability;
  /** Phase 8.6.6b. Non-null only when replay was skipped because the historical read may have been truncated (see semantics.ts `isPopulationPossiblyTruncated`); `null` otherwise. Not a stored column — the append-only validation record carries it inside its snapshot. */
  readonly replayLimitation: ReplayLimitation | null;
  readonly status: CandidateStatus;
  /** `null` whenever replay produced no comparison: `VALIDATION_BLOCKED` (blocked before running), `CANDIDATE_CREATED` (replay not applicable to this gap category), or `REPLAY_FAILED` with no historical population available. */
  readonly replay: ReplayComparison | null;
}

export interface EvolutionCandidate extends EvolutionCandidateWithoutTimestamp {
  readonly createdAt: string;
}
