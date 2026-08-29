import { NextResponse } from "next/server";
import { assembleOracleContext } from "@/lib/ai/oracle/dataAdapters";
import { computeConfluence } from "@/lib/ai/oracle/confluence";
import { gradeConfluence } from "@/lib/ai/oracle/grading";
import { buildMarketInsight } from "@/lib/ai/oracle/insight";
import { buildOracleRiskPlan } from "@/lib/ai/oracle/risk";
import { buildMtfContext } from "@/lib/ai/oracle/mtf";
import { classifyMarketRegime } from "@/lib/ai/oracle/regime";
import { buildLiquidityOrderFlowContext } from "@/lib/ai/oracle/liquidityOrderFlow";
import { buildScenarios } from "@/lib/ai/oracle/scenario";
import { classifyContradictions } from "@/lib/ai/oracle/contradiction";
import { arbitrateDecision } from "@/lib/ai/oracle/arbitration";
import { buildRiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import { buildOracleReasoning } from "@/lib/ai/oracle/reasoning";
import { buildCognitiveObservation } from "@/lib/ai/cognitive/observation";
import { createWorkingMemory } from "@/lib/ai/cognitive/memory";
import { hasActiveMembership, MEMBERSHIP_REQUIRED_BODY } from "@/lib/membership";

/**
 * GET /api/elvoid-pro/oracle?symbol=BTC&interval=15m
 *
 * Runs the full ELVOID PRO ORACLE pipeline for one symbol, live:
 *   assembleOracleContext (Phase 1, real data)
 *   -> computeConfluence (Phase 2, evidence per side)
 *   -> buildOracleRiskPlan (real S/R + ATR — same methodology as the
 *      normal AI Signal engine, never invented)
 *   -> gradeConfluence (Phase 3, deterministic — NO_TRADE/B+/A/A+)
 *   -> buildMarketInsight (Phase 4, narrative + pattern names)
 *
 * Returns everything the ELVOID Pro dashboard needs to render the Oracle
 * card AND everything the Execute Signal button needs to POST straight to
 * /api/elvoid-pro/execute-signal without recomputing anything client-side.
 *
 * Server-side entitlement guard — reachable directly by URL regardless of
 * whether the ELVOID PRO page rendered it.
 */
export async function GET(req: Request) {
  if (!(await hasActiveMembership())) {
    return NextResponse.json(MEMBERSHIP_REQUIRED_BODY, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const interval = searchParams.get("interval") ?? "15m";
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi, contoh: ?symbol=BTC" }, { status: 400 });

  try {
    const context = await assembleOracleContext(symbol, interval);
    if (context.candles.length < 30) {
      return NextResponse.json({ error: `Candle history untuk ${symbol} tidak cukup untuk analisis Oracle.` }, { status: 422 });
    }

    const confluence = computeConfluence(context);
    const dominantSide = confluence.dominantSide === "NEUTRAL" ? null : confluence.dominantSide;
    const risk = buildOracleRiskPlan(context, dominantSide);
    const assessment = gradeConfluence(confluence, risk ?? undefined);

    // Phase 7.2 — additive only. Does not participate in confluence/grading/
    // risk above; failures here must never break the existing Oracle
    // response (see catch: falls back to null, never a fabricated context).
    const mtf = await buildMtfContext(symbol, interval, context.candles, context.currentPrice).catch(() => null);

    // Phase 7.3B — Regime-Aware Interpretation. Pure function over candles
    // already fetched above + the mtf context just built — no new fetch,
    // no new confluence/grading engine. Context only: does not touch
    // `assessment`/`risk` computed above. Wrapped defensively so a
    // classifier bug can never break the existing Oracle response.
    let regime: ReturnType<typeof classifyMarketRegime> | null = null;
    try {
      regime = classifyMarketRegime(context.candles, interval, mtf);
    } catch {
      regime = null;
    }

    const insight = buildMarketInsight(confluence, assessment, regime);

    // Phase 7.4 — Liquidity + Order Flow Intelligence. Pure function over
    // context/tpo/footprint/candles already resident above — zero new
    // fetches. Context/evidence only: never read by confluence/grading/risk
    // above (all already computed). Wrapped defensively, same pattern as
    // regime, so a bug here can never break the existing Oracle response.
    let liquidityOrderFlow: ReturnType<typeof buildLiquidityOrderFlowContext> | null = null;
    try {
      liquidityOrderFlow = buildLiquidityOrderFlowContext(context);
    } catch {
      liquidityOrderFlow = null;
    }

    // Phase 7.5 — Scenario Engine. Pure over assessment/confluence/regime/
    // mtf/liquidityOrderFlow, all already computed above — zero new fetch,
    // zero new scoring. Context/evidence only: PRIMARY always follows
    // assessment.side (never re-decides direction), never fed back into
    // gradeConfluence()/confidence/risk. Wrapped defensively, same pattern
    // as regime/liquidityOrderFlow.
    let scenarios: ReturnType<typeof buildScenarios> | null = null;
    try {
      scenarios = buildScenarios(assessment, confluence, regime, mtf, liquidityOrderFlow);
    } catch {
      scenarios = null;
    }

    // Phase 7.6 — Contradiction Classifier. Pure reclassification over
    // confluence/assessment/mtf/scenarios already computed above — zero new
    // fetch, zero new detection logic beyond the explicitly-scoped
    // HTF-threatened check. Never written back into grading. Wrapped
    // defensively, same pattern as regime/liquidityOrderFlow/scenarios.
    let contradictions: ReturnType<typeof classifyContradictions> | null = null;
    try {
      contradictions = classifyContradictions(confluence, assessment, mtf, scenarios);
    } catch {
      contradictions = null;
    }

    // Phase 7.7 — Decision Arbitration. Pure annotation over
    // assessment/regime/mtf/scenarios/contradictions already computed
    // above — zero new fetch, zero new scoring, no second decision engine.
    // NEVER mutates assessment.side/grade/confidence/riskStatus. Wrapped
    // defensively, same pattern as every prior 7.x sub-phase.
    let arbitration: ReturnType<typeof arbitrateDecision> | null = null;
    try {
      arbitration = arbitrateDecision(assessment, regime, mtf, scenarios, contradictions);
    } catch {
      arbitration = null;
    }

    // Phase 7.8 — Risk Intelligence. Pure annotation over
    // context/risk/regime/scenarios/contradictions/arbitration/
    // liquidityOrderFlow already computed above — zero new fetch, zero new
    // scoring. NEVER mutates risk/assessment. Wrapped defensively, same
    // pattern as every prior 7.x sub-phase.
    let riskIntelligence: ReturnType<typeof buildRiskIntelligence> | null = null;
    try {
      riskIntelligence = buildRiskIntelligence(context, risk, assessment.side, regime, scenarios, contradictions, arbitration, liquidityOrderFlow);
    } catch {
      riskIntelligence = null;
    }

    // Phase 8.0.1 — Cognitive Observation. Downstream/read-only snapshot of
    // everything already computed above (confluence/assessment/mtf/regime/
    // liquidityOrderFlow/scenarios/contradictions/arbitration/
    // riskIntelligence) — zero new fetch, zero new confluence/grading
    // recomputation, never mutates any input, never overrides canonical
    // side/grade/confidence/riskStatus (see lib/ai/cognitive/contracts.ts).
    // Not a prerequisite for the canonical assessment: wrapped defensively,
    // same pattern as every prior 7.x sub-phase, so a bug here can never
    // break the existing Oracle response.
    let cognitiveObservation: ReturnType<typeof buildCognitiveObservation> | null = null;
    try {
      cognitiveObservation = buildCognitiveObservation({ symbol, assessment, confluence, mtf, regime, liquidityOrderFlow, scenarios, contradictions, arbitration, riskIntelligence });
    } catch {
      cognitiveObservation = null;
    }

    // Phase 8.0.2 — Cognitive Working Memory. Request-scoped, in-process
    // state container built from cognitiveObservation only — no new fetch,
    // no recomputation, never mutates cognitiveObservation/assessment.
    // Internal infrastructure for the future Hypothesis Engine (8.0.3):
    // deliberately NOT included in the JSON response below (no external
    // consumer yet). Wrapped defensively, same pattern as every prior
    // 7.x/8.x sub-phase, so a bug here can never break the existing Oracle
    // response. `workingMemory` itself is a plain local variable — never
    // assigned to a module-level store, so it is garbage-collected with
    // the rest of this request's locals once the handler returns.
    let workingMemory: ReturnType<typeof createWorkingMemory> | null = null;
    try {
      if (cognitiveObservation) {
        workingMemory = createWorkingMemory(cognitiveObservation);
      }
    } catch {
      workingMemory = null;
    }
    // `workingMemory` is intentionally unread past this point in 8.0.2 —
    // reserved for Phase 8.0.3 Hypothesis Engine — and intentionally not
    // part of the response object below.

    // Phase 7.9 — LLM Reasoning. Narrative/interpretation layer only, never
    // a decision engine — side/grade/confidence/riskStatus/invalidation/
    // entry/SL/TP are never asked of the model and never read back (see
    // reasoning.ts). No AI Energy charged (bundled into Pro membership per
    // explicit decision). Never fails the request: buildOracleReasoning()
    // always resolves, degrading to a deterministic fallback
    // (`generatedBy: "fallback"`) on any LLM/parse/validation failure.
    let reasoning: Awaited<ReturnType<typeof buildOracleReasoning>> | null = null;
    try {
      reasoning = await buildOracleReasoning(assessment, confluence, regime, mtf, liquidityOrderFlow, scenarios, contradictions, arbitration, riskIntelligence);
    } catch {
      reasoning = null;
    }

    return NextResponse.json({ assessment, confluence, insight, risk, mtf, regime, liquidityOrderFlow, scenarios, contradictions, arbitration, riskIntelligence, cognitiveObservation, reasoning });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menjalankan ELVOID PRO ORACLE." }, { status: 500 });
  }
}
