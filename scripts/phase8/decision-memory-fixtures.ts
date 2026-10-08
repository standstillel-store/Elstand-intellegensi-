// ---------------------------------------------------------------------------
// Phase 8.1.3 — Decision Memory fixtures (dev-only, not part of the app).
// Pure/offline — hand-built DecisionMemoryJoinedRow/FailurePatternCandidate
// fixtures exercised against retrieve.ts's pure retrieveDecisionMemory()
// only (repository.ts requires a live Learning DB and is intentionally not
// exercised here — same convention as decision-evaluation-fixtures.ts and
// failure-pattern-fixtures.ts). Static source-scan checks cover
// repository.ts's/contracts.ts's structural guarantees that cannot be
// proven by calling a pure function alone (no write ops, no re-threshold
// of Phase 8.1.2's qualification, no naming collision).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-memory-fixtures.ts
// ---------------------------------------------------------------------------

import { retrieveDecisionMemory } from "@/lib/ai/decisionMemory/retrieve";
import type { DecisionMemoryQuery, DecisionMemoryJoinedRow, DecisionExperienceRecord, DecisionEvaluation, FailurePatternCandidate, DecisionSource } from "@/lib/ai/decisionMemory/contracts";

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

function experience(overrides: Partial<DecisionExperienceRecord> = {}): DecisionExperienceRecord {
  return {
    id: "exp-fixture-001",
    source: "AI_SIGNAL",
    sourceSignalId: "sig-fixture-001",
    symbol: "BTCUSDT",
    side: "LONG",
    grade: "A",
    confidence: 0.7,
    decisionTimestamp: "2026-01-01T00:00:00.000Z",
    learningContext: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    outcome: null,
    ...overrides,
  };
}

function evaluation(overrides: Partial<DecisionEvaluation> = {}): DecisionEvaluation {
  return {
    version: 1,
    sourceSignalId: "sig-fixture-001",
    decisionQuality: "GOOD",
    marketOutcome: "NEGATIVE",
    evaluationClass: "GOOD_DECISION_BAD_OUTCOME",
    confidenceAlignment: "ALIGNED",
    riskAlignment: "NOT_APPLICABLE",
    conflictAlignment: "NOT_APPLICABLE",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: ["HIGH_RISK_PRESENT"],
    evaluatedAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

/** Builds a joined row. Pass `evaluationOverrides: null` for "no evaluation exists yet". */
function row(expOverrides: Partial<DecisionExperienceRecord> = {}, evaluationOverrides: Partial<DecisionEvaluation> | null = {}): DecisionMemoryJoinedRow {
  const exp = experience(expOverrides);
  const ev = evaluationOverrides === null ? null : evaluation({ sourceSignalId: exp.sourceSignalId, ...evaluationOverrides });
  return { experience: exp, evaluation: ev };
}

function pattern(overrides: Partial<FailurePatternCandidate> = {}): FailurePatternCandidate {
  return {
    version: 1,
    source: "AI_SIGNAL",
    symbol: "BTCUSDT",
    evidenceTag: "HIGH_RISK_PRESENT",
    dominantEvaluationClass: "BAD_DECISION_BAD_OUTCOME",
    occurrenceCount: 8,
    dominantClassShare: 0.75,
    confidence: 0.35,
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastObservedAt: "2026-02-01T00:00:00.000Z",
    computedAt: "2026-02-02T00:00:00.000Z",
    ...overrides,
  };
}

function query(overrides: Partial<DecisionMemoryQuery> & { source: DecisionSource }): DecisionMemoryQuery {
  return { ...overrides };
}

// ===========================================================================
// 1. Empty population -> empty result, all three categories present as []
// ===========================================================================
{
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL" }), [], []);
  check(
    "1. Empty joinedRows + empty patterns -> matchedExperiences/matchedEvaluations/matchedPatterns all [] (not null/undefined)",
    Array.isArray(result.matchedExperiences) && result.matchedExperiences.length === 0 && Array.isArray(result.matchedEvaluations) && result.matchedEvaluations.length === 0 && Array.isArray(result.matchedPatterns) && result.matchedPatterns.length === 0,
    JSON.stringify(result)
  );
}

// ===========================================================================
// 2. Required source isolation — mandatory even when not the only filter
// ===========================================================================
{
  const rows = [row({ sourceSignalId: "sig-a", source: "AI_SIGNAL" }), row({ sourceSignalId: "sig-b", source: "ELVOID_PRO_ORACLE" }, { sourceSignalId: "sig-b" })];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL" }), rows, []);
  check("2. Query source=AI_SIGNAL against a mixed population -> only the AI_SIGNAL row is returned", result.matchedExperiences.length === 1 && result.matchedExperiences[0].sourceSignalId === "sig-a", JSON.stringify(result.matchedExperiences));
}

// ===========================================================================
// 3. AI_SIGNAL and ELVOID_PRO_ORACLE patterns never mix
// ===========================================================================
{
  const patterns = [pattern({ source: "AI_SIGNAL", evidenceTag: "HIGH_RISK_PRESENT" }), pattern({ source: "ELVOID_PRO_ORACLE", evidenceTag: "HIGH_RISK_PRESENT" })];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL" }), [], patterns);
  check("3. Two patterns, same evidenceTag, different source -> only the AI_SIGNAL pattern is returned, never both", result.matchedPatterns.length === 1 && result.matchedPatterns[0].source === "AI_SIGNAL", JSON.stringify(result.matchedPatterns));
}

// ===========================================================================
// 4. Exact evidence-overlap ranking
// ===========================================================================
{
  const rows = [
    row({ sourceSignalId: "sig-1-overlap", decisionTimestamp: "2026-01-01T00:00:00.000Z" }, { evidence: ["HIGH_RISK_PRESENT"] }),
    row({ sourceSignalId: "sig-2-overlap", decisionTimestamp: "2026-01-02T00:00:00.000Z" }, { evidence: ["HIGH_RISK_PRESENT", "CONFLICTED_STATE_PRESENT"] }),
    row({ sourceSignalId: "sig-0-overlap", decisionTimestamp: "2026-01-03T00:00:00.000Z" }, { evidence: ["LOW_RISK_PRESENT"] }),
  ];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", evidenceTags: ["HIGH_RISK_PRESENT", "CONFLICTED_STATE_PRESENT"] }), rows, []);
  const ids = result.matchedExperiences.map((e) => e.sourceSignalId);
  check(
    "4. 2-tag query against overlap-2/overlap-1/overlap-0 rows -> ranked [sig-2-overlap, sig-1-overlap], sig-0-overlap excluded entirely (zero overlap when tags requested)",
    JSON.stringify(ids) === JSON.stringify(["sig-2-overlap", "sig-1-overlap"]),
    JSON.stringify(ids)
  );
}

// ===========================================================================
// 5. Symbol filter
// ===========================================================================
{
  const rows = [row({ sourceSignalId: "sig-btc", symbol: "BTCUSDT" }, { sourceSignalId: "sig-btc" }), row({ sourceSignalId: "sig-eth", symbol: "ETHUSDT" }, { sourceSignalId: "sig-eth" })];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", symbol: "ETHUSDT" }), rows, []);
  check("5. symbol=ETHUSDT excludes the BTCUSDT row", result.matchedExperiences.length === 1 && result.matchedExperiences[0].sourceSignalId === "sig-eth", JSON.stringify(result.matchedExperiences));
}

// ===========================================================================
// 6. Side filter
// ===========================================================================
{
  const rows = [row({ sourceSignalId: "sig-long", side: "LONG" }, { sourceSignalId: "sig-long" }), row({ sourceSignalId: "sig-short", side: "SHORT" }, { sourceSignalId: "sig-short" })];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", side: "SHORT" }), rows, []);
  check("6. side=SHORT excludes the LONG row", result.matchedExperiences.length === 1 && result.matchedExperiences[0].sourceSignalId === "sig-short", JSON.stringify(result.matchedExperiences));
}

// ===========================================================================
// 7. since boundary — inclusive at the exact timestamp, exclusive before it
// ===========================================================================
{
  const rows = [
    row({ sourceSignalId: "sig-before", decisionTimestamp: "2026-01-01T23:59:59.999Z" }, { sourceSignalId: "sig-before" }),
    row({ sourceSignalId: "sig-exact", decisionTimestamp: "2026-01-02T00:00:00.000Z" }, { sourceSignalId: "sig-exact" }),
    row({ sourceSignalId: "sig-after", decisionTimestamp: "2026-01-02T00:00:00.001Z" }, { sourceSignalId: "sig-after" }),
  ];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", since: "2026-01-02T00:00:00.000Z" }), rows, []);
  const ids = result.matchedExperiences.map((e) => e.sourceSignalId).sort();
  check("7. since=2026-01-02T00:00:00.000Z includes sig-exact and sig-after, excludes sig-before (>= boundary)", JSON.stringify(ids) === JSON.stringify(["sig-after", "sig-exact"]), JSON.stringify(ids));
}

// ===========================================================================
// 8. limit caps individual experiences/evaluations, never patterns
// ===========================================================================
{
  const rows = [
    row({ sourceSignalId: "sig-l1", decisionTimestamp: "2026-01-01T00:00:00.000Z" }, { sourceSignalId: "sig-l1" }),
    row({ sourceSignalId: "sig-l2", decisionTimestamp: "2026-01-02T00:00:00.000Z" }, { sourceSignalId: "sig-l2" }),
    row({ sourceSignalId: "sig-l3", decisionTimestamp: "2026-01-03T00:00:00.000Z" }, { sourceSignalId: "sig-l3" }),
  ];
  const patterns = [pattern({ evidenceTag: "HIGH_RISK_PRESENT" }), pattern({ evidenceTag: "MID_GRADE" })];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", limit: 2 }), rows, patterns);
  check(
    "8. limit=2 against 3 matching experiences -> exactly 2 returned (most recent 2, no tag requested so ranking falls to recency), matchedEvaluations also capped at 2, matchedPatterns NOT capped (both of the 2 patterns still returned)",
    result.matchedExperiences.length === 2 &&
      JSON.stringify(result.matchedExperiences.map((e) => e.sourceSignalId)) === JSON.stringify(["sig-l3", "sig-l2"]) &&
      result.matchedEvaluations.length === 2 &&
      result.matchedPatterns.length === 2,
    JSON.stringify(result)
  );
}

// ===========================================================================
// 9. Deterministic output — same population, reversed input order -> identical result
// ===========================================================================
{
  const rows = [
    row({ sourceSignalId: "sig-d1", decisionTimestamp: "2026-01-01T00:00:00.000Z" }, { evidence: ["HIGH_RISK_PRESENT"] }),
    row({ sourceSignalId: "sig-d2", decisionTimestamp: "2026-01-01T00:00:00.000Z" }, { evidence: ["HIGH_RISK_PRESENT"] }), // same timestamp as sig-d1 -> exercises the sourceSignalId tie-break
    row({ sourceSignalId: "sig-d3", decisionTimestamp: "2026-01-03T00:00:00.000Z" }, { evidence: ["LOW_RISK_PRESENT"] }),
  ];
  const patterns = [pattern({ evidenceTag: "HIGH_RISK_PRESENT", confidence: 0.4 }), pattern({ evidenceTag: "MID_GRADE", confidence: 0.4 })];
  const q = query({ source: "AI_SIGNAL", evidenceTags: ["HIGH_RISK_PRESENT"] });
  const resultA = retrieveDecisionMemory(q, rows, patterns);
  const resultB = retrieveDecisionMemory(q, [...rows].reverse(), [...patterns].reverse());
  check("9. Same population/query with input arrays reversed -> byte-identical output (JSON equal), including the same-timestamp tie-break resolving to the same order", JSON.stringify(resultA) === JSON.stringify(resultB), `${JSON.stringify(resultA)} vs ${JSON.stringify(resultB)}`);
}

// ===========================================================================
// 10. Input immutability
// ===========================================================================
{
  const rows = [row({ sourceSignalId: "sig-immut-1" }, { sourceSignalId: "sig-immut-1" }), row({ sourceSignalId: "sig-immut-2" }, { sourceSignalId: "sig-immut-2" })];
  const patterns = [pattern()];
  const rowsBefore = JSON.stringify(rows);
  const patternsBefore = JSON.stringify(patterns);
  retrieveDecisionMemory(query({ source: "AI_SIGNAL", limit: 1 }), rows, patterns);
  check("10. retrieveDecisionMemory does not mutate its joinedRows or patterns input arrays/objects", JSON.stringify(rows) === rowsBefore && JSON.stringify(patterns) === patternsBefore, "input was mutated");
}

// ===========================================================================
// 11. Experiences and evaluations correctly joined by sourceSignalId
// ===========================================================================
{
  const rows = [row({ sourceSignalId: "sig-join" }, { sourceSignalId: "sig-join", evaluationClass: "BAD_DECISION_BAD_OUTCOME" })];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL" }), rows, []);
  check(
    "11. matchedExperiences[0] and matchedEvaluations[0] share the same sourceSignalId, and the evaluation's actual field values pass through unmodified",
    result.matchedExperiences.length === 1 && result.matchedEvaluations.length === 1 && result.matchedExperiences[0].sourceSignalId === "sig-join" && result.matchedEvaluations[0].sourceSignalId === "sig-join" && result.matchedEvaluations[0].evaluationClass === "BAD_DECISION_BAD_OUTCOME",
    JSON.stringify(result)
  );
}

// ===========================================================================
// 12. An experience with no evaluation yet is retrievable but contributes nothing to matchedEvaluations
// ===========================================================================
{
  const rows = [row({ sourceSignalId: "sig-unresolved" }, null)];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL" }), rows, []);
  check(
    "12. A joined row with evaluation: null still appears in matchedExperiences but contributes zero rows to matchedEvaluations — never fabricated",
    result.matchedExperiences.length === 1 && result.matchedExperiences[0].sourceSignalId === "sig-unresolved" && result.matchedEvaluations.length === 0,
    JSON.stringify(result)
  );
}

// ===========================================================================
// 13. Qualified patterns returned separately — never flattened with experiences
// ===========================================================================
{
  const rows = [row({ sourceSignalId: "sig-sep" }, { sourceSignalId: "sig-sep" })];
  const patterns = [pattern()];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL" }), rows, patterns);
  const keys = Object.keys(result).sort();
  check(
    "13. DecisionMemoryResult has exactly the three closed keys [matchedEvaluations, matchedExperiences, matchedPatterns] — no merged/flattened list, and matchedPatterns entries are never DecisionExperienceRecord-shaped",
    JSON.stringify(keys) === JSON.stringify(["matchedEvaluations", "matchedExperiences", "matchedPatterns"]) && result.matchedPatterns.length === 1 && !("sourceSignalId" in result.matchedPatterns[0]),
    JSON.stringify(result)
  );
}

// ===========================================================================
// 14. Pattern qualification is never re-implemented or weakened at this layer
// ===========================================================================
{
  // A pattern below Phase 8.1.2's own MIN_OCCURRENCE_COUNT (5) would never
  // exist in failure_pattern_candidates in practice — but if one somehow
  // did (e.g. a hand-built fixture), this layer must still pass it through
  // unfiltered on occurrenceCount, proving no second threshold exists here.
  const belowThreshold = pattern({ occurrenceCount: 1, evidenceTag: "MID_GRADE" });
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL" }), [], [belowThreshold]);
  check("14a. retrieveDecisionMemory applies no occurrenceCount/confidence threshold of its own — a low-occurrenceCount pattern passes through exactly as given, unmodified", result.matchedPatterns.length === 1 && result.matchedPatterns[0].occurrenceCount === 1 && JSON.stringify(result.matchedPatterns[0]) === JSON.stringify(belowThreshold), JSON.stringify(result.matchedPatterns));

  const repoSource = await (await import("node:fs/promises")).readFile(new URL("../../lib/ai/decisionMemory/repository.ts", import.meta.url), "utf-8");
  const retrieveSource = await (await import("node:fs/promises")).readFile(new URL("../../lib/ai/decisionMemory/retrieve.ts", import.meta.url), "utf-8");
  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
  const forbiddenThresholdTerms = ["MIN_OCCURRENCE_COUNT", "CONFIDENCE_SAMPLE_CAP", "MAX_CONFIDENCE", "occurrenceCount >=", "occurrenceCount <", "occurrenceCount >", "confidence >=", "confidence <"];
  const offenders = forbiddenThresholdTerms.filter((term) => stripComments(repoSource).includes(term) || stripComments(retrieveSource).includes(term));
  check("14b. Neither repository.ts nor retrieve.ts's actual code (comments excluded) references any Phase 8.1.2 threshold constant/comparison — that qualification logic lives solely in lib/ai/failurePatterns/detect.ts", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 15. No naming collision with lib/ai/cognitive/memory.ts (CognitiveWorkingMemory)
// ===========================================================================
{
  const files = ["../../lib/ai/decisionMemory/contracts.ts", "../../lib/ai/decisionMemory/retrieve.ts", "../../lib/ai/decisionMemory/repository.ts"];
  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
  let allClean = true;
  const offenders: string[] = [];
  const forbiddenIdentifiers = [/\bCognitiveWorkingMemory\b/, /\bCognitiveMemoryEntry\b/, /\bcreateWorkingMemory\b/, /\bappendMemoryEntry\b/, /(?<!Decision)(?<!Cognitive)(?<!Working)(?<!\w)Memory\b/];
  for (const relativePath of files) {
    const rawSource = await (await import("node:fs/promises")).readFile(new URL(relativePath, import.meta.url), "utf-8");
    const codeOnly = stripComments(rawSource);
    for (const pattern of forbiddenIdentifiers) {
      if (pattern.test(codeOnly)) {
        allClean = false;
        offenders.push(`${relativePath} matches ${pattern}`);
      }
    }
    // No import from lib/ai/cognitive/memory.ts anywhere in Decision Memory.
    if (codeOnly.includes("cognitive/memory")) {
      allClean = false;
      offenders.push(`${relativePath} imports from lib/ai/cognitive/memory.ts`);
    }
  }
  check("15. lib/ai/decisionMemory/* never imports from or re-declares any lib/ai/cognitive/memory.ts identifier, and no bare (non-DecisionMemory-prefixed) *Memory identifier appears in its actual code (comments excluded)", allClean, offenders.join("; "));
}

// ===========================================================================
// 16. No write operation anywhere in repository.ts (static scan)
// ===========================================================================
{
  const repoSource = await (await import("node:fs/promises")).readFile(new URL("../../lib/ai/decisionMemory/repository.ts", import.meta.url), "utf-8");
  const codeOnly = repoSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  const forbiddenWriteTerms = [".insert(", ".upsert(", ".update(", ".delete(", ".rpc("];
  const offenders = forbiddenWriteTerms.filter((term) => codeOnly.includes(term));
  check("16. lib/ai/decisionMemory/repository.ts's actual code (comments excluded) contains no .insert(/.upsert(/.update(/.delete(/.rpc( call — read-only by construction, zero write path", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 17. Purity / source-boundary of retrieve.ts (static scan)
// ===========================================================================
{
  const retrieveSource = await (await import("node:fs/promises")).readFile(new URL("../../lib/ai/decisionMemory/retrieve.ts", import.meta.url), "utf-8");
  const codeOnly = retrieveSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  const forbidden = ["fetch(", "Date.now(", "Math.random(", "Supabase", "supabase", 'from "@/lib/ai/learning', 'from "@/lib/ai/oracle', 'from "@/lib/elvoid', 'from "@/lib/ai/cognitive', "Binance", "binance"];
  const offenders = forbidden.filter((term) => codeOnly.includes(term));
  check("17. lib/ai/decisionMemory/retrieve.ts's actual code (comments excluded) contains none of: fetch/Date.now/Math.random/Supabase/Learning-DB-or-Oracle-or-elvoid-or-cognitive imports/Binance — pure, DB-free, network-free, non-wall-clock-dependent", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 18. Combined symbol + side + evidence + since filters compose with AND semantics
// ===========================================================================
{
  const rows = [
    row({ sourceSignalId: "sig-match", symbol: "BTCUSDT", side: "LONG", decisionTimestamp: "2026-03-01T00:00:00.000Z" }, { sourceSignalId: "sig-match", evidence: ["HIGH_RISK_PRESENT"] }),
    row({ sourceSignalId: "sig-wrong-symbol", symbol: "ETHUSDT", side: "LONG", decisionTimestamp: "2026-03-01T00:00:00.000Z" }, { sourceSignalId: "sig-wrong-symbol", evidence: ["HIGH_RISK_PRESENT"] }),
    row({ sourceSignalId: "sig-wrong-side", symbol: "BTCUSDT", side: "SHORT", decisionTimestamp: "2026-03-01T00:00:00.000Z" }, { sourceSignalId: "sig-wrong-side", evidence: ["HIGH_RISK_PRESENT"] }),
    row({ sourceSignalId: "sig-too-old", symbol: "BTCUSDT", side: "LONG", decisionTimestamp: "2026-02-01T00:00:00.000Z" }, { sourceSignalId: "sig-too-old", evidence: ["HIGH_RISK_PRESENT"] }),
    row({ sourceSignalId: "sig-no-overlap", symbol: "BTCUSDT", side: "LONG", decisionTimestamp: "2026-03-01T00:00:00.000Z" }, { sourceSignalId: "sig-no-overlap", evidence: ["LOW_RISK_PRESENT"] }),
  ];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", symbol: "BTCUSDT", side: "LONG", since: "2026-02-15T00:00:00.000Z", evidenceTags: ["HIGH_RISK_PRESENT"] }), rows, []);
  check("18. All five filters combined (source+symbol+side+since+evidenceTags) exclude every non-matching row, leaving exactly sig-match", result.matchedExperiences.length === 1 && result.matchedExperiences[0].sourceSignalId === "sig-match", JSON.stringify(result.matchedExperiences));
}

// ===========================================================================
// 19. limit=0 -> empty experiences/evaluations, patterns still unaffected
// ===========================================================================
{
  const rows = [row({ sourceSignalId: "sig-z1" }, { sourceSignalId: "sig-z1" })];
  const patterns = [pattern()];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", limit: 0 }), rows, patterns);
  check("19. limit=0 -> matchedExperiences/matchedEvaluations both empty, matchedPatterns still returned (limit never applies to patterns)", result.matchedExperiences.length === 0 && result.matchedEvaluations.length === 0 && result.matchedPatterns.length === 1, JSON.stringify(result));
}

// ===========================================================================
// 20 (Phase 8.3.0.1 §7, Scenario F). Symbol isolation of matchedPatterns —
// a BTC query receives only BTC's pattern, a DOGE query receives only
// DOGE's pattern, never the other's, even though both share source and
// evidenceTag. Also re-confirms matchedExperiences' own (pre-existing,
// unmodified) symbol filter still works side-by-side with the new
// pattern filter in the same call.
// ===========================================================================
{
  const patterns = [pattern({ symbol: "BTCUSDT", evidenceTag: "HIGH_RISK_PRESENT" }), pattern({ symbol: "DOGEUSDT", evidenceTag: "HIGH_RISK_PRESENT" })];
  const rows = [row({ sourceSignalId: "sig-btc-mem", symbol: "BTCUSDT" }, { sourceSignalId: "sig-btc-mem" }), row({ sourceSignalId: "sig-doge-mem", symbol: "DOGEUSDT" }, { sourceSignalId: "sig-doge-mem" })];

  const btcResult = retrieveDecisionMemory(query({ source: "AI_SIGNAL", symbol: "BTCUSDT" }), rows, patterns);
  const dogeResult = retrieveDecisionMemory(query({ source: "AI_SIGNAL", symbol: "DOGEUSDT" }), rows, patterns);

  check(
    "20a. matchedPatterns: a BTCUSDT-scoped query returns ONLY the BTCUSDT pattern, never the DOGEUSDT one, though both share source+evidenceTag",
    btcResult.matchedPatterns.length === 1 && btcResult.matchedPatterns[0].symbol === "BTCUSDT",
    JSON.stringify(btcResult.matchedPatterns)
  );
  check(
    "20b. matchedPatterns: a DOGEUSDT-scoped query returns ONLY the DOGEUSDT pattern, never the BTCUSDT one",
    dogeResult.matchedPatterns.length === 1 && dogeResult.matchedPatterns[0].symbol === "DOGEUSDT",
    JSON.stringify(dogeResult.matchedPatterns)
  );
  check(
    "20c. matchedExperiences' own pre-existing symbol filter is unaffected by the new pattern filter — BTCUSDT query still returns only sig-btc-mem, DOGEUSDT query still returns only sig-doge-mem",
    btcResult.matchedExperiences.length === 1 && btcResult.matchedExperiences[0].sourceSignalId === "sig-btc-mem" && dogeResult.matchedExperiences.length === 1 && dogeResult.matchedExperiences[0].sourceSignalId === "sig-doge-mem",
    `btc=${JSON.stringify(btcResult.matchedExperiences)} doge=${JSON.stringify(dogeResult.matchedExperiences)}`
  );

  // Unscoped query (no query.symbol) — still a legitimate, explicit
  // "everything for this source" read (e.g. a future dashboard), not a
  // silent contamination path: it must be requested by omission, never
  // reachable by accident from a real per-symbol autonomous cycle.
  const unscopedResult = retrieveDecisionMemory(query({ source: "AI_SIGNAL" }), rows, patterns);
  check("20d. Omitting query.symbol entirely is still a valid explicit unscoped read — both patterns returned, matching the experience filter's own long-standing optional-symbol convention", unscopedResult.matchedPatterns.length === 2, JSON.stringify(unscopedResult.matchedPatterns));
}

// ===========================================================================
// 21-26 (root-cause fix regression). matchedPatterns must now honor
// `since`, checked against `lastObservedAt` — the bug this block exists
// to pin down: before the fix, every one of 21/22/23/24 below returned
// the SAME (unfiltered) matchedPatterns regardless of `since`.
// ===========================================================================

// 21. A pattern whose lastObservedAt is within the since window -> still matches.
{
  const fresh = pattern({ evidenceTag: "HIGH_GRADE", lastObservedAt: "2026-10-02T00:00:00.000Z" });
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", since: "2026-09-08T00:00:00.000Z" }), [], [fresh]);
  check("21. Fresh pattern (lastObservedAt 2026-10-02) with since=2026-09-08 -> still matched", result.matchedPatterns.length === 1 && result.matchedPatterns[0].evidenceTag === "HIGH_GRADE", JSON.stringify(result.matchedPatterns));
}

// 22. A pattern whose lastObservedAt is before the since window -> ignored (the core bug fix).
{
  const stale = pattern({ evidenceTag: "HIGH_GRADE", lastObservedAt: "2026-07-01T00:00:00.000Z" });
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", since: "2026-09-08T00:00:00.000Z" }), [], [stale]);
  check("22. Stale pattern (lastObservedAt 2026-07-01, well before since=2026-09-08) -> excluded from matchedPatterns (THE bug this fix targets)", result.matchedPatterns.length === 0, JSON.stringify(result.matchedPatterns));
}

// 23. Mixed fresh + stale patterns -> only the fresh one matches.
{
  const freshPattern = pattern({ evidenceTag: "HIGH_GRADE", lastObservedAt: "2026-10-02T00:00:00.000Z" });
  const stalePattern = pattern({ evidenceTag: "MODERATE_RISK_PRESENT", lastObservedAt: "2026-06-15T00:00:00.000Z" });
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", since: "2026-09-08T00:00:00.000Z" }), [], [freshPattern, stalePattern]);
  check("23. Mixed fresh/stale patterns -> only HIGH_GRADE (fresh) is returned, MODERATE_RISK_PRESENT (stale) is not", result.matchedPatterns.length === 1 && result.matchedPatterns[0].evidenceTag === "HIGH_GRADE", JSON.stringify(result.matchedPatterns));
}

// 24. Every candidate pattern stale -> matchedPatterns empty, matchedExperiences/matchedEvaluations unaffected.
{
  const stalePatterns = [pattern({ evidenceTag: "HIGH_GRADE", lastObservedAt: "2026-05-01T00:00:00.000Z" }), pattern({ evidenceTag: "MODERATE_RISK_PRESENT", lastObservedAt: "2026-06-01T00:00:00.000Z" })];
  const freshRow = row({ sourceSignalId: "sig-24-fresh", decisionTimestamp: "2026-10-02T00:00:00.000Z" }, { sourceSignalId: "sig-24-fresh" });
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", since: "2026-09-08T00:00:00.000Z" }), [freshRow], stalePatterns);
  check(
    "24. All candidate patterns stale -> matchedPatterns === [] while a fresh experience in the SAME call still passes its own (pre-existing) since filter unaffected",
    result.matchedPatterns.length === 0 && result.matchedExperiences.length === 1 && result.matchedExperiences[0].sourceSignalId === "sig-24-fresh",
    JSON.stringify(result)
  );
}

// 25. Existing evaluation-memory (matchedExperiences/matchedEvaluations) since-filtering behavior is byte-identical to before this fix — re-run of fixture 7's exact scenario, now also carrying a pattern array, to prove the new pattern filter doesn't alter experience/evaluation filtering at all.
{
  const rows = [
    row({ sourceSignalId: "sig-before", decisionTimestamp: "2026-01-01T23:59:59.999Z" }, { sourceSignalId: "sig-before" }),
    row({ sourceSignalId: "sig-exact", decisionTimestamp: "2026-01-02T00:00:00.000Z" }, { sourceSignalId: "sig-exact" }),
    row({ sourceSignalId: "sig-after", decisionTimestamp: "2026-01-02T00:00:00.001Z" }, { sourceSignalId: "sig-after" }),
  ];
  const result = retrieveDecisionMemory(query({ source: "AI_SIGNAL", since: "2026-01-02T00:00:00.000Z" }), rows, [pattern({ lastObservedAt: "2026-01-02T00:00:00.000Z" })]);
  const ids = result.matchedExperiences.map((e) => e.sourceSignalId).sort();
  check(
    "25. matchedExperiences since-boundary behavior (inclusive >=) is unchanged from before this fix, even with a pattern array now present in the same call",
    JSON.stringify(ids) === JSON.stringify(["sig-after", "sig-exact"]) && result.matchedEvaluations.length === 2 && result.matchedPatterns.length === 1,
    JSON.stringify(result)
  );
}

// 26. Reproduction of the audited SUI/BTC production shape — real field values from the 2026-10-07 failure_pattern_candidates audit, with a 30-day since cutoff (NEGATIVE_MEMORY_FRESHNESS_WINDOW_DAYS, mirroring orchestrator.ts's own negativeMemorySince computation) evaluated from two different "now" points. This only exercises retrieve.ts's matchedPatterns output — it never calls qualify.ts/decide.ts and asserts no CONFLICTED/REJECT/WAIT/EXECUTE outcome, per instruction #5 (fix the stale-evidence source, don't force a decision outcome).
{
  const suiPatterns = [
    pattern({ source: "ELVOID_PRO_ORACLE", symbol: "SUI", evidenceTag: "HIGH_GRADE", occurrenceCount: 5, dominantClassShare: 1, firstObservedAt: "2026-09-02T21:15:50.207Z", lastObservedAt: "2026-10-02T19:57:55.237Z" }),
    pattern({ source: "ELVOID_PRO_ORACLE", symbol: "SUI", evidenceTag: "MODERATE_RISK_PRESENT", occurrenceCount: 5, dominantClassShare: 1, firstObservedAt: "2026-09-02T21:15:50.207Z", lastObservedAt: "2026-10-02T19:57:55.237Z" }),
  ];
  const btcPattern = pattern({ source: "ELVOID_PRO_ORACLE", symbol: "BTC", evidenceTag: "HIGH_GRADE", occurrenceCount: 5, dominantClassShare: 1, firstObservedAt: "2026-08-31T10:13:09.152Z", lastObservedAt: "2026-10-06T16:10:41.094Z" });

  // 26a. "now" = shortly after the audit snapshot (2026-10-08) -> both patterns'
  // lastObservedAt are still within the last 30 days -> still correctly matched.
  // This is the honest, expected result: the fix removes the "never expires"
  // bug, it does not fabricate staleness that isn't there yet.
  const sinceNearNow = "2026-09-08T00:00:00.000Z"; // 2026-10-08 minus 30 days
  const sui26a = retrieveDecisionMemory(query({ source: "ELVOID_PRO_ORACLE", symbol: "SUI", since: sinceNearNow }), [], suiPatterns);
  const btc26a = retrieveDecisionMemory(query({ source: "ELVOID_PRO_ORACLE", symbol: "BTC", since: sinceNearNow }), [], btcPattern ? [btcPattern] : []);
  check("26a. SUI/BTC patterns from the real 2026-10-07 audit snapshot are still within a 30-day window measured from shortly after the snapshot -> correctly still matched (fix does not fabricate staleness)", sui26a.matchedPatterns.length === 2 && btc26a.matchedPatterns.length === 1, JSON.stringify({ sui: sui26a.matchedPatterns, btc: btc26a.matchedPatterns }));

  // 26b. "now" = 45 days after the audit snapshot, well past
  // NEGATIVE_MEMORY_FRESHNESS_WINDOW_DAYS (30) with no new occurrences in
  // between -> both symbols' patterns correctly age out. Before this fix,
  // this case was IMPOSSIBLE — matchedPatterns would have stayed non-empty
  // forever regardless of how much time passed.
  const since45DaysLater = "2026-11-22T00:00:00.000Z"; // 2026-10-07 audit lastObservedAt + 45 days - 30 days window
  const sui26b = retrieveDecisionMemory(query({ source: "ELVOID_PRO_ORACLE", symbol: "SUI", since: since45DaysLater }), [], suiPatterns);
  const btc26b = retrieveDecisionMemory(query({ source: "ELVOID_PRO_ORACLE", symbol: "BTC", since: since45DaysLater }), [], btcPattern ? [btcPattern] : []);
  check("26b. Same SUI/BTC patterns, evaluated from 'now' = 45 days after their lastObservedAt with no new occurrences -> correctly age out to matchedPatterns=[] (impossible before this fix)", sui26b.matchedPatterns.length === 0 && btc26b.matchedPatterns.length === 0, JSON.stringify({ sui: sui26b.matchedPatterns, btc: btc26b.matchedPatterns }));
}

console.log(failures === 0 ? `\n✓ ${passed}/${passed} Decision Memory fixtures passed.` : `\n${failures} Decision Memory fixture(s) FAILED (${passed} passed).`);
if (failures > 0) process.exitCode = 1;
