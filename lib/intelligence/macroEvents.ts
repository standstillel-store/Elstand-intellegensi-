import type { EconomicEvent } from "@/lib/types";

// ---------------------------------------------------------------------------
// News & Macro Event node — event categorization.
//
// The spec asks for FOMC/CPI/PPI/NFP/PMI/Interest Rate specifically. This
// app already fetches a free economic calendar (ForexFactory feed, no key,
// see lib/economic-calendar or wherever base.calendar comes from) — this
// file just tags each entry into one of those categories by keyword match
// and sorts by proximity in time. No paid TradingEconomics dependency
// needed for this part.
//
// Honesty note: ForexFactory's feed gives title/impact/date/forecast/
// previous, but not the realized "actual" print once an event has occurred.
// So a past event is labeled "released", not "beat"/"miss" — this app
// doesn't fabricate a bullish/bearish call it can't actually back up.
// ---------------------------------------------------------------------------

export type MacroCategory = "FOMC" | "CPI" | "PPI" | "NFP" | "PMI" | "Interest Rate" | "Other";

export interface MacroEventView {
  title: string;
  category: MacroCategory;
  date: string;
  impact: "high" | "medium" | "low";
  forecast?: string;
  previous?: string;
  status: "upcoming" | "released";
  hoursAway: number; // negative if already released
}

const KEYWORD_MAP: Array<[RegExp, MacroCategory]> = [
  [/fomc|fed(eral)?\s*(reserve)?\s*(statement|minutes|press conference)?/i, "FOMC"],
  [/\bcpi\b|consumer price index/i, "CPI"],
  [/\bppi\b|producer price index/i, "PPI"],
  [/\bnfp\b|non[\s-]?farm payrolls?/i, "NFP"],
  [/\bpmi\b|purchasing managers/i, "PMI"],
  [/interest rate|rate decision|policy rate/i, "Interest Rate"],
];

function categorize(title: string): MacroCategory {
  for (const [re, category] of KEYWORD_MAP) {
    if (re.test(title)) return category;
  }
  return "Other";
}

export function getMacroEventsView(calendar: EconomicEvent[], limit = 8): MacroEventView[] {
  const now = Date.now();
  return calendar
    .map((e) => {
      const eventTime = new Date(e.date).getTime();
      const hoursAway = (eventTime - now) / 36e5;
      return {
        title: e.title,
        category: categorize(e.title),
        date: e.date,
        impact: e.impact,
        forecast: e.forecast,
        previous: e.previous,
        status: hoursAway >= 0 ? ("upcoming" as const) : ("released" as const),
        hoursAway,
      };
    })
    .filter((e) => e.category !== "Other" || e.impact === "high")
    .sort((a, b) => Math.abs(a.hoursAway) - Math.abs(b.hoursAway))
    .slice(0, limit);
}

/** Nearest upcoming high-impact event, for the Global Sentiment reasoning engine. */
export function getNextHighImpactEvent(calendar: EconomicEvent[]): { title: string; hoursAway: number } | undefined {
  const now = Date.now();
  const upcoming = calendar
    .filter((e) => e.impact === "high" && new Date(e.date).getTime() >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const next = upcoming[0];
  if (!next) return undefined;
  const hoursAway = (new Date(next.date).getTime() - now) / 36e5;
  if (hoursAway > 6) return undefined; // only "imminent" events should push the sentiment vote
  return { title: next.title, hoursAway };
}
