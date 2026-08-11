import { NextResponse } from "next/server";
import { buildScanContext, buildSignalForSymbol } from "@/lib/elvoid/service";
import { listSignals, insertSignal } from "@/lib/elvoid/signals";
import type { SignalStatus } from "@/lib/elvoid/types";
import type { GeneratedSignal } from "@/lib/elvoid/engine";
import { reserveEnergy, settleEnergy } from "@/lib/energyGate";
import { executeSignal, gradeMeetsThreshold, AUTO_EXECUTE_MIN_GRADE } from "@/lib/elvoid/paperTrader";
import { runAiOracle, runAiTechnicalAnalyst, runAiConfidenceEngine, isAiCoreConfigured } from "@/lib/ai/core/router";

// Phase: AI CORE ENGINE — opt-in only (POST body `includeAiReasoning: true`).
// Runs Oracle + Technical Analyst + Confidence Engine in parallel and
// attaches the result as `aiReasoning` on the response; every existing
// caller that omits the flag gets byte-for-byte the same response as
// before this phase. Metered separately from "generate_signal" (its own
// "ai_reasoning" cost, see lib/energy.ts) and only actually charged when at
// least one module really ran on an LLM — if every module fell back to its
// deterministic result (AI not configured, or every provider attempt
// failed), the reservation is refunded rather than charged, since the
// feature the user asked for didn't actually happen.
async function attachAiReasoning(generated: GeneratedSignal) {
  if (!isAiCoreConfigured()) return null;
  const gate = await reserveEnergy("ai_reasoning");
  if (!gate.ok) return null; // insufficient AI Energy — degrade silently, still return the base signal

  const [oracle, technicalAnalyst, confidenceEngine] = await Promise.all([
    runAiOracle(generated),
    runAiTechnicalAnalyst(generated),
    runAiConfidenceEngine(generated),
  ]);
  const usedRealAi = [oracle.meta.source, technicalAnalyst.meta.source, confidenceEngine.meta.source].some((s) => s === "ai");
  if (gate.reservation) await settleEnergy(gate.reservation, usedRealAi);
  return { oracle, technicalAnalyst, confidenceEngine };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status = statusParam
    ? ((statusParam.includes(",") ? statusParam.split(",") : statusParam) as SignalStatus | SignalStatus[])
    : undefined;
  const limit = Number(searchParams.get("limit") ?? 50);
  const signals = await listSignals({ status, limit });
  return NextResponse.json({ signals });
}

// Phase 3.2: gated as "Generate AI Signal" (-4 AI Energy). "Berhasil" means
// a signal object actually came out the other end (persisted or not — the
// no-Supabase fallback below still counts, the user got a real signal);
// "gagal" is the 404 (no candle data) or the catch-all below, both of which
// refund immediately so the brief's "jika gagal jangan mengurangi Energy"
// holds exactly. Never blocks unmetered/anonymous callers — same convention
// as every other optional-auth route in this app.
export async function POST(req: Request) {
  let body: { coin?: string; timeframe?: string; includeAiReasoning?: boolean };
  try {
    body = (await req.json()) as { coin?: string; timeframe?: string; includeAiReasoning?: boolean };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  const coin = (body.coin ?? "").trim();
  if (!coin) return NextResponse.json({ error: "Sertakan simbol coin, misalnya BTC." }, { status: 400 });
  const timeframe = body.timeframe ?? "4h";
  const includeAiReasoning = body.includeAiReasoning === true;

  const gate = await reserveEnergy("generate_signal");
  if (!gate.ok) return gate.response;

  try {
    const ctx = await buildScanContext();
    const generated = await buildSignalForSymbol(coin, ctx, timeframe);
    if (!generated) {
      if (gate.reservation) await settleEnergy(gate.reservation, false);
      return NextResponse.json(
        { error: `Data candle untuk ${coin.toUpperCase()} tidak tersedia saat ini — coba simbol lain.` },
        { status: 404 }
      );
    }
    const aiReasoning = includeAiReasoning ? await attachAiReasoning(generated) : null;
    const saved = await insertSignal(generated);
    if (saved) {
      // Auto-execute: always on (hardcoded, see AUTO_EXECUTE_MIN_GRADE in lib/elvoid/paperTrader.ts).
      let autoExecuted = false;
      if (saved.trade_grade && gradeMeetsThreshold(saved.trade_grade, AUTO_EXECUTE_MIN_GRADE)) {
        const result = await executeSignal(saved.id, "market");
        autoExecuted = !("error" in result);
      }
      if (gate.reservation) await settleEnergy(gate.reservation, true);
      return NextResponse.json({ signal: saved, persisted: true, autoExecuted, ...(aiReasoning ? { aiReasoning } : {}) });
    }

    // Supabase not configured — still return the freshly generated signal so
    // the AI Signal page keeps working, just without persistence. Still a
    // real, successful signal from the user's point of view — charged.
    if (gate.reservation) await settleEnergy(gate.reservation, true);
    return NextResponse.json({
      signal: {
        ...generated,
        extra_reasoning: generated.extraReasoning,
        trade_grade: generated.tradeGrade,
        probability_tp: generated.probabilityTp,
        probability_sl: generated.probabilitySl,
        order_type: "market" as const,
        id: `local-${Date.now()}`,
        status: "new",
        created_at: new Date().toISOString(),
      },
      persisted: false,
      ...(aiReasoning ? { aiReasoning } : {}),
    });
  } catch (err) {
    console.error("[ElVoid AI] signal generation error:", err);
    if (gate.reservation) await settleEnergy(gate.reservation, false);
    return NextResponse.json({ error: "Gagal menghasilkan sinyal saat ini — coba lagi sebentar." }, { status: 500 });
  }
}
