// ---------------------------------------------------------------------------
// Phase 8.2.0 — Autonomous Decision Context fixtures (dev-only, not part of
// the app). Pure/offline — hand-built OracleAssessment/CognitiveDecisionContext/
// DecisionMemoryResult/ConstraintValidation fixtures exercised against
// context.ts's pure buildAutonomousDecisionContext()/filterValidConstraints()
// only. No network/Binance call, no LLM call, no database access. Static
// source-scan checks cover structural guarantees that cannot be proven by
// calling a pure function alone (no decision-outcome field, no TradeGrade
// reference, no forbidden import, zero external call sites).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/autonomous-context-fixtures.ts
// ---------------------------------------------------------------------------

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { buildAutonomousDecisionContext, filterValidConstraints } from "@/lib/ai/autonomous/context";
import type { AutonomousDecisionContext, DecisionSource, ConstraintValidation, DecisionMemoryResult, CognitiveDecisionContext } from "@/lib/ai/autonomous/contracts";
import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";

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

function assessment(overrides: Partial<OracleAssessment> = {}): OracleAssessment {
  return {
    symbol: "BTCUSDT",
    timestamp: "2026-03-01T00:00:00.000Z",
    grade: "A",
    side: "LONG",
    score: { long: 7, short: 2 },
    confidence: 68,
    independentConfirmationClusters: 2,
    supportingEvidence: ["fixture supporting evidence"],
    contradictingEvidence: [],
    dataQuality: [{ source: "market_structure", quality: "real" }],
    riskStatus: "valid",
    risk: { entry: 60000, stopLoss: 59000, takeProfit: 63000, riskReward: 3 },
    gradeReason: "fixture grade reason",
    invalidation: "fixture invalidation",
    mainRisk: "fixture main risk",
    ...overrides,
  };
}

function cognitiveContext(overrides: Partial<CognitiveDecisionContext> = {}): CognitiveDecisionContext {
  return {
    observation: {
      generatedAt: "2026-03-01T00:00:00.000Z",
      symbol: "BTCUSDT",
      sourceAssessment: { side: "LONG", grade: "A", confidence: 68, riskStatus: "valid", invalidation: "fixture invalidation" },
      evidence: [],
      context: {
        confluenceAvailable: true,
        mtfAvailable: true,
        regimeAvailable: true,
        liquidityAvailable: true,
        scenariosAvailable: true,
        contradictionsAvailable: true,
        arbitrationAvailable: true,
        riskIntelligenceAvailable: true,
      },
      quality: "real",
    },
    hypotheses: null,
    conflict: null,
    risk: null,
    ...overrides,
  } as CognitiveDecisionContext;
}

function memoryResult(overrides: Partial<DecisionMemoryResult> = {}): DecisionMemoryResult {
  return { matchedExperiences: [], matchedEvaluations: [], matchedPatterns: [], ...overrides };
}

function constraintValidation(overrides: Partial<ConstraintValidation> = {}): ConstraintValidation {
  return {
    version: 1,
    source: "AI_SIGNAL",
    evidenceTag: "HIGH_RISK_PRESENT",
    constraintType: "INCREASE_CAUTION",
    status: "VALID",
    signals: { sampleSizeAdequate: true, withinFreshnessWindow: true, structurallyConsistent: true, overfitRiskFlag: false },
    basis: { occurrenceCount: 12, dominantClassShare: 0.7, statisticalConfidence: 0.5, firstObservedAt: "2026-01-01T00:00:00.000Z", lastObservedAt: "2026-02-01T00:00:00.000Z" },
    validatedAt: "2026-02-02T00:00:00.000Z",
    ...overrides,
  };
}

async function readSource(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf-8");
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) out.push(full);
  }
  return out;
}

// ===========================================================================
// 1. Basic construction — all four inputs present
// ===========================================================================
{
  const a = assessment();
  const cog = cognitiveContext();
  const mem = memoryResult();
  const constraints = [constraintValidation()];
  const ctx = buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:05:00.000Z", a, cog, mem, constraints);
  check(
    "1. Basic construction with all four inputs present populates canonical/cognitive/memory/validConstraints",
    ctx.canonical !== null && ctx.canonical.grade === "A" && ctx.cognitive === cog && ctx.memory === mem && ctx.validConstraints.length === 1 && ctx.version === 1,
    JSON.stringify(ctx)
  );
}

// ===========================================================================
// 2. assessment === null -> canonical === null, never fabricated
// ===========================================================================
{
  const ctx = buildAutonomousDecisionContext("AI_SIGNAL", "ETHUSDT", "2026-03-01T00:05:00.000Z", null, null, null, null);
  check("2. assessment=null -> canonical=null (not a fabricated empty object)", ctx.canonical === null, JSON.stringify(ctx.canonical));
}

// ===========================================================================
// 3. cognitive carried through by reference, never cloned
// ===========================================================================
{
  const cog = cognitiveContext();
  const ctx = buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:00:00.000Z", null, cog, null, null);
  check("3. cognitive is the exact same object reference (===), never cloned/rebuilt", ctx.cognitive === cog, "reference mismatch");
}

// ===========================================================================
// 4. memory carried through by reference, never cloned
// ===========================================================================
{
  const mem = memoryResult({ matchedPatterns: [] });
  const ctx = buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:00:00.000Z", null, null, mem, null);
  check("4. memory is the exact same object reference (===), never cloned/rebuilt", ctx.memory === mem, "reference mismatch");
}

// ===========================================================================
// 5. cognitive/memory both null -> both explicit null, not fabricated
// ===========================================================================
{
  const ctx = buildAutonomousDecisionContext("ELVOID_PRO_ORACLE", "BTCUSDT", "2026-03-01T00:00:00.000Z", null, null, null, null);
  check("5. cognitive=null and memory=null both stay explicit null when not supplied", ctx.cognitive === null && ctx.memory === null, JSON.stringify(ctx));
}

// ===========================================================================
// 6. constraints === null -> validConstraints = [] (never null)
// ===========================================================================
{
  const ctx = buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:00:00.000Z", null, null, null, null);
  check("6. constraints=null -> validConstraints is [] (Array, never null/undefined)", Array.isArray(ctx.validConstraints) && ctx.validConstraints.length === 0, JSON.stringify(ctx.validConstraints));
}

// ===========================================================================
// 7. Only status === "VALID" rows ever reach validConstraints
// ===========================================================================
{
  const constraints: ConstraintValidation[] = [
    constraintValidation({ evidenceTag: "HIGH_RISK_PRESENT", status: "VALID" }),
    constraintValidation({ evidenceTag: "LOW_RISK_PRESENT", status: "PROVISIONAL", signals: { sampleSizeAdequate: false, withinFreshnessWindow: true, structurallyConsistent: true, overfitRiskFlag: false } }),
    constraintValidation({ evidenceTag: "MID_GRADE", status: "STALE", signals: { sampleSizeAdequate: true, withinFreshnessWindow: false, structurallyConsistent: true, overfitRiskFlag: false } }),
    constraintValidation({ evidenceTag: "HIGH_GRADE", status: "INCONSISTENT", signals: { sampleSizeAdequate: true, withinFreshnessWindow: true, structurallyConsistent: false, overfitRiskFlag: false } }),
    constraintValidation({ evidenceTag: "MODERATE_RISK_PRESENT", status: "OVERFIT_RISK", signals: { sampleSizeAdequate: true, withinFreshnessWindow: true, structurallyConsistent: true, overfitRiskFlag: true } }),
  ];
  const result = filterValidConstraints(constraints, "AI_SIGNAL");
  check("7. filterValidConstraints excludes PROVISIONAL/STALE/INCONSISTENT/OVERFIT_RISK, keeps only VALID", result.length === 1 && result[0].evidenceTag === "HIGH_RISK_PRESENT" && result[0].status === "VALID", JSON.stringify(result));
}

// ===========================================================================
// 8. Source isolation — VALID rows from the wrong source are excluded
// ===========================================================================
{
  const constraints: ConstraintValidation[] = [constraintValidation({ source: "AI_SIGNAL", evidenceTag: "HIGH_RISK_PRESENT", status: "VALID" }), constraintValidation({ source: "ELVOID_PRO_ORACLE", evidenceTag: "HIGH_RISK_PRESENT", status: "VALID" })];
  const aiResult = filterValidConstraints(constraints, "AI_SIGNAL");
  const oracleResult = filterValidConstraints(constraints, "ELVOID_PRO_ORACLE");
  check(
    "8. Two VALID rows, same evidenceTag, different source -> each query returns only its own source's row, never both",
    aiResult.length === 1 && aiResult[0].source === "AI_SIGNAL" && oracleResult.length === 1 && oracleResult[0].source === "ELVOID_PRO_ORACLE",
    `ai=${JSON.stringify(aiResult)} oracle=${JSON.stringify(oracleResult)}`
  );
}

// ===========================================================================
// 9. buildAutonomousDecisionContext applies the same source-isolation rule via validConstraints
// ===========================================================================
{
  const constraints: ConstraintValidation[] = [constraintValidation({ source: "ELVOID_PRO_ORACLE", status: "VALID" })];
  const ctx = buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:00:00.000Z", null, null, null, constraints);
  check("9. An AI_SIGNAL context never includes an ELVOID_PRO_ORACLE-sourced VALID constraint", ctx.validConstraints.length === 0, JSON.stringify(ctx.validConstraints));
}

// ===========================================================================
// 10. Determinism — identical inputs -> deep-equal (JSON) output across repeated calls
// ===========================================================================
{
  const a = assessment();
  const cog = cognitiveContext();
  const mem = memoryResult();
  const constraints = [constraintValidation()];
  const ctx1 = buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:00:00.000Z", a, cog, mem, constraints);
  const ctx2 = buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:00:00.000Z", a, cog, mem, constraints);
  check("10. Same inputs called twice -> byte-identical (JSON) output", JSON.stringify(ctx1) === JSON.stringify(ctx2), `${JSON.stringify(ctx1)} vs ${JSON.stringify(ctx2)}`);
}

// ===========================================================================
// 11. Input immutability — constraints array/objects are never mutated
// ===========================================================================
{
  const constraints = [constraintValidation({ status: "VALID" }), constraintValidation({ status: "STALE", signals: { sampleSizeAdequate: true, withinFreshnessWindow: false, structurallyConsistent: true, overfitRiskFlag: false } })];
  const before = JSON.stringify(constraints);
  buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:00:00.000Z", null, null, null, constraints);
  check("11. buildAutonomousDecisionContext does not mutate its constraints input array/objects", JSON.stringify(constraints) === before, "input was mutated");
}

// ===========================================================================
// 12. Identity fields (source/symbol/generatedAt) pass through exactly as given
// ===========================================================================
{
  const a = assessment({ symbol: "SOLUSDT" }); // deliberately different from the caller-supplied `symbol` param
  const ctx = buildAutonomousDecisionContext("ELVOID_PRO_ORACLE", "BTCUSDT", "2026-03-05T12:00:00.000Z", a, null, null, null);
  check(
    "12. Caller-supplied source/symbol/generatedAt are used verbatim as the context's own identity, independent of assessment.symbol",
    ctx.source === "ELVOID_PRO_ORACLE" && ctx.symbol === "BTCUSDT" && ctx.generatedAt === "2026-03-05T12:00:00.000Z" && ctx.canonical?.symbol === "SOLUSDT",
    JSON.stringify(ctx)
  );
}

// ===========================================================================
// 13. Never returns null, even with every optional input absent
// ===========================================================================
{
  const ctx = buildAutonomousDecisionContext("AI_SIGNAL", "BTCUSDT", "2026-03-01T00:00:00.000Z", null, null, null, null);
  check("13. buildAutonomousDecisionContext always returns an object, never null, even with every optional input absent", ctx !== null && typeof ctx === "object" && ctx.version === 1, JSON.stringify(ctx));
}

// ===========================================================================
// 14. canonical never carries the full OracleAssessment — only the named narrow fields
// ===========================================================================
{
  const a = assessment();
  const ctx = buildAutonomousDecisionContext("ELVOID_PRO_ORACLE", "BTCUSDT", "2026-03-01T00:00:00.000Z", a, null, null, null);
  const keys = ctx.canonical ? Object.keys(ctx.canonical).sort() : [];
  check(
    "14. canonical has exactly the 7 narrow fields [confidence, grade, invalidation, riskStatus, side, symbol, timestamp] — never score/evidence/risk/gradeReason/mainRisk/dataQuality",
    JSON.stringify(keys) === JSON.stringify(["confidence", "grade", "invalidation", "riskStatus", "side", "symbol", "timestamp"]),
    JSON.stringify(keys)
  );
}

// ===========================================================================
// 15. Static scan — no decision-outcome literal anywhere in contracts.ts/context.ts
// ===========================================================================
{
  const contractsSrc = stripComments(await readSource("../../lib/ai/autonomous/contracts.ts"));
  const contextSrc = stripComments(await readSource("../../lib/ai/autonomous/context.ts"));
  // Search only for these as quoted string literals / type-union members, not as prose.
  const forbidden = ['"EXECUTE"', '"WAIT"', '"REJECT"', '"EXPIRE"'];
  const offenders = forbidden.filter((term) => contractsSrc.includes(term) || contextSrc.includes(term));
  check("15. Neither contracts.ts nor context.ts's actual code (comments excluded) contains the string literal \"EXECUTE\"/\"WAIT\"/\"REJECT\"/\"EXPIRE\" — no decision-outcome field or value exists in this phase", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 16. Static scan — TradeGrade is never referenced by this module
// ===========================================================================
{
  const contractsSrc = stripComments(await readSource("../../lib/ai/autonomous/contracts.ts"));
  const contextSrc = stripComments(await readSource("../../lib/ai/autonomous/context.ts"));
  const offenders = ["TradeGrade"].filter((term) => contractsSrc.includes(term) || contextSrc.includes(term));
  check("16. Neither contracts.ts nor context.ts's actual code (comments excluded) references TradeGrade — the AI Signal engine's grade scale is never merged with OracleGrade here", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 17. Static scan — no forbidden imports (canonical/execution engines) in either file
// ===========================================================================
{
  const contractsSrc = stripComments(await readSource("../../lib/ai/autonomous/contracts.ts"));
  const contextSrc = stripComments(await readSource("../../lib/ai/autonomous/context.ts"));
  const forbiddenImports = ["oracle/grading", "oracle/execute", "elvoid/paperTrader", "elvoid/engine", "elvoid/scanners", "adaptiveConstraint/generate", "failurePatterns/detect", "from \"@/lib/supabase\"", "learning/db"];
  const offenders = forbiddenImports.filter((term) => contractsSrc.includes(term) || contextSrc.includes(term));
  check("17. Neither file imports from grading.ts/execute.ts/paperTrader.ts/engine.ts/scanners.ts/adaptiveConstraint's generator/failurePatterns' detector/Main or Learning Supabase clients — type-only contracts from earlier phases only", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 18. Static scan — purity of context.ts (no Date.now/Math.random/fetch/network)
// ===========================================================================
{
  const contextSrc = stripComments(await readSource("../../lib/ai/autonomous/context.ts"));
  const forbidden = ["Date.now(", "Math.random(", "fetch(", "Supabase", "supabase", "Binance", "binance", "await "];
  const offenders = forbidden.filter((term) => contextSrc.includes(term));
  check("18. context.ts's actual code (comments excluded) is synchronous and contains none of: Date.now/Math.random/fetch/Supabase/Binance/await — pure, DB-free, network-free, non-wall-clock-dependent", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 19. Static scan — no write operation anywhere in either new file
// ===========================================================================
{
  const contractsSrc = stripComments(await readSource("../../lib/ai/autonomous/contracts.ts"));
  const contextSrc = stripComments(await readSource("../../lib/ai/autonomous/context.ts"));
  const forbiddenWriteTerms = [".insert(", ".upsert(", ".update(", ".delete(", ".rpc("];
  const offenders = forbiddenWriteTerms.filter((term) => contractsSrc.includes(term) || contextSrc.includes(term));
  check("19. Neither contracts.ts nor context.ts contains any .insert(/.upsert(/.update(/.delete(/.rpc( call — read-only by construction, zero write path", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 20. Repo-wide scan — lib/ai/autonomous/* has zero external call sites (UNWIRED)
// ===========================================================================
{
  const repoRoot = new URL("../../", import.meta.url).pathname;
  const dirsToScan = ["lib", "app", "components"];
  const offenders: string[] = [];
  for (const dirName of dirsToScan) {
    const files = await walk(path.join(repoRoot, dirName));
    for (const file of files) {
      if (file.includes(`${path.sep}lib${path.sep}ai${path.sep}autonomous${path.sep}`)) continue; // the module's own files don't count as external callers
      const src = await readFile(file, "utf-8");
      if (src.includes("ai/autonomous")) offenders.push(path.relative(repoRoot, file));
    }
  }
  check("20. No file under lib/, app/, or components/ (outside lib/ai/autonomous itself) imports from lib/ai/autonomous/* — zero external call sites, fully unwired", offenders.length === 0, `found references in: ${offenders.join(", ")}`);
}

console.log(failures === 0 ? `\n✓ ${passed}/${passed} Autonomous Decision Context fixtures passed.` : `\n${failures} Autonomous Decision Context fixture(s) FAILED (${passed} passed).`);
if (failures > 0) process.exitCode = 1;
