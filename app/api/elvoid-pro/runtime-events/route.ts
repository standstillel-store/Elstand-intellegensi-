import { NextResponse } from "next/server";
import { listRuntimeEvents } from "@/lib/ai/runtimeEvents/repository";
import { hasActiveMembership, MEMBERSHIP_REQUIRED_BODY } from "@/lib/membership";

// ---------------------------------------------------------------------------
// GET /api/elvoid-pro/runtime-events?since=<ISO>&symbol=BTC&limit=200
//
// Read-only observability endpoint (Phase 8.5). Returns real
// public.runtime_events rows — one row per real backend operation the
// autonomous cycle actually performed (see
// lib/ai/autonomousRuntime/orchestrator.ts's emitRuntimeEvent() calls).
// This route triggers NOTHING — it never calls runAutonomousCycle; it
// only reads what the runtime has already emitted, so polling it can
// never itself cause a Paper Trade or influence any decision.
//
// `since` is a cursor: pass back the `createdAt` of the last event you
// already have and you'll only get newer ones (Step 13 — avoid
// duplicate events). Omit it for the initial page load.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!(await hasActiveMembership())) {
    return NextResponse.json(MEMBERSHIP_REQUIRED_BODY, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since") ?? undefined;
  const symbolParam = searchParams.get("symbol");
  const symbol = symbolParam ? symbolParam.trim().toUpperCase() : undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  const events = await listRuntimeEvents({ since, symbol, limit: Number.isFinite(limit) ? limit : undefined });

  return NextResponse.json({
    events,
    // Real cursor for the next poll — the caller's own last-known event
    // timestamp advances only when a real event actually arrived.
    cursor: events.length > 0 ? events[events.length - 1].createdAt : (since ?? null),
  });
}
