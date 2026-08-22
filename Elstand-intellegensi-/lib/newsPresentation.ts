// ---------------------------------------------------------------------------
// Presentation-layer helpers for the News page Phase 2 redesign.
//
// These are lightweight keyword heuristics computed from data the app
// already has (title, publishedAt, sentiment from lib/newsapi.ts) — nothing
// here calls an API or changes what lib/newsapi.ts fetches/classifies.
// Treat these as a first pass; a real categorizer would live server-side.
// ---------------------------------------------------------------------------
import type { NewsItem } from "./types";

export type NewsCategory = "Crypto" | "Macro" | "Stocks" | "Forex" | "ETF" | "Whale";

const CATEGORY_KEYWORDS: Record<NewsCategory, RegExp> = {
  Whale: /whale|large holder|accumulat|dump(ed|ing)?\s+\d/i,
  ETF: /\betf\b|blackrock|grayscale|ishares/i,
  Forex: /\bdxy\b|dollar index|forex|fx\b|yen|euro(?!pean central)/i,
  Macro: /fed\b|fomc|cpi\b|inflation|interest rate|jobs report|nfp\b|treasury|powell/i,
  Stocks: /nasdaq|s&p ?500|dow jones|stock market|equities/i,
  Crypto: /bitcoin|btc|ethereum|eth\b|crypto|altcoin|defi|blockchain/i,
};

/** First matching category by priority order (Whale/ETF/Forex/Macro/Stocks checked before the Crypto catch-all). */
export function categorize(title: string): NewsCategory {
  const order: NewsCategory[] = ["Whale", "ETF", "Forex", "Macro", "Stocks", "Crypto"];
  for (const cat of order) {
    if (CATEGORY_KEYWORDS[cat].test(title)) return cat;
  }
  return "Crypto";
}

/** 0-100 "how much attention is this getting right now" proxy: recency decay + a bump for non-neutral sentiment (strong reactions travel faster). Illustrative, not a real engagement metric. */
export function heatScore(item: NewsItem): number {
  const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
  const recency = Math.max(0, 100 - ageHours * 4); // fully decayed after ~25h
  const sentimentBump = item.sentiment && item.sentiment !== "neutral" ? 15 : 0;
  return Math.max(2, Math.min(100, Math.round(recency * 0.7 + sentimentBump)));
}

/** Simple market-impact banding off the heat score, for a compact badge. */
export function impactBand(score: number): "high" | "medium" | "low" {
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  return "low";
}
