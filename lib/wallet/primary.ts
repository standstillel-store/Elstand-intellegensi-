import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Phase 6.6 — primary wallet resolution.
//
// A user can link several wallets (Settings > Wallet already supports
// this), but exactly one is "the" identity anything server-side trusts by
// default: profile display, and — critically — Earn/Rewards verification
// (see app/api/rewards/verify/route.ts). Centralized here so both places
// that write a primary (app/api/wallet/verify, app/api/wallet/session) and
// both places that read one (app/api/rewards/status,
// app/api/rewards/verify) agree on exactly one rule.
// ---------------------------------------------------------------------------

export interface WalletRow {
  id: string;
  wallet_address: string;
  wallet_type: string | null;
  chain_id: number | null;
  verified: boolean;
  is_primary: boolean;
  last_connected_at: string;
}

/**
 * After a wallet is verified/upserted, guarantee the user has a primary
 * wallet if they now have at least one verified wallet. Never demotes an
 * existing primary — linking a second/third wallet must not silently swap
 * out the wallet Earn is already using. Call this AFTER the upsert that
 * marks `verified = true`, using the same RLS-scoped client the caller
 * already has (auth.uid() = user_id covers both the read and the write).
 */
export async function ensurePrimaryWallet(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: existingPrimary } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (existingPrimary) return;

  // No primary yet — promote the most-recently-connected verified wallet
  // (matches the pre-migration de-facto behavior in rewards/status).
  const { data: candidate } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("verified", true)
    .order("last_connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!candidate) return;

  await supabase.from("wallets").update({ is_primary: true }).eq("id", candidate.id).eq("user_id", userId);
}

/**
 * The wallet Earn/Rewards and the profile must treat as "the user's
 * wallet". Only ever returns a VERIFIED row — an unverified `wallets` row
 * (address seen but ownership never signed) must never be trusted as
 * identity for anything reward-bearing.
 */
export async function getPrimaryVerifiedWallet(supabase: SupabaseClient, userId: string): Promise<WalletRow | null> {
  const { data: primary } = await supabase
    .from("wallets")
    .select("id, wallet_address, wallet_type, chain_id, verified, is_primary, last_connected_at")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .eq("verified", true)
    .maybeSingle();
  if (primary) return primary as WalletRow;

  // Defensive fallback for the narrow window right after migration / a
  // race where ensurePrimaryWallet hasn't run yet: fall back to the most
  // recently connected verified wallet rather than reporting "no wallet"
  // for a user who clearly has one.
  const { data: fallback } = await supabase
    .from("wallets")
    .select("id, wallet_address, wallet_type, chain_id, verified, is_primary, last_connected_at")
    .eq("user_id", userId)
    .eq("verified", true)
    .order("last_connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (fallback as WalletRow | null) ?? null;
}
