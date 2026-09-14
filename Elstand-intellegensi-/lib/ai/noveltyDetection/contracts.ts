// ---------------------------------------------------------------------------
// ELVOID Intelligence — Novelty Detection (Phase 8.6.1, Part 4)
//
// ARCHITECTURE / AUTHORITY:
//   - Pure derivation over an ALREADY-FETCHED `DecisionMemoryResult`
//     (lib/ai/decisionMemory, Phase 8.1.3) — this module performs no
//     database read of its own and introduces no new query shape,
//     mirroring lib/ai/cognitiveConflict/axisAnalysis.ts's own
//     `deriveAxisConflictReport(symbol, trace, memory)` pattern of taking
//     already-computed inputs rather than fetching anything itself.
//   - Deliberately NOT similarity/embedding-based. `classifyNovelty()`
//     (classify.ts) uses only `matchedExperiences.length` /
//     `matchedPatterns.length` — the exact counts `DecisionMemoryResult`
//     already exposes — plus `MIN_OCCURRENCE_COUNT`, reused unchanged
//     from lib/ai/failurePatterns/detect.ts (the repository's own
//     existing bar for "enough occurrences to be more than incidental"),
//     never a new invented threshold. No embeddings, no cosine
//     similarity, no vector store, no ML classifier, no LLM judgment —
//     see classify.ts's own header for the full reasoning.
//   - IMPORTANT, HONEST LIMITATION: `UNAVAILABLE` reflects `memory ===
//     null` only — today, the sole production path that produces that
//     is lib/ai/autonomousRuntime/orchestrator.ts's own
//     `.catch(() => null)` around `queryDecisionMemory()` (a genuinely
//     unexpected/thrown failure). `queryDecisionMemory()` itself never
//     returns `null` — an unconfigured Learning DB, a degraded
//     `decision_experiences`/`decision_evaluations` query, AND a
//     genuinely-checked zero-match population all resolve, inside
//     `queryDecisionMemory()`, to the exact SAME empty
//     `{matchedExperiences: [], matchedEvaluations: [], matchedPatterns:
//     []}` shape (see lib/ai/decisionMemory/repository.ts's own
//     `getDecisionMemoryJoinedExperiences()`/`queryDecisionMemory()`
//     bodies). This module does not attempt to re-derive that
//     distinction — doing so would require changing
//     `DecisionMemoryResult`'s own contract, out of scope for this
//     additive, 8.6.1 pass. A caller that needs to know whether the
//     Learning DB was configured at all should separately check
//     lib/ai/learning/db.ts's own `isLearningSupabaseConfigured()`
//     alongside this module's output — documented here, not silently
//     assumed solved. This is exactly the "keep the classifier
//     conservative and document the limitation" instruction this phase
//     was given, applied honestly rather than papered over.
//   - `CURRENT_RETRIEVAL_NOVELTY`, not `HISTORICAL_NOVELTY_AT_DECISION_TIME`:
//     `DecisionMemoryResult` is query-time-only and was never persisted
//     per cycle (see lib/ai/cognitiveReplay/contracts.ts's own
//     `MEMORY_NOT_PERSISTED_PER_CYCLE` limitation, which applies
//     identically here). A `NoveltyAssessment` describes how novel the
//     situation looks right now; it is never a historical record of how
//     novel a past decision looked at the time it was made. That
//     historical form does not exist yet and is explicitly out of scope
//     here.
//   - Never wired into lib/ai/decisionQualification/qualify.ts or any
//     other decision-qualification/arbitration/execution/risk path — see
//     that module's own header, which already reserves
//     `context.cognitive` for "a later, separately-approved phase"; the
//     same discipline applies to this module's output, which today is
//     observational only.
// ---------------------------------------------------------------------------

import type { DecisionSource, DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";

// Re-exported so classify.ts (and fixtures) have a single import source
// for the shapes they consume.
export type { DecisionSource, DecisionMemoryResult };

/**
 * FAMILIAR — enough concrete, matching evidence exists to say this is
 *   not new territory: either `matchedPatterns.length > 0` (an
 *   already-qualified, >=MIN_OCCURRENCE_COUNT failure pattern exists for
 *   this exact source/symbol/evidence-tag combination — see
 *   lib/ai/failurePatterns/detect.ts) or `matchedExperiences.length >=
 *   MIN_OCCURRENCE_COUNT` on its own.
 * PARTIALLY_FAMILIAR — some matching individual experiences exist
 *   (1..MIN_OCCURRENCE_COUNT-1), but no qualified pattern backs them —
 *   too few to call FAMILIAR, too many to call NOVEL.
 * NOVEL — memory was successfully retrieved and BOTH
 *   `matchedExperiences.length` and `matchedPatterns.length` are exactly
 *   0 — the strongest "have not been here before" signal this data model
 *   can honestly support (see the important limitation documented above
 *   in this file's header).
 * INSUFFICIENT_MEMORY — `matchedPatterns.length > 0` but
 *   `matchedExperiences.length === 0` — a qualified aggregate pattern is
 *   on file, but no individual matching experience surfaced under this
 *   exact query's filters (structurally possible since `matchedPatterns`
 *   is never bounded by `since`/`limit`, unlike `matchedExperiences` —
 *   see lib/ai/decisionMemory/contracts.ts's own `DecisionMemoryResult`
 *   header). Neither confidently FAMILIAR (no concrete anecdote) nor
 *   honestly NOVEL (a pattern IS on file).
 * UNAVAILABLE — `memory === null`: retrieval itself was not performed or
 *   did not complete this cycle. Never conflated with a genuine
 *   zero-match NOVEL result — see this file's header.
 */
export type NoveltyClassification = "FAMILIAR" | "PARTIALLY_FAMILIAR" | "NOVEL" | "INSUFFICIENT_MEMORY" | "UNAVAILABLE";

/**
 * Deterministic, evidence-backed novelty/familiarity assessment for one
 * (source, symbol) pair at query time. Every field is derived directly
 * from an already-fetched `DecisionMemoryResult` — nothing here is
 * fabricated, inferred by an LLM, or computed from a similarity/
 * embedding score. This is CURRENT_RETRIEVAL_NOVELTY only — see this
 * file's header.
 */
export interface NoveltyAssessment {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly classification: NoveltyClassification;
  /** Verbatim `memory.matchedExperiences.length`, or 0 when `memory` is null (see `retrievalAvailable` to distinguish that case). */
  readonly matchedExperienceCount: number;
  /** Verbatim `memory.matchedPatterns.length`, or 0 when `memory` is null. */
  readonly matchedPatternCount: number;
  /** false only when `memory === null` (see `NoveltyClassification.UNAVAILABLE`). */
  readonly retrievalAvailable: boolean;
  /** Plain, deterministic, count-based statements only — never a fabricated narrative, never an LLM explanation. Matches lib/ai/autonomousRuntime/orchestrator.ts's own describeLearningInfluence() discipline. */
  readonly reasons: readonly string[];
}
