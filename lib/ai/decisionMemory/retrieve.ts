// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Memory (Phase 8.1.3)
//
// Pure filtering/ranking logic ONLY — zero DB, zero network, zero LLM,
// zero randomness, zero wall-clock reads. Mirrors lib/ai/failurePatterns/
// detect.ts's own "pure domain module, persistence lives entirely in
// repository.ts" convention. `retrieveDecisionMemory()` is a pure function
// of its three inputs (query, joined rows, patterns) — same input always
// produces byte-identical output, regardless of input array order.
//
// This file never re-implements or loosens Phase 8.1.2's pattern
// qualification (MIN_OCCURRENCE_COUNT / temporal-spread / confidence cap)
// — patterns are filtered here ONLY by `source` and, optionally,
// `evidenceTags`; every other field on a `FailurePatternCandidate` passes
// through completely unmodified.
// ---------------------------------------------------------------------------

import type { DecisionMemoryQuery, DecisionMemoryJoinedRow, DecisionMemoryResult, FailurePatternCandidate } from "./contracts";

/**
 * Filters and ranks a Learning DB population against a `DecisionMemoryQuery`.
 *
 * Experience filtering (all mandatory/optional filters are AND-ed):
 *   1. `source` — REQUIRED, always applied. AI_SIGNAL and ELVOID_PRO_ORACLE
 *      rows are never mixed in the output.
 *   2. `symbol` — if provided, only exact matches pass.
 *   3. `side` — if provided, only exact matches pass.
 *   4. `since` — if provided, only rows with `decisionTimestamp >= since` pass.
 *   5. `evidenceTags` — if provided and non-empty, only rows whose joined
 *      evaluation's `evidence` overlaps at least one requested tag pass
 *      (a row with no evaluation at all has zero evidence and is excluded
 *      by this filter when tags are requested — it simply has no evidence
 *      to overlap with). If omitted/empty, this filter is a no-op.
 *
 * Experience ranking: primarily by evidence-tag overlap COUNT (descending),
 * then by `decisionTimestamp` (descending — most recent first), then by
 * `sourceSignalId` (ascending) as a final deterministic tie-break so
 * output ordering never depends on input array order or object identity.
 *
 * `limit` (if provided) caps the number of ranked experiences returned.
 * `matchedEvaluations` is derived from the SAME ranked-and-limited set of
 * rows, keeping only the rows that actually have a non-null evaluation
 * (an orphaned/unresolved experience with no evaluation is simply absent
 * from `matchedEvaluations`, never fabricated) — so it is never longer
 * than `matchedExperiences`, and never contains an evaluation for a row
 * that didn't make the cut.
 *
 * Pattern filtering: `source` (mandatory) and, if provided, `evidenceTags`
 * (a pattern's single `evidenceTag` must be among the requested set) —
 * nothing else. Ranked by `confidence` (descending), then `evidenceTag`
 * (ascending) for determinism. Never capped by `limit`.
 *
 * Mutates nothing: `joinedRows`, `patterns`, and every object reachable
 * from them are read-only inputs — every array produced here (`filter`,
 * `map`, `slice`, sorting a freshly-built array) is a new array, and no
 * property of an input object is ever reassigned.
 */
export function retrieveDecisionMemory(query: DecisionMemoryQuery, joinedRows: readonly DecisionMemoryJoinedRow[], patterns: readonly FailurePatternCandidate[]): DecisionMemoryResult {
  const requestedTags = query.evidenceTags ?? [];
  const sinceTime = query.since !== undefined ? Date.parse(query.since) : null;

  const overlapCount = (row: DecisionMemoryJoinedRow): number => {
    if (requestedTags.length === 0) return 0;
    const rowTags = row.evaluation?.evidence ?? [];
    return requestedTags.filter((tag) => rowTags.includes(tag)).length;
  };

  const eligible = joinedRows.filter((row) => {
    if (row.experience.source !== query.source) return false;
    if (query.symbol !== undefined && row.experience.symbol !== query.symbol) return false;
    if (query.side !== undefined && row.experience.side !== query.side) return false;
    if (sinceTime !== null && Date.parse(row.experience.decisionTimestamp) < sinceTime) return false;
    if (requestedTags.length > 0 && overlapCount(row) === 0) return false;
    return true;
  });

  const ranked = eligible
    .map((row) => ({ row, overlap: overlapCount(row) }))
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      const bTime = Date.parse(b.row.experience.decisionTimestamp);
      const aTime = Date.parse(a.row.experience.decisionTimestamp);
      if (bTime !== aTime) return bTime - aTime;
      return a.row.experience.sourceSignalId.localeCompare(b.row.experience.sourceSignalId);
    })
    .map((entry) => entry.row);

  const limited = query.limit !== undefined ? ranked.slice(0, Math.max(0, query.limit)) : ranked;

  const matchedExperiences = limited.map((row) => row.experience);
  const matchedEvaluations = limited.filter((row): row is DecisionMemoryJoinedRow & { evaluation: NonNullable<DecisionMemoryJoinedRow["evaluation"]> } => row.evaluation !== null).map((row) => row.evaluation);

  const matchedPatterns = patterns
    .filter((pattern) => pattern.source === query.source)
    .filter((pattern) => requestedTags.length === 0 || requestedTags.includes(pattern.evidenceTag))
    .slice()
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.evidenceTag.localeCompare(b.evidenceTag);
    });

  return { matchedExperiences, matchedEvaluations, matchedPatterns };
}
