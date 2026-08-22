import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { verifyWalletSignature, checkWalletConflict } from "@/lib/wallet/verify";
import { connectorNameToWalletType } from "@/lib/wallet/connectors";
import { logActivity } from "@/lib/activityLog";

// Google → Wallet linking: called from Settings > Wallet, always requires an
// existing Supabase session. For the reverse direction (arriving with a
// wallet before any session exists, e.g. from /login), see
// app/api/wallet/session/route.ts instead — that route shares the same
// verifyWalletSignature/checkWalletConflict logic but doesn't require `user`
// up front.
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

  const { conflict, reason } = await checkWalletConflict(supabase, address, user.id);
  if (conflict) {
    return NextResponse.json({ error: reason ?? "This wallet is already linked to a different account." }, { status: reason ? 503 : 409 });
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
