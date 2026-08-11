import { NextResponse } from "next/server";
import { scanWatchlist } from "@/lib/elvoid/service";
import { insertSignals } from "@/lib/elvoid/signals";
import { executeSignal, AUTO_EXECUTE_ALL_GRADES } from "@/lib/elvoid/paperTrader";
import type { AiSignal } from "@/lib/elvoid/types";
import type { GeneratedSignal } from "@/lib/elvoid/engine";
import { reserveEnergy, settleEnergy } from "@/lib/energyGate";
import { runAiScanner, isAiCoreConfigured } from "@/lib/ai/core/router";

// Phase: AI CORE ENGINE — opt-in only (POST body `{ "includeAiReasoning": true }`).
// Same "only charge if AI actually ran" rule as the other two AI-reasoning
// integrations — see app/api/ai-signals/route.ts's attachAiReasoning() for
// the full explanation.
async function attachAiScanner(generated: GeneratedSignal[]) {
  if (!isAiCoreConfigured() || !generated.length) return null;
  const gate = await reserveEnergy("ai_scanner_reasoning");
  if (!gate.ok) return null;

  const aiScanner = await runAiScanner(generated);
  if (gate.reservation) await settleEnergy(gate.reservation, aiScanner.meta.source === "ai");
  return aiScanner;
}

/** AI auto-execute: always on, every grade (hardcoded, see AUTO_EXECUTE_ALL_GRADES). Only fires for freshly-persisted signals — never for the unsaved-fallback path (no Supabase, nothing to track anyway). */
async function autoExecuteQualifying(saved: AiSignal[]): Promise<string[]> {
  if (!AUTO_EXECUTE_ALL_GRADES) return [];
  const executedIds: string[] = [];
  for (const signal of saved) {
    const result = await executeSignal(signal.id, "market");
    if (!("error" in result)) executedIds.push(signal.id);
  }
  return executedIds;
}

// Phase 3.2: gated as "Market Scanner / Token Screener" (-4 AI Energy).
// Reserved before the actual scan runs; settled true on every path that
// returns a real batch of signals (persisted or the no-Supabase fallback),
// false (refund) only if scanWatchlist/insertSignals throws.
export async function POST(req: Request) {
  let includeAiReasoning = false;
  try {
    const body = (await req.json()) as { includeAiReasoning?: boolean } | null;
    includeAiReasoning = body?.includeAiReasoning === true;
  } catch {
    // No body (or invalid JSON) is the existing, expected shape for every
    // caller before this phase — just means the flag is off.
  }

  const gate = await reserveEnergy("market_scanner");
  if (!gate.ok) return gate.response;

  try {
    const generated = await scanWatchlist();
    const aiScanner = includeAiReasoning ? await attachAiScanner(generated) : null;
    const saved = await insertSignals(generated);
    if (saved.length) {
      const autoExecuted = await autoExecuteQualifying(saved);
      if (gate.reservation) await settleEnergy(gate.reservation, true);
      return NextResponse.json({ signals: saved, persisted: true, autoExecuted, ...(aiScanner ? { aiScanner } : {}) });
    }

    // Supabase not configured — return the freshly generated batch unsaved.
    if (gate.reservation) await settleEnergy(gate.reservation, true);
    return NextResponse.json({
      signals: generated.map((s, i) => ({
        ...s,
        extra_reasoning: s.extraReasoning,
        trade_grade: s.tradeGrade,
        probability_tp: s.probabilityTp,
        probability_sl: s.probabilitySl,
        confluence_count: s.confluenceCount,
        confluence_total: s.confluenceTotal,
        ideal_entry_low: s.idealEntryLow,
        ideal_entry_high: s.idealEntryHigh,
        expected_duration: s.expectedDuration,
        confirmation_status: s.confirmationStatus,
        confirmation_zone_ok: s.confirmationZoneOk,
        order_type: "market" as const,
        id: `local-${Date.now()}-${i}`,
        status: "new" as const,
        created_at: new Date().toISOString(),
      })),
      persisted: false,
      ...(aiScanner ? { aiScanner } : {}),
    });
  } catch (err) {
    console.error("[ElVoid AI] scan error:", err);
    if (gate.reservation) await settleEnergy(gate.reservation, false);
    return NextResponse.json({ error: "Scan market gagal — coba lagi sebentar." }, { status: 500 });
  }
}
