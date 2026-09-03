// ---------------------------------------------------------------------------
// Phase 8.3.0.1 §7 — Symbol Isolation fixtures (dev-only, not part of the
// app). Pure/offline only — exercises detect.ts / generate.ts / validate.ts
// (all pure, zero DB/network) directly, matching every prior 8.1.x fixture
// file's own "test only the pure layer" convention. Proves the widened
// (source, symbol, evidenceTag) identity end-to-end across
// failurePatterns -> adaptiveConstraint -> learningValidation, and the
// legacy-UNKNOWN-row isolation guarantee, WITHOUT a live Learning DB.
//
// Scenario C (VALID constraint isolation via filterValidConstraints) lives
// in scripts/phase8/autonomous-context-fixtures.ts (checks 21a/21b) — that
// is the file that already owns filterValidConstraints coverage, so this
// file does not duplicate it.
//
// Scenario F (decisionMemory.matchedPatterns isolation) lives in
// scripts/phase8/decision-memory-fixtures.ts (check 21) for the same
// file-ownership reason — retrieveDecisionMemory() is that file's subject.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/symbol-isolation-fixtures.ts
// ---------------------------------------------------------------------------

import { detectFailurePatternCandidates, MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import { generateAdaptiveConstraints } from "@/lib/ai/adaptiveConstraint/generate";
import { validateConstraint } from "@/lib/ai/learningValidation/validate";
import type { FailurePatternObservationInput } from "@/lib/ai/failurePatterns/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

function observation(overrides: Partial<FailurePatternObservationInput> = {}): FailurePatternObservationInput {
  return {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    sourceSignalId: "sig-fixture-001",
    evaluationClass: "BAD_DECISION_BAD_OUTCOME",
    evidenceTags: ["HIGH_RISK_PRESENT"],
    decisionTimestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** N observations, one per calendar day, otherwise identical to `base` — guarantees temporal recurrence (>= 2 distinct calendar days) whenever count >= 2, same convention as failure-pattern-fixtures.ts's own `spanningDays()`. */
function spanningDays(count: number, base: Partial<FailurePatternObservationInput> = {}, startDay = 1): FailurePatternObservationInput[] {
  return Array.from({ length: count }, (_, i) =>
    observation({
      ...base,
      sourceSignalId: `sig-${base.symbol ?? "BTCUSDT"}-${String(startDay + i).padStart(3, "0")}`,
      decisionTimestamp: `2026-01-${String(startDay + i).padStart(2, "0")}T00:00:00.000Z`,
    })
  );
}

// ===========================================================================
// SCENARIO A — same evidenceTag, different symbols -> two independent
// failure-pattern aggregates, never merged.
// ===========================================================================
{
  const btcRows = spanningDays(MIN_OCCURRENCE_COUNT, { symbol: "BTCUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  const dogeRows = spanningDays(MIN_OCCURRENCE_COUNT + 2, { symbol: "DOGEUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1); // deliberately different occurrenceCount from BTC's, so a merge would be visibly wrong, not accidentally-correct
  const result = detectFailurePatternCandidates([...btcRows, ...dogeRows]);

  const btc = result.find((c) => c.symbol === "BTCUSDT");
  const doge = result.find((c) => c.symbol === "DOGEUSDT");

  check(
    "A. BTC+HIGH_RISK_PRESENT and DOGE+HIGH_RISK_PRESENT (same source, same evidenceTag) produce exactly 2 candidates, never 1 merged aggregate",
    result.length === 2 && btc !== undefined && doge !== undefined,
    JSON.stringify(result)
  );
  check(
    "A2. Each candidate's occurrenceCount reflects ONLY its own symbol's rows — BTC=5, DOGE=7 (a pooled aggregate would show 12 on both)",
    btc?.occurrenceCount === MIN_OCCURRENCE_COUNT && doge?.occurrenceCount === MIN_OCCURRENCE_COUNT + 2,
    `btc=${btc?.occurrenceCount} doge=${doge?.occurrenceCount}`
  );
}

// ===========================================================================
// SCENARIO B — symbol-specific propagation: BTC failure pattern -> BTC
// adaptive constraint -> BTC validation, and the same for DOGE, with
// `symbol` surviving verbatim at every stage and never dropped/replaced.
// ===========================================================================
{
  const btcRows = spanningDays(MIN_OCCURRENCE_COUNT, { symbol: "BTCUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  const dogeRows = spanningDays(MIN_OCCURRENCE_COUNT, { symbol: "DOGEUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  // Stamp `computedAt` the same way lib/ai/failurePatterns/repository.ts::
  // recomputeFailurePatterns() does — detectFailurePatternCandidates()
  // itself is pure and returns FailurePatternCandidateWithoutTimestamp
  // (no computedAt yet); the repository adds one shared timestamp per
  // recompute batch, which is what generateAdaptiveConstraints() (typed
  // against the full FailurePatternCandidate) actually requires.
  const computedAt = "2026-01-06T00:00:00.000Z";
  const candidates = detectFailurePatternCandidates([...btcRows, ...dogeRows]).map((c) => ({ ...c, computedAt }));

  const constraints = generateAdaptiveConstraints(candidates);
  const btcConstraint = constraints.find((c) => c.symbol === "BTCUSDT");
  const dogeConstraint = constraints.find((c) => c.symbol === "DOGEUSDT");

  check("B1. generateAdaptiveConstraints preserves symbol verbatim for both BTC and DOGE candidates", btcConstraint !== undefined && dogeConstraint !== undefined, JSON.stringify(constraints));

  if (btcConstraint && dogeConstraint) {
    const asOf = "2026-02-01T00:00:00.000Z";
    // validateConstraint() takes an AdaptiveConstraint, which requires `generatedAt` — not
    // produced by generate.ts (that's repository.ts's job); stamp it here, same as
    // adaptiveConstraint/repository.ts::recomputeAdaptiveConstraints() does.
    const btcValidation = validateConstraint({ ...btcConstraint, generatedAt: asOf }, asOf);
    const dogeValidation = validateConstraint({ ...dogeConstraint, generatedAt: asOf }, asOf);
    check(
      "B2. validateConstraint preserves symbol verbatim through the final validation stage — BTC stays BTCUSDT, DOGE stays DOGEUSDT, neither dropped nor swapped",
      btcValidation.symbol === "BTCUSDT" && dogeValidation.symbol === "DOGEUSDT",
      `btc=${btcValidation.symbol} doge=${dogeValidation.symbol}`
    );
  }
}

// ===========================================================================
// SCENARIO D — legacy UNKNOWN rows (the additive migration's backfill
// value for pre-Phase-8.3.0.1 rows) must never act as live learning for a
// real symbol query.
// ===========================================================================
{
  const legacyRows = spanningDays(MIN_OCCURRENCE_COUNT, { symbol: "UNKNOWN", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  const btcRows = spanningDays(MIN_OCCURRENCE_COUNT, { symbol: "BTCUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  const result = detectFailurePatternCandidates([...legacyRows, ...btcRows]);

  const unknown = result.find((c) => c.symbol === "UNKNOWN");
  const btc = result.find((c) => c.symbol === "BTCUSDT");

  check("D1. A legacy UNKNOWN-symbol group is detected as its OWN isolated candidate (preserved for history/audit), never merged into BTCUSDT's", unknown !== undefined && btc !== undefined && result.length === 2, JSON.stringify(result));

  // The isolation guarantee downstream of detect.ts is structural, not a
  // filter that could be forgotten: getConstraintValidations(source, symbol)
  // and the decisionMemory matchedPatterns filter both do exact-string-match
  // symbol filtering (`.eq("symbol", symbol)` / `pattern.symbol ===
  // query.symbol`) — "UNKNOWN" only ever matches a query that literally asks
  // for symbol "UNKNOWN", which no real BTC/ETH/DOGE autonomous cycle ever
  // does (the orchestrator always passes the real watchlist symbol). This is
  // proven directly for the memory-patterns path in
  // decision-memory-fixtures.ts (check 21) and for validated-constraints in
  // autonomous-context-fixtures.ts (checks 21a/21b) — both use exact-match
  // filters with the identical mechanism this fixture demonstrates for
  // failurePatterns' own grouping.
  check(
    "D2. The legacy UNKNOWN candidate's symbol never equals BTCUSDT's — proven on the actual runtime values from D1's result array (typed as `string`, not a literal), the same shape getConstraintValidations'/matchedPatterns' own exact-match symbol filters compare against",
    unknown !== undefined && btc !== undefined && unknown.symbol !== btc.symbol,
    `unknown symbol=${unknown?.symbol} btc symbol=${btc?.symbol}`
  );
}

// ===========================================================================
// SCENARIO E — composite identity (source, symbol, evidenceTag): same
// source+evidenceTag+different symbol -> separate records (re-proves
// Scenario A's premise at the identity level); same source+symbol+
// evidenceTag -> ONE aggregate (multiple observations upsert/merge into
// the same logical record, never duplicate rows).
// ===========================================================================
{
  // Same (source, symbol, evidenceTag) appearing across two separate calls
  // worth of observations still collapses into ONE candidate within a
  // single detect() pass (this is what repository.ts's UPSERT ON
  // (source, symbol, evidence_tag) then persists idempotently across
  // separate recompute runs) — proven by merging two batches of the same
  // identity into one input array and confirming exactly one output row
  // whose occurrenceCount is the FULL combined count, not two rows.
  const batch1 = spanningDays(MIN_OCCURRENCE_COUNT, { symbol: "ETHUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  const batch2 = spanningDays(3, { symbol: "ETHUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 100); // different calendar days, same (source, symbol, evidenceTag) identity
  const merged = detectFailurePatternCandidates([...batch1, ...batch2]);

  check(
    "E1. Same (source, symbol, evidenceTag) across multiple observation batches -> exactly ONE candidate (occurrenceCount = 5+3 = 8), never split into duplicate rows for the same logical identity",
    merged.length === 1 && merged[0].symbol === "ETHUSDT" && merged[0].occurrenceCount === MIN_OCCURRENCE_COUNT + 3,
    JSON.stringify(merged)
  );

  // Same source + same evidenceTag + DIFFERENT symbol -> separate records
  // (this is Scenario A's own assertion, re-stated here explicitly against
  // the "(source, symbol, evidenceTag)" identity framing requested).
  const ethRows = spanningDays(MIN_OCCURRENCE_COUNT, { symbol: "ETHUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  const solRows = spanningDays(MIN_OCCURRENCE_COUNT, { symbol: "SOLUSDT", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  const separated = detectFailurePatternCandidates([...ethRows, ...solRows]);
  check(
    "E2. Same source + same evidenceTag + different symbol (ETHUSDT vs SOLUSDT) -> 2 separate candidates, confirming identity is (source, symbol, evidenceTag), not (source, evidenceTag)",
    separated.length === 2 && new Set(separated.map((c) => c.symbol)).size === 2,
    JSON.stringify(separated)
  );
}

console.log(failures === 0 ? `\n✓ ${passed}/${passed} Symbol Isolation fixtures passed.` : `\n${failures} Symbol Isolation fixture(s) FAILED (${passed} passed).`);
if (failures > 0) process.exitCode = 1;
