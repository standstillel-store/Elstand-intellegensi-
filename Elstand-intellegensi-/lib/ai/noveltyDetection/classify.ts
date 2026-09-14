// ---------------------------------------------------------------------------
// ELVOID Intelligence — Novelty Detection, pure classifier (Phase 8.6.1,
// Part 4)
//
// Pure, deterministic, synchronous. Zero database/network/LLM/fetch
// calls, zero Date.now()/timestamp generation, zero randomness — mirrors
// lib/ai/failurePatterns/detect.ts's own discipline. Takes an
// already-fetched `DecisionMemoryResult | null` (see contracts.ts's
// header for exactly what `null` does and does not mean here) and
// derives a `NoveltyAssessment` for one (source, symbol) pair. Never
// queries the Learning DB itself, never mutates its input.
//
// Deliberately conservative: only two thresholds exist anywhere in this
// file — `0` (a literal count) and `MIN_OCCURRENCE_COUNT` (reused
// unchanged from lib/ai/failurePatterns/detect.ts, never redefined or
// re-tuned here). No embeddings, no cosine similarity, no vector
// distance, no ML classifier, no LLM novelty judgment — every branch
// below is a plain comparison against one of those two numbers, per
// Phase 8.6.1's own instruction not to invent an arbitrary sophisticated
// scoring system.
// ---------------------------------------------------------------------------

import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { DecisionSource, DecisionMemoryResult, NoveltyAssessment, NoveltyClassification } from "./contracts";

/**
 * Classifies how familiar `memory` makes the current (source, symbol)
 * situation look, using only `matchedExperiences.length` /
 * `matchedPatterns.length`. See contracts.ts's `NoveltyClassification`
 * doc comment for the full decision table and the documented limitation
 * around Learning-DB-unconfigured vs genuinely-zero-matches.
 */
export function classifyNovelty(source: DecisionSource, symbol: string, memory: DecisionMemoryResult | null): NoveltyAssessment {
  if (!memory) {
    return {
      source,
      symbol,
      classification: "UNAVAILABLE",
      matchedExperienceCount: 0,
      matchedPatternCount: 0,
      retrievalAvailable: false,
      reasons: ["Decision Memory retrieval was not available this cycle."],
    };
  }

  const experienceCount = memory.matchedExperiences.length;
  const patternCount = memory.matchedPatterns.length;
  const reasons: string[] = [`${experienceCount} matching experience(s), ${patternCount} qualified failure pattern(s).`];

  let classification: NoveltyClassification;
  if (experienceCount === 0 && patternCount === 0) {
    classification = "NOVEL";
    reasons.push("Retrieval executed successfully; no matching experience or qualified pattern exists for this source/symbol.");
  } else if (experienceCount === 0 && patternCount > 0) {
    classification = "INSUFFICIENT_MEMORY";
    reasons.push("A qualified failure pattern exists, but no individual matching experience surfaced under this query.");
  } else if (experienceCount > 0 && experienceCount < MIN_OCCURRENCE_COUNT && patternCount === 0) {
    classification = "PARTIALLY_FAMILIAR";
    reasons.push(`Fewer than ${MIN_OCCURRENCE_COUNT} matching experiences exist and no qualified pattern backs them.`);
  } else {
    classification = "FAMILIAR";
    reasons.push(patternCount > 0 ? "A qualified failure pattern exists for this source/symbol." : `At least ${MIN_OCCURRENCE_COUNT} matching experiences exist.`);
  }

  return {
    source,
    symbol,
    classification,
    matchedExperienceCount: experienceCount,
    matchedPatternCount: patternCount,
    retrievalAvailable: true,
    reasons,
  };
}
