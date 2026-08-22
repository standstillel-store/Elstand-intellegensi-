import { getTopMarkets, getGlobal } from "./coingecko";
import { getTrendingPools, getNewPools } from "./geckoterminal";
import { getFundingSnapshot } from "./binance";
import { getWhaleTransfers } from "./alchemy";
import { getFearGreed } from "./alternativeme";
import { getNews } from "./newsapi";
import { getEconomicCalendar } from "./economiccalendar";
import { buildPumpCandidates, buildRugpullRisks } from "./scoring";
import { logged } from "./cache";
import type {
  CoinMarket,
  DexPool,
  FundingInfo,
  WhaleTransfer,
  NewsItem,
  FearGreedPoint,
  PumpCandidate,
  RugpullRisk,
  EconomicEvent,
} from "./types";

export interface NoctrunSnapshot {
  markets: CoinMarket[];
  global?: {
    total_market_cap: { usd: number };
    market_cap_percentage: { btc: number };
    market_cap_change_percentage_24h_usd: number;
  };
  pools: DexPool[];
  funding: FundingInfo[];
  whales: WhaleTransfer[];
  news: NewsItem[];
  fng?: { now: FearGreedPoint; yesterday?: FearGreedPoint };
  calendar: EconomicEvent[];
  pumpCandidates: PumpCandidate[];
  rugpullRisks: RugpullRisk[];
}

/**
 * Pulls every free data source in parallel, then runs it through the
 * rule-based scoring engine. This is the single source of truth for both
 * the dashboard render and the AI chat dock — no paid LLM call involved.
 */
export async function getSnapshot(): Promise<NoctrunSnapshot> {
  const [markets, global, trending, fresh, funding, fng, news, calendar] = await Promise.all([
    logged("markets (CoinGecko)", getTopMarkets(150), []),
    logged("global (CoinGecko)", getGlobal(), undefined),
    logged("trendingPools", getTrendingPools(), []),
    logged("newPools", getNewPools(), []),
    logged("funding (Binance)", getFundingSnapshot(), []),
    logged("fearGreed", getFearGreed(), undefined),
    logged("news", getNews(), []),
    logged("economicCalendar", getEconomicCalendar(), []),
  ]);

  const priceBySymbol: Record<string, number> = {};
  for (const m of markets) priceBySymbol[m.symbol.toLowerCase()] = m.current_price;
  const whales = await logged("whales (Alchemy)", getWhaleTransfers(priceBySymbol), []);

  const pools = [...trending, ...fresh];
  const pumpCandidates = buildPumpCandidates(markets, pools, funding, whales);

  const negativeTitles = news.filter((n) => n.sentiment === "negative" || /rug|scam|exploit|hack/i.test(n.title));
  const newsFlagWords = new Set<string>();
  for (const n of negativeTitles) {
    for (const w of n.title.toLowerCase().match(/[a-z0-9]+/g) ?? []) newsFlagWords.add(w);
  }
  const rugpullRisks = buildRugpullRisks(pools, whales, newsFlagWords);

  return { markets, global, pools, funding, whales, news, fng, calendar, pumpCandidates, rugpullRisks };
}
