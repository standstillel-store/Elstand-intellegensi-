import type { GeneratedSignal } from "@/lib/elvoid/engine";
import { callAiCore, isAiCoreConfigured } from "../llm";
import { TECHNICAL_ANALYST_PROMPT } from "../prompts";
import { nowMeta, type AiIndicatorNote, type AiTechnicalAnalystResult } from "../types";

// ---------------------------------------------------------------------------
// AI Technical Analyst (brief Module 2) — this engine's "technical data" is
// ICT/SMC-style (market structure, order block, fair value gap, liquidity,
// trend, volume, price action) plus funding/OI/macro/sentiment/MACD, NOT
// classic EMA/RSI/Bollinger/Ichimoku/ADX/ATR/VWAP/OBV (see
// lib/elvoid/scanners.ts) — the prompt is explicit about only narrating
// what's actually in the data so the model never invents an indicator this
// engine doesn't compute.
// ---------------------------------------------------------------------------

type TechnicalAiShape = Omit<AiTechnicalAnalystResult, "meta">;

function isTechnicalAiShape(v: unknown): v is TechnicalAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.summary !== "string" || typeof o.structureNote !== "string") return false;
  if (!Array.isArray(o.indicatorNotes)) return false;
  return o.indicatorNotes.every(
    (n) =>
      n &&
      typeof n === "object" &&
      typeof (n as Record<string, unknown>).key === "string" &&
      typeof (n as Record<string, unknown>).label === "string" &&
      typeof (n as Record<string, unknown>).explanation === "string"
  );
}

function buildPayload(signal: GeneratedSignal) {
  return {
    coin: signal.coin,
    side: signal.side,
    entry: signal.entry,
    idealEntryLow: signal.idealEntryLow,
    idealEntryHigh: signal.idealEntryHigh,
    sl: signal.sl,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    timeframe: signal.timeframe,
    scans: signal.scans.map((s) => ({ key: s.key, label: s.label, bias: s.bias, weight: s.weight, detail: s.detail })),
    extraReasoning: signal.extraReasoning.map((s) => ({ key: s.key, label: s.label, bias: s.bias, weight: s.weight, detail: s.detail })),
  };
}

function deterministicFallback(signal: GeneratedSignal): AiTechnicalAnalystResult {
  const fired = [...signal.scans, ...signal.extraReasoning].filter((s) => s.weight > 0);
  const indicatorNotes: AiIndicatorNote[] = fired.map((s) => ({ key: s.key, label: s.label, explanation: s.detail }));
  return {
    summary: `${fired.length} dari ${signal.scans.length + signal.extraReasoning.length} kategori indikator aktif untuk ${signal.coin} pada timeframe ${signal.timeframe}.`,
    indicatorNotes,
    structureNote: `Ideal Entry Zone ${signal.idealEntryLow} - ${signal.idealEntryHigh}, SL di ${signal.sl}.`,
    meta: nowMeta("fallback"),
  };
}

export async function runAiTechnicalAnalyst(signal: GeneratedSignal): Promise<AiTechnicalAnalystResult> {
  if (!isAiCoreConfigured()) return deterministicFallback(signal);

  const result = await callAiCore<TechnicalAiShape>({
    systemPrompt: TECHNICAL_ANALYST_PROMPT,
    data: buildPayload(signal),
    validate: isTechnicalAiShape,
  });
  if (!result) return deterministicFallback(signal);

  return {
    summary: result.data.summary.trim(),
    indicatorNotes: result.data.indicatorNotes.slice(0, 18),
    structureNote: result.data.structureNote.trim(),
    meta: nowMeta("ai", result.provider, result.model),
  };
}
