import { NextResponse } from "next/server";
import { reserveEnergy, settleEnergy } from "@/lib/energyGate";
import { runAiMarketIntelligence, runAiNarrative, buildMarketIntelligenceContext } from "@/lib/ai/core/router";

// Phase: AI CORE ENGINE — new, additive route (no existing route touched).
// ?mode=intelligence -> category breakdown only, ?mode=narrative -> one
// paragraph only, ?mode=both (default) -> both, computed from one shared
// context fetch. Gated as "ai_market_intelligence" once per request
// regardless of how many of the two modes are requested, charged only when
// at least one of them actually used a real LLM.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "both";
  if (!["intelligence", "narrative", "both"].includes(mode)) {
    return NextResponse.json({ error: "mode harus salah satu dari: intelligence, narrative, both." }, { status: 400 });
  }

  const gate = await reserveEnergy("ai_market_intelligence");
  if (!gate.ok) return gate.response;

  try {
    const ctx = await buildMarketIntelligenceContext();
    const [marketIntelligence, narrative] = await Promise.all([
      mode !== "narrative" ? runAiMarketIntelligence(ctx) : null,
      mode !== "intelligence" ? runAiNarrative(ctx) : null,
    ]);
    const usedRealAi = [marketIntelligence?.meta.source, narrative?.meta.source].some((s) => s === "ai");
    if (gate.reservation) await settleEnergy(gate.reservation, usedRealAi);
    return NextResponse.json({
      ...(marketIntelligence ? { marketIntelligence } : {}),
      ...(narrative ? { narrative } : {}),
    });
  } catch (err) {
    console.error("[ElVoid AI] ai-market-intelligence error:", err);
    if (gate.reservation) await settleEnergy(gate.reservation, false);
    return NextResponse.json({ error: "Gagal mengambil market intelligence — coba lagi sebentar." }, { status: 500 });
  }
}
