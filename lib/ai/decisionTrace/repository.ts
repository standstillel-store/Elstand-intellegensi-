// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Decision Traceability (Phase 8.2.1)
//
// Learning DB (lib/ai/learning/db.ts, the SAME isolated project every prior
// 8.1.x phase uses) adapter only. Writes to the new, additive
// `decision_traces` table — INSERT-only, no UPDATE function exists anywhere
// in this file, matching this phase's "immutable decision-time snapshot"
// requirement for the entire row, not just a subset of columns.
//
// Never touches the Main Supabase project (lib/supabase.ts), `ai_signals`,
// or `ai_journal` — a trace's optional `sourceSignalId` is stored as an
// opaque logical reference only, never read back from or joined against the
// Main DB here (same no-cross-project-read convention as
// lib/ai/decisionMemory/repository.ts's DecisionSource lookups).
//
// Degrades gracefully: returns a typed, non-throwing result when the
// Learning DB is unconfigured or the write fails — same rule as every prior
// 8.1.x repository.ts (lib/ai/decisionOutcome/repository.ts,
// lib/ai/failurePatterns/repository.ts, etc.).
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { validateDecisionTraceInput } from "./contracts";
import type { DecisionTraceInput, DecisionTraceRecord } from "./contracts";

export type PersistDecisionTraceResult = { persisted: true; trace: DecisionTraceRecord } | { persisted: false; reason: "not_configured" | "invalid_input" | "error"; error?: string };

/**
 * Inserts one immutable decision trace row. `traceId`/`createdAt` are
 * DB-generated (never client-supplied) — see contracts.ts's doc on why
 * `traceId` must be a new, independent identity space from `ai_signals.id`.
 *
 * Rejects (without ever touching the DB) any input where a non-`"EXECUTE"`
 * outcome carries a `sourceSignalId` — `validateDecisionTraceInput` is the
 * single source of truth for this invariant; the SQL CHECK constraint in
 * `supabase/learning/schema.sql` (`decision_traces_signal_ref_only_on_execute`)
 * is a second, independent enforcement of the exact same rule at the
 * database layer, so the invariant holds even for a future caller that
 * bypasses this function.
 */
export async function persistDecisionTrace(input: DecisionTraceInput): Promise<PersistDecisionTraceResult> {
  const validation = validateDecisionTraceInput(input);
  if (!validation.valid) return { persisted: false, reason: "invalid_input", error: validation.reason };

  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const { data, error } = await learningDb
    .from("decision_traces")
    .insert({
      source: input.source,
      outcome: input.outcome,
      symbol: input.symbol,
      side: input.side,
      decision_timestamp: input.decisionTimestamp,
      snapshot: input.snapshot,
      source_signal_id: input.sourceSignalId,
    })
    .select("id, created_at")
    .single();

  if (error || !data) return { persisted: false, reason: "error", error: error?.message };

  return {
    persisted: true,
    trace: { ...input, traceId: data.id as string, createdAt: data.created_at as string },
  };
}

/**
 * Read-only lookup by `traceId` (the Learning DB's own generated id — never
 * `ai_signals.id`). Returns null when the Learning DB is unconfigured or no
 * row matches — never throws.
 */
export async function getDecisionTraceById(traceId: string): Promise<DecisionTraceRecord | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data } = await learningDb.from("decision_traces").select("*").eq("id", traceId).maybeSingle();
  if (!data) return null;

  return {
    traceId: data.id,
    source: data.source,
    outcome: data.outcome,
    symbol: data.symbol,
    side: data.side,
    decisionTimestamp: data.decision_timestamp,
    snapshot: data.snapshot,
    sourceSignalId: data.source_signal_id,
    createdAt: data.created_at,
  };
}

/**
 * Read-only listing of traces for a symbol, most recent first, optionally
 * filtered to a single `outcome`. Never mixes sources (this phase only ever
 * has `"ELVOID_PRO_ORACLE"` rows to return). Returns an empty array — never
 * null, never throws — when the Learning DB is unconfigured.
 */
export async function listDecisionTracesBySymbol(symbol: string, outcome?: DecisionTraceInput["outcome"], limit = 50): Promise<readonly DecisionTraceRecord[]> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return [];

  let query = learningDb.from("decision_traces").select("*").eq("symbol", symbol).order("decision_timestamp", { ascending: false }).limit(limit);
  if (outcome) query = query.eq("outcome", outcome);

  const { data } = await query;
  if (!data) return [];

  return data.map((row) => ({
    traceId: row.id,
    source: row.source,
    outcome: row.outcome,
    symbol: row.symbol,
    side: row.side,
    decisionTimestamp: row.decision_timestamp,
    snapshot: row.snapshot,
    sourceSignalId: row.source_signal_id,
    createdAt: row.created_at,
  }));
}
