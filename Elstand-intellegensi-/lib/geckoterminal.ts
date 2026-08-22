import { cached } from "./cache";
import type { DexPool } from "./types";

const BASE = "https://api.geckoterminal.com/api/v2";
// Keep this list short - each network is a separate request. Add chains
// that matter to you (e.g. "polygon", "avalanche", "blast").
const NETWORKS = ["eth", "bsc", "solana", "base", "arbitrum"];

interface GtPoolAttrs {
  name: string;
  base_token_price_usd: string;
  volume_usd: { h24: string };
  reserve_in_usd: string;
  fdv_usd?: string;
  pool_created_at?: string;
  price_change_percentage?: { h24: string };
}
interface GtPool {
  id: string;
  attributes: GtPoolAttrs;
}

function mapPool(network: string, p: GtPool): DexPool {
  const a = p.attributes;
  return {
    id: p.id,
    network,
    name: a.name,
    baseSymbol: (a.name?.split("/")[0] ?? a.name)?.trim(),
    priceUsd: parseFloat(a.base_token_price_usd || "0"),
    volume24hUsd: parseFloat(a.volume_usd?.h24 || "0"),
    liquidityUsd: parseFloat(a.reserve_in_usd || "0"),
    fdvUsd: a.fdv_usd ? parseFloat(a.fdv_usd) : undefined,
    poolCreatedAt: a.pool_created_at,
    priceChange24h: a.price_change_percentage?.h24 ? parseFloat(a.price_change_percentage.h24) : undefined,
  };
}

async function fetchPools(path: string, network: string): Promise<DexPool[]> {
  try {
    const res = await fetch(`${BASE}/networks/${network}/${path}`, {
      headers: { Accept: "application/json;version=20230302" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const data = (json.data ?? []) as GtPool[];
    return data.map((p) => mapPool(network, p));
  } catch {
    return [];
  }
}

export async function getTrendingPools(): Promise<DexPool[]> {
  return cached("gt:trending", 60_000, async () => {
    const results = await Promise.all(NETWORKS.map((n) => fetchPools("trending_pools", n)));
    return results.flat();
  });
}

export async function getNewPools(): Promise<DexPool[]> {
  return cached("gt:new", 60_000, async () => {
    const results = await Promise.all(NETWORKS.map((n) => fetchPools("new_pools", n)));
    return results.flat();
  });
}
