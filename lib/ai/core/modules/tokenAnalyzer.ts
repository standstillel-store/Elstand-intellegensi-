import type { CoinReport } from "@/lib/analysis";
import { callAiCore, isAiCoreConfigured } from "../llm";
import { TOKEN_ANALYZER_PROMPT } from "../prompts";
import { nowMeta, type AiTokenAnalyzerResult } from "../types";

// ---------------------------------------------------------------------------
// AI Token Analyzer (brief Module 6) — reads lib/analysis.ts's CoinReport,
// the same data the Token Analyzer widget already shows. CoinReport.holders
// and .nextUnlock are deliberately `null` in this codebase today ("this app
// has no on-chain holder-count or vesting-schedule provider configured" —
// see that file) — this module surfaces that honestly via
// unavailableChecks instead of ever inventing a holder count, audit
// status, or treasury wallet the underlying data doesn't have.
// ---------------------------------------------------------------------------

type TokenAnalyzerAiShape = Omit<AiTokenAnalyzerResult, "meta">;

function isTokenAnalyzerAiShape(v: unknown): v is TokenAnalyzerAiShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.healthSummary === "string" &&
    Array.isArray(o.strengths) &&
    o.strengths.every((s) => typeof s === "string") &&
    Array.isArray(o.concerns) &&
    o.concerns.every((s) => typeof s === "string") &&
    Array.isArray(o.unavailableChecks) &&
    o.unavailableChecks.every((s) => typeof s === "string")
  );
}

function standardUnavailableChecks(report: CoinReport): string[] {
  const checks: string[] = [];
  if (report.holders === null) checks.push("Holder distribution");
  if (report.nextUnlock === null) checks.push("Unlock schedule");
  // Never wired to any data source in this codebase at all (no
  // lib/*.ts provider exists for these) — always listed as unavailable.
  checks.push("Audit status", "Developer wallet", "Treasury wallet");
  return checks;
}

function buildPayload(report: CoinReport) {
  return {
    symbol: report.symbol,
    name: report.name,
    price: report.price,
    change24h: report.change24h,
    marketCap: report.marketCap,
    marketCapRank: report.marketCapRank,
    volume24h: report.volume24h,
    whale: report.whale,
    risk: report.risk,
    momentum: report.momentum,
    onchain: report.onchain,
    dumpScore: report.dumpScore,
    smartMoneyScore: report.smartMoneyScore,
    holders: report.holders,
    nextUnlock: report.nextUnlock,
  };
}

function deterministicFallback(report: CoinReport): AiTokenAnalyzerResult {
  if (!report.found) {
    return {
      healthSummary: `Token "${report.query}" tidak ditemukan di data yang dipantau saat ini.`,
      strengths: [],
      concerns: [],
      unavailableChecks: standardUnavailableChecks(report),
      meta: nowMeta("fallback"),
    };
  }
  const strengths: string[] = [];
  const concerns: string[] = [...report.risk.flags];
  if (report.whale.count > 0) strengths.push(report.whale.text);
  if (!report.risk.score) strengths.push("Tidak ada red flag rugpull terdeteksi dari data DEX saat ini.");
  return {
    healthSummary: report.conclusion || report.aiAnalysis.summary,
    strengths,
    concerns,
    unavailableChecks: standardUnavailableChecks(report),
    meta: nowMeta("fallback"),
  };
}

export async function runAiTokenAnalyzer(report: CoinReport): Promise<AiTokenAnalyzerResult> {
  if (!report.found || !isAiCoreConfigured()) return deterministicFallback(report);

  const result = await callAiCore<TokenAnalyzerAiShape>({
    systemPrompt: TOKEN_ANALYZER_PROMPT,
    data: buildPayload(report),
    validate: isTokenAnalyzerAiShape,
  });
  if (!result) return deterministicFallback(report);

  // Defense in depth: the standard "no data source for this" list is
  // computed here, not trusted from the model, so it can never be talked
  // out of flagging holders/unlock as unavailable when they're genuinely null.
  const mustFlag = standardUnavailableChecks(report);
  const modelFlagged = result.data.unavailableChecks.map((s) => s.trim()).filter(Boolean);
  const unavailableChecks = [...new Set([...mustFlag, ...modelFlagged])];

  return {
    healthSummary: result.data.healthSummary.trim(),
    strengths: result.data.strengths.slice(0, 6),
    concerns: result.data.concerns.slice(0, 6),
    unavailableChecks,
    meta: nowMeta("ai", result.provider, result.model),
  };
}
