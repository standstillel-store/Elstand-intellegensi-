import type { CoinMarket, FundingInfo, WhaleTransfer } from "./types";
import { isRelevantAsset } from "./asset-filters";

// ---------------------------------------------------------------------------
// Token Scanner's 7 required categories. Top Pump Candidate and Top Rugpull
// Risk already exist (lib/scoring.ts). Everything below is new, but follows
// the exact same rule: transparent, rule-based, explainable — never a
// black-box prediction. Confidence is always "how many independent things
// agree", capped well short of certainty.
// ---------------------------------------------------------------------------

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export interface MomentumCandidate {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  price: number;
  change24h: number;
  score: number;
  confidence: number;
  reasons: string[];
}

/** Top Dump Candidate — the bearish mirror of buildPumpCandidates. */
export function buildDumpCandidates(
  markets: CoinMarket[],
  funding: FundingInfo[],
  whales: WhaleTransfer[]
): MomentumCandidate[] {
  const fundingBySymbol = new Map(funding.map((f) => [f.symbol.replace("USDT", "").toLowerCase(), f]));
  const whaleOutBySymbol = new Map<string, number>();
  for (const w of whales) {
    if (w.direction !== "out") continue;
    const k = w.asset.toLowerCase();
    whaleOutBySymbol.set(k, (whaleOutBySymbol.get(k) ?? 0) + w.valueUsd);
  }

  return markets
    .filter((m) => m.market_cap && m.market_cap > 0)
    .filter((m) => isRelevantAsset(m))
    .map((m) => {
      const sym = m.symbol.toLowerCase();
      const reasons: string[] = [];
      let score = 0;
      let corroborating = 0;

      const chg24 = m.price_change_percentage_24h_in_currency ?? 0;
      const chg7d = m.price_change_percentage_7d_in_currency ?? 0;
      const decel = chg24 - chg7d / 7;
      let momentumHit = false;
      if (chg24 < -8) {
        score += 15;
        momentumHit = true;
        reasons.push(`Price down ${chg24.toFixed(1)}% in 24h`);
      }
      if (decel < -3) {
        score += 10;
        momentumHit = true;
        reasons.push("Decline accelerating vs 7d trend");
      }
      if (momentumHit) corroborating++;

      const turnover = m.market_cap ? m.total_volume / m.market_cap : 0;
      if (turnover > 0.5 && chg24 < 0) {
        score += 12;
        corroborating++;
        reasons.push("Heavy sell-side turnover relative to market cap");
      }

      const whaleOutUsd = whaleOutBySymbol.get(sym) ?? 0;
      if (whaleOutUsd > 1_000_000) {
        score += 15;
        corroborating++;
        reasons.push("Large whale outflow detected (>$1M)");
      } else if (whaleOutUsd > 250_000) {
        score += 8;
        corroborating++;
        reasons.push("Whale distribution detected");
      }

      const f = fundingBySymbol.get(sym);
      if (f && f.lastFundingRate > 0.0015 && chg24 < 0) {
        score += 10;
        corroborating++;
        reasons.push("Crowded long funding unwinding into a falling price");
      }

      const confidence = clamp(30 + corroborating * 13, 0, 90);

      return {
        id: m.id,
        symbol: m.symbol.toUpperCase(),
        name: m.name,
        image: m.image,
        price: m.current_price,
        change24h: chg24,
        score: clamp(score),
        confidence,
        reasons: reasons.slice(0, 4),
      } satisfies MomentumCandidate;
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

/** High Momentum — pure 1h/24h acceleration read, independent of the pump-score aggregate. */
export function buildHighMomentum(markets: CoinMarket[]): MomentumCandidate[] {
  return markets
    .filter((m) => isRelevantAsset(m))
    .map((m) => {
      const chg1h = m.price_change_percentage_1h_in_currency ?? 0;
      const chg24 = m.price_change_percentage_24h_in_currency ?? 0;
      const score = clamp(chg1h * 4 + chg24 * 1.2, 0, 100);
      const reasons = [`1h ${chg1h >= 0 ? "+" : ""}${chg1h.toFixed(2)}%`, `24h ${chg24 >= 0 ? "+" : ""}${chg24.toFixed(2)}%`];
      return {
        id: m.id,
        symbol: m.symbol.toUpperCase(),
        name: m.name,
        image: m.image,
        price: m.current_price,
        change24h: chg24,
        score,
        confidence: clamp(40 + Math.min(30, Math.abs(chg1h) * 5)),
        reasons,
      } satisfies MomentumCandidate;
    })
    .filter((c) => c.score > 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

export interface SmartMoneyEntry {
  symbol: string;
  netInflowUsd: number;
  txCount: number;
  change24h?: number;
}

/**
 * Smart Money Accumulation — symbols with the strongest net whale INFLOW
 * (buy transfers minus sell transfers, by USD) whose price hasn't already
 * run — the "quiet accumulation before the move" read, distinct from
 * chasing a name that already pumped.
 */
export function buildSmartMoneyAccumulation(whales: WhaleTransfer[], markets: CoinMarket[]): SmartMoneyEntry[] {
  const bySymbol = new Map<string, { inUsd: number; outUsd: number; count: number }>();
  for (const w of whales) {
    const k = w.asset.toUpperCase();
    const prev = bySymbol.get(k) ?? { inUsd: 0, outUsd: 0, count: 0 };
    if (w.direction === "in") prev.inUsd += w.valueUsd;
    if (w.direction === "out") prev.outUsd += w.valueUsd;
    prev.count += 1;
    bySymbol.set(k, prev);
  }

  const priceChangeBySymbol = new Map(markets.map((m) => [m.symbol.toUpperCase(), m.price_change_percentage_24h_in_currency]));

  return [...bySymbol.entries()]
    .map(([symbol, v]) => ({
      symbol,
      netInflowUsd: v.inUsd - v.outUsd,
      txCount: v.count,
      change24h: priceChangeBySymbol.get(symbol),
    }))
    .filter((e) => e.netInflowUsd > 150_000)
    .filter((e) => (e.change24h ?? 0) < 6) // hasn't already run — quiet accumulation, not chasing a pump
    .sort((a, b) => b.netInflowUsd - a.netInflowUsd)
    .slice(0, 20);
}

export interface WhaleFlowGroup {
  asset: string;
  totalUsd: number;
  count: number;
}

function groupByDirection(whales: WhaleTransfer[], direction: WhaleTransfer["direction"]): WhaleFlowGroup[] {
  const map = new Map<string, WhaleFlowGroup>();
  for (const w of whales) {
    if (w.direction !== direction) continue;
    const prev = map.get(w.asset) ?? { asset: w.asset, totalUsd: 0, count: 0 };
    prev.totalUsd += w.valueUsd;
    prev.count += 1;
    map.set(w.asset, prev);
  }
  return [...map.values()].sort((a, b) => b.totalUsd - a.totalUsd).slice(0, 20);
}

/** Whale Buying — aggregated inbound transfer volume per asset. */
export function buildWhaleBuying(whales: WhaleTransfer[]): WhaleFlowGroup[] {
  return groupByDirection(whales, "in");
}

/** Whale Selling — aggregated outbound transfer volume per asset. */
export function buildWhaleSelling(whales: WhaleTransfer[]): WhaleFlowGroup[] {
  return groupByDirection(whales, "out");
}
