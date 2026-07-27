import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/snapshot";
import { getCoinReportData } from "@/lib/analysis";
import { reserveEnergy, settleEnergy } from "@/lib/energyGate";

// Powers the mobile "Token Analyzer" widget. Reuses the exact same snapshot
// and lookup logic as the AI chat dock's "analisa <SYMBOL>" flow — same
// data, same scoring, just returned as structured JSON instead of markdown.
//
// Phase 3.2: gated as "Analyze Coin" (-2 AI Energy). A "coin not found"
// result (found: false, but still a real, complete CoinReport) still counts
// as a successful use of the feature and is charged — the engine did its
// job and gave a real answer. Only a thrown exception (the existing 502
// path below) is treated as a failure and refunded, same principle as the
// other two gated routes. Anonymous/no-Supabase requests are unmetered, not
// blocked — unchanged behavior for a feature that's never required login.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 30);

  if (!q) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  const gate = await reserveEnergy("analyze_coin");
  if (!gate.ok) return gate.response;

  try {
    const snapshot = await getSnapshot();
    const report = getCoinReportData(q, snapshot);
    if (gate.reservation) await settleEnergy(gate.reservation, true);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[ElVoid AI] token-analysis error:", err);
    if (gate.reservation) await settleEnergy(gate.reservation, false);
    return NextResponse.json({ error: "analysis_failed" }, { status: 502 });
  }
}
