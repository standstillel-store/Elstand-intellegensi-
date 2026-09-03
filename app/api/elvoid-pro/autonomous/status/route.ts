import { NextResponse } from "next/server";
import { listDecisionTracesBySymbol } from "@/lib/ai/decisionTrace/repository";
import { getConstraintValidations } from "@/lib/ai/learningValidation/repository";
import { hasActiveMembership, MEMBERSHIP_REQUIRED_BODY } from "@/lib/membership";

// ---------------------------------------------------------------------------
// GET /api/elvoid-pro/autonomous/status?symbol=BTC
//
// Read-only observation endpoint (Phase 8.2.9 §9) — the ELVOID Pro UI's
// replacement for the old "Execute Signal" button. Returns the most
// recent autonomous decision trace already persisted for this symbol by
// `executeAutonomousPaperTrade()` (Phase 8.2.7, via the runtime tick —
// see app/api/elvoid-pro/autonomous/tick), plus whether any VALIDATED
// (`status === "VALID"`) learning constraint currently exists for THIS
// symbol under ELVOID_PRO_ORACLE (Phase 8.3.0.1 §7 — symbol-scoped, not
// pooled across every symbol; a DOGE constraint can never make this
// route report "active" for a BTC request). This route triggers
// NOTHING — it never calls `runAutonomousCycle`/`runAutonomousBatch`; it
// only reads what the runtime has already produced, so polling it on a
// page view can never itself cause a Paper Trade.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!(await hasActiveMembership())) {
    return NextResponse.json(MEMBERSHIP_REQUIRED_BODY, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi, contoh: ?symbol=BTC" }, { status: 400 });

  const [traces, validations] = await Promise.all([listDecisionTracesBySymbol(symbol, undefined, 1), getConstraintValidations("ELVOID_PRO_ORACLE", symbol)]);

  const latest = traces[0] ?? null;
  const validatedLearningActive = (validations ?? []).some((v) => v.status === "VALID");

  return NextResponse.json({
    symbol,
    latestDecision: latest
      ? {
          outcome: latest.outcome,
          side: latest.side,
          decisionTimestamp: latest.decisionTimestamp,
          sourceSignalId: latest.sourceSignalId,
        }
      : null,
    validatedLearningActive,
  });
}
