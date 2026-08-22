import type { GeneratedSignal } from "@/lib/elvoid/engine";
import { callAiCore, isAiCoreConfigured } from "../llm";
import { SCANNER_PROMPT } from "../prompts";
import { nowMeta, type AiScannerOpportunity, type AiScannerResult } from "../types";

// ---------------------------------------------------------------------------
// AI Scanner (brief Module 3) — lib/elvoid/service.ts's scanWatchlist()
// already runs every symbol through the full engine and sorts by
// Confidence; this module adds the narrated "why these made the cut" layer
// on top of a batch it did NOT choose the members of. The result's
// topOpportunities is always checked against the input coin list after the
// call — a model can drop or reorder candidates, never invent one.
// ---------------------------------------------------------------------------

type ScannerAiShape = Omit<AiScannerResult, "meta">;

function isScannerAiShape(v: unknown): v is ScannerAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.marketRead !== "string") return false;
  if (!Array.isArray(o.topOpportunities)) return false;
  return o.topOpportunities.every(
    (t) =>
      t &&
      typeof t === "object" &&
      typeof (t as Record<string, unknown>).coin === "string" &&
      ((t as Record<string, unknown>).side === "LONG" || (t as Record<string, unknown>).side === "SHORT") &&
      typeof (t as Record<string, unknown>).whyItMadeTheCut === "string"
  );
}

function buildPayload(signals: GeneratedSignal[]) {
  return signals.map((s) => ({
    coin: s.coin,
    side: s.side,
    confidence: s.confidence,
    tradeGrade: s.tradeGrade,
    confluenceCount: s.confluenceCount,
    confluenceTotal: s.confluenceTotal,
    riskLevel: s.riskLevel,
    strategy: s.strategy,
    reason: s.reason,
  }));
}

function deterministicFallback(signals: GeneratedSignal[]): AiScannerResult {
  const top = [...signals]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((s): AiScannerOpportunity => ({ coin: s.coin, side: s.side, whyItMadeTheCut: `${s.strategy} — Confidence ${s.confidence}%, Grade ${s.tradeGrade}, ${s.confluenceCount}/${s.confluenceTotal} confluence.` }));
  return {
    marketRead: `${signals.length} coin discan, ${top.length} teratas ditampilkan berdasarkan Confidence.`,
    topOpportunities: top,
    meta: nowMeta("fallback"),
  };
}

export async function runAiScanner(signals: GeneratedSignal[]): Promise<AiScannerResult> {
  if (!signals.length) {
    return { marketRead: "Tidak ada sinyal pada batch scan ini.", topOpportunities: [], meta: nowMeta("fallback") };
  }
  if (!isAiCoreConfigured()) return deterministicFallback(signals);

  const validCoins = new Set(signals.map((s) => s.coin));
  const result = await callAiCore<ScannerAiShape>({
    systemPrompt: SCANNER_PROMPT,
    data: buildPayload(signals),
    validate: isScannerAiShape,
  });
  if (!result) return deterministicFallback(signals);

  // Defense in depth: drop anything the model hallucinated that wasn't in
  // the actual scanned batch, and re-attach the real `side` from the
  // signal it belongs to rather than trusting the model's copy of it.
  const bySymbol = new Map(signals.map((s) => [s.coin, s]));
  const cleaned = result.data.topOpportunities
    .filter((t) => validCoins.has(t.coin))
    .slice(0, 5)
    .map((t): AiScannerOpportunity => ({ coin: t.coin, side: bySymbol.get(t.coin)!.side, whyItMadeTheCut: t.whyItMadeTheCut.trim() }));

  if (!cleaned.length) return deterministicFallback(signals);

  return {
    marketRead: result.data.marketRead.trim(),
    topOpportunities: cleaned,
    meta: nowMeta("ai", result.provider, result.model),
  };
}
