import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/auth/server";

// ---------------------------------------------------------------------------
// ELVOID PRO / ELSTAND PREMIUM entitlement — single source of truth.
//
// lib/payments/store.ts already grants BOTH ELVOID_PRO_WEEK and
// ELVOID_PRO_MONTH into the SAME "premium_memberships" row (kind ===
// "premium" for both, see lib/payments/config.ts). There is only ever one
// membership product on this platform today — ELVOID PRO's terminal and
// the ELSTAND PREMIUM dashboard are two surfaces gated by the exact same
// row, not two separate membership types. This file does not invent a
// second membership concept; it just reads the row that already exists.
//
// Access = signed in AND has a row in premium_memberships AND
// expires_at > now. Nothing here trusts the client — every caller must be
// a Server Component or Route Handler using the request's own Supabase
// session (see lib/auth/server.ts), never a client-submitted userId or
// wallet address.
// ---------------------------------------------------------------------------

export interface MembershipStatus {
  signedIn: boolean;
  active: boolean;
  expiresAt: string | null;
}

const INACTIVE: MembershipStatus = { signedIn: false, active: false, expiresAt: null };

/**
 * Resolve the signed-in user's membership status entirely server-side.
 * Pass an existing Supabase server client if the caller already created
 * one this request (avoids creating it twice); otherwise one is created.
 */
export async function getMembershipStatus(existingClient?: SupabaseClient | null): Promise<MembershipStatus> {
  const supabase = existingClient ?? createSupabaseServerClient();
  if (!supabase) return INACTIVE;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return INACTIVE;

  const { data: membership } = await supabase
    .from("premium_memberships")
    .select("expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.expires_at) return { signedIn: true, active: false, expiresAt: null };

  const active = new Date(membership.expires_at).getTime() > Date.now();
  return { signedIn: true, active, expiresAt: membership.expires_at };
}

/** Convenience boolean for Route Handlers that only need a yes/no gate. */
export async function hasActiveMembership(existingClient?: SupabaseClient | null): Promise<boolean> {
  const status = await getMembershipStatus(existingClient);
  return status.active;
}

/**
 * Standard 401/403 JSON body for a Route Handler denying a premium-only
 * endpoint. Callers should `return` this directly when
 * hasActiveMembership() is false — see app/api/elvoid-pro/oracle,
 * /insights, /execute-signal for the pattern. Kept as plain data (no
 * NextResponse import here) so this file has zero next/server
 * dependency and stays trivially importable from Server Components too.
 */
export const MEMBERSHIP_REQUIRED_BODY = {
  error: "membership_required",
  message: "An active ELVOID PRO membership is required to access this data.",
} as const;
