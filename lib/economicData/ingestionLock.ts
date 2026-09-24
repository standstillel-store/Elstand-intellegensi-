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
//   UNAVAILABLE    — the lock's own storage couldn't be reached/queried.
//                    This is NOT safe to treat as "go ahead" — a
//                    write-protecting lock that can't confirm exclusivity
//                    must not be silently bypassed, or concurrent writes
//                    become possible. Callers MUST NOT proceed with
//                    ingestion on UNAVAILABLE.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";

const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes — matches autonomousRuntime/lock.ts's own stale window

export type LockClaim =
  | { state: "ACQUIRED"; release: () => Promise<void> }
  | { state: "HELD_BY_OTHER" }
  | { state: "UNAVAILABLE"; reason: string };

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function claimIngestionLock(lockId: string): Promise<LockClaim> {
  const db = getLearningSupabase();
  if (!db) return { state: "UNAVAILABLE", reason: "Learning Supabase is not configured (ELVOID_LEARNING_SUPABASE_URL/ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY missing)" };

  const nowIso = new Date().toISOString();
  const staleBeforeIso = new Date(Date.now() - LOCK_STALE_MS).toISOString();

  // Step 1 — first-ever run for this lock id: insert a fresh, already-claimed row.
  const insertAttempt = await db
    .from("macro_ingestion_lock")
    .insert({ id: lockId, running: true, started_at: nowIso, updated_at: nowIso })
    .select("id")
    .maybeSingle();

  if (!insertAttempt.error && insertAttempt.data) {
    return { state: "ACQUIRED", release: () => releaseLock(lockId) };
  }
  // A real DB error on insert (not "row already exists") means we cannot
  // confirm exclusivity — UNAVAILABLE, do not fall through to a write.
  if (insertAttempt.error && !isUniqueViolation(insertAttempt.error)) {
    return { state: "UNAVAILABLE", reason: insertAttempt.error.message };
  }

  // Step 2 — row exists; claim it if it's currently free.
  const freeAttempt = await db
    .from("macro_ingestion_lock")
    .update({ running: true, started_at: nowIso, updated_at: nowIso })
    .eq("id", lockId)
    .eq("running", false)
    .select("id")
    .maybeSingle();

  if (freeAttempt.error) return { state: "UNAVAILABLE", reason: freeAttempt.error.message };
  if (freeAttempt.data) return { state: "ACQUIRED", release: () => releaseLock(lockId) };

  // Step 3 — row exists and is marked running; reclaim only if stale
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
  if (staleAttempt.data) return { state: "ACQUIRED", release: () => releaseLock(lockId) };

  // Row exists, is running, and is not stale — genuinely held by another run.
  return { state: "HELD_BY_OTHER" };
}

async function releaseLock(lockId: string): Promise<void> {
  const db = getLearningSupabase();
  if (!db) return; // nothing to release against if storage vanished mid-run
  const { error } = await db.from("macro_ingestion_lock").update({ running: false, updated_at: new Date().toISOString() }).eq("id", lockId);
  if (error) console.error(`[economicData:ingestionLock] release(${lockId}): ${error.message}`);
}
