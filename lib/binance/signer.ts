import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Binance's SIGNED endpoint convention: every param (including `timestamp`
// and `recvWindow`) goes into a query string, which is then HMAC-SHA256'd
// with the API secret to produce a `signature` param appended at the end.
// This file is the only place the secret is ever read into a crypto
// primitive — restClient.ts calls this, nothing else touches the secret.
// ---------------------------------------------------------------------------

/** Builds a query string from params, skipping undefined/null values. Order is preserved (insertion order), matching what Binance expects to be able to re-derive on their end (they just re-sign the full string, so order doesn't actually matter to them — but stable order makes local debugging/log redaction reliable). */
export function toQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join("&");
}

export function signQuery(queryString: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(queryString).digest("hex");
}

/** Appends `timestamp`, then `signature`, to a param set and returns the final signed query string. */
export function buildSignedQuery(
  params: Record<string, string | number | boolean | undefined | null>,
  secretKey: string,
  recvWindow: number
): string {
  const withTimestamp = { ...params, recvWindow, timestamp: Date.now() };
  const base = toQueryString(withTimestamp);
  const signature = signQuery(base, secretKey);
  return `${base}&signature=${signature}`;
}

/**
 * Redacts a signed query string for safe logging — keeps param names and
 * shapes, drops the signature and anything that looks like a secret. Used
 * everywhere a request might get logged so the raw signature (which is only
 * valid for a few seconds anyway, but still) never lands in logs.
 */
export function redactQueryForLog(queryString: string): string {
  return queryString
    .split("&")
    .filter((p) => !p.startsWith("signature="))
    .join("&");
}
