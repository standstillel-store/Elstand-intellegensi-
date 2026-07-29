import type { GeneratedSignal } from "@/lib/elvoid/engine";
import type { ScanResult } from "@/lib/elvoid/types";
import { callAiCore, isAiCoreConfigured } from "../llm";
import { ORACLE_PROMPT } from "../prompts";
import { nowMeta, type AiOracleResult } from "../types";

// ---------------------------------------------------------------------------
// AI Oracle (brief Module 1) — takes a signal ElVoid AI's rule-based engine
// (lib/elvoid/engine.ts) already produced and explains WHY in flowing
// language. Never re-derives side/confidence itself: `bias`/`confidence` in
// the result are always read back off the signal, never off what the model
// returned (defense in depth — the prompt already tells it not to touch
// these, but a numeric field a trader might act on is not something to
// trust an LLM to copy correctly 100% of the time).
// ---------------------------------------------------------------------------

type OracleAiShape = Omit<AiOracleResult, "meta" | "confidence">;

function isOracleAiShape(v: unknown): v is OracleAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.bias === "bullish" || o.bias === "neutral" || o.bias === "bearish") &&
    typeof o.narrative === "string" &&
    o.narrative.trim().length > 0 &&
    Array.isArray(o.keyDrivers) &&
    o.keyDrivers.every((x) => typeof x === "string") &&
    typeof o.caution === "string"
  );
}

function firingFactors(signal: GeneratedSignal): ScanResult[] {
  const wanted = signal.side === "LONG" ? "bullish" : "bearish";
  return [...signal.scans, ...signal.extraReasoning].filter((s) => s.bias === wanted && s.weight > 0);
}

function buildPayload(signal: GeneratedSignal) {
  return {
    coin: signal.coin,
    side: signal.side,
    entry: signal.entry,
    sl: signal.sl,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    confidence: signal.confidence,
    tradeGrade: signal.tradeGrade,
    riskLevel: signal.riskLevel,
    confluenceCount: signal.confluenceCount,
    confluenceTotal: signal.confluenceTotal,
    confirmationStatus: signal.confirmationStatus,
    expectedDuration: signal.expectedDuration,
    scans: signal.scans.map((s) => ({ key: s.key, label: s.label, bias: s.bias, weight: s.weight, detail: s.detail })),
    extraReasoning: signal.extraReasoning.map((s) => ({ key: s.key, label: s.label, bias: s.bias, weight: s.weight, detail: s.detail })),
  };
}

function deterministicFallback(signal: GeneratedSignal): AiOracleResult {
  const bias: AiOracleResult["bias"] = signal.side === "LONG" ? "bullish" : "bearish";
  const drivers = firingFactors(signal)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((s) => `${s.label}: ${s.detail}`);
  return {
    bias,
    confidence: signal.confidence,
    narrative: signal.reason,
    keyDrivers: drivers,
    caution: `Risk level saat ini ${signal.riskLevel.toUpperCase()} — invalidasi utama adalah harga menembus Stop Loss di ${signal.sl}.`,
    meta: nowMeta("fallback"),
  };
}

export async function runAiOracle(signal: GeneratedSignal): Promise<AiOracleResult> {
  if (!isAiCoreConfigured()) return deterministicFallback(signal);

  const result = await callAiCore<OracleAiShape>({
    systemPrompt: ORACLE_PROMPT,
    data: buildPayload(signal),
    validate: isOracleAiShape,
  });
  if (!result) return deterministicFallback(signal);

  return {
    bias: result.data.bias,
    confidence: signal.confidence, // always the real number, never the model's echo of it
    narrative: result.data.narrative.trim(),
    keyDrivers: result.data.keyDrivers.slice(0, 5),
    caution: result.data.caution.trim(),
    meta: nowMeta("ai", result.provider, result.model),
  };
}
