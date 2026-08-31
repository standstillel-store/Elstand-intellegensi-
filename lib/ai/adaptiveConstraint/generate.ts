// ---------------------------------------------------------------------------
// ELVOID Intelligence — Adaptive Constraint Engine (Phase 8.1.4)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()`/timestamp generation (see contracts.ts —
// `generatedAt` is added by repository.ts, not here). Zero randomness.
// Zero imports from lib/ai/oracle/*, lib/ai/cognitive/*, lib/elvoid/*, or
// any trading-execution module — this file depends ONLY on the plain
// `FailurePatternCandidate[]` it's given (plus the closed-enum types
// re-exported from contracts.ts).
//
// This module NEVER reimplements or lowers `MIN_OCCURRENCE_COUNT` or the
// temporal-spread rule (both live solely in
// lib/ai/failurePatterns/detect.ts, already applied before a candidate
// ever reaches this function's input) and NEVER recomputes
// `occurrenceCount`/`dominantClassShare`/`confidence` — every basis field
// is copied verbatim from its source candidate. The only decision this
// module makes is which CLOSED, non-behavioral `constraintType` label a
// given already-qualified candidate maps to.
// ---------------------------------------------------------------------------

import type { AdaptiveConstraintWithoutTimestamp, AdaptiveConstraintType, FailurePatternCandidate } from "./contracts";

/**
 * `dominantClassShare` at/above this threshold means the group's failures
 * are overwhelmingly concentrated in a single evaluation class — the
 * strongest, most unambiguous signal this phase can label. Used only for
 * `constraintType` selection below; never fed back into
 * `dominantClassShare` itself, which remains a verbatim copy.
 */
export const HIGH_DOMINANCE_SHARE = 0.8;

/**
 * `occurrenceCount` at/above this threshold means the pattern has
 * recurred often enough (well beyond `MIN_OCCURRENCE_COUNT`) that this
 * phase labels it as warranting stronger confirmation before acting on
 * evidence carrying this tag, without asserting outright unreliability.
 * A locally-defined tier for constraintType selection — NOT a
 * re-implementation of, or replacement for,
 * `lib/ai/failurePatterns/detect.ts`'s `MIN_OCCURRENCE_COUNT`
 * qualification threshold, which has already been applied to every
 * candidate this function receives.
 */
export const HIGH_OCCURRENCE_COUNT = 15;

/**
 * Deterministic, closed-enum constraint-type selection for one
 * already-qualified candidate. Priority order (first match wins):
 *   1. Strong, concentrated dominance (`dominantClassShare` >=
 *      `HIGH_DOMINANCE_SHARE`) AND at least mid-range statistical
 *      confidence (>= half of the source module's own `MAX_CONFIDENCE`
 *      ceiling, i.e. `candidate.confidence >= 0.35`) -> the strongest v1
 *      label, `FLAG_HISTORICAL_UNRELIABILITY`.
 *   2. Otherwise, a well-established recurrence count (`occurrenceCount`
 *      >= `HIGH_OCCURRENCE_COUNT`) -> `REQUIRE_STRONGER_CONFIRMATION`.
 *   3. Otherwise (qualified but neither highly concentrated nor highly
 *      recurrent yet) -> the baseline v1 label, `INCREASE_CAUTION`.
 * Pure function of `candidate`'s already-verbatim fields — no new number
 * is computed, only a label selected from the closed v1 enum.
 */
function selectConstraintType(candidate: FailurePatternCandidate): AdaptiveConstraintType {
  if (candidate.dominantClassShare >= HIGH_DOMINANCE_SHARE && candidate.confidence >= 0.35) {
    return "FLAG_HISTORICAL_UNRELIABILITY";
  }
  if (candidate.occurrenceCount >= HIGH_OCCURRENCE_COUNT) {
    return "REQUIRE_STRONGER_CONFIRMATION";
  }
  return "INCREASE_CAUTION";
}

/**
 * Pure, deterministic, synchronous. The same input (in any array order)
 * always produces byte-identical output, in a fixed output order (source,
 * then evidenceTag, both ascending, mirroring
 * `detectFailurePatternCandidates()`'s own output ordering). Never
 * mutates `candidates` or anything nested inside it. Holds no state
 * across calls.
 *
 * Exactly one logical constraint per input candidate: `source` and
 * `evidenceTag` are inherited verbatim, and — because
 * `failure_pattern_candidates` already enforces `UNIQUE(source,
 * evidence_tag)` — a well-formed input array naturally yields at most one
 * constraint per `(source, evidenceTag)` group with no additional
 * dedup logic required here. `basis` is a straight, unmodified copy of
 * `occurrenceCount`, `dominantClassShare`, `firstObservedAt`, and
 * `lastObservedAt`, plus `confidence` copied into `statisticalConfidence`
 * — never recomputed, never rounded differently.
 */
export function generateAdaptiveConstraints(candidates: readonly FailurePatternCandidate[]): AdaptiveConstraintWithoutTimestamp[] {
  const generated: AdaptiveConstraintWithoutTimestamp[] = candidates.map((candidate) => ({
    version: 1,
    source: candidate.source,
    evidenceTag: candidate.evidenceTag,
    constraintType: selectConstraintType(candidate),
    basis: {
      occurrenceCount: candidate.occurrenceCount,
      dominantClassShare: candidate.dominantClassShare,
      statisticalConfidence: candidate.confidence,
      firstObservedAt: candidate.firstObservedAt,
      lastObservedAt: candidate.lastObservedAt,
    },
  }));

  // Fixed, deterministic output order — never dependent on input array
  // order, matching detect.ts's own final-sort convention.
  generated.sort((a, b) => (a.source === b.source ? a.evidenceTag.localeCompare(b.evidenceTag) : a.source.localeCompare(b.source)));

  return generated;
}
