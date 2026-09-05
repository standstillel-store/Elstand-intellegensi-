// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Trace repository (Phase 8.3.2)
//
// Learning DB (lib/ai/learning/db.ts, the SAME isolated project every prior
// 8.1.x/8.2.x/8.3.x phase uses) adapter only. Writes to the new, additive
// `cognitive_trace` table — INSERT-only, no UPDATE function exists anywhere
// in this file, same "immutable decision-time record" rule as
// lib/ai/decisionTrace/repository.ts.
//
// Degrades gracefully: every function here returns a typed, non-throwing
// result when the Learning DB is unconfigured or the write/read fails —
// same rule as every prior repository.ts in this codebase. A trace write
// failure must NEVER surface as an autonomous-cycle failure (the
// orchestrator calls this best-effort, matching how it already calls
// `persistDecisionTrace`/`upsertAutonomousIntelligenceSnapshot`).
//
// Read-only, UI-facing: `listCognitiveTracesBySymbol` runs no Oracle call,
// no scoring, no per-request analysis — it only reads rows other,
// already-scheduled processes already wrote. A page load against this
// module can never itself trigger an AI cycle.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { CognitiveTraceInput, CognitiveTraceRecord } from "./contracts";

export type PersistCognitiveTraceResult = { persisted: true; trace: CognitiveTraceRecord } | { persisted: false; reason: "not_configured" | "error"; error?: string };

function toRecord(row: Record<string, unknown>): CognitiveTraceRecord {
  return {
    id: row.id as string,
    source: row.source as CognitiveTraceInput["source"],
    symbol: row.symbol as string,
    cycleAt: row.cycle_at as string,
    input: row.input as CognitiveTraceInput["input"],
    analysis: (row.analysis as CognitiveTraceInput["analysis"]) ?? null,
    analysisAt: (row.analysis_at as string | null) ?? null,
    evidence: (row.evidence as CognitiveTraceInput["evidence"]) ?? null,
    evidenceAt: (row.evidence_at as string | null) ?? null,
    conflict: (row.conflict as CognitiveTraceInput["conflict"]) ?? null,
    conflictAt: (row.conflict_at as string | null) ?? null,
    decision: (row.decision as CognitiveTraceInput["decision"]) ?? null,
    decisionAt: (row.decision_at as string | null) ?? null,
    execution: (row.execution as CognitiveTraceInput["execution"]) ?? null,
    executionAt: (row.execution_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * Inserts one immutable Cognitive Trace row for one cycle attempt.
 * `id`/`createdAt` are DB-generated (never client-supplied). Never throws —
 * a Learning DB outage or write error resolves to `{ persisted: false }`,
 * same convention as `persistDecisionTrace`.
 */
export async function persistCognitiveTrace(input: CognitiveTraceInput): Promise<PersistCognitiveTraceResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const { data, error } = await learningDb
    .from("cognitive_trace")
    .insert({
      source: input.source,
      symbol: input.symbol,
      cycle_at: input.cycleAt,
      input: input.input,
      analysis: input.analysis,
      analysis_at: input.analysisAt,
      evidence: input.evidence,
      evidence_at: input.evidenceAt,
      conflict: input.conflict,
      conflict_at: input.conflictAt,
      decision: input.decision,
      decision_at: input.decisionAt,
      execution: input.execution,
      execution_at: input.executionAt,
    })
    .select("*")
    .single();

  if (error || !data) return { persisted: false, reason: "error", error: error?.message };

  return { persisted: true, trace: toRecord(data) };
}

/**
 * Read-only listing of Cognitive Trace rows for a symbol, most recent cycle
 * first. Never throws; returns an empty array — never null — when the
 * Learning DB is unconfigured or the query fails, same convention as
 * `listDecisionTracesBySymbol`. This is the read path a UI should call —
 * it never triggers a fresh cycle.
 */
export async function listCognitiveTracesBySymbol(symbol: string, limit = 50): Promise<readonly CognitiveTraceRecord[]> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return [];

  const { data } = await learningDb.from("cognitive_trace").select("*").eq("symbol", symbol).order("cycle_at", { ascending: false }).limit(limit);

  if (!data) return [];
  return data.map(toRecord);
}

/** Read-only lookup by `id`. Returns `null` when the Learning DB is unconfigured or no row matches — never throws. */
export async function getCognitiveTraceById(id: string): Promise<CognitiveTraceRecord | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data } = await learningDb.from("cognitive_trace").select("*").eq("id", id).maybeSingle();
  if (!data) return null;

  return toRecord(data);
}
