"use client";

import { Fragment, useMemo, useState } from "react";
import { Bookmark, Calendar, ChevronDown } from "lucide-react";
import { currencyFlag } from "@/lib/format";
import type { EconomicEvent } from "@/lib/types";

// ---------------------------------------------------------------------------
// Real Today / Tomorrow / This Week + Impact/Currency filtering over the
// actual fetched calendar (no fabricated rows). Desktop renders the full
// table (grouped by day); mobile renders a compact list capped at 4 rows,
// same as the reference. Both share one filter state.
// ---------------------------------------------------------------------------

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
}

function impactBadgeClass(impact: "high" | "medium" | "low") {
  if (impact === "high") return "bg-down/15 text-down border-down/30";
  if (impact === "medium") return "bg-amber/15 text-amber border-amber/30";
  return "bg-line/40 text-ink-faint border-line";
}

export function EconomicCalendarPanel({ events }: { events: EconomicEvent[] }) {
  const [range, setRange] = useState<"today" | "tomorrow" | "week">("today");
  const [impactFilter, setImpactFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");

  const currencies = useMemo(() => Array.from(new Set(events.map((e) => e.country))).sort(), [events]);

  const byRange = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now).getTime();
    const tomorrowStart = todayStart + 86400000;
    const weekEnd = todayStart + 7 * 86400000;

    const inRange = (e: EconomicEvent, r: "today" | "tomorrow" | "week") => {
      const t = new Date(e.date).getTime();
      if (r === "today") return t >= todayStart && t < tomorrowStart;
      if (r === "tomorrow") return t >= tomorrowStart && t < tomorrowStart + 86400000;
      return t >= todayStart && t < weekEnd;
    };

    return {
      today: events.filter((e) => inRange(e, "today")),
      tomorrow: events.filter((e) => inRange(e, "tomorrow")),
      week: events.filter((e) => inRange(e, "week")),
    };
  }, [events]);

  // "Today" can legitimately be empty (quiet calendar day, or nothing left
  // after the last release) — rather than a dead empty card, fall back to
  // showing the rest of the week so there's always something real to scan.
  const usingFallback = range === "today" && byRange.today.length === 0 && byRange.week.length > 0;
  const rangeEvents = usingFallback ? byRange.week : byRange[range];

  const filtered = useMemo(
    () =>
      rangeEvents
        .filter((e) => impactFilter === "all" || e.impact === impactFilter)
        .filter((e) => currencyFilter === "all" || e.country === currencyFilter)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [rangeEvents, impactFilter, currencyFilter],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const e of filtered) {
      const key = dayLabel(e.date);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [filtered]);

  return (
    <div className="panel flex h-full flex-col p-3.5">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        <Calendar size={12} />
        Economic Calendar
      </div>

      {/* Desktop: tabs + filter dropdowns */}
      <div className="mb-3 hidden flex-wrap items-center gap-2 lg:flex">
        <div className="flex rounded-lg border border-line bg-bg-raised/40 p-0.5 text-[12px]">
          {(["today", "tomorrow", "week"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                range === r ? "bg-signal/15 text-signal" : "text-ink-faint hover:text-ink"
              }`}
            >
              {r === "today" ? "Today" : r === "tomorrow" ? "Tomorrow" : "This Week"}
            </button>
          ))}
        </div>
        <select
          value={impactFilter}
          onChange={(e) => setImpactFilter(e.target.value as typeof impactFilter)}
          className="rounded-lg border border-line bg-bg-raised/40 px-2.5 py-1.5 text-[12px] text-ink-muted"
        >
          <option value="all">All Impact</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          className="rounded-lg border border-line bg-bg-raised/40 px-2.5 py-1.5 text-[12px] text-ink-muted"
        >
          <option value="all">All Currencies</option>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Mobile: simple "Today" label */}
      <div className="mb-2 flex items-center justify-between lg:hidden">
        <span className="flex items-center gap-1 text-[12px] text-ink-muted">
          Today <ChevronDown size={13} />
        </span>
      </div>

      {usingFallback ? (
        <p className="mb-2 text-[11px] text-amber">Tidak ada event tersisa hari ini &mdash; menampilkan sisa minggu ini.</p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-faint">Tidak ada event untuk filter ini.</p>
      ) : (
        <>
          {/* Desktop table, grouped by day */}
          <div className="hidden flex-1 overflow-x-auto lg:block">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Currency</th>
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 font-medium">Impact</th>
                  <th className="pb-2 font-medium">Actual</th>
                  <th className="pb-2 font-medium">Forecast</th>
                  <th className="pb-2 font-medium">Previous</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {Array.from(byDay.entries()).map(([day, dayEvents]) => (
                  <Fragment key={day}>
                    <tr>
                      <td colSpan={8} className="border-t border-line/60 pb-1 pt-3 text-[10px] uppercase tracking-wide text-ink-faint">
                        {day}
                      </td>
                    </tr>
                    {dayEvents.map((e, i) => (
                      <tr key={`${day}-${i}`} className="border-t border-line/40">
                        <td className="whitespace-nowrap py-2 pr-3 text-ink-muted">
                          {new Date(e.date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-ink-muted">
                          {currencyFlag(e.country)} {e.country}
                        </td>
                        <td className="py-2 pr-3 font-medium text-ink">{e.title}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${impactBadgeClass(e.impact)}`}>
                            {e.impact}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-ink-faint">&ndash;</td>
                        <td className="py-2 pr-3 text-ink-muted">{e.forecast ?? "\u2013"}</td>
                        <td className="py-2 pr-3 text-ink-muted">{e.previous ?? "\u2013"}</td>
                        <td className="py-2 text-ink-faint">
                          <Bookmark size={13} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list, capped */}
          <div className="space-y-2 lg:hidden">
            {filtered.slice(0, 4).map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-line/40 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                    {new Date(e.date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} {currencyFlag(e.country)}{" "}
                    {e.country}
                  </p>
                  <p className="truncate text-xs font-medium text-ink">{e.title}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${impactBadgeClass(e.impact)}`}>
                    {e.impact}
                  </span>
                  <Bookmark size={13} className="text-ink-faint" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <a href="/economic-calendar" className="mt-3 flex items-center gap-1 text-[12px] font-medium text-signal">
        View Full Calendar &rarr;
      </a>
    </div>
  );
}
