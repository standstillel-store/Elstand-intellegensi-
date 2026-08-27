// ---------------------------------------------------------------------------
// Phase 7.0/7.1 — Baseline snapshot script (dev-only, not part of the app).
//
// Runs the REAL, unmodified Pro pipeline —
//   computeConfluence() -> buildOracleRiskPlan() -> gradeConfluence()
// — against a synthetic-but-deterministic candle fixture, and prints the
// deterministic fields Phase 7 must not regress:
//   dominantSide, longScore, shortScore, confidence, grade, contradictions,
//   dataQuality, risk plan (entry/SL/TP).
//
// This does NOT call any live exchange/DB/LLM. TPO/footprint/orderbook/
// liquidity/microstructure/macro are intentionally passed as null so those
// factors report quality="unavailable" (their own existing, real behavior
// for missing data) rather than fabricating market data for the fixture.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/baseline.ts
//
// Compare output before/after each Phase 7 sub-phase change.
// ---------------------------------------------------------------------------

import { computeConfluence } from "@/lib/ai/oracle/confluence";
import { gradeConfluence } from "@/lib/ai/oracle/grading";
import { buildOracleRiskPlan } from "@/lib/ai/oracle/risk";
import { normalizeEvidence, firingClustersFor } from "@/lib/ai/oracle/evidence";
import type { OracleContext } from "@/lib/ai/oracle/types";
import type { Candle } from "@/lib/elvoid/types";

/** Deterministic synthetic uptrend: seeded, reproducible, no Math.random. */
function buildFixtureCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 50000;
  const startTime = Date.UTC(2026, 0, 1, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    // deterministic pseudo-oscillation: mostly up, small periodic pullbacks
    const wave = Math.sin(i / 4) * 40;
    const drift = 25;
    const open = price;
    const close = open + drift + wave;
    const high = Math.max(open, close) + 15;
    const low = Math.min(open, close) - 15;
    candles.push({ time: startTime + i * 15 * 60_000, open, high, low, close, volume: 100 + (i % 7) * 10 });
    price = close;
  }
  return candles;
}

function buildFixtureContext(): OracleContext {
  const candles = buildFixtureCandles(120);
  const currentPrice = candles[candles.length - 1].close;
  return {
    symbol: "FIXTURE",
    currentPrice,
    candles,
    tpo: null,
    footprint: null,
    liquidity: null,
    orderBook: null,
    microstructure: null,
    macro: null,
    dataQuality: [
      { source: "structure", quality: "real", detail: "Synthetic candle fixture." },
      { source: "smc_ict", quality: "real", detail: "Synthetic candle fixture." },
      { source: "tpo", quality: "unavailable", detail: "Not provided in fixture." },
      { source: "footprint", quality: "unavailable", detail: "Not provided in fixture." },
      { source: "orderbook", quality: "unavailable", detail: "Not provided in fixture." },
      { source: "liquidity", quality: "unavailable", detail: "Not provided in fixture." },
      { source: "microstructure", quality: "unavailable", detail: "Not provided in fixture." },
      { source: "macro", quality: "unavailable", detail: "Not provided in fixture." },
    ],
  };
}

function runBaseline() {
  const ctx = buildFixtureContext();
  const confluence = computeConfluence(ctx);
  const dominantSide = confluence.dominantSide === "NEUTRAL" ? null : confluence.dominantSide;
  const risk = buildOracleRiskPlan(ctx, dominantSide);
  const assessment = gradeConfluence(confluence, risk ?? undefined);

  // Phase 7.1 addition under test: normalized evidence must be a pure
  // relabeling — same factor count, same per-factor weight/quality info.
  const normalized = normalizeEvidence(confluence, "15m");
  const longClusters = [...firingClustersFor(normalized, "LONG")];
  const shortClusters = [...firingClustersFor(normalized, "SHORT")];

  const snapshot = {
    dominantSide: confluence.dominantSide,
    longScore: confluence.longScore,
    shortScore: confluence.shortScore,
    contradictions: confluence.contradictions,
    dataQuality: confluence.dataQuality,
    grade: assessment.grade,
    side: assessment.side,
    confidence: assessment.confidence,
    independentConfirmationClusters: assessment.independentConfirmationClusters,
    riskStatus: assessment.riskStatus,
    risk: assessment.risk,
    normalizedEvidenceCount: normalized.length,
    normalizedFactorCountMatchesConfluence: normalized.length === confluence.factors.length,
    normalizedLongClusters: longClusters,
    normalizedShortClusters: shortClusters,
  };

  console.log(JSON.stringify(snapshot, null, 2));
}

runBaseline();
