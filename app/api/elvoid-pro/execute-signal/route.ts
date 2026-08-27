import { NextResponse } from "next/server";
import { executeOracleSignal } from "@/lib/ai/oracle/execute";
import type { OracleAssessment, OracleRiskPlan } from "@/lib/ai/oracle/gradingTypes";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { OrderType } from "@/lib/elvoid/types";
import { hasActiveMembership, MEMBERSHIP_REQUIRED_BODY } from "@/lib/membership";

const VALID_ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];

interface ExecuteBody {
  assessment?: OracleAssessment;
  risk?: OracleRiskPlan;
  confluence?: ConfluenceResult;
  orderType?: OrderType;
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

  const result = await executeOracleSignal(body.assessment, body.risk, body.confluence, orderType);
  if (!result.success) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
