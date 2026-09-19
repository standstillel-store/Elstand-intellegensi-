// ---------------------------------------------------------------------------
// ELVOID Intelligence — Confluence-Source Attribution (Phase 8.6 P2)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - READ-ONLY OBSERVATION LAYER, NOT A NEW DECISION AUTHORITY — same
//     rule as lib/ai/decisionPopulation (Phase 8.6 P1). Nothing here is
//     imported by Phase 7 grading/confluence, Oracle decision logic,
//     decisionQualification, preEntryValidation, arbitration, risk,
//     execution, or paper trading — confirmed by a repository-wide
//     import scan before this phase shipped (see CHANGES.md).
//   - FORENSIC FINDING THIS PHASE CLOSES: the canonical, 8-member
//     `ConfluenceSource` vocabulary (`lib/ai/oracle/confluenceTypes.ts`)
//     is computed for every real confluence factor, every cycle
//     (`computeConfluence()`, Phase 2), and immediately re-expressed as
//     `NormalizedEvidence[]` — source + cluster + direction + strength +
//     quality + evidence text — by `normalizeEvidence()`
//     (`lib/ai/oracle/evidence.ts`, Phase 7.1). `buildCognitiveObservation()`
//     (`lib/ai/cognitive/observation.ts`, Phase 8.0.1) wraps this into
//     `CognitiveObservation.evidence`, already fully structured, already
//     computed every cycle. NONE of this reached persistence before this
//     phase: `cognitive_trace` (Phase 8.3.2)'s own `evidence` stage only
//     ever stored three hardcoded, narrow narrative STRINGS
//     (`liquidityEvidence`/`structureEvidence`/`volumeEvidence`, one
//     each for exactly 3 of the 8 real sources — `liquidity`,
//     `market_structure`, `footprint` — via
//     `orchestrator.ts::evidenceForSource()`), discarding direction/
//     strength/quality and the other 5 sources entirely, every cycle,
//     for as long as this system has run. `decision_experiences`/
//     `decision_evaluations`' own `EvaluationEvidenceTag` vocabulary
//     (`lib/ai/decisionEvaluation/contracts.ts`) has no confluence-source
//     dimension at all (grade/cognitive-coherence/hypothesis/risk tags
//     only) — confirmed unchanged by this phase.
//   - THE ONE PLACE STRUCTURED `ConfluenceSource` DATA ALREADY REACHED
//     PERSISTENCE, before this phase: `cognitive_trace.contradictions`
//     (`ClassifiedContradiction[]`, Phase 8.3.5) — but only for factors
//     that DISAGREED with another factor that same cycle, never a
//     general "which sources were present" record. Real data, already
//     queryable today, genuinely narrower in scope than "every source
//     that fired."
//   - MINIMAL, SAFE INSTRUMENTATION ADDED BY THIS PHASE: one new,
//     optional field, `CognitiveTraceEvidenceStage.confluenceEvidence`
//     (`lib/ai/cognitiveTrace/contracts.ts`) — the VERBATIM, ALREADY-
//     COMPUTED `CognitiveObservation.evidence` this cycle already built,
//     now persisted for the first time instead of discarded.
//     `cognitive_trace.evidence` is an existing `jsonb` column — this
//     needed no new database column and no migration (see
//     `supabase/learning/schema.sql`'s own note next to that column).
//     Nothing about WHAT gets computed changed; only that one more
//     already-computed value is now written down. Rows written before
//     this phase, and any `NO_ASSESSMENT` cycle, correctly carry `null`
//     here — reported as `NOT_RECORDED` below, never backfilled, never
//     guessed.
//   - TWO SEPARATE, NEVER-MERGED TALLIES, because they have different
//     provenance and very different current data availability:
//       1. `evidenceSources` — from the NEW `confluenceEvidence` field.
//          Real per-source direction/strength/quality, but only
//          populated for cycles run AFTER this phase shipped (every
//          historical row reports `NOT_RECORDED` for this half, freely
//          and honestly — there is no data to report yet).
//       2. `contradictionSources` — from the EXISTING `contradictions`
//          field. Real, already-populated historical data, but narrower
//          in meaning (a source appearing here means it disagreed with
//          something, not merely that it fired).
//     Merging these into one number would misrepresent one, the other,
//     or both — kept explicitly separate instead. See `deriveConfluenceAttribution()`
//     (derive.ts) for how each is computed.
//   - "DECISION POPULATION" REUSE: `decisionCounts` on each tally below
//     reuses `lib/ai/decisionPopulation/contracts.ts`'s own
//     `ObservedDecisionCounts` type (Phase 8.6 P1) — the exact same
//     EXECUTE/WAIT/REJECT shape, satisfying "connect to decision
//     population" (this phase's Step 5) with a type-level reuse rather
//     than a redefinition. The decision itself is read directly off the
//     SAME `cognitive_trace` row's own `decision.decision` field
//     (`CognitiveTraceDecisionStage`, Phase 8.3.2, unchanged) — no join
//     to `runtime_events` is needed for this phase, unlike P1, because
//     `cognitive_trace` already carries both the evidence and the
//     decision outcome on one row.
//   - DESCRIPTIVE, NEVER CAUSAL: every count below answers "how many
//     cycles resolving to decision X had source Y present/in
//     contradiction" — never "source Y caused decision X." No field or
//     doc comment in this module claims causation; see
//     `ConfluenceSourceTally`'s own doc comment.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { ConfluenceSource } from "@/lib/ai/oracle/confluenceTypes";
import type { EvidenceDirection, EvidenceCluster, NormalizedEvidence } from "@/lib/ai/oracle/evidence";
import type { OracleDataQuality } from "@/lib/ai/oracle/types";
import type { ObservedDecisionCounts } from "@/lib/ai/decisionPopulation/contracts";

// Re-exported so derive.ts/repository.ts (and fixtures) have a single
// import source — matches every prior 8.1.x/8.3.x/8.6.x module's own
// re-export convention.
export type { DecisionSource, ConfluenceSource, EvidenceDirection, EvidenceCluster, NormalizedEvidence, OracleDataQuality, ObservedDecisionCounts };

/**
 * Whether a given piece of attribution is a directly-persisted fact, a
 * deduction from other persisted facts, or genuinely absent. This phase's
 * `deriveConfluenceAttribution()` only ever produces `OBSERVED` (a real
 * `NormalizedEvidence`/`ClassifiedContradiction` entry was found) or
 * `NOT_RECORDED` (the field is `null` — predates this phase, or a
 * `NO_ASSESSMENT` cycle) — `INFERRED` and `UNKNOWN` are part of this
 * closed vocabulary for forward compatibility with a future phase or
 * fixture, but are never returned by this phase's own derivation logic
 * (see derive.ts's header for exactly why nothing here needs to guess).
 */
export type ConfluenceAttributionStatus = "OBSERVED" | "INFERRED" | "UNKNOWN" | "NOT_RECORDED";

/**
 * Per-`ConfluenceSource`, per-report tally. DESCRIPTIVE ONLY: this
 * answers "how many in-scope cycles had this source present (or in
 * contradiction), and what did those cycles decide" — never "this
 * source caused that decision." `directionCounts`/`qualityCounts` are
 * `null` for a contradiction-derived tally (`ClassifiedContradiction`
 * carries no per-source direction or quality — see contracts for that
 * type) — `null` there is a real "this dimension does not exist for
 * this tally," not a missing-data gap.
 */
export interface ConfluenceSourceTally {
  readonly source: ConfluenceSource;
  /** Count of in-scope cycles where this source appears at all in the tally's own provenance (confluenceEvidence entries, or contradiction sources). */
  readonly occurrenceCount: number;
  readonly directionCounts: Readonly<Record<EvidenceDirection, number>> | null;
  readonly qualityCounts: Readonly<Record<OracleDataQuality, number>> | null;
  /** Reused verbatim from lib/ai/decisionPopulation (Phase 8.6 P1) — EXECUTE/WAIT/REJECT counts among the cycles where this source occurred. */
  readonly decisionCounts: ObservedDecisionCounts;
}

export interface ConfluenceAttributionDataQuality {
  readonly learningDbConfigured: boolean;
  /** Raw `cognitive_trace` rows fetched for this (source, symbol) window, before scoping/filtering. */
  readonly rawTraceCount: number;
  /** Of `rawTraceCount`, how many are in scope (symbol-matched, non-`NO_ASSESSMENT` — i.e. `evidence` stage non-null). `NO_ASSESSMENT` rows are excluded from every tally below, never zero-filled. */
  readonly cyclesInScope: number;
}

/**
 * One (source, symbol) pair's confluence attribution, over whatever
 * `cognitive_trace` window the caller's query covered (see
 * `repository.ts`). Both tally arrays always have exactly 8 entries —
 * one per `ConfluenceSource` — even when a source's `occurrenceCount` is
 * `0`; a source never disappears from the report for lack of evidence,
 * it just reports zero, honestly.
 */
export interface ConfluenceAttributionReport {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  /** Of `dataQuality.cyclesInScope`, how many actually have `confluenceEvidence` populated (i.e. were run after this phase shipped). `0` is an expected, honest value for a while after this phase first ships. */
  readonly evidenceRecordedCycles: number;
  readonly evidenceStatus: ConfluenceAttributionStatus;
  readonly evidenceSources: readonly ConfluenceSourceTally[];
  /** Of `dataQuality.cyclesInScope`, how many have a non-null `contradictions` array (even an empty one — "checked, found none" is itself a recorded fact, distinct from "never checked"). */
  readonly contradictionRecordedCycles: number;
  readonly contradictionStatus: ConfluenceAttributionStatus;
  readonly contradictionSources: readonly ConfluenceSourceTally[];
  readonly dataQuality: ConfluenceAttributionDataQuality;
}
