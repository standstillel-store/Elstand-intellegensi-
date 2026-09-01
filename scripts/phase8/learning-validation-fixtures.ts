// ---------------------------------------------------------------------------
// Phase 8.1.5 — Learning Validation fixtures (dev-only, not part of the
// app). Pure/offline — hand-built AdaptiveConstraint fixtures exercised
// against validate.ts's pure `validateConstraint()` only (repository.ts
// requires a live Learning DB and is intentionally not exercised here
// beyond static source-scan checks, matching
// adaptive-constraint-fixtures.ts's/failure-pattern-fixtures.ts's own
// convention).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/learning-validation-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { validateConstraint, MIN_VALIDATION_SAMPLE_SIZE, FRESHNESS_WINDOW_DAYS, OVERFIT_SAMPLE_SIZE_CEILING, OVERFIT_DOMINANCE_SHARE_THRESHOLD, OVERFIT_MAX_SPAN_DAYS } from "@/lib/ai/learningValidation/validate";
import type { AdaptiveConstraint } from "@/lib/ai/learningValidation/contracts";

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ASOF = "2026-02-01T00:00:00.000Z";

function constraint(overrides: Partial<AdaptiveConstraint> = {}): AdaptiveConstraint {
  return {
    version: 1,
    source: "AI_SIGNAL",
    evidenceTag: "HIGH_RISK_PRESENT",
    constraintType: "INCREASE_CAUTION",
    basis: {
      occurrenceCount: 10,
      dominantClassShare: 0.6,
      statisticalConfidence: 0.5,
      firstObservedAt: "2026-01-01T00:00:00.000Z",
      lastObservedAt: "2026-01-25T00:00:00.000Z",
      ...overrides.basis,
    },
    generatedAt: "2026-01-25T01:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// 1. VALID — every concern clears
// ===========================================================================
{
  const result = validateConstraint(constraint(), ASOF);
  check(
    "1. adequate sample, fresh, structurally sound, no overfit signature -> VALID",
    result.status === "VALID" && result.signals.sampleSizeAdequate && result.signals.withinFreshnessWindow && result.signals.structurallyConsistent && !result.signals.overfitRiskFlag,
    JSON.stringify(result)
  );
}

// ===========================================================================
// 2. PROVISIONAL — everything clears except sample size
// ===========================================================================
{
  const result = validateConstraint(constraint({ basis: { occurrenceCount: MIN_VALIDATION_SAMPLE_SIZE - 1, dominantClassShare: 0.6, statisticalConfidence: 0.3, firstObservedAt: "2026-01-01T00:00:00.000Z", lastObservedAt: "2026-01-25T00:00:00.000Z" } }), ASOF);
  check("2. below MIN_VALIDATION_SAMPLE_SIZE, otherwise clean -> PROVISIONAL", result.status === "PROVISIONAL" && !result.signals.sampleSizeAdequate, JSON.stringify(result));
}

// ===========================================================================
// 3. OVERFIT_RISK — small sample + near-total dominance + narrow span
// ===========================================================================
{
  const result = validateConstraint(
    constraint({ basis: { occurrenceCount: OVERFIT_SAMPLE_SIZE_CEILING, dominantClassShare: OVERFIT_DOMINANCE_SHARE_THRESHOLD, statisticalConfidence: 0.4, firstObservedAt: "2026-01-30T00:00:00.000Z", lastObservedAt: "2026-01-31T00:00:00.000Z" } }),
    ASOF
  );
  check("3. small sample + near-total dominance + narrow span -> OVERFIT_RISK", result.status === "OVERFIT_RISK" && result.signals.overfitRiskFlag, JSON.stringify(result));
}

// ===========================================================================
// 4. STALE — structurally sound, no overfit, but lastObservedAt beyond
//    FRESHNESS_WINDOW_DAYS of asOf
// ===========================================================================
{
  const result = validateConstraint(constraint({ basis: { occurrenceCount: 20, dominantClassShare: 0.5, statisticalConfidence: 0.4, firstObservedAt: "2025-10-01T00:00:00.000Z", lastObservedAt: "2025-11-01T00:00:00.000Z" } }), ASOF);
  check("4. lastObservedAt well beyond freshness window -> STALE", result.status === "STALE" && !result.signals.withinFreshnessWindow, JSON.stringify(result));
}

// ===========================================================================
// 5. INCONSISTENT — malformed basis (dominantClassShare out of [0,1])
// ===========================================================================
{
  const result = validateConstraint(constraint({ basis: { occurrenceCount: 10, dominantClassShare: 1.5, statisticalConfidence: 0.5, firstObservedAt: "2026-01-01T00:00:00.000Z", lastObservedAt: "2026-01-25T00:00:00.000Z" } }), ASOF);
  check("5a. dominantClassShare out of [0,1] -> INCONSISTENT", result.status === "INCONSISTENT" && !result.signals.structurallyConsistent, JSON.stringify(result));
}
{
  const result = validateConstraint(constraint({ basis: { occurrenceCount: 10, dominantClassShare: 0.5, statisticalConfidence: 0.5, firstObservedAt: "2026-02-01T00:00:00.000Z", lastObservedAt: "2026-01-01T00:00:00.000Z" } }), ASOF);
  check("5b. firstObservedAt after lastObservedAt -> INCONSISTENT", result.status === "INCONSISTENT" && !result.signals.structurallyConsistent, JSON.stringify(result));
}
{
  const result = validateConstraint(constraint({ basis: { occurrenceCount: 0, dominantClassShare: 0.5, statisticalConfidence: 0.5, firstObservedAt: "2026-01-01T00:00:00.000Z", lastObservedAt: "2026-01-25T00:00:00.000Z" } }), ASOF);
  check("5c. non-positive occurrenceCount -> INCONSISTENT", result.status === "INCONSISTENT" && !result.signals.structurallyConsistent, JSON.stringify(result));
}

// ===========================================================================
// 6. Priority ordering — INCONSISTENT outranks STALE/OVERFIT_RISK/PROVISIONAL
// ===========================================================================
{
  // Malformed basis (share out of range) AND, were it structurally sound,
  // this row would also be stale, overfit-shaped, and undersized.
  const result = validateConstraint(
    constraint({ basis: { occurrenceCount: OVERFIT_SAMPLE_SIZE_CEILING, dominantClassShare: 1.2, statisticalConfidence: 0.4, firstObservedAt: "2025-01-01T00:00:00.000Z", lastObservedAt: "2025-01-02T00:00:00.000Z" } }),
    ASOF
  );
  check("6a. malformed basis wins over every other concern -> INCONSISTENT", result.status === "INCONSISTENT", JSON.stringify(result));
}
{
  // Structurally sound, stale AND overfit-shaped -> STALE must win (priority 2 before 3).
  const result = validateConstraint(
    constraint({ basis: { occurrenceCount: OVERFIT_SAMPLE_SIZE_CEILING, dominantClassShare: OVERFIT_DOMINANCE_SHARE_THRESHOLD, statisticalConfidence: 0.4, firstObservedAt: "2025-06-01T00:00:00.000Z", lastObservedAt: "2025-06-02T00:00:00.000Z" } }),
    ASOF
  );
  check("6b. stale AND overfit-shaped -> STALE wins over OVERFIT_RISK", result.status === "STALE" && result.signals.overfitRiskFlag, JSON.stringify(result));
}
{
  // Structurally sound, fresh, overfit-shaped AND undersized by the
  // MIN_VALIDATION_SAMPLE_SIZE standard -> OVERFIT_RISK must win (priority 3 before 4).
  const result = validateConstraint(
    constraint({ basis: { occurrenceCount: OVERFIT_SAMPLE_SIZE_CEILING, dominantClassShare: OVERFIT_DOMINANCE_SHARE_THRESHOLD, statisticalConfidence: 0.4, firstObservedAt: "2026-01-30T00:00:00.000Z", lastObservedAt: "2026-01-31T00:00:00.000Z" } }),
    ASOF
  );
  check("6c. overfit-shaped AND undersized -> OVERFIT_RISK wins over PROVISIONAL", result.status === "OVERFIT_RISK" && !result.signals.sampleSizeAdequate, JSON.stringify(result));
}

// ===========================================================================
// 7. Staleness boundary — exactly at FRESHNESS_WINDOW_DAYS is within
//    window; one millisecond beyond it is STALE
// ===========================================================================
{
  const lastObservedAt = new Date(Date.parse(ASOF) - FRESHNESS_WINDOW_DAYS * MS_PER_DAY).toISOString();
  const result = validateConstraint(constraint({ basis: { occurrenceCount: 20, dominantClassShare: 0.5, statisticalConfidence: 0.4, firstObservedAt: "2025-11-01T00:00:00.000Z", lastObservedAt } }), ASOF);
  check("7a. lastObservedAt exactly FRESHNESS_WINDOW_DAYS before asOf -> still within window", result.signals.withinFreshnessWindow && result.status !== "STALE", JSON.stringify(result));
}
{
  const lastObservedAt = new Date(Date.parse(ASOF) - FRESHNESS_WINDOW_DAYS * MS_PER_DAY - 1).toISOString();
  const result = validateConstraint(constraint({ basis: { occurrenceCount: 20, dominantClassShare: 0.5, statisticalConfidence: 0.4, firstObservedAt: "2025-11-01T00:00:00.000Z", lastObservedAt } }), ASOF);
  check("7b. lastObservedAt one millisecond beyond the window -> STALE", !result.signals.withinFreshnessWindow && result.status === "STALE", JSON.stringify(result));
}

// ===========================================================================
// 8. Overfit-span boundary — span exactly at OVERFIT_MAX_SPAN_DAYS still
//    counts; span one day beyond it does not
// ===========================================================================
{
  const firstObservedAt = "2026-01-28T00:00:00.000Z";
  const lastObservedAt = new Date(Date.parse(firstObservedAt) + OVERFIT_MAX_SPAN_DAYS * MS_PER_DAY).toISOString();
  const result = validateConstraint(constraint({ basis: { occurrenceCount: OVERFIT_SAMPLE_SIZE_CEILING, dominantClassShare: OVERFIT_DOMINANCE_SHARE_THRESHOLD, statisticalConfidence: 0.4, firstObservedAt, lastObservedAt } }), ASOF);
  check("8a. span exactly OVERFIT_MAX_SPAN_DAYS, small sample + high dominance -> OVERFIT_RISK", result.signals.overfitRiskFlag && result.status === "OVERFIT_RISK", JSON.stringify(result));
}
{
  const firstObservedAt = "2026-01-20T00:00:00.000Z";
  const lastObservedAt = new Date(Date.parse(firstObservedAt) + (OVERFIT_MAX_SPAN_DAYS + 1) * MS_PER_DAY).toISOString();
  const result = validateConstraint(constraint({ basis: { occurrenceCount: OVERFIT_SAMPLE_SIZE_CEILING, dominantClassShare: OVERFIT_DOMINANCE_SHARE_THRESHOLD, statisticalConfidence: 0.4, firstObservedAt, lastObservedAt } }), ASOF);
  check("8b. span one day beyond OVERFIT_MAX_SPAN_DAYS -> overfit flag clears", !result.signals.overfitRiskFlag, JSON.stringify(result));
}

// ===========================================================================
// 9. Determinism — identical (constraint, asOf) input always produces
//    byte-identical output
// ===========================================================================
{
  const input = constraint();
  const first = validateConstraint(input, ASOF);
  const second = validateConstraint(input, ASOF);
  check("9. identical input -> byte-identical output across repeated calls", JSON.stringify(first) === JSON.stringify(second), `${JSON.stringify(first)} vs ${JSON.stringify(second)}`);
}

// ===========================================================================
// 10. Input immutability — validateConstraint never mutates its input
// ===========================================================================
{
  const input = constraint();
  const snapshot = JSON.stringify(input);
  validateConstraint(input, ASOF);
  check("10. validateConstraint never mutates its input constraint", JSON.stringify(input) === snapshot, "input constraint was mutated");
}

// ===========================================================================
// 11. Source isolation — two constraints, same evidenceTag, different
//     source, are validated independently and never merged
// ===========================================================================
{
  const aiSignal = validateConstraint(constraint({ source: "AI_SIGNAL" }), ASOF);
  const oracle = validateConstraint(constraint({ source: "ELVOID_PRO_ORACLE" }), ASOF);
  check(
    "11. source isolation — identical basis, different source -> both validated independently, sources preserved",
    aiSignal.source === "AI_SIGNAL" && oracle.source === "ELVOID_PRO_ORACLE" && aiSignal.status === oracle.status,
    JSON.stringify({ aiSignal, oracle })
  );
}

// ===========================================================================
// 12. Verbatim field carry-through — source/evidenceTag/constraintType/basis
// ===========================================================================
{
  const input = constraint({ source: "ELVOID_PRO_ORACLE", evidenceTag: "MODERATE_RISK_PRESENT", constraintType: "FLAG_HISTORICAL_UNRELIABILITY" });
  const result = validateConstraint(input, ASOF);
  check(
    "12. source/evidenceTag/constraintType/basis carried forward verbatim",
    result.source === "ELVOID_PRO_ORACLE" && result.evidenceTag === "MODERATE_RISK_PRESENT" && result.constraintType === "FLAG_HISTORICAL_UNRELIABILITY" && JSON.stringify(result.basis) === JSON.stringify(input.basis),
    JSON.stringify(result)
  );
}

// ===========================================================================
// 13. No Date.now() anywhere in validate.ts (static source scan)
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/learningValidation/validate.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  check("13. validate.ts contains no Date.now() call (comment-stripped scan)", !/Date\.now\(\)/.test(stripped), stripped);
}

// ===========================================================================
// 14. No DB/network/LLM/randomness dependency in validate.ts (static scan)
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/learningValidation/validate.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  check(
    "14. validate.ts contains no fetch/supabase/Math.random/getLearningSupabase reference",
    !/fetch\(|supabase|Math\.random|getLearningSupabase/i.test(stripped),
    stripped
  );
}

// ===========================================================================
// 15. No import from lib/ai/oracle/*, lib/ai/cognitive/*, or lib/elvoid/*
//     anywhere in this phase's three files (import scan)
// ===========================================================================
{
  const files = ["../../lib/ai/learningValidation/contracts.ts", "../../lib/ai/learningValidation/validate.ts", "../../lib/ai/learningValidation/repository.ts"];
  let clean = true;
  let offender = "";
  for (const file of files) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    const importLines = src.split("\n").filter((l) => l.trim().startsWith("import"));
    for (const line of importLines) {
      if (/oracle|cognitive|elvoid/i.test(line)) {
        clean = false;
        offender = `${file}: ${line.trim()}`;
      }
    }
  }
  check("15. no import from lib/ai/oracle/*, lib/ai/cognitive/*, or lib/elvoid/* anywhere in this phase", clean, offender);
}

// ===========================================================================
// 16. No reimplementation/reimport of upstream thresholds
//     (MIN_OCCURRENCE_COUNT, HIGH_DOMINANCE_SHARE, HIGH_OCCURRENCE_COUNT)
//     in validate.ts (static source scan)
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/learningValidation/validate.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  check(
    "16. validate.ts contains no MIN_OCCURRENCE_COUNT / HIGH_DOMINANCE_SHARE / HIGH_OCCURRENCE_COUNT reference (comment-stripped scan)",
    !/MIN_OCCURRENCE_COUNT|HIGH_DOMINANCE_SHARE|HIGH_OCCURRENCE_COUNT/.test(stripped),
    stripped
  );
}

// ===========================================================================
// 17. No causal-language fields — closed field set only, no reason/
//     explanation/narrative/cause field anywhere in
//     ConstraintValidationSignals
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/learningValidation/contracts.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const typeBody = stripped.split("export interface ConstraintValidationSignals")[1]?.split("}")[0] ?? "";
  check("17. ConstraintValidationSignals has no reason/explanation/narrative/cause field", !/reason|explanation|narrative|cause/i.test(typeBody), typeBody);
}

// ===========================================================================
// 18. No canonical confidence/grade/risk mutation fields anywhere in
//     contracts.ts/validate.ts/repository.ts (static scan for protected
//     identifiers)
// ===========================================================================
{
  const files = ["../../lib/ai/learningValidation/contracts.ts", "../../lib/ai/learningValidation/validate.ts", "../../lib/ai/learningValidation/repository.ts"];
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
  check("18. no reference to any protected canonical identifier outside comments (static scan)", clean, offender);
}

// ===========================================================================
// 19. Repository static scan — reads only adaptive_constraints, writes
//     only constraint_validations
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/learningValidation/repository.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const readCalls = [...stripped.matchAll(/\.from\("([a-z_]+)"\)\s*\.\s*select\(/g)];
  const writeCalls = [...stripped.matchAll(/\.from\("([a-z_]+)"\)\s*\.\s*(insert|upsert|update|delete)\(/g)];
  const readsFromOtherTables = readCalls.filter((m) => m[1] !== "adaptive_constraints");
  const writesToOtherTables = writeCalls.filter((m) => m[1] !== "constraint_validations");
  check(
    "19. repository.ts reads only adaptive_constraints and writes only constraint_validations (static scan)",
    readCalls.length === 1 && readsFromOtherTables.length === 0 && writeCalls.length === 1 && writesToOtherTables.length === 0,
    JSON.stringify({ reads: readCalls.map((m) => m[1]), writes: writeCalls.map((m) => m[1]) })
  );
}

// ===========================================================================
// 20. No lifecycle/execute/paperTrader/API wiring —
//     recomputeConstraintValidations is never called anywhere outside its
//     own declaration in repository.ts
// ===========================================================================
{
  const src = readFileSync(new URL("../../lib/ai/learningValidation/repository.ts", import.meta.url), "utf8");
  const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const callSites = (stripped.match(/recomputeConstraintValidations\(/g) ?? []).length;
  // Exactly one occurrence expected: the function's own declaration site
  // (`export async function recomputeConstraintValidations()`), zero
  // self-invocations or external call sites within this file.
  check("20. recomputeConstraintValidations has zero call sites (only its own declaration)", callSites === 1, `found ${callSites} occurrences`);
}

// ===========================================================================
// 21. No mutation of upstream AdaptiveConstraint basis — this phase never
//     recomputes occurrenceCount/dominantClassShare/statisticalConfidence
//     from raw experience rows (static scan for the raw-table identifiers)
// ===========================================================================
{
  const files = ["../../lib/ai/learningValidation/contracts.ts", "../../lib/ai/learningValidation/validate.ts", "../../lib/ai/learningValidation/repository.ts"];
  let clean = true;
  let offender = "";
  for (const file of files) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/decision_experiences|decision_evaluations/.test(stripped)) {
      clean = false;
      offender = file;
    }
  }
  check("21. no reference to decision_experiences/decision_evaluations anywhere in this phase (static scan)", clean, offender);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
