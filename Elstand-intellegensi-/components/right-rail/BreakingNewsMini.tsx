import Link from "next/link";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { timeAgo } from "@/lib/format";
import type { NewsItem } from "@/lib/types";

const SENTIMENT_DOT = { positive: "bg-up", negative: "bg-down", neutral: "bg-ink-faint" } as const;

export function BreakingNewsMini({ news }: { news: NewsItem[] }) {
  return (
    <div className="glow-card p-4">
      <SectionHeader code="NWS" title="Breaking News" hint={`${news.length} artikel`} />
      {!news.length ? (
        <p className="py-4 text-center text-xs text-ink-muted">Belum ada berita — NEWSAPI_KEY mungkin belum diset.</p>
      ) : (
        <ul className="space-y-2.5">
          {news.slice(0, 5).map((n) => (
            <li key={n.id}>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 text-xs"
              >
                <span className={clsx("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", SENTIMENT_DOT[n.sentiment ?? "neutral"])} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-ink group-hover:text-signal-glow">{n.title}</span>
                  <span className="mt-0.5 block text-[10px] text-ink-faint">
                    {n.source} · {timeAgo(n.publishedAt)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <Link href="/news" className="mt-3 block border-t border-line pt-2 text-center text-[11px] text-ink-muted hover:text-ink">
        Lihat semua berita →
      </Link>
    </div>
  );
}
