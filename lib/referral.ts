import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { refundEnergy } from "@/lib/energy";
import { QUEST_REWARDS } from "@/lib/rewards/config";

// ---------------------------------------------------------------------------
// Brief Section 16: referral must NOT reward merely because a URL was
// opened — it requires "a valid referred wallet activation/onboarding
// event according to the existing authentication architecture". The
// existing onboarding event in this codebase is upsertUserProfile()
// (lib/auth/profile.ts) creating the referred person's FIRST `users` row —
// i.e. their first completed sign-in. activateReferral() below is meant to
// be called from exactly that code path (app/auth/callback/route.ts), once,
// right after a genuinely NEW user row is created — never from a route the
// client can hit with an arbitrary referredUserId.
// ---------------------------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids visual ambiguity in a shareable code
const CODE_LENGTH = 8;
const REFERRAL_COOKIE_NAME = "els_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days — long enough to cover "click link, install wallet, come back later"

export { REFERRAL_COOKIE_NAME };

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

function db(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error("Supabase service-role client is not configured (SUPABASE_SERVICE_ROLE_KEY missing).");
  return client;
}

/** Returns the caller's existing referral code, generating one (with a few collision retries against the UNIQUE(code) constraint) the first time it's requested. */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const { data: existing } = await db().from("referral_codes").select("code").eq("user_id", userId).maybeSingle();
  if (existing) return existing.code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data: created, error } = await db().from("referral_codes").insert({ user_id: userId, code }).select("code").maybeSingle();
    if (created) return created.code as string;
    if (error && !/duplicate key/i.test(error.message)) throw new Error(`getOrCreateReferralCode: ${error.message}`);
    // duplicate code collision (astronomically unlikely at this alphabet/length, but retry rather than fail) — loop.
  }
  throw new Error("getOrCreateReferralCode: exhausted retries generating a unique code.");
}

export async function findReferrerByCode(code: string): Promise<{ userId: string } | null> {
  const { data } = await db().from("referral_codes").select("user_id").eq("code", code.toUpperCase().trim()).maybeSingle();
  return data ? { userId: data.user_id as string } : null;
}

export type ActivateReferralResult =
  | { ok: true; status: "ACTIVATED" | "ALREADY_REFERRED" | "NO_CODE" | "SELF_REFERRAL" }
  | { ok: false; reason: string };

/**
 * Called once, server-side, right after a brand-new user completes
 * onboarding. `referredUserId` MUST come from the just-established auth
 * session (never a client-supplied value) — that's what makes "reward only
 * after a real onboarding event" actually true rather than just a naming
 * convention. Idempotent: a second call for the same referredUserId (e.g. a
 * retried request) hits UNIQUE(referred_user_id) and is reported as
 * ALREADY_REFERRED without granting a second reward.
 */
export async function activateReferral(params: { referredUserId: string; referralCode: string | null }): Promise<ActivateReferralResult> {
  if (!params.referralCode) return { ok: true, status: "NO_CODE" };

  const referrer = await findReferrerByCode(params.referralCode);
  if (!referrer) return { ok: true, status: "NO_CODE" }; // unknown/garbled code — silently no-op, not an error the new user should see

  // Section 16: prevent self-referral.
  if (referrer.userId === params.referredUserId) return { ok: true, status: "SELF_REFERRAL" };

  const { data: created, error } = await db()
    .from("referrals")
    .insert({
      referrer_user_id: referrer.userId,
      referred_user_id: params.referredUserId,
      referral_code: params.referralCode,
      status: "ACTIVATED",
      activated_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();

  if (error) {
    // Section 16: prevent duplicate referred wallet / "same referred wallet
    // through multiple codes" — UNIQUE(referred_user_id) is what actually
    // enforces this; a conflict here means this wallet was already
    // referred (by this code or any other), so no second reward.
    if (/duplicate key/i.test(error.message)) return { ok: true, status: "ALREADY_REFERRED" };
    return { ok: false, reason: error.message };
  }
  if (!created) return { ok: false, reason: "insert returned no row" };

  // Grant the referrer's reward now that a genuine onboarding event fired.
  // Guarded by the row's own status (ACTIVATED -> REWARDED, conditional
  // update) so a retry of this whole function for the same referral row
  // (defensive — the outer INSERT above already makes that case
  // ALREADY_REFERRED before we even get here) can never double-grant.
  const supabase = db();
  const energyResult = await refundEnergy(supabase, referrer.userId, QUEST_REWARDS.referral.aiEnergy, "reward:referral");
  if (energyResult.ok) {
    await db()
      .from("referrals")
      .update({ status: "REWARDED", rewarded_at: new Date().toISOString() })
      .eq("id", created.id)
      .eq("status", "ACTIVATED");
    try {
      await db()
        .from("ai_energy_ledger")
        .upsert(
          { wallet_address: `user:${referrer.userId}`, amount: QUEST_REWARDS.referral.aiEnergy, type: "ai_energy", reference_id: null, description: "Referral reward" },
          { onConflict: "reference_id,type" }
        );
    } catch {
      // best-effort audit trail only — the ai_token credit above is the balance of record for AI Energy
    }
  }
  // If the energy credit failed (infra_error), the referral row stays
  // ACTIVATED (not REWARDED) — a background reconciliation job or a manual
  // retry endpoint could re-attempt the grant later without re-running
  // onboarding; not building that retry path now since Section 20 scopes
  // this phase to the primary flows, but the row correctly reflects
  // "activated, reward pending" rather than silently losing the grant.

  return { ok: true, status: "ACTIVATED" };
}

export interface ReferralSummary {
  code: string;
  referralUrl: string;
  totalReferred: number;
  totalRewarded: number;
}

export async function getReferralSummary(userId: string, baseUrl: string): Promise<ReferralSummary> {
  const code = await getOrCreateReferralCode(userId);
  const { data } = await db().from("referrals").select("status").eq("referrer_user_id", userId);
  const rows = data ?? [];
  return {
    code,
    referralUrl: `${baseUrl}/earn?ref=${code}`,
    totalReferred: rows.length,
    totalRewarded: rows.filter((r) => r.status === "REWARDED").length,
  };
}
