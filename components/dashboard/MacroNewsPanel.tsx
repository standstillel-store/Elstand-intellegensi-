"use client";

import { useMemo, useState } from "react";
import { Newspaper } from "lucide-react";
import { categorize, heatScore, type NewsCategory } from "@/lib/newsPresentation";
import { timeAgo } from "@/lib/format";
import type { NewsItem } from "@/lib/types";

const CATEGORIES: Array<"All" | NewsCategory> = ["All", "Crypto", "Macro", "Stocks", "Forex", "ETF"];

function sentimentBadgeClass(sentiment?: "positive" | "negative" | "neutral") {
  if (sentiment === "positive") return "bg-up/15 text-up border-up/30";
  if (sentiment === "negative") return "bg-down/15 text-down border-down/30";
  return "bg-line/40 text-ink-faint border-line";
}

export function MacroNewsPanel({ news }: { news: NewsItem[] }) {
  const [category, setCategory] = useState<"All" | NewsCategory>("All");

  const tagged = useMemo(() => news.map((n) => ({ ...n, category: categorize(n.title), heat: heatScore(n) })), [news]);
  const filtered = useMemo(
    () => (category === "All" ? tagged : tagged.filter((n) => n.category === category)),
    [tagged, category],
  );
  const breaking = tagged.slice().sort((a, b) => b.heat - a.heat)[0];

  return (
    <div className="panel flex h-full flex-col p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          <Newspaper size={12} />
          Macro News
        </div>
        <a href="/news" className="hidden text-[12px] font-medium text-signal lg:block">
          View All
        </a>
      </div>

      {/* Category pills — desktop only, same real categorize() the /news page uses */}
      <div className="mb-3 hidden flex-wrap gap-1.5 lg:flex">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              category === c ? "border-signal/40 bg-signal/15 text-signal" : "border-line text-ink-faint hover:text-ink"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Breaking hero — desktop only */}
      {breaking && breaking.heat >= 65 ? (
        <a
          href={breaking.url}
          target="_blank"
          rel="noreferrer"
          className="mb-3 hidden rounded-lg border border-amber/30 bg-amber/[0.06] p-3 lg:block"
        >
          <div className="flex items-center gap-2">
            <span className="rounded border border-amber/40 bg-amber/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber">
              Breaking
            </span>
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${sentimentBadgeClass(breaking.sentiment)}`}>
              {breaking.sentiment ?? "neutral"}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink">{breaking.title}</p>
          <p className="mt-1 text-[10px] text-ink-faint">
            {breaking.source} &middot; {timeAgo(breaking.publishedAt)} &middot; {breaking.category}
          </p>
        </a>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-faint">Waiting API</p>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 5).map((n) => (
            <a
              key={n.id}
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2 transition-colors hover:border-signal/40"
            >
              <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${sentimentBadgeClass(n.sentiment)}`}>
                {n.sentiment ?? "neutral"}
              </span>
              <p className="mt-1.5 line-clamp-2 text-xs font-medium text-ink">{n.title}</p>
              <p className="mt-1 text-[10px] text-ink-faint">
                {n.source} &middot; {timeAgo(n.publishedAt)} &middot; {n.category}
              </p>
            </a>
          ))}
        </div>
      )}

      <a href="/news" className="mt-3 flex items-center gap-1 text-[12px] font-medium text-signal lg:hidden">
        View All News &rarr;
      </a>
    </div>
  );
}
