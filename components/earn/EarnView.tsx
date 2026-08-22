"use client";
import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { Gift, Zap, ArrowUpRight, Loader2, Droplets, ShoppingCart, Wallet as WalletIcon, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { timeAgo, timeUntil } from "@/lib/format";
import { QuestCard, type QuestState } from "./QuestCard";
import { ReferralCard } from "./ReferralCard";

interface EnergyTransaction {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

interface EnergyData {
  balance: number;
  nextClaimAt: string;
  canClaim: boolean;
  transactions: EnergyTransaction[];
}

const REASON_LABEL: Record<string, string> = {
  analyze_coin: "Analyze Coin",
  generate_signal: "Generate AI Signal",
  ai_chat: "AI Agent Chat",
  daily_claim: "Daily Reward",
  analyze_coin_refund: "Refund — Analyze Coin gagal",
  generate_signal_refund: "Refund — Signal gagal",
  ai_chat_refund: "Refund — AI Chat gagal",
  chat: "AI Chat",
  ai_signal_generate: "AI Signal (single)",
  ai_signal_scan: "AI Signal (full scan)",
  chart_analysis: "Chart Analysis",
  token_analysis: "Token Analyzer",
  daily_reset: "Daily reset",
  "reward:referral": "Referral Reward",
  "reward:add_liquidity": "Add Liquidity Reward",
  "reward:buy_els": "Buy ELS Reward",
};

const ADD_LIQUIDITY_URL =
  "https://app.uniswap.org/positions/create/v4?currencyA=NATIVE&currencyB=0x3a0664300EA06Ba7c01EDC9951c1b04BE9101C82&chain=bnb&fee=%7B%22feeAmount%22%3A375%2C%22tickSpacing%22%3A4%2C%22isDynamic%22%3Afalse%7D&hook=undefined&priceRangeState=%7B%22priceInverted%22%3Afalse%2C%22fullRange%22%3Afalse%2C%22minTick%22%3A108188%2C%22maxTick%22%3A108212%2C%22initialPrice%22%3A%22%22%2C%22inputMode%22%3A%22price%22%7D&depositState=%7B%22exactField%22%3A%22TOKEN0%22%2C%22exactAmounts%22%3A%7B%7D%7D&step=1";

interface QuestStatus {
  slug: string;
  name: string;
  description: string | null;
  rewardEls: number;
  rewardAiEnergy: number;
  oneTime: boolean;
  configured: boolean;
  state: QuestState;
  submission: { txHash: string; lastErrorMessage: string | null } | null;
}

interface RewardsStatus {
  wallet: { wallet_address: string } | null;
  aiEnergyBalance: number;
  elsTestnetBalance: number;
  totalEarned: { aiEnergy: number; els: number };
  completedQuestCount: number;
  quests: QuestStatus[];
  referral: { code: string; referralUrl: string; totalReferred: number; totalRewarded: number } | null;
  distributorConfigured: boolean;
}

export function EarnView() {
  const { address: connectedWallet } = useAccount();
  const { open: openWalletConnect } = useAppKit();
  const [data, setData] = useState<EnergyData | null | "unauth">(null);
  const [claiming, setClaiming] = useState(false);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [rewards, setRewards] = useState<RewardsStatus | null>(null);

  const loadEnergy = useCallback(() => {
    return fetch("/api/ai-energy")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData("unauth"));
  }, []);

  const loadRewards = useCallback(() => {
    return fetch("/api/rewards/status")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (json.signedIn) setRewards(json);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadEnergy();
    loadRewards();
  }, [loadEnergy, loadRewards]);

  async function handleClaim() {
    setClaiming(true);
    setClaimNotice(null);
    try {
      await fetch("/api/ai-energy/claim", { method: "POST" });
      await loadEnergy();
    } catch {
      setClaimNotice("Gagal klaim — coba lagi sebentar.");
    } finally {
      setClaiming(false);
    }
  }

  async function verifyQuest(slug: string, txHash: string) {
    if (!connectedWallet) return;
    await fetch("/api/rewards/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quest: slug, txHash, walletAddress: connectedWallet }),
    }).catch(() => undefined);
    await Promise.all([loadRewards(), loadEnergy()]);
  }

  async function claimQuest(slug: string, txHash: string) {
    await fetch("/api/rewards/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quest: slug, txHash }),
    }).catch(() => undefined);
    await Promise.all([loadRewards(), loadEnergy()]);
  }

  const rewardHistory = data && data !== "unauth" ? data.transactions.filter((tx) => tx.delta > 0) : [];

  const liquidityQuest = rewards?.quests.find((q) => q.slug === "add_liquidity");
  const buyElsQuest = rewards?.quests.find((q) => q.slug === "buy_els");

  return (
    <div className="space-y-6">
      {data === null && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-bg-surface p-4 text-xs text-ink-faint">
          <Loader2 size={14} className="animate-spin" /> Memuat…
        </div>
      )}

      {data === "unauth" && (
        <div className="rounded-md border border-line bg-bg-surface p-4 text-xs text-ink-faint">
          Sign in untuk melihat Earn kamu.
        </div>
      )}

      {data && data !== "unauth" && (
        <>
          {/* Header — brief Section 3: AI Energy, ELS Testnet balance, wallet, total earned, completed quests. */}
          <section className="rounded-md border border-line bg-bg-surface p-4">
            <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-faint">Earn &amp; Rewards</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBlock icon={<Zap size={13} className="text-signal-glow" />} label="AI Energy" value={rewards?.aiEnergyBalance ?? data.balance} />
              <StatBlock icon={<Droplets size={13} className="text-signal-glow" />} label="ELS Testnet" value={rewards?.elsTestnetBalance ?? 0} />
              <StatBlock icon={<WalletIcon size={13} className="text-signal-glow" />} label="Wallet" value={connectedWallet ? `${connectedWallet.slice(0, 6)}…${connectedWallet.slice(-4)}` : "Not connected"} mono={false} />
              <StatBlock icon={<Gift size={13} className="text-signal-glow" />} label="Completed" value={rewards?.completedQuestCount ?? 0} />
            </div>
            {rewards && !rewards.distributorConfigured && (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-faint">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-signal-glow" />
                Testnet reward distribution is currently being configured. ELS Testnet amounts above are recorded and your eligibility is preserved, but haven&apos;t been sent on-chain yet.
              </p>
            )}
          </section>

          {/* Active quests */}
          <section className="rounded-md border border-line bg-bg-surface p-4">
            <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-faint">Active Quests</p>
            <div className="space-y-3">
              {rewards?.referral && (
                <ReferralCard
                  referralUrl={rewards.referral.referralUrl}
                  referralCode={rewards.referral.code}
                  totalReferred={rewards.referral.totalReferred}
                  totalRewarded={rewards.referral.totalRewarded}
                />
              )}

              {!connectedWallet && (
                <div className="rounded-md border border-line bg-bg-raised/40 p-3 text-[11px] text-ink-faint">
                  Connect a wallet to submit and verify on-chain quests below.
                </div>
              )}

              <QuestCard
                icon={<Droplets size={16} />}
                title="Provide ELS Liquidity"
                rewardLabel="+15 ELS TESTNET · +35 AI ENERGY"
                state={(liquidityQuest?.state as QuestState) ?? "AVAILABLE"}
                lastErrorMessage={liquidityQuest?.submission?.lastErrorMessage}
                actionLabel="Add Liquidity"
                actionHref={liquidityQuest?.state === "AVAILABLE" || !liquidityQuest?.submission ? ADD_LIQUIDITY_URL : undefined}
                walletConnected={Boolean(connectedWallet)}
                onConnectWallet={() => openWalletConnect()}
                onVerify={(txHash) => verifyQuest("add_liquidity", txHash)}
                onClaim={() => claimQuest("add_liquidity", liquidityQuest?.submission?.txHash ?? "")}
              />

              <QuestCard
                icon={<ShoppingCart size={16} />}
                title="Buy ELS"
                rewardLabel="+25 ELS TESTNET · +35 AI ENERGY"
                description={buyElsQuest?.configured ? undefined : "Coming soon — purchase contract not yet deployed."}
                state={(buyElsQuest?.state as QuestState) ?? "COMING_SOON"}
                lastErrorMessage={buyElsQuest?.submission?.lastErrorMessage}
                walletConnected={Boolean(connectedWallet)}
                onConnectWallet={() => openWalletConnect()}
                onVerify={(txHash) => verifyQuest("buy_els", txHash)}
                onClaim={() => claimQuest("buy_els", buyElsQuest?.submission?.txHash ?? "")}
              />
            </div>
          </section>

          {/* Daily Reward claim — pre-existing mechanic, unchanged. */}
          <section className="rounded-md border border-line bg-bg-surface p-4">
            <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-faint">Daily Reward</p>
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-raised/60 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal-glow">
                  <Gift size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">Daily Reward</p>
                  <p className="text-xs text-ink-faint">
                    {claimNotice ??
                      (data.canClaim ? "+10 AI Energy siap diklaim sekarang." : `Tersedia lagi ${timeUntil(data.nextClaimAt)}.`)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClaim}
                disabled={!data.canClaim || claiming}
                className={clsx(
                  "shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                  data.canClaim && !claiming
                    ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20"
                    : "cursor-not-allowed border-line text-ink-faint"
                )}
              >
                {claiming ? "Mengklaim…" : "Klaim +10"}
              </button>
            </div>
          </section>

          {/* Completed — reward transactions only (positive deltas). */}
          <section className="rounded-md border border-line bg-bg-surface p-4">
            <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-faint">Completed</p>
            {rewardHistory.length === 0 && <p className="text-xs text-ink-faint">Belum ada reward yang diklaim.</p>}
            {rewardHistory.length > 0 && (
              <div className="space-y-1.5">
                {rewardHistory.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <ArrowUpRight size={12} className="text-up" />
                      {REASON_LABEL[tx.reason] ?? tx.reason}
                    </span>
                    <span className="mono-num text-ink-faint">
                      +{tx.delta} · {timeAgo(tx.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatBlock({ icon, label, value, mono = true }: { icon: React.ReactNode; label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-bg-raised/40 p-2.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
        {icon} {label}
      </p>
      <p className={clsx("mt-1 text-sm font-semibold text-ink", mono && "mono-num")}>{value}</p>
    </div>
  );
}
