import type { CoinMarket } from "@/lib/types";
import type { SmartMoneyEntry } from "@/lib/scanner-categories";
import { isRelevantAsset } from "@/lib/asset-filters";
import { clamp, deriveTrend, getSectorForSymbol, type DisplayTone, type Sector, type TrendTone } from "./shared";

export type LiquidityLevel = "High" | "Medium" | "Low";

export interface AltcoinScannerRow {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  price: number;
  sector: Sector;
  trendLabel: string;
  trendTone: TrendTone;
  volume24hUsd: number;
  momentum: number; // 0-100, rule-based read of 1h/24h acceleration
  liquidity: LiquidityLevel;
  liquidityTone: DisplayTone;
  aiScore: number; // 0-100 composite — explicitly a rule-based read, not a prediction
  smartMoneyFlag?: boolean;
  sample?: boolean;
}

function liquidityFromTurnover(turnover: number): { level: LiquidityLevel; tone: DisplayTone } {
  if (turnover > 0.15) return { level: "High", tone: "up" };
  if (turnover > 0.05) return { level: "Medium", tone: "amber" };
  return { level: "Low", tone: "down" };
}

/**
 * Builds the Altcoin Scanner table from the same live markets list the rest
 * of the dashboard already fetches (CoinGecko), plus the sector seed tags in
 * shared.ts. Excludes BTC and stable/wrapped assets — this table is
 * specifically the "altcoin" cut. Coins with no sector tag yet are left out
 * so the Sector column is always meaningful; expand SECTOR_SEED_TAGS to
 * widen coverage.
 */
export function buildAltcoinScannerRows(
  markets: CoinMarket[],
  smartMoney?: SmartMoneyEntry[],
  limit = 20
): AltcoinScannerRow[] {
  const smartMoneySet = new Set((smartMoney ?? []).map((s) => s.symbol.toUpperCase()));

  const rows = markets
    .filter((m) => isRelevantAsset(m))
    .filter((m) => m.symbol.toUpperCase() !== "BTC")
    .map((m) => {
      const sector = getSectorForSymbol(m.symbol);
      if (!sector) return undefined;

      const change1h = m.price_change_percentage_1h_in_currency ?? 0;
      const change24h = m.price_change_percentage_24h_in_currency ?? 0;
      const change7d = m.price_change_percentage_7d_in_currency ?? 0;
      const trend = deriveTrend(change24h, change7d);
      const turnover = m.market_cap ? m.total_volume / m.market_cap : 0;
      const { level: liquidity, tone: liquidityTone } = liquidityFromTurnover(turnover);
      const momentum = clamp(50 + change1h * 4 + change24h * 1.2);
      const hasSmartMoney = smartMoneySet.has(m.symbol.toUpperCase());

      const aiScore = clamp(momentum * 0.6 + (liquidity === "High" ? 25 : liquidity === "Medium" ? 14 : 4) + (hasSmartMoney ? 10 : 0));

      const row: AltcoinScannerRow = {
        id: m.id,
        symbol: m.symbol.toUpperCase(),
        name: m.name,
        image: m.image,
        price: m.current_price,
        sector,
        trendLabel: trend.label,
        trendTone: trend.tone,
        volume24hUsd: m.total_volume,
        momentum,
        liquidity,
        liquidityTone,
        aiScore,
        smartMoneyFlag: hasSmartMoney,
      };
      return row;
    })
    .filter((r): r is AltcoinScannerRow => Boolean(r))
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, limit);

  return rows;
}

export function getSampleAltcoinScannerRows(): AltcoinScannerRow[] {
  const sample: Array<[string, string, Sector, number, TrendTone, number, LiquidityLevel, DisplayTone, number]> = [
    ["ETH", "Ethereum", "Layer 1", 3542.18, "up", 82, "High", "up", 78],
    ["SOL", "Solana", "Layer 1", 178.42, "up", 76, "High", "up", 74],
    ["FET", "Fetch.ai", "AI", 1.84, "up", 71, "Medium", "amber", 69],
    ["ONDO", "Ondo Finance", "RWA", 1.12, "up", 68, "Medium", "amber", 65],
    ["ARB", "Arbitrum", "Layer 2", 0.82, "neutral", 55, "Medium", "amber", 52],
    ["UNI", "Uniswap", "DeFi", 9.64, "neutral", 51, "Medium", "amber", 49],
    ["AAVE", "Aave", "DeFi", 148.3, "down", 41, "Medium", "amber", 40],
    ["SAND", "The Sandbox", "Gaming", 0.34, "down", 33, "Low", "down", 29],
  ];
  return sample.map(([symbol, name, sector, price, trendTone, momentum, liquidity, liquidityTone, aiScore]) => ({
    id: symbol.toLowerCase(),
    symbol,
    name,
    price,
    sector,
    trendLabel: trendTone === "up" ? "Bullish" : trendTone === "down" ? "Bearish" : "Netral",
    trendTone,
    volume24hUsd: 40_000_000 + momentum * 3_000_000,
    momentum,
    liquidity,
    liquidityTone,
    aiScore,
    smartMoneyFlag: aiScore > 70,
    sample: true,
  }));
}
