// Minimal in-memory cache with a time-to-live, shared by every data source
// so repeated page loads / widget refreshes don't hammer free-tier rate
// limits. Note: on serverless platforms (Vercel, etc.) each cold start gets
// a fresh in-memory store, so this helps most on a long-running server
// (e.g. `next start` on a VPS) or between requests hitting a warm instance.

type Entry<T> = { value: T; expiresAt: number };
const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await fn();
  // A `undefined`/empty result almost always means "API call failed" (see
  // every lib/intelligence/sources/*.ts — they return undefined on missing
  // key, non-2xx response, or bad shape). Don't lock that failure in for
  // the full success TTL (which for some sources is hours) — retry soon
  // instead, so recovery (key just added, rate limit passed, upstream back
  // up) shows up within seconds instead of requiring a server restart.
  const isEmpty = value === undefined;
  const effectiveTtl = isEmpty ? Math.min(ttlMs, 10_000) : ttlMs;
  store.set(key, { value, expiresAt: now + effectiveTtl });
  return value;
}

/** Wraps a source promise so a rejection is logged (which source, why) before falling back — a bare `.catch(() => fallback)` discards that reason silently, which is exactly why "the key is in .env but nothing shows up" is hard to debug. */
export function logged<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch((err) => {
    console.error(`[${label}] ${err instanceof Error ? err.message : err}`);
    return fallback;
  });
}
