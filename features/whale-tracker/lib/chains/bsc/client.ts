import { createPublicClient, http, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { BSC_RPC_URL } from "../../config";

// Single shared viem client for BSC reads (block/log fetching in indexer.ts,
// ERC-20 metadata reads in transferParser.ts, balance reads in
// walletEquity.ts). Server-only — this file is never imported from a
// "use client" component; the browser only ever talks to our own
// app/api/whale/* routes, per spec ("Frontend hanya memanggil API/server
// layer yang memang diperlukan").

let client: PublicClient | undefined;

export function getBscClient(): PublicClient {
  if (!client) {
    client = createPublicClient({ chain: bsc, transport: http(BSC_RPC_URL) });
  }
  return client;
}
