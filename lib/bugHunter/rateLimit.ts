// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 16 — "Rate-limit claim endpoint. Rate-limit report
// submission."
//
// Same in-memory-fallback-only approach as lib/admin/rateLimit.ts, but
// without piggybacking on admin_audit_log (that table is admin-specific).
// This keeps its own tiny in-memory buckets. Documented limitation, same
// as the admin version: on Vercel serverless this is per-instance and can
// reset between cold starts, so it's a meaningful speed bump against
// scripted abuse on a warm instance, not a hard guarantee. A durable
// per-IP counter table can replace this later without changing the
// call sites below.
// ---------------------------------------------------------------------------

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function checkAndConsume(key: string, windowMs: number, maxAttempts: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= maxAttempts) {
    return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - (now - existing.windowStart)) / 1000) };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Section 16: report submission rate limit — 5 submissions per hour per IP. */
export function checkReportSubmitRateLimit(ipHash: string) {
  return checkAndConsume(`report:${ipHash}`, 60 * 60 * 1000, 5);
}

/** Section 16: claim endpoint rate limit — 10 attempts per 10 minutes per IP (covers both info-fetch and confirm calls, since both are guessable-token-adjacent). */
export function checkClaimRateLimit(ipHash: string) {
  return checkAndConsume(`claim:${ipHash}`, 10 * 60 * 1000, 10);
}
