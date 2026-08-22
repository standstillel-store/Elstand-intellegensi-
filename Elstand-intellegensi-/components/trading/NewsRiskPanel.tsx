"use client";
import { useEffect, useState } from "react";
import { EconomicCalendarPanel } from "@/components/EconomicCalendarPanel";
import type { EconomicEvent, NewsItem } from "@/lib/types";

function computeRegime(news: NewsItem[]): { label: string; tone: string; score: number } {
  const recent = news.filter((n) => Date.now() - new Date(n.publishedAt).getTime() < 6 * 3600_000);
  const positive = recent.filter((n) => n.sentiment === "positive").length;
  const negative = recent.filter((n) => n.sentiment === "negative").length;
  const total = positive + negative;
  const score = total ? Math.round(((positive - negative) / total) * 100) : 0;
  if (score >= 20) return { label: "Risk On", tone: "text-up border-up/30 bg-up/10", score };
  if (score <= -20) return { label: "Risk Off", tone: "text-down border-down/30 bg-down/10", score };
  return { label: "Neutral", tone: "text-ink-muted border-line bg-bg-raised", score };
}

export function NewsRiskPanel() {
  const [calendar, setCalendar] = useState<EconomicEvent[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    fetch("/api/economic-calendar")
      .then((r) => r.json())
      .then((b) => setCalendar(b.events ?? []))
      .catch(() => setCalendar([]));
    fetch("/api/news")
      .then((r) => r.json())
      .then((b) => setNews(b.news ?? []))
      .catch(() => setNews([]));
  }, []);

  const regime = computeRegime(news);
  const highImpactSoon = calendar.filter((e) => {
    const t = new Date(e.date).getTime();
    return e.impact === "high" && t >= Date.now() && t - Date.now() <= 30 * 60_000;
  });

  return (
    <div className="space-y-3">
      <div className="glow-card flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">Market Sentiment Regime</p>
          <span className={`mt-1 inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${regime.tone}`}>{regime.label}</span>
        </div>
        <p className="mono-num text-xl font-semibold text-ink">{regime.score > 0 ? "+" : ""}{regime.score}</p>
      </div>
      {highImpactSoon.length > 0 && (
        <div className="rounded-md border border-amber/40 bg-amber/10 p-3 text-xs text-amber">
          ⚠ Entry baru ditahan — {highImpactSoon[0].title} rilis dalam {Math.round((new Date(highImpactSoon[0].date).getTime() - Date.now()) / 60_000)} menit.
        </div>
      )}
      <EconomicCalendarPanel items={calendar} />
    </div>
  );
}
