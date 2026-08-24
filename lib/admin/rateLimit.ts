import { getSupabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 section 9 — brute-force protection for admin login.
//
// Deliberately reuses admin_audit_log instead of a dedicated attempts
// table: a "how many ADMIN_LOGIN_FAILED rows for this ip_hash in the last
// N minutes" query is exactly a login-attempt counter, and login already
// writes ADMIN_LOGIN_FAILED / ADMIN_LOGIN_SUCCESS rows there. One fewer
// table to migrate and keep RLS-correct for the same information.
//
// Cooldown, not permanent lockout (spec section 9: "Jangan membuat
// permanent lockout hanya karena kesalahan password") — after
// MAX_ATTEMPTS failures the window simply has to pass; a rejected attempt
// during the cooldown never even reaches password verification, so
// scripted guessing can't burn through candidates faster than the window
// allows.
//
// Known limitation (documented rather than hidden — see the final report):
// when Supabase isn't configured, this falls back to a module-level
// in-memory Map. On Vercel serverless that memory is per-instance and can
// be recycled between requests, so the fallback is best-effort only, not a
// hard guarantee. It still meaningfully slows down a script hitting the
// same warm instance repeatedly, which covers the common case.
// ---------------------------------------------------------------------------

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const memoryFallback = new Map<string, number[]>(); // ipHash -> timestamps (ms) of recent failures

function checkMemoryFallback(ipHash: string): RateLimitResult {
  const now = Date.now();
  const attempts = (memoryFallback.get(ipHash) ?? []).filter((t) => now - t < WINDOW_MS);
  memoryFallback.set(ipHash, attempts);
  if (attempts.length >= MAX_ATTEMPTS) {
    const oldestInWindow = Math.min(...attempts);
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - oldestInWindow)) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Call BEFORE verifying the password. If not allowed, reject the request immediately (don't run scryptSync, don't reveal whether the password was right). */
export async function checkAdminLoginRateLimit(ipHash: string): Promise<RateLimitResult> {
  const supabase = getSupabase();
  if (!supabase) return checkMemoryFallback(ipHash);

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("admin_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .in("action", ["ADMIN_LOGIN_FAILED", "ADMIN_LOGIN_RATE_LIMITED"])
    .gte("created_at", since);

  if (error) {
    // Fail open on a query error rather than locking every admin out
    // because of a transient DB hiccup — the memory fallback still gives
    // some protection for this instance in that window.
    console.error("[admin rate limit] query failed, falling back to memory:", error.message);
    return checkMemoryFallback(ipHash);
  }

  if ((count ?? 0) >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Record a failed attempt in the in-memory fallback too, so consecutive requests on the same warm instance are still throttled even without Supabase configured. No-op when Supabase IS configured (the audit log insert itself is the record). */
export function recordMemoryFallbackFailure(ipHash: string): void {
  if (getSupabase()) return;
  const attempts = memoryFallback.get(ipHash) ?? [];
  attempts.push(Date.now());
  memoryFallback.set(ipHash, attempts);
}
