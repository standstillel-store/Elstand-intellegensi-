import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { spendEnergy, refundEnergy, FEATURE_COSTS, type EnergyFeature } from "@/lib/energy";

export const INSUFFICIENT_ENERGY_MESSAGE = "AI Energy tidak mencukupi.";

/**
 * Drop this at the top of any route that does real AI analysis work
 * ("Analisis AI mengurangi token sesuai fitur" — brief section 6):
 *
 *   const blocked = await chargeEnergy(1, "chat");
 *   if (blocked) return blocked;
 *
 * Returns null to mean "proceed" — either the charge succeeded, or Supabase
 * Auth isn't configured / no one is signed in, in which case metering is
 * skipped entirely rather than blocking the request. That matches every
 * other optional integration in this app (see lib/supabase.ts,
 * lib/alchemy.ts): local dev and not-yet-authenticated visitors keep
 * working, energy only actually gates once a real account is involved.
 * Returns a ready-to-return 402 NextResponse when a signed-in user is out
 * of AI Energy for the day.
 */
export async function chargeEnergy(amount: number, reason: string): Promise<NextResponse | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const result = await spendEnergy(supabase, user.id, amount, reason);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "insufficient_energy",
        message: INSUFFICIENT_ENERGY_MESSAGE,
        balance: result.balance,
      },
      { status: 402 }
    );
  }
  return null;
}

// ============================================================================
// Phase 3.2 — the actual gate used by the three metered features (Analyze
// Coin, Generate AI Signal, AI Agent Chat). Two explicit steps instead of one
// wrap-everything helper, on purpose: each of those three routes already has
// its own try/catch and its own idea of "did this actually succeed" (a 404
// with no signal vs. a 200 with one; a TerminalReport that's a real answer
// vs. one that's an internal system/error message) — see the call sites in
// app/api/token-analysis, app/api/ai-signals, app/api/chat. Forcing all three
// through one generic success/failure callback would mean restructuring
// logic this brief explicitly says not to touch ("Jangan mengubah Signal
// Logic", "AI Router"). reserveEnergy()/settleEnergy() instead just bracket
// the existing code: reserve before, settle at each existing exit point.
// ============================================================================

export interface EnergyReservation {
  supabase: SupabaseClient;
  userId: string;
  feature: EnergyFeature;
  cost: number;
}

export type EnergyGateResult =
  /** Not enough AI Energy — `response` is the exact 402 to return as-is. The route must NOT call the AI/feature logic. */
  | { ok: false; response: NextResponse }
  /**
   * Proceed. `reservation` is null when unmetered (Supabase Auth not
   * configured, or no one signed in — same "don't block, just don't charge"
   * convention as chargeEnergy() above), otherwise it's the cost already
   * atomically deducted; call settleEnergy(reservation, success) exactly
   * once, at whichever exit point the route ends up taking.
   */
  | { ok: true; reservation: EnergyReservation | null };

/**
 * Step 1 — call at the top of a metered route, AFTER input validation (an
 * empty message / missing symbol isn't a real attempt to use the feature,
 * so it shouldn't reserve anything) and BEFORE calling the AI/feature logic.
 *
 *   const gate = await reserveEnergy("analyze_coin");
 *   if (!gate.ok) return gate.response;
 *   try {
 *     ... existing logic, unchanged ...
 *     if (gate.reservation) await settleEnergy(gate.reservation, true);
 *     return NextResponse.json(result);
 *   } catch (err) {
 *     if (gate.reservation) await settleEnergy(gate.reservation, false);
 *     throw err; // or return the route's existing error response
 *   }
 */
export async function reserveEnergy(feature: EnergyFeature): Promise<EnergyGateResult> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return { ok: true, reservation: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true, reservation: null };

  const cost = FEATURE_COSTS[feature];
  const result = await spendEnergy(supabase, user.id, cost, feature);
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "insufficient_energy", message: INSUFFICIENT_ENERGY_MESSAGE, balance: result.balance },
        { status: 402 }
      ),
    };
  }
  return { ok: true, reservation: { supabase, userId: user.id, feature, cost } };
}

/**
 * Step 2 — call exactly once per request that got a `reservation` back from
 * reserveEnergy(), at whichever exit point the route takes.
 * success=true: the reservation sticks (this is the actual charge).
 * success=false: refunds it — net effect across the pair of calls is "never
 * charged", per the brief ("jika gagal jangan mengurangi Energy").
 * Never throws — a logging failure here shouldn't break the HTTP response
 * that's already been decided; worst case a refund is missed and shows up
 * in ai_token_transactions for a human to reconcile, rather than the user
 * getting an opaque 500 on top of whatever already went wrong.
 */
export async function settleEnergy(reservation: EnergyReservation, success: boolean): Promise<void> {
  if (success) return;
  try {
    await refundEnergy(reservation.supabase, reservation.userId, reservation.cost, `${reservation.feature}_refund`);
  } catch (err) {
    console.error(`[energyGate] refund failed for ${reservation.feature}:`, err);
  }
}
