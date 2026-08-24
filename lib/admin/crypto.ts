import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 — Admin Dashboard crypto primitives.
//
// No new npm dependency: everything here is node:crypto, which is already
// available in every Vercel serverless function (Node runtime). Two things
// live in this file:
//
//   1. Password hashing (scrypt) — for ADMIN_PASSWORD_HASH. Generated once,
//      offline, via scripts/hash-admin-password.js, then pasted into the
//      Vercel env var. Never derived or stored at runtime.
//   2. HMAC signing — the primitive the stateless admin session (see
//      session.ts) and the IP hashing used for rate limiting / audit log
//      both build on, keyed by ADMIN_SESSION_SECRET.
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;
const SCRYPT_PREFIX = "scrypt";

/** Hash a plaintext admin password for storage in ADMIN_PASSWORD_HASH. Run this offline (see scripts/hash-admin-password.js) — never call it from a request handler with a password you intend to persist anywhere. */
export function hashAdminPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${SCRYPT_PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Constant-time verification of a plaintext password against a stored
 * ADMIN_PASSWORD_HASH value. Returns false (never throws) for any malformed
 * hash, so a misconfigured env var fails closed instead of crashing the
 * login route.
 */
export function verifyAdminPassword(password: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== SCRYPT_KEYLEN) return false;
    const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** HMAC-SHA256 over an arbitrary string, keyed by ADMIN_SESSION_SECRET. Shared primitive for session signing (session.ts) and IP hashing below. Returns null if the secret isn't configured — callers must fail closed on null, never fall back to an unsigned value. */
export function hmacWithSessionSecret(value: string): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Constant-time string compare — used for the private admin entry path, so a mismatch can't be timed to guess the correct path character-by-character. */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid a length-based
    // short-circuit being the only timing signal.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * One-way, salted hash of a client IP for audit logs / rate limiting.
 * NEVER store the raw IP (see Phase 6.6.0.1 spec section 8). Truncated to
 * 16 hex chars — plenty of collision resistance for rate-limit bucketing,
 * keeps stored rows small. Returns "unhashed" if ADMIN_SESSION_SECRET isn't
 * configured yet, so callers still get a stable (if unsalted-looking)
 * bucket key rather than crashing — this only happens in a misconfigured
 * deployment where login itself is already fail-closed for other reasons.
 */
export function hashIp(ip: string): string {
  const hashed = hmacWithSessionSecret(`ip:${ip}`);
  if (hashed) return hashed.slice(0, 16);
  return createHmac("sha256", "elstand-admin-fallback-salt").update(ip).digest("hex").slice(0, 16);
}
