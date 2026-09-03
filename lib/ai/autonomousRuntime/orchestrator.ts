// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Runtime Orchestrator (Phase 8.2.9)
//
// ORCHESTRATION LAYER ONLY. Every scoring/grading/qualification/decision
// function called below is an EXISTING, UNCHANGED Phase 7/8.0-8.2.8
// module — this file computes nothing new. It sequences them in the one
// order the pipeline requires, in the same defensive "a bug in one
// sub-phase can never break the ones before it" style
// `app/api/elvoid-pro/oracle/route.ts` already established for the
// Phase 7/8.0 half of this exact chain (this file mirrors that route's
// own composition for the assessment/cognitive-context half rather than
// duplicating its logic under a new name).
//
// PIPELINE (Phase 8.2.9 §2):
//   assembleOracleContext -> computeConfluence -> buildOracleRiskPlan
//   -> gradeConfluence                                     (Phase 7, canonical)
//   -> [mtf, regime, liquidityOrderFlow, scenarios, contradictions,
//      arbitration, riskIntelligence, cognitiveObservation, hypotheses,
//      cognitiveConflict, decisionContext]                 (Phase 7.2-8.0.5)
//   -> queryDecisionMemory                                 (Phase 8.1.3)
//   -> getConstraintValidations                             (Phase 8.1.5 read)
//   -> buildAutonomousDecisionContext                       (Phase 8.2.0)
//   -> qualifyAutonomousDecision                            (Phase 8.2.2)
//   -> analyzeMacroIntelligence                             (Phase 8.2.3)
//   -> analyzeEventImpact                                   (Phase 8.2.4)
//   -> validatePreEntry                                     (Phase 8.2.5)
//   -> decideAutonomous                                     (Phase 8.2.6)
//   -> [Phase 8.2.9 §6 dedup gate — orchestration only, see dedup.ts]
//   -> executeAutonomousPaperTrade                          (Phase 8.2.7 —
//      also persists the decision trace for EXECUTE/WAIT/REJECT internally)
//   -> classifyAutonomousLearningLifecycle                  (Phase 8.2.8)
//
// FAILURE ISOLATION: any exception building the canonical assessment
// (step 1) resolves this symbol's cycle to `stage: "NO_ASSESSMENT"` and
// returns — never throws out of `runAutonomousCycle`. Every sub-phase
// after the canonical assessment (mtf/regime/liquidityOrderFlow/
// scenarios/contradictions/arbitration/riskIntelligence/cognitive*) is
// individually try/caught to `null`, exactly mirroring the oracle route,
// so a bug in any one of them degrades that one input to `null` rather
// than aborting the whole cycle.
// ---------------------------------------------------------------------------

import { assembleOracleContext } from "@/lib/ai/oracle/dataAdapters";
import { computeConfluence } from "@/lib/ai/oracle/confluence";
import { gradeConfluence } from "@/lib/ai/oracle/grading";
import { buildOracleRiskPlan } from "@/lib/ai/oracle/risk";
import { buildMtfContext } from "@/lib/ai/oracle/mtf";
import { classifyMarketRegime } from "@/lib/ai/oracle/regime";
import { buildLiquidityOrderFlowContext } from "@/lib/ai/oracle/liquidityOrderFlow";
import { buildScenarios } from "@/lib/ai/oracle/scenario";
import { classifyContradictions } from "@/lib/ai/oracle/contradiction";
import { arbitrateDecision } from "@/lib/ai/oracle/arbitration";
import { buildRiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import { buildCognitiveObservation } from "@/lib/ai/cognitive/observation";
import { createWorkingMemory } from "@/lib/ai/cognitive/memory";
import { buildHypotheses } from "@/lib/ai/cognitive/hypothesis";
import { resolveCognitiveConflict } from "@/lib/ai/cognitive/conflict";
import { buildDecisionContext } from "@/lib/ai/cognitive/context";
import { normalizeLearningContext } from "@/lib/ai/decisionOutcome/capture";
import { queryDecisionMemory } from "@/lib/ai/decisionMemory/repository";
import { getConstraintValidations } from "@/lib/ai/learningValidation/repository";
import { buildAutonomousDecisionContext } from "@/lib/ai/autonomous/context";
import { qualifyAutonomousDecision } from "@/lib/ai/decisionQualification/qualify";
import { analyzeMacroIntelligence } from "@/lib/ai/macroIntelligence/analyze";
import { analyzeEventImpact } from "@/lib/ai/eventImpact/analyze";
import { validatePreEntry } from "@/lib/ai/preEntryValidation/validate";
import { decideAutonomous } from "@/lib/ai/autonomousDecision/decide";
import { executeAutonomousPaperTrade } from "@/lib/ai/autonomousExecution/execute";
import { classifyAutonomousLearningLifecycle } from "@/lib/ai/autonomousLearning/lifecycle";
import { buildAutonomousSetupIdentity, getLastExecutedSetup, isDuplicateSetup, recordExecutedSetup } from "./dedup";
import { upsertAutonomousIntelligenceSnapshot } from "@/lib/ai/autonomousSnapshot/repository";
import type { EconomicEvent } from "@/lib/ai/macroIntelligence/contracts";
import type { NewsItem } from "@/lib/ai/eventImpact/contracts";
import type { AutonomousDecisionEngineResult } from "@/lib/ai/autonomousDecision/contracts";
import type { ConfluenceSource } from "@/lib/ai/oracle/confluenceTypes";
import type { AutonomousCycleResult } from "./contracts";

/** Joins every ConfluenceFactor.evidence string for one source, "; "-separated. Null when no factor of that source fired — never a fabricated placeholder. */
function evidenceForSource(factors: { source: ConfluenceSource; evidence: string }[], source: ConfluenceSource): string | null {
  const matches = factors.filter((f) => f.source === source).map((f) => f.evidence);
  return matches.length > 0 ? matches.join("; ") : null;
}

/** Deterministic, count-based description of Decision Memory for this cycle — never a fabricated narrative. Null when no memory context exists. */
function describeLearningInfluence(memory: { matchedExperiences: readonly unknown[]; matchedPatterns: readonly unknown[] } | null): string | null {
  if (!memory) return null;
  const experienceCount = memory.matchedExperiences.length;
  const patternCount = memory.matchedPatterns.length;
  if (experienceCount === 0 && patternCount === 0) return null;
  const parts: string[] = [];
  if (experienceCount > 0) parts.push(`${experienceCount} pengalaman serupa`);
  if (patternCount > 0) parts.push(`${patternCount} pola kegagalan`);
  return parts.join(", ");
}

/** Phase 8.3.0.1 §6 (Mini Chart, Option A) — SPARKLINE_POINTS most recent real closing prices, verbatim from this cycle's OracleContext.candles (the same Binance real candles the Oracle pipeline already fetched — never a second market request). Null (never an empty/padded array) when fewer than 2 real candles were available. */
const SPARKLINE_POINTS = 24;
function buildSparkline(candles: { close: number }[]): readonly number[] | null {
  if (candles.length < 2) return null;
  return candles.slice(-SPARKLINE_POINTS).map((c) => c.close);
}

const AUTONOMOUS_SOURCE = "ELVOID_PRO_ORACLE" as const;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Runs one full autonomous cycle for one symbol. Never throws — every
 * failure mode (insufficient candle history, a sub-phase error, Learning
 * DB unavailability) resolves to a typed `AutonomousCycleResult`. Callers
 * (the batch runner below, or the runtime tick route) are expected to
 * call this per-symbol inside their own try/catch as an extra safety net,
 * but this function itself is designed to already never reject.
 *
 * `calendar`/`news` are optional pre-fetched inputs so a batch runner
 * covering many symbols in one cycle can fetch the economic calendar and
 * news feed ONCE and share them across every symbol's macro/event-impact
 * analysis, instead of re-fetching per symbol — `analyzeMacroIntelligence`/
 * `analyzeEventImpact` are pure over whatever calendar/news they're given
 * either way, so sharing one fetch changes nothing about their output for
 * a given `asOf`.
 */
export async function runAutonomousCycle(symbol: string, interval: string, calendar: readonly EconomicEvent[], news: readonly NewsItem[]): Promise<AutonomousCycleResult> {
  const asOf = nowIso();

  // --- Step 1: canonical Oracle assessment (Phase 7, unchanged). ---
  let context: Awaited<ReturnType<typeof assembleOracleContext>>;
  try {
    context = await assembleOracleContext(symbol, interval);
    if (context.candles.length < 30) {
      return { version: 1, symbol, generatedAt: asOf, stage: "NO_ASSESSMENT", decision: null, dedupApplied: false, executionOutcome: null, paperTradeId: null, learningLifecycleStatus: null, error: `Candle history untuk ${symbol} tidak cukup untuk analisis Oracle.` };
    }
  } catch (err) {
    return { version: 1, symbol, generatedAt: asOf, stage: "NO_ASSESSMENT", decision: null, dedupApplied: false, executionOutcome: null, paperTradeId: null, learningLifecycleStatus: null, error: err instanceof Error ? err.message : String(err) };
  }

  const confluence = computeConfluence(context);
  const dominantSide = confluence.dominantSide === "NEUTRAL" ? null : confluence.dominantSide;
  const risk = buildOracleRiskPlan(context, dominantSide);
  const assessment = gradeConfluence(confluence, risk ?? undefined);

  // --- Step 2: Phase 7.2-7.9 / 8.0.x context layer — defensive, exactly mirroring the oracle route. ---
  const mtf = await buildMtfContext(symbol, interval, context.candles, context.currentPrice).catch(() => null);

  let regime: ReturnType<typeof classifyMarketRegime> | null = null;
  try {
    regime = classifyMarketRegime(context.candles, interval, mtf);
  } catch {
    regime = null;
  }

  let liquidityOrderFlow: ReturnType<typeof buildLiquidityOrderFlowContext> | null = null;
  try {
    liquidityOrderFlow = buildLiquidityOrderFlowContext(context);
  } catch {
    liquidityOrderFlow = null;
  }

  let scenarios: ReturnType<typeof buildScenarios> | null = null;
  try {
    scenarios = buildScenarios(assessment, confluence, regime, mtf, liquidityOrderFlow);
  } catch {
    scenarios = null;
  }

  let contradictions: ReturnType<typeof classifyContradictions> | null = null;
  try {
    contradictions = classifyContradictions(confluence, assessment, mtf, scenarios);
  } catch {
    contradictions = null;
  }

  let arbitration: ReturnType<typeof arbitrateDecision> | null = null;
  try {
    arbitration = arbitrateDecision(assessment, regime, mtf, scenarios, contradictions);
  } catch {
    arbitration = null;
  }

  let riskIntelligence: ReturnType<typeof buildRiskIntelligence> | null = null;
  try {
    riskIntelligence = buildRiskIntelligence(context, risk, assessment.side, regime, scenarios, contradictions, arbitration, liquidityOrderFlow);
  } catch {
    riskIntelligence = null;
  }

  let cognitiveObservation: ReturnType<typeof buildCognitiveObservation> | null = null;
  try {
    cognitiveObservation = buildCognitiveObservation({ symbol, assessment, confluence, mtf, regime, liquidityOrderFlow, scenarios, contradictions, arbitration, riskIntelligence });
  } catch {
    cognitiveObservation = null;
  }

  let workingMemory: ReturnType<typeof createWorkingMemory> | null = null;
  try {
    if (cognitiveObservation) workingMemory = createWorkingMemory(cognitiveObservation);
  } catch {
    workingMemory = null;
  }

  let hypotheses: ReturnType<typeof buildHypotheses> | null = null;
  try {
    if (workingMemory) hypotheses = buildHypotheses(workingMemory, scenarios, contradictions, arbitration);
  } catch {
    hypotheses = null;
  }

  let cognitiveConflictInternal: ReturnType<typeof resolveCognitiveConflict> | null = null;
  try {
    cognitiveConflictInternal = resolveCognitiveConflict({ scenarios, contradictions, arbitration, riskIntelligence, observation: cognitiveObservation, hypotheses, workingMemory });
  } catch {
    cognitiveConflictInternal = null;
  }

  let decisionContext: ReturnType<typeof buildDecisionContext> | null = null;
  try {
    decisionContext = buildDecisionContext(cognitiveObservation, hypotheses, cognitiveConflictInternal, riskIntelligence);
  } catch {
    decisionContext = null;
  }

  let learningContext: ReturnType<typeof normalizeLearningContext> = null;
  try {
    learningContext = normalizeLearningContext(decisionContext);
  } catch {
    learningContext = null;
  }

  // --- Step 3: Decision Memory (Phase 8.1.3) + Learning Validation read (Phase 8.1.5). ---
  const memory = await queryDecisionMemory({ source: AUTONOMOUS_SOURCE, symbol, side: assessment.side ?? undefined }).catch(() => null);
  const rawConstraints = await getConstraintValidations(AUTONOMOUS_SOURCE, symbol).catch(() => null);

  // --- Step 4: Autonomous Decision Context assembly (Phase 8.2.0). ---
  const autonomousContext = buildAutonomousDecisionContext(AUTONOMOUS_SOURCE, symbol, asOf, assessment, decisionContext, memory, rawConstraints);

  // --- Step 5: Qualification (8.2.2) -> Macro (8.2.3) -> Event Impact (8.2.4) -> Pre-Entry (8.2.5) -> Decision (8.2.6). ---
  const qualification = qualifyAutonomousDecision(autonomousContext);
  const macro = analyzeMacroIntelligence({ asOf, calendar });
  const eventImpact = analyzeEventImpact({ asOf, macro, news });
  const preEntry = validatePreEntry({ decisionContext: autonomousContext, qualification, macro, eventImpact });
  const decision: AutonomousDecisionEngineResult = decideAutonomous({ decisionContext: autonomousContext, qualification, macro, eventImpact, preEntry });

  // --- Step 6 (Phase 8.2.9 §6): duplicate-execution protection — orchestration only, never a second decision engine. ---
  let effectiveDecision: AutonomousDecisionEngineResult = decision;
  let dedupApplied = false;
  let candidateSetupIdentity: string | null = null;

  if (decision.decision === "EXECUTE" && autonomousContext.canonical) {
    candidateSetupIdentity = buildAutonomousSetupIdentity(autonomousContext.canonical);
    const lastExecuted = await getLastExecutedSetup(AUTONOMOUS_SOURCE, symbol).catch(() => null);
    if (isDuplicateSetup(candidateSetupIdentity, lastExecuted)) {
      dedupApplied = true;
      // Downgrade to WAIT for execution purposes only — decideAutonomous()'s
      // own pure answer (`decision`) is preserved above and reported
      // unmodified anywhere this cycle's full trace is inspected; only the
      // ACTION taken this cycle changes, because the underlying setup has
      // already been acted on and nothing has changed since.
      effectiveDecision = { ...decision, decision: "WAIT" };
    }
  }

  // --- Step 7 (Phase 8.2.7): execute or safely no-op; persists the decision trace internally for every outcome. ---
  const execution = await executeAutonomousPaperTrade({
    decision: effectiveDecision,
    assessment,
    risk: risk ?? null,
    confluence,
    learningContext,
  });

  if (execution.outcome === "EXECUTED" && candidateSetupIdentity) {
    await recordExecutedSetup(AUTONOMOUS_SOURCE, symbol, candidateSetupIdentity, execution.paperTradeId).catch(() => {});
  }

  // --- Step 8 (Phase 8.2.8): classify whether this result will enter the existing learning lifecycle on close. ---
  const learningLifecycle = classifyAutonomousLearningLifecycle(execution);

  // --- Step 9 (Phase 8.3.0.1 §10): persist the latest observation-only
  // intelligence snapshot for this symbol. Best-effort — a Learning DB
  // outage here can never fail this cycle (mirrors how recordExecutedSetup
  // above is already awaited-with-catch, never left unhandled). Every
  // field is a verbatim copy of an already-computed value from steps 1-7;
  // nothing is recomputed or re-graded here. ---
  await upsertAutonomousIntelligenceSnapshot({
    source: AUTONOMOUS_SOURCE,
    symbol,
    generatedAt: asOf,
    decision: effectiveDecision.decision,
    side: assessment.side,
    grade: assessment.grade,
    confidence: assessment.confidence,
    riskStatus: assessment.riskStatus,
    entry: assessment.risk?.entry ?? null,
    takeProfit: assessment.risk?.takeProfit ?? null,
    stopLoss: assessment.risk?.stopLoss ?? null,
    riskReward: assessment.risk?.riskReward ?? null,
    sparkline: buildSparkline(context.candles),
    liquidityEvidence: evidenceForSource(confluence.factors, "liquidity"),
    structureEvidence: evidenceForSource(confluence.factors, "market_structure"),
    volumeEvidence: evidenceForSource(confluence.factors, "footprint"),
    macroState: `${macro.macroRegime} / ${macro.eventRisk}`,
    eventState: `${eventImpact.eventState} / ${eventImpact.impactRisk}`,
    reasoningSummary: assessment.gradeReason,
    invalidation: assessment.invalidation,
    learningInfluence: describeLearningInfluence(memory),
    dedupApplied,
    executionOutcome: execution.outcome,
    paperTradeId: execution.paperTradeId,
  }).catch(() => {});

  return {
    version: 1,
    symbol,
    generatedAt: asOf,
    stage: "ASSESSED",
    decision: effectiveDecision.decision,
    dedupApplied,
    executionOutcome: execution.outcome,
    paperTradeId: execution.paperTradeId,
    learningLifecycleStatus: learningLifecycle.status,
    error: execution.error,
  };
}
