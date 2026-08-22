// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — risk plan calculator
//
// Computes entry/SL/TP/R:R for a graded side using the SAME methodology
// lib/elvoid/engine.ts already uses for the normal AI Signal system
// (nearest protective S/R level + ATR buffer for SL; nearest opposing S/R
// level, or a fixed R-multiple fallback, for TP) — reimplemented here
// against OracleContext instead of importing engine.ts's internal
// (non-exported) calculation, so this file has zero coupling to and never
// modifies engine.ts. Same real indicators (lib/elvoid/indicators.ts),
// same real candles (OracleContext.candles) — nothing invented.
//
// Returns null when there isn't enough candle history to find a protective
// level at all — the grading engine (Phase 3) already treats a missing
// risk plan as riskStatus="unavailable" and refuses A+ accordingly, exactly
// per spec §6 ("do NOT invent them").
// ---------------------------------------------------------------------------

import { findSupportResistance, atr as atrSeries } from "@/lib/elvoid/indicators";
import type { OracleContext } from "./types";
import type { OracleRiskPlan } from "./gradingTypes";

export function buildOracleRiskPlan(ctx: OracleContext, side: "LONG" | "SHORT" | null): OracleRiskPlan | null {
  if (!side || ctx.candles.length < 30) return null;

  const entry = ctx.currentPrice;
  const srLevels = findSupportResistance(ctx.candles, entry);
  const atrValues = atrSeries(ctx.candles, 14);
  const lastAtr = atrValues[atrValues.length - 1] || entry * 0.02;
  const dir = side === "LONG" ? 1 : -1;

  const protectiveLevels = srLevels
    .filter((l) => (side === "LONG" ? l.type === "support" : l.type === "resistance"))
    .map((l) => ({ price: l.price, dist: dir * (entry - l.price) }))
    .filter((l) => l.dist > 0)
    .sort((a, b) => a.dist - b.dist);

  const atrBuffer = lastAtr * 0.3;
  const slDist = protectiveLevels[0] ? protectiveLevels[0].dist + atrBuffer : lastAtr * 1.5;
  const stopLoss = entry - dir * slDist;
  const riskDistance = Math.abs(entry - stopLoss);
  if (riskDistance <= 0) return null;

  const opposingLevels = srLevels
    .filter((l) => (side === "LONG" ? l.type === "resistance" : l.type === "support"))
    .map((l) => ({ price: l.price, dist: dir * (l.price - entry) }))
    .filter((l) => l.dist > 0)
    .sort((a, b) => a.dist - b.dist);

  const rawTpDist = riskDistance * 1.5;
  const tpCandidate = opposingLevels.find((l) => l.dist >= riskDistance * 1.0 && l.dist <= riskDistance * 2.2);
  const tpDist = tpCandidate ? tpCandidate.dist : rawTpDist;
  const takeProfit = entry + dir * tpDist;

  const riskReward = Math.abs(takeProfit - entry) / riskDistance;

  return { entry, stopLoss, takeProfit, riskReward: Math.round(riskReward * 100) / 100 };
}
