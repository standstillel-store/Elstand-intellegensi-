import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { gatherSymbolEvolution } from "@/lib/ai/evolutionApproval/derive";
import { persistEvolutionProposals } from "@/lib/ai/evolutionProposal/repository";
import { persistEvolutionCandidate } from "@/lib/ai/evolutionCandidate/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/ai-performance/proposals/persist   { symbol }
//
// P4 Step 2 — the ONE production path that persists evolution_proposals and
// evolution_candidates for audit history. Admin-authenticated, explicit,
// human-initiated — never called by a GET, a cron, the autonomous tick, or
// any automatic path (same convention as
// app/api/ai-performance/approvals/request/route.ts).
//
// DELIBERATELY SEPARATE from the approval layer (lib/ai/evolutionApproval/*
// and its three routes): this route never imports from evolutionApproval,
// requests no approval, and sends nothing to Telegram — it only recomputes
// (server-side, never trusting the client) and persists the SAME proposals/
// candidates the AI Performance dashboard already computes read-only. An
// existing regression fixture (scripts/phase8/evolution-approval-fixtures.ts
// check 19) asserts the approval layer itself touches only
// evolution_validation_records/evolution_approvals — this route exists
// precisely so that invariant stays true while proposals/candidates still
// get a real, auditable history instead of being recomputed from nothing on
// every dashboard refresh.
//
// DEDUPLICATION: persistEvolutionProposals()/persistEvolutionCandidate()
// upsert on their own deterministic identity (proposal_id = "source:symbol:
// gapCategory", candidate_id = "candidate:<proposal_id>") — re-running this
// for the same symbol overwrites the same rows with freshly-recomputed
// content, it never inserts a duplicate. No new identity scheme was
// invented here; both functions already existed with this exact contract
// (see their own file headers) — they were simply never called from any
// production path before this route (P4 Step 1 finding).
// ---------------------------------------------------------------------------

const SYMBOL = /^[A-Z0-9]{3,20}$/;

export async function POST(request: Request) {
  if (!requireAdminSession()) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin !== null) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === request.headers.get("host");
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { symbol?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });
  }
  if (typeof body.symbol !== "string" || !SYMBOL.test(body.symbol)) {
    return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });
  }

  const derived = await gatherSymbolEvolution(body.symbol);

  const proposalResult = await persistEvolutionProposals(derived.proposals);
  const candidateResults = await Promise.all(derived.candidates.map((entry) => persistEvolutionCandidate(entry.candidate)));
  const candidatesPersisted = candidateResults.filter((r) => r.persisted).length;
  const candidatesFailed = candidateResults.length - candidatesPersisted;

  return NextResponse.json({
    ok: proposalResult.persisted,
    symbol: body.symbol,
    proposalsComputed: derived.proposals.length,
    proposalsPersisted: proposalResult,
    candidatesComputed: derived.candidates.length,
    candidatesPersisted,
    candidatesFailed,
  });
}
