import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { verifyWalletSignature, checkWalletConflict } from "@/lib/wallet/verify";
import { connectorNameToWalletType } from "@/lib/wallet/connectors";
import { ensurePrimaryWallet } from "@/lib/wallet/primary";
import { logActivity } from "@/lib/activityLog";

// ---------------------------------------------------------------------------
// Wallet → Google linking (and "connect wallet from /login before any
// session exists"). Companion to app/api/wallet/verify/route.ts, which only
// ever runs the other direction (Google → Wallet, from Settings, session
// required).
//
// IMPORTANT — this does NOT create a standalone wallet-only account. The
// `users` table requires a non-null email (see supabase/schema.sql, "Phase 3
// — Google Auth & User Profile"), so there is currently no account model for
// "a wallet, with no Google/email ever attached." That's a real schema
// decision (see the note in app/login/page.tsx) intentionally deferred to a
// later phase rather than being decided silently here.
//
// What this route actually does, given that constraint:
//   - No session yet: verify the signature, confirm the address isn't
//     already claimed by someone else, and hand back proof of ownership
//     (verified: true) WITHOUT writing to `wallets` or creating any account.
//     The client (app/login/page.tsx) holds that proof in memory and prompts
//     "Continue with Google to finish connecting this wallet."
//   - Session already exists (person completed Google right after
//     connecting, or called this from an already-authenticated tab): behaves
//     exactly like /api/wallet/verify — verifies + upserts into `wallets` —
//     so the two routes converge once a session exists instead of having
//     two divergent copies of the linking logic.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const { address, chainId, connectorName, message, signature } = body ?? {};
  if (!address || !chainId || !message || !signature) {
    return NextResponse.json({ error: "Missing address, chainId, message, or signature." }, { status: 400 });
  }

  const result = await verifyWalletSignature({ address, message, signature });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "Verification failed." }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const walletType = connectorNameToWalletType(connectorName);
  const normalizedAddress = String(address).toLowerCase();

  const { conflict, reason } = await checkWalletConflict(supabase, normalizedAddress, user?.id ?? null);
  if (conflict) {
    return NextResponse.json(
      { error: reason ?? "This wallet is already linked to a different account. Sign in with that account instead." },
      { status: reason ? 503 : 409 }
    );
  }

  if (!user) {
    // No session yet — hand back verified ownership without persisting
    // anything. Nothing is written to `wallets`, no account is created.
    return NextResponse.json({
      verified: true,
      linked: false,
      wallet: {
        address: normalizedAddress,
        walletType,
        chainId,
      },
    });
  }

  // A session exists — finish the link exactly like /api/wallet/verify.
  const now = new Date().toISOString();
  const { data: wallet, error } = await supabase
    .from("wallets")
    .upsert(
      {
        user_id: user.id,
        wallet_address: normalizedAddress,
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
    console.error("[api/wallet/session] upsert failed:", error.message);
    return NextResponse.json({ error: "Could not save wallet." }, { status: 500 });
  }

  await ensurePrimaryWallet(supabase, user.id);

  await logActivity(supabase, user.id, "wallet_connected", { address: normalizedAddress, walletType, chainId, via: "login" });

  return NextResponse.json({ verified: true, linked: true, wallet });
}
