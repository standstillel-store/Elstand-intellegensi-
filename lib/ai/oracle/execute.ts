// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Execute Signal -> PaperTrade -> AI Performance (Phase 5)
//
// Deliberately thin. The entire "new -> open/pending -> tp1_hit -> closed"
// lifecycle, wallet math, and idempotency-by-status already exist in
// lib/elvoid/paperTrader.ts's executeSignal() / evaluateOpenTrades() /
// evaluatePendingOrders() / recomputeStatistics() — none of that is
// duplicated here. This file's only job is:
//
//   OracleAssessment (+ OracleRiskPlan)
//         -> one ai_signals row, tagged source=ELVOID_PRO_ORACLE, premium=true
//         -> paperTrader.executeSignal(row.id)   <-- the exact same function
//                                                     every normal AI Signal
//                                                     already goes through
//
// Duplicate-click protection is two-layered:
//  1. oracle_signal_id is a deterministic hash of the assessment's own
//     symbol+timestamp+side+grade (see buildOracleSignalId) with a UNIQUE
//     DB index (supabase/migrations/2026-08-oracle-premium.sql) — a second
//     insert attempt for the identical assessment finds the existing row
//     instead of creating a new one.
//  2. Once that row exists, paperTrader.executeSignal() itself already
//     refuses to re-execute anything whose status isn't "new" — so a second
//     Execute click against an already-open premium trade gets the same
//     "sudah dieksekusi" error a normal signal would.
// ---------------------------------------------------------------------------

import { getSupabase } from "../../supabase";
import { executeSignal as executeExistingSignal } from "../../elvoid/paperTrader";
import type { AiSignal, OrderType } from "../../elvoid/types";
import type { OracleAssessment, OracleRiskPlan } from "./gradingTypes";
import { detectPatterns } from "./insight";
import type { ConfluenceResult } from "./confluenceTypes";
import { captureDecisionExperience } from "../decisionOutcome/repository";
import type { LearningContextSnapshot } from "../decisionOutcome/contracts";

export interface ExecuteOracleSignalResult {
  success: true;
  signalId: string;
  source: "ELVOID_PRO_ORACLE";
  grade: OracleAssessment["grade"];
  paperTradeId: string;
  premium: true;
  alreadyExecuted: boolean;
}
export interface ExecuteOracleSignalError {
  success: false;
  error: string;
}

/**
 * Deterministic id for one Oracle assessment "moment" — same symbol, same
 * generation timestamp (to the second), same side, same grade always hash
 * to the same id. Re-running the Oracle a second later on the same market
 * produces a new timestamp and therefore a legitimately different id (it's
 * a new assessment of a possibly-changed market) — this only dedupes
 * literal double-submits of the *same* assessment object, not "the same
 * grade happened again later".
 */
export function buildOracleSignalId(assessment: OracleAssessment): string {
  const basis = `${assessment.symbol}|${assessment.timestamp}|${assessment.side}|${assessment.grade}`;
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) | 0;
  }
  return `oracle_${assessment.symbol.toLowerCase()}_${(hash >>> 0).toString(36)}`;
}

function buildSetupLabel(confluence: ConfluenceResult | undefined, assessment: OracleAssessment): string {
  const patterns = confluence ? detectPatterns(confluence, assessment.side) : [];
  if (patterns.length > 0) return patterns[0];
  return assessment.side ? `${assessment.side} · ${assessment.grade} Confluence Setup` : "Oracle Setup";
}

/**
 * Builds the reason text stored on the row. Deliberately references grade
 * + setup + a couple of evidence lines — NEVER the raw entry/SL/TP numbers,
 * since this text is one of the few premium fields that stays visible to
 * the normal PaperTrade/AI Performance UI (spec §5) and must not leak the
 * hidden execution parameters through free text.
 */
function buildReasonText(assessment: OracleAssessment, setup: string): string {
  const topEvidence = assessment.supportingEvidence.slice(0, 2).join(" ");
  return `👑 PRO · ${assessment.grade} · ${setup}. ${topEvidence}`.trim();
}

/**
 * Executes one ELVOID PRO ORACLE signal end-to-end: validate -> idempotency
 * check -> create ai_signals row (source=ELVOID_PRO_ORACLE, premium=true)
 * -> hand off to the EXISTING executeSignal() for the actual open/pending
 * transition. Never invents entry/SL/TP — `risk` must already be a
 * validated OracleRiskPlan (assessment.riskStatus === "valid"); this
 * function itself computes nothing price-related.
 */
/**
 * Phase 8.1.0 — best-effort, fire-and-forget Decision Experience capture
 * into the isolated ELVOID Learning Database. Never awaited by the
 * caller's success path, never allowed to affect the trading result:
 * any failure (Learning DB unconfigured, network error, etc.) is caught
 * and swallowed here. This function does not read back its own result —
 * it exists purely so a capture failure can never surface as an
 * execute-signal failure.
 */
function captureDecisionExperienceBestEffort(row: AiSignal, learningContext: LearningContextSnapshot | null | undefined): void {
  captureDecisionExperience(row, learningContext ?? null).catch(() => {
    // Intentionally swallowed — Learning DB capture must never affect the
    // canonical trading result. See lib/ai/decisionOutcome/repository.ts
    // for the typed (non-throwing) result this call already produces on
    // its own; this catch only guards against an unexpected rejection.
  });
}

export async function executeOracleSignal(
  assessment: OracleAssessment,
  risk: OracleRiskPlan,
  confluence?: ConfluenceResult,
  orderType: OrderType = "market",
  /**
   * Phase 8.1.0 — optional, additive. The client-submitted, already-
   * normalized `LearningContextSnapshot` from this same assessment's
   * `/api/elvoid-pro/oracle` response (see that route's `learningContext`
   * field). `undefined`/`null` is valid and expected for every request
   * from a client that predates this field, and for every normal
   * AI_SIGNAL-sourced decision, which never has one — this function
   * never fabricates a context when none is supplied.
   */
  learningContext?: LearningContextSnapshot | null
): Promise<ExecuteOracleSignalResult | ExecuteOracleSignalError> {
  if (assessment.grade === "NO_TRADE" || !assessment.side) {
    return { success: false, error: "Sinyal ini NO_TRADE — tidak ada setup untuk dieksekusi." };
  }
  if (assessment.riskStatus !== "valid") {
    return { success: false, error: `Risk plan tidak valid (riskStatus=${assessment.riskStatus}) — tidak bisa dieksekusi tanpa R:R yang tervalidasi.` };
  }

  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase belum dikonfigurasi — sinyal Premium tidak bisa dieksekusi sebagai paper trade." };

  const oracleSignalId = buildOracleSignalId(assessment);

  // --- Idempotency: does a row for this exact assessment already exist? ---
  const { data: existing } = await sb.from("ai_signals").select("*").eq("oracle_signal_id", oracleSignalId).maybeSingle();
  if (existing) {
    const row = existing as AiSignal;
    if (row.status === "new") {
      // Row exists but was never actually executed (e.g. insert succeeded on
      // a prior click but the executeSignal() call after it failed) — finish
      // the job via the normal path instead of creating a duplicate row.
      const result = await executeExistingSignal(row.id, orderType);
      if ("error" in result) return { success: false, error: result.error };
      captureDecisionExperienceBestEffort(row, learningContext);
      return { success: true, signalId: oracleSignalId, source: "ELVOID_PRO_ORACLE", grade: assessment.grade, paperTradeId: result.signal.id, premium: true, alreadyExecuted: false };
    }
    return { success: true, signalId: oracleSignalId, source: "ELVOID_PRO_ORACLE", grade: assessment.grade, paperTradeId: row.id, premium: true, alreadyExecuted: true };
  }

  const setup = buildSetupLabel(confluence, assessment);
  const reason = buildReasonText(assessment, setup);

  const { data: inserted, error: insertError } = await sb
    .from("ai_signals")
    .insert({
      coin: assessment.symbol,
      side: assessment.side,
      entry: risk.entry,
      sl: risk.stopLoss,
      tp1: risk.takeProfit,
      tp2: risk.takeProfit,
      tp3: null,
      timeframe: "15m",
      confidence: assessment.confidence,
      risk_percent: 1,
      reason,
      strategy: setup,
      status: "new",
      order_type: orderType,
      trade_grade: null, // Premium grading is intentionally NOT written into the normal-signal TradeGrade column (spec §9/§11) — the two scales must stay separate.
      source: "ELVOID_PRO_ORACLE",
      premium: true,
      oracle_grade: assessment.grade,
      oracle_signal_id: oracleSignalId,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    // Unique-violation race: two near-simultaneous clicks both missed the
    // pre-check above. Re-select and hand off to executeSignal() instead of
    // surfacing a raw DB error to the user.
    const { data: raceRow } = await sb.from("ai_signals").select("*").eq("oracle_signal_id", oracleSignalId).maybeSingle();
    if (raceRow) {
      const row = raceRow as AiSignal;
      if (row.status !== "new") return { success: true, signalId: oracleSignalId, source: "ELVOID_PRO_ORACLE", grade: assessment.grade, paperTradeId: row.id, premium: true, alreadyExecuted: true };
      const result = await executeExistingSignal(row.id, orderType);
      if ("error" in result) return { success: false, error: result.error };
      captureDecisionExperienceBestEffort(row, learningContext);
      return { success: true, signalId: oracleSignalId, source: "ELVOID_PRO_ORACLE", grade: assessment.grade, paperTradeId: result.signal.id, premium: true, alreadyExecuted: false };
    }
    return { success: false, error: insertError?.message ?? "Gagal membuat PaperTrade record untuk sinyal Premium." };
  }

  const row = inserted as AiSignal;
  const result = await executeExistingSignal(row.id, orderType);
  if ("error" in result) return { success: false, error: result.error };
  captureDecisionExperienceBestEffort(row, learningContext);

  return { success: true, signalId: oracleSignalId, source: "ELVOID_PRO_ORACLE", grade: assessment.grade, paperTradeId: result.signal.id, premium: true, alreadyExecuted: false };
}
