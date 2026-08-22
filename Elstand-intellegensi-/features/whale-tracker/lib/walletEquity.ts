import { formatUnits } from "viem";
import { getDataSupabase } from "@/lib/supabaseData";
import { getBscClient } from "./chains/bsc/client";
import { NATIVE_TOKEN_ADDRESS, WHALE_CHAIN } from "./config";
import { getTokenMetadataBatch } from "./tokenMetadataStore";
import { getPricesForTokens } from "./priceSource";
import { getWallet, upsertWalletBalances, setWalletEquity, getWalletBalances } from "./walletStore";
import { getRecentTransfersForAddress } from "./transfersStore";
import type { WalletDetail, WalletHolding, WalletCounterparty, WhaleChain } from "../types";

const ERC20_BALANCE_ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

/**
 * V1 scope note: equity is computed over the tokens this wallet has been
 * seen moving in a whale-sized transfer (whale_wallet_seen_tokens SQL fn),
 * not a full token-discovery scan of the chain — that would need a paid
 * indexing API (Moralis/Covalent/etc.) this project doesn't currently
 * integrate. Balances themselves are always LIVE on-chain reads
 * (eth_getBalance / balanceOf), never derived from "last transaction seen"
 * — satisfies the spec's actual requirement ("Gunakan wallet balance/state
 * yang tersedia", "Jangan menghitung equity hanya dari transaksi
 * terakhir"), just bounded to a discoverable token set. Documented in
 * README under "Known limitations".
 */
export async function refreshWalletEquity(address: string, chain: WhaleChain = WHALE_CHAIN): Promise<number | null> {
  const supabase = getDataSupabase();
  const addr = address.toLowerCase();
  const client = getBscClient();

  let tokenAddresses: string[] = [NATIVE_TOKEN_ADDRESS];
  if (supabase) {
    try {
      const { data } = await supabase.rpc("whale_wallet_seen_tokens", { p_chain: chain, p_address: addr });
      if (data) tokenAddresses = Array.from(new Set([NATIVE_TOKEN_ADDRESS, ...data.map((r: { token_address: string }) => r.token_address)]));
    } catch (err) {
      console.error("[Whale] whale_wallet_seen_tokens:", err instanceof Error ? err.message : err);
    }
  }

  const erc20Addresses = tokenAddresses.filter((a) => a !== NATIVE_TOKEN_ADDRESS);
  const [metadataMap, prices, nativeBalance] = await Promise.all([
    getTokenMetadataBatch(erc20Addresses, chain),
    getPricesForTokens(tokenAddresses),
    client.getBalance({ address: addr as `0x${string}` }).catch(() => null),
  ]);

  const holdings: WalletHolding[] = [];

  if (nativeBalance != null) {
    const amount = Number(formatUnits(nativeBalance, 18));
    const priceUsd = prices.get(NATIVE_TOKEN_ADDRESS) ?? null;
    holdings.push({ tokenAddress: NATIVE_TOKEN_ADDRESS, tokenSymbol: "BNB", balance: amount, priceUsd, valueUsd: priceUsd == null ? null : amount * priceUsd });
  }

  // Sequential balanceOf reads, bounded by the (usually small) seen-token
  // set for one wallet — not a hot path, no need for multicall complexity
  // in V1.
  for (const tokenAddress of erc20Addresses) {
    try {
      const raw = await client.readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [addr as `0x${string}`] });
      const meta = metadataMap.get(tokenAddress);
      const amount = Number(formatUnits(raw, meta?.decimals ?? 18));
      if (amount === 0) continue; // skip zero balances — not "held", just previously transacted
      const priceUsd = prices.get(tokenAddress) ?? meta?.priceUsd ?? null;
      holdings.push({ tokenAddress, tokenSymbol: meta?.symbol ?? null, balance: amount, priceUsd, valueUsd: priceUsd == null ? null : amount * priceUsd });
    } catch (err) {
      console.error(`[Whale] balanceOf(${tokenAddress}) failed:`, err instanceof Error ? err.message : err);
    }
  }

  await upsertWalletBalances(addr, holdings, chain);

  const known = holdings.filter((h) => h.valueUsd != null);
  const equityUsd = known.length ? known.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0) : null;
  if (equityUsd != null) await setWalletEquity(addr, equityUsd, chain);
  return equityUsd;
}

/** Full Wallet Intelligence payload for the wallet-detail panel. Reads cached data (balances, flow, counterparties) — does NOT trigger a live on-chain refresh; call refreshWalletEquity() separately (e.g. from the indexer, or a manual "Refresh" action) to keep that expensive path off the hot read. */
export async function getWalletDetail(address: string, chain: WhaleChain = WHALE_CHAIN): Promise<WalletDetail> {
  const addr = address.toLowerCase();
  const supabase = getDataSupabase();

  const [wallet, holdings, recentTransfers, flow, counterpartiesRes] = await Promise.all([
    getWallet(addr, chain),
    getWalletBalances(addr, chain),
    getRecentTransfersForAddress(addr, 25, chain),
    supabase ? supabase.rpc("whale_wallet_flow", { p_chain: chain, p_address: addr }) : Promise.resolve({ data: null }),
    supabase ? supabase.rpc("whale_wallet_counterparties", { p_chain: chain, p_address: addr, p_limit: 10 }) : Promise.resolve({ data: null }),
  ]);

  const flowRow = (flow as { data: Array<{ inflow_usd: number; outflow_usd: number }> } | null)?.data?.[0];
  const inflowUsd = flowRow ? Number(flowRow.inflow_usd) : 0;
  const outflowUsd = flowRow ? Number(flowRow.outflow_usd) : 0;

  const counterparties: WalletCounterparty[] =
    ((counterpartiesRes as { data: Array<{ address: string; volume_usd: number; tx_count: number }> } | null)?.data ?? []).map((r) => ({
      address: r.address,
      volumeUsd: Number(r.volume_usd),
      txCount: Number(r.tx_count),
    })) ?? [];

  return {
    address: addr,
    chain,
    label: wallet?.label ?? null,
    category: wallet?.category ?? null,
    equityUsd: wallet?.equityUsd ?? null,
    inflowUsd,
    outflowUsd,
    netFlowUsd: inflowUsd - outflowUsd,
    holdings,
    topCounterparties: counterparties,
    recentTransfers,
  };
}
