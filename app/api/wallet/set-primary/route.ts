import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { logActivity } from "@/lib/activityLog";

// POST /api/wallet/set-primary — Phase 6.6, Section 17/12. Lets a user with
// multiple verified wallets choose which one is primary. Only a VERIFIED
// wallet the caller owns can become primary — RLS (wallets_update_own)
// already scopes both queries below to auth.uid() = user_id, the .eq(...)
// filters are defense in depth on top of that.
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const walletId = body?.walletId as string | undefined;
  if (!walletId) return NextResponse.json({ error: "Missing walletId." }, { status: 400 });

  const { data: target, error: findError } = await supabase
    .from("wallets")
    .select("id, wallet_address, verified")
    .eq("id", walletId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
  if (!target.verified) {
    return NextResponse.json({ error: "Only a verified wallet can be set as primary." }, { status: 400 });
  }

  // Demote any current primary, then promote the target. Two statements,
  // not a single transaction — acceptable here because
  // wallets_one_primary_per_user (partial unique index on is_primary) makes
  // "two primaries at once" impossible to persist even if a request were
  // interrupted between these two calls; worst case is a brief "zero
  // primaries" state, corrected by ensurePrimaryWallet on next wallet
  // action, never a security issue.
  const { error: demoteError } = await supabase.from("wallets").update({ is_primary: false }).eq("user_id", user.id).eq("is_primary", true);
  if (demoteError) return NextResponse.json({ error: demoteError.message }, { status: 500 });

  const { data: updated, error: promoteError } = await supabase
    .from("wallets")
    .update({ is_primary: true })
    .eq("id", target.id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (promoteError) return NextResponse.json({ error: promoteError.message }, { status: 500 });

  await logActivity(supabase, user.id, "wallet_set_primary", { address: target.wallet_address });

  return NextResponse.json({ wallet: updated });
}
