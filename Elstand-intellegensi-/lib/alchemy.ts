import { cached } from "./cache";
import type { WhaleTransfer } from "./types";

// Starter watchlist of major ERC-20 contracts to monitor for large moves.
// Add any token you want ElVoid AI to watch on Ethereum mainnet here.
const WATCHLIST: Record<string, string> = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
  SHIB: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
  PEPE: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
};

const WHALE_USD_THRESHOLD = 250_000;

interface AssetTransferResult {
  hash: string;
  from: string;
  to: string;
  value: number | null;
  asset: string | null;
  metadata?: { blockTimestamp?: string };
}

async function rpc(apiKey: string, method: string, params: unknown[]) {
  const network = process.env.ALCHEMY_NETWORK || "eth-mainnet";
  const res = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
  });
  if (!res.ok) throw new Error(`Alchemy RPC failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/**
 * Fetches recent large ERC-20 transfers for the watchlist above.
 * `priceBySymbol` (lowercase symbol -> USD price) is passed in from the
 * caller, usually sourced from CoinGecko, so we don't need a second price
 * source just to value transfers in USD.
 */
export async function getWhaleTransfers(priceBySymbol: Record<string, number>): Promise<WhaleTransfer[]> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return [];

  return cached("alch:whales", 45_000, async () => {
    const out: WhaleTransfer[] = [];

    for (const [symbol, address] of Object.entries(WATCHLIST)) {
      try {
        const result = await rpc(apiKey, "alchemy_getAssetTransfers", [
          {
            fromBlock: "0x0",
            category: ["erc20"],
            contractAddresses: [address],
            order: "desc",
            maxCount: "0x14",
            excludeZeroValue: true,
          },
        ]);
        const transfers = (result?.transfers ?? []) as AssetTransferResult[];
        const price = priceBySymbol[symbol.toLowerCase()] ?? 0;

        for (const t of transfers) {
          const amount = t.value ?? 0;
          const valueUsd = amount * price;
          if (valueUsd < WHALE_USD_THRESHOLD) continue;
          out.push({
            hash: t.hash,
            asset: symbol,
            valueUsd,
            from: t.from,
            to: t.to,
            direction: "wallet-to-wallet",
            timestamp: t.metadata?.blockTimestamp ?? new Date().toISOString(),
          });
        }
      } catch (err) {
        // One token failing (rate limit, bad address, etc.) shouldn't take
        // down the whole feed — but it should show up in logs so a
        // persistent failure (bad key, wrong network) is diagnosable.
        console.error(`[alchemy] ${symbol}: ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }

    return out.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 25);
  });
}
