import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// ---------------------------------------------------------------------------
// AES-256-GCM for the *optional* "save keys via Settings" path (see
// credentials.ts). The default, recommended path is still plain env vars
// (BINANCE_API_KEY / BINANCE_SECRET_KEY), which never touch a database at
// all. This file only matters if someone opts into DB-stored keys, in which
// case: never store plaintext, never return decrypted values to the client,
// only ever decrypt server-side right before a signed Binance call.
//
// ENCRYPTION_KEY (env, server-only) can be any string — it's stretched to a
// 32-byte key with SHA-256 rather than requiring the user to hand-generate
// exactly 32 random bytes. Without it, the DB-credential path is disabled
// and getCredentials() falls back to env vars only (see credentials.ts).
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export interface EncryptedPayload {
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 8);
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY belum diset — tidak bisa menyimpan API key terenkripsi.");
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv: iv.toString("hex"), authTag: authTag.toString("hex"), ciphertext: ciphertext.toString("hex") };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY belum diset — tidak bisa membaca API key tersimpan.");
  const key = deriveKey(secret);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Last 4 characters only — enough for the user to recognize which key is active, never enough to reconstruct it. */
export function maskKey(key: string): string {
  if (key.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, key.length - 4))}${key.slice(-4)}`;
}
