import { getSupabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Extracted from app/api/leaderboard/route.ts (Phase 6.6.3.2) so the
// Eligible Reward eligibility check (lib/rewards/eligibility.ts) can look up
// a single wallet's exact rank — including wallets ranked below #10, which
// the public /api/leaderboard endpoint never returns since it slices to
// top 10 — without standing up a second leaderboard computation. The
// ranking rule itself (ELS Testnet earned desc, AI Energy balance desc as
// tiebreaker, same two source tables) is unchanged and lives in exactly
// one place now.
// ---------------------------------------------------------------------------

export interface LeaderboardContributor {
  wallet: string;
  els: number;
  aiEnergy: number;
}

/**
 * Full ranked contributor list (NOT sliced to top 10) — same computation
 * app/api/leaderboard/route.ts used to do inline. Returns [] (never throws)
 * if Supabase isn't configured or a query fails, matching the previous
 * route's own error handling; callers that need to distinguish "no data"
 * from "lookup failed" should catch upstream if that ever matters.
 */
export async function getRankedContributors(): Promise<LeaderboardContributor[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const [walletsRes, tokensRes, ledgerRes] = await Promise.all([
    supabase
      .from("wallets")
      .select("user_id, wallet_address, is_primary, verified, last_connected_at")
      .eq("verified", true),
    supabase.from("ai_token").select("user_id, balance"),
    supabase.from("ai_energy_ledger").select("wallet_address, amount").eq("type", "els_testnet"),
  ]);

  if (walletsRes.error || tokensRes.error || ledgerRes.error) return [];

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
    if (!wallet) continue;
    const normalized = wallet.address.toLowerCase();
    aiEnergyByWallet.set(normalized, (aiEnergyByWallet.get(normalized) ?? 0) + Number(row.balance ?? 0));
  }

  const elsByWallet = new Map<string, number>();
  for (const row of ledgerRes.data ?? []) {
    const normalized = (row.wallet_address as string).toLowerCase();
    elsByWallet.set(normalized, (elsByWallet.get(normalized) ?? 0) + Number(row.amount ?? 0));
  }

  const wallets = new Set<string>([...aiEnergyByWallet.keys(), ...elsByWallet.keys()]);
  return Array.from(wallets)
    .map((wallet) => ({ wallet, els: elsByWallet.get(wallet) ?? 0, aiEnergy: aiEnergyByWallet.get(wallet) ?? 0 }))
    .filter((c) => c.els > 0 || c.aiEnergy > 0)
    .sort((a, b) => b.els - a.els || b.aiEnergy - a.aiEnergy);
}

/** Rank (1-indexed) of a specific wallet in the full contributor ranking, or null if it has no ranked activity at all. */
export async function getWalletRank(walletAddress: string): Promise<number | null> {
  const normalized = walletAddress.toLowerCase();
  const ranked = await getRankedContributors();
  const index = ranked.findIndex((c) => c.wallet === normalized);
  return index === -1 ? null : index + 1;
}
