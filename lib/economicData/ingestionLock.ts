// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — ingestion lock (Phase G.5, Correction 3).
//
// Reuses the claim/release + stale-reclaim ALGORITHM from
// lib/ai/autonomousRuntime/lock.ts, against the Learning DB
// (getLearningSupabase(), same place economic_releases/
// economic_observations live) and its own small table
// (macro_ingestion_lock) — NOT the autonomous_runtime_lock table, which
// serves an unrelated concern (autonomous runtime). Two separate tables
// in the same project; they never share rows.
//
// THREE DISTINCT STATES (Correction 3 — these are NOT interchangeable):
//   ACQUIRED       — caller may proceed with the write.
//   HELD_BY_OTHER  — another run has the lock and it isn't stale. Safe to
//                    skip; the row data this run would have written is
//                    presumably being written by the run that holds it.
//   UNAVAILABLE    — the lock's own storage couldn't be reached/queried, OR
//                    the lock row itself doesn't exist yet (migration
//                    2026-09b-macro-ingestion-lock.sql created the table but
//                    didn't seed a row; 2026-09-30-macro-ingestion-lock-seed.sql
//                    seeds it — see that migration's header). This is NOT
//                    safe to treat as "go ahead" — a write-protecting lock
//                    that can't confirm exclusivity must not be silently
//                    bypassed, or concurrent writes become possible. Callers
//                    MUST NOT proceed with ingestion on UNAVAILABLE.
//
// 2026-09-30 CORRECTION (production evidence — Supabase postgres_logs, 09-29
// 23:10:01 UTC): claimIngestionLock() used to try an INSERT first and fall
// through to the UPDATE steps on a 23505 (unique-violation) error. That
// INSERT only ever succeeds once, on the lock's very first-ever claim — every
// claim after that (i.e. every single day, forever, once the row exists) hits
// the duplicate-key path, which Postgres logs as an ERROR-severity line
// regardless of the client code catching and handling it. The claim/release
// pattern in lib/ai/autonomousRuntime/lock.ts (same algorithm, different
// table) never does this: its migration (supabase/learning/schema.sql) seeds
// the row up front and the runtime code only ever UPDATEs. This file now
// follows the same convention — see 2026-09-30-macro-ingestion-lock-seed.sql
// and the rewritten claimIngestionLock() below (UPDATE-only; a genuinely
// missing row is reported as UNAVAILABLE via an explicit existence check,
// never masked by a lazy INSERT).
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";

const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes — matches autonomousRuntime/lock.ts's own stale window

export type LockClaim =
  | { state: "ACQUIRED"; release: () => Promise<void> }
  | { state: "HELD_BY_OTHER" }
  | { state: "UNAVAILABLE"; reason: string };

/**
 * Structural type for the one Learning DB client shape this file uses
 * (`.from(table)` returning the chainable subset below). Matches whatever
 * `getLearningSupabase()` actually returns — this file never imports the
 * supabase-js types directly, it just needs the shape.
 */
type LearningDbLike = NonNullable<ReturnType<typeof getLearningSupabase>>;

/**
 * `dbOverride` is a test-only seam (default: real `getLearningSupabase()`).
 * Production callers (ingest.ts) never pass it — same pattern the Alpha
 * Vantage provider fixtures use for `globalThis.fetch`, applied here via an
 * explicit parameter instead, since there's no global to intercept for a
 * module-scoped Supabase client.
 */
export async function claimIngestionLock(lockId: string, dbOverride?: LearningDbLike | null): Promise<LockClaim> {
  // dbOverride === undefined (not passed) -> use the real client. Passed
  // explicitly as null -> simulate "not configured" without falling back to
  // the real client (a test seam, not a `?? `-style fallback).
  const db = dbOverride === undefined ? getLearningSupabase() : dbOverride;
  if (!db) return { state: "UNAVAILABLE", reason: "Learning Supabase is not configured (ELVOID_LEARNING_SUPABASE_URL/ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY missing)" };

  const nowIso = new Date().toISOString();
  const staleBeforeIso = new Date(Date.now() - LOCK_STALE_MS).toISOString();

  // Step 1 — claim it if it's currently free. Atomic, conditional UPDATE: a
  // concurrent caller's identical UPDATE simply matches zero rows once this
  // one has already flipped running to true, so there's no read-then-write
  // race (same reasoning as autonomousRuntime/lock.ts's claimLock()).
  const freeAttempt = await db
    .from("macro_ingestion_lock")
    .update({ running: true, started_at: nowIso, updated_at: nowIso })
    .eq("id", lockId)
    .eq("running", false)
    .select("id")
    .maybeSingle();

  if (freeAttempt.error) return { state: "UNAVAILABLE", reason: freeAttempt.error.message };
  if (freeAttempt.data) return { state: "ACQUIRED", release: () => releaseLock(lockId, dbOverride) };

  // Step 2 — row exists and is marked running; reclaim only if stale
  // (a prior run crashed without releasing).
  const staleAttempt = await db
    .from("macro_ingestion_lock")
    .update({ running: true, started_at: nowIso, updated_at: nowIso })
    .eq("id", lockId)
    .eq("running", true)
    .lt("updated_at", staleBeforeIso)
    .select("id")
    .maybeSingle();

  if (staleAttempt.error) return { state: "UNAVAILABLE", reason: staleAttempt.error.message };
  if (staleAttempt.data) return { state: "ACQUIRED", release: () => releaseLock(lockId, dbOverride) };

  // Step 3 — neither UPDATE matched a row. Two different reasons look
  // identical from here (both UPDATEs affect zero rows), so disambiguate
  // with a read: does the row exist at all?
  const existsCheck = await db.from("macro_ingestion_lock").select("id").eq("id", lockId).maybeSingle();
  if (existsCheck.error) return { state: "UNAVAILABLE", reason: existsCheck.error.message };
  if (!existsCheck.data) {
    return {
      state: "UNAVAILABLE",
      reason: `macro_ingestion_lock row missing for id "${lockId}" — run migration 2026-09-30-macro-ingestion-lock-seed.sql`,
    };
  }

  // Row exists, is running, and is not stale — genuinely held by another run.
  return { state: "HELD_BY_OTHER" };
}

async function releaseLock(lockId: string, dbOverride?: LearningDbLike | null): Promise<void> {
  const db = dbOverride === undefined ? getLearningSupabase() : dbOverride;
  if (!db) return; // nothing to release against if storage vanished mid-run
  const { error } = await db.from("macro_ingestion_lock").update({ running: false, updated_at: new Date().toISOString() }).eq("id", lockId);
  if (error) console.error(`[economicData:ingestionLock] release(${lockId}): ${error.message}`);
}
