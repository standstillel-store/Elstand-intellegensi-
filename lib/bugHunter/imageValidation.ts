// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 15 — "jangan percaya MIME type dari client saja".
//
// Client-supplied Content-Type / filename extension is trivially spoofable.
// This checks the actual file bytes against known JPEG/PNG magic numbers,
// same principle as any antivirus/upload scanner's first-pass check. It is
// NOT a full malware scan — it only proves "this is structurally a JPEG or
// PNG file", which is the specific claim Section 15 asks to verify.
// ---------------------------------------------------------------------------

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024; // 8 MB

export type ValidatedImage = { ext: "png" | "jpg"; contentType: "image/png" | "image/jpeg" };

export function validateEvidenceImage(bytes: Buffer): ValidatedImage | null {
  if (bytes.length === 0 || bytes.length > MAX_EVIDENCE_BYTES) return null;

  if (PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    return { ext: "png", contentType: "image/png" };
  }
  if (JPEG_MAGIC.every((b, i) => bytes[i] === b)) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  return null;
}

export const MAX_EVIDENCE_BYTES_LABEL = "8MB";
