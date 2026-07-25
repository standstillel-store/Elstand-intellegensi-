"use client";
import { useMemo, useState } from "react";
import { ExternalLink, Flame, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { timeAgo } from "@/lib/format";
import { categorize, heatScore, impactBand, type NewsCategory } from "@/lib/newsPresentation";
import { ImpactMeter } from "@/components/economic-calendar/ImpactMeter";
import type { NewsItem } from "@/lib/types";

const SENTIMENT_STYLE: Record<string, string> = {
  positive: "bg-up/15 text-up border-up/30",
  negative: "bg-down/15 text-down border-down/30",
  neutral: "bg-ink-faint/10 text-ink-muted border-line",
};

const CATEGORIES: NewsCategory[] = ["Crypto", "Macro", "Stocks", "Forex", "ETF", "Whale"];

export function NewsFeedView({ news }: { news: NewsItem[] }) {
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "negative" | "neutral">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | NewsCategory>("all");

  const enriched = useMemo(
    () => news.map((n) => ({ item: n, category: categorize(n.title), heat: heatScore(n) })).sort((a, b) => b.heat - a.heat),
    [news]
  );
  const topStory = enriched[0];

  const filtered = enriched.filter(({ item, category }) => {
    if (sentimentFilter !== "all" && (item.sentiment ?? "neutral") !== sentimentFilter) return false;
    if (categoryFilter !== "all" && category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {topStory && (
        <a
          href={topStory.item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover-glow glow-card block overflow-hidden p-5"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="simulated-tag border-down/30 bg-down/10 text-down">
              <Flame size={9} /> Breaking
            </span>
            <span className="text-[10px] uppercase tracking-wide text-ink-faint">Top Story · {topStory.category}</span>
          </div>
          <p className="text-base font-semibold leading-snug text-ink">{topStory.item.title}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
            <span>
              {topStory.item.source} · {timeAgo(topStory.item.publishedAt)}
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp size={11} /> Heat {topStory.heat}
            </span>
            <span className="flex items-center gap-1.5">
              Market Impact <ImpactMeter impact={impactBand(topStory.heat)} />
            </span>
          </div>
        </a>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", "positive", "negative", "neutral"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setSentimentFilter(f)}
            className={clsx(
              "rounded-full border px-3 py-1 text-xs capitalize",
              sentimentFilter === f ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"
            )}
          >
            {f}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {(["all", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={clsx(
              "rounded-full border px-3 py-1 text-xs",
              categoryFilter === c ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"
            )}
          >
            {c === "all" ? "All Categories" : c}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-faint">{filtered.length} berita</span>
      </div>

      {!filtered.length && <div className="glow-card p-6 text-center text-sm text-ink-muted">Tidak ada berita untuk filter ini.</div>}

      <div className="glow-card divide-y divide-line p-0">
        {filtered.map(({ item: n, category, heat }) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-4 py-3 hover:bg-bg-raised/40"
          >
            <span
              className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${SENTIMENT_STYLE[n.sentiment ?? "neutral"]}`}
            >
              {n.sentiment ?? "neutral"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{n.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-faint">
                <span>
                  {n.source} · {timeAgo(n.publishedAt)}
                </span>
                <span className="rounded bg-bg-raised px-1.5 py-0.5 text-[10px] text-ink-muted">{category}</span>
                <span className="flex items-center gap-1">
                  <Flame size={10} /> {heat}
                </span>
              </p>
            </div>
            <ExternalLink size={13} className="mt-0.5 shrink-0 text-ink-faint" />
          </a>
        ))}
      </div>
    </div>
  );
}
