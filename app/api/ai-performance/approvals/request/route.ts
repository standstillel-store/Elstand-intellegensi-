import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { diagnoseTelegramConfig, readTelegramConfig } from "@/lib/ai/evolutionApproval/security";
import { emitApprovalDiagnostic } from "@/lib/ai/evolutionApproval/diagnostics";
import { requestApproval } from "@/lib/ai/evolutionApproval/request";
import { createRequestDeps } from "@/lib/ai/evolutionApproval/repository";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import { EVOLUTION_SOURCE, gatherSymbolEvolution } from "@/lib/ai/evolutionApproval/derive";
import { buildEvolutionValidationRecord } from "@/lib/ai/evolutionValidation/record";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/ai-performance/approvals/request   { symbol, proposalId }
//
// Phase 8.6.7 — asks the human approver, on Telegram, to decide on ONE
// currently VALID validation. Admin-authenticated (the existing signed admin
// session cookie, sameSite=strict, plus a same-origin check); an explicit,
// human-initiated action — never called by a GET, a cron, the tick, or any
// automatic path.
//
// The client only NAMES a proposal. The proposal, candidate, validation and
// record are ALL recomputed server-side from the Learning DB; nothing the
// client sends is ever trusted as evidence. The immutable validation record is
// appended (idempotent) and the approver receives its full recordHash with
// Approve / Reject buttons. This request decides nothing.
// ---------------------------------------------------------------------------

const SYMBOL = /^[A-Z0-9]{3,20}$/;
const PROPOSAL_ID = /^[A-Za-z0-9_:.-]{1,120}$/;

const STATUS_FOR_CODE = { REQUEST_SENT: 200, ALREADY_DECIDED: 200, INELIGIBLE: 409, RECORD_STORE_UNAVAILABLE: 503, TELEGRAM_UNAVAILABLE: 502 } as const;

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

  const telegramEnv = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_APPROVER_ID: process.env.TELEGRAM_APPROVER_ID,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  };
  const config = readTelegramConfig(telegramEnv);
  if (config === null) {
    emitApprovalDiagnostic({ kind: "REQUEST_NOT_CONFIGURED", problems: diagnoseTelegramConfig(telegramEnv) });
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let body: { symbol?: unknown; proposalId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });
  }
  if (typeof body.symbol !== "string" || !SYMBOL.test(body.symbol) || typeof body.proposalId !== "string" || !PROPOSAL_ID.test(body.proposalId)) {
    return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });
  }

  const derived = await gatherSymbolEvolution(body.symbol);
  const entry = derived.candidates.find((c) => c.proposal.proposalId === body.proposalId && c.proposal.source === EVOLUTION_SOURCE);
  if (!entry) return NextResponse.json({ ok: false, error: "proposal_not_found" }, { status: 404 });

  const record = buildEvolutionValidationRecord(entry.proposal, entry.candidate);
  if (record === null) return NextResponse.json({ ok: false, error: "record_unavailable" }, { status: 422 });

  const outcome = await requestApproval(createRequestDeps(createTelegramClient(config), config.approverId), record);
  emitApprovalDiagnostic({ kind: "REQUEST_OUTCOME", code: outcome.code });
  return NextResponse.json({ ok: outcome.code === "REQUEST_SENT" || outcome.code === "ALREADY_DECIDED", outcome: outcome.code, status: outcome.status, recordHash: outcome.recordHash, failure: outcome.failure }, { status: STATUS_FOR_CODE[outcome.code] });
}
