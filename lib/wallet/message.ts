// A lightweight, custom sign-to-verify challenge — NOT full EIP-4361 (SIWE).
// It proves the connecting browser controls the private key for `address`
// at this moment (that's all "wallet hanya untuk verifikasi kepemilikan
// alamat" requires), but it doesn't track single-use nonces server-side the
// way SIWE does, so a captured signature is technically replayable until it
// falls outside RECENCY_WINDOW_MS. Good enough for "prove you own this
// address before we save it"; if this ever needs to gate something
// higher-stakes than a profile field, swap this for the `siwe` package.
export const RECENCY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function buildVerificationMessage(params: { address: string; nonce: string; timestamp: string }): string {
  return [
    "Sign this message to verify you own this wallet on ELSTAND INTELLIGENCE.",
    "",
    `Address: ${params.address}`,
    `Timestamp: ${params.timestamp}`,
    `Nonce: ${params.nonce}`,
  ].join("\n");
}

export function generateNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
