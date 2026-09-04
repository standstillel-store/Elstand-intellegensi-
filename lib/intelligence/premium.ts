import { logged } from "@/lib/cache";
import { getTopMarkets, getGlobal } from "@/lib/coingecko";
import { getFearGreed } from "@/lib/alternativeme";
import { getEconomicCalendar } from "@/lib/economiccalendar";
import { getTrendingPools, getNewPools } from "@/lib/geckoterminal";
import { getFundingSnapshot } from "@/lib/binance";
import { getWhaleTransfers } from "@/lib/alchemy";
import { getNews } from "@/lib/newsapi";
import { buildPumpCandidates, buildRugpullRisks } from "@/lib/scoring";
import type { PumpCandidate, RugpullRisk, NewsItem } from "@/lib/types";
import { getUsdReading, type MarketSeriesReading } from "./sources/usd";
import { getStocksReading, type StockQuote } from "./sources/stocks";
import { getUs10Y, getFedFundsRate, getUsNationalDebt, type Us10yReading, type FedFundsReading, type UsDebtReading } from "@/lib/macro";
import { getMacroEventsView, getNextHighImpactEvent } from "./macroEvents";
import { deriveGlobalSentiment, type GlobalSentimentReading } from "./globalSentiment";
import { composeMacroContext } from "@/lib/ai/macroIntelligence/composeMacroContext";
import type { MacroIntelligenceContext } from "@/lib/ai/macroIntelligence/contracts";

// ---------------------------------------------------------------------------
// ELSTAND PREMIUM — single entry point for the whole dashboard (mirrors
// getDashboardSnapshot() for /dashboard). Every field is wrapped in a
// Reading<T> so the UI always knows whether a number is REAL, a documented
// PROXY, or genuinely UNAVAILABLE — never a value invented to fill a gap.
// Nothing here duplicates a source: DXY/Stocks/News/pump-scoring/rugpull-
// scoring all reuse the exact same lib functions the rest of the app
// already calls (see lib/macro.ts, lib/intelligence/sources/*, lib/scoring.ts).
// ---------------------------------------------------------------------------

export type DataState = "real" | "proxy" | "unavailable";

export interface Reading<T> {
  state: DataState;
  data?: T;
  /** Only set for "proxy" (why it's a proxy) — optional context for "real". */
  note?: string;
}

function real<T>(data: T | undefined, note?: string): Reading<T> {
  return data === undefined ? { state: "unavailable" } : { state: "real", data, note };
}
function proxy<T>(data: T | undefined, note: string): Reading<T> {
  return data === undefined ? { state: "unavailable" } : { state: "proxy", data, note };
}

export interface FomcEvent {
  date: string; // ISO
  source: "calendar" | "schedule";
  title: string;
  forecast?: string;
  previous?: string;
}

// Published Federal Reserve 2026 FOMC statement-day schedule — a real,
// publicly-announced date (federalreserve.gov/monetarypolicy/fomccalendars.htm),
// not a market prediction. This is ONLY a fallback for when the live
// economic-calendar feed (lib/economiccalendar.ts, "this week" window only)
// doesn't yet have the meeting in view — the rate data shown alongside it
// (getFedFundsRate) is always fetched live either way. Tentative meetings
// are not finalized until the preceding meeting per the Fed's own site;
// verify against federalreserve.gov if this file isn't updated for a new year.
const FOMC_2026_SCHEDULE = [
  "2026-01-28T19:00:00Z",
  "2026-03-18T18:00:00Z",
  "2026-04-29T18:00:00Z",
  "2026-06-17T18:00:00Z",
  "2026-07-29T18:00:00Z",
  "2026-09-16T18:00:00Z",
  "2026-10-28T18:00:00Z",
  "2026-12-09T19:00:00Z",
];

function getNextFomcFromSchedule(): FomcEvent | undefined {
  const now = Date.now();
  const next = FOMC_2026_SCHEDULE.map((d) => new Date(d))
    .filter((d) => d.getTime() > now)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!next) return undefined;
  return { date: next.toISOString(), source: "schedule", title: "FOMC Meeting" };
}

/** Deterministic score -> grade bucket for Altcoin Screener Pro's Accumulation mode. The score itself is buildPumpCandidates()'s real rule-based read; this only labels it. */
export function pumpGrade(score: number): { grade: string; label: string; tone: "up" | "amber" | "neutral" } {
  if (score >= 70) return { grade: "A+", label: "HIGH", tone: "up" };
  if (score >= 55) return { grade: "A", label: "MEDIUM", tone: "up" };
  if (score >= 40) return { grade: "B+", label: "EARLY", tone: "amber" };
  return { grade: "WATCH", label: "LOW", tone: "neutral" };
}

/** Deterministic score -> risk bucket for Altcoin Screener Pro's Dump/Rugpull mode. */
export function rugpullGrade(score: number): { label: string; tone: "down" | "amber" | "neutral" } {
  if (score >= 70) return { label: "CRITICAL", tone: "down" };
  if (score >= 50) return { label: "HIGH", tone: "down" };
  if (score >= 30) return { label: "ELEVATED", tone: "amber" };
  return { label: "WATCH", tone: "neutral" };
}

export interface PremiumIntelligenceSnapshot {
  asOf: string;
  usDebt: Reading<UsDebtReading>;
  dxy: Reading<MarketSeriesReading>;
  sp500: Reading<StockQuote>;
  nasdaq: Reading<StockQuote>;
  dowJones: Reading<StockQuote>;
  us10y: Reading<Us10yReading>;
  fedFunds: Reading<FedFundsReading>;
  cryptoGlobal: Reading<{ totalMarketCapUsd: number; btcDominance: number; changePct24h: number }>;
  btc: Reading<{ price: number; change24h?: number; change7d?: number; series?: number[] }>;
  eth: Reading<{ price: number; change24h?: number; change7d?: number; series?: number[] }>;
  fearGreed: Reading<{ value: number; classification: string }>;
  sentiment: GlobalSentimentReading;
  nextFomc?: FomcEvent;
  pumpCandidates: PumpCandidate[];
  pumpCandidatesState: DataState;
  rugpullRisks: RugpullRisk[];
  rugpullRisksState: DataState;
  news: NewsItem[];
  /** ADDITIVE (Phase G) — the same MacroIntelligenceContext produced by lib/ai/macroIntelligence/composeMacroContext.ts (reused, never recomputed here — this file is an integration consumer, not a calculation engine). "real" when the cluster/regime pipeline had usable economic data (dataCompleteness !== "UNAVAILABLE"), "proxy" when only the calendar-density fields (macroRegime/eventRisk) are populated (economic data not yet ingested — see lib/economicData/ingest.ts), "unavailable" only if composition failed outright. */
  macroIntelligence: Reading<MacroIntelligenceContext>;
  /** Footer strip — which upstream providers actually returned data this load, so a missing key shows up at a glance instead of a silently-empty card. */
  sources: { label: string; state: DataState }[];
}

function macroIntelligenceReading(ctx: MacroIntelligenceContext | undefined): Reading<MacroIntelligenceContext> {
  if (!ctx) return { state: "unavailable" };
  if (ctx.dataCompleteness && ctx.dataCompleteness !== "UNAVAILABLE") {
    return { state: "real", data: ctx };
  }
  return {
    state: "proxy",
    data: ctx,
    note: "Economic cluster/regime data not yet ingested — showing calendar-density signals only. See lib/economicData/ingest.ts.",
  };
}

export async function getPremiumIntelligenceSnapshot(): Promise<PremiumIntelligenceSnapshot> {
  const [dxy, stocks, us10y, fedFunds, usDebt, global, markets, fearGreed, calendar, news, trendingPools, newPools, funding] =
    await Promise.all([
      logged("premium:dxy", getUsdReading(), undefined),
      logged("premium:stocks", getStocksReading(), undefined),
      logged("premium:us10y", getUs10Y(), undefined),
      logged("premium:fedfunds", getFedFundsRate(), undefined),
      logged("premium:usdebt", getUsNationalDebt(), undefined),
      logged("premium:cgGlobal", getGlobal(), undefined),
      logged("premium:cgMarkets", getTopMarkets(150), [] as Awaited<ReturnType<typeof getTopMarkets>>),
      logged("premium:fearGreed", getFearGreed(), undefined),
      logged("premium:calendar", getEconomicCalendar(), []),
      logged("premium:news", getNews(), []),
      logged("premium:gtTrending", getTrendingPools(), []),
      logged("premium:gtNew", getNewPools(), []),
      logged("premium:funding", getFundingSnapshot(), []),
    ]);

  // ADDITIVE (Phase G) — depends on `calendar` above, so it runs after that
  // Promise.all rather than inside it; still isolated via logged() so a
  // macro-composition failure never affects any other field in this
  // snapshot (composeMacroContext() is itself designed to never throw —
  // this is the explicit belt-and-suspenders guarantee, same as
  // context.ts's try/catch around the same call).
  const macroIntelligenceCtx = await logged(
    "premium:macroIntelligence",
    composeMacroContext({ asOf: new Date().toISOString(), calendar }),
    undefined
  );

  const priceBySymbol: Record<string, number> = {};
  for (const m of markets) priceBySymbol[m.symbol.toLowerCase()] = m.current_price;
  const whales = await logged("premium:whales", getWhaleTransfers(priceBySymbol), []);

  const btcMarket = markets.find((m) => m.id === "bitcoin");
  const ethMarket = markets.find((m) => m.id === "ethereum");

  const sp500 = stocks?.indices.find((i) => i.ticker === "SPY");
  const nasdaq = stocks?.indices.find((i) => i.ticker === "QQQ");
  const dow = stocks?.indices.find((i) => i.ticker === "DIA");

  const macroEvents = getMacroEventsView(calendar, 20);
  const calendarFomc = macroEvents.find((e) => e.category === "FOMC" && e.status === "upcoming");
  const nextFomc: FomcEvent | undefined = calendarFomc
    ? {
        date: calendarFomc.date,
        source: "calendar",
        title: calendarFomc.title,
        forecast: calendarFomc.forecast,
        previous: calendarFomc.previous,
      }
    : getNextFomcFromSchedule();

  const stocksAvgChange =
    stocks && stocks.indices.length
      ? stocks.indices.reduce((sum, i) => sum + (i.changePct ?? 0), 0) / stocks.indices.length
      : undefined;

  const sentiment = deriveGlobalSentiment({
    fngValue: fearGreed?.now.value,
    mcChange24h: global?.market_cap_change_percentage_24h_usd,
    dxyChangePct: dxy?.changePct,
    stocksChangePct: stocksAvgChange,
    btcChange24h: btcMarket?.price_change_percentage_24h_in_currency,
    btcChange7d: btcMarket?.price_change_percentage_7d_in_currency,
    imminentHighImpactEvent: getNextHighImpactEvent(calendar),
  });

  const pools = [...trendingPools, ...newPools];
  const pumpCandidates = markets.length ? buildPumpCandidates(markets, pools, funding, whales) : [];

  let rugpullRisks: RugpullRisk[] = [];
  if (pools.length) {
    const negativeTitles = news.filter((n) => n.sentiment === "negative" || /rug|scam|exploit|hack/i.test(n.title));
    const flagWords = new Set<string>();
    for (const n of negativeTitles) for (const w of n.title.toLowerCase().match(/[a-z0-9]+/g) ?? []) flagWords.add(w);
    rugpullRisks = buildRugpullRisks(pools, whales, flagWords);
  }

  return {
    asOf: new Date().toISOString(),
    usDebt: real(usDebt),
    dxy: real(dxy),
    sp500: proxy(sp500, "S&P 500 tracked via the SPY ETF — true index tickers need a paid Finnhub add-on"),
    nasdaq: proxy(nasdaq, "Nasdaq tracked via the QQQ ETF — true index tickers need a paid Finnhub add-on"),
    dowJones: proxy(dow, "Dow Jones tracked via the DIA ETF — true index tickers need a paid Finnhub add-on"),
    us10y: real(us10y),
    fedFunds: real(fedFunds),
    cryptoGlobal: real(
      global
        ? {
            totalMarketCapUsd: global.total_market_cap.usd,
            btcDominance: global.market_cap_percentage.btc,
            changePct24h: global.market_cap_change_percentage_24h_usd,
          }
        : undefined
    ),
    btc: real(
      btcMarket
        ? {
            price: btcMarket.current_price,
            change24h: btcMarket.price_change_percentage_24h_in_currency,
            change7d: btcMarket.price_change_percentage_7d_in_currency,
            series: btcMarket.sparkline_in_7d?.price,
          }
        : undefined
    ),
    eth: real(
      ethMarket
        ? {
            price: ethMarket.current_price,
            change24h: ethMarket.price_change_percentage_24h_in_currency,
            change7d: ethMarket.price_change_percentage_7d_in_currency,
            series: ethMarket.sparkline_in_7d?.price,
          }
        : undefined
    ),
    fearGreed: real(fearGreed ? { value: fearGreed.now.value, classification: fearGreed.now.classification } : undefined),
    sentiment,
    nextFomc,
    pumpCandidates,
    pumpCandidatesState: markets.length ? "real" : "unavailable",
    rugpullRisks,
    rugpullRisksState: pools.length ? "real" : "unavailable",
    news,
    macroIntelligence: macroIntelligenceReading(macroIntelligenceCtx),
    sources: [
      { label: "CoinGecko", state: markets.length ? "real" : "unavailable" },
      { label: "FRED (10Y / Fed Funds)", state: us10y || fedFunds ? "real" : "unavailable" },
      { label: "US Treasury (Debt)", state: usDebt ? "real" : "unavailable" },
      { label: "DXY", state: dxy ? "real" : "unavailable" },
      { label: "Finnhub (Stocks)", state: stocks ? "proxy" : "unavailable" },
      { label: "GeckoTerminal (DEX)", state: pools.length ? "real" : "unavailable" },
      { label: "Binance Futures", state: funding.length ? "real" : "unavailable" },
      { label: "Alchemy (Whales)", state: whales.length ? "real" : "unavailable" },
      { label: "News", state: news.length ? "real" : "unavailable" },
      { label: "Fear & Greed", state: fearGreed ? "real" : "unavailable" },
      { label: "ELVOID Macro Intelligence", state: macroIntelligenceReading(macroIntelligenceCtx).state },
    ],
  };
}
