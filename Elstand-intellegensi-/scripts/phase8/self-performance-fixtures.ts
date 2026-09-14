// ---------------------------------------------------------------------------
// Phase 8.6.1 — Self Performance Monitor fixtures (dev-only, not part of
// the app). Pure/offline — hand-built DecisionMemoryJoinedRow fixtures
// exercised against aggregate.ts's pure functions only (repository.ts
// requires a live Learning DB and is intentionally not exercised here,
// matching failure-pattern-fixtures.ts's own convention of testing only
// the pure layer).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/self-performance-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { computeEvaluationCoverage, aggregatePerformance } from "@/lib/ai/selfPerformance/aggregate";
import type { DecisionSource, EvaluationClass, DecisionQuality, MarketOutcome, ConfidenceAlignment } from "@/lib/ai/selfPerformance/contracts";
import type { DecisionMemoryJoinedRow } from "@/lib/ai/decisionMemory/contracts";

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

let idCounter = 0;
function row(overrides: {
  source?: DecisionSource;
  symbol?: string;
  closed?: boolean;
  evaluated?: boolean;
  evaluationClass?: EvaluationClass;
  decisionQuality?: DecisionQuality;
  marketOutcome?: MarketOutcome;
  confidenceAlignment?: ConfidenceAlignment;
} = {}): DecisionMemoryJoinedRow {
  idCounter++;
  const source = overrides.source ?? "ELVOID_PRO_ORACLE";
  const symbol = overrides.symbol ?? "BTCUSDT";
  const closed = overrides.closed ?? true;
  const evaluated = overrides.evaluated ?? true;

  return {
    experience: {
      id: `exp-${idCounter}`,
      source,
      sourceSignalId: `sig-${idCounter}`,
      symbol,
      side: "LONG",
      grade: "A",
      confidence: 70,
      decisionTimestamp: "2026-09-01T00:00:00.000Z",
      learningContext: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      outcome: closed
        ? { outcomeResult: "win", outcomeRr: 1.5, outcomeProfitPercent: 2.1, outcomeDurationMinutes: 60, outcomeClosedAt: "2026-09-01T01:00:00.000Z" }
        : null,
    },
    evaluation:
      evaluated && closed
        ? {
            version: 1,
            sourceSignalId: `sig-${idCounter}`,
            decisionQuality: overrides.decisionQuality ?? "GOOD",
            marketOutcome: overrides.marketOutcome ?? "POSITIVE",
            evaluationClass: overrides.evaluationClass ?? "GOOD_DECISION_GOOD_OUTCOME",
            confidenceAlignment: overrides.confidenceAlignment ?? "ALIGNED",
            riskAlignment: "NOT_APPLICABLE",
            conflictAlignment: "NOT_APPLICABLE",
            hypothesisAlignment: "NOT_APPLICABLE",
            evidence: [],
            evaluatedAt: "2026-09-01T01:05:00.000Z",
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// computeEvaluationCoverage
// ---------------------------------------------------------------------------

{
  const coverage = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", []);
  check(
    "1. Zero rows -> INSUFFICIENT_DATA, ratio 0, every count 0",
    coverage.closedExperienceCount === 0 && coverage.evaluatedExperienceCount === 0 && coverage.unevaluatedExperienceCount === 0 && coverage.coverageRatio === 0 && coverage.status === "INSUFFICIENT_DATA",
    JSON.stringify(coverage)
  );
}

{
  const rows = [row(), row(), row(), row()]; // 4 closed, all evaluated — below MIN_OCCURRENCE_COUNT (5)
  const coverage = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("2. 4 closed rows (all evaluated) -> INSUFFICIENT_DATA despite ratio 1 (below MIN_OCCURRENCE_COUNT)", coverage.status === "INSUFFICIENT_DATA" && coverage.coverageRatio === 1, JSON.stringify(coverage));
}

{
  const rows = [row(), row(), row(), row(), row()]; // exactly 5, all evaluated
  const coverage = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("3. Exactly 5 closed rows, all evaluated -> COMPLETE, ratio 1", coverage.status === "COMPLETE" && coverage.coverageRatio === 1 && coverage.unevaluatedExperienceCount === 0, JSON.stringify(coverage));
}

{
  const rows = [row({ evaluated: true }), row({ evaluated: true }), row({ evaluated: true }), row({ evaluated: false }), row({ evaluated: false })];
  const coverage = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check(
    "4. 5 closed rows, 3 evaluated, 2 not -> PARTIAL, ratio 0.6, unevaluatedExperienceCount 2",
    coverage.status === "PARTIAL" && coverage.coverageRatio === 0.6 && coverage.unevaluatedExperienceCount === 2 && coverage.evaluatedExperienceCount === 3,
    JSON.stringify(coverage)
  );
}

{
  const rows = [row(), row(), row(), row(), row(), row({ closed: false }), row({ closed: false })]; // 5 closed+evaluated, 2 never closed
  const coverage = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("5. Not-yet-closed rows (outcome null) never counted in closedExperienceCount", coverage.closedExperienceCount === 5 && coverage.status === "COMPLETE", JSON.stringify(coverage));
}

{
  const rows = [
    row({ source: "AI_SIGNAL" }),
    row({ source: "AI_SIGNAL" }),
    row({ source: "AI_SIGNAL" }),
    row({ source: "AI_SIGNAL" }),
    row({ source: "AI_SIGNAL" }),
    row({ source: "ELVOID_PRO_ORACLE" }),
  ];
  const coverage = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("6a. Source isolation — AI_SIGNAL rows never counted when querying ELVOID_PRO_ORACLE", coverage.closedExperienceCount === 1 && coverage.status === "INSUFFICIENT_DATA", JSON.stringify(coverage));
}

{
  const rows = [row({ symbol: "ETHUSDT" }), row({ symbol: "ETHUSDT" }), row({ symbol: "ETHUSDT" }), row({ symbol: "ETHUSDT" }), row({ symbol: "ETHUSDT" }), row({ symbol: "BTCUSDT" })];
  const coverage = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("6b. Symbol isolation — ETHUSDT rows never counted when querying BTCUSDT", coverage.closedExperienceCount === 1 && coverage.status === "INSUFFICIENT_DATA", JSON.stringify(coverage));
}

{
  const rowsA = [row(), row(), row(), row(), row({ evaluated: false })];
  const rowsB = [rowsA[4], rowsA[0], rowsA[3], rowsA[1], rowsA[2]]; // same rows, different order
  const a = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rowsA);
  const b = computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rowsB);
  check("7. Input order does not affect coverage output (byte-identical JSON)", JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

{
  const rows = [row(), row()];
  const snapshot = JSON.stringify(rows);
  computeEvaluationCoverage("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("8. computeEvaluationCoverage does not mutate its input rows", JSON.stringify(rows) === snapshot, "input rows array was mutated");
}

// ---------------------------------------------------------------------------
// aggregatePerformance
// ---------------------------------------------------------------------------

{
  const perf = aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", []);
  const allZero = Object.values(perf.evaluationClassCounts).every((v) => v === 0) && Object.values(perf.decisionQualityCounts).every((v) => v === 0) && Object.values(perf.marketOutcomeCounts).every((v) => v === 0) && Object.values(perf.confidenceAlignmentCounts).every((v) => v === 0);
  check("9. Zero rows -> totalEvaluated 0, every count key present and 0", perf.totalEvaluated === 0 && allZero && Object.keys(perf.evaluationClassCounts).length === 6, JSON.stringify(perf));
}

{
  const rows = [row({ evaluated: false }), row({ evaluated: false })];
  const perf = aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("10. Rows with no evaluation are excluded entirely from every count", perf.totalEvaluated === 0, JSON.stringify(perf));
}

{
  const rows = [
    row({ evaluationClass: "GOOD_DECISION_GOOD_OUTCOME" }),
    row({ evaluationClass: "GOOD_DECISION_GOOD_OUTCOME" }),
    row({ evaluationClass: "BAD_DECISION_BAD_OUTCOME" }),
    row({ evaluationClass: "NEUTRAL_OUTCOME" }),
  ];
  const perf = aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check(
    "11. Mixed evaluationClass counted correctly; unseen classes still present at 0",
    perf.evaluationClassCounts.GOOD_DECISION_GOOD_OUTCOME === 2 && perf.evaluationClassCounts.BAD_DECISION_BAD_OUTCOME === 1 && perf.evaluationClassCounts.NEUTRAL_OUTCOME === 1 && perf.evaluationClassCounts.INSUFFICIENT_EVIDENCE === 0,
    JSON.stringify(perf.evaluationClassCounts)
  );
}

{
  // decisionQuality GOOD + marketOutcome NEGATIVE together — the two axes
  // must be counted independently, never derived from one another.
  const rows = [row({ decisionQuality: "GOOD", marketOutcome: "NEGATIVE", evaluationClass: "GOOD_DECISION_BAD_OUTCOME" })];
  const perf = aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("12. decisionQuality and marketOutcome counted independently (GOOD decision, NEGATIVE outcome, both counted)", perf.decisionQualityCounts.GOOD === 1 && perf.marketOutcomeCounts.NEGATIVE === 1 && perf.decisionQualityCounts.BAD === 0, JSON.stringify(perf));
}

{
  const rows = [row({ source: "AI_SIGNAL" }), row({ source: "AI_SIGNAL" }), row({ source: "ELVOID_PRO_ORACLE" })];
  const perf = aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("13a. Source isolation — AI_SIGNAL rows never counted when querying ELVOID_PRO_ORACLE", perf.totalEvaluated === 1, JSON.stringify(perf));
}

{
  const rows = [row({ symbol: "ETHUSDT" }), row({ symbol: "ETHUSDT" }), row({ symbol: "BTCUSDT" })];
  const perf = aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("13b. Symbol isolation — ETHUSDT rows never counted when querying BTCUSDT", perf.totalEvaluated === 1, JSON.stringify(perf));
}

{
  const rowsA = [row({ evaluationClass: "GOOD_DECISION_GOOD_OUTCOME" }), row({ evaluationClass: "BAD_DECISION_BAD_OUTCOME" }), row({ evaluationClass: "NEUTRAL_OUTCOME" })];
  const rowsB = [rowsA[2], rowsA[0], rowsA[1]];
  const a = aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", rowsA);
  const b = aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", rowsB);
  check("14. Input order does not affect performance output (byte-identical JSON)", JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

{
  const rows = [row(), row()];
  const snapshot = JSON.stringify(rows);
  aggregatePerformance("ELVOID_PRO_ORACLE", "BTCUSDT", rows);
  check("15. aggregatePerformance does not mutate its input rows", JSON.stringify(rows) === snapshot, "input rows array was mutated");
}

// ---------------------------------------------------------------------------
// Static scope audit — source-level checks, not behavioral
// ---------------------------------------------------------------------------

{
  const source = readFileSync(new URL("../../lib/ai/selfPerformance/aggregate.ts", import.meta.url), "utf8");
  const withoutComments = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const forbidden = ["fetch(", "Date.now(", "Math.random(", "Supabase", "supabase", "createClient(", ".from(\"decision"];
  const found = forbidden.filter((token) => withoutComments.includes(token));
  check("16. aggregate.ts contains none of: fetch/Date.now/Math.random/Supabase/direct-table-read (comments excluded)", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const source = readFileSync(new URL("../../lib/ai/selfPerformance/aggregate.ts", import.meta.url), "utf8");
  const withoutComments = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const forbidden = ["accuracy", "\"score\"", " score:", "winRate", "win_rate"];
  const found = forbidden.filter((token) => withoutComments.toLowerCase().includes(token.toLowerCase()));
  check("17. aggregate.ts never computes a field named accuracy/score/winRate (comments excluded) — per Phase 8.6.1's own instruction", found.length === 0, `found: ${found.join(", ")}`);
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Self Performance Monitor fixtures passed.`);
if (failures > 0) process.exit(1);
