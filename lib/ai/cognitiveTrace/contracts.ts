// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Trace (Phase 8.3.2)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - APPEND-ONLY OBSERVABILITY, NOT A NEW DECISION AUTHORITY. Every field
//     below is a verbatim copy of an already-computed Phase 7/8.0-8.2.x
//     value, captured at the real wall-clock instant `runAutonomousCycle()`
//     (lib/ai/autonomousRuntime/orchestrator.ts) reaches that point in its
//     existing, unchanged sequence. This module computes nothing, grades
//     nothing, decides nothing, and is never read back into a live cycle
//     (see repository.ts — read functions only, never imported by the
//     orchestrator).
//   - DIFFERENT SHAPE FROM, NOT A REPLACEMENT FOR, THE TWO EXISTING
//     OBSERVATION TABLES:
//       * decision_traces (8.2.1) — ONE terminal-outcome row per cycle,
//         frozen `LearningContextSnapshot`. That snapshot deliberately
//         narrows conflict to a single `CognitiveCoherenceState` enum value
//         — no `reasons`/`contributingFactors` (see
//         lib/ai/decisionOutcome/contracts.ts's own doc comment). Still the
//         canonical terminal-outcome record; this module does not
//         duplicate `outcome`/`side`/`sourceSignalId` semantics.
//       * autonomous_intelligence_snapshot (8.3.0.1) — ONE LATEST-STATE row
//         per symbol, upserted (overwritten) every cycle. Explicitly NOT
//         history — the table's own header says so.
//       * cognitive_trace (this module) — ONE row PER CYCLE ATTEMPT,
//         append-only, carrying the FULL, unnarrowed `CognitiveConflictState`
//         (state + reasons + contributingFactors) plus real per-stage
//         wall-clock timestamps for the six stages that are genuinely
//         resolved synchronously within one cycle run. This is the gap
//         neither existing table fills: reconstructing "what did the
//         system see, and when, this specific cycle" without re-running
//         analysis and without synthesizing history out of a single latest
//         snapshot.
//   - EXPLICITLY OUT OF SCOPE THIS PHASE: OUTCOME and LEARNING. A paper
//     trade's outcome is not known at cycle time (it resolves later, when
//     the trade closes) and neither is any downstream learning
//     validation/constraint/failure-pattern effect. Rather than write a
//     fabricated "PENDING" placeholder into this row, or add an UPDATE
//     path that would break the insert-only/immutable-row invariant every
//     8.1.x-8.2.x table in this schema already enforces, this module
//     deliberately stops at EXECUTION. A future phase (see the Learning
//     Loop line of work) reconstructs OUTCOME/LEARNING for a given cycle
//     by joining, at READ time, on `execution.paperTradeId` / `symbol`
//     against the existing `decisionOutcome`/`learningValidation`/
//     `failurePatterns`/`adaptiveConstraint` records those modules already
//     persist with their own real timestamps — never by updating this row.
//   - Persisted for EVERY cycle attempt, including `NO_ASSESSMENT` ones
//     (insufficient candle history, or an exception in step 1 of the
//     orchestrator) — an honest "the system tried and here is why it
//     stopped" is a real cycle event, not something to hide. On those
//     rows only `input` is non-null; `analysis`/`evidence`/`conflict`/
//     `decision`/`execution` and their `*At` timestamps stay `null`
//     together — never a fabricated empty object standing in for a stage
//     that never ran.
// ---------------------------------------------------------------------------

import type { AutonomousDecision } from "@/lib/ai/autonomousDecision/contracts";
import type { AutonomousExecutionOutcome } from "@/lib/ai/autonomousExecution/contracts";
import type { OracleGrade } from "@/lib/ai/oracle/types";
import type { OracleRiskStatus } from "@/lib/ai/oracle/gradingTypes";
import type { CognitiveConflictState } from "@/lib/ai/cognitive/conflict";

/** ELVOID Pro only, matching decisionTrace/autonomousSnapshot's own hard boundary this generation of phases. */
export type CognitiveTraceSource = "ELVOID_PRO_ORACLE";

/** Always present — even a NO_ASSESSMENT cycle reached this stage. */
export interface CognitiveTraceInputStage {
  readonly interval: string;
  /** = `context.candles.length`. `0` only when `assembleOracleContext` itself threw before any candle was read. */
  readonly candleCount: number;
  readonly currentPrice: number | null;
  /** `false` only on a NO_ASSESSMENT cycle. */
  readonly sufficientHistory: boolean;
  /** Verbatim error/insufficiency message. `null` on a normal, sufficient cycle. */
  readonly insufficientReason: string | null;
}

/** `null` only on a NO_ASSESSMENT cycle. */
export interface CognitiveTraceAnalysisStage {
  /** Confluence's own raw reading — `null` when NEUTRAL. Distinct from the DECISION stage's `side`, which is the graded assessment's final side. */
  readonly dominantSide: "LONG" | "SHORT" | null;
  readonly grade: OracleGrade;
  readonly confidence: number;
  readonly riskStatus: OracleRiskStatus;
  readonly riskPlanPresent: boolean;
}

/** `null` only on a NO_ASSESSMENT cycle. Availability booleans only for mtf/regime/scenarios/liquidityOrderFlow — never their internal fields, to avoid a second, drifting copy of shapes those modules already own. */
export interface CognitiveTraceEvidenceStage {
  readonly liquidityEvidence: string | null;
  readonly structureEvidence: string | null;
  readonly volumeEvidence: string | null;
  readonly mtfAvailable: boolean;
  readonly regimeAvailable: boolean;
  readonly scenariosAvailable: boolean;
  readonly liquidityOrderFlowAvailable: boolean;
}

/** Verbatim `CognitiveConflictState` (Phase 8.0.4) — the full, unnarrowed shape (state + reasons + contributingFactors), never the narrowed `conflictState` enum `LearningContextSnapshot` stores. `null` only on a NO_ASSESSMENT cycle. */
export type CognitiveTraceConflictStage = CognitiveConflictState;

/** `null` only on a NO_ASSESSMENT cycle. */
export interface CognitiveTraceDecisionStage {
  readonly decision: AutonomousDecision;
  /** The graded assessment's final side — see the ANALYSIS stage doc for why this differs from `dominantSide`. */
  readonly side: "LONG" | "SHORT" | null;
  readonly dedupApplied: boolean;
}

/** `null` only on a NO_ASSESSMENT cycle (execution is never attempted without an assessment). */
export interface CognitiveTraceExecutionStage {
  readonly outcome: AutonomousExecutionOutcome;
  /** Only non-null when `outcome === "EXECUTED"`. The natural join key for a future OUTCOME/LEARNING read — see module header. */
  readonly paperTradeId: string | null;
  readonly error: string | null;
}

export interface CognitiveTraceInput {
  readonly source: CognitiveTraceSource;
  readonly symbol: string;
  /** ISO 8601 — the cycle's own real start instant (`asOf` in the orchestrator). Also this row's INPUT-stage timestamp. */
  readonly cycleAt: string;

  readonly input: CognitiveTraceInputStage;

  readonly analysis: CognitiveTraceAnalysisStage | null;
  /** ISO 8601 — real wall-clock instant the canonical Oracle assessment (confluence/risk/grading) resolved this cycle. `null` iff `analysis` is `null`. */
  readonly analysisAt: string | null;

  readonly evidence: CognitiveTraceEvidenceStage | null;
  /** ISO 8601 — real instant the mtf/regime/liquidity/scenario block finished this cycle. `null` iff `evidence` is `null`. */
  readonly evidenceAt: string | null;

  readonly conflict: CognitiveTraceConflictStage | null;
  /** ISO 8601 — real instant `resolveCognitiveConflict()` returned this cycle. May equal `evidenceAt` to the millisecond — both are synchronous, non-awaited steps; never fabricated apart. `null` iff `conflict` is `null`. */
  readonly conflictAt: string | null;

  readonly decision: CognitiveTraceDecisionStage | null;
  /** ISO 8601 — real instant this cycle's effective (post-dedup) decision was finalized. `null` iff `decision` is `null`. */
  readonly decisionAt: string | null;

  readonly execution: CognitiveTraceExecutionStage | null;
  /** ISO 8601 — real instant `executeAutonomousPaperTrade()` resolved this cycle. `null` iff `execution` is `null`. */
  readonly executionAt: string | null;
}

export interface CognitiveTraceRecord extends CognitiveTraceInput {
  readonly id: string;
  readonly createdAt: string;
}
