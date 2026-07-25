import type { CoinMarket } from "@/lib/types";
import { clamp, getSectorForSymbol, SECTOR_LIST, type Sector, type TrendTone } from "./shared";

export interface SectorRotationRow {
  sector: Sector;
  trendLabel: string;
  trendTone: TrendTone;
  momentum: number; // 0-100
  volume24hUsd: number;
  coinCount: number;
  sample?: boolean;
}

/**
 * Aggregates the six tracked sectors from a live CoinGecko markets list using
 * the seed tags in `shared.ts`. Momentum is a bounded, transparent read of
 * average 24h change (not a prediction) — the same "show your work" spirit
 * as lib/scanner-categories.ts.
 */
export function computeSectorRotation(markets: CoinMarket[]): SectorRotationRow[] {
  const bySector = new Map<Sector, CoinMarket[]>();
  for (const sector of SECTOR_LIST) bySector.set(sector, []);

  for (const m of markets) {
    const sector = getSectorForSymbol(m.symbol);
    if (!sector) continue;
    bySector.get(sector)!.push(m);
  }

  return SECTOR_LIST.map((sector) => {
    const coins = bySector.get(sector) ?? [];
    if (!coins.length) {
      return { sector, trendLabel: "—", trendTone: "neutral" as TrendTone, momentum: 0, volume24hUsd: 0, coinCount: 0 };
    }
    const avgChange24h = coins.reduce((s, c) => s + (c.price_change_percentage_24h_in_currency ?? 0), 0) / coins.length;
    const avgChange7d = coins.reduce((s, c) => s + (c.price_change_percentage_7d_in_currency ?? 0), 0) / coins.length;
    const volume24hUsd = coins.reduce((s, c) => s + (c.total_volume ?? 0), 0);
    const momentum = clamp(50 + avgChange24h * 3.5);
    const trendTone: TrendTone = avgChange7d > 3 ? "up" : avgChange7d < -3 ? "down" : "neutral";
    const trendLabel = trendTone === "up" ? "Uptrend" : trendTone === "down" ? "Downtrend" : "Sideways";

    return { sector, trendLabel, trendTone, momentum, volume24hUsd, coinCount: coins.length };
  });
}

/** Illustrative fallback so the panel always renders something meaningful before live data is wired. */
export function getSampleSectorRotation(): SectorRotationRow[] {
  return [
    { sector: "AI", trendLabel: "Uptrend", trendTone: "up", momentum: 74, volume24hUsd: 1_240_000_000, coinCount: 8, sample: true },
    { sector: "RWA", trendLabel: "Uptrend", trendTone: "up", momentum: 66, volume24hUsd: 410_000_000, coinCount: 6, sample: true },
    { sector: "Layer 1", trendLabel: "Sideways", trendTone: "neutral", momentum: 54, volume24hUsd: 3_820_000_000, coinCount: 10, sample: true },
    { sector: "DeFi", trendLabel: "Sideways", trendTone: "neutral", momentum: 49, volume24hUsd: 980_000_000, coinCount: 9, sample: true },
    { sector: "Layer 2", trendLabel: "Downtrend", trendTone: "down", momentum: 38, volume24hUsd: 720_000_000, coinCount: 8, sample: true },
    { sector: "Gaming", trendLabel: "Downtrend", trendTone: "down", momentum: 33, volume24hUsd: 305_000_000, coinCount: 9, sample: true },
  ];
}
