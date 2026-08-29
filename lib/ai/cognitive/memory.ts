// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Cognitive Working Memory (Phase 8.0.2)
//
// ARCHITECTURE / AUTHORITY:
//   - Request-scoped, in-process only. Never persisted, never cached,
//     never shared across requests, never a module-level singleton/Map/Set.
//   - Evidence is read through the originating CognitiveObservation
//     (observation.evidence) — this file never re-normalizes, re-collects,
//     or duplicates evidence. No second evidence-detection engine.
//   - Never mutates OracleAssessment. Canonical side/grade/confidence/
//     riskStatus/invalidation are reachable only via
//     memory.observation.sourceAssessment (already a read-only copy per
//     Phase 8.0.1) — this file introduces no cognitiveSide/cognitiveGrade/
//     cognitiveConfidence/cognitiveRiskStatus or any other shadow field.
//   - Immutable, append-only: createWorkingMemory()/appendMemoryEntry() are
//     pure functions that return a fresh value. There is no
//     class/update()/remove(), nothing here is ever mutated in place.
//   - Zero network, zero database, zero LLM calls.
// ---------------------------------------------------------------------------

import type { CognitiveObservation } from "./contracts";
import type { CognitiveEvidenceRef } from "./types";

export interface CognitiveMemoryEntry {
  readonly text: string;
  readonly relatedEvidenceSources?: readonly CognitiveEvidenceRef["source"][];
}

/**
 * Request-scoped cognitive working memory.
 *
 * - Never persisted
 * - Never cached
 * - Never shared across requests
 * - Never mutates Oracle canonical assessment fields
 * - Evidence is read through the originating CognitiveObservation
 */
export interface CognitiveWorkingMemory {
  readonly observation: CognitiveObservation;
  readonly notes: readonly CognitiveMemoryEntry[];
}

/**
 * Constructs fresh request-scoped working memory.
 * Pure function. Never mutates `observation`.
 */
export function createWorkingMemory(observation: CognitiveObservation): CognitiveWorkingMemory {
  return { observation, notes: [] };
}

/**
 * Returns a NEW memory value with `entry` appended.
 *
 * Never mutates: the existing memory, the existing notes array, or
 * `observation`. `memory.observation` is carried through unchanged by
 * reference — it is already an immutable-by-contract CognitiveObservation
 * (Phase 8.0.1), so there is nothing to copy there; only `notes` receives a
 * new array.
 */
export function appendMemoryEntry(memory: CognitiveWorkingMemory, entry: CognitiveMemoryEntry): CognitiveWorkingMemory {
  return { observation: memory.observation, notes: [...memory.notes, entry] };
}
