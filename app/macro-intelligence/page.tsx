import { MacroIntelligence, type WatchlistAsset } from "@/components/dashboard/MacroIntelligence";
import { getNews } from "@/lib/newsapi";
import { getEconomicCalendar } from "@/lib/economiccalendar";
import { getMacroEventsView, getNextHighImpactEvent } from "@/lib/intelligence/macroEvents";
import { getUsdReading } from "@/lib/intelligence/sources/usd";
import { getGoldReading } from "@/lib/intelligence/sources/gold";
import { getTopMarkets } from "@/lib/coingecko";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";
import { DollarSign, Gem } from "lucide-react";

export const metadata = {
  title: "Macro Intelligence | ELSTAND INTELLIGENCE",
};

// ---------------------------------------------------------------------------
// Macro Intelligence — merges the old standalone /news and
// /economic-calendar pages into one connected intelligence layer:
// EVENT -> NEWS -> SENTIMENT -> MARKET IMPACT -> WATCHLIST -> INSIGHT.
//
// Deliberately does NOT use the shared AppShell — this page has its own
// bespoke header (see MacroIntelligenceHeader), matching the reference
// design 1:1 instead of stacking a second header under AppShell's.
// Both /news and /economic-calendar stay untouched as standalone routes
// (linked as "View All" targets from the panels below).
// ---------------------------------------------------------------------------

export default async function MacroIntelligencePage() {
  const [news, calendar, markets, usd, gold] = await Promise.all([
    getNews().catch(() => []),
    getEconomicCalendar().catch(() => []),
    getTopMarkets(10).catch(() => []),
    getUsdReading().catch(() => undefined),
    getGoldReading().catch(() => undefined),
  ]);

  const macroEvents = getMacroEventsView(calendar, 8);
  const nextHighImpact = getNextHighImpactEvent(calendar);

  const btc = markets.find((m) => m.id === "bitcoin");
  const eth = markets.find((m) => m.id === "ethereum");

  const watchlist: WatchlistAsset[] = [];
  if (btc)
    watchlist.push({
      symbol: "BTCUSDT",
      name: "Bitcoin",
      price: btc.current_price,
      changePct: btc.price_change_percentage_24h_in_currency,
      series: btc.sparkline_in_7d?.price,
      icon: btc.image,
    });
  if (eth)
    watchlist.push({
      symbol: "ETHUSDT",
      name: "Ethereum",
      price: eth.current_price,
      changePct: eth.price_change_percentage_24h_in_currency,
      series: eth.sparkline_in_7d?.price,
      icon: eth.image,
    });
  if (usd)
    watchlist.push({
      symbol: "DXY",
      name: "U.S. Dollar Index",
      price: usd.value,
      changePct: usd.changePct,
      series: usd.series,
      fallbackIcon: DollarSign,
      fallbackBg: "bg-up/15 text-up",
    });
  if (gold)
    watchlist.push({
      symbol: "XAUUSD",
      name: "Gold",
      price: gold.value,
      changePct: gold.changePct,
      series: gold.series,
      fallbackIcon: Gem,
      fallbackBg: "bg-gold/15 text-gold",
    });

  // Lightweight sentiment read from the news feed itself — same pos/neg
  // count the old /news page already showed, reused here as "Macro
  // Sentiment" + the synthesis behind "Macro Insight". No fabricated
  // market-wide sentiment.
  const positive = news.filter((n) => n.sentiment === "positive");
  const negative = news.filter((n) => n.sentiment === "negative");
  const status: GlobalSentimentReading["status"] =
    positive.length > negative.length + 1 ? "risk-on" : negative.length > positive.length + 1 ? "risk-off" : "neutral";
  const topHeadline = (negative[0] ?? positive[0] ?? news[0])?.title;

  const sentiment: GlobalSentimentReading = {
    status,
    confidence: news.length ? Math.round((Math.abs(positive.length - negative.length) / news.length) * 100) : 0,
    signalsAvailable: news.length,
    reasons: [...negative, ...positive].slice(0, 6).map((n) => ({
      text: n.title,
      direction: n.sentiment === "positive" ? 1 : -1,
      node: "macro" as const,
    })),
    note: topHeadline ? `${topHeadline} tetap jadi katalis makro dominan untuk sesi trading berikutnya.` : undefined,
  };

  // Top Asset Focus — the currency behind the next high-impact event plus
  // whichever watchlist assets are actually resolving right now. Real
  // inputs only, no fixed/fabricated list.
  const topAssetFocus = Array.from(
    new Set(
      [
        calendar.find((e) => e.impact === "high")?.country,
        btc ? "BTC" : undefined,
        gold ? "GOLD" : undefined,
      ].filter((v): v is string => Boolean(v)),
    ),
  ).slice(0, 3);

  return (
    <MacroIntelligence
      macroEvents={macroEvents}
      calendar={calendar}
      newsItems={news}
      sentiment={sentiment}
      nextHighImpact={nextHighImpact}
      watchlist={watchlist}
      topAssetFocus={topAssetFocus}
    />
  );
}
