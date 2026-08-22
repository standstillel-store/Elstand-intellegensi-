import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getEnergyBalance } from "@/lib/energy";
import { listQuests, listUserSubmissions, getWalletElsTestnetBalance } from "@/lib/rewards/store";
import { getReferralSummary } from "@/lib/referral";
import { LIQUIDITY_QUEST_CONFIGURED, BUY_ELS_QUEST_CONFIGURED } from "@/lib/rewards/config";

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

  const [energy, quests, submissions, { data: wallets }] = await Promise.all([
    getEnergyBalance(supabase, user.id),
    listQuests(),
    listUserSubmissions(user.id),
    supabase.from("wallets").select("wallet_address, wallet_type, chain_id").eq("user_id", user.id).order("last_connected_at", { ascending: false }).limit(1),
  ]);

  const wallet = wallets?.[0] ?? null;
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
    const configured = q.slug === "add_liquidity" ? LIQUIDITY_QUEST_CONFIGURED : q.slug === "buy_els" ? BUY_ELS_QUEST_CONFIGURED : true;
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
  });
}
