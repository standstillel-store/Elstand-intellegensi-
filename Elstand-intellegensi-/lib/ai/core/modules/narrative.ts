import { callAiCore, isAiCoreConfigured } from "../llm";
import { NARRATIVE_PROMPT } from "../prompts";
import { nowMeta, type AiNarrativeResult, type MarketIntelligenceContext } from "../types";

// ---------------------------------------------------------------------------
// AI Narrative (brief Module 5's literal ask: "Generate one concise
// institutional market narrative") — same input as Market Intelligence, but
// the output is deliberately just one flowing paragraph instead of a
// category breakdown, for a UI spot (or chat reply) that wants a single
// quotable line rather than a structured card.
// ---------------------------------------------------------------------------

type NarrativeAiShape = Omit<AiNarrativeResult, "meta">;

function isNarrativeAiShape(v: unknown): v is NarrativeAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.narrative === "string" && o.narrative.trim().length > 0;
}

function fmtPct(n: number | undefined): string {
  return n === undefined ? "belum tersedia" : `${n >= 0 ? "naik" : "turun"} ${Math.abs(n).toFixed(2)}%`;
}

function deterministicFallback(ctx: MarketIntelligenceContext): AiNarrativeResult {
  const narrative =
    `BTC ${fmtPct(ctx.btcChange24h)} dalam 24 jam terakhir, dengan BTC Dominance di ${ctx.btcDominance?.toFixed(1) ?? "n/a"}%. ` +
    `Fear & Greed Index berada di ${ctx.fngValue ?? "n/a"} (${ctx.fngClassification ?? "n/a"}), mencerminkan mode pasar ${ctx.sentimentStatus ?? "netral"}. ` +
    `${ctx.nextHighImpactEvent ? `Event makro berikutnya yang perlu dipantau adalah ${ctx.nextHighImpactEvent.title}, sekitar ${ctx.nextHighImpactEvent.hoursAway.toFixed(0)} jam lagi. ` : ""}` +
    `Ini adalah pembacaan kondisi pasar, bukan sinyal beli/jual.`;
  return { narrative, meta: nowMeta("fallback") };
}

export async function runAiNarrative(ctx: MarketIntelligenceContext): Promise<AiNarrativeResult> {
  if (!isAiCoreConfigured()) return deterministicFallback(ctx);

  const result = await callAiCore<NarrativeAiShape>({
    systemPrompt: NARRATIVE_PROMPT,
    data: ctx,
    validate: isNarrativeAiShape,
    maxTokens: 400,
  });
  if (!result) return deterministicFallback(ctx);

  return { narrative: result.data.narrative.trim(), meta: nowMeta("ai", result.provider, result.model) };
}
