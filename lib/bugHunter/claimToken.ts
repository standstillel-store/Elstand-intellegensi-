import { randomBytes, createHash, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 9 — claim token.
//
// Raw token is a URL-safe random string, only ever seen by: (1) this
// module when generating it, (2) the email that gets sent to the
// researcher. The database stores only sha256(raw) — same reasoning as
// admin password hashing (lib/admin/crypto.ts): if bug_claim_tokens ever
// leaks, the leaked hashes are useless for constructing a valid claim link.
//
// One-time-use is enforced in lib/bugHunter/store.ts via a conditional
// UPDATE (`WHERE used_at IS NULL`), not by application-level check-then-set
// — that's what actually closes the race between two near-simultaneous
// claim confirmations.
// ---------------------------------------------------------------------------

const TOKEN_BYTES = 32; // 256 bits
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days — long enough a researcher checking email later isn't punished, short enough a stale leaked link goes cold

export function generateClaimToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  return { rawToken, tokenHash, expiresAt };
}

export function hashClaimToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Constant-time compare for two hex-encoded hashes of equal expected length. Not strictly required since callers look up by hash equality in the DB query itself, but kept for any in-process comparison path. */
export function claimTokenHashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
