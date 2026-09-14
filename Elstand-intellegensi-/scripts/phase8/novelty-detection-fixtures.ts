// ---------------------------------------------------------------------------
// Phase 8.6.1 — Novelty Detection fixtures (dev-only, not part of the
// app). Pure/offline — hand-built DecisionMemoryResult fixtures exercised
// against classify.ts's pure classifyNovelty() only, matching
// failure-pattern-fixtures.ts's own convention of testing only the pure
// layer.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/novelty-detection-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { classifyNovelty } from "@/lib/ai/noveltyDetection/classify";
import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { DecisionMemoryResult, DecisionExperienceRecord, FailurePatternCandidate } from "@/lib/ai/decisionMemory/contracts";

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

function experience(): DecisionExperienceRecord {
  return {
    id: "exp-1",
    source: "ELVOID_PRO_ORACLE",
    sourceSignalId: "sig-1",
    symbol: "BTCUSDT",
    side: "LONG",
    grade: "A",
    confidence: 70,
    decisionTimestamp: "2026-09-01T00:00:00.000Z",
    learningContext: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    outcome: null,
  };
}

function pattern(): FailurePatternCandidate {
  return {
    version: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    evidenceTag: "HIGH_RISK_PRESENT",
    dominantEvaluationClass: "BAD_DECISION_BAD_OUTCOME",
    occurrenceCount: MIN_OCCURRENCE_COUNT,
    dominantClassShare: 1,
    confidence: 0.5,
    firstObservedAt: "2026-08-01T00:00:00.000Z",
    lastObservedAt: "2026-08-05T00:00:00.000Z",
    computedAt: "2026-09-01T00:00:00.000Z",
  };
}

function memoryWith(experienceCount: number, patternCount: number): DecisionMemoryResult {
  return {
    matchedExperiences: Array.from({ length: experienceCount }, () => experience()),
    matchedEvaluations: [],
    matchedPatterns: Array.from({ length: patternCount }, () => pattern()),
  };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", null);
  check("1. memory === null -> UNAVAILABLE, retrievalAvailable false, both counts 0", result.classification === "UNAVAILABLE" && result.retrievalAvailable === false && result.matchedExperienceCount === 0 && result.matchedPatternCount === 0, JSON.stringify(result));
}

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(0, 0));
  check(
    "2. Zero experiences + zero patterns (memory NOT null) -> NOVEL, distinct from UNAVAILABLE",
    result.classification === "NOVEL" && result.retrievalAvailable === true,
    JSON.stringify(result)
  );
}

{
  const unavailable = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", null);
  const zeroMatch = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(0, 0));
  check("2b. UNAVAILABLE and zero-match NOVEL are never the same classification (Part 5 semantics)", unavailable.classification !== zeroMatch.classification, `${unavailable.classification} vs ${zeroMatch.classification}`);
}

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(0, 1));
  check("3. Zero experiences, 1+ patterns -> INSUFFICIENT_MEMORY (pattern on file, no concrete anecdote)", result.classification === "INSUFFICIENT_MEMORY", JSON.stringify(result));
}

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(MIN_OCCURRENCE_COUNT - 1, 0));
  check(`4. ${MIN_OCCURRENCE_COUNT - 1} experiences (below MIN_OCCURRENCE_COUNT), zero patterns -> PARTIALLY_FAMILIAR`, result.classification === "PARTIALLY_FAMILIAR", JSON.stringify(result));
}

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(1, 0));
  check("4b. Exactly 1 experience, zero patterns -> PARTIALLY_FAMILIAR (not NOVEL, not FAMILIAR)", result.classification === "PARTIALLY_FAMILIAR", JSON.stringify(result));
}

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(MIN_OCCURRENCE_COUNT, 0));
  check(`5. Exactly MIN_OCCURRENCE_COUNT (${MIN_OCCURRENCE_COUNT}) experiences, zero patterns -> FAMILIAR`, result.classification === "FAMILIAR", JSON.stringify(result));
}

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(1, 1));
  check("6. 1 experience + 1 pattern -> FAMILIAR (pattern qualification alone is enough, even with a thin experience count)", result.classification === "FAMILIAR", JSON.stringify(result));
}

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(50, 3));
  check("7. Both experiences and patterns present, well above thresholds -> FAMILIAR", result.classification === "FAMILIAR", JSON.stringify(result));
}

{
  const a = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(3, 0));
  const b = classifyNovelty("AI_SIGNAL", "BTCUSDT", memoryWith(3, 0));
  check("8. source is carried through verbatim into the assessment, never inferred", a.source === "ELVOID_PRO_ORACLE" && b.source === "AI_SIGNAL", `${a.source} / ${b.source}`);
}

{
  const a = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(3, 0));
  const b = classifyNovelty("ELVOID_PRO_ORACLE", "ETHUSDT", memoryWith(3, 0));
  check("9. symbol is carried through verbatim into the assessment, never inferred", a.symbol === "BTCUSDT" && b.symbol === "ETHUSDT", `${a.symbol} / ${b.symbol}`);
}

{
  const memory = memoryWith(2, 0);
  const snapshot = JSON.stringify(memory);
  classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memory);
  check("10. classifyNovelty does not mutate its memory input", JSON.stringify(memory) === snapshot, "memory input was mutated");
}

{
  const result = classifyNovelty("ELVOID_PRO_ORACLE", "BTCUSDT", memoryWith(0, 0));
  check("11. reasons is a non-empty, plain string array — no free-form narrative object", Array.isArray(result.reasons) && result.reasons.length > 0 && result.reasons.every((r) => typeof r === "string"), JSON.stringify(result.reasons));
}

// ---------------------------------------------------------------------------
// Static scope audit — source-level checks, not behavioral
// ---------------------------------------------------------------------------

{
  const source = readFileSync(new URL("../../lib/ai/noveltyDetection/classify.ts", import.meta.url), "utf8");
  const withoutComments = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const forbidden = ["embedding", "cosine", "vector", "fetch(", "Date.now(", "Math.random(", "Supabase", "supabase", "openai", "anthropic", ".messages.create"];
  const found = forbidden.filter((token) => withoutComments.toLowerCase().includes(token.toLowerCase()));
  check("12. classify.ts contains none of: embeddings/cosine/vector/fetch/Date.now/Math.random/Supabase/LLM-call (comments excluded)", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const qualifySource = readFileSync(new URL("../../lib/ai/decisionQualification/qualify.ts", import.meta.url), "utf8");
  check("13. decisionQualification/qualify.ts does not import noveltyDetection (novelty stays out of qualification, per Phase 8.6.1's own boundary)", !qualifySource.includes("noveltyDetection"), "qualify.ts references noveltyDetection");
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Novelty Detection fixtures passed.`);
if (failures > 0) process.exit(1);
