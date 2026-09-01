// ---------------------------------------------------------------------------
// Phase 8.2.6 — Autonomous Decision Engine fixtures (dev-only, not part of
// the app). Pure/offline — hand-built `AutonomousDecisionEngineInput`
// fixtures exercised against `decide.ts`'s pure `decideAutonomous()` only.
// This engine has no repository/persistence layer at all (none is
// introduced by this phase), so every exported function in this phase is
// exercised end-to-end by this script.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/autonomous-decision-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { decideAutonomous } from "@/lib/ai/autonomousDecision/decide";
import type { AutonomousCanonicalSnapshot, AutonomousDecisionContext, AutonomousDecisionEngineInput, AutonomousQualificationResult, MacroIntelligenceContext, MarketImpactContext, PreEntryValidationResult, PreEntryValidationStatus, QualificationStatus } from "@/lib/ai/autonomousDecision/contracts";

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

function preEntry(overrides: Partial<PreEntryValidationResult> = {}): PreEntryValidationResult {
  return {
    version: 1,
    symbol: "BTCUSDT",
    source: "ELVOID_PRO_ORACLE",
    generatedAt: GENERATED_AT,
    status: "VALID",
    signals: {
      qualificationPresent: true,
      macroPresent: true,
      eventImpactPresent: true,
      qualificationInsufficient: false,
      qualificationConflicted: false,
      qualificationCaution: false,
      riskValid: true,
      macroEventRiskElevated: false,
      eventImpactRiskElevated: false,
      conflictingImpactPresent: false,
      macroDataIncomplete: false,
      newsDataIncomplete: false,
    },
    ...overrides,
  };
}

function input(overrides: Partial<AutonomousDecisionEngineInput> = {}): AutonomousDecisionEngineInput {
  return {
    decisionContext: decisionContext(),
    qualification: qualification(),
    macro: macro(),
    eventImpact: eventImpact(),
    preEntry: preEntry(),
    ...overrides,
  };
}

// ===========================================================================
// 1. Clean, complete, both engines cleared -> EXECUTE
// ===========================================================================
{
  const result = decideAutonomous(input());
  check(
    "1. preEntry VALID + qualification QUALIFIED -> EXECUTE",
    result.decision === "EXECUTE" &&
      result.signals.preEntryValid &&
      result.signals.qualificationQualified &&
      !result.signals.requiredContextMissing &&
      !result.signals.preEntryBlocked &&
      !result.signals.qualificationConflicted,
    JSON.stringify(result),
  );
}

// ===========================================================================
// 2. Missing required context -> WAIT
// ===========================================================================
{
  const result = decideAutonomous(input({ qualification: null }));
  check("2a. qualification === null -> WAIT, requiredContextMissing true", result.decision === "WAIT" && result.signals.requiredContextMissing && !result.signals.qualificationPresent, JSON.stringify(result));
}
{
  const result = decideAutonomous(input({ macro: null }));
  check("2b. macro === null -> WAIT, requiredContextMissing true", result.decision === "WAIT" && result.signals.requiredContextMissing && !result.signals.macroPresent, JSON.stringify(result));
}
{
  const result = decideAutonomous(input({ eventImpact: null }));
  check("2c. eventImpact === null -> WAIT, requiredContextMissing true", result.decision === "WAIT" && result.signals.requiredContextMissing && !result.signals.eventImpactPresent, JSON.stringify(result));
}
{
  const result = decideAutonomous(input({ preEntry: null }));
  check("2d. preEntry === null -> WAIT, requiredContextMissing true", result.decision === "WAIT" && result.signals.requiredContextMissing && !result.signals.preEntryPresent, JSON.stringify(result));
}
{
  const result = decideAutonomous(input({ qualification: null, macro: null, eventImpact: null, preEntry: null }));
  check("2e. all four optional inputs null -> WAIT", result.decision === "WAIT" && result.signals.requiredContextMissing, JSON.stringify(result));
}

// ===========================================================================
// 3. Insufficient upstream context -> WAIT
// ===========================================================================
{
  const result = decideAutonomous(input({ qualification: qualification({ status: "INSUFFICIENT_CONTEXT" as QualificationStatus }) }));
  check("3a. qualification.status === INSUFFICIENT_CONTEXT -> WAIT, qualificationInsufficient true", result.decision === "WAIT" && result.signals.qualificationInsufficient, JSON.stringify(result));
}
{
  const result = decideAutonomous(input({ preEntry: preEntry({ status: "INSUFFICIENT_CONTEXT" as PreEntryValidationStatus }) }));
  check("3b. preEntry.status === INSUFFICIENT_CONTEXT -> WAIT, preEntryInsufficient true", result.decision === "WAIT" && result.signals.preEntryInsufficient, JSON.stringify(result));
}

// ===========================================================================
// 4. PreEntry BLOCKED -> REJECT
// ===========================================================================
{
  const result = decideAutonomous(input({ preEntry: preEntry({ status: "BLOCKED" as PreEntryValidationStatus }) }));
  check("4. preEntry.status === BLOCKED -> REJECT, preEntryBlocked true", result.decision === "REJECT" && result.signals.preEntryBlocked, JSON.stringify(result));
}

// ===========================================================================
// 5. Qualification CONFLICTED -> REJECT
// ===========================================================================
{
  const result = decideAutonomous(input({ qualification: qualification({ status: "CONFLICTED" as QualificationStatus }) }));
  check("5. qualification.status === CONFLICTED -> REJECT, qualificationConflicted true", result.decision === "REJECT" && result.signals.qualificationConflicted, JSON.stringify(result));
}

// ===========================================================================
// 6. PreEntry CAUTION -> WAIT
// ===========================================================================
{
  const result = decideAutonomous(input({ preEntry: preEntry({ status: "CAUTION" as PreEntryValidationStatus }) }));
  check("6. preEntry.status === CAUTION -> WAIT, preEntryCaution true", result.decision === "WAIT" && result.signals.preEntryCaution, JSON.stringify(result));
}

// ===========================================================================
// 7. Ambiguous — preEntry VALID but qualification not QUALIFIED (e.g. CAUTION) -> WAIT
// ===========================================================================
{
  const result = decideAutonomous(input({ qualification: qualification({ status: "CAUTION" as QualificationStatus }) }));
  check("7. preEntry VALID + qualification CAUTION (not QUALIFIED) -> WAIT (ambiguous, never EXECUTE)", result.decision === "WAIT" && result.signals.preEntryValid && !result.signals.qualificationQualified, JSON.stringify(result));
}

// ===========================================================================
// 8. Priority order — REJECT (preEntry BLOCKED) outranks a simultaneous missing-context-free ambiguous state
// ===========================================================================
{
  const result = decideAutonomous(
    input({
      preEntry: preEntry({ status: "BLOCKED" as PreEntryValidationStatus }),
      qualification: qualification({ status: "CAUTION" as QualificationStatus }),
    }),
  );
  check("8. preEntry BLOCKED + qualification CAUTION -> REJECT (BLOCKED outranks ambiguous/CAUTION path)", result.decision === "REJECT", JSON.stringify(result));
}

// ===========================================================================
// 9. Priority order — REJECT (qualification CONFLICTED) outranks preEntry CAUTION
// ===========================================================================
{
  const result = decideAutonomous(
    input({
      qualification: qualification({ status: "CONFLICTED" as QualificationStatus }),
      preEntry: preEntry({ status: "CAUTION" as PreEntryValidationStatus }),
    }),
  );
  check("9. qualification CONFLICTED + preEntry CAUTION -> REJECT (CONFLICTED outranks CAUTION)", result.decision === "REJECT" && result.signals.qualificationConflicted, JSON.stringify(result));
}

// ===========================================================================
// 10. Priority order — WAIT (missing context) outranks everything, including a BLOCKED-shaped preEntry
// ===========================================================================
{
  const result = decideAutonomous(
    input({
      macro: null,
      preEntry: preEntry({ status: "BLOCKED" as PreEntryValidationStatus }),
      qualification: qualification({ status: "CONFLICTED" as QualificationStatus }),
    }),
  );
  check("10. macro === null even with preEntry BLOCKED + qualification CONFLICTED -> WAIT (highest priority)", result.decision === "WAIT" && result.signals.requiredContextMissing, JSON.stringify(result));
}

// ===========================================================================
// 11. Priority order — INSUFFICIENT_CONTEXT upstream outranks a BLOCKED/CONFLICTED-shaped sibling
// ===========================================================================
{
  const result = decideAutonomous(
    input({
      qualification: qualification({ status: "INSUFFICIENT_CONTEXT" as QualificationStatus }),
      preEntry: preEntry({ status: "BLOCKED" as PreEntryValidationStatus }),
    }),
  );
  check("11. qualification INSUFFICIENT_CONTEXT + preEntry BLOCKED -> WAIT (insufficient-context outranks BLOCKED)", result.decision === "WAIT" && result.signals.qualificationInsufficient, JSON.stringify(result));
}

// ===========================================================================
// 12. Symbol / source / generatedAt are carried through verbatim from decisionContext, never re-derived
// ===========================================================================
{
  const result = decideAutonomous(input({ decisionContext: decisionContext({ symbol: "ETHUSDT", generatedAt: "2026-03-15T09:30:00.000Z" }) }));
  check("12. symbol/source/generatedAt copied verbatim from decisionContext", result.symbol === "ETHUSDT" && result.source === "ELVOID_PRO_ORACLE" && result.generatedAt === "2026-03-15T09:30:00.000Z", JSON.stringify(result));
}

// ===========================================================================
// 13. Determinism — same input always produces byte-identical output
// ===========================================================================
{
  const fixtureInput = input({ preEntry: preEntry({ status: "CAUTION" as PreEntryValidationStatus }) });
  const a = decideAutonomous(fixtureInput);
  const b = decideAutonomous(fixtureInput);
  check("13. same input -> byte-identical output across two calls", JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

// ===========================================================================
// 14. Input immutability — decideAutonomous never mutates the input or its nested objects
// ===========================================================================
{
  const fixtureInput = input({ preEntry: preEntry({ status: "CAUTION" as PreEntryValidationStatus }) });
  const beforeSnapshot = JSON.parse(JSON.stringify(fixtureInput));
  decideAutonomous(fixtureInput);
  check("14. input deep-equal before/after decideAutonomous() call", JSON.stringify(fixtureInput) === JSON.stringify(beforeSnapshot), "input mutated");
}

/** Strips `//` line comments and `/* ... *\/` block comments so static scans below only see actual code, never prose mentioning a forbidden token for documentation purposes. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// ===========================================================================
// 15. Static scan — no oracle/execute/paperTrader/engine/scanners/supabase IMPORT statement anywhere in this phase's two files (code only, comments excluded)
// ===========================================================================
{
  const contractsCode = stripComments(readFileSync(new URL("../../lib/ai/autonomousDecision/contracts.ts", import.meta.url), "utf8"));
  const decideCode = stripComments(readFileSync(new URL("../../lib/ai/autonomousDecision/decide.ts", import.meta.url), "utf8"));
  const importLines = [...contractsCode.matchAll(/^import .*$/gm), ...decideCode.matchAll(/^import .*$/gm)].map((m) => m[0]);
  const forbidden = ["lib/ai/oracle/grading", "lib/ai/oracle/execute", "lib/elvoid/paperTrader", "lib/elvoid/engine", "lib/elvoid/scanners", "lib/supabase", "lib/ai/cognitive"];
  const violations = importLines.filter((line) => forbidden.some((needle) => line.includes(needle)));
  check("15. no forbidden import statement found in contracts.ts/decide.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 16. Static scan — no Date.now()/Math.random()/fetch( CALL anywhere in decide.ts (code only, comments excluded)
// ===========================================================================
{
  const decideCode = stripComments(readFileSync(new URL("../../lib/ai/autonomousDecision/decide.ts", import.meta.url), "utf8"));
  check("16. decide.ts contains no Date.now()/Math.random()/fetch( call", !decideCode.includes("Date.now(") && !decideCode.includes("Math.random(") && !decideCode.includes("fetch("), "found a wall-clock/random/network call");
}

// ===========================================================================
// 17. Static scan — zero execution calls anywhere: no order placement / paperTrader / DB write function call in decide.ts
// ===========================================================================
{
  const decideCode = stripComments(readFileSync(new URL("../../lib/ai/autonomousDecision/decide.ts", import.meta.url), "utf8"));
  const forbiddenCalls = ["placeOrder(", "executeTrade(", "paperTrader.", "insert(", "supabase.", ".from(", "await fetch"];
  const violations = forbiddenCalls.filter((needle) => decideCode.includes(needle));
  check("17. decide.ts contains zero execution/persistence calls", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 18. No free-text/reason/explanation field anywhere in contracts.ts's exported types
// ===========================================================================
{
  const contractsSrc = readFileSync(new URL("../../lib/ai/autonomousDecision/contracts.ts", import.meta.url), "utf8");
  const forbiddenFieldNames = ["reason:", "explanation:", "narrative:", "reasoning:", "summary:"];
  const violations = forbiddenFieldNames.filter((needle) => contractsSrc.includes(needle));
  check("18. no free-text reason/explanation/narrative/reasoning/summary field declared", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 19. Closed enum — AutonomousDecision has exactly EXECUTE | WAIT | REJECT, never a fourth member (e.g. EXPIRE) anywhere in real output
// ===========================================================================
{
  const allDecisions = new Set<string>();
  allDecisions.add(decideAutonomous(input()).decision);
  allDecisions.add(decideAutonomous(input({ preEntry: preEntry({ status: "BLOCKED" as PreEntryValidationStatus }) })).decision);
  allDecisions.add(decideAutonomous(input({ qualification: qualification({ status: "CONFLICTED" as QualificationStatus }) })).decision);
  allDecisions.add(decideAutonomous(input({ preEntry: preEntry({ status: "CAUTION" as PreEntryValidationStatus }) })).decision);
  allDecisions.add(decideAutonomous(input({ macro: null })).decision);
  const onlyThreeMembers = [...allDecisions].every((d) => d === "EXECUTE" || d === "WAIT" || d === "REJECT");
  check("19. every produced decision is one of exactly EXECUTE/WAIT/REJECT, never EXPIRE or anything else", onlyThreeMembers && allDecisions.size <= 3, `decisions seen: ${JSON.stringify([...allDecisions])}`);
}

// ===========================================================================
// 20. Full three-decision coverage sanity — each decision is reachable
// ===========================================================================
{
  const decisions = new Set([decideAutonomous(input()).decision, decideAutonomous(input({ preEntry: preEntry({ status: "CAUTION" as PreEntryValidationStatus }) })).decision, decideAutonomous(input({ preEntry: preEntry({ status: "BLOCKED" as PreEntryValidationStatus }) })).decision]);
  check("20. EXECUTE, WAIT, REJECT all reachable", decisions.has("EXECUTE") && decisions.has("WAIT") && decisions.has("REJECT"), `decisions: ${JSON.stringify([...decisions])}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
