import { NextResponse } from "next/server";
import { executeOracleSignal } from "@/lib/ai/oracle/execute";
import type { OracleAssessment, OracleRiskPlan } from "@/lib/ai/oracle/gradingTypes";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { OrderType } from "@/lib/elvoid/types";
import type { LearningContextSnapshot } from "@/lib/ai/decisionOutcome/contracts";
import { hasActiveMembership, MEMBERSHIP_REQUIRED_BODY } from "@/lib/membership";

const VALID_ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];

interface ExecuteBody {
  assessment?: OracleAssessment;
  risk?: OracleRiskPlan;
  confluence?: ConfluenceResult;
  orderType?: OrderType;
  /**
   * Phase 8.1.0 — optional, additive. The client round-trips the exact
   * `learningContext` value it received from this same assessment's GET
   * /api/elvoid-pro/oracle response (see that route). Absent/null is
   * fully backward compatible — every existing client that doesn't send
   * this field keeps working exactly as before; `executeOracleSignal`
   * treats a missing value as "no cognitive context for this decision",
   * never fabricating one. This is not validated as a new canonical
   * authority: it is only ever copied into the Learning DB's
   * `decision_experiences.learning_context` column, never read back into
   * `assessment`/`risk`/grading/execution logic anywhere in this route or
   * in executeOracleSignal.
   */
  learningContext?: LearningContextSnapshot | null;
}

/**
 * POST /api/elvoid-pro/execute-signal
 *
 * Body: { assessment: OracleAssessment, risk: OracleRiskPlan, confluence?: ConfluenceResult, orderType?: OrderType }
 *
 * `assessment` and `risk` are the client's already-computed Oracle output
 * (from Phase 2/3's computeConfluence + gradeConfluence, run wherever the
 * ELVOID Pro dashboard generates its current market read) — this route does
 * not regenerate them. It only validates, persists, and hands off to the
 * existing PaperTrade lifecycle; see lib/ai/oracle/execute.ts for the full
 * idempotency contract.
 */
export async function POST(req: Request) {
  if (!(await hasActiveMembership())) {
    return NextResponse.json({ success: false, ...MEMBERSHIP_REQUIRED_BODY }, { status: 403 });
  }

  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return NextResponse.json({ success: false, error: "Body tidak valid." }, { status: 400 });
  }

  if (!body.assessment) return NextResponse.json({ success: false, error: "assessment wajib diisi." }, { status: 400 });
  if (!body.risk) return NextResponse.json({ success: false, error: "risk wajib diisi — Execute Signal tidak akan menebak entry/SL/TP." }, { status: 400 });

  const orderType = body.orderType && VALID_ORDER_TYPES.includes(body.orderType) ? body.orderType : "market";

  // Phase 8.1.0 — minimal shape validation only, no cryptographic
  // verification (see the Phase 8.0.5 integration audit's Security/Trust
  // Boundary section: this is metadata for the Learning DB, not a
  // canonical authority, and `assessment`/`risk` already cross this same
  // boundary with the same trust level). A malformed value is silently
  // dropped rather than failing the trade — a bad learningContext must
  // never block a valid execute-signal request.
  const learningContext = body.learningContext && typeof body.learningContext === "object" && body.learningContext.version === 1 ? body.learningContext : null;

  const result = await executeOracleSignal(body.assessment, body.risk, body.confluence, orderType, learningContext);
  if (!result.success) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
