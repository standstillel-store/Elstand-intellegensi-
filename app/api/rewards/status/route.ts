import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getEnergyBalance } from "@/lib/energy";
import { listQuests, listUserSubmissions, getWalletElsTestnetBalance } from "@/lib/rewards/store";
import { getReferralSummary } from "@/lib/referral";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import {
  LIQUIDITY_QUEST_CONFIGURED,
  BUY_ELS_QUEST_CONFIGURED,
  BUY_ELS_TESTNET_QUEST_CONFIGURED,
  BUY_ELS_TESTNET_QUEST_CONFIG,
  REWARD_DISTRIBUTOR_CONFIGURED,
  TESTNET_FAUCET_CONFIG,
  TEST_DISTRIBUTE_ENABLED,
} from "@/lib/rewards/config";

// GET /api/rewards/status — powers the Earn & Rewards header (Section 3):
// current AI Energy, ELS Testnet balance if available, connected wallet,
// total earned, completed quests — plus per-quest state for the quest
// cards, in one round trip (same "bundle it" convention as
// app/api/account/me/route.ts).
export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false });

  // Phase 6.6 — "the" wallet for Earn is now the same primary/verified
  // wallet app/api/rewards/verify enforces, not merely "whichever wallet
  // connected most recently" (those could previously disagree, since only
  // the frontend's live wagmi state gated verify at all).
  const [energy, quests, submissions, wallet] = await Promise.all([
    getEnergyBalance(supabase, user.id),
    listQuests(),
    listUserSubmissions(user.id),
    getPrimaryVerifiedWallet(supabase, user.id),
  ]);

  const elsTestnetBalance = wallet ? await getWalletElsTestnetBalance(wallet.wallet_address).catch(() => 0) : 0;
  const referral = await getReferralSummary(user.id, new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.elstand-intellegence.my.id").origin).catch(() => null);

  // Latest submission per quest — what each quest card renders its state
  // machine from. A quest can have many historical submissions (retries,
  // or repeat attempts on a rejected tx); the most recently updated one is
  // the one that matters for "what does this card currently show".
  const latestByQuest = new Map<string, (typeof submissions)[number]>();
  for (const s of submissions) {
    const existing = latestByQuest.get(s.quest_id);
    if (!existing || new Date(s.submitted_at) > new Date(existing.submitted_at)) latestByQuest.set(s.quest_id, s);
  }

  const questStates = quests.map((q) => {
    const latest = latestByQuest.get(q.id);
    const configured =
      q.slug === "add_liquidity"
        ? LIQUIDITY_QUEST_CONFIGURED
        : q.slug === "buy_els"
        ? BUY_ELS_QUEST_CONFIGURED
        : q.slug === "buy_els_testnet"
        ? BUY_ELS_TESTNET_QUEST_CONFIGURED
        : true;
    return {
      slug: q.slug,
      name: q.name,
      description: q.description,
      rewardEls: q.reward_els,
      rewardAiEnergy: q.reward_ai_energy,
      oneTime: q.one_time,
      configured,
      state: !configured ? "COMING_SOON" : latest ? latest.status : "AVAILABLE",
      submission: latest
        ? {
            txHash: latest.tx_hash,
            chainId: latest.chain_id,
            attempts: latest.verification_attempts,
            lastErrorMessage: latest.last_error_message,
            claimedAt: latest.claimed_at,
          }
        : null,
    };
  });

  const totalEarnedAiEnergy = submissions.filter((s) => s.status === "CLAIMED").reduce((sum, s) => {
    const quest = quests.find((q) => q.id === s.quest_id);
    return sum + (quest?.reward_ai_energy ?? 0);
  }, 0);
  const totalEarnedEls = submissions.filter((s) => s.status === "CLAIMED").reduce((sum, s) => {
    const quest = quests.find((q) => q.id === s.quest_id);
    return sum + (quest?.reward_els ?? 0);
  }, 0);

  return NextResponse.json({
    signedIn: true,
    wallet,
    aiEnergyBalance: energy.balance,
    elsTestnetBalance,
    totalEarned: { aiEnergy: totalEarnedAiEnergy, els: totalEarnedEls },
    completedQuestCount: questStates.filter((q) => q.state === "CLAIMED").length,
    quests: questStates,
    referral,
    // Not a quest — the deployed TestnetFaucet's address/chain, so the
    // client can call claim() directly (a normal wallet tx, not something
    // the backend verifies/rewards — free tBNB, not a reward). Exposed
    // here rather than a new NEXT_PUBLIC_ env var: this address isn't
    // secret, and EarnView already fetches this endpoint on load — no
    // duplicate client-side config source needed.
    faucet: { configured: Boolean(TESTNET_FAUCET_CONFIG.address), address: TESTNET_FAUCET_CONFIG.address, chainId: TESTNET_FAUCET_CONFIG.chainId },
    testDistributeEnabled: TEST_DISTRIBUTE_ENABLED && REWARD_DISTRIBUTOR_CONFIGURED,
    // Same reasoning as `faucet` above — this address isn't secret, and
    // the client needs it to call swap()/quote() directly (no external DEX
    // exists for this custom contract). Reusing this endpoint rather than
    // a new NEXT_PUBLIC_ var, same "don't duplicate config" rule as faucet.
    buyElsTestnet: { configured: BUY_ELS_TESTNET_QUEST_CONFIGURED, address: BUY_ELS_TESTNET_QUEST_CONFIG.swapContract, chainId: BUY_ELS_TESTNET_QUEST_CONFIG.chainId },
    // Section 14 — "If distributor address is missing" state. AI Energy
    // above is always a real, immediate balance; ELS Testnet is credited
    // to an internal ledger the moment a quest is CLAIMED either way (see
    // lib/rewards/store.ts), but real on-chain delivery only happens once
    // this is true (lib/rewards/distributor.ts). The frontend uses this to
    // show an honest "still being configured" note instead of implying
    // ELS Testnet already left the distributor's wallet.
    distributorConfigured: REWARD_DISTRIBUTOR_CONFIGURED,
  });
}
