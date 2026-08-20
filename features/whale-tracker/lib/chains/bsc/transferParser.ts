import { parseAbiItem, formatUnits, type PublicClient, type Log } from "viem";
import { getBscClient } from "./client";

// ---------------------------------------------------------------------------
// BEP-20 uses the same standard `Transfer(address,address,uint256)` event as
// any ERC-20 — spec: "Untuk BEP-20, gunakan standard Transfer event." Native
// BNB has no event log at all, so it's parsed straight from block
// transactions (spec: "Untuk native BNB, proses native transaction value").
// ---------------------------------------------------------------------------

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export const ERC20_METADATA_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export interface RawErc20Transfer {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  tokenAddress: string;
  from: string;
  to: string;
  rawValue: bigint;
}

export interface RawNativeTransfer {
  txHash: string;
  blockNumber: bigint;
  from: string;
  to: string;
  rawValue: bigint; // wei
}

/** Fetches and decodes every BEP-20 Transfer log in [fromBlock, toBlock] inclusive. Amounts are still raw (undecoded by `decimals`) — decoding happens once metadata is resolved, since decimals differ per token. */
export async function fetchErc20TransferLogs(fromBlock: bigint, toBlock: bigint): Promise<RawErc20Transfer[]> {
  const client = getBscClient();
  const logs: Log[] = await client.getLogs({ event: TRANSFER_EVENT, fromBlock, toBlock });
  const out: RawErc20Transfer[] = [];
  for (const log of logs) {
    // viem returns decoded `args` when the log matches the event ABI passed to getLogs.
    const args = (log as unknown as { args?: { from?: string; to?: string; value?: bigint } }).args;
    if (!args?.from || !args?.to || args.value == null) continue;
    out.push({
      txHash: log.transactionHash!,
      logIndex: log.logIndex ?? 0,
      blockNumber: log.blockNumber!,
      tokenAddress: log.address.toLowerCase(),
      from: args.from.toLowerCase(),
      to: args.to.toLowerCase(),
      rawValue: args.value,
    });
  }
  return out;
}

/** Fetches every block in [fromBlock, toBlock] with full transaction bodies and returns the ones moving native BNB (value > 0). Simple contract calls that also move value are included — spec only asks for "native transaction value", not a distinction between plain sends and payable calls. */
export async function fetchNativeTransfers(fromBlock: bigint, toBlock: bigint): Promise<{ transfers: RawNativeTransfer[]; blockTimestamps: Map<string, bigint> }> {
  const client = getBscClient();
  const transfers: RawNativeTransfer[] = [];
  const blockTimestamps = new Map<string, bigint>();

  const blockNumbers: bigint[] = [];
  for (let b = fromBlock; b <= toBlock; b++) blockNumbers.push(b);

  // Sequential (not Promise.all over the whole range) — a 500-block batch of
  // full-transaction blocks is already a meaningful RPC load; sequential
  // keeps a single indexer run from firing hundreds of concurrent requests
  // at a public/rate-limited RPC endpoint.
  for (const bn of blockNumbers) {
    const block = await client.getBlock({ blockNumber: bn, includeTransactions: true });
    blockTimestamps.set(bn.toString(), block.timestamp);
    for (const tx of block.transactions) {
      if (typeof tx === "string") continue; // shouldn't happen with includeTransactions: true, but keep the type guard
      if (tx.value > BigInt(0) && tx.to) {
        transfers.push({ txHash: tx.hash, blockNumber: bn, from: tx.from.toLowerCase(), to: tx.to.toLowerCase(), rawValue: tx.value });
      }
    }
  }
  return { transfers, blockTimestamps };
}

/** Resolves symbol/name/decimals for a token contract directly from chain. Called once per unseen token — see tokenMetadataStore.ts for the cache that prevents this from running twice for the same address. */
export async function readErc20Metadata(client: PublicClient, tokenAddress: string): Promise<{ symbol: string | null; name: string | null; decimals: number | null }> {
  const address = tokenAddress as `0x${string}`;
  const [decimalsRes, symbolRes, nameRes] = await Promise.allSettled([
    client.readContract({ address, abi: ERC20_METADATA_ABI, functionName: "decimals" }),
    client.readContract({ address, abi: ERC20_METADATA_ABI, functionName: "symbol" }),
    client.readContract({ address, abi: ERC20_METADATA_ABI, functionName: "name" }),
  ]);
  return {
    decimals: decimalsRes.status === "fulfilled" ? Number(decimalsRes.value) : null,
    symbol: symbolRes.status === "fulfilled" ? String(symbolRes.value) : null,
    name: nameRes.status === "fulfilled" ? String(nameRes.value) : null,
  };
}

/** Decodes a raw integer amount using the token's decimals. Falls back to 18 (the BEP-20/EVM norm) only for display purposes when decimals genuinely couldn't be resolved — the row still gets persisted (spec: "tetap simpan token transfer" even without full metadata). */
export function decodeAmount(rawValue: bigint, decimals: number | null): number {
  return Number(formatUnits(rawValue, decimals ?? 18));
}
