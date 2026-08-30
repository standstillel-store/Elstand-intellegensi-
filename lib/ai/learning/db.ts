import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// ELVOID Learning Database — Phase 8.1.0
//
// A DEDICATED, ISOLATED Supabase project, separate from the Main Supabase
// project (lib/supabase.ts) that backs ai_signals/ai_journal/users/wallet/
// earn/rewards. This client connects ONLY to that separate project, using
// its own env vars. It NEVER falls back to the Main Supabase client — if
// the Learning DB env vars are missing, this returns null (same
// "everything degrades gracefully" rule the rest of the repo already
// follows — see lib/supabase.ts, lib/alchemy.ts), it does not silently
// redirect Learning DB reads/writes at the main project.
//
// WHY SEPARATE:
//   Main Supabase remains the sole canonical authority for trading state
//   (ai_signals, ai_journal, users, auth, wallet, earn, rewards). The
//   Learning Database is a dedicated historical intelligence memory for
//   Phase 8.1+ — keeping it in its own project means a future Phase 8.1.2+
//   pattern-detection workload, schema change, or even a full wipe/reset
//   of learning data can never touch operational/financial/auth tables,
//   and vice versa: nothing here can ever accidentally read or write
//   ai_signals/ai_journal directly (that still goes through
//   lib/supabase.ts, read-only, from lib/ai/decisionOutcome/repository.ts).
//
// Server-side only. SERVICE_ROLE key must never reach a "use client"
// component, must never be returned in an API response, and must never be
// logged — same rule as SUPABASE_SERVICE_ROLE_KEY already follows.
// ---------------------------------------------------------------------------

let client: SupabaseClient | null | undefined;

export function isLearningSupabaseConfigured(): boolean {
  return Boolean(process.env.ELVOID_LEARNING_SUPABASE_URL && process.env.ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Server-only client for the isolated ELVOID Learning Database, using its
 * own service-role key (bypasses that project's own RLS by design, same
 * reasoning as the Main Supabase client). Never import this from a
 * "use client" component; only from Server Components, Route Handlers, or
 * server-only utilities.
 *
 * Returns null when the two ELVOID_LEARNING_* env vars are not both set —
 * this NEVER falls back to the Main Supabase client (lib/supabase.ts) or
 * to any other project. Callers must treat null as "Learning DB
 * unavailable right now" and degrade gracefully (skip the capture, never
 * throw, never block trading), exactly like every other optional data
 * source in this repo.
 */
export function getLearningSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.ELVOID_LEARNING_SUPABASE_URL;
  const key = process.env.ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
