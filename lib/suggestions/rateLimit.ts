// ---------------------------------------------------------------------------
// Phase 6.6.4 — Suggestions rate limiting. Same in-memory-fallback-only
// approach as lib/bugHunter/rateLimit.ts (documented limitation: per-instance
// on serverless, a speed bump against scripted abuse rather than a hard
// guarantee — a durable per-IP counter table can replace this later without
// changing call sites).
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

/** Submission rate limit — 5 suggestions per hour per IP (mirrors bug report submission limit). */
export function checkSuggestionSubmitRateLimit(ipHash: string) {
  return checkAndConsume(`suggestion:${ipHash}`, 60 * 60 * 1000, 5);
}

/** Claim endpoint rate limit — 10 attempts per 10 minutes per IP. */
export function checkSuggestionClaimRateLimit(ipHash: string) {
  return checkAndConsume(`suggestion-claim:${ipHash}`, 10 * 60 * 1000, 10);
}
