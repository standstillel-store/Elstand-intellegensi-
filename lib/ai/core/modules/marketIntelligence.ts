import { callAiCore, isAiCoreConfigured } from "../llm";
import { MARKET_INTELLIGENCE_PROMPT } from "../prompts";
import { nowMeta, type AiMarketIntelligenceCategory, type AiMarketIntelligenceResult, type MarketIntelligenceContext } from "../types";

// ---------------------------------------------------------------------------
// AI Market Intelligence (brief Module 5, "AI Market Narrative" split into
// a structured multi-category read here + a single flowing paragraph in
// ../modules/narrative.ts — see prompts.ts header for why). Market-wide,
// not per-coin — this module's own prompt explicitly forbids buy/sell/hold
// language, matching this app's existing Dashboard "Final Conclusion" rule
// (see lib/intelligence/finalConclusion.ts: "deliberately NOT a buy/sell/
// hold instruction").
// ---------------------------------------------------------------------------

type MarketIntelAiShape = Omit<AiMarketIntelligenceResult, "meta">;

function isMarketIntelAiShape(v: unknown): v is MarketIntelAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.headline !== "string") return false;
  if (!Array.isArray(o.categories) || !Array.isArray(o.watchItems)) return false;
  if (!o.watchItems.every((w) => typeof w === "string")) return false;
  return o.categories.every(
    (c) =>
      c &&
      typeof c === "object" &&
      typeof (c as Record<string, unknown>).category === "string" &&
      typeof (c as Record<string, unknown>).read === "string"
  );
}

function fmtPct(n: number | undefined): string {
  return n === undefined ? "n/a" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function deterministicFallback(ctx: MarketIntelligenceContext): AiMarketIntelligenceResult {
  const categories: AiMarketIntelligenceCategory[] = [
    {
      category: "Macro",
      read: `DXY ${fmtPct(ctx.dxyChangePct)}, Gold ${fmtPct(ctx.goldChangePct)}, Saham ${fmtPct(ctx.stocksChangePct)}.${ctx.nextHighImpactEvent ? ` Event berikutnya: ${ctx.nextHighImpactEvent.title} (${ctx.nextHighImpactEvent.hoursAway.toFixed(0)} jam lagi).` : ""}`,
    },
    {
      category: "Likuiditas",
      read: `Stablecoin supply 24h ${ctx.stablecoinChange24hUsd !== undefined ? `$${(ctx.stablecoinChange24hUsd / 1e6).toFixed(1)}jt` : "tidak tersedia"}.${ctx.etfNetTotalUsd !== undefined ? ` ETF net flow $${(ctx.etfNetTotalUsd / 1e6).toFixed(1)}jt.` : ""}`,
    },
    {
      category: "Whale & Institutional Flow",
      read: `Total transfer whale terpantau $${((ctx.whaleTotalUsd ?? 0) / 1e6).toFixed(1)}jt.`,
    },
    {
      category: "Sentiment",
      read: `Fear & Greed ${ctx.fngValue ?? "n/a"} (${ctx.fngClassification ?? "n/a"}). Mode pasar: ${ctx.sentimentStatus ?? "n/a"} (confidence ${ctx.sentimentConfidence ?? "n/a"}%).`,
    },
  ];
  return {
    headline: `BTC ${fmtPct(ctx.btcChange24h)}, ETH ${fmtPct(ctx.ethChange24h)}, BTC Dominance ${ctx.btcDominance?.toFixed(1) ?? "n/a"}%.`,
    categories,
    watchItems: ctx.nextHighImpactEvent ? [`${ctx.nextHighImpactEvent.title} dalam ${ctx.nextHighImpactEvent.hoursAway.toFixed(0)} jam`] : [],
    meta: nowMeta("fallback"),
  };
}

export async function runAiMarketIntelligence(ctx: MarketIntelligenceContext): Promise<AiMarketIntelligenceResult> {
  if (!isAiCoreConfigured()) return deterministicFallback(ctx);

  const result = await callAiCore<MarketIntelAiShape>({
    systemPrompt: MARKET_INTELLIGENCE_PROMPT,
    data: ctx,
    validate: isMarketIntelAiShape,
  });
  if (!result) return deterministicFallback(ctx);

  return {
    headline: result.data.headline.trim(),
    categories: result.data.categories.slice(0, 8),
    watchItems: result.data.watchItems.slice(0, 6),
    meta: nowMeta("ai", result.provider, result.model),
  };
}
