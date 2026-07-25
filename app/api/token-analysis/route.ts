import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/snapshot";
import { getCoinReportData } from "@/lib/analysis";

// Powers the mobile "Token Analyzer" widget. Reuses the exact same snapshot
// and lookup logic as the AI chat dock's "analisa <SYMBOL>" flow — same
// data, same scoring, just returned as structured JSON instead of markdown.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 30);

  if (!q) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  try {
    const snapshot = await getSnapshot();
    const report = getCoinReportData(q, snapshot);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[ElVoid AI] token-analysis error:", err);
    return NextResponse.json({ error: "analysis_failed" }, { status: 502 });
  }
}
