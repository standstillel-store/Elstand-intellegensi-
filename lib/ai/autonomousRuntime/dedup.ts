// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Duplicate Execution Protection (Phase 8.2.9 §6)
//
// WHAT COUNTS AS A DUPLICATE DECISION, EXACTLY:
//   Two autonomous cycles for the SAME (source, symbol) whose canonical
//   Oracle read has not materially changed — same side, same grade, same
//   invalidation text — are the same "setup", even though
//   `OracleAssessment.timestamp` (and therefore
//   `lib/ai/oracle/execute.ts::buildOracleSignalId()`'s own hash) differs
//   on every cycle, because `assembleOracleContext()` always stamps a
//   fresh generation time. This module does NOT touch, widen, or
//   duplicate `buildOracleSignalId()` — that function's identity remains
//   the canonical, protected per-assessment idempotency key at the
//   execution layer (its own UNIQUE DB index still applies, unchanged).
//   This module adds one layer ABOVE it: a coarser, cycle-to-cycle
//   identity that answers "have we already acted on this same read of
//   the market", so the orchestrator can safely downgrade a would-be
//   second EXECUTE into a WAIT before ever calling
//   `executeAutonomousPaperTrade()` a second time for an unchanged setup.
//
// Deterministic, pure identity function + a thin Learning DB read/write
// pair — no scoring, no re-grading, no second decision engine.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { AutonomousCanonicalSnapshot, DecisionSource } from "@/lib/ai/autonomous/contracts";

/**
 * Pure, deterministic identity string for one Oracle "setup" — stable
 * across repeated autonomous cycles as long as the canonical read hasn't
 * materially changed. Deliberately narrower than `AutonomousCanonicalSnapshot`
 * itself: excludes `timestamp` (always advances) and `confidence` (can
 * drift by a point or two cycle-to-cycle without representing a new
 * setup) — includes only `symbol` + `side` + `grade` + `invalidation`,
 * the four fields that together describe "the same trade idea".
 */
export function buildAutonomousSetupIdentity(canonical: AutonomousCanonicalSnapshot): string {
  return `${canonical.symbol}|${canonical.side ?? "NONE"}|${canonical.grade}|${canonical.invalidation}`;
}

export interface LastExecutedSetup {
  readonly setupIdentity: string;
  readonly paperTradeId: string | null;
  readonly executedAt: string;
}

/**
 * Reads the last-executed setup identity for one (source, symbol), or
 * `null` when none exists yet or the Learning DB is unavailable — an
 * honest "nothing to compare against", never treated as an error and
 * never blocking a first-ever EXECUTE for a symbol.
 */
export async function getLastExecutedSetup(source: DecisionSource, symbol: string): Promise<LastExecutedSetup | null> {
  const db = getLearningSupabase();
  if (!db) return null;

  const { data, error } = await db.from("autonomous_execution_dedup").select("setup_identity, paper_trade_id, executed_at").eq("source", source).eq("symbol", symbol).maybeSingle();

  if (error || !data) return null;
  return { setupIdentity: data.setup_identity, paperTradeId: data.paper_trade_id, executedAt: data.executed_at };
}

/**
 * Records the setup identity this runtime just EXECUTEd for one (source,
 * symbol) — upsert on the `(source, symbol)` primary key, so a later
 * genuinely-new setup safely overwrites the previous record rather than
 * accumulating history (this table is a "last known" pointer, not an
 * append-only log; the full history already lives in `decision_traces`,
 * Phase 8.2.1, untouched). Best-effort: a write failure here can never
 * affect the trade that was already executed — it only means a future
 * cycle might re-attempt on the same setup, which
 * `buildOracleSignalId()`'s own unchanged per-assessment idempotency
 * still protects at the execution layer.
 */
export async function recordExecutedSetup(source: DecisionSource, symbol: string, setupIdentity: string, paperTradeId: string | null): Promise<void> {
  const db = getLearningSupabase();
  if (!db) return;
  await db.from("autonomous_execution_dedup").upsert(
    { source, symbol, setup_identity: setupIdentity, paper_trade_id: paperTradeId, executed_at: new Date().toISOString() },
    { onConflict: "source,symbol" }
  );
}

/**
 * `true` when `candidateIdentity` matches the last-recorded executed
 * setup for this (source, symbol) — the sole predicate the orchestrator
 * uses to downgrade a candidate EXECUTE into a safe WAIT. A `null`
 * `lastExecuted` (nothing recorded yet, or Learning DB unavailable)
 * always returns `false` — never blocks a first execution.
 */
export function isDuplicateSetup(candidateIdentity: string, lastExecuted: LastExecutedSetup | null): boolean {
  if (!lastExecuted) return false;
  return lastExecuted.setupIdentity === candidateIdentity;
}
