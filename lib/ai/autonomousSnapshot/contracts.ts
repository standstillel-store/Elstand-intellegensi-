// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Intelligence Snapshot (Phase 8.3.0.1,
// Module 1)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This is an OBSERVATION-ONLY persistence adapter, exactly like
//     `lib/ai/decisionTrace` (Phase 8.2.1) is for the append-only trace
//     record of the same cycle. The difference is shape, not authority:
//     decisionTrace is append-only history, this module is a bounded,
//     ONE-ROW-PER-(source, symbol) LATEST-STATE table, upserted every
//     autonomous cycle.
//   - Every field on `AutonomousIntelligenceSnapshotInput` is a verbatim
//     copy of an already-computed Phase 7/8.2.x value. This module
//     computes nothing, grades nothing, decides nothing — it only shapes
//     already-computed fields into one flat record for storage. It must
//     NEVER become a second decision authority, a second scoring engine,
//     or a trigger for another autonomous cycle (spec §10).
//   - `decision` is the SAME `effectiveDecision.decision` value the
//     orchestrator already writes to `decision_traces.outcome` for this
//     exact cycle — never independently derived.
//   - Written for EXECUTE, WAIT, and REJECT alike (spec §15) — WAIT/REJECT
//     are first-class states here, not filtered out.
// ---------------------------------------------------------------------------

import type { OracleGrade } from "@/lib/ai/oracle/types";
import type { OracleRiskStatus } from "@/lib/ai/oracle/gradingTypes";
import type { AutonomousDecision } from "@/lib/ai/autonomousDecision/contracts";
import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";

/**
 * Single input shape for `upsertAutonomousIntelligenceSnapshot()`. Every
 * field is optional/nullable except the identity + decision-identity
 * fields — matching `OracleAssessment`'s own "null means honestly
 * unavailable, never fabricated" convention.
 */
export interface AutonomousIntelligenceSnapshotInput {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly generatedAt: string;
  readonly decision: AutonomousDecision;
  readonly side: "LONG" | "SHORT" | null;
  readonly grade: OracleGrade;
  readonly confidence: number;
  readonly riskStatus: OracleRiskStatus;

  readonly entry: number | null;
  readonly takeProfit: number | null;
  readonly stopLoss: number | null;
  readonly riskReward: number | null;

  /**
   * Phase 8.3.0.1 §6 (Mini Chart, Option A) — bounded array of real
   * closing prices, verbatim from this cycle's `OracleContext.candles`
   * (the same Binance real candles the Oracle pipeline already fetched
   * and graded against — never an independent per-card market request).
   * Capped small by the caller before it reaches here; null when too few
   * real candles were available this cycle.
   */
  readonly sparkline: readonly number[] | null;

  readonly liquidityEvidence: string | null;
  readonly structureEvidence: string | null;
  readonly volumeEvidence: string | null;

  readonly macroState: string | null;
  readonly eventState: string | null;

  readonly reasoningSummary: string | null;
  readonly invalidation: string | null;
  readonly learningInfluence: string | null;

  readonly dedupApplied: boolean;
  readonly executionOutcome: string | null;
  readonly paperTradeId: string | null;
}

/** Stored row shape, as read back — adds DB-generated `id`/`updatedAt`. */
export interface AutonomousIntelligenceSnapshotRecord extends AutonomousIntelligenceSnapshotInput {
  readonly id: string;
  readonly updatedAt: string;
}
