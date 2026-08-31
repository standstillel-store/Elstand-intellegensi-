// ---------------------------------------------------------------------------
// Phase 8.1.2 — Failure Pattern Detection fixtures (dev-only, not part of
// the app). Pure/offline — hand-built FailurePatternObservationInput
// fixtures exercised against detect.ts's pure aggregator only (repository.ts
// requires a live Learning DB and is intentionally not exercised here,
// matching decision-evaluation-fixtures.ts's own convention of testing
// only the pure layer).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/failure-pattern-fixtures.ts
// ---------------------------------------------------------------------------

import { detectFailurePatternCandidates, MIN_OCCURRENCE_COUNT, CONFIDENCE_SAMPLE_CAP, MAX_CONFIDENCE } from "@/lib/ai/failurePatterns/detect";
import type { FailurePatternObservationInput, FailurePatternEvaluationClass } from "@/lib/ai/failurePatterns/contracts";

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

function observation(overrides: Partial<FailurePatternObservationInput> = {}): FailurePatternObservationInput {
  return {
    source: "AI_SIGNAL",
    sourceSignalId: "sig-fixture-001",
    evaluationClass: "BAD_DECISION_BAD_OUTCOME",
    evidenceTags: ["HIGH_RISK_PRESENT"],
    decisionTimestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** N observations, one per calendar day starting at `startDay` (2026-01-<startDay>), all otherwise identical to `base`. Guarantees temporal recurrence (each row a distinct calendar day) whenever count >= 2. */
function spanningDays(count: number, base: Partial<FailurePatternObservationInput> = {}, startDay = 1): FailurePatternObservationInput[] {
  return Array.from({ length: count }, (_, i) =>
    observation({
      ...base,
      sourceSignalId: `sig-fixture-${String(startDay + i).padStart(3, "0")}`,
      decisionTimestamp: `2026-01-${String(startDay + i).padStart(2, "0")}T00:00:00.000Z`,
    })
  );
}

/** N observations, all on the SAME calendar day, otherwise identical to `base`. Used to prove same-day clusters are excluded regardless of count. */
function sameDay(count: number, base: Partial<FailurePatternObservationInput> = {}): FailurePatternObservationInput[] {
  return Array.from({ length: count }, (_, i) =>
    observation({
      ...base,
      sourceSignalId: `sig-fixture-sd-${i}`,
      decisionTimestamp: `2026-02-01T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
    })
  );
}

function expectedConfidence(occurrenceCount: number): number {
  const sampled = Math.min(occurrenceCount, CONFIDENCE_SAMPLE_CAP);
  return Math.round((sampled / CONFIDENCE_SAMPLE_CAP) * MAX_CONFIDENCE * 10000) / 10000;
}

// ===========================================================================
// 1. Fewer than MIN_OCCURRENCE_COUNT (5) is excluded
// ===========================================================================
{
  const rows = spanningDays(MIN_OCCURRENCE_COUNT - 1);
  const result = detectFailurePatternCandidates(rows);
  check(`1. ${MIN_OCCURRENCE_COUNT - 1} qualifying rows (< ${MIN_OCCURRENCE_COUNT}) -> excluded entirely`, result.length === 0, JSON.stringify(result));
}

// ===========================================================================
// 2. Exactly MIN_OCCURRENCE_COUNT (5) is accepted
// ===========================================================================
{
  const rows = spanningDays(MIN_OCCURRENCE_COUNT);
  const result = detectFailurePatternCandidates(rows);
  check(
    `2. Exactly ${MIN_OCCURRENCE_COUNT} qualifying rows -> accepted with occurrenceCount === ${MIN_OCCURRENCE_COUNT}`,
    result.length === 1 && result[0].occurrenceCount === MIN_OCCURRENCE_COUNT,
    JSON.stringify(result)
  );
}

// ===========================================================================
// 3. 30+ samples -> confidence capped at MAX_CONFIDENCE (0.7)
// ===========================================================================
{
  const rows = spanningDays(35);
  const result = detectFailurePatternCandidates(rows);
  check(`3. 35 qualifying rows -> confidence capped at exactly ${MAX_CONFIDENCE}`, result.length === 1 && result[0].confidence === MAX_CONFIDENCE, JSON.stringify(result));
}
{
  // Also confirm sub-cap scaling is linear and NOT already at the cap.
  const rows = spanningDays(15);
  const result = detectFailurePatternCandidates(rows);
  check("3b. 15 qualifying rows -> confidence scales below the cap (not clamped early)", result.length === 1 && result[0].confidence === expectedConfidence(15) && result[0].confidence < MAX_CONFIDENCE, JSON.stringify(result));
}

// ===========================================================================
// 4. Sources are never merged into the same group
// ===========================================================================
{
  const aiSignalRows = spanningDays(MIN_OCCURRENCE_COUNT, { source: "AI_SIGNAL" }, 1);
  const oracleRows = spanningDays(MIN_OCCURRENCE_COUNT - 3, { source: "ELVOID_PRO_ORACLE" }, 1); // 2 rows — below threshold on its own
  const result = detectFailurePatternCandidates([...aiSignalRows, ...oracleRows]);
  const aiCandidate = result.find((c) => c.source === "AI_SIGNAL");
  const oracleCandidate = result.find((c) => c.source === "ELVOID_PRO_ORACLE");
  check(
    "4. AI_SIGNAL (5 rows) and ELVOID_PRO_ORACLE (2 rows) sharing the same evidence tag are never summed into one group — only AI_SIGNAL qualifies, with occurrenceCount 5, not 7",
    result.length === 1 && aiCandidate !== undefined && aiCandidate.occurrenceCount === MIN_OCCURRENCE_COUNT && oracleCandidate === undefined,
    JSON.stringify(result)
  );
}

// ===========================================================================
// 5. Same-day cluster excluded regardless of occurrence count
// ===========================================================================
{
  const rows = sameDay(10);
  const result = detectFailurePatternCandidates(rows);
  check("5. 10 qualifying rows, all on the same calendar day -> excluded (no temporal recurrence)", result.length === 0, JSON.stringify(result));
}

// ===========================================================================
// 6. Multi-day recurrence accepted (>= 2 distinct calendar days)
// ===========================================================================
{
  // 5 rows, only 2 distinct calendar days (3 rows on day 1, 2 rows on day 2) — still qualifies; the rule is >=2 distinct days, not "every row on its own day".
  const rows = [
    observation({ sourceSignalId: "sig-md-1", decisionTimestamp: "2026-03-01T01:00:00.000Z" }),
    observation({ sourceSignalId: "sig-md-2", decisionTimestamp: "2026-03-01T02:00:00.000Z" }),
    observation({ sourceSignalId: "sig-md-3", decisionTimestamp: "2026-03-01T03:00:00.000Z" }),
    observation({ sourceSignalId: "sig-md-4", decisionTimestamp: "2026-03-02T01:00:00.000Z" }),
    observation({ sourceSignalId: "sig-md-5", decisionTimestamp: "2026-03-02T02:00:00.000Z" }),
  ];
  const result = detectFailurePatternCandidates(rows);
  check(
    "6. 5 rows spanning exactly 2 distinct calendar days -> accepted, firstObservedAt/lastObservedAt correct",
    result.length === 1 && result[0].occurrenceCount === 5 && result[0].firstObservedAt === "2026-03-01T01:00:00.000Z" && result[0].lastObservedAt === "2026-03-02T02:00:00.000Z",
    JSON.stringify(result)
  );
}

// ===========================================================================
// 7. Deterministic output
// ===========================================================================
{
  const rowsA = spanningDays(8, { source: "AI_SIGNAL", evidenceTags: ["HIGH_RISK_PRESENT"] }, 1);
  const rowsB = spanningDays(6, { source: "ELVOID_PRO_ORACLE", evidenceTags: ["CONFLICTED_STATE_PRESENT"] }, 1);
  const combined = [...rowsA, ...rowsB];
  const reversed = [...combined].reverse();
  const resultA = detectFailurePatternCandidates(combined);
  const resultB = detectFailurePatternCandidates(reversed);
  check("7. Same observations in a different input order -> byte-identical output (JSON equal)", JSON.stringify(resultA) === JSON.stringify(resultB), `${JSON.stringify(resultA)} vs ${JSON.stringify(resultB)}`);
}

// ===========================================================================
// 8. Input immutability
// ===========================================================================
{
  const rows = spanningDays(MIN_OCCURRENCE_COUNT);
  const before = JSON.stringify(rows);
  detectFailurePatternCandidates(rows);
  check("8. detectFailurePatternCandidates does not mutate its input observations array/rows", JSON.stringify(rows) === before, "input was mutated");
}

// ===========================================================================
// 9. No causal language / closed output shape (no free-text field to attach one to)
// ===========================================================================
{
  const rows = spanningDays(MIN_OCCURRENCE_COUNT);
  const [candidate] = detectFailurePatternCandidates(rows);
  const expectedKeys = ["version", "source", "evidenceTag", "dominantEvaluationClass", "occurrenceCount", "dominantClassShare", "confidence", "firstObservedAt", "lastObservedAt"].sort();
  const actualKeys = Object.keys(candidate ?? {}).sort();
  check("9a. FailurePatternCandidateWithoutTimestamp has exactly its closed field set — no narrative/explanation/reason field exists to hold a causal claim", JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), JSON.stringify(actualKeys));

  const detectSource = await (await import("node:fs/promises")).readFile(new URL("../../lib/ai/failurePatterns/detect.ts", import.meta.url), "utf-8");
  const codeOnly = detectSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  const forbidden = ["fetch(", "Date.now(", "Math.random(", "Supabase", "supabase", 'from "@/lib/ai/oracle', 'from "@/lib/elvoid', 'from "@/lib/ai/core', 'from "@/lib/ai/cognitive', "Binance", "binance"];
  const noneAppear = forbidden.every((f) => !codeOnly.includes(f));
  check("9b. lib/ai/failurePatterns/detect.ts's actual code (comments excluded) contains none of: fetch/Date.now/Math.random/Supabase/Oracle-or-elvoid-or-core-or-cognitive imports/Binance", noneAppear, `contains one of: ${forbidden.join(", ")}`);
}

// ===========================================================================
// 10. Naming collision avoided — no bare Pattern / PatternKind / InsightPattern identifier
// ===========================================================================
{
  // Comments legitimately DISCUSS the forbidden names in prose (explaining
  // why they're avoided — e.g. this very fixture's own description), which
  // would otherwise false-positive against the same literal identifiers
  // used as actual code. Strip comments first, exactly like fixture 9b /
  // decision-evaluation-fixtures.ts's fixture 36.
  const files = ["../../lib/ai/failurePatterns/contracts.ts", "../../lib/ai/failurePatterns/detect.ts", "../../lib/ai/failurePatterns/repository.ts"];
  const forbiddenIdentifiers = [/\bInsightPattern\b/, /\bPatternKind\b/, /(?<!FailurePattern)(?<!\w)Pattern\b/];
  let allClean = true;
  const offenders: string[] = [];
  for (const relativePath of files) {
    const rawSource = await (await import("node:fs/promises")).readFile(new URL(relativePath, import.meta.url), "utf-8");
    const codeOnly = rawSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    for (const pattern of forbiddenIdentifiers) {
      if (pattern.test(codeOnly)) {
        allClean = false;
        offenders.push(`${relativePath} matches ${pattern}`);
      }
    }
  }
  check("10. Neither InsightPattern, PatternKind, nor a bare (non-FailurePattern-prefixed) Pattern identifier appears in the actual code (comments excluded) of lib/ai/failurePatterns/*", allClean, offenders.join("; "));
}

// ===========================================================================
// 11. Only qualifying negative recurrence is reported (non-negative classes excluded)
// ===========================================================================
{
  const negativeRows = spanningDays(MIN_OCCURRENCE_COUNT, { evaluationClass: "BAD_DECISION_BAD_OUTCOME" }, 1);
  const nonNegativeClasses: FailurePatternEvaluationClass[] = ["GOOD_DECISION_GOOD_OUTCOME", "BAD_DECISION_GOOD_OUTCOME", "NEUTRAL_OUTCOME", "INSUFFICIENT_EVIDENCE", "GOOD_DECISION_GOOD_OUTCOME"];
  const nonNegativeRows = nonNegativeClasses.map((evaluationClass, i) => observation({ sourceSignalId: `sig-nn-${i}`, decisionTimestamp: `2026-04-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`, evaluationClass }));
  const result = detectFailurePatternCandidates([...negativeRows, ...nonNegativeRows]);
  check(
    "11. 5 negative rows + 5 non-negative rows (same source/tag) -> occurrenceCount is 5, not 10 — non-negative classes never contribute",
    result.length === 1 && result[0].occurrenceCount === MIN_OCCURRENCE_COUNT,
    JSON.stringify(result)
  );
}

// ===========================================================================
// 12. Recomputation updates aggregate state safely (statelessness proof)
// ===========================================================================
{
  const shared: Partial<FailurePatternObservationInput> = { source: "AI_SIGNAL", evidenceTags: ["MID_GRADE"] };
  const setA = spanningDays(5, shared, 1);
  const setB = spanningDays(20, shared, 1);

  const resultA = detectFailurePatternCandidates(setA);
  const resultB = detectFailurePatternCandidates(setB);

  check(
    "12. Two independent recompute calls (5 rows, then an unrelated 20-row call for the same group) each produce their OWN correct aggregate — no accumulation/leakage across calls (5 stays 5, 20 stays 20, never 25)",
    resultA.length === 1 && resultA[0].occurrenceCount === 5 && resultB.length === 1 && resultB[0].occurrenceCount === 20,
    `A=${JSON.stringify(resultA)} B=${JSON.stringify(resultB)}`
  );
}

// ===========================================================================
// 13. Dominant class + share computed correctly across a mixed negative population
// ===========================================================================
{
  const rows = [
    ...spanningDays(6, { evaluationClass: "BAD_DECISION_BAD_OUTCOME" }, 1),
    ...spanningDays(2, { evaluationClass: "GOOD_DECISION_BAD_OUTCOME" }, 7),
  ];
  const result = detectFailurePatternCandidates(rows);
  check(
    "13. Mixed 6 BAD_DECISION_BAD_OUTCOME + 2 GOOD_DECISION_BAD_OUTCOME -> occurrenceCount 8, dominant class BAD_DECISION_BAD_OUTCOME, share 0.75",
    result.length === 1 && result[0].occurrenceCount === 8 && result[0].dominantEvaluationClass === "BAD_DECISION_BAD_OUTCOME" && result[0].dominantClassShare === 0.75,
    JSON.stringify(result)
  );
}

// ===========================================================================
// 14. Multi-tag observation fans out per-tag, never per-combination
// ===========================================================================
{
  const rows = spanningDays(MIN_OCCURRENCE_COUNT, { evidenceTags: ["HIGH_RISK_PRESENT", "CONFLICTED_STATE_PRESENT"] });
  const result = detectFailurePatternCandidates(rows);
  const tags = result.map((c) => c.evidenceTag).sort();
  check(
    "14. A 2-tag observation produces two independent single-tag groups (HIGH_RISK_PRESENT, CONFLICTED_STATE_PRESENT), never one combined 'tag pair' group",
    result.length === 2 && JSON.stringify(tags) === JSON.stringify(["CONFLICTED_STATE_PRESENT", "HIGH_RISK_PRESENT"]) && result.every((c) => c.occurrenceCount === MIN_OCCURRENCE_COUNT),
    JSON.stringify(result)
  );
}

console.log(failures === 0 ? `\n✓ ${passed}/${passed} Failure Pattern Detection fixtures passed.` : `\n${failures} Failure Pattern Detection fixture(s) FAILED (${passed} passed).`);
if (failures > 0) process.exitCode = 1;
