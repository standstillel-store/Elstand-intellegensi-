import { cached } from "@/lib/cache";
import { TOKEN_PRICE_CACHE_MS, NATIVE_TOKEN_ADDRESS } from "./config";

// CoinGecko's free "token_price" endpoint resolves USD price by contract
// address for a given platform — exactly what's needed for generic BEP-20
// pricing (spec: "Jangan hardcode hanya USDT... token baru yang muncul di
// BSC"). No API key required for this endpoint at moderate volume, same
// no-key-required assumption lib/coingecko.ts already makes elsewhere in
// this codebase.
//
//   Token
//     ↓
//   Price Cache (this file, via lib/cache.ts `cached()`)
//     ↓
//   Current USD Price
//     ↓
//   Transfer Valuation
//
// Batches up to 50 addresses per request (CoinGecko's practical limit) and
// caches the whole batch result under one key per TOKEN_PRICE_CACHE_MS
// window, so a burst of transfers referencing the same handful of tokens
// triggers ONE outbound request, not one per transfer.

const PLATFORM = "binance-smart-chain";
const BATCH_SIZE = 50;
const FETCH_TIMEOUT_MS = 8_000;

/** Wraps fetch with an explicit timeout — native fetch() has no default one, so a slow/unresponsive CoinGecko would otherwise hang the whole indexer run indefinitely regardless of how fast the BSC RPC itself is (see AUDIT.md — identical hangs against multiple different RPC providers traced back to this). */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** priceUsd is null (never fabricated) for any address CoinGecko doesn't return a price for — spec: "Jika price tidak tersedia... jangan membuat USD value palsu". */
export async function getBscTokenPricesByAddress(tokenAddresses: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const unique = Array.from(new Set(tokenAddresses.map((a) => a.toLowerCase())));
  if (unique.length === 0) return out;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const key = `whale:bsc:price:${batch.join(",")}`;
    try {
      const result = await cached(key, TOKEN_PRICE_CACHE_MS, async () => {
        const url = `https://api.coingecko.com/api/v3/simple/token_price/${PLATFORM}?contract_addresses=${batch.join(",")}&vs_currencies=usd`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error(`CoinGecko token_price failed: ${res.status}`);
        return (await res.json()) as Record<string, { usd?: number }>;
      });
      for (const addr of batch) {
        const price = result[addr]?.usd;
        out.set(addr, typeof price === "number" ? price : null);
      }
    } catch (err) {
      console.error("[Whale] getBscTokenPricesByAddress:", err instanceof Error ? err.message : err);
      for (const addr of batch) out.set(addr, null);
    }
  }
  return out;
}

/** Native BNB price — separate endpoint (CoinGecko doesn't resolve the native coin as a "contract"). */
export async function getBnbPriceUsd(): Promise<number | null> {
  try {
    return await cached("whale:bsc:price:native", TOKEN_PRICE_CACHE_MS, async () => {
      const res = await fetchWithTimeout("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd");
      if (!res.ok) throw new Error(`CoinGecko price failed: ${res.status}`);
      const json = (await res.json()) as { binancecoin?: { usd?: number } };
      return json.binancecoin?.usd ?? null;
    });
  } catch (err) {
    console.error("[Whale] getBnbPriceUsd:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Convenience wrapper the indexer/valuation layer calls with a mixed batch
 * of token addresses that may include the `NATIVE_TOKEN_ADDRESS` sentinel.
 */
export async function getPricesForTokens(tokenAddresses: string[]): Promise<Map<string, number | null>> {
  const hasNative = tokenAddresses.includes(NATIVE_TOKEN_ADDRESS);
  const erc20 = tokenAddresses.filter((a) => a !== NATIVE_TOKEN_ADDRESS);
  const prices = await getBscTokenPricesByAddress(erc20);
  if (hasNative) prices.set(NATIVE_TOKEN_ADDRESS, await getBnbPriceUsd());
  return prices;
}
