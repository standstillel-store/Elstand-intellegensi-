"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { timeAgo } from "@/lib/format";
import type { NewsItem } from "@/lib/types";

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-up",
  negative: "bg-down",
  neutral: "bg-ink-faint",
};

export function NewsFeedPanel() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setNews(data.news ?? []);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-lg border border-line bg-bg-surface/40 p-3">
      <p className="text-xs font-semibold text-ink-muted">News Feed</p>

      {status === "loading" && <p className="mt-3 animate-pulse text-[11px] text-ink-faint">Memuat berita…</p>}
      {status === "error" && <p className="mt-3 text-[11px] text-ink-faint">Gagal memuat berita.</p>}
      {status === "ready" && news.length === 0 && <p className="mt-3 text-[11px] text-ink-faint">Belum ada berita.</p>}

      <ul className="mt-2 space-y-2">
        {news.slice(0, 6).map((item) => (
          <li key={item.id}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-md px-1 py-1 text-[11px] leading-snug text-ink-muted transition-colors hover:bg-bg-raised hover:text-ink"
            >
              <span className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", SENTIMENT_DOT[item.sentiment ?? "neutral"])} />
              <span className="min-w-0">
                <span className="mono-num mr-1.5 text-ink-faint">{timeAgo(item.publishedAt)}</span>
                {item.title}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
