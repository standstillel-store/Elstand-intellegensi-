import { cached } from "./cache";

// ---------------------------------------------------------------------------
// Total stablecoin market cap — a widely-used liquidity/"dry powder" proxy
// for the Market Overview strip. Backed by DefiLlama's public stablecoins
// endpoint, which needs no API key. Same "degrade gracefully" rule as every
// other source here (lib/alchemy.ts, lib/newsapi.ts): if the shape ever
// changes upstream or the request fails, callers get `undefined` and the
// card shows a placeholder instead of a wrong number.
// ---------------------------------------------------------------------------

export interface StablecoinReading {
  totalUsd: number;
  change24hUsd?: number;
  topSymbol?: string;
}

interface DefiLlamaStablecoin {
  symbol: string;
  circulating: { peggedUSD?: number };
  circulatingPrevDay?: { peggedUSD?: number };
}

export async function getStablecoinSupply(): Promise<StablecoinReading | undefined> {
  return cached("stables:supply", 15 * 60_000, async () => {
    try {
      const res = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=false", {
        next: { revalidate: 900 },
      });
      if (!res.ok) {
        console.error(`[defillama] stablecoins: HTTP ${res.status} ${res.statusText}`);
        return undefined;
      }
      const json = (await res.json()) as { peggedAssets?: DefiLlamaStablecoin[] };
      const assets = json.peggedAssets ?? [];
      if (!assets.length) {
        console.error("[defillama] stablecoins: empty peggedAssets — response shape may have changed");
        return undefined;
      }

      let total = 0;
      let prevTotal = 0;
      let top: { symbol: string; usd: number } | undefined;
      for (const a of assets) {
        const usd = a.circulating?.peggedUSD ?? 0;
        const prevUsd = a.circulatingPrevDay?.peggedUSD ?? usd;
        total += usd;
        prevTotal += prevUsd;
        if (!top || usd > top.usd) top = { symbol: a.symbol, usd };
      }
      if (!total) return undefined;

      return {
        totalUsd: total,
        change24hUsd: prevTotal ? total - prevTotal : undefined,
        topSymbol: top?.symbol,
      } satisfies StablecoinReading;
    } catch (err) {
      console.error(`[defillama] stablecoins: ${err instanceof Error ? err.message : err}`);
      return undefined;
    }
  });
}
