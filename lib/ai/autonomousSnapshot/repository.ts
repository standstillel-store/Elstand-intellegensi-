// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Intelligence Snapshot repository
// (Phase 8.3.0.1, Module 1)
//
// Learning DB (lib/ai/learning/db.ts, the SAME isolated project every
// 8.1.x/8.2.x phase uses) adapter only. Writes to the new, additive
// `autonomous_intelligence_snapshot` table via a single atomic
// `upsert(..., { onConflict: "source,symbol" })` — never a check-then-
// write race, matching `decisionOutcome/repository.ts`'s own upsert
// convention.
//
// Degrades gracefully: every function here returns a typed, non-throwing
// result when the Learning DB is unconfigured or the write/read fails —
// same rule as every prior repository.ts in this codebase. A snapshot
// write failure must NEVER surface as an autonomous-cycle failure (the
// orchestrator calls this best-effort, matching how it already calls
// `persistDecisionTrace`).
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { AutonomousIntelligenceSnapshotInput, AutonomousIntelligenceSnapshotRecord } from "./contracts";

export type PersistSnapshotResult = { persisted: true; snapshot: AutonomousIntelligenceSnapshotRecord } | { persisted: false; reason: "not_configured" | "error"; error?: string };

function toRecord(row: Record<string, unknown>): AutonomousIntelligenceSnapshotRecord {
  return {
    id: row.id as string,
    source: row.source as AutonomousIntelligenceSnapshotInput["source"],
    symbol: row.symbol as string,
    generatedAt: row.generated_at as string,
    decision: row.decision as AutonomousIntelligenceSnapshotInput["decision"],
    side: (row.side as AutonomousIntelligenceSnapshotInput["side"]) ?? null,
    grade: row.grade as AutonomousIntelligenceSnapshotInput["grade"],
    confidence: row.confidence as number,
    riskStatus: row.risk_status as AutonomousIntelligenceSnapshotInput["riskStatus"],
    entry: (row.entry as number | null) ?? null,
    takeProfit: (row.take_profit as number | null) ?? null,
    stopLoss: (row.stop_loss as number | null) ?? null,
    riskReward: (row.risk_reward as number | null) ?? null,
    sparkline: (row.sparkline as number[] | null) ?? null,
    liquidityEvidence: (row.liquidity_evidence as string | null) ?? null,
    structureEvidence: (row.structure_evidence as string | null) ?? null,
    volumeEvidence: (row.volume_evidence as string | null) ?? null,
    macroState: (row.macro_state as string | null) ?? null,
    eventState: (row.event_state as string | null) ?? null,
    reasoningSummary: (row.reasoning_summary as string | null) ?? null,
    invalidation: (row.invalidation as string | null) ?? null,
    learningInfluence: (row.learning_influence as string | null) ?? null,
    dedupApplied: Boolean(row.dedup_applied),
    executionOutcome: (row.execution_outcome as string | null) ?? null,
    paperTradeId: (row.paper_trade_id as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Upserts the single latest snapshot row for `(input.source, input.symbol)`.
 * Overwrites the previous row for that key — this table is bounded to one
 * row per symbol by design (spec §10), never an append-only history.
 *
 * Best-effort by convention: callers (the orchestrator) should never await
 * this in a way that lets a Learning DB outage fail the autonomous cycle
 * itself — mirrors `persistDecisionTrace`'s own degrade-gracefully rule.
 */
export async function upsertAutonomousIntelligenceSnapshot(input: AutonomousIntelligenceSnapshotInput): Promise<PersistSnapshotResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const { data, error } = await learningDb
    .from("autonomous_intelligence_snapshot")
    .upsert(
      {
        source: input.source,
        symbol: input.symbol,
        generated_at: input.generatedAt,
        decision: input.decision,
        side: input.side,
        grade: input.grade,
        confidence: input.confidence,
        risk_status: input.riskStatus,
        entry: input.entry,
        take_profit: input.takeProfit,
        stop_loss: input.stopLoss,
        risk_reward: input.riskReward,
        sparkline: input.sparkline,
        liquidity_evidence: input.liquidityEvidence,
        structure_evidence: input.structureEvidence,
        volume_evidence: input.volumeEvidence,
        macro_state: input.macroState,
        event_state: input.eventState,
        reasoning_summary: input.reasoningSummary,
        invalidation: input.invalidation,
        learning_influence: input.learningInfluence,
        dedup_applied: input.dedupApplied,
        execution_outcome: input.executionOutcome,
        paper_trade_id: input.paperTradeId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source,symbol" },
    )
    .select("*")
    .single();

  if (error || !data) return { persisted: false, reason: "error", error: error?.message };

  return { persisted: true, snapshot: toRecord(data) };
}

/**
 * Read-only listing of every symbol's latest snapshot for `source`, most
 * recently updated first. Never throws; returns an empty array when the
 * Learning DB is unconfigured or the query fails — same convention as
 * `listDecisionTracesBySymbol`. This is the ONLY read path the AI Signal
 * Intelligence UI's snapshot API route should ever call — no Oracle call,
 * no scoring, no per-request analysis (spec §10/§16).
 */
export async function listAutonomousIntelligenceSnapshots(source: AutonomousIntelligenceSnapshotInput["source"]): Promise<readonly AutonomousIntelligenceSnapshotRecord[]> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return [];

  const { data } = await learningDb.from("autonomous_intelligence_snapshot").select("*").eq("source", source).order("updated_at", { ascending: false });

  if (!data) return [];
  return data.map(toRecord);
}
