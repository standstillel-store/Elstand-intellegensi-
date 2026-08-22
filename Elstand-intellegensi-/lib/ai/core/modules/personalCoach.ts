import type { PerformanceReport } from "@/lib/elvoid/performance";
import { callAiCore, isAiCoreConfigured } from "../llm";
import { PERSONAL_COACH_PROMPT } from "../prompts";
import { nowMeta, type AiPersonalCoachResult } from "../types";

// ---------------------------------------------------------------------------
// AI Personal Coach (brief Module 9) — the long-term-history half of the
// coaching pair (see ../modules/paperTradingCoach.ts for the recent-trade
// half). Reads the same PerformanceReport this app's Statistics page
// already computes; riskBehaviorNote/disciplineNote describe TRADING
// patterns (position sizing consistency, hold-time consistency), not a
// psychological read of the person — the prompt is explicit about this
// boundary, see prompts.ts.
// ---------------------------------------------------------------------------

type PersonalCoachAiShape = Omit<AiPersonalCoachResult, "meta">;

function isPersonalCoachAiShape(v: unknown): v is PersonalCoachAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.favoriteSetup === null || typeof o.favoriteSetup === "string") &&
    (o.mostProfitablePattern === null || typeof o.mostProfitablePattern === "string") &&
    (o.worstMistakePattern === null || typeof o.worstMistakePattern === "string") &&
    typeof o.riskBehaviorNote === "string" &&
    typeof o.disciplineNote === "string" &&
    Array.isArray(o.coachingPlan) &&
    o.coachingPlan.every((c) => typeof c === "string")
  );
}

function buildPayload(report: PerformanceReport) {
  return {
    strategies: report.strategies,
    coins: report.coins,
    setups: report.setups,
    bestStrategy: report.bestStrategy,
    worstStrategy: report.worstStrategy,
    bestCoin: report.bestCoin,
    worstCoin: report.worstCoin,
    bestSetup: report.bestSetup,
    monthly: report.monthly,
    avgHoldMinutes: report.avgHoldMinutes,
    avgConfidence: report.avgConfidence,
  };
}

function deterministicFallback(report: PerformanceReport): AiPersonalCoachResult {
  if (!report.configured) {
    return {
      favoriteSetup: null,
      mostProfitablePattern: null,
      worstMistakePattern: null,
      riskBehaviorNote: "Belum ada data trade yang cukup.",
      disciplineNote: "Belum ada data trade yang cukup.",
      coachingPlan: ["Mulai catat trade di Paper Trader untuk membentuk coaching plan yang lebih spesifik."],
      meta: nowMeta("fallback"),
    };
  }
  return {
    favoriteSetup: report.bestSetup?.setup ?? null,
    mostProfitablePattern: report.bestStrategy
      ? `${report.bestStrategy.strategy} (profit factor ${report.bestStrategy.profitFactor}, ${report.bestStrategy.trades} trade)`
      : null,
    worstMistakePattern: report.worstStrategy
      ? `${report.worstStrategy.strategy} (win rate ${report.worstStrategy.winRate}%)`
      : null,
    riskBehaviorNote:
      report.avgConfidence !== null
        ? `Rata-rata Confidence sinyal yang dieksekusi: ${report.avgConfidence}%.`
        : "Belum cukup data Confidence untuk dibaca sebagai pola.",
    disciplineNote:
      report.avgHoldMinutes !== null
        ? `Rata-rata durasi hold posisi: ${Math.round(report.avgHoldMinutes)} menit.`
        : "Belum cukup data durasi trade untuk dibaca sebagai pola.",
    coachingPlan: report.worstStrategy
      ? [
          `Kurangi frekuensi entry pada setup "${report.worstStrategy.strategy}" sampai win rate-nya membaik.`,
          "Fokuskan eksekusi pada setup dengan profit factor tertinggi yang sudah terbukti.",
        ]
      : ["Kumpulkan lebih banyak data trade untuk membentuk coaching plan yang lebih spesifik."],
    meta: nowMeta("fallback"),
  };
}

export async function runAiPersonalCoach(report: PerformanceReport): Promise<AiPersonalCoachResult> {
  if (!isAiCoreConfigured()) return deterministicFallback(report);

  const result = await callAiCore<PersonalCoachAiShape>({
    systemPrompt: PERSONAL_COACH_PROMPT,
    data: buildPayload(report),
    validate: isPersonalCoachAiShape,
  });
  if (!result) return deterministicFallback(report);

  return {
    favoriteSetup: result.data.favoriteSetup?.trim() || null,
    mostProfitablePattern: result.data.mostProfitablePattern?.trim() || null,
    worstMistakePattern: result.data.worstMistakePattern?.trim() || null,
    riskBehaviorNote: result.data.riskBehaviorNote.trim(),
    disciplineNote: result.data.disciplineNote.trim(),
    coachingPlan: result.data.coachingPlan.slice(0, 6),
    meta: nowMeta("ai", result.provider, result.model),
  };
}
