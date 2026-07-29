import { CONFLUENCE_FACTOR_KEYS, type GeneratedSignal } from "@/lib/elvoid/engine";
import type { ScanResult } from "@/lib/elvoid/types";
import { callAiCore, isAiCoreConfigured } from "../llm";
import { CONFIDENCE_ENGINE_PROMPT } from "../prompts";
import { nowMeta, type AiConfidenceFactorNote, type AiConfidenceResult } from "../types";

// ---------------------------------------------------------------------------
// AI Confidence Engine (brief Module 4) — Confidence and Trade Grade are
// already fully computed by lib/elvoid/engine.ts's generateSignal(). This
// module never recomputes or overrides either number (both are read back
// off `signal` after the call, never off the model's echo) — its only job
// is explaining, per the same 12 named confluence factors the UI's Signal
// Progress bars already use (see CONFLUENCE_FACTOR_KEYS), why the score
// landed where it did.
// ---------------------------------------------------------------------------

type ConfidenceAiShape = Omit<AiConfidenceResult, "meta" | "confidence" | "grade">;

function isConfidenceAiShape(v: unknown): v is ConfidenceAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.explanation !== "string") return false;
  if (!Array.isArray(o.breakdown)) return false;
  return o.breakdown.every((b) => {
    if (!b || typeof b !== "object") return false;
    const r = b as Record<string, unknown>;
    return (
      typeof r.factor === "string" &&
      (r.contribution === "supports" || r.contribution === "against" || r.contribution === "neutral") &&
      typeof r.note === "string"
    );
  });
}

function classifyFactor(allScans: ScanResult[], side: GeneratedSignal["side"], keys: string[]): { contribution: AiConfidenceFactorNote["contribution"]; matched?: ScanResult } {
  const wanted = side === "LONG" ? "bullish" : "bearish";
  const opposing = side === "LONG" ? "bearish" : "bullish";
  const supporting = allScans.find((s) => keys.includes(s.key) && s.bias === wanted && s.weight > 0);
  if (supporting) return { contribution: "supports", matched: supporting };
  const against = allScans.find((s) => keys.includes(s.key) && s.bias === opposing && s.weight > 0);
  if (against) return { contribution: "against", matched: against };
  return { contribution: "neutral" };
}

function buildPayload(signal: GeneratedSignal) {
  const allScans = [...signal.scans, ...signal.extraReasoning];
  return {
    coin: signal.coin,
    side: signal.side,
    confidence: signal.confidence,
    tradeGrade: signal.tradeGrade,
    confluenceCount: signal.confluenceCount,
    confluenceTotal: signal.confluenceTotal,
    factors: CONFLUENCE_FACTOR_KEYS.map((f) => ({ label: f.label, ...classifyFactor(allScans, signal.side, f.keys) })),
  };
}

function deterministicFallback(signal: GeneratedSignal): AiConfidenceResult {
  const allScans = [...signal.scans, ...signal.extraReasoning];
  const breakdown: AiConfidenceFactorNote[] = CONFLUENCE_FACTOR_KEYS.map((f) => {
    const { contribution, matched } = classifyFactor(allScans, signal.side, f.keys);
    return {
      factor: f.label,
      contribution,
      note: matched ? matched.detail : "Tidak ada data signifikan untuk faktor ini saat ini.",
    };
  });
  return {
    confidence: signal.confidence,
    grade: signal.tradeGrade,
    explanation: `${signal.confluenceCount} dari ${signal.confluenceTotal} faktor confluence searah dengan ${signal.side === "LONG" ? "bullish" : "bearish"} untuk ${signal.coin}, menghasilkan Confidence ${signal.confidence}% (Grade ${signal.tradeGrade}).`,
    breakdown,
    meta: nowMeta("fallback"),
  };
}

export async function runAiConfidenceEngine(signal: GeneratedSignal): Promise<AiConfidenceResult> {
  if (!isAiCoreConfigured()) return deterministicFallback(signal);

  const result = await callAiCore<ConfidenceAiShape>({
    systemPrompt: CONFIDENCE_ENGINE_PROMPT,
    data: buildPayload(signal),
    validate: isConfidenceAiShape,
  });
  if (!result) return deterministicFallback(signal);

  return {
    confidence: signal.confidence, // always the real number
    grade: signal.tradeGrade, // always the real grade
    explanation: result.data.explanation.trim(),
    breakdown: result.data.breakdown.slice(0, 12),
    meta: nowMeta("ai", result.provider, result.model),
  };
}
