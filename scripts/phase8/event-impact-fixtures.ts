// ---------------------------------------------------------------------------
// Phase 8.2.4 — News & Economic Event Impact Engine fixtures (dev-only, not
// part of the app). Pure/offline — hand-built `MacroIntelligenceContext` +
// `NewsItem[]` inputs exercised against `analyze.ts`'s pure
// `analyzeEventImpact()` only. This phase has no repository/persistence
// layer at all, so unlike several 8.1.x fixture scripts there is no
// "repository requires a live DB, skipped here" caveat — every exported
// function this phase introduces is exercised end-to-end by this script.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/event-impact-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { analyzeEventImpact } from "@/lib/ai/eventImpact/analyze";
import { NEWS_RECENT_HOURS } from "@/lib/ai/eventImpact/contracts";
import type { EventImpactInput, NewsItem } from "@/lib/ai/eventImpact/contracts";
import { analyzeMacroIntelligence } from "@/lib/ai/macroIntelligence/analyze";
import type { EconomicEvent, MacroIntelligenceContext } from "@/lib/ai/macroIntelligence/contracts";

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

function isoAtHoursOffset(hours: number): string {
  // Positive hours = future (upcoming event); negative hours = past (recent news).
  return new Date(ASOF_MS + hours * 3_600_000).toISOString();
}

function econEvent(overrides: Partial<EconomicEvent> = {}): EconomicEvent {
  return {
    title: "US CPI y/y",
    country: "US",
    date: isoAtHoursOffset(3),
    impact: "high",
    forecast: "3.2%",
    previous: "3.1%",
    ...overrides,
  };
}

let newsIdCounter = 0;
function newsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  newsIdCounter += 1;
  return {
    id: newsIdCounter,
    title: "Bitcoin holds steady amid macro uncertainty",
    url: `https://example.com/news/${newsIdCounter}`,
    source: "Example Wire",
    publishedAt: isoAtHoursOffset(-1),
    ...overrides,
  };
}

/** Builds a `MacroIntelligenceContext` via the real Phase 8.2.3 analyzer, so this phase's fixtures are always exercised against a genuine upstream shape, never a hand-faked one. */
function macroFrom(calendar: EconomicEvent[], asOf: string = ASOF): MacroIntelligenceContext {
  return analyzeMacroIntelligence({ asOf, calendar });
}

function input(macro: MacroIntelligenceContext, news: NewsItem[], asOf: string = ASOF): EventImpactInput {
  return { asOf, macro, news };
}

// ===========================================================================
// 1. No news/events at all -> UNKNOWN state, both sources UNAVAILABLE, nothing fabricated
// ===========================================================================
{
  const ctx = analyzeEventImpact(input(macroFrom([]), []));
  check("1a. no data -> eventState UNKNOWN", ctx.eventState === "UNKNOWN", ctx.eventState);
  check("1b. no data -> macroAvailability UNAVAILABLE", ctx.macroAvailability === "UNAVAILABLE", ctx.macroAvailability);
  check("1c. no data -> newsAvailability UNAVAILABLE", ctx.newsAvailability === "UNAVAILABLE", ctx.newsAvailability);
  check("1d. no data -> highImpactPresent false", ctx.highImpactPresent === false, String(ctx.highImpactPresent));
  check("1e. no data -> upcomingHighImpactEvent null", ctx.upcomingHighImpactEvent === null, String(ctx.upcomingHighImpactEvent));
  check("1f. no data -> impactRisk UNKNOWN", ctx.impactRisk === "UNKNOWN", ctx.impactRisk);
  check("1g. no data -> impactDirection null", ctx.impactDirection === null, String(ctx.impactDirection));
  check("1h. no data -> conflictingImpact false", ctx.conflictingImpact === false, String(ctx.conflictingImpact));
  check(
    "1i. no data -> uncertainty flags all reflect missing data",
    ctx.uncertainty.macroDataMissing === true && ctx.uncertainty.newsDataMissing === true && ctx.uncertainty.directionUnsupported === true,
    JSON.stringify(ctx.uncertainty)
  );
  check("1j. no data -> counts all zero", ctx.totalNewsCount === 0 && ctx.usableNewsCount === 0 && ctx.recentNewsCount === 0, JSON.stringify(ctx));
}

// ===========================================================================
// 2. Upcoming high-impact economic event, no news -> UPCOMING state, risk mirrors macro
// ===========================================================================
{
  const macro = macroFrom([econEvent({ title: "FOMC Statement", date: isoAtHoursOffset(3), impact: "high" })]);
  const ctx = analyzeEventImpact(input(macro, []));
  check("2a. eventState UPCOMING", ctx.eventState === "UPCOMING", ctx.eventState);
  check("2b. highImpactPresent true", ctx.highImpactPresent === true, String(ctx.highImpactPresent));
  check("2c. upcomingHighImpactEvent title matches", ctx.upcomingHighImpactEvent?.title === "FOMC Statement", JSON.stringify(ctx.upcomingHighImpactEvent));
  check("2d. impactRisk mirrors macro.eventRisk (ELEVATED)", ctx.impactRisk === macro.eventRisk && ctx.impactRisk === "ELEVATED", ctx.impactRisk);
  check("2e. newsAvailability UNAVAILABLE (no news supplied)", ctx.newsAvailability === "UNAVAILABLE", ctx.newsAvailability);
  check("2f. impactDirection still null even with a high-impact event", ctx.impactDirection === null, String(ctx.impactDirection));
}

// ===========================================================================
// 3. Recent news only (no upcoming high-impact economic event) -> RECENT state
// ===========================================================================
{
  const macro = macroFrom([]); // UNAVAILABLE macro side
  const news = [newsItem({ title: "Bitcoin rallies on ETF inflow", publishedAt: isoAtHoursOffset(-1), sentiment: "positive" })];
  const ctx = analyzeEventImpact(input(macro, news));
  check("3a. eventState RECENT", ctx.eventState === "RECENT", ctx.eventState);
  check("3b. recentNewsCount 1", ctx.recentNewsCount === 1, String(ctx.recentNewsCount));
  check("3c. highImpactPresent false (no economic event)", ctx.highImpactPresent === false, String(ctx.highImpactPresent));
  check("3d. impactRisk UNKNOWN (macro unavailable; news carries no severity field)", ctx.impactRisk === "UNKNOWN", ctx.impactRisk);
  check("3e. conflictingImpact false (only one sentiment side present)", ctx.conflictingImpact === false, String(ctx.conflictingImpact));
}

// ===========================================================================
// 4. Mixed / conflicting events — recent news with both positive and negative tags, plus an upcoming high-impact event
// ===========================================================================
{
  const macro = macroFrom([econEvent({ title: "NFP", date: isoAtHoursOffset(10), impact: "high" })]);
  const news = [
    newsItem({ title: "Bitcoin rallies as inflows surge", publishedAt: isoAtHoursOffset(-1), sentiment: "positive" }),
    newsItem({ title: "Exchange hacked, funds stolen", publishedAt: isoAtHoursOffset(-2), sentiment: "negative" }),
    newsItem({ title: "Market holds range ahead of data", publishedAt: isoAtHoursOffset(-3), sentiment: "neutral" }),
  ];
  const ctx = analyzeEventImpact(input(macro, news));
  check("4a. eventState UPCOMING (upcoming high-impact event takes precedence over recent news)", ctx.eventState === "UPCOMING", ctx.eventState);
  check("4b. conflictingImpact true (both positive and negative tags present in-window)", ctx.conflictingImpact === true, String(ctx.conflictingImpact));
  check("4c. recentNewsCount 3 (all three within window)", ctx.recentNewsCount === 3, String(ctx.recentNewsCount));
  check("4d. impactDirection still null despite conflicting/available sentiment tags", ctx.impactDirection === null, String(ctx.impactDirection));
  check("4e. uncertainty.directionUnsupported true even though other data is available", ctx.uncertainty.directionUnsupported === true, JSON.stringify(ctx.uncertainty));
}

// 4f. Conflicting-only news, no upcoming high-impact event -> RECENT, still conflicting
{
  const macro = macroFrom([]);
  const news = [
    newsItem({ title: "Rally continues on ETF demand", publishedAt: isoAtHoursOffset(-0.5), sentiment: "positive" }),
    newsItem({ title: "Regulator warns of crackdown", publishedAt: isoAtHoursOffset(-1.5), sentiment: "negative" }),
  ];
  const ctx = analyzeEventImpact(input(macro, news));
  check("4f. eventState RECENT with conflictingImpact true", ctx.eventState === "RECENT" && ctx.conflictingImpact === true, `${ctx.eventState} ${ctx.conflictingImpact}`);
}

// ===========================================================================
// 5. Missing timestamps/data — malformed news entries excluded honestly -> PARTIAL
// ===========================================================================
{
  const macro = macroFrom([econEvent({ date: isoAtHoursOffset(5) })]);
  const news = [
    newsItem({ title: "Bad Date News", publishedAt: "not-a-real-date" }),
    newsItem({ title: "", publishedAt: isoAtHoursOffset(-1) }),
    newsItem({ title: "Good News Item", publishedAt: isoAtHoursOffset(-1) }),
  ];
  const ctx = analyzeEventImpact(input(macro, news));
  check("5a. newsAvailability PARTIAL (1 of 3 usable)", ctx.newsAvailability === "PARTIAL", ctx.newsAvailability);
  check("5b. usableNewsCount 1, totalNewsCount 3", ctx.usableNewsCount === 1 && ctx.totalNewsCount === 3, `${ctx.usableNewsCount}/${ctx.totalNewsCount}`);
  check("5c. only the usable, recent item is counted", ctx.recentNewsCount === 1, String(ctx.recentNewsCount));
}

// 5d. All-unusable news (non-empty but zero usable) -> UNAVAILABLE, not PARTIAL
{
  const macro = macroFrom([]);
  const news = [newsItem({ title: "Bad Date", publishedAt: "garbage" })];
  const ctx = analyzeEventImpact(input(macro, news));
  check("5d. all-unusable non-empty news -> UNAVAILABLE (not PARTIAL)", ctx.newsAvailability === "UNAVAILABLE", ctx.newsAvailability);
  check("5e. all-unusable -> recentNewsCount 0, conflictingImpact false", ctx.recentNewsCount === 0 && ctx.conflictingImpact === false, `${ctx.recentNewsCount} ${ctx.conflictingImpact}`);
}

// 5f. Unparseable input.asOf itself -> treated as no usable news, never a thrown error / NaN leak
{
  const macro = macroFrom([econEvent({ date: isoAtHoursOffset(3) })], "not-a-date");
  const news = [newsItem({ publishedAt: isoAtHoursOffset(-1) })];
  const ctx = analyzeEventImpact(input(macro, news, "not-a-date"));
  check(
    "5f. unparseable asOf -> newsAvailability UNAVAILABLE, no NaN in output",
    ctx.newsAvailability === "UNAVAILABLE" && ctx.recentNewsCount === 0 && !JSON.stringify(ctx).includes("NaN"),
    JSON.stringify(ctx)
  );
}

// ===========================================================================
// 6. Unsupported directional inference -> impactDirection always null, uncertainty always flagged
// ===========================================================================
{
  const macro = macroFrom([econEvent({ title: "CPI y/y", date: isoAtHoursOffset(3), impact: "high" })]);
  const news = [
    newsItem({ title: "Bullish breakout as rally accelerates", publishedAt: isoAtHoursOffset(-0.5), sentiment: "positive" }),
    newsItem({ title: "Another bullish surge reported", publishedAt: isoAtHoursOffset(-1), sentiment: "positive" }),
  ];
  const ctx = analyzeEventImpact(input(macro, news));
  check("6a. impactDirection null even with unanimous positive sentiment", ctx.impactDirection === null, String(ctx.impactDirection));
  check("6b. no field anywhere in the output claims a direction (RISK_ON/RISK_OFF absent)", !JSON.stringify(ctx).includes("RISK_ON") && !JSON.stringify(ctx).includes("RISK_OFF"), JSON.stringify(ctx));
  check("6c. uncertainty.directionUnsupported always true", ctx.uncertainty.directionUnsupported === true, String(ctx.uncertainty.directionUnsupported));
}

// ===========================================================================
// 7. Determinism — identical input -> byte-identical repeated output
// ===========================================================================
{
  const macro = macroFrom([econEvent({ title: "NFP", date: isoAtHoursOffset(30), impact: "high" })]);
  const news = [newsItem({ publishedAt: isoAtHoursOffset(-1), sentiment: "neutral" })];
  const testInput = input(macro, news);
  const a = analyzeEventImpact(testInput);
  const b = analyzeEventImpact(testInput);
  check("7. identical input -> byte-identical output", JSON.stringify(a) === JSON.stringify(b), "outputs diverged");
}

// ===========================================================================
// 8. Input immutability — analyze never mutates the input macro/news or their entries
// ===========================================================================
{
  const macro = macroFrom([econEvent({ title: "CPI y/y", date: isoAtHoursOffset(15), impact: "high" })]);
  const news = [newsItem({ publishedAt: isoAtHoursOffset(-1), sentiment: "negative" })];
  const testInput = input(macro, news);
  const beforeSnapshot = JSON.parse(JSON.stringify(testInput));
  analyzeEventImpact(testInput);
  check("8. input deep-equal before/after analyze() call", JSON.stringify(testInput) === JSON.stringify(beforeSnapshot), "input mutated");
}

// ===========================================================================
// 9. Boundary timing cases — recent-news window exactness (inclusive at NEWS_RECENT_HOURS)
// ===========================================================================
{
  const macro = macroFrom([]);

  const atBoundary = analyzeEventImpact(input(macro, [newsItem({ publishedAt: isoAtHoursOffset(-NEWS_RECENT_HOURS) })]));
  check("9a. exactly at recent-window boundary -> counted as recent", atBoundary.recentNewsCount === 1, JSON.stringify(atBoundary));

  const justOverBoundary = analyzeEventImpact(input(macro, [newsItem({ publishedAt: isoAtHoursOffset(-(NEWS_RECENT_HOURS + 0.001)) })]));
  check("9b. one moment beyond recent-window boundary -> not counted as recent", justOverBoundary.recentNewsCount === 0, JSON.stringify(justOverBoundary));

  const futureDated = analyzeEventImpact(input(macro, [newsItem({ publishedAt: isoAtHoursOffset(0.5) })])); // publishedAt after asOf
  check("9c. future-dated (malformed) publishedAt -> excluded from recentNewsCount, not counted", futureDated.recentNewsCount === 0, JSON.stringify(futureDated));

  const atAsOf = analyzeEventImpact(input(macro, [newsItem({ publishedAt: isoAtHoursOffset(0) })])); // published exactly at asOf
  check("9d. published exactly at asOf -> counted as recent (0h ago is within [0, N])", atAsOf.recentNewsCount === 1, JSON.stringify(atAsOf));
}

// ===========================================================================
// 10. eventState precedence — UPCOMING wins over RECENT when both are true; UNKNOWN only when both sources are UNAVAILABLE
// ===========================================================================
{
  // Macro available but no upcoming high-impact event, news available but stale (outside window) -> NONE
  const macro = macroFrom([econEvent({ title: "Past Event", date: isoAtHoursOffset(-5), impact: "high" })]); // already elapsed, never "upcoming"
  const staleNews = [newsItem({ publishedAt: isoAtHoursOffset(-(NEWS_RECENT_HOURS + 1)) })];
  const ctxNone = analyzeEventImpact(input(macro, staleNews));
  check("10a. both sources available/usable but nothing upcoming/recent -> NONE", ctxNone.eventState === "NONE", ctxNone.eventState);

  // Macro UNAVAILABLE, news UNAVAILABLE (malformed) -> UNKNOWN, not NONE
  const badMacro = macroFrom([]);
  const badNews = [newsItem({ publishedAt: "garbage" })];
  const ctxUnknown = analyzeEventImpact(input(badMacro, badNews));
  check("10b. both sources unavailable -> UNKNOWN, not NONE", ctxUnknown.eventState === "UNKNOWN", ctxUnknown.eventState);

  // Macro UNAVAILABLE but news usable and recent -> RECENT, not UNKNOWN
  const ctxRecentDespiteMacroGap = analyzeEventImpact(input(macroFrom([]), [newsItem({ publishedAt: isoAtHoursOffset(-1) })]));
  check("10c. macro unavailable but news usable+recent -> RECENT (not UNKNOWN)", ctxRecentDespiteMacroGap.eventState === "RECENT", ctxRecentDespiteMacroGap.eventState);
}

/** Strips `//` line comments and `/* ... *\/` block comments so static scans below only see actual code, never prose mentioning a forbidden token for documentation purposes. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const contractsPath = new URL("../../lib/ai/eventImpact/contracts.ts", import.meta.url);
const analyzePath = new URL("../../lib/ai/eventImpact/analyze.ts", import.meta.url);

// ===========================================================================
// 11. Static scan — no forbidden IMPORT statement anywhere in this phase's two files (code only, comments excluded)
// ===========================================================================
{
  const contractsCode = stripComments(readFileSync(contractsPath, "utf8"));
  const analyzeCode = stripComments(readFileSync(analyzePath, "utf8"));
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
    "lib/newsapi",
    "lib/binance/newsGate",
  ];
  const violations = importLines.filter((line) => forbidden.some((needle) => line.includes(needle)));
  check("11. no forbidden import statement found in contracts.ts/analyze.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 12. Static scan — no Date.now()/Math.random() CALL anywhere in analyze.ts (code only, comments excluded)
// ===========================================================================
{
  const analyzeCode = stripComments(readFileSync(analyzePath, "utf8"));
  check("12. analyze.ts contains no Date.now()/Math.random() call", !analyzeCode.includes("Date.now(") && !analyzeCode.includes("Math.random("), "found a wall-clock/random call");
}

// ===========================================================================
// 13. Static scan — no fetch/network CALL anywhere in analyze.ts (code only, comments excluded)
// ===========================================================================
{
  const analyzeCode = stripComments(readFileSync(analyzePath, "utf8"));
  check("13. analyze.ts contains no fetch(...) call", !analyzeCode.includes("fetch("), "found a fetch() call — pure analysis functions must not fetch");
}

// ===========================================================================
// 14. No free-text/reason/explanation field anywhere in contracts.ts's exported types
// ===========================================================================
{
  const contractsSrc = readFileSync(contractsPath, "utf8");
  const forbiddenFieldNames = ["reason:", "explanation:", "narrative:", "reasoning:", "summary:"];
  const violations = forbiddenFieldNames.filter((needle) => contractsSrc.includes(needle));
  check("14. no free-text reason/explanation/narrative/reasoning/summary field declared", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 15. No canonical Oracle grading field name anywhere in contracts.ts
// ===========================================================================
{
  const contractsSrc = readFileSync(contractsPath, "utf8");
  const forbidden = ["grade:", "confidence:", "side:", "riskStatus:", "stopLoss:", "takeProfit:", "\"EXECUTE\"", "\"WAIT\"", "\"REJECT\""];
  const violations = forbidden.filter((needle) => contractsSrc.includes(needle));
  check("15. no canonical Oracle/decision field declared in contracts.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 16. No LLM import / no randomness anywhere in either file (code only, comments excluded)
// ===========================================================================
{
  const contractsCode = stripComments(readFileSync(contractsPath, "utf8"));
  const analyzeCode = stripComments(readFileSync(analyzePath, "utf8"));
  const combined = contractsCode + analyzeCode;
  const forbiddenTokens = ["lib/ai/core/llm", "lib/ai/provider", "anthropic", "openai", "Math.random("];
  const violations = forbiddenTokens.filter((needle) => combined.toLowerCase().includes(needle.toLowerCase()));
  check("16. no LLM/provider import or randomness anywhere in contracts.ts/analyze.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
