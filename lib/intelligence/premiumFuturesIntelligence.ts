// ---------------------------------------------------------------------------
// ELSTAND PREMIUM Futures <-> ELVOID Intelligence connector (Phase 8.5)
//
// This file is the ONLY bridge between ELSTAND PREMIUM's Futures
// Microstructure UI and the existing ELVOID PRO ORACLE pipeline
// (app/api/elvoid-pro/oracle/route.ts). It does not recompute confluence,
// grading, risk, or reasoning itself — it calls the oracle route's own
// exported GET handler in-process (same request lifecycle, so the
// session/cookies used by hasActiveMembership() inside it are the real
// signed-in user's — see lib/auth/server.ts, which reads next/headers
// cookies() rather than anything on the Request object) and then narrows
// the response down to only the fields this summary card is allowed to
// show.
//
// Hard rule (spec: "Phase 8.5 — Final Gap Fix"): never invent direction,
// confidence, grade, entry/SL/TP, reasoning, or timestamps. Every field
// below is either copied verbatim from the Oracle response or omitted.
// ---------------------------------------------------------------------------

import { GET as oracleGet } from "@/app/api/elvoid-pro/oracle/route";
import type { OracleGrade } from "@/lib/ai/oracle/types";
import type { OracleRiskStatus } from "@/lib/ai/oracle/gradingTypes";
import type { RiskSeverity } from "@/lib/ai/oracle/riskIntelligence";
import type { SupportedPair } from "@/lib/intelligence/premiumMicrostructure";

/** Fixed default — Premium's 1D/7D/1M selector governs the order-flow/funding
 *  history charts, a different concept from the Oracle's own candle
 *  interval. Using the Oracle's own default ("15m", same as
 *  /api/elvoid-pro/oracle's fallback) avoids inventing a mapping that was
 *  never specified. */
const ORACLE_INTERVAL = "15m";

export type FuturesIntelligenceStatus =
  | "CONNECTED"
  | "NO_TRADE"
  | "INSUFFICIENT_CONTEXT"
  | "DATA_UNAVAILABLE"
  | "MEMBERSHIP_REQUIRED"
  | "CONNECTOR_ERROR";

/**
 * Everything optional: every field is only present when the Oracle
 * response actually carried it. Never backfilled, never defaulted to a
 * placeholder value.
 */
export interface FuturesIntelligenceSummary {
  status: FuturesIntelligenceStatus;
  pair: SupportedPair;
  grade?: OracleGrade;
  side?: "LONG" | "SHORT" | null;
  confidence?: number;
  riskStatus?: OracleRiskStatus;
  riskOverall?: RiskSeverity;
  supportingEvidence?: string[];
  contradictingEvidence?: string[];
  summary?: string;
  lastUpdated?: string;
  error?: string;
}

function unavailable(pair: SupportedPair, error: string): FuturesIntelligenceSummary {
  return { status: "DATA_UNAVAILABLE", pair, error };
}

/**
 * Server-only. Runs the real, existing ELVOID PRO ORACLE pipeline for
 * `pair` via its own route handler and returns a normalized, UI-safe
 * summary. Never called from a client component directly — see
 * app/api/premium/futures-intelligence/route.ts for the boundary that
 * client code actually fetches.
 */
export async function getFuturesIntelligenceSummary(pair: SupportedPair): Promise<FuturesIntelligenceSummary> {
  let res: Response;
  try {
    const req = new Request(
      `http://internal.elvoid.local/api/elvoid-pro/oracle?symbol=${encodeURIComponent(pair)}&interval=${ORACLE_INTERVAL}`,
    );
    res = await oracleGet(req);
  } catch (err) {
    return { status: "CONNECTOR_ERROR", pair, error: err instanceof Error ? err.message : "Oracle connector failed." };
  }

  if (res.status === 403) {
    return { status: "MEMBERSHIP_REQUIRED", pair };
  }
  if (res.status === 422) {
    return { status: "INSUFFICIENT_CONTEXT", pair };
  }
  if (!res.ok) {
    let error = `Oracle returned HTTP ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) error = body.error;
    } catch {
      // keep generic message above
    }
    return unavailable(pair, error);
  }

  let data: {
    assessment?: {
      grade?: OracleGrade;
      side?: "LONG" | "SHORT" | null;
      confidence?: number;
      riskStatus?: OracleRiskStatus;
      supportingEvidence?: string[];
      contradictingEvidence?: string[];
      timestamp?: string;
    };
    riskIntelligence?: { overall?: RiskSeverity } | null;
    reasoning?: { summary?: string } | null;
  };
  try {
    data = await res.json();
  } catch (err) {
    return unavailable(pair, err instanceof Error ? err.message : "Oracle returned an unreadable response.");
  }

  const assessment = data.assessment;
  if (!assessment) {
    return unavailable(pair, "Oracle response missing assessment.");
  }

  return {
    status: assessment.grade === "NO_TRADE" ? "NO_TRADE" : "CONNECTED",
    pair,
    grade: assessment.grade,
    side: assessment.side,
    confidence: assessment.confidence,
    riskStatus: assessment.riskStatus,
    riskOverall: data.riskIntelligence?.overall,
    supportingEvidence: assessment.supportingEvidence,
    contradictingEvidence: assessment.contradictingEvidence,
    summary: data.reasoning?.summary,
    lastUpdated: assessment.timestamp,
  };
}
