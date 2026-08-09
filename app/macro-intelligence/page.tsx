import { AppShell } from "@/components/AppShell";
import { MacroIntelligence, type MacroImpactRow, type WatchlistAsset } from "@/components/dashboard/MacroIntelligence";
import { getNews } from "@/lib/newsapi";
import { getEconomicCalendar } from "@/lib/economiccalendar";
import { getMacroEventsView, getNextHighImpactEvent } from "@/lib/intelligence/macroEvents";
import { getUsdReading } from "@/lib/intelligence/sources/usd";
import { getGoldReading } from "@/lib/intelligence/sources/gold";
import { getTopMarkets } from "@/lib/coingecko";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";

export const metadata = {
  title: "Macro Intelligence | ELSTAND INTELLIGENCE",
};

// ---------------------------------------------------------------------------
// Macro Intelligence — merges the old standalone /news and
// /economic-calendar pages into one connected intelligence layer:
// EVENT -> NEWS -> SENTIMENT -> MARKET IMPACT -> WATCHLIST -> INSIGHT.
//
// Both original pages (and their routes) stay untouched; this is a
// separate page that reuses their real data sources plus a lightweight
// watchlist read (BTC/ETH from CoinGecko, DXY/Gold from TwelveData) — no
// full dashboard snapshot fetch needed here.
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
      price: btc.current_price,
      changePct: btc.price_change_percentage_24h_in_currency,
      series: btc.sparkline_in_7d?.price,
    });
  if (eth)
    watchlist.push({
      symbol: "ETHUSDT",
      price: eth.current_price,
      changePct: eth.price_change_percentage_24h_in_currency,
      series: eth.sparkline_in_7d?.price,
    });
  if (usd) watchlist.push({ symbol: "DXY", price: usd.value, changePct: usd.changePct, series: usd.series });
  if (gold) watchlist.push({ symbol: "XAUUSD", price: gold.value, changePct: gold.changePct, series: gold.series });

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

  // No dashboard-level market snapshot on this page, so Market Impact is
  // intentionally left empty ("Waiting API" in the UI) rather than guessing
  // asset direction from news alone.
  const marketImpact: MacroImpactRow[] = [];

  return (
    <AppShell
      title="Macro Intelligence"
      subtitle="Macro Events + Macro News + Watchlist dalam satu intelligence layer — dipakai ElVoid AI untuk Risk & Sentiment scan."
    >
      <MacroIntelligence
        macroEvents={macroEvents}
        newsItems={news}
        sentiment={sentiment}
        nextHighImpact={nextHighImpact}
        marketImpact={marketImpact}
        watchlist={watchlist}
      />
    </AppShell>
  );
}
