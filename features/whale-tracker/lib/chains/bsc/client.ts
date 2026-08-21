import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { BSC_RPC_URL, BSC_RPC_FALLBACK_URLS } from "../../config";

// Single shared viem client for BSC reads (block/log fetching in indexer.ts,
// ERC-20 metadata reads in transferParser.ts, balance reads in
// walletEquity.ts). Server-only — this file is never imported from a
// "use client" component; the browser only ever talks to our own
// app/api/whale/* routes, per spec ("Frontend hanya memanggil API/server
// layer yang memang diperlukan").

let client: PublicClient | undefined;

export function getBscClient(): PublicClient {
  if (!client) {
    // Explicit timeout + low retry count per endpoint: a hanging/slow RPC
    // call must fail fast rather than let the whole serverless invocation
    // run past the platform's function-duration limit with zero bytes ever
    // sent back (see AUDIT.md — "Operation timed out ... 0 bytes received").
    const primary = http(BSC_RPC_URL, { timeout: 8_000, retryCount: 1 });
    const backups = BSC_RPC_FALLBACK_URLS.map((url) => http(url, { timeout: 8_000, retryCount: 1 }));

    // viem's fallback() transport tries transports in order and moves to
    // the next one whenever a call throws/times out (rate limit, 429, or
    // our own 8s timeout above all count) — this is what lets BSC_RPC_URL
    // (Alchemy, paid quota) act as primary while BSC_RPC_FALLBACK_URLS
    // (e.g. public/shared RPCs) kick in automatically if it's ever
    // exhausted or unreachable, instead of the whole indexer run failing.
    client = createPublicClient({
      chain: bsc,
      transport: backups.length > 0 ? fallback([primary, ...backups]) : primary,
    });
  }
  return client;
}
