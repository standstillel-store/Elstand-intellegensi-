import { isStableOrWrapped } from "./asset-filters";
import type { CoinMarket, EconomicEvent, RugpullRisk, WhaleTransfer } from "./types";

// ---------------------------------------------------------------------------
// Small, transparent derived-signal helpers for the mobile Home dashboard.
// Every function below is a pure re-read of data ElVoid AI already fetches in
// getSnapshot() — no new API calls, no invented numbers. Same "show your
// work" spirit as lib/scoring.ts: if a number appears on screen, you can
// trace exactly where it came from.
// ---------------------------------------------------------------------------

export interface AltseasonReading {
  index: number; // 0-100, % of sampled alts outperforming BTC over 7d
  label: string;
  sampleSize: number;
}

/**
 * Adapts the well-known "Altcoin Season Index" methodology (percentage of
 * top coins that outperformed BTC over a trailing window) to the 7d change
 * field ElVoid AI already has on hand. Excludes BTC, stablecoins, and wrapped
 * assets. Markets are assumed pre-sorted by market cap desc (CoinGecko
 * default), so slicing the first 50 after filtering approximates "top 50
 * alts by market cap".
 */
export function computeAltseasonIndex(markets: CoinMarket[]): AltseasonReading | undefined {
  const btc = markets.find((m) => m.symbol.toLowerCase() === "btc");
  const btc7d = btc?.price_change_percentage_7d_in_currency;
  if (btc7d === undefined) return undefined;

  const sample = markets
    .filter((m) => m.symbol.toLowerCase() !== "btc" && !isStableOrWrapped(m))
    .filter((m) => m.price_change_percentage_7d_in_currency !== undefined)
    .slice(0, 50);
  if (!sample.length) return undefined;

  const outperforming = sample.filter((m) => (m.price_change_percentage_7d_in_currency ?? 0) > btc7d).length;
  const index = Math.round((outperforming / sample.length) * 100);
  const label = index >= 75 ? "Alt Season" : index <= 25 ? "BTC Season" : "Netral";

  return { index, label, sampleSize: sample.length };
}

export interface MacroReading {
  level: "calm" | "watch" | "alert";
  label: string;
  nextEvent?: EconomicEvent;
}

/** Reads urgency straight off the economic calendar's own impact + date. */
export function computeMacroStatus(calendar: EconomicEvent[]): MacroReading {
  const now = Date.now();
  const upcoming = calendar
    .filter((e) => new Date(e.date).getTime() >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const nextHighImpact = upcoming.find((e) => e.impact === "high") ?? upcoming[0];
  if (!nextHighImpact) return { level: "calm", label: "Tidak ada event besar terjadwal" };

  const hoursAway = (new Date(nextHighImpact.date).getTime() - now) / 36e5;
  if (nextHighImpact.impact === "high" && hoursAway <= 48) {
    return { level: "alert", label: "Event high-impact < 48 jam", nextEvent: nextHighImpact };
  }
  if (hoursAway <= 24 * 7) {
    return { level: "watch", label: "Event penting minggu ini", nextEvent: nextHighImpact };
  }
  return { level: "calm", label: "Tidak ada event mendesak", nextEvent: nextHighImpact };
}

/**
 * Biggest real 24h decliners among reasonably liquid, independently-priced
 * names. Deliberately NOT called a "prediction" anywhere in the UI copy —
 * it's a read of what already moved, the honest substitute for a fabricated
 * dump-probability score the scoring engine doesn't actually compute.
 */
export function computeTopDecliners(markets: CoinMarket[], limit = 5): CoinMarket[] {
  return markets
    .filter((m) => !isStableOrWrapped(m))
    .filter((m) => m.total_volume > 1_000_000)
    .filter((m) => (m.price_change_percentage_24h_in_currency ?? 0) < 0)
    .sort((a, b) => (a.price_change_percentage_24h_in_currency ?? 0) - (b.price_change_percentage_24h_in_currency ?? 0))
    .slice(0, limit);
}

/**
 * Tokens whose risk-assessment flags specifically describe a wash-trading-
 * style pattern (volume dwarfing the pool, or a brand-new pool already
 * carrying heavy flow) rather than just generic thin liquidity. This is the
 * narrowest, most defensible reading of "anomaly" the current scoring
 * engine supports — it re-labels existing flags, it doesn't invent new ones.
 */
export function computeVolumeAnomalies(rugpullRisks: RugpullRisk[], limit = 5): RugpullRisk[] {
  const pattern = /5x\+ pool liquidity|under 48h old with heavy volume|shortly before\/after listing/i;
  return rugpullRisks
    .filter((r) => r.flags.some((f) => pattern.test(f)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface WhaleSummary {
  totalUsd: number;
  count: number;
  largest?: WhaleTransfer;
}

export function computeWhaleSummary(whales: WhaleTransfer[]): WhaleSummary {
  const totalUsd = whales.reduce((sum, w) => sum + w.valueUsd, 0);
  const largest = [...whales].sort((a, b) => b.valueUsd - a.valueUsd)[0];
  return { totalUsd, count: whales.length, largest };
}

/** Short, terminal-style status line for the header. */
export function computeSystemTagline(fngValue: number | undefined, riskCount: number, pumpCount: number): string {
  if (fngValue !== undefined && fngValue <= 25) return "Market in Risk-Off Mode";
  if (fngValue !== undefined && fngValue >= 75) return "Market in Risk-On Euphoria";
  if (riskCount >= 8) return "Elevated Risk Signals Across Market";
  if (pumpCount >= 8) return "Momentum Broadening Across Alts";
  return "Market Steady, Signals Normal";
} 