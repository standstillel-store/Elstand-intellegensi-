import type { ReactNode } from "react";
import { AccordionSection } from "./AccordionSection";
import { timeAgo, timeUntil } from "@/lib/format";
import type { EconomicEvent, NewsItem } from "@/lib/types";

function SubLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 mt-3 text-[11px] uppercase tracking-wide text-ink-faint first:mt-0">{children}</p>;
}

function sentimentDot(s?: NewsItem["sentiment"]) {
  if (s === "positive") return "bg-up";
  if (s === "negative") return "bg-down";
  return "bg-ink-faint";
}

export function MarketIntelSection({ news, calendar }: { news: NewsItem[]; calendar: EconomicEvent[] }) {
  const upcoming = calendar.filter((e) => new Date(e.date).getTime() >= Date.now());
  const important = upcoming.filter((e) => e.impact === "high").slice(0, 3);

  const glance =
    news.length || upcoming.length ? (
      <span className="mono-num text-xs font-medium text-ink-muted">{news.length + upcoming.length} update</span>
    ) : undefined;

  return (
    <AccordionSection code="NWS" title="Market Intelligence" glance={glance}>
      <SubLabel>News</SubLabel>
      {news.length ? (
        <ul className="space-y-2.5">
          {news.slice(0, 4).map((n) => (
            <li key={n.id} className="flex items-start gap-2">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${sentimentDot(n.sentiment)}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{n.title}</p>
                <p className="text-[11px] text-ink-faint">
                  {n.source} · {timeAgo(n.publishedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">Feed berita belum aktif saat ini.</p>
      )}

      <SubLabel>Economic Calendar</SubLabel>
      {upcoming.length ? (
        <ul className="divide-y divide-line">
          {upcoming.slice(0, 4).map((e, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2 first:pt-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase text-ink-faint">{e.country}</span>
                  <span className={`text-[10px] uppercase ${e.impact === "high" ? "text-down" : "text-amber"}`}>
                    {e.impact}
                  </span>
                </div>
                <p className="truncate text-sm text-ink">{e.title}</p>
              </div>
              <span className="mono-num shrink-0 text-right text-xs text-ink-muted">{timeUntil(e.date)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">Tidak ada event terjadwal minggu ini.</p>
      )}

      <SubLabel>Token Unlock</SubLabel>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Sumber data unlock token belum terintegrasi.</p>
        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase text-ink-faint">
          Segera
        </span>
      </div>

      <SubLabel>Important Events</SubLabel>
      {important.length ? (
        <ul className="space-y-1.5">
          {important.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{e.title}</span>
              <span className="mono-num shrink-0 text-xs text-down">{timeUntil(e.date)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">Tidak ada event high-impact yang mendekat.</p>
      )}
    </AccordionSection>
  );
}
