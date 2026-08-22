import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverMessageAddress, isAddress, type Hex } from "viem";
import { RECENCY_WINDOW_MS } from "./message";
import { getSupabase } from "@/lib/supabase";

export interface VerifyWalletSignatureParams {
  address: string;
  message: string;
  signature: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export interface WalletConflictCheck {
  /** true if `address` is already verified under a *different* account than `userId` (or, in the fail-closed case below, if that can't be determined safely). */
  conflict: boolean;
  /** The user_id currently holding this address, if any. */
  ownerId?: string;
  /** Set only in the fail-closed case (no service-role key + no session) so callers can surface an honest, debuggable reason instead of a misleading "already claimed." */
  reason?: string;
}

/**
 * Shared by both wallet-linking routes (app/api/wallet/verify — requires an
 * existing session, used from Settings; app/api/wallet/session — session
 * optional, used from /login) so "is this address already claimed by
 * someone else" is one rule, not two copies that could drift. wallet_address
 * is globally unique (see supabase/schema.sql), so upserting by address
 * without this check first would silently reassign an already-linked
 * wallet to whoever signs next.
 *
 * Deliberately reads through the service-role client (lib/supabase.ts's
 * getSupabase()), NOT whatever RLS-scoped client the caller has, and
 * ignores its own `supabase` parameter for this read. Reason: the
 * `wallets_select_own` RLS policy is `auth.uid() = user_id`, and
 * `auth.uid()` is NULL when there's no session — NULL = anything is falsy
 * in Postgres, so an RLS-scoped client with no session silently sees zero
 * rows no matter who actually owns the address, rather than raising an
 * error. That would make this check always report "not claimed" for every
 * unauthenticated call, which is exactly the case app/api/wallet/session
 * calls this in. Reading with an elevated client makes the check correct
 * regardless of session state; every WRITE (the upsert in both routes)
 * still goes through the normal RLS-scoped client, so RLS remains the real
 * enforcement on writes — this only widens visibility for the read that
 * decides whether a write should be attempted at all. If getSupabase()
 * isn't configured AND there's no session (userId is null), this fails
 * closed — treats it as a conflict, since that combination structurally
 * cannot see the row it would need to see. With a session, the
 * RLS-scoped fallback stays safe to use even without a service-role key
 * (see the inline comment below for why).
 */
export async function checkWalletConflict(
  supabase: SupabaseClient,
  address: string,
  userId: string | null
): Promise<WalletConflictCheck> {
  const elevated = getSupabase();
  const reader = elevated ?? supabase;

  const { data: existing, error } = await reader
    .from("wallets")
    .select("user_id")
    .eq("wallet_address", address.toLowerCase())
    .maybeSingle();

  if (error) {
    // Fail closed: an unexpected error here means "unknown," and treating
    // unknown as "no conflict" would risk exactly the false negative this
    // function exists to prevent.
    return { conflict: true };
  }
  if (!elevated && !userId) {
    // No service-role key configured AND no session — this is the one
    // combination that's genuinely vulnerable: an RLS-scoped client with no
    // session can only ever see rows where auth.uid() = user_id, and
    // auth.uid() is NULL here, so it would silently report zero rows no
    // matter who actually owns the address. Fail closed rather than let an
    // unauthenticated caller (the /login wallet-first path) proceed on a
    // check that structurally cannot see the row it needs to see.
    //
    // When a session DOES exist, this same RLS-scoped fallback is fine:
    // it correctly sees the caller's own row for the "already yours"
    // case, and for "someone else's," the WRITE that follows (upsert in
    // both wallet routes) is independently protected by wallets_update_own
    // RLS regardless of what this read returns — so there's no matching
    // security gap to fail closed for on the authenticated path, and
    // doing so anyway would turn every genuinely-new address into a false
    // 409 on any deployment without SUPABASE_SERVICE_ROLE_KEY set,
    // breaking the pre-existing Settings wallet-linking feature for no
    // real benefit.
    return {
      conflict: true,
      reason: "Wallet sign-in isn't fully configured on this deployment (missing SUPABASE_SERVICE_ROLE_KEY) — sign in with Google first, then link your wallet from Settings.",
    };
  }
  if (!existing) return { conflict: false };
  if (userId && existing.user_id === userId) return { conflict: false, ownerId: existing.user_id };
  return { conflict: true, ownerId: existing.user_id };
}

/**
 * Confirms `signature` was produced by the private key for `address` over
 * exactly `message`, and that the message's own embedded Address/Timestamp
 * lines match and are recent. Does NOT call an RPC — recoverMessageAddress
 * is pure ECDSA recovery, so this has no dependency on chain uptime and
 * works for any EOA wallet (MetaMask/Rabby/OKX/Coinbase's own extension).
 * Smart-contract wallets (ERC-1271, e.g. Safe via WalletConnect) aren't
 * covered by this path — a real signature check for those needs an RPC call
 * against the contract, which this lightweight scheme deliberately skips.
 */
export async function verifyWalletSignature({ address, message, signature }: VerifyWalletSignatureParams): Promise<VerifyResult> {
  if (!isAddress(address)) return { ok: false, reason: "Invalid address." };

  const addressLine = message.match(/^Address:\s*(0x[a-fA-F0-9]{40})$/m)?.[1];
  const timestampLine = message.match(/^Timestamp:\s*(.+)$/m)?.[1];
  if (!addressLine || !timestampLine) return { ok: false, reason: "Malformed verification message." };
  if (addressLine.toLowerCase() !== address.toLowerCase()) return { ok: false, reason: "Address mismatch in message." };

  const signedAt = Date.parse(timestampLine);
  if (Number.isNaN(signedAt) || Date.now() - signedAt > RECENCY_WINDOW_MS) {
    return { ok: false, reason: "Signature expired — please reconnect and try again." };
  }

  try {
    const recovered = await recoverMessageAddress({ message, signature: signature as Hex });
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return { ok: false, reason: "Signature does not match the connected address." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Signature verification failed." };
  }
}
