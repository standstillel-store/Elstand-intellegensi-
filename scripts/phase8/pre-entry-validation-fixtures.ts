// ---------------------------------------------------------------------------
// Phase 8.2.5 — Pre-Entry Market Validation fixtures (dev-only, not part of
// the app). Pure/offline — hand-built `PreEntryValidationInput` fixtures
// exercised against `validate.ts`'s pure `validatePreEntry()` only. This
// engine has no repository/persistence layer at all (none is introduced by
// this phase), so every exported function in this phase is exercised
// end-to-end by this script.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/pre-entry-validation-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { validatePreEntry } from "@/lib/ai/preEntryValidation/validate";
import type { AutonomousCanonicalSnapshot, AutonomousDecisionContext, AutonomousQualificationResult, MacroIntelligenceContext, MarketImpactContext, PreEntryValidationInput, QualificationStatus } from "@/lib/ai/preEntryValidation/contracts";

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

const GENERATED_AT = "2026-02-01T00:00:00.000Z";

function canonical(overrides: Partial<AutonomousCanonicalSnapshot> = {}): AutonomousCanonicalSnapshot {
  return {
    symbol: "BTCUSDT",
    timestamp: "2026-01-31T23:55:00.000Z",
    grade: "A",
    side: "LONG",
    confidence: 78,
    riskStatus: "valid",
    invalidation: "close below 41,200",
    ...overrides,
  };
}

function decisionContext(overrides: Partial<AutonomousDecisionContext> = {}): AutonomousDecisionContext {
  return {
    version: 1,
    generatedAt: GENERATED_AT,
    symbol: "BTCUSDT",
    source: "ELVOID_PRO_ORACLE",
    canonical: canonical(),
    cognitive: null,
    memory: null,
    validConstraints: [],
    ...overrides,
  };
}

function qualification(overrides: Partial<AutonomousQualificationResult> = {}): AutonomousQualificationResult {
  return {
    version: 1,
    symbol: "BTCUSDT",
    source: "ELVOID_PRO_ORACLE",
    generatedAt: GENERATED_AT,
    status: "QUALIFIED",
    signals: {
      sourceEligible: true,
      canonicalAssessmentPresent: true,
      gradeQualifies: true,
      riskValid: true,
      negativeMemorySignalPresent: false,
      cautionConstraintPresent: false,
    },
    ...overrides,
  };
}

function macro(overrides: Partial<MacroIntelligenceContext> = {}): MacroIntelligenceContext {
  return {
    version: 1,
    generatedAt: GENERATED_AT,
    dataAvailability: "AVAILABLE",
    usableEventCount: 3,
    totalEventCount: 3,
    macroRegime: "EVENT_LIGHT",
    eventRisk: "LOW",
    eventProximity: "DISTANT",
    upcomingHighImpactEvent: null,
    directionalBias: null,
    ...overrides,
  };
}

function eventImpact(overrides: Partial<MarketImpactContext> = {}): MarketImpactContext {
  return {
    version: 1,
    generatedAt: GENERATED_AT,
    eventState: "NONE",
    macroAvailability: "AVAILABLE",
    newsAvailability: "AVAILABLE",
    highImpactPresent: false,
    upcomingHighImpactEvent: null,
    totalNewsCount: 4,
    usableNewsCount: 4,
    recentNewsCount: 1,
    impactRisk: "LOW",
    impactDirection: null,
    conflictingImpact: false,
    uncertainty: {
      macroDataMissing: false,
      newsDataMissing: false,
      directionUnsupported: true,
    },
    ...overrides,
  };
}

function input(overrides: Partial<PreEntryValidationInput> = {}): PreEntryValidationInput {
  return {
    decisionContext: decisionContext(),
    qualification: qualification(),
    macro: macro(),
    eventImpact: eventImpact(),
    ...overrides,
  };
}

// ===========================================================================
// 1. Clean, complete, no concerns -> VALID
// ===========================================================================
{
  const result = validatePreEntry(input());
  check(
    "1. QUALIFIED + risk valid + low event risk + no conflict + complete data -> VALID",
    result.status === "VALID" &&
      result.signals.qualificationPresent &&
      result.signals.macroPresent &&
      result.signals.eventImpactPresent &&
      result.signals.riskValid &&
      !result.signals.qualificationConflicted &&
      !result.signals.macroEventRiskElevated &&
      !result.signals.eventImpactRiskElevated &&
      !result.signals.conflictingImpactPresent,
    JSON.stringify(result),
  );
}

// ===========================================================================
// 2. Missing required context -> INSUFFICIENT_CONTEXT
// ===========================================================================
{
  const result = validatePreEntry(input({ qualification: null }));
  check("2a. qualification === null -> INSUFFICIENT_CONTEXT, qualificationPresent false", result.status === "INSUFFICIENT_CONTEXT" && !result.signals.qualificationPresent, JSON.stringify(result));
}
{
  const result = validatePreEntry(input({ macro: null }));
  check("2b. macro === null -> INSUFFICIENT_CONTEXT, macroPresent false", result.status === "INSUFFICIENT_CONTEXT" && !result.signals.macroPresent, JSON.stringify(result));
}
{
  const result = validatePreEntry(input({ eventImpact: null }));
  check("2c. eventImpact === null -> INSUFFICIENT_CONTEXT, eventImpactPresent false", result.status === "INSUFFICIENT_CONTEXT" && !result.signals.eventImpactPresent, JSON.stringify(result));
}
{
  const result = validatePreEntry(input({ qualification: null, macro: null, eventImpact: null }));
  check("2d. all three optional inputs null -> INSUFFICIENT_CONTEXT", result.status === "INSUFFICIENT_CONTEXT", JSON.stringify(result));
}

// ===========================================================================
// 3. Upstream qualification INSUFFICIENT_CONTEXT -> INSUFFICIENT_CONTEXT
// ===========================================================================
{
  const result = validatePreEntry(input({ qualification: qualification({ status: "INSUFFICIENT_CONTEXT" as QualificationStatus }) }));
  check("3. qualification.status === INSUFFICIENT_CONTEXT -> INSUFFICIENT_CONTEXT, qualificationInsufficient true", result.status === "INSUFFICIENT_CONTEXT" && result.signals.qualificationInsufficient, JSON.stringify(result));
}

// ===========================================================================
// 4. Upstream qualification CONFLICTED -> BLOCKED
// ===========================================================================
{
  const result = validatePreEntry(input({ qualification: qualification({ status: "CONFLICTED" as QualificationStatus, signals: { sourceEligible: true, canonicalAssessmentPresent: true, gradeQualifies: true, riskValid: true, negativeMemorySignalPresent: true, cautionConstraintPresent: false } }) }));
  check("4. qualification.status === CONFLICTED -> BLOCKED, qualificationConflicted true", result.status === "BLOCKED" && result.signals.qualificationConflicted, JSON.stringify(result));
}

// ===========================================================================
// 5. Elevated macro event risk -> BLOCKED
// ===========================================================================
{
  const result = validatePreEntry(input({ macro: macro({ eventRisk: "ELEVATED" }) }));
  check("5a. macro.eventRisk === ELEVATED -> BLOCKED, macroEventRiskElevated true", result.status === "BLOCKED" && result.signals.macroEventRiskElevated, JSON.stringify(result));
}
{
  const result = validatePreEntry(input({ eventImpact: eventImpact({ impactRisk: "ELEVATED" }) }));
  check("5b. eventImpact.impactRisk === ELEVATED -> BLOCKED, eventImpactRiskElevated true", result.status === "BLOCKED" && result.signals.eventImpactRiskElevated, JSON.stringify(result));
}

// ===========================================================================
// 6. Invalid risk on the underlying signal -> CAUTION
// ===========================================================================
{
  const result = validatePreEntry(input({ qualification: qualification({ signals: { sourceEligible: true, canonicalAssessmentPresent: true, gradeQualifies: true, riskValid: false, negativeMemorySignalPresent: false, cautionConstraintPresent: false } }) }));
  check("6. qualification.signals.riskValid === false -> CAUTION, riskValid false", result.status === "CAUTION" && !result.signals.riskValid, JSON.stringify(result));
}

// ===========================================================================
// 7. Conflicting recent news impact -> CAUTION
// ===========================================================================
{
  const result = validatePreEntry(input({ eventImpact: eventImpact({ conflictingImpact: true }) }));
  check("7. eventImpact.conflictingImpact === true -> CAUTION, conflictingImpactPresent true", result.status === "CAUTION" && result.signals.conflictingImpactPresent, JSON.stringify(result));
}

// ===========================================================================
// 8. Incomplete macro/news data -> CAUTION
// ===========================================================================
{
  const result = validatePreEntry(input({ macro: macro({ dataAvailability: "PARTIAL" }) }));
  check("8a. macro.dataAvailability === PARTIAL -> CAUTION, macroDataIncomplete true", result.status === "CAUTION" && result.signals.macroDataIncomplete, JSON.stringify(result));
}
{
  const result = validatePreEntry(input({ eventImpact: eventImpact({ newsAvailability: "UNAVAILABLE" }) }));
  check("8b. eventImpact.newsAvailability === UNAVAILABLE -> CAUTION, newsDataIncomplete true", result.status === "CAUTION" && result.signals.newsDataIncomplete, JSON.stringify(result));
}

// ===========================================================================
// 9. Qualification itself CAUTION, nothing else wrong -> CAUTION
// ===========================================================================
{
  const result = validatePreEntry(input({ qualification: qualification({ status: "CAUTION" as QualificationStatus }) }));
  check("9. qualification.status === CAUTION alone -> CAUTION, qualificationCaution true", result.status === "CAUTION" && result.signals.qualificationCaution, JSON.stringify(result));
}

// ===========================================================================
// 10. Priority order — BLOCKED (elevated event risk) outranks CAUTION-only concerns
// ===========================================================================
{
  const result = validatePreEntry(
    input({
      macro: macro({ eventRisk: "ELEVATED", dataAvailability: "PARTIAL" }),
      eventImpact: eventImpact({ conflictingImpact: true }),
      qualification: qualification({ status: "CAUTION" as QualificationStatus, signals: { sourceEligible: true, canonicalAssessmentPresent: true, gradeQualifies: true, riskValid: false, negativeMemorySignalPresent: false, cautionConstraintPresent: true } }),
    }),
  );
  check("10. elevated event risk + partial data + conflicting impact + CAUTION qualification -> BLOCKED (highest priority), never CAUTION", result.status === "BLOCKED", JSON.stringify(result));
}

// ===========================================================================
// 11. Priority order — CONFLICTED qualification outranks elevated event risk
// ===========================================================================
{
  const result = validatePreEntry(
    input({
      qualification: qualification({ status: "CONFLICTED" as QualificationStatus, signals: { sourceEligible: true, canonicalAssessmentPresent: true, gradeQualifies: true, riskValid: true, negativeMemorySignalPresent: true, cautionConstraintPresent: false } }),
      macro: macro({ eventRisk: "ELEVATED" }),
    }),
  );
  check("11. qualification CONFLICTED + elevated event risk both present -> BLOCKED either way (both map to BLOCKED, qualificationConflicted must be true)", result.status === "BLOCKED" && result.signals.qualificationConflicted && result.signals.macroEventRiskElevated, JSON.stringify(result));
}

// ===========================================================================
// 12. Priority order — INSUFFICIENT_CONTEXT outranks everything, including a CONFLICTED-shaped qualification
// ===========================================================================
{
  const result = validatePreEntry(input({ macro: null, qualification: qualification({ status: "CONFLICTED" as QualificationStatus }) }));
  check("12. macro === null even with qualification CONFLICTED -> INSUFFICIENT_CONTEXT (highest priority)", result.status === "INSUFFICIENT_CONTEXT" && !result.signals.macroPresent, JSON.stringify(result));
}

// ===========================================================================
// 13. Symbol / source / generatedAt are carried through verbatim from decisionContext, never re-derived
// ===========================================================================
{
  const result = validatePreEntry(input({ decisionContext: decisionContext({ symbol: "ETHUSDT", generatedAt: "2026-03-15T09:30:00.000Z" }) }));
  check("13. symbol/source/generatedAt copied verbatim from decisionContext", result.symbol === "ETHUSDT" && result.source === "ELVOID_PRO_ORACLE" && result.generatedAt === "2026-03-15T09:30:00.000Z", JSON.stringify(result));
}

// ===========================================================================
// 14. Determinism — same input always produces byte-identical output
// ===========================================================================
{
  const fixtureInput = input({ eventImpact: eventImpact({ conflictingImpact: true }), macro: macro({ dataAvailability: "PARTIAL" }) });
  const a = validatePreEntry(fixtureInput);
  const b = validatePreEntry(fixtureInput);
  check("14. same input -> byte-identical output across two calls", JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

// ===========================================================================
// 15. Input immutability — validatePreEntry never mutates the input or its nested objects
// ===========================================================================
{
  const fixtureInput = input({ eventImpact: eventImpact({ conflictingImpact: true }), macro: macro({ dataAvailability: "PARTIAL" }) });
  const beforeSnapshot = JSON.parse(JSON.stringify(fixtureInput));
  validatePreEntry(fixtureInput);
  check("15. input deep-equal before/after validatePreEntry() call", JSON.stringify(fixtureInput) === JSON.stringify(beforeSnapshot), "input mutated");
}

/** Strips `//` line comments and `/* ... *\/` block comments so static scans below only see actual code, never prose mentioning a forbidden token for documentation purposes. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// ===========================================================================
// 16. Static scan — no oracle/execute/paperTrader/engine/supabase IMPORT statement anywhere in this phase's two files (code only, comments excluded)
// ===========================================================================
{
  const contractsCode = stripComments(readFileSync(new URL("../../lib/ai/preEntryValidation/contracts.ts", import.meta.url), "utf8"));
  const validateCode = stripComments(readFileSync(new URL("../../lib/ai/preEntryValidation/validate.ts", import.meta.url), "utf8"));
  const importLines = [...contractsCode.matchAll(/^import .*$/gm), ...validateCode.matchAll(/^import .*$/gm)].map((m) => m[0]);
  const forbidden = ["lib/ai/oracle/grading", "lib/ai/oracle/execute", "lib/elvoid/paperTrader", "lib/elvoid/engine", "lib/supabase", "lib/ai/cognitive"];
  const violations = importLines.filter((line) => forbidden.some((needle) => line.includes(needle)));
  check("16. no forbidden import statement found in contracts.ts/validate.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 17. Static scan — no Date.now()/Math.random()/fetch( CALL anywhere in validate.ts (code only, comments excluded)
// ===========================================================================
{
  const validateCode = stripComments(readFileSync(new URL("../../lib/ai/preEntryValidation/validate.ts", import.meta.url), "utf8"));
  check("17. validate.ts contains no Date.now()/Math.random()/fetch( call", !validateCode.includes("Date.now(") && !validateCode.includes("Math.random(") && !validateCode.includes("fetch("), "found a wall-clock/random/network call");
}

// ===========================================================================
// 18. No free-text/reason/explanation field anywhere in contracts.ts's exported types
// ===========================================================================
{
  const contractsSrc = readFileSync(new URL("../../lib/ai/preEntryValidation/contracts.ts", import.meta.url), "utf8");
  const forbiddenFieldNames = ["reason:", "explanation:", "narrative:", "reasoning:", "summary:"];
  const violations = forbiddenFieldNames.filter((needle) => contractsSrc.includes(needle));
  check("18. no free-text reason/explanation/narrative/reasoning/summary field declared", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 19. No canonical Oracle grading/decision field name or EXECUTE/WAIT/REJECT literal anywhere in contracts.ts or validate.ts
// ===========================================================================
{
  const contractsSrc = readFileSync(new URL("../../lib/ai/preEntryValidation/contracts.ts", import.meta.url), "utf8");
  const validateSrc = readFileSync(new URL("../../lib/ai/preEntryValidation/validate.ts", import.meta.url), "utf8");
  const forbiddenTokens = ["\"EXECUTE\"", "\"WAIT\"", "\"REJECT\"", "\"EXPIRE\""];
  const violations = forbiddenTokens.filter((needle) => contractsSrc.includes(needle) || validateSrc.includes(needle));
  check("19. no EXECUTE/WAIT/REJECT/EXPIRE literal anywhere in either file", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 20. Full four-status coverage sanity — each status is reachable
// ===========================================================================
{
  const statuses = new Set([
    validatePreEntry(input()).status,
    validatePreEntry(input({ eventImpact: eventImpact({ conflictingImpact: true }) })).status,
    validatePreEntry(input({ macro: macro({ eventRisk: "ELEVATED" }) })).status,
    validatePreEntry(input({ macro: null })).status,
  ]);
  check("20. VALID, CAUTION, BLOCKED, INSUFFICIENT_CONTEXT all reachable", statuses.has("VALID") && statuses.has("CAUTION") && statuses.has("BLOCKED") && statuses.has("INSUFFICIENT_CONTEXT"), `statuses: ${JSON.stringify([...statuses])}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
