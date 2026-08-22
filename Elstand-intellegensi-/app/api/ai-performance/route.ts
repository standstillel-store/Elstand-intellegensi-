import { NextResponse } from "next/server";
import { getPerformanceReport, getJournalEntries } from "@/lib/elvoid/performance";
import { reserveEnergy, settleEnergy } from "@/lib/energyGate";
import { runAiPaperTradingCoach, runAiPersonalCoach, isAiCoreConfigured } from "@/lib/ai/core/router";
import type { PerformanceReport } from "@/lib/elvoid/performance";

// Phase: AI CORE ENGINE — opt-in only (?ai=1). This route had no AI Energy
// gate before this phase (a pure re-aggregation read, see
// lib/elvoid/performance.ts's own header) and still doesn't for the base
// report — only the new aiCoach add-on is metered, and only when actually
// requested. Same "only charge if AI actually ran" rule as the other
// AI-reasoning integrations.
async function attachAiCoach(report: PerformanceReport) {
  if (!report.configured || !isAiCoreConfigured()) return null;
  const gate = await reserveEnergy("ai_coach");
  if (!gate.ok) return null;

  const recentTrades = await getJournalEntries(10);
  const [paperTradingCoach, personalCoach] = await Promise.all([
    runAiPaperTradingCoach(report, recentTrades),
    runAiPersonalCoach(report),
  ]);
  const usedRealAi = paperTradingCoach.meta.source === "ai" || personalCoach.meta.source === "ai";
  if (gate.reservation) await settleEnergy(gate.reservation, usedRealAi);
  return { paperTradingCoach, personalCoach };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wantsAi = searchParams.get("ai") === "1";

  const report = await getPerformanceReport();
  const aiCoach = wantsAi ? await attachAiCoach(report) : null;
  return NextResponse.json({ ...report, ...(aiCoach ? { aiCoach } : {}) });
}
