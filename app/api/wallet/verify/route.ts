import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { verifyWalletSignature } from "@/lib/wallet/verify";
import { connectorNameToWalletType } from "@/lib/wallet/connectors";
import { logActivity } from "@/lib/activityLog";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { address, chainId, connectorName, message, signature } = body ?? {};
  if (!address || !chainId || !message || !signature) {
    return NextResponse.json({ error: "Missing address, chainId, message, or signature." }, { status: 400 });
  }

  const result = await verifyWalletSignature({ address, message, signature });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "Verification failed." }, { status: 400 });
  }

  const walletType = connectorNameToWalletType(connectorName);
  const now = new Date().toISOString();

  // wallet_address is globally unique (see schema.sql) — if it's already
  // verified under a different account, upsert-by-address would silently
  // reassign it. Check first and give a clear error instead.
  const { data: existing } = await supabase
    .from("wallets")
    .select("user_id")
    .eq("wallet_address", address.toLowerCase())
    .maybeSingle();
  if (existing && existing.user_id !== user.id) {
    return NextResponse.json({ error: "This wallet is already linked to a different account." }, { status: 409 });
  }

  const { data: wallet, error } = await supabase
    .from("wallets")
    .upsert(
      {
        user_id: user.id,
        wallet_address: address.toLowerCase(),
        wallet_type: walletType,
        chain_id: chainId,
        verified: true,
        last_connected_at: now,
      },
      { onConflict: "wallet_address" }
    )
    .select()
    .single();

  if (error) {
    console.error("[api/wallet/verify] upsert failed:", error.message);
    return NextResponse.json({ error: "Could not save wallet." }, { status: 500 });
  }

  await logActivity(supabase, user.id, "wallet_connected", { address: address.toLowerCase(), walletType, chainId });

  return NextResponse.json({ wallet });
}
