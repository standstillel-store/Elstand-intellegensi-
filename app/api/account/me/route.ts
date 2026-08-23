import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getAppUser, getAppProfile } from "@/lib/auth/profile";
import { getEnergyBalance } from "@/lib/energy";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";

// Powers the TopNav profile dropdown (avatar/username/email/wallet
// status/AI Energy) in one round trip instead of four separate fetches on
// every single page load.
export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ signedIn: false });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false });

  // Primary VERIFIED wallet only — same rule Earn/Rewards already trusts
  // (lib/wallet/primary.ts). Previously this picked the most-recently-
  // CONNECTED row regardless of verification or is_primary, which could
  // surface an unverified/secondary address (or none, right after a
  // connect-but-not-yet-signed attempt) as if it were the account's wallet.
  const [account, profile, energy, wallet] = await Promise.all([
    getAppUser(supabase, user.id),
    getAppProfile(supabase, user.id),
    getEnergyBalance(supabase, user.id),
    getPrimaryVerifiedWallet(supabase, user.id),
  ]);

  return NextResponse.json({
    signedIn: true,
    user: account,
    profile,
    energy: { balance: energy.balance, nextResetAt: energy.nextResetAt },
    wallet: wallet ? { wallet_address: wallet.wallet_address, wallet_type: wallet.wallet_type, chain_id: wallet.chain_id } : null,
  });
}
