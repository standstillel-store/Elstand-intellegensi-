import { AppShell } from "@/components/AppShell";
import { MacroIntelligence, type MacroImpactRow } from "@/components/dashboard/MacroIntelligence";
import { getNews } from "@/lib/newsapi";
import { getEconomicCalendar } from "@/lib/economiccalendar";
import { getMacroEventsView, getNextHighImpactEvent } from "@/lib/intelligence/macroEvents";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";

export const metadata = {
  title: "Macro Intelligence | ELSTAND INTELLIGENCE",
};

// ---------------------------------------------------------------------------
// Macro Intelligence — merges the old standalone /news and
// /economic-calendar pages into one connected intelligence layer:
// EVENT -> NEWS -> SENTIMENT -> MARKET IMPACT -> INSIGHT.
//
// Both original pages (and their routes) stay untouched; this is a new,
// separate page that reuses their real data sources.
// ---------------------------------------------------------------------------

export default async function MacroIntelligencePage() {
  const [news, calendar] = await Promise.all([
    getNews().catch(() => []),
    getEconomicCalendar().catch(() => []),
  ]);

  const macroEvents = getMacroEventsView(calendar, 8);
  const nextHighImpact = getNextHighImpactEvent(calendar);

  // Lightweight sentiment read from the news feed itself — same pos/neg
  // count the old /news page already showed, just reused here as the
  // "Macro Sentiment" + "Macro Insight" synthesis. No market-data fetch
  // duplicated from the dashboard, so nothing here is fabricated.
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
      subtitle="Macro Events + Macro News dalam satu intelligence layer — dipakai ElVoid AI untuk Risk & Sentiment scan."
    >
      <MacroIntelligence
        macroEvents={macroEvents}
        newsItems={news}
        sentiment={sentiment}
        nextHighImpact={nextHighImpact}
        marketImpact={marketImpact}
      />
    </AppShell>
  );
}
