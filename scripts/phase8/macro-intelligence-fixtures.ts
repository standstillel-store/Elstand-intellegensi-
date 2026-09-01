// ---------------------------------------------------------------------------
// Phase 8.2.3 — Macro Intelligence Integration fixtures (dev-only, not part
// of the app). Pure/offline — hand-built `EconomicEvent[]` calendars
// exercised against `analyze.ts`'s pure `analyzeMacroIntelligence()` only.
// This phase has no repository/persistence layer at all, so unlike several
// 8.1.x fixture scripts there is no "repository requires a live DB, skipped
// here" caveat — every exported function this phase introduces is
// exercised end-to-end by this script.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/macro-intelligence-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { analyzeMacroIntelligence } from "@/lib/ai/macroIntelligence/analyze";
import {
  MACRO_PROXIMITY_IMMINENT_HOURS,
  MACRO_PROXIMITY_NEAR_HOURS,
  MACRO_PROXIMITY_UPCOMING_HOURS,
} from "@/lib/ai/macroIntelligence/contracts";
import type { EconomicEvent, MacroIntelligenceInput } from "@/lib/ai/macroIntelligence/contracts";

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

const ASOF = "2026-02-01T00:00:00.000Z";
const ASOF_MS = Date.parse(ASOF);

function isoAtHoursAway(hours: number): string {
  return new Date(ASOF_MS + hours * 3_600_000).toISOString();
}

function event(overrides: Partial<EconomicEvent> = {}): EconomicEvent {
  return {
    title: "US CPI y/y",
    country: "US",
    date: isoAtHoursAway(3),
    impact: "high",
    forecast: "3.2%",
    previous: "3.1%",
    ...overrides,
  };
}

function input(calendar: EconomicEvent[], asOf: string = ASOF): MacroIntelligenceInput {
  return { asOf, calendar };
}

// ===========================================================================
// 1. No macro data — empty calendar -> UNAVAILABLE, UNKNOWN everywhere, nothing fabricated
// ===========================================================================
{
  const ctx = analyzeMacroIntelligence(input([]));
  check("1a. empty calendar -> dataAvailability UNAVAILABLE", ctx.dataAvailability === "UNAVAILABLE", ctx.dataAvailability);
  check("1b. empty calendar -> macroRegime UNKNOWN", ctx.macroRegime === "UNKNOWN", ctx.macroRegime);
  check("1c. empty calendar -> eventRisk UNKNOWN", ctx.eventRisk === "UNKNOWN", ctx.eventRisk);
  check("1d. empty calendar -> eventProximity UNKNOWN", ctx.eventProximity === "UNKNOWN", ctx.eventProximity);
  check("1e. empty calendar -> upcomingHighImpactEvent null", ctx.upcomingHighImpactEvent === null, String(ctx.upcomingHighImpactEvent));
  check("1f. empty calendar -> directionalBias null", ctx.directionalBias === null, String(ctx.directionalBias));
  check("1g. empty calendar -> usableEventCount/totalEventCount both 0", ctx.usableEventCount === 0 && ctx.totalEventCount === 0, `${ctx.usableEventCount}/${ctx.totalEventCount}`);
}

// ===========================================================================
// 2. High-impact event NEAR (imminent) -> ELEVATED risk, IMMINENT proximity, EVENT_LIGHT regime
// ===========================================================================
{
  const ctx = analyzeMacroIntelligence(input([event({ title: "FOMC Statement", date: isoAtHoursAway(3), impact: "high" })]));
  check("2a. dataAvailability AVAILABLE", ctx.dataAvailability === "AVAILABLE", ctx.dataAvailability);
  check("2b. proximity IMMINENT (3h <= 6h)", ctx.eventProximity === "IMMINENT", ctx.eventProximity);
  check("2c. eventRisk ELEVATED", ctx.eventRisk === "ELEVATED", ctx.eventRisk);
  check("2d. macroRegime EVENT_LIGHT (1 event in 72h window)", ctx.macroRegime === "EVENT_LIGHT", ctx.macroRegime);
  check("2e. upcomingHighImpactEvent populated with correct title/hoursAway", ctx.upcomingHighImpactEvent?.title === "FOMC Statement" && ctx.upcomingHighImpactEvent?.hoursAway === 3, JSON.stringify(ctx.upcomingHighImpactEvent));
}

// ===========================================================================
// 3. High-impact event FAR away (100h, beyond the 72h window) -> DISTANT, LOW risk, QUIET regime
// ===========================================================================
{
  const ctx = analyzeMacroIntelligence(input([event({ title: "Fed Chair Speech", date: isoAtHoursAway(100), impact: "high" })]));
  check("3a. proximity DISTANT (100h > 72h)", ctx.eventProximity === "DISTANT", ctx.eventProximity);
  check("3b. eventRisk LOW", ctx.eventRisk === "LOW", ctx.eventRisk);
  check("3c. macroRegime QUIET (0 events within 72h window, even though one exists further out)", ctx.macroRegime === "QUIET", ctx.macroRegime);
  check("3d. upcomingHighImpactEvent still populated (nearest event regardless of window)", ctx.upcomingHighImpactEvent?.title === "Fed Chair Speech", JSON.stringify(ctx.upcomingHighImpactEvent));
}

// ===========================================================================
// 4. Mixed event importance — high/medium/low mixed, two high-impact events -> EVENT_HEAVY, nearest selected correctly
// ===========================================================================
{
  const calendar = [
    event({ title: "US Retail Sales", date: isoAtHoursAway(10), impact: "medium" }),
    event({ title: "EUR PMI", date: isoAtHoursAway(2), impact: "low" }),
    event({ title: "NFP", date: isoAtHoursAway(30), impact: "high" }),
    event({ title: "CPI y/y", date: isoAtHoursAway(15), impact: "high" }),
  ];
  const ctx = analyzeMacroIntelligence(input(calendar));
  check("4a. dataAvailability AVAILABLE (all 4 usable)", ctx.dataAvailability === "AVAILABLE" && ctx.usableEventCount === 4 && ctx.totalEventCount === 4, `${ctx.dataAvailability} ${ctx.usableEventCount}/${ctx.totalEventCount}`);
  check("4b. nearest high-impact event is CPI (15h), not NFP (30h) or the medium/low entries", ctx.upcomingHighImpactEvent?.title === "CPI y/y", JSON.stringify(ctx.upcomingHighImpactEvent));
  check("4c. macroRegime EVENT_HEAVY (2 high-impact events within 72h window)", ctx.macroRegime === "EVENT_HEAVY", ctx.macroRegime);
  check("4d. proximity NEAR (15h: >6h, <=24h)", ctx.eventProximity === "NEAR", ctx.eventProximity);
  check("4e. eventRisk ELEVATED (NEAR)", ctx.eventRisk === "ELEVATED", ctx.eventRisk);
}

// ===========================================================================
// 5. Missing timestamps/data — malformed entries excluded honestly -> PARTIAL
// ===========================================================================
{
  const calendar = [
    event({ title: "Bad Date Event", date: "not-a-real-date", impact: "high" }),
    event({ title: "Blank Title", date: isoAtHoursAway(5), impact: "high", title: "" }),
    event({ title: "Good Event", date: isoAtHoursAway(4), impact: "high" }),
  ];
  const ctx = analyzeMacroIntelligence(input(calendar));
  check("5a. dataAvailability PARTIAL (1 of 3 usable)", ctx.dataAvailability === "PARTIAL", ctx.dataAvailability);
  check("5b. usableEventCount 1, totalEventCount 3", ctx.usableEventCount === 1 && ctx.totalEventCount === 3, `${ctx.usableEventCount}/${ctx.totalEventCount}`);
  check("5c. only the usable event is ever selected as upcomingHighImpactEvent", ctx.upcomingHighImpactEvent?.title === "Good Event", JSON.stringify(ctx.upcomingHighImpactEvent));
}

// 5d. All-unusable calendar (non-empty but zero usable) -> UNAVAILABLE, not PARTIAL
{
  const calendar = [event({ title: "Bad Date", date: "garbage", impact: "high" })];
  const ctx = analyzeMacroIntelligence(input(calendar));
  check("5d. all-unusable non-empty calendar -> UNAVAILABLE (not PARTIAL)", ctx.dataAvailability === "UNAVAILABLE", ctx.dataAvailability);
  check("5e. all-unusable -> upcomingHighImpactEvent null, macroRegime/eventRisk UNKNOWN", ctx.upcomingHighImpactEvent === null && ctx.macroRegime === "UNKNOWN" && ctx.eventRisk === "UNKNOWN", `${ctx.upcomingHighImpactEvent} ${ctx.macroRegime} ${ctx.eventRisk}`);
}

// 5f. Unparseable input.asOf itself -> treated as UNAVAILABLE, never a thrown error / NaN leak
{
  const ctx = analyzeMacroIntelligence(input([event({ date: isoAtHoursAway(3) })], "not-a-date"));
  check("5f. unparseable asOf -> dataAvailability UNAVAILABLE, no NaN in output", ctx.dataAvailability === "UNAVAILABLE" && !JSON.stringify(ctx).includes("NaN"), JSON.stringify(ctx));
}

// ===========================================================================
// 6. Determinism — identical input -> byte-identical repeated output
// ===========================================================================
{
  const calendar = [
    event({ title: "CPI y/y", date: isoAtHoursAway(15), impact: "high" }),
    event({ title: "NFP", date: isoAtHoursAway(30), impact: "high" }),
  ];
  const a = analyzeMacroIntelligence(input(calendar));
  const b = analyzeMacroIntelligence(input(calendar));
  check("6. identical input -> byte-identical output", JSON.stringify(a) === JSON.stringify(b), "outputs diverged");
}

// 6b. Deterministic tie-break — two high-impact events at the identical hoursAway, ordered by title
{
  const calendar = [
    event({ title: "Zebra Event", date: isoAtHoursAway(10), impact: "high" }),
    event({ title: "Alpha Event", date: isoAtHoursAway(10), impact: "high" }),
  ];
  const ctx = analyzeMacroIntelligence(input(calendar));
  check("6b. tie broken by ascending title -> Alpha Event selected", ctx.upcomingHighImpactEvent?.title === "Alpha Event", JSON.stringify(ctx.upcomingHighImpactEvent));
}

// ===========================================================================
// 7. Input immutability — analyze never mutates the input calendar or its entries
// ===========================================================================
{
  const calendar = [event({ title: "CPI y/y", date: isoAtHoursAway(15), impact: "high" })];
  const testInput = input(calendar);
  const beforeSnapshot = JSON.parse(JSON.stringify(testInput));
  analyzeMacroIntelligence(testInput);
  check("7. input deep-equal before/after analyze() call", JSON.stringify(testInput) === JSON.stringify(beforeSnapshot), "input mutated");
}

// ===========================================================================
// 8. Proximity boundary exactness
// ===========================================================================
{
  const atImminent = analyzeMacroIntelligence(input([event({ date: isoAtHoursAway(MACRO_PROXIMITY_IMMINENT_HOURS) })]));
  check("8a. exactly at IMMINENT boundary (6h) -> IMMINENT", atImminent.eventProximity === "IMMINENT", atImminent.eventProximity);

  const justOverImminent = analyzeMacroIntelligence(input([event({ date: isoAtHoursAway(MACRO_PROXIMITY_IMMINENT_HOURS + 0.001) })]));
  check("8b. one moment over IMMINENT boundary -> NEAR", justOverImminent.eventProximity === "NEAR", justOverImminent.eventProximity);

  const atNear = analyzeMacroIntelligence(input([event({ date: isoAtHoursAway(MACRO_PROXIMITY_NEAR_HOURS) })]));
  check("8c. exactly at NEAR boundary (24h) -> NEAR", atNear.eventProximity === "NEAR", atNear.eventProximity);

  const justOverNear = analyzeMacroIntelligence(input([event({ date: isoAtHoursAway(MACRO_PROXIMITY_NEAR_HOURS + 0.001) })]));
  check("8d. one moment over NEAR boundary -> UPCOMING", justOverNear.eventProximity === "UPCOMING", justOverNear.eventProximity);

  const atUpcoming = analyzeMacroIntelligence(input([event({ date: isoAtHoursAway(MACRO_PROXIMITY_UPCOMING_HOURS) })]));
  check("8e. exactly at UPCOMING boundary (72h) -> UPCOMING", atUpcoming.eventProximity === "UPCOMING", atUpcoming.eventProximity);

  const justOverUpcoming = analyzeMacroIntelligence(input([event({ date: isoAtHoursAway(MACRO_PROXIMITY_UPCOMING_HOURS + 0.001) })]));
  check("8f. one moment over UPCOMING boundary -> DISTANT", justOverUpcoming.eventProximity === "DISTANT", justOverUpcoming.eventProximity);

  const justPast = analyzeMacroIntelligence(input([event({ date: isoAtHoursAway(-0.001), impact: "high" })]));
  check("8g. an already-elapsed high-impact event is never selected as upcoming", justPast.upcomingHighImpactEvent === null && justPast.eventProximity === "UNKNOWN", `${justPast.upcomingHighImpactEvent} ${justPast.eventProximity}`);
}

// ===========================================================================
// 9. Only high-impact events are ever selected as upcomingHighImpactEvent, regardless of proximity
// ===========================================================================
{
  const calendar = [
    event({ title: "Medium Event Very Close", date: isoAtHoursAway(1), impact: "medium" }),
    event({ title: "Low Event Very Close", date: isoAtHoursAway(0.5), impact: "low" }),
    event({ title: "High Event Further Out", date: isoAtHoursAway(20), impact: "high" }),
  ];
  const ctx = analyzeMacroIntelligence(input(calendar));
  check("9. medium/low-impact events never selected even when closer than the only high-impact event", ctx.upcomingHighImpactEvent?.title === "High Event Further Out", JSON.stringify(ctx.upcomingHighImpactEvent));
}

/** Strips `//` line comments and `/* ... *\/` block comments so static scans below only see actual code, never prose mentioning a forbidden token for documentation purposes. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// ===========================================================================
// 10. Static scan — no forbidden IMPORT statement anywhere in this phase's two files (code only, comments excluded)
// ===========================================================================
{
  const contractsCode = stripComments(readFileSync(new URL("../../lib/ai/macroIntelligence/contracts.ts", import.meta.url), "utf8"));
  const analyzeCode = stripComments(readFileSync(new URL("../../lib/ai/macroIntelligence/analyze.ts", import.meta.url), "utf8"));
  const importLines = [...contractsCode.matchAll(/^import .*$/gm), ...analyzeCode.matchAll(/^import .*$/gm)].map((m) => m[0]);
  const forbidden = [
    "lib/ai/oracle",
    "lib/ai/cognitive",
    "lib/ai/autonomous",
    "lib/ai/decisionQualification",
    "lib/ai/decisionTrace",
    "lib/ai/decisionOutcome",
    "lib/ai/decisionEvaluation",
    "lib/ai/decisionMemory",
    "lib/ai/failurePatterns",
    "lib/ai/adaptiveConstraint",
    "lib/ai/learningValidation",
    "lib/elvoid/paperTrader",
    "lib/elvoid/execute",
    "lib/elvoid/engine",
    "lib/supabase",
    "lib/intelligence/macroKnowledge",
  ];
  const violations = importLines.filter((line) => forbidden.some((needle) => line.includes(needle)));
  check("10. no forbidden import statement found in contracts.ts/analyze.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 11. Static scan — no Date.now()/Math.random() CALL anywhere in analyze.ts (code only, comments excluded)
// ===========================================================================
{
  const analyzeCode = stripComments(readFileSync(new URL("../../lib/ai/macroIntelligence/analyze.ts", import.meta.url), "utf8"));
  check("11. analyze.ts contains no Date.now()/Math.random() call", !analyzeCode.includes("Date.now(") && !analyzeCode.includes("Math.random("), "found a wall-clock/random call");
}

// ===========================================================================
// 12. No free-text/reason/explanation field anywhere in contracts.ts's exported types
// ===========================================================================
{
  const contractsSrc = readFileSync(new URL("../../lib/ai/macroIntelligence/contracts.ts", import.meta.url), "utf8");
  const forbiddenFieldNames = ["reason:", "explanation:", "narrative:", "reasoning:", "summary:"];
  const violations = forbiddenFieldNames.filter((needle) => contractsSrc.includes(needle));
  check("12. no free-text reason/explanation/narrative/reasoning/summary field declared", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 13. No fetch/network CALL anywhere in analyze.ts (code only, comments excluded) — reuse existing data, never fetch inside pure functions
// ===========================================================================
{
  const analyzeCode = stripComments(readFileSync(new URL("../../lib/ai/macroIntelligence/analyze.ts", import.meta.url), "utf8"));
  check("13. analyze.ts contains no fetch(...) call", !analyzeCode.includes("fetch("), "found a fetch() call — pure analysis functions must not fetch");
}

// ===========================================================================
// 14. No canonical Oracle grading field name (grade/confidence/side/riskStatus/entry/stopLoss/takeProfit/EXECUTE/WAIT/REJECT) anywhere in contracts.ts
// ===========================================================================
{
  const contractsSrc = readFileSync(new URL("../../lib/ai/macroIntelligence/contracts.ts", import.meta.url), "utf8");
  const forbidden = ["grade:", "confidence:", "side:", "riskStatus:", "stopLoss:", "takeProfit:", "\"EXECUTE\"", "\"WAIT\"", "\"REJECT\""];
  const violations = forbidden.filter((needle) => contractsSrc.includes(needle));
  check("14. no canonical Oracle/decision field declared in contracts.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
