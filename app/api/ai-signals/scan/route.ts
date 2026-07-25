import { NextResponse } from "next/server";
import { scanWatchlist } from "@/lib/elvoid/service";
import { insertSignals } from "@/lib/elvoid/signals";
import { getWallet, executeSignal, gradeMeetsThreshold } from "@/lib/elvoid/paperTrader";
import type { AiSignal } from "@/lib/elvoid/types";

/** AI auto-execute: opt-in via Settings. Only fires for freshly-persisted signals — never for the unsaved-fallback path (no Supabase, nothing to track anyway). */
async function autoExecuteQualifying(saved: AiSignal[]): Promise<string[]> {
  const wallet = await getWallet();
  if (!wallet?.auto_execute) return [];
  const executedIds: string[] = [];
  for (const signal of saved) {
    if (!signal.trade_grade || !gradeMeetsThreshold(signal.trade_grade, wallet.auto_execute_min_grade)) continue;
    const result = await executeSignal(signal.id, "market");
    if (!("error" in result)) executedIds.push(signal.id);
  }
  return executedIds;
}

export async function POST() {
  try {
    const generated = await scanWatchlist();
    const saved = await insertSignals(generated);
    if (saved.length) {
      const autoExecuted = await autoExecuteQualifying(saved);
      return NextResponse.json({ signals: saved, persisted: true, autoExecuted });
    }

    // Supabase not configured — return the freshly generated batch unsaved.
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
    });
  } catch (err) {
    console.error("[ElVoid AI] scan error:", err);
    return NextResponse.json({ error: "Scan market gagal — coba lagi sebentar." }, { status: 500 });
  }
}
