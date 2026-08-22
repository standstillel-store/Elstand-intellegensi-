import type { JournalWithSignal } from "@/lib/elvoid/types";
import type { TradeReview } from "@/lib/elvoid/review";
import { callAiCore, isAiCoreConfigured } from "../llm";
import { JOURNAL_PROMPT } from "../prompts";
import { nowMeta, type AiJournalResult } from "../types";

// ---------------------------------------------------------------------------
// AI Journal (brief Module 8) — lib/elvoid/review.ts's generateTradeReview()
// already produces a grounded, rule-based verdict/points/mistakes/
// recommendations for a closed trade ("never an LLM guess", per that file's
// own header). This module's job is narrower than it sounds: rewrite that
// same verdict in a warmer, more personal voice for the trader — it is
// handed the rule-based review as its source of truth and told not to
// invent anything beyond it.
// ---------------------------------------------------------------------------

type JournalAiShape = Omit<AiJournalResult, "meta">;

function isJournalAiShape(v: unknown): v is JournalAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.summary === "string" &&
    typeof o.reason === "string" &&
    (o.mistake === null || typeof o.mistake === "string") &&
    (o.strength === null || typeof o.strength === "string") &&
    typeof o.improvement === "string" &&
    typeof o.confidenceNote === "string" &&
    Array.isArray(o.checklist) &&
    o.checklist.every((c) => typeof c === "string")
  );
}

function buildPayload(entry: JournalWithSignal, review: TradeReview) {
  return {
    trade: {
      coin: entry.signal?.coin,
      side: entry.signal?.side,
      strategy: entry.signal?.strategy,
      confidence: entry.signal?.confidence,
      result: entry.result,
      profitPercent: entry.profit_percent,
      rr: entry.rr,
      durationMinutes: entry.duration_minutes,
      notes: entry.notes,
    },
    ruleBasedReview: review,
  };
}

function deterministicFallback(entry: JournalWithSignal, review: TradeReview): AiJournalResult {
  return {
    summary: review.verdict,
    reason: review.points[0] ?? review.mistakes[0] ?? review.verdict,
    mistake: review.mistakes[0] ?? null,
    strength: review.points[0] ?? null,
    improvement: review.recommendations[0] ?? "Pertahankan proses evaluasi trade seperti ini secara konsisten.",
    confidenceNote: entry.signal
      ? `Confidence awal sinyal ini ${entry.signal.confidence}%, hasil akhir ${entry.result}.`
      : "Data confidence awal untuk trade ini tidak tersedia.",
    checklist: review.recommendations.slice(0, 4),
    meta: nowMeta("fallback"),
  };
}

export async function runAiJournal(entry: JournalWithSignal, review: TradeReview): Promise<AiJournalResult> {
  if (!isAiCoreConfigured()) return deterministicFallback(entry, review);

  const result = await callAiCore<JournalAiShape>({
    systemPrompt: JOURNAL_PROMPT,
    data: buildPayload(entry, review),
    validate: isJournalAiShape,
  });
  if (!result) return deterministicFallback(entry, review);

  return {
    summary: result.data.summary.trim(),
    reason: result.data.reason.trim(),
    mistake: result.data.mistake?.trim() || null,
    strength: result.data.strength?.trim() || null,
    improvement: result.data.improvement.trim(),
    confidenceNote: result.data.confidenceNote.trim(),
    checklist: result.data.checklist.slice(0, 5),
    meta: nowMeta("ai", result.provider, result.model),
  };
}
