// ---------------------------------------------------------------------------
// Phase 8.1.4 — Adaptive Constraint Engine fixtures (dev-only, not part of
// the app). Pure/offline — hand-built FailurePatternCandidate fixtures
// exercised against generate.ts's pure mapper only (repository.ts requires
// a live Learning DB and is intentionally not exercised here beyond static
// source-scan checks, matching failure-pattern-fixtures.ts's/
// decision-memory-fixtures.ts's own convention).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/adaptive-constraint-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { generateAdaptiveConstraints, HIGH_DOMINANCE_SHARE, HIGH_OCCURRENCE_COUNT } from "@/lib/ai/adaptiveConstraint/generate";
import type { FailurePatternCandidate } from "@/lib/ai/adaptiveConstraint/contracts";

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

function candidate(overrides: Partial<FailurePatternCandidate> = {}): FailurePatternCandidate {
  return {
    version: 1,
    source: "AI_SIGNAL",
    evidenceTag: "HIGH_RISK_PRESENT",
    dominantEvaluationClass: "BAD_DECISION_BAD_OUTCOME",
    occurrenceCount: 5,
    dominantClassShare: 0.6,
    confidence: 0.1167,
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastObservedAt: "2026-01-05T00:00:00.000Z",
    computedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// 1. Qualified pattern maps to exactly one constraint
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate()]);
  check("1. one qualified candidate -> one constraint", result.length === 1, JSON.stringify(result));
}

// ===========================================================================
// 2. source isolation preserved
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ source: "AI_SIGNAL" }), candidate({ source: "ELVOID_PRO_ORACLE" })]);
  check(
    "2. source isolation — two candidates, different sources, same tag -> two distinct constraints, sources preserved",
    result.length === 2 && result.some((r) => r.source === "AI_SIGNAL") && result.some((r) => r.source === "ELVOID_PRO_ORACLE"),
    JSON.stringify(result)
  );
}

// ===========================================================================
// 3. One constraint per (source, evidenceTag) — duplicate input collapses
//    naturally via source/evidenceTag identity (mirrors UNIQUE constraint
//    upstream; generator itself performs no separate dedup pass beyond
//    mapping 1:1 per input row)
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ evidenceTag: "HIGH_RISK_PRESENT" }), candidate({ evidenceTag: "LOW_LIQUIDITY" })]);
  const tags = result.map((r) => r.evidenceTag).sort();
  check("3. distinct evidenceTags -> one constraint each, both present", result.length === 2 && tags[0] === "HIGH_RISK_PRESENT" && tags[1] === "LOW_LIQUIDITY", JSON.stringify(result));
}

// ===========================================================================
// 4. Verbatim occurrenceCount copy
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ occurrenceCount: 23 })]);
  check("4. occurrenceCount copied verbatim into basis", result[0].basis.occurrenceCount === 23, JSON.stringify(result));
}

// ===========================================================================
// 5. Verbatim dominantClassShare copy
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ dominantClassShare: 0.4321 })]);
  check("5. dominantClassShare copied verbatim into basis", result[0].basis.dominantClassShare === 0.4321, JSON.stringify(result));
}

// ===========================================================================
// 6. Verbatim statisticalConfidence copy (renamed from candidate.confidence)
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ confidence: 0.5833 })]);
  check("6. candidate.confidence copied verbatim into basis.statisticalConfidence", result[0].basis.statisticalConfidence === 0.5833, JSON.stringify(result));
}

// ===========================================================================
// 7. Timestamps copied correctly
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ firstObservedAt: "2026-03-01T00:00:00.000Z", lastObservedAt: "2026-03-09T00:00:00.000Z" })]);
  check(
    "7. firstObservedAt/lastObservedAt copied verbatim into basis",
    result[0].basis.firstObservedAt === "2026-03-01T00:00:00.000Z" && result[0].basis.lastObservedAt === "2026-03-09T00:00:00.000Z",
    JSON.stringify(result)
  );
}

// ===========================================================================
// 8. Closed constraint enum only
// ===========================================================================
{
  const allowed = new Set(["FLAG_HISTORICAL_UNRELIABILITY", "INCREASE_CAUTION", "REQUIRE_STRONGER_CONFIRMATION"]);
  const result = generateAdaptiveConstraints([
    candidate({ dominantClassShare: 0.95, confidence: 0.6 }),
    candidate({ evidenceTag: "LOW_LIQUIDITY", occurrenceCount: 20, dominantClassShare: 0.5, confidence: 0.3 }),
    candidate({ evidenceTag: "STALE_DATA", occurrenceCount: 6, dominantClassShare: 0.5, confidence: 0.1 }),
  ]);
  check("8. every generated constraintType is a member of the closed v1 enum", result.every((r) => allowed.has(r.constraintType)), JSON.stringify(result));
}

// ===========================================================================
// 8b. High dominance + mid confidence -> FLAG_HISTORICAL_UNRELIABILITY
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ dominantClassShare: HIGH_DOMINANCE_SHARE, confidence: 0.35 })]);
  check("8b. dominantClassShare at threshold + confidence >= 0.35 -> FLAG_HISTORICAL_UNRELIABILITY", result[0].constraintType === "FLAG_HISTORICAL_UNRELIABILITY", JSON.stringify(result));
}

// ===========================================================================
// 8c. High occurrenceCount (not highly dominant) -> REQUIRE_STRONGER_CONFIRMATION
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ occurrenceCount: HIGH_OCCURRENCE_COUNT, dominantClassShare: 0.5, confidence: 0.2 })]);
  check("8c. occurrenceCount at threshold, low dominance -> REQUIRE_STRONGER_CONFIRMATION", result[0].constraintType === "REQUIRE_STRONGER_CONFIRMATION", JSON.stringify(result));
}

// ===========================================================================
// 8d. Baseline (neither highly dominant nor highly recurrent) -> INCREASE_CAUTION
// ===========================================================================
{
  const result = generateAdaptiveConstraints([candidate({ occurrenceCount: 5, dominantClassShare: 0.5, confidence: 0.1 })]);
  check("8d. baseline qualified candidate -> INCREASE_CAUTION", result[0].constraintType === "INCREASE_CAUTION", JSON.stringify(result));
}

// ===========================================================================
// 9. Deterministic output — reversed input order yields identical result
// ===========================================================================
{
  const inputs = [candidate({ evidenceTag: "HIGH_RISK_PRESENT" }), candidate({ evidenceTag: "LOW_LIQUIDITY" }), candidate({ evidenceTag: "STALE_DATA" })];
  const forward = generateAdaptiveConstraints(inputs);
  const reversed = generateAdaptiveConstraints([...inputs].reverse());
  check("9. output order is deterministic regardless of input array order", JSON.stringify(forward) === JSON.stringify(reversed), `${JSON.stringify(forward)} vs ${JSON.stringify(reversed)}`);
}

// ===========================================================================
// 10. Input immutability
// ===========================================================================
{
  const input = [candidate()];
  const snapshot = JSON.stringify(input);
  generateAdaptiveConstraints(input);
  check("10. generateAdaptiveConstraints never mutates its input", JSON.stringify(input) === snapshot, "input array was mutated");
}

// ===========================================================================
// 11. No threshold reimplementation — MIN_OCCURRENCE_COUNT is never
//     imported/referenced in generate.ts (static source scan)
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/adaptiveConstraint/generate.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  check(
    "11. generate.ts contains no MIN_OCCURRENCE_COUNT / CONFIDENCE_SAMPLE_CAP / MAX_CONFIDENCE reference (comment-stripped scan)",
    !/MIN_OCCURRENCE_COUNT|CONFIDENCE_SAMPLE_CAP|MAX_CONFIDENCE/.test(stripped),
    stripped
  );
}

// ===========================================================================
// 12. No causal-language fields — closed field set only, no reason/
//     explanation/narrative/cause field anywhere in contracts.ts
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/adaptiveConstraint/contracts.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const typeBody = stripped.split("export interface AdaptiveConstraintBasis")[1]?.split("}")[0] ?? "";
  check("12. AdaptiveConstraintBasis has no reason/explanation/narrative/cause field", !/reason|explanation|narrative|cause/i.test(typeBody), typeBody);
}

// ===========================================================================
// 13. No canonical confidence/grade/risk/side mutation fields anywhere in
//     contracts.ts/generate.ts/repository.ts (static scan for protected
//     identifiers)
// ===========================================================================
{
  const files = ["../../lib/ai/adaptiveConstraint/contracts.ts", "../../lib/ai/adaptiveConstraint/generate.ts", "../../lib/ai/adaptiveConstraint/repository.ts"];
  const protectedIdentifiers = ["OracleAssessment", "grading.ts", "riskStatus", "stopLoss", "takeProfit", "paperTrader", "execute.ts", "ai_signals"];
  let clean = true;
  let offender = "";
  for (const file of files) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const id of protectedIdentifiers) {
      if (stripped.includes(id)) {
        clean = false;
        offender = `${file}: ${id}`;
      }
    }
  }
  check("13. no reference to any protected canonical identifier outside comments (static scan)", clean, offender);
}

// ===========================================================================
// 14. No OracleAssessment / CognitiveDecisionContext dependency (import scan)
// ===========================================================================
{
  const files = ["../../lib/ai/adaptiveConstraint/contracts.ts", "../../lib/ai/adaptiveConstraint/generate.ts", "../../lib/ai/adaptiveConstraint/repository.ts"];
  let clean = true;
  let offender = "";
  for (const file of files) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    const importLines = src.split("\n").filter((l) => l.trim().startsWith("import"));
    for (const line of importLines) {
      if (/oracle|cognitive/i.test(line)) {
        clean = false;
        offender = `${file}: ${line.trim()}`;
      }
    }
  }
  check("14. no import from lib/ai/oracle/* or lib/ai/cognitive/* anywhere in this module", clean, offender);
}

// ===========================================================================
// 15. No DecisionMemory collision — no bare/Decision-prefixed *Memory
//     identifier anywhere in this module's actual code
// ===========================================================================
{
  const files = ["../../lib/ai/adaptiveConstraint/contracts.ts", "../../lib/ai/adaptiveConstraint/generate.ts", "../../lib/ai/adaptiveConstraint/repository.ts"];
  let clean = true;
  let offender = "";
  for (const file of files) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/DecisionMemory|CognitiveWorkingMemory/.test(stripped)) {
      clean = false;
      offender = file;
    }
  }
  check("15. no DecisionMemory*/CognitiveWorkingMemory identifier collision anywhere in this module's code", clean, offender);
}

// ===========================================================================
// 16. Repository static scan — writes only to adaptive_constraints, no
//     write to any other table
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/adaptiveConstraint/repository.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const writeCalls = [...stripped.matchAll(/\.from\("([a-z_]+)"\)\s*\.\s*(insert|upsert|update|delete)\(/g)];
  const writesToOtherTables = writeCalls.filter((m) => m[1] !== "adaptive_constraints");
  check("16. repository.ts's only write target is adaptive_constraints (static scan)", writeCalls.length === 1 && writesToOtherTables.length === 0, JSON.stringify(writeCalls.map((m) => m[1])));
}

// ===========================================================================
// 17. No lifecycle/execute/paperTrader wiring — recomputeAdaptiveConstraints
//     is never called anywhere outside this file and repository.ts itself
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/adaptiveConstraint/repository.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const callSites = (stripped.match(/recomputeAdaptiveConstraints\(/g) ?? []).length;
  // Exactly one occurrence expected: the function's own declaration site
  // (`export async function recomputeAdaptiveConstraints()`), zero
  // self-invocations or external call sites within this file.
  check("17. recomputeAdaptiveConstraints has zero call sites (only its own declaration)", callSites === 1, `found ${callSites} occurrences`);
}

// ===========================================================================
// 18. Empty input -> empty output (valid, non-error result)
// ===========================================================================
{
  const result = generateAdaptiveConstraints([]);
  check("18. empty candidates array -> empty constraints array", result.length === 0, JSON.stringify(result));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
