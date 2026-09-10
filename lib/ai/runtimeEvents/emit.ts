// ---------------------------------------------------------------------------
// ELVOID Autonomous Runtime — Runtime Event Emitter (Phase 8.5)
//
// Writes to public.runtime_events (see the
// create_runtime_events_table migration) — a purely observational,
// append-only log of REAL operations the autonomous cycle actually
// performed. This module has exactly one job: turn a real, already-known
// outcome (an operation that already ran, with a real status and real
// timing) into a best-effort row. It never decides anything, never reads
// its own writes, and is never awaited by anything that would let a
// Learning DB hiccup slow down or fail the trading cycle.
//
// Same fail-safe contract as every other Phase 8.5 persistence helper:
// never throws, and a write failure is logged inline below (not silently
// discarded) rather than invisible.
//
// This module does NOT decide what counts as a "real" event — the caller
// (lib/ai/autonomousRuntime/orchestrator.ts) only ever calls it with
// values it already computed from an operation that actually ran. If an
// operation didn't run, no event is emitted for it — there is no
// synthetic/placeholder/heartbeat event anywhere in this file.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";

export type RuntimeEventComponent =
  | "CYCLE"
  | "MARKET_DATA"
  | "INTELLIGENCE"
  | "ORACLE"
  | "RISK"
  | "EXTERNAL_INTELLIGENCE"
  | "CONFLICT"
  | "QUALIFICATION"
  | "PRE_ENTRY"
  | "DECISION"
  | "EXECUTION"
  | "LEARNING";

export type RuntimeEventStatus = "RUNNING" | "SUCCESS" | "WARNING" | "ERROR" | "SKIPPED" | "WAIT" | "REJECT" | "UNAVAILABLE";

export interface RuntimeEventInput {
  readonly cycleId: string;
  readonly symbol: string;
  readonly component: RuntimeEventComponent;
  /** Real function/operation name — e.g. "getKlines", "computeConfluence", "assembleExternalIntelligenceSignal". Never a made-up label for something that didn't run. */
  readonly operation: string;
  readonly status: RuntimeEventStatus;
  readonly startedAt: string; // ISO — real wall-clock instant the operation began
  readonly completedAt: string | null; // ISO, null only for a RUNNING marker
  readonly durationMs: number | null; // null only for a RUNNING marker
  readonly message?: string | null;
  /** Structured, real values only (grade, confidence, provider name, an actual returned URL, an actual error message/code). Never fabricated to fill the shape. */
  readonly metadata?: Record<string, unknown> | null;
}

/**
 * Fire-and-forget. Never throws, never rejects into the caller — a
 * Learning DB outage degrades to a logged (non-fatal) failure, exactly
 * like every other Phase 8.5 persistence path. Call this AFTER you
 * already know the real outcome — do not call it speculatively.
 */
export function emitRuntimeEvent(input: RuntimeEventInput): void {
  const learningDb = getLearningSupabase();
  if (!learningDb) return; // not configured — same "expected in some environments" rule as every other Learning DB write

  // Phase 8.5 fix: the Supabase query builder returned by .insert(...) is
  // PromiseLike, not a full Promise — it has no .catch()/.finally(). An
  // async IIFE that `await`s it (same proven pattern as
  // persistCognitiveTrace/persistDecisionTrace elsewhere in this
  // codebase) always returns a genuine Promise, so try/catch below is
  // reliable regardless of the builder's own type.
  void (async () => {
    try {
      const { error } = await learningDb.from("runtime_events").insert({
        source: "ELVOID_PRO_ORACLE",
        cycle_id: input.cycleId,
        symbol: input.symbol,
        component: input.component,
        operation: input.operation,
        status: input.status,
        started_at: input.startedAt,
        completed_at: input.completedAt,
        duration_ms: input.durationMs,
        message: input.message ?? null,
        metadata: input.metadata ?? null,
      });
      if (error) {
        console.error(`[ElVoid AI] Runtime event emit failed (non-fatal, cycle continues): ${input.component}/${input.operation} — ${error.message}`);
      }
    } catch (err) {
      console.error("[ElVoid AI] Runtime event emit threw unexpectedly (non-fatal):", err instanceof Error ? err.message : String(err));
    }
  })();
}

/**
 * Small timing helper so call sites don't hand-roll Date.now() math. Pass
 * the ISO `startedAt` you already captured before the real operation ran;
 * this returns `{ completedAt, durationMs }` from the actual elapsed time
 * — never an estimate.
 */
export function elapsedSince(startedAtIso: string): { completedAt: string; durationMs: number } {
  const startedMs = Date.parse(startedAtIso);
  const completedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.parse(completedAt) - startedMs);
  return { completedAt, durationMs };
}
