// ---------------------------------------------------------------------------
// Phase 8.2.2 — Autonomous Decision Qualification Engine fixtures (dev-only,
// not part of the app). Pure/offline — hand-built `AutonomousDecisionContext`
// fixtures exercised against `qualify.ts`'s pure `qualifyAutonomousDecision()`
// only. This engine has no repository/persistence layer at all (none is
// introduced by this phase), so unlike several prior 8.1.x fixture scripts
// there is no "repository requires a live DB, skipped here" caveat — every
// exported function in this phase is exercised end-to-end by this script.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-qualification-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { qualifyAutonomousDecision } from "@/lib/ai/decisionQualification/qualify";
import { QUALIFIABLE_SOURCE } from "@/lib/ai/decisionQualification/contracts";
import type { AutonomousCanonicalSnapshot, AutonomousDecisionContext, DecisionSource } from "@/lib/ai/decisionQualification/contracts";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionExperienceRecord } from "@/lib/ai/decisionOutcome/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";
import type { FailurePatternCandidate } from "@/lib/ai/failurePatterns/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";

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

function evaluation(overrides: Partial<DecisionEvaluation> = {}): DecisionEvaluation {
  return {
    version: 1,
    sourceSignalId: "sig-001",
    decisionQuality: "GOOD",
    marketOutcome: "POSITIVE",
    evaluationClass: "GOOD_DECISION_GOOD_OUTCOME",
    confidenceAlignment: "ALIGNED",
    riskAlignment: "ALIGNED",
    conflictAlignment: "ALIGNED",
    hypothesisAlignment: "ALIGNED",
    evidence: ["HIGH_GRADE"],
    evaluatedAt: "2026-01-30T00:00:00.000Z",
    ...overrides,
  };
}

function pattern(overrides: Partial<FailurePatternCandidate> = {}): FailurePatternCandidate {
  return {
    version: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    evidenceTag: "HIGH_RISK_PRESENT",
    dominantEvaluationClass: "BAD_DECISION_BAD_OUTCOME",
    occurrenceCount: 8,
    dominantClassShare: 0.8,
    confidence: 0.5,
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastObservedAt: "2026-01-20T00:00:00.000Z",
    computedAt: "2026-01-25T00:00:00.000Z",
    ...overrides,
  };
}

function memory(overrides: Partial<DecisionMemoryResult> = {}): DecisionMemoryResult {
  return {
    matchedExperiences: [],
    matchedEvaluations: [],
    matchedPatterns: [],
    ...overrides,
  };
}

function validConstraint(overrides: Partial<ConstraintValidation> = {}): ConstraintValidation {
  return {
    version: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    evidenceTag: "MODERATE_RISK_PRESENT",
    constraintType: "INCREASE_CAUTION",
    status: "VALID",
    signals: {
      sampleSizeAdequate: true,
      withinFreshnessWindow: true,
      structurallyConsistent: true,
      overfitRiskFlag: false,
    },
    basis: {
      occurrenceCount: 12,
      dominantClassShare: 0.6,
      statisticalConfidence: 0.55,
      firstObservedAt: "2026-01-01T00:00:00.000Z",
      lastObservedAt: "2026-01-28T00:00:00.000Z",
    },
    validatedAt: "2026-01-29T00:00:00.000Z",
    ...overrides,
  };
}

function context(overrides: Partial<AutonomousDecisionContext> = {}): AutonomousDecisionContext {
  return {
    version: 1,
    generatedAt: GENERATED_AT,
    symbol: "BTCUSDT",
    source: QUALIFIABLE_SOURCE,
    canonical: canonical(),
    cognitive: null,
    memory: null,
    validConstraints: [],
    ...overrides,
  };
}

// ===========================================================================
// 1. Clean, eligible, no concerns -> QUALIFIED
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context());
  check(
    "1. valid grade + valid risk + no memory conflict + no constraints -> QUALIFIED",
    result.status === "QUALIFIED" &&
      result.signals.sourceEligible &&
      result.signals.canonicalAssessmentPresent &&
      result.signals.gradeQualifies &&
      result.signals.riskValid &&
      !result.signals.negativeMemorySignalPresent &&
      !result.signals.cautionConstraintPresent,
    JSON.stringify(result),
  );
}

// ===========================================================================
// 2. Wrong source -> INSUFFICIENT_CONTEXT
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ source: "AI_SIGNAL" as DecisionSource }));
  check("2. source !== ELVOID_PRO_ORACLE -> INSUFFICIENT_CONTEXT, sourceEligible false", result.status === "INSUFFICIENT_CONTEXT" && !result.signals.sourceEligible, JSON.stringify(result));
}

// ===========================================================================
// 3. No canonical assessment -> INSUFFICIENT_CONTEXT
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ canonical: null }));
  check(
    "3. canonical === null -> INSUFFICIENT_CONTEXT, canonicalAssessmentPresent false, gradeQualifies false",
    result.status === "INSUFFICIENT_CONTEXT" && !result.signals.canonicalAssessmentPresent && !result.signals.gradeQualifies,
    JSON.stringify(result),
  );
}

// ===========================================================================
// 4. NO_TRADE grade -> INSUFFICIENT_CONTEXT
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ canonical: canonical({ grade: "NO_TRADE", side: null }) }));
  check("4. grade === NO_TRADE -> INSUFFICIENT_CONTEXT, canonicalAssessmentPresent true, gradeQualifies false", result.status === "INSUFFICIENT_CONTEXT" && result.signals.canonicalAssessmentPresent && !result.signals.gradeQualifies, JSON.stringify(result));
}

// ===========================================================================
// 5. Negative matched evaluation present -> CONFLICTED
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ memory: memory({ matchedEvaluations: [evaluation({ evaluationClass: "BAD_DECISION_BAD_OUTCOME" })] }) }));
  check("5a. matchedEvaluations contains BAD_DECISION_BAD_OUTCOME -> CONFLICTED", result.status === "CONFLICTED" && result.signals.negativeMemorySignalPresent, JSON.stringify(result));
}
{
  const result = qualifyAutonomousDecision(context({ memory: memory({ matchedEvaluations: [evaluation({ evaluationClass: "GOOD_DECISION_BAD_OUTCOME" })] }) }));
  check("5b. matchedEvaluations contains GOOD_DECISION_BAD_OUTCOME -> CONFLICTED", result.status === "CONFLICTED" && result.signals.negativeMemorySignalPresent, JSON.stringify(result));
}
{
  const result = qualifyAutonomousDecision(context({ memory: memory({ matchedEvaluations: [evaluation({ evaluationClass: "GOOD_DECISION_GOOD_OUTCOME" })] }) }));
  check("5c. matchedEvaluations with only a positive class -> negativeMemorySignalPresent false, not CONFLICTED", !result.signals.negativeMemorySignalPresent && result.status !== "CONFLICTED", JSON.stringify(result));
}

// ===========================================================================
// 6. Matched failure pattern present -> CONFLICTED
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ memory: memory({ matchedPatterns: [pattern()] }) }));
  check("6. matchedPatterns non-empty -> CONFLICTED", result.status === "CONFLICTED" && result.signals.negativeMemorySignalPresent, JSON.stringify(result));
}

// ===========================================================================
// 7. memory === null -> negativeMemorySignalPresent must be false (not fabricated as conflict)
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ memory: null }));
  check("7. memory === null -> negativeMemorySignalPresent false, not CONFLICTED", !result.signals.negativeMemorySignalPresent && result.status !== "CONFLICTED", JSON.stringify(result));
}

// ===========================================================================
// 8. Invalid risk status -> CAUTION
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ canonical: canonical({ riskStatus: "invalid" }) }));
  check("8a. riskStatus === invalid -> CAUTION", result.status === "CAUTION" && !result.signals.riskValid, JSON.stringify(result));
}
{
  const result = qualifyAutonomousDecision(context({ canonical: canonical({ riskStatus: "unavailable" }) }));
  check("8b. riskStatus === unavailable -> CAUTION", result.status === "CAUTION" && !result.signals.riskValid, JSON.stringify(result));
}

// ===========================================================================
// 9. VALID constraint present, risk otherwise valid, no memory conflict -> CAUTION
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ validConstraints: [validConstraint()] }));
  check("9. validConstraints non-empty -> CAUTION, cautionConstraintPresent true", result.status === "CAUTION" && result.signals.cautionConstraintPresent, JSON.stringify(result));
}

// ===========================================================================
// 10. CONFLICTED outranks CAUTION when both risk-invalid and negative memory apply
// ===========================================================================
{
  const result = qualifyAutonomousDecision(
    context({
      canonical: canonical({ riskStatus: "invalid" }),
      memory: memory({ matchedPatterns: [pattern()] }),
      validConstraints: [validConstraint()],
    }),
  );
  check("10. negative memory + invalid risk + constraint all present -> CONFLICTED (highest priority), never CAUTION", result.status === "CONFLICTED", JSON.stringify(result));
}

// ===========================================================================
// 11. INSUFFICIENT_CONTEXT outranks everything, including a present negative memory signal
// ===========================================================================
{
  const result = qualifyAutonomousDecision(
    context({
      canonical: null,
      memory: memory({ matchedPatterns: [pattern()] }),
      validConstraints: [validConstraint()],
    }),
  );
  check("11. canonical === null even with negative memory + constraint present -> INSUFFICIENT_CONTEXT (highest priority)", result.status === "INSUFFICIENT_CONTEXT", JSON.stringify(result));
}

// ===========================================================================
// 12. cognitive is never read — presence/absence has zero effect on status/signals
// ===========================================================================
{
  const withoutCognitive = qualifyAutonomousDecision(context({ cognitive: null }));
  const withCognitive = qualifyAutonomousDecision(
    context({
      // @ts-expect-error — minimal structural stand-in is sufficient; this
      // fixture only asserts `cognitive` presence has zero effect on output,
      // it never inspects `cognitive`'s own shape.
      cognitive: { anything: "non-null" },
    }),
  );
  check("12. cognitive null vs non-null -> identical status/signals (never consulted)", withoutCognitive.status === withCognitive.status && JSON.stringify(withoutCognitive.signals) === JSON.stringify(withCognitive.signals), `${JSON.stringify(withoutCognitive)} vs ${JSON.stringify(withCognitive)}`);
}

// ===========================================================================
// 13. Symbol / source / generatedAt are carried through verbatim, never re-derived
// ===========================================================================
{
  const result = qualifyAutonomousDecision(context({ symbol: "ETHUSDT", generatedAt: "2026-03-15T09:30:00.000Z" }));
  check("13. symbol/source/generatedAt copied verbatim from context", result.symbol === "ETHUSDT" && result.source === "ELVOID_PRO_ORACLE" && result.generatedAt === "2026-03-15T09:30:00.000Z", JSON.stringify(result));
}

// ===========================================================================
// 14. Determinism — same input always produces byte-identical output
// ===========================================================================
{
  const input = context({ memory: memory({ matchedPatterns: [pattern()] }), validConstraints: [validConstraint()] });
  const a = qualifyAutonomousDecision(input);
  const b = qualifyAutonomousDecision(input);
  check("14. same context -> byte-identical output across two calls", JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

// ===========================================================================
// 15. Input immutability — qualify never mutates the input context or its nested arrays/objects
// ===========================================================================
{
  const input = context({ memory: memory({ matchedPatterns: [pattern()] }), validConstraints: [validConstraint()] });
  const beforeSnapshot = JSON.parse(JSON.stringify(input));
  qualifyAutonomousDecision(input);
  check("15. context deep-equal before/after qualify() call", JSON.stringify(input) === JSON.stringify(beforeSnapshot), "context mutated");
}

/** Strips `//` line comments and `/* ... *\/` block comments so static scans below only see actual code, never prose mentioning a forbidden token for documentation purposes. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// ===========================================================================
// 16. Static scan — no oracle/execute/paperTrader/engine/supabase IMPORT statement anywhere in this phase's two files (code only, comments excluded)
// ===========================================================================
{
  const contractsCode = stripComments(readFileSync(new URL("../../lib/ai/decisionQualification/contracts.ts", import.meta.url), "utf8"));
  const qualifyCode = stripComments(readFileSync(new URL("../../lib/ai/decisionQualification/qualify.ts", import.meta.url), "utf8"));
  const importLines = [...contractsCode.matchAll(/^import .*$/gm), ...qualifyCode.matchAll(/^import .*$/gm)].map((m) => m[0]);
  const forbidden = ["lib/ai/oracle/grading", "lib/ai/oracle/execute", "lib/elvoid/paperTrader", "lib/elvoid/engine", "lib/supabase"];
  const violations = importLines.filter((line) => forbidden.some((needle) => line.includes(needle)));
  check("16. no forbidden import statement found in contracts.ts/qualify.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 17. Static scan — no Date.now()/Math.random() CALL anywhere in qualify.ts (code only, comments excluded)
// ===========================================================================
{
  const qualifyCode = stripComments(readFileSync(new URL("../../lib/ai/decisionQualification/qualify.ts", import.meta.url), "utf8"));
  check("17. qualify.ts contains no Date.now()/Math.random() call", !qualifyCode.includes("Date.now(") && !qualifyCode.includes("Math.random("), "found a wall-clock/random call");
}

// ===========================================================================
// 18. No free-text/reason/explanation field anywhere in contracts.ts's exported types
// ===========================================================================
{
  const contractsSrc = readFileSync(new URL("../../lib/ai/decisionQualification/contracts.ts", import.meta.url), "utf8");
  const forbiddenFieldNames = ["reason:", "explanation:", "narrative:", "reasoning:"];
  const violations = forbiddenFieldNames.filter((needle) => contractsSrc.includes(needle));
  check("18. no free-text reason/explanation/narrative/reasoning field declared", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 19. QUALIFIABLE_SOURCE is exactly "ELVOID_PRO_ORACLE"
// ===========================================================================
{
  check("19. QUALIFIABLE_SOURCE === \"ELVOID_PRO_ORACLE\"", QUALIFIABLE_SOURCE === "ELVOID_PRO_ORACLE", `got ${QUALIFIABLE_SOURCE}`);
}

// ===========================================================================
// 20. Full four-status coverage sanity — each status is reachable
// ===========================================================================
{
  const statuses = new Set([qualifyAutonomousDecision(context()).status, qualifyAutonomousDecision(context({ canonical: canonical({ riskStatus: "invalid" }) })).status, qualifyAutonomousDecision(context({ memory: memory({ matchedPatterns: [pattern()] }) })).status, qualifyAutonomousDecision(context({ canonical: null })).status]);
  check("20. QUALIFIED, CAUTION, CONFLICTED, INSUFFICIENT_CONTEXT all reachable", statuses.has("QUALIFIED") && statuses.has("CAUTION") && statuses.has("CONFLICTED") && statuses.has("INSUFFICIENT_CONTEXT"), `statuses: ${JSON.stringify([...statuses])}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
