import { cached } from "./cache";
import type { CoinMarket } from "./types";

const BASE = "https://api.coingecko.com/api/v3";

export async function getTopMarkets(limit = 150): Promise<CoinMarket[]> {
  return cached(`cg:markets:${limit}`, 60_000, async () => {
    const url = `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=true&price_change_percentage=1h,24h,7d`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`CoinGecko markets failed: ${res.status}`);
    return (await res.json()) as CoinMarket[];
  });
}

export async function getGlobal(): Promise<{
  total_market_cap: { usd: number };
  market_cap_percentage: { btc: number };
  market_cap_change_percentage_24h_usd: number;
}> {
  return cached("cg:global", 60_000, async () => {
    const res = await fetch(`${BASE}/global`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`CoinGecko global failed: ${res.status}`);
    const json = await res.json();
    return json.data;
  });
}
