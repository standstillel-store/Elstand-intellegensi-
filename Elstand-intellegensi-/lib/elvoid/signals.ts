import { getSupabase } from "../supabase";
import type { AiSignal, SignalStatus } from "./types";
import type { GeneratedSignal } from "./engine";

function toRow(signal: GeneratedSignal) {
  return {
    coin: signal.coin,
    side: signal.side,
    entry: signal.entry,
    sl: signal.sl,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    timeframe: signal.timeframe,
    confidence: signal.confidence,
    risk_percent: signal.risk_percent,
    reason: signal.reason,
    strategy: signal.strategy,
    scans: signal.scans,
    extra_reasoning: signal.extraReasoning,
    trade_grade: signal.tradeGrade,
    probability_tp: signal.probabilityTp,
    probability_sl: signal.probabilitySl,
    confluence_count: signal.confluenceCount,
    confluence_total: signal.confluenceTotal,
    ideal_entry_low: signal.idealEntryLow,
    ideal_entry_high: signal.idealEntryHigh,
    expected_duration: signal.expectedDuration,
    confirmation_status: signal.confirmationStatus,
    confirmation_zone_ok: signal.confirmationZoneOk,
    status: "new" as const,
  };
}

export async function listSignals(opts: { status?: SignalStatus | SignalStatus[]; limit?: number } = {}): Promise<AiSignal[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let query = sb
    .from("ai_signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.status) {
    query = Array.isArray(opts.status) ? query.in("status", opts.status) : query.eq("status", opts.status);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[ElVoid AI] listSignals error:", error.message);
    return [];
  }
  return (data ?? []) as AiSignal[];
}

export async function insertSignal(signal: GeneratedSignal): Promise<AiSignal | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("ai_signals").insert(toRow(signal)).select().single();
  if (error) {
    console.error("[ElVoid AI] insertSignal error:", error.message);
    return null;
  }
  return data as AiSignal;
}

export async function insertSignals(signals: GeneratedSignal[]): Promise<AiSignal[]> {
  const sb = getSupabase();
  if (!sb || !signals.length) return [];
  const { data, error } = await sb.from("ai_signals").insert(signals.map(toRow)).select();
  if (error) {
    console.error("[ElVoid AI] insertSignals error:", error.message);
    return [];
  }
  return (data ?? []) as AiSignal[];
}
