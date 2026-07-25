import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getAppUser, getAppProfile } from "@/lib/auth/profile";
import { getEnergyBalance } from "@/lib/energy";

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

  const [account, profile, energy, { data: wallets }] = await Promise.all([
    getAppUser(supabase, user.id),
    getAppProfile(supabase, user.id),
    getEnergyBalance(supabase, user.id),
    supabase.from("wallets").select("wallet_address, wallet_type, chain_id").eq("user_id", user.id).order("last_connected_at", { ascending: false }).limit(1),
  ]);

  return NextResponse.json({
    signedIn: true,
    user: account,
    profile,
    energy: { balance: energy.balance, nextResetAt: energy.nextResetAt },
    wallet: wallets?.[0] ?? null,
  });
}
