import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { bsc, bscTestnet } from "viem/chains";

// ---------------------------------------------------------------------------
// Reward verification needs BOTH BSC mainnet (56, the Add Liquidity quest's
// chain per the supplied Uniswap URL — see config.ts's chain-mismatch note)
// and BSC testnet (97, the existing /wallet dashboard's chain, reused by
// Buy ELS). features/whale-tracker/lib/chains/bsc/client.ts is BSC-mainnet
// only, so this is a small sibling factory rather than a rewrite of that
// module — same timeout/retry/fallback shape, keyed by chain id, memoized
// per chain so repeated calls in one request don't rebuild transports.
// ---------------------------------------------------------------------------

const RPC_URLS: Record<number, { primary: string; fallbacks: string[] }> = {
  56: {
    primary: process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org",
    fallbacks: (process.env.BSC_RPC_FALLBACK_URLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  97: {
    primary: process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545",
    fallbacks: (process.env.BSC_TESTNET_RPC_FALLBACK_URLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
};

const CHAINS = { 56: bsc, 97: bscTestnet } as const;

const clients = new Map<number, PublicClient>();

/** Server-only. Throws for any chain id this reward system doesn't have RPC config for — callers should treat that as a SYSTEM_ERROR / misconfiguration, not silently fall back to the wrong chain. */
export function getRewardChainClient(chainId: number): PublicClient {
  const existing = clients.get(chainId);
  if (existing) return existing;

  const chain = CHAINS[chainId as keyof typeof CHAINS];
  const rpc = RPC_URLS[chainId];
  if (!chain || !rpc) {
    throw new Error(`No RPC configuration for chain id ${chainId}`);
  }

  const primary = http(rpc.primary, { timeout: 8_000, retryCount: 1 });
  const backups = rpc.fallbacks.map((url) => http(url, { timeout: 8_000, retryCount: 1 }));

  const client = createPublicClient({
    chain,
    transport: backups.length > 0 ? fallback([primary, ...backups]) : primary,
  });
  clients.set(chainId, client);
  return client;
}
