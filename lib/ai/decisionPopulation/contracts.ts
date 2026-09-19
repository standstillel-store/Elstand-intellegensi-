// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Population Observation (Phase 8.6 P1)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - READ-ONLY OBSERVATION LAYER, NOT A NEW DECISION AUTHORITY. Nothing in
//     this module (or observe.ts/repository.ts) is imported by
//     decisionQualification, preEntryValidation, autonomousDecision,
//     arbitration, risk, or execution — confirmed by a repository-wide
//     import scan before this phase shipped (see the corrective-design
//     report's "P1" section). This module computes nothing that could
//     change a trade; it only counts and classifies rows other,
//     already-running code already wrote.
//   - WHY THIS EXISTS: two independent forensic audits confirmed
//     `decision_experiences`/`decision_evaluations` (the population
//     `lib/ai/selfPerformance` and `lib/ai/cognitiveGap` already read) are
//     EXECUTE-only — `lib/ai/autonomousExecution/execute.ts`'s
//     `SKIPPED_WAIT`/`SKIPPED_REJECT` early-return paths never call the
//     function that writes a `decision_experiences` row. WAIT and REJECT
//     decisions were therefore invisible to 8.6.1/8.6.2 before this phase.
//     This module closes that specific gap — it does NOT replace or
//     re-derive anything `selfPerformance`/`cognitiveGap` already compute
//     over the executed/evaluated population; see the module-level "does
//     NOT merge" note below.
//   - SOURCE OF TRUTH: `public.runtime_events`' `component: "DECISION"`
//     rows (Phase 8.5, `lib/ai/runtimeEvents`) — one row per cycle that
//     actually reached `decideAutonomous()` (i.e. NOT a `NO_ASSESSMENT`
//     cycle; those never reach this component at all, see
//     `orchestrator.ts`'s early-return paths). This is a deliberate,
//     verified choice, not the first one considered: `cognitive_trace`
//     (Phase 8.3.2) was the original candidate (see the corrective-design
//     report), but on closer inspection its `decision` stage carries only
//     `{decision, side, dedupApplied}` — it does NOT persist
//     `qualification.status` or `preEntry.status` as fields, and
//     `decision_traces`' frozen `LearningContextSnapshot` doesn't either
//     (it narrows cognitive coherence, not qualification/pre-entry
//     status). `runtime_events`' `DECISION`-component row, by contrast,
//     already carries all of `decision` (post-dedup), `rawDecision`
//     (pre-dedup), `side`, `dedupApplied`, `qualificationStatus`, AND
//     `preEntryStatus` in one `metadata` object
//     (`orchestrator.ts`'s emit call — see that file for the literal
//     shape), keyed by a real `cycleId` — no fuzzy/timestamp-based join
//     across two tables is needed or attempted here.
//   - HONEST PARSING, NEVER FABRICATION: `metadata` is a loosely-typed
//     `Record<string, unknown> | null` at the DB layer — nothing here
//     assumes it is well-formed. Every field is validated against its
//     closed set before being trusted; anything unexpected (missing,
//     wrong type, out-of-enum value) resolves to `"UNKNOWN"`, counted
//     honestly in its own bucket — never silently coerced to a default,
//     never treated as zero, never dropped without being counted in
//     `dataQuality`. See `observe.ts`'s parse functions.
//   - DOES NOT MERGE WITH EVALUATED-OUTCOME REPORTING. `DecisionPopulationReport`
//     below and `SelfPerformanceReport` (`lib/ai/selfPerformance/contracts.ts`)
//     are deliberately two separate reports a caller receives side by
//     side, never combined into one object or one number. "How many
//     cycles did the system observe" (this module) and "how many of
//     those that executed were later evaluated" (selfPerformance) answer
//     different questions over different, non-overlapping evidence — see
//     this file's own `DecisionPopulationDataQuality` doc for the exact
//     distinction.
//   - SOURCE/SYMBOL ISOLATION: every report below is scoped to exactly
//     one (source, symbol) pair, matching every 8.1.x/8.3.x/8.6.x module
//     before it. `side` is a within-report BREAKDOWN dimension
//     (`sideDistribution`), never a second scoping filter — a caller
//     wanting one side only filters the returned distribution itself,
//     the same way no other module in this codebase persists two
//     separate per-side rows for what is otherwise one (source, symbol)
//     population.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { QualificationStatus } from "@/lib/ai/decisionQualification/contracts";
import type { PreEntryValidationStatus } from "@/lib/ai/preEntryValidation/contracts";

// Re-exported so observe.ts/repository.ts (and fixtures) have a single
// import source — matches every prior 8.1.x/8.3.x/8.6.x module's own
// re-export convention.
export type { DecisionSource, QualificationStatus, PreEntryValidationStatus };

/** The effective (post-dedup) terminal decision `runtime_events`'s `DECISION` component row records. Verbatim `AutonomousDecision` (`lib/ai/autonomousDecision/contracts.ts`) — not redefined here, just named for this module's own Record types below. */
export type ObservedDecision = "EXECUTE" | "WAIT" | "REJECT";

/** `QualificationStatus` widened with `"UNKNOWN"` for a `metadata.qualificationStatus` value that failed to parse (missing, wrong type, or outside the 4-member closed set) — see `observe.ts::parseObservedQualificationStatus()`. Never silently defaulted to any of the 4 real statuses. */
export type ObservedQualificationStatus = QualificationStatus | "UNKNOWN";

/** `PreEntryValidationStatus` widened with `"UNKNOWN"`, same rule as `ObservedQualificationStatus` above. */
export type ObservedPreEntryStatus = PreEntryValidationStatus | "UNKNOWN";

/** `metadata.side` widened with `"UNKNOWN"` for a missing/unparseable value — a real `AutonomousDecisionEngineResult` can itself carry `side: null` (no directional bias established yet), which this module reports as `"UNKNOWN"` too since there is nothing further to distinguish "no side" from "side not recorded" once the value leaves a strict boolean/enum shape. */
export type ObservedSide = "LONG" | "SHORT" | "UNKNOWN";

/**
 * A conservative, evidence-only classification of WHY a cycle resolved
 * the way it did — derived purely from the two already-persisted status
 * fields (`qualificationStatus`, `preEntryStatus`) against
 * `lib/ai/autonomousDecision/decide.ts`'s own, unchanged, already-verified
 * branch structure (see `observe.ts::attributeDecisionPath()` for the
 * exact, documented mapping). This is a structural deduction from KNOWN
 * code logic applied to two KNOWN persisted fields — never an inference
 * from event ordering/sequence, and never asserted when either input
 * status is `"UNKNOWN"`.
 *   - `EXECUTED` — decision was EXECUTE.
 *   - `LEARNING_MEMORY_REJECTION` — decision REJECT, qualification
 *     CONFLICTED (the P0-corrected negative-memory/failure-pattern path).
 *   - `MARKET_CONTEXT_REJECTION` — decision REJECT, qualification NOT
 *     CONFLICTED, pre-entry BLOCKED — under `decide.ts`'s and
 *     `preEntryValidation/validate.ts`'s own unchanged logic this
 *     combination is only reachable via elevated macro/event risk.
 *   - `INSUFFICIENT_CONTEXT` — decision WAIT, and either status is
 *     INSUFFICIENT_CONTEXT.
 *   - `RISK_OR_CONSTRAINT_CAUTION` — decision WAIT, qualification
 *     CAUTION (an invalid risk plan or an active adaptive constraint —
 *     this module does not further distinguish the two, since
 *     `metadata` does not persist which one fired).
 *   - `MARKET_CONTEXT_CAUTION` — decision WAIT, qualification QUALIFIED,
 *     pre-entry CAUTION (macro/event/external-intelligence caution).
 *   - `OTHER_OBSERVABLE_PATH` — both statuses parsed successfully but the
 *     combination does not match any rule above (e.g. a future,
 *     not-yet-audited branch in `decide.ts`). Evidence-based (both
 *     inputs are known), just not further named here rather than
 *     guessed.
 *   - `UNKNOWN` — `qualificationStatus` and/or `preEntryStatus` could not
 *     be parsed from persisted `metadata` for this row.
 */
export type DecisionPathAttribution = "EXECUTED" | "LEARNING_MEMORY_REJECTION" | "MARKET_CONTEXT_REJECTION" | "INSUFFICIENT_CONTEXT" | "RISK_OR_CONSTRAINT_CAUTION" | "MARKET_CONTEXT_CAUTION" | "OTHER_OBSERVABLE_PATH" | "UNKNOWN";

/** Every member of `ObservedDecision` always present as a key, even at 0 — matches `selfPerformance/aggregate.ts`'s `zeroedCounts()` convention exactly. */
export type ObservedDecisionCounts = Readonly<Record<ObservedDecision, number>>;
export type QualificationStatusCounts = Readonly<Record<ObservedQualificationStatus, number>>;
export type PreEntryStatusCounts = Readonly<Record<ObservedPreEntryStatus, number>>;
export type SideCounts = Readonly<Record<ObservedSide, number>>;
export type DecisionPathAttributionCounts = Readonly<Record<DecisionPathAttribution, number>>;

/**
 * Whether the SUCCESSFULLY-PARSED rows behind a `DecisionPopulationReport`
 * are enough, and clean enough, to treat as representative — a DIFFERENT
 * question from `EvaluationCoverageStatus`
 * (`lib/ai/selfPerformance/contracts.ts`), which is about
 * evaluated-vs-closed EXECUTE outcomes, not observed cycle volume/parse
 * quality.
 *   - INSUFFICIENT_DATA — fewer than `MIN_OCCURRENCE_COUNT` (reused,
 *     unchanged, from `lib/ai/failurePatterns/detect.ts` — the
 *     repository's own existing "enough to be more than incidental" bar)
 *     successfully-parsed cycles in scope.
 *   - PARTIAL — at least `MIN_OCCURRENCE_COUNT` parsed cycles exist, but
 *     one or more has an `"UNKNOWN"` qualification or pre-entry status.
 *   - COMPLETE — every parsed cycle in scope has both statuses resolved.
 */
export type DecisionPopulationCoverageStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT_DATA";

/**
 * Distinguishes "how much raw `runtime_events` data existed for this
 * query" from `observationCoverage`'s "of the rows we found, how
 * completely did they parse" — two different failure modes: an empty
 * Learning DB / no rows in the window is a DATA AVAILABILITY problem
 * (this type), while a present-but-malformed `metadata` object is a
 * PARSE QUALITY problem (`observationCoverage`). Also the one place this
 * module explicitly answers "decision observation != outcome evaluation"
 * (Phase 8.6 P1's own requirement): `evaluatedExperienceCount` here is
 * copied, read-only, from a `SelfPerformanceReport.coverage` the caller
 * already has for the same (source, symbol) — never re-computed, never
 * re-queried, and `null` when the caller did not supply one (this module
 * never requires selfPerformance to run first).
 */
export interface DecisionPopulationDataQuality {
  readonly learningDbConfigured: boolean;
  /** Raw `runtime_events` rows fetched for this (source, symbol) window, before any parsing. */
  readonly rawEventCount: number;
  /** Of `rawEventCount`, how many had a `symbol`/`component` shape this module could even attempt to classify (excludes rows where `metadata` itself was `null`/non-object — see `observe.ts`). These, and only these, are what `totalCycles`/the distributions below are computed over. */
  readonly parsedCycleCount: number;
  /** `rawEventCount - parsedCycleCount` — rows excluded entirely (never zero-filled into any distribution) because even a best-effort read could not treat them as a cycle at all. */
  readonly unparseableRowCount: number;
  /** Copied verbatim from a caller-supplied `SelfPerformanceReport.coverage.evaluatedExperienceCount` for the same (source, symbol) — `null` when the caller did not supply one. Never computed by this module. See this type's own header for why this field exists at all. */
  readonly evaluatedExperienceCount: number | null;
}

/**
 * One (source, symbol) pair's observed decision population, over
 * whatever window the caller's `runtime_events` query covered (see
 * `repository.ts`'s `fetchDecisionPopulationReport` for the actual
 * bound). `totalCycles === decisionCounts.EXECUTE + decisionCounts.WAIT
 * + decisionCounts.REJECT` always — the sum is never taken from a
 * different, competing count.
 */
export interface DecisionPopulationReport {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly totalCycles: number;
  readonly decisionCounts: ObservedDecisionCounts;
  readonly qualificationDistribution: QualificationStatusCounts;
  readonly preEntryDistribution: PreEntryStatusCounts;
  readonly sideDistribution: SideCounts;
  readonly decisionPathAttribution: DecisionPathAttributionCounts;
  /** Cycles where `rawDecision === "EXECUTE"` but the effective (post-dedup) `decision === "WAIT"` — the duplicate-setup dedup gate (`orchestrator.ts` Step 6) fired. A subset of `decisionCounts.WAIT`, reported separately since it is a distinct mechanism from every `DecisionPathAttribution` category above. */
  readonly dedupDowngradedCount: number;
  readonly observationCoverage: DecisionPopulationCoverageStatus;
  readonly dataQuality: DecisionPopulationDataQuality;
}
