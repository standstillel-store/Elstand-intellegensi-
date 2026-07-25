import { getEconomicCalendar } from "../economiccalendar";
import { getNews } from "../newsapi";
import type { EconomicEvent, NewsItem } from "../types";

// ---------------------------------------------------------------------------
// The News Engine. Two jobs, deliberately kept separate:
//   1. Entry gating: don't open a fresh position in the minutes right
//      around a High Impact release (FOMC, CPI, NFP, ...) — the spread and
//      slippage risk alone can blow past the 1% risk budget regardless of
//      what the technical setup looks like.
//   2. Exit confirmation: one input (of four — see exitConditions.ts) into
//      "did this trade's premise actually break". By itself, a sentiment
//      shift is NEVER a reason to close — the spec is explicit about this
//      ("Do NOT close trade only because sentiment changes") — so this
//      module never exposes a standalone "sentiment flipped -> exit"
//      function, only the ingredients exitConditions.ts combines with
//      price action / structure / order flow.
// ---------------------------------------------------------------------------

export type NewsImpact = "high" | "medium" | "low";
export type MarketRegime = "risk_on" | "risk_off" | "neutral";

export interface NewsWindowState {
  upcomingHighImpact: EconomicEvent[]; // within lookahead window
  recentHighImpact: EconomicEvent[]; // within lookback window (just released)
  regime: MarketRegime;
  regimeScore: number; // -100..100, negative = risk off
  regimeSampleSize: number;
}

const LOOKAHEAD_MS = 30 * 60_000; // don't open new entries inside 30 min of a High Impact release
const LOOKBACK_MS = 45 * 60_000; // a release counts as "just happened" for exit-confirmation purposes for 45 min after

function isSymbolRelevant(item: NewsItem, symbol: string): boolean {
  const base = symbol.replace(/USDT$|BUSD$|USD$/i, "");
  const haystack = item.title.toLowerCase();
  if (base.toUpperCase() === "BTC" || base.toUpperCase() === "ETH") {
    // BTC/ETH news moves the whole market — count general crypto headlines too.
    return true;
  }
  return haystack.includes(base.toLowerCase()) || haystack.includes("crypto") || haystack.includes("bitcoin");
}

/** Builds the current News Engine snapshot — shared context for every symbol's entry/exit checks in one tick, so the calendar/news feeds are only fetched once. */
export async function buildNewsWindow(): Promise<NewsWindowState> {
  const [calendar, news] = await Promise.all([getEconomicCalendar().catch(() => []), getNews().catch(() => [])]);
  const now = Date.now();

  const upcomingHighImpact = calendar.filter((e) => {
    const t = new Date(e.date).getTime();
    return e.impact === "high" && t >= now && t - now <= LOOKAHEAD_MS;
  });
  const recentHighImpact = calendar.filter((e) => {
    const t = new Date(e.date).getTime();
    return e.impact === "high" && t <= now && now - t <= LOOKBACK_MS;
  });

  const scored = news.filter((n) => new Date(n.publishedAt).getTime() >= now - 6 * 3600_000);
  const positive = scored.filter((n) => n.sentiment === "positive").length;
  const negative = scored.filter((n) => n.sentiment === "negative").length;
  const total = positive + negative;
  const regimeScore = total ? Math.round(((positive - negative) / total) * 100) : 0;
  const regime: MarketRegime = regimeScore >= 20 ? "risk_on" : regimeScore <= -20 ? "risk_off" : "neutral";

  return { upcomingHighImpact, recentHighImpact, regime, regimeScore, regimeSampleSize: total };
}

/** Entry gate: refuses new entries within LOOKAHEAD_MS of a High Impact economic release. */
export function blocksNewEntry(window: NewsWindowState): { blocked: boolean; reason?: string } {
  if (!window.upcomingHighImpact.length) return { blocked: false };
  const next = window.upcomingHighImpact[0];
  const minutesAway = Math.round((new Date(next.date).getTime() - Date.now()) / 60_000);
  return {
    blocked: true,
    reason: `High Impact news dalam ${minutesAway} menit (${next.title}, ${next.country}) — entry baru ditahan sampai rilis selesai.`,
  };
}

/**
 * The "News" leg of the four-factor exit confirmation. Returns true only
 * when a High Impact event has *just* released AND the sentiment regime
 * opposes the open position's direction — never on regime drift alone.
 * exitConditions.ts still requires this AND price action AND structure AND
 * order flow before it will actually close anything.
 */
export function newsOpposesPosition(window: NewsWindowState, positionSide: "LONG" | "SHORT"): { opposes: boolean; detail: string } {
  if (!window.recentHighImpact.length) {
    return { opposes: false, detail: "Tidak ada rilis High Impact baru-baru ini." };
  }
  const opposingRegime = positionSide === "LONG" ? window.regime === "risk_off" : window.regime === "risk_on";
  if (!opposingRegime || window.regimeSampleSize < 3) {
    return { opposes: false, detail: `Rilis ${window.recentHighImpact[0].title} baru terjadi, tapi sentimen belum cukup jelas melawan posisi.` };
  }
  return {
    opposes: true,
    detail: `${window.recentHighImpact[0].title} baru rilis, sentimen bergeser ke ${window.regime === "risk_off" ? "Risk Off" : "Risk On"} (melawan posisi ${positionSide}).`,
  };
}
