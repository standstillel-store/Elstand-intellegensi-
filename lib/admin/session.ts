import { hmacWithSessionSecret, timingSafeStringEqual } from "./crypto";

// ---------------------------------------------------------------------------
// Stateless, signed admin session (Phase 6.6.0.1 section 4 + 13).
//
// Deliberately NOT a server-side session store (no in-memory map, no
// filesystem) — Vercel serverless functions are ephemeral and can run on a
// different instance per request, so anything kept only in process memory
// would randomly "log the admin out" depending on which instance handled
// the next request. Instead the cookie itself carries a signed, expiring
// payload: {iat, exp}. The signature (HMAC-SHA256 keyed by
// ADMIN_SESSION_SECRET) is what makes it trustworthy — nothing here is
// encryption, it's tamper-evidence. There's no admin-specific data inside
// worth hiding (just two timestamps), so signing without encrypting is the
// right tradeoff and keeps this dependency-free.
// ---------------------------------------------------------------------------

export const ADMIN_SESSION_COOKIE = "els_admin_sess";
const SESSION_MAX_AGE_SECONDS = 4 * 60 * 60; // 4 hours

interface SessionPayload {
  iat: number; // issued-at, unix seconds
  exp: number; // expiry, unix seconds
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(encoded: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof parsed?.iat === "number" && typeof parsed?.exp === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Build a signed session cookie value. Returns null if ADMIN_SESSION_SECRET isn't configured — callers must treat that as "cannot log in", never as "log in unsigned". */
export function createAdminSessionValue(): string | null {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { iat: now, exp: now + SESSION_MAX_AGE_SECONDS };
  const encoded = encodePayload(payload);
  const signature = hmacWithSessionSecret(encoded);
  if (!signature) return null;
  return `${encoded}.${signature}`;
}

/** Verify a session cookie value: valid signature AND not expired. */
export function isAdminSessionValueValid(value: string | undefined | null): boolean {
  if (!value) return false;
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex <= 0) return false;
  const encoded = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  const expectedSignature = hmacWithSessionSecret(encoded);
  if (!expectedSignature) return false;
  if (!timingSafeStringEqual(signature, expectedSignature)) return false;
  const payload = decodePayload(encoded);
  if (!payload) return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now;
}

/** Cookie options shared by every place that sets/clears the admin session cookie, so they can never drift apart. */
export function adminSessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export { SESSION_MAX_AGE_SECONDS };
