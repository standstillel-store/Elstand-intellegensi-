import type { PerformanceReport } from "@/lib/elvoid/performance";
import type { JournalWithSignal } from "@/lib/elvoid/types";
import { callAiCore, isAiCoreConfigured } from "../llm";
import { PAPER_TRADING_COACH_PROMPT } from "../prompts";
import { nowMeta, type AiCoachFinding, type AiPaperTradingCoachResult } from "../types";

// ---------------------------------------------------------------------------
// AI Paper Trading Coach (brief Module 7) — recent-trade-focused half of the
// coaching pair (see ../modules/personalCoach.ts for the long-term half).
// Reads lib/elvoid/performance.ts's PerformanceReport plus a handful of the
// most recent journal entries; never diagnoses the person, only describes
// patterns the trade data itself shows (duration, RR, win rate by setup).
// ---------------------------------------------------------------------------

type CoachAiShape = Omit<AiPaperTradingCoachResult, "meta">;

function isCoachAiShape(v: unknown): v is CoachAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.summary !== "string") return false;
  if (!Array.isArray(o.findings) || !Array.isArray(o.recommendations)) return false;
  if (!o.recommendations.every((r) => typeof r === "string")) return false;
  return o.findings.every((f) => {
    if (!f || typeof f !== "object") return false;
    const r = f as Record<string, unknown>;
    return (
      (r.type === "mistake" || r.type === "bias" || r.type === "strength" || r.type === "habit") &&
      typeof r.label === "string" &&
      typeof r.note === "string"
    );
  });
}

function buildPayload(report: PerformanceReport, recentTrades: JournalWithSignal[]) {
  return {
    strategies: report.strategies,
    coins: report.coins,
    setups: report.setups,
    bestStrategy: report.bestStrategy,
    worstStrategy: report.worstStrategy,
    avgHoldMinutes: report.avgHoldMinutes,
    avgConfidence: report.avgConfidence,
    recentTrades: recentTrades.slice(0, 10).map((t) => ({
      coin: t.signal?.coin,
      side: t.signal?.side,
      strategy: t.signal?.strategy,
      confidence: t.signal?.confidence,
      result: t.result,
      profitPercent: t.profit_percent,
      rr: t.rr,
      durationMinutes: t.duration_minutes,
    })),
  };
}

function deterministicFallback(report: PerformanceReport, recentTrades: JournalWithSignal[]): AiPaperTradingCoachResult {
  if (!report.configured || !recentTrades.length) {
    return {
      summary: "Belum ada cukup trade tercatat untuk memberi feedback.",
      findings: [],
      recommendations: ["Mulai catat beberapa trade di Paper Trader agar AI Paper Trading Coach bisa membaca pola."],
      meta: nowMeta("fallback"),
    };
  }

  const findings: AiCoachFinding[] = [];
  if (report.bestStrategy) {
    findings.push({
      type: "strength",
      label: report.bestStrategy.strategy,
      note: `Win rate ${report.bestStrategy.winRate}%, profit factor ${report.bestStrategy.profitFactor} dari ${report.bestStrategy.trades} trade.`,
    });
  }
  if (report.worstStrategy && (!report.bestStrategy || report.worstStrategy.strategy !== report.bestStrategy.strategy)) {
    findings.push({
      type: "mistake",
      label: report.worstStrategy.strategy,
      note: `Win rate ${report.worstStrategy.winRate}% dari ${report.worstStrategy.trades} trade — di bawah setup lain.`,
    });
  }
  const quickLosses = recentTrades.filter((t) => t.result === "loss" && (t.duration_minutes ?? Infinity) < 30);
  if (quickLosses.length >= 2) {
    findings.push({
      type: "bias",
      label: "Pola Stop Loss cepat",
      note: `${quickLosses.length} dari ${recentTrades.length} trade terakhir kena SL dalam <30 menit sejak entry.`,
    });
  }

  return {
    summary: `Ringkasan dari ${recentTrades.length} trade terakhir dan breakdown performa per strategi.`,
    findings,
    recommendations:
      quickLosses.length >= 2
        ? ["Beri jarak SL mengikuti ATR/struktur market, bukan angka bulat, agar tidak mudah kena stop-hunt."]
        : ["Pertahankan konsistensi risk-per-trade dan kriteria entry yang sudah terbukti di setup terbaik."],
    meta: nowMeta("fallback"),
  };
}

export async function runAiPaperTradingCoach(
  report: PerformanceReport,
  recentTrades: JournalWithSignal[]
): Promise<AiPaperTradingCoachResult> {
  if (!isAiCoreConfigured()) return deterministicFallback(report, recentTrades);

  const result = await callAiCore<CoachAiShape>({
    systemPrompt: PAPER_TRADING_COACH_PROMPT,
    data: buildPayload(report, recentTrades),
    validate: isCoachAiShape,
  });
  if (!result) return deterministicFallback(report, recentTrades);

  return {
    summary: result.data.summary.trim(),
    findings: result.data.findings.slice(0, 8),
    recommendations: result.data.recommendations.slice(0, 6),
    meta: nowMeta("ai", result.provider, result.model),
  };
}
