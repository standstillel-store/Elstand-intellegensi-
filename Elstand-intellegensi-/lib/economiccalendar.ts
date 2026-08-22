import { cached } from "./cache";
import type { EconomicEvent } from "./types";

// ForexFactory publishes a public, no-auth-required JSON feed of this week's
// calendar. It's unofficial (no SLA, can change/break), but it's the only
// zero-cost way to get macro events like FOMC / CPI / NFP that regularly
// move crypto. If it ever goes down this just degrades to an empty array —
// nothing else in the app depends on it.
const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

interface FfEvent {
  title: string;
  country: string;
  date: string;
  impact: "High" | "Medium" | "Low" | "Holiday" | string;
  forecast?: string;
  previous?: string;
}

function mapImpact(impact: string): EconomicEvent["impact"] {
  if (impact === "High") return "high";
  if (impact === "Medium") return "medium";
  return "low";
}

export async function getEconomicCalendar(): Promise<EconomicEvent[]> {
  return cached("ff:calendar", 3_600_000, async () => {
    try {
      const res = await fetch(FEED_URL, { next: { revalidate: 3600 } });
      if (!res.ok) return [];
      const raw = (await res.json()) as FfEvent[];
      return raw
        .filter((e) => e.impact === "High" || e.impact === "Medium")
        .map((e) => ({
          title: e.title,
          country: e.country,
          date: e.date,
          impact: mapImpact(e.impact),
          forecast: e.forecast || undefined,
          previous: e.previous || undefined,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch {
      return [];
    }
  });
}

/** Next upcoming high/medium impact event relative to now, if any. */
export function nextEvent(events: EconomicEvent[]): EconomicEvent | undefined {
  const now = Date.now();
  return events.find((e) => new Date(e.date).getTime() >= now);
}
