import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/leaderboard — Top Contributors.
//
// Reuses the exact same source-of-truth tables the rest of Earn/Wallet
// already reads, no new table/RPC/schema:
//   - AI Energy: `ai_token.balance` per user_id — the same table
//     lib/energy.ts (getEnergyBalance) reads for /api/ai-energy and
//     /api/rewards/status.
//   - ELS Testnet: `ai_energy_ledger` rows with type = "els_testnet",
//     summed per wallet_address — the exact same table + type filter
//     getWalletElsTestnetBalance() in lib/rewards/store.ts already uses
//     for a single wallet; here we sum it for every wallet at once.
//   - Wallet identity: `wallets` (is_primary + verified), same rule
//     getPrimaryVerifiedWallet() in lib/wallet/primary.ts already
//     enforces for Earn — a user only appears on the leaderboard under
//     their primary verified wallet, never an unverified/unlinked one.
//
// IMPORTANT — this is CURRENT BALANCE, not lifetime "earned/contribution".
// ai_token.balance goes up (daily claim, quest rewards) and down (spent on
// AI features), and ai_energy_ledger's els_testnet rows are only ever
// additive credits from claimed quests, so ELS here already reads as
// cumulative earned ELS Testnet — but AI Energy is a live spendable
// balance, not a running total. The repo has no separate "lifetime
// contribution" ledger for AI Energy, so we do not invent one; both
// columns are shown transparently as-is and documented here rather than
// silently treated as equivalent "contribution" numbers.
//
// Ranking: sorted by ELS Testnet earned (desc), then AI Energy balance
// (desc) as a tiebreaker. The two metrics are never summed into one score
// — each renders as its own column, per spec.
//
// This is a server-side aggregation over all users, so it uses the
// service-role client (same as lib/rewards/store.ts) rather than the
// per-request RLS-scoped session client — no service-role key or any
// other secret is ever returned to the client, only { wallet, els,
// aiEnergy } rows.
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured", contributors: [] }, { status: 503 });
  }

  try {
    const [walletsRes, tokensRes, ledgerRes] = await Promise.all([
      supabase
        .from("wallets")
        .select("user_id, wallet_address, is_primary, verified, last_connected_at")
        .eq("verified", true),
      supabase.from("ai_token").select("user_id, balance"),
      supabase.from("ai_energy_ledger").select("wallet_address, amount").eq("type", "els_testnet"),
    ]);

    if (walletsRes.error) throw walletsRes.error;
    if (tokensRes.error) throw tokensRes.error;
    if (ledgerRes.error) throw ledgerRes.error;

    // One wallet per user — prefer is_primary, else most recently connected
    // verified wallet. Same fallback order as getPrimaryVerifiedWallet(),
    // done once here across all users instead of one query per user.
    const walletByUser = new Map<string, { address: string; primary: boolean; lastConnected: string }>();
    for (const row of walletsRes.data ?? []) {
      const existing = walletByUser.get(row.user_id);
      const candidate = { address: row.wallet_address as string, primary: Boolean(row.is_primary), lastConnected: row.last_connected_at as string };
      if (!existing) {
        walletByUser.set(row.user_id, candidate);
        continue;
      }
      if (candidate.primary && !existing.primary) {
        walletByUser.set(row.user_id, candidate);
      } else if (candidate.primary === existing.primary && new Date(candidate.lastConnected) > new Date(existing.lastConnected)) {
        walletByUser.set(row.user_id, candidate);
      }
    }

    const aiEnergyByWallet = new Map<string, number>();
    for (const row of tokensRes.data ?? []) {
      const wallet = walletByUser.get(row.user_id as string);
      if (!wallet) continue; // no verified wallet — can't attribute a balance to an address
      const normalized = wallet.address.toLowerCase();
      aiEnergyByWallet.set(normalized, (aiEnergyByWallet.get(normalized) ?? 0) + Number(row.balance ?? 0));
    }

    const elsByWallet = new Map<string, number>();
    for (const row of ledgerRes.data ?? []) {
      const normalized = (row.wallet_address as string).toLowerCase();
      elsByWallet.set(normalized, (elsByWallet.get(normalized) ?? 0) + Number(row.amount ?? 0));
    }

    const wallets = new Set<string>([...aiEnergyByWallet.keys(), ...elsByWallet.keys()]);
    const contributors = Array.from(wallets)
      .map((wallet) => ({
        wallet,
        els: elsByWallet.get(wallet) ?? 0,
        aiEnergy: aiEnergyByWallet.get(wallet) ?? 0,
      }))
      // A wallet with zero on both metrics has nothing to show on a
      // contributors board — filtered out rather than shown as a 0/0 row.
      .filter((c) => c.els > 0 || c.aiEnergy > 0)
      .sort((a, b) => b.els - a.els || b.aiEnergy - a.aiEnergy)
      .slice(0, 10);

    return NextResponse.json({ contributors, basis: "current_balance" as const });
  } catch (err) {
    console.error("[leaderboard] failed to aggregate:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "leaderboard_unavailable", contributors: [] }, { status: 500 });
  }
}
