// ---------------------------------------------------------------------------
// ELVOID Intelligence — Failure Pattern Detection (Phase 8.1.2)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()`/timestamp generation (see contracts.ts —
// `computedAt` is added by repository.ts, not here). Zero randomness.
// Zero imports from lib/ai/oracle/*, lib/ai/cognitive/*, lib/elvoid/*, or
// any trading-execution module — this file depends ONLY on the plain
// `FailurePatternObservationInput[]` it's given (plus the closed-enum
// types re-exported from contracts.ts).
//
// This module reports FREQUENCY OBSERVATIONS ONLY. It never infers or
// states causality ("X caused the loss") — it counts how often a single
// evidence tag co-occurred with a negative-outcome evaluation, for one
// source, across more than one calendar day. There is no free-text field
// anywhere in its output for a narrative/explanation to even be attached
// to.
// ---------------------------------------------------------------------------

import type { FailurePatternObservationInput, FailurePatternSource, FailurePatternEvidenceTag, FailurePatternEvaluationClass, FailurePatternCandidateWithoutTimestamp } from "./contracts";

/** A group with fewer qualifying occurrences than this is excluded entirely — never persisted as a low-confidence row. */
export const MIN_OCCURRENCE_COUNT = 5;

/** Sample size at and beyond which `confidence` stops increasing. */
export const CONFIDENCE_SAMPLE_CAP = 30;

/** The absolute ceiling `confidence` can ever reach — this module's output is always explicitly partial, never asserted as certain. */
export const MAX_CONFIDENCE = 0.7;

/**
 * Evaluation classes that represent a NEGATIVE market outcome (i.e.
 * `marketOutcome === "NEGATIVE"` in Phase 8.1.1's `evaluateMarketOutcome`):
 * `GOOD_DECISION_BAD_OUTCOME` and `BAD_DECISION_BAD_OUTCOME`. This module
 * groups on OUTCOME, not on the separate `decisionQuality` axis — a
 * recurring evidence tag that keeps co-occurring with losing trades is
 * worth surfacing regardless of whether the decision itself was
 * independently judged GOOD or BAD; interpreting WHY is left entirely to
 * the reader and is never inferred here. Declaration order also serves as
 * the deterministic tie-break for `dominantEvaluationClass` (see below).
 */
export const NEGATIVE_EVALUATION_CLASSES: readonly FailurePatternEvaluationClass[] = ["GOOD_DECISION_BAD_OUTCOME", "BAD_DECISION_BAD_OUTCOME"];

function isNegativeEvaluationClass(evaluationClass: FailurePatternEvaluationClass): boolean {
  return NEGATIVE_EVALUATION_CLASSES.includes(evaluationClass);
}

interface GroupKey {
  readonly source: FailurePatternSource;
  readonly symbol: string;
  readonly evidenceTag: FailurePatternEvidenceTag;
}

function groupKeyString(key: GroupKey): string {
  return `${key.source}::${key.symbol}::${key.evidenceTag}`;
}

/**
 * UTC calendar date only (`YYYY-MM-DD`), sliced directly from the ISO
 * timestamp string — deterministic, no locale/timezone dependence, no
 * `Date` object construction. Matches `decision_timestamp`'s own
 * `timestamptz`-serialized-as-ISO-UTC convention throughout the Learning
 * DB.
 */
function calendarDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

/**
 * Pure, deterministic, synchronous. The same input (in any array order)
 * always produces byte-identical output, in a fixed output order (source,
 * then evidenceTag, both ascending). Never mutates `observations` or
 * anything nested inside it. Holds no state across calls — every
 * invocation recomputes entirely from the input it is given, which is
 * exactly what makes `repository.ts`'s recompute-and-upsert persistence
 * model safe.
 */
export function detectFailurePatternCandidates(observations: readonly FailurePatternObservationInput[]): FailurePatternCandidateWithoutTimestamp[] {
  const groups = new Map<string, { key: GroupKey; rows: FailurePatternObservationInput[] }>();

  for (const observation of observations) {
    if (!isNegativeEvaluationClass(observation.evaluationClass)) continue; // only qualifying negative-outcome rows contribute — see NEGATIVE_EVALUATION_CLASSES doc.

    // Single-tag grouping only — never combinatorial. Each qualifying tag
    // on this observation independently contributes to its own (source,
    // symbol, tag) group — Phase 8.3.0.1 §7 widened this from (source,
    // tag) specifically so one symbol's occurrences can never pool into
    // another's; a decision carrying multiple tags is legitimately
    // counted once per tag, never once per tag-combination.
    for (const evidenceTag of observation.evidenceTags) {
      const key: GroupKey = { source: observation.source, symbol: observation.symbol, evidenceTag };
      const mapKey = groupKeyString(key);
      const existing = groups.get(mapKey);
      if (existing) existing.rows.push(observation);
      else groups.set(mapKey, { key, rows: [observation] });
    }
  }

  const candidates: FailurePatternCandidateWithoutTimestamp[] = [];

  for (const { key, rows } of groups.values()) {
    const occurrenceCount = rows.length;
    if (occurrenceCount < MIN_OCCURRENCE_COUNT) continue;

    // Temporal recurrence: must span more than one distinct calendar day.
    // A cluster confined to a single day, however large, does not qualify
    // — recurrence across time is the entire point of a "pattern" here.
    const calendarDates = new Set(rows.map((row) => calendarDate(row.decisionTimestamp)));
    if (calendarDates.size < 2) continue;

    const classCounts = new Map<FailurePatternEvaluationClass, number>();
    for (const row of rows) classCounts.set(row.evaluationClass, (classCounts.get(row.evaluationClass) ?? 0) + 1);

    // Deterministic dominant-class selection: iterate NEGATIVE_EVALUATION_CLASSES
    // in its declared order so an exact tie always resolves the same way,
    // never depending on Map/object iteration order of the input data.
    let dominantEvaluationClass: FailurePatternEvaluationClass = NEGATIVE_EVALUATION_CLASSES[0];
    let dominantCount = 0;
    for (const evaluationClass of NEGATIVE_EVALUATION_CLASSES) {
      const count = classCounts.get(evaluationClass) ?? 0;
      if (count > dominantCount) {
        dominantCount = count;
        dominantEvaluationClass = evaluationClass;
      }
    }

    const dominantClassShare = Math.round((dominantCount / occurrenceCount) * 10000) / 10000;

    const sampledCount = Math.min(occurrenceCount, CONFIDENCE_SAMPLE_CAP);
    const confidence = Math.round((sampledCount / CONFIDENCE_SAMPLE_CAP) * MAX_CONFIDENCE * 10000) / 10000;

    const sortedTimestamps = rows.map((row) => row.decisionTimestamp).slice().sort();
    const firstObservedAt = sortedTimestamps[0];
    const lastObservedAt = sortedTimestamps[sortedTimestamps.length - 1];

    candidates.push({
      version: 1,
      source: key.source,
      symbol: key.symbol,
      evidenceTag: key.evidenceTag,
      dominantEvaluationClass,
      occurrenceCount,
      dominantClassShare,
      confidence,
      firstObservedAt,
      lastObservedAt,
    });
  }

  // Fixed, deterministic output order — never dependent on Map iteration
  // order (which follows insertion order of the input, not a guaranteed
  // stable contract from a caller's perspective).
  candidates.sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return a.evidenceTag.localeCompare(b.evidenceTag);
  });

  return candidates;
}
