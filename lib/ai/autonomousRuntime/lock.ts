// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Runtime Lock (Phase 8.2.9)
//
// A plain, single-row-per-id advisory lock backed by the Learning DB's
// `autonomous_runtime_lock` table (supabase/learning/schema.sql). This is
// deliberately NOT a Postgres advisory lock / transaction — the goal per
// the phase's own instructions is a proportional, non-distributed
// mechanism that prevents two overlapping invocations of the same
// runtime job (autonomous cycle batch, or learning refresh) from running
// concurrently, not a general-purpose distributed lock service.
//
// Fails OPEN on any Learning DB error/unavailability — a lock that can't
// be verified is treated as "not configured, proceed" (never "block
// everything forever"), matching this repo's existing "Learning DB
// unavailable -> degrade gracefully, never throw" convention everywhere
// else in lib/ai/*.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";

const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes — long enough for a slow batch, short enough that a crashed run self-heals within one cron cycle.

export type LockClaim = { claimed: true; release: () => Promise<void> } | { claimed: false; reason: "not_configured" | "already_running" | "error"; error?: string };

/**
 * Attempts to atomically claim the named lock row. Succeeds when the row
 * is currently `running = false`, OR when it has been `running = true`
 * for longer than `LOCK_STALE_MS` (a crashed prior invocation never
 * released it — reclaimed rather than blocking forever). Returns a
 * `release()` closure that must be called (ideally in a `finally`) once
 * the guarded work completes, successfully or not.
 */
export async function claimLock(id: string): Promise<LockClaim> {
  const db = getLearningSupabase();
  if (!db) return { claimed: false, reason: "not_configured" };

  const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString();
  const now = new Date().toISOString();

  // Two-step claim: try the common case (currently free) first, then the
  // stale-reclaim case. Each is its own atomic, conditional UPDATE — no
  // read-then-write race between two concurrent callers, since a
  // concurrent caller's UPDATE simply matches zero rows once this one has
  // already flipped `running` to `true`.
  const freeAttempt = await db
    .from("autonomous_runtime_lock")
    .update({ running: true, started_at: now, updated_at: now })
    .eq("id", id)
    .eq("running", false)
    .select("id")
    .maybeSingle();

  if (freeAttempt.error) return { claimed: false, reason: "error", error: freeAttempt.error.message };

  let claimed = Boolean(freeAttempt.data);

  if (!claimed) {
    const staleAttempt = await db
      .from("autonomous_runtime_lock")
      .update({ running: true, started_at: now, updated_at: now })
      .eq("id", id)
      .eq("running", true)
      .lt("started_at", staleBefore)
      .select("id")
      .maybeSingle();

    if (staleAttempt.error) return { claimed: false, reason: "error", error: staleAttempt.error.message };
    claimed = Boolean(staleAttempt.data);
  }

  if (!claimed) return { claimed: false, reason: "already_running" };

  return {
    claimed: true,
    release: async () => {
      const releaseDb = getLearningSupabase();
      if (!releaseDb) return;
      await releaseDb.from("autonomous_runtime_lock").update({ running: false, updated_at: new Date().toISOString() }).eq("id", id);
    },
  };
}
