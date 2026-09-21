import { NextResponse } from "next/server";
import { hasActiveMembership } from "@/lib/membership";
import { getApprovalViewByRecordHash } from "@/lib/ai/evolutionApproval/repository";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/ai-performance/approvals?recordHash=<64 hex>
//
// Phase 8.6.7 — READ-ONLY approval status for one immutable validation record.
// This route only READS: it never approves, never requests an approval, never
// sends a Telegram message, and never persists anything. Approval decisions
// happen in exactly one place — the authenticated Telegram webhook
// (./telegram/route.ts). Membership-gated like the rest of the AI Performance
// data; the response carries no approver identity.
// ---------------------------------------------------------------------------

const HEX_64 = /^[0-9a-f]{64}$/;

export async function GET(request: Request) {
  if (!(await hasActiveMembership())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const recordHash = new URL(request.url).searchParams.get("recordHash") ?? "";
  if (!HEX_64.test(recordHash)) return NextResponse.json({ ok: false, error: "invalid_record_hash" }, { status: 400 });
  return NextResponse.json({ ok: true, approval: await getApprovalViewByRecordHash(recordHash) });
}
