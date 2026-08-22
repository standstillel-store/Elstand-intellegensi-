import { cached } from "@/lib/cache";

// ---------------------------------------------------------------------------
// Brief Section 6 — "$10 is USD value, not: 10 ELS, 10 BNB, 10 wei ... Do
// NOT accept a frontend value ... Create a deterministic valuation
// mechanism ... store enough data to reproduce the verification decision
// ... If exact historical pricing is not currently available, implement the
// verifier architecture so the pricing provider can be plugged in cleanly
// and return a clear SYSTEM_ERROR rather than falsely approving a
// transaction."
//
// Before this file existed, lib/rewards/verifier.ts had NO USD conversion
// at all — both quests only compared a raw ELS-token-amount floor
// (`minimumElsAmountRaw`) that defaults to 0 (see config.ts), i.e. no
// minimum was actually enforced. This module is what verifier.ts now calls
// to turn "how much native currency moved" into an actual dollar figure.
//
// Deliberately prices the NATIVE currency leg (BNB), not the ELS leg:
// ELS is a brand-new, thin-liquidity token with no independent, reliable
// USD price feed anywhere in this codebase (lib/geckoterminal.ts only
// exposes trending/new pool LISTS, not a lookup by a specific pool/token,
// and a Uniswap V4 pool has no separate pair-contract address to look up by
// in the first place — it lives inside the singleton PoolManager). BNB, by
// contrast, already has a first-class feed this app trusts elsewhere
// (lib/binance.ts) — reusing that avoids inventing a second, weaker price
// source just for this feature. Both reward quests require chainId 56
// (brief Section 4 rule 2 / Section 5 rule 6) where BNB is the real,
// liquid native currency, so this is priced correctly for the flows this
// system actually verifies.
// ---------------------------------------------------------------------------

const FUTURES_BASE = "https://fapi.binance.com";

/** Which Binance Futures USDT-margined symbol prices a given chain's native currency. Only chains this reward system verifies (mainnet, real liquid market) get an entry — see the file header for why testnet chains are deliberately absent rather than priced at 1:1 with mainnet. */
const NATIVE_PRICE_SYMBOL: Record<number, string> = {
  56: "BNBUSDT", // BSC mainnet
};

const HISTORICAL_PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // a past 1-minute candle's close price never changes once it exists — safe to cache long

export interface HistoricalPriceResult {
  /** USD price of 1 native-currency unit at `priceTimestamp`. */
  price: number;
  /** Human-readable provenance, stored alongside the verification decision so it can be reproduced/audited later (brief Section 6). */
  source: string;
  /** Start of the matched 1-minute candle, ms since epoch. */
  priceTimestamp: number;
}

async function fetchHistoricalPrice(symbol: string, bucketMs: number): Promise<HistoricalPriceResult | undefined> {
  try {
    const url = `${FUTURES_BASE}/fapi/v1/klines?symbol=${symbol}&interval=1m&startTime=${bucketMs}&endTime=${bucketMs + 60_000}&limit=1`;
    const res = await fetch(url, { next: { revalidate: false } });
    if (!res.ok) return undefined;
    const raw = (await res.json()) as Array<[number, string, string, string, string, ...unknown[]]>;
    const candle = raw[0];
    if (!candle) return undefined;
    const closePrice = parseFloat(candle[4]);
    if (!Number.isFinite(closePrice) || closePrice <= 0) return undefined;
    return { price: closePrice, source: `binance_futures_klines:${symbol}:1m`, priceTimestamp: candle[0] };
  } catch (err) {
    console.error(`[rewards/pricing] fetchHistoricalPrice(${symbol}) failed:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

/**
 * Historical USD price of `chainId`'s native currency at `blockTimestampSec`
 * (the verified transaction's own block time — NOT "now", so verifying the
 * same old transaction later reproduces the same decision, per Section 6's
 * "do not silently use an arbitrary current price"). Returns null (never
 * throws) for an unsupported chain or on any fetch failure — callers must
 * treat null as SYSTEM_ERROR, never as "$0" or "skip the check".
 */
export async function getHistoricalNativeUsdPrice(chainId: number, blockTimestampSec: number): Promise<HistoricalPriceResult | null> {
  const symbol = NATIVE_PRICE_SYMBOL[chainId];
  if (!symbol) return null;

  const bucketMs = Math.floor((blockTimestampSec * 1000) / 60_000) * 60_000;
  const result = await cached(`reward-price:${symbol}:${bucketMs}`, HISTORICAL_PRICE_CACHE_TTL_MS, () => fetchHistoricalPrice(symbol, bucketMs));
  return result ?? null;
}

/** wei (18 decimals, true for BNB) -> USD, given a unit price. Kept as a plain float: this feeds a $10 threshold comparison, not a ledger balance, so wei-level precision doesn't matter and bigint division would truncate away exactly the sub-1-BNB fraction that decides a threshold this small. */
export function weiToUsd(weiAmount: bigint, priceUsd: number): number {
  return (Number(weiAmount) / 1e18) * priceUsd;
}
