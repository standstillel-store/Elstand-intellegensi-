"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import {
  Gift,
  Zap,
  ArrowUpRight,
  Loader2,
  Droplets,
  Flame,
  ShoppingCart,
  Wallet as WalletIcon,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Waves,
} from "lucide-react";
import clsx from "clsx";
import { timeAgo } from "@/lib/format";
import { QuestCard, type QuestState } from "./QuestCard";
import { ReferralCard } from "./ReferralCard";
import { FaucetClaimCard } from "./FaucetClaimCard";
import { TestDistributeButton } from "./TestDistributeButton";

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

/**
 * Buy ELS reuses the same ELS/native Uniswap V4 pool as Add Liquidity — no
 * dedicated purchase contract exists or is being deployed. This sends the
 * user to Uniswap's own swap UI for the pair; Uniswap's router picks the
 * best/only available ELS pool for that pair automatically. If a second
 * ELS pool with a different fee tier is ever created, this URL doesn't
 * force this specific one — noted as a limitation, not silently assumed
 * away.
 */
const BUY_ELS_SWAP_URL = "https://app.uniswap.org/swap?chain=bnb&inputCurrency=NATIVE&outputCurrency=0x3a0664300EA06Ba7c01EDC9951c1b04BE9101C82";

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
  faucet: { configured: boolean; address: `0x${string}` | null; chainId: number };
  testDistributeEnabled: boolean;
  buyElsTestnet: { configured: boolean; address: `0x${string}` | null; chainId: number };
}

// ---------------------------------------------------------------------------
// PHASE 6.6.3.1 — "Earn Command Center" UI/UX polish. Pure presentation
// restructure of the same data/handlers the page already had (loadEnergy,
// loadRewards, handleClaim, verifyQuest, claimQuest, and every quest's
// href/state) — no new endpoints, no changed reward math, no touched
// verification logic. See EARN_CENTER_FILTERS below for the one bit of new
// client-side derived state (a view filter over quest.state), which reads
// existing data and writes nothing.
// ---------------------------------------------------------------------------

type EarnFilter = "all" | "available" | "in_progress" | "completed";

const EARN_FILTERS: { key: EarnFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

/** Buckets an existing QuestState into a filter tab — display grouping only. */
function bucketOf(state: QuestState): Exclude<EarnFilter, "all"> {
  if (state === "CLAIMED") return "completed";
  if (state === "AVAILABLE" || state === "COMING_SOON") return "available";
  return "in_progress"; // SUBMITTED / VERIFYING / VALID / CLAIMABLE / CLAIMING / SYSTEM_ERROR / CLAIM_ERROR / INVALID
}

export function EarnView() {
  const { address: connectedWallet } = useAccount();
  const { open: openWalletConnect } = useAppKit();
  const [data, setData] = useState<EnergyData | null | "unauth">(null);
  const [claiming, setClaiming] = useState(false);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [rewards, setRewards] = useState<RewardsStatus | null>(null);
  const [filter, setFilter] = useState<EarnFilter>("available");
  // Phase 6.6 — a wallet-mismatch/no-linked-wallet rejection from
  // /api/rewards/verify happens BEFORE a submission row exists, so it
  // can't be read back from rewards.quests[].submission on the next poll
  // like every other error state can. Tracked separately per quest slug so
  // the message isn't lost the moment loadRewards() re-runs.
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

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
    setSubmitErrors((prev) => ({ ...prev, [slug]: "" }));
    try {
      const res = await fetch("/api/rewards/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quest: slug, txHash, walletAddress: connectedWallet }),
      });
      const json = await res.json().catch(() => null);
      // A rejection before any submission row exists (no linked wallet /
      // wallet mismatch) has no `submission` for the quest-state poll
      // below to surface — show it directly from this response instead.
      if (json?.status === "INVALID" && res.status === 409) {
        setSubmitErrors((prev) => ({ ...prev, [slug]: json.reason ?? "This wallet cannot be used for this quest." }));
      }
    } catch {
      // Network failure — loadRewards() below will just show the quest's
      // last known state; no need for a separate message here.
    }
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

  const liquidityState: QuestState = (liquidityQuest?.state as QuestState) ?? "AVAILABLE";
  const buyElsState: QuestState = (buyElsQuest?.state as QuestState) ?? "COMING_SOON";
  // Referral has no tx-based state machine (server-driven by the onboarding
  // hook, see ReferralCard) — treated as an evergreen "available" quest for
  // filtering, same bucket regardless of how many friends were rewarded.
  const referralBucket: Exclude<EarnFilter, "all"> = "available";
  const showBuyElsTestnet = Boolean(rewards?.buyElsTestnet?.configured && rewards.buyElsTestnet.address);

  const visibleCount = useMemo(() => {
    if (!rewards) return 0;
    let n = 0;
    if (rewards.referral && (filter === "all" || filter === referralBucket)) n += 1;
    if (filter === "all" || filter === bucketOf(liquidityState)) n += 1;
    if (filter === "all" || filter === bucketOf(buyElsState)) n += 1;
    if (showBuyElsTestnet && (filter === "all" || filter === "available")) n += 1;
    return n;
  }, [rewards, filter, liquidityState, buyElsState, showBuyElsTestnet, referralBucket]);

  return (
    <div className="space-y-5">
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
          {/* EARN OVERVIEW — AI Energy & ELS Testnet are primary metrics
              (bigger figure, colored + glowing icon); Wallet/Completed stay compact. */}
          <section className="rounded-md border border-line bg-bg-surface p-4 shadow-card">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Earn Overview</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBlock
                icon={<Zap size={15} />}
                iconClassName="border-signal/30 bg-signal/10 text-signal-glow shadow-glow-signal"
                label="AI Energy"
                value={rewards?.aiEnergyBalance ?? data.balance}
                primary
              />
              <StatBlock
                icon={<Flame size={15} />}
                iconClassName="border-amber/30 bg-amber/10 text-amber shadow-glow-amber"
                label="ELS Testnet"
                value={rewards?.elsTestnetBalance ?? 0}
                primary
              />
              <StatBlock
                icon={<WalletIcon size={14} />}
                iconClassName="border-smartmoney/30 bg-smartmoney/10 text-smartmoney-glow shadow-glow-smartmoney"
                label="Wallet"
                value={connectedWallet ? `${connectedWallet.slice(0, 6)}…${connectedWallet.slice(-4)}` : "Not connected"}
                mono={false}
              />
              <StatBlock
                icon={<CheckCircle2 size={14} />}
                iconClassName="border-up/30 bg-up/10 text-up shadow-glow-up"
                label="Completed"
                value={rewards?.completedQuestCount ?? 0}
              />
            </div>
            {rewards && !rewards.distributorConfigured && (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-faint">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-signal-glow" />
                Testnet reward distribution is currently being configured. ELS Testnet amounts above are recorded and your eligibility is preserved, but haven&apos;t been sent on-chain yet.
              </p>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* EARN CENTER — quest list with a lightweight view filter over
                each quest's existing state. Filtering is display-only: it
                never changes which quests exist, their configured/state, or
                any submit/verify/claim call below. */}
            <section className="rounded-md border border-line bg-bg-surface p-4 shadow-card lg:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Earn Center</p>
                <div className="flex flex-wrap gap-1 rounded-md border border-line bg-bg-raised/60 p-0.5">
                  {EARN_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={clsx(
                        "rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        filter === f.key
                          ? "bg-signal/20 text-signal-glow shadow-glow-signal"
                          : "text-ink-muted hover:text-ink"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {rewards?.referral && (filter === "all" || filter === referralBucket) && (
                  <ReferralCard
                    referralUrl={rewards.referral.referralUrl}
                    referralCode={rewards.referral.code}
                    totalReferred={rewards.referral.totalReferred}
                    totalRewarded={rewards.referral.totalRewarded}
                  />
                )}

                {!connectedWallet && visibleCount > (rewards?.referral ? 1 : 0) && (
                  <div className="rounded-md border border-line bg-bg-raised/40 p-3 text-[11px] text-ink-faint">
                    Connect a wallet to submit and verify on-chain quests below.
                  </div>
                )}

                {(filter === "all" || filter === bucketOf(liquidityState)) && (
                  <QuestCard
                    icon={<Droplets size={16} />}
                    title="Provide ELS Liquidity"
                    rewardLabel="+15 ELS TESTNET · +35 AI ENERGY"
                    state={liquidityState}
                    lastErrorMessage={liquidityQuest?.submission?.lastErrorMessage}
                    blockingError={submitErrors.add_liquidity || null}
                    actionLabel="Add Liquidity"
                    actionHref={liquidityQuest?.state === "AVAILABLE" || !liquidityQuest?.submission ? ADD_LIQUIDITY_URL : undefined}
                    walletConnected={Boolean(connectedWallet)}
                    onConnectWallet={() => openWalletConnect()}
                    onVerify={(txHash) => verifyQuest("add_liquidity", txHash)}
                    onClaim={() => claimQuest("add_liquidity", liquidityQuest?.submission?.txHash ?? "")}
                  />
                )}

                {(filter === "all" || filter === bucketOf(buyElsState)) && (
                  <QuestCard
                    icon={<ShoppingCart size={16} />}
                    title="Buy ELS"
                    rewardLabel="+25 ELS TESTNET · +35 AI ENERGY"
                    description={buyElsQuest?.configured ? undefined : "Coming soon — purchase infrastructure not yet configured."}
                    state={buyElsState}
                    lastErrorMessage={buyElsQuest?.submission?.lastErrorMessage}
                    blockingError={submitErrors.buy_els || null}
                    actionLabel="Buy ELS"
                    actionHref={buyElsQuest?.state === "AVAILABLE" || !buyElsQuest?.submission ? BUY_ELS_SWAP_URL : undefined}
                    walletConnected={Boolean(connectedWallet)}
                    onConnectWallet={() => openWalletConnect()}
                    onVerify={(txHash) => verifyQuest("buy_els", txHash)}
                    onClaim={() => claimQuest("buy_els", buyElsQuest?.submission?.txHash ?? "")}
                  />
                )}

                {/* No external DEX exists for our custom testnet Swap contract. Phase
                    6.6.2: instead of doing the swap inline in a compact widget, this
                    now leads into the full Elstand DEX page (app/earn/dex/page.tsx +
                    ElstandDexView.tsx), which does the actual swap/verify/claim. */}
                {showBuyElsTestnet && (filter === "all" || filter === "available") && (
                  <div className="rounded-md border border-line bg-bg-raised/60 p-3.5 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal-glow shadow-glow-signal">
                          <ShoppingCart size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">Buy ELS (Testnet)</p>
                          <p className="text-xs font-semibold text-signal-glow">+25 ELS TESTNET · +35 AI ENERGY</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal-glow">
                        Available
                      </span>
                    </div>
                    <a
                      href="/earn/dex"
                      className="mt-3 inline-block rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow transition-colors hover:bg-signal/20"
                    >
                      Open Elstand DEX
                    </a>
                  </div>
                )}

                {visibleCount === 0 && (
                  <div className="rounded-md border border-dashed border-line p-4 text-center text-[11px] text-ink-faint">
                    No quests in this view yet.
                  </div>
                )}
              </div>
            </section>

            {/* Right rail — Daily Reward (utility card, not a quest) + Recent Activity. */}
            <div className="space-y-4">
              <section className="rounded-md border border-line bg-bg-surface p-4 shadow-card">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Daily Reward</p>
                <div className="rounded-md border border-line bg-bg-raised/60 p-3.5 shadow-card">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal-glow shadow-glow-signal">
                      <Gift size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">Daily Reward</p>
                      <p className="text-xs font-semibold text-signal-glow">+10 AI ENERGY</p>
                    </div>
                  </div>

                  {claimNotice && <p className="mt-2 text-[11px] text-ink-faint">{claimNotice}</p>}

                  {data.canClaim ? (
                    <button
                      onClick={handleClaim}
                      disabled={claiming}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-3 py-2 text-xs font-semibold text-signal-glow transition-colors hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {claiming && <Loader2 size={12} className="animate-spin" />}
                      {claiming ? "Mengklaim…" : "Claim Now"}
                    </button>
                  ) : (
                    <div className="mt-3">
                      <p className="text-[10px] uppercase tracking-wide text-ink-faint">Available in</p>
                      <DailyRewardCountdown nextClaimAt={data.nextClaimAt} />
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-md border border-line bg-bg-surface p-4 shadow-card">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Recent Activity</p>
                {rewardHistory.length === 0 && <p className="text-xs text-ink-faint">Belum ada reward yang diklaim.</p>}
                {rewardHistory.length > 0 && (
                  <div className="space-y-2.5">
                    {rewardHistory.slice(0, 8).map((tx) => (
                      <div key={tx.id} className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-up/10 text-up shadow-glow-up">
                          <ArrowUpRight size={12} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-ink-muted">{REASON_LABEL[tx.reason] ?? tx.reason}</p>
                          <p className="mono-num text-[11px] text-ink-faint">
                            +{tx.delta} AI Energy · {timeAgo(tx.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* QUICK ACTIONS — compact shortcuts. Buy ELS / Add Liquidity link
              straight out to the same destinations their Earn Center cards
              use; Faucet / Report a Bug jump to the full sections below
              (both need more than a link — wallet/cooldown state and a
              report form respectively — so the tile scrolls to the real
              thing instead of duplicating it). */}
          <section className="rounded-md border border-line bg-bg-surface p-4 shadow-card">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <QuickActionTile href={BUY_ELS_SWAP_URL} external icon={<ShoppingCart size={16} />} label="Buy ELS" />
              <QuickActionTile href={ADD_LIQUIDITY_URL} external icon={<Droplets size={16} />} label="Add Liquidity" />
              <QuickActionTile href="#faucet" icon={<Waves size={16} />} label="Testnet Faucet" />
              <QuickActionTile href="#report-bug" icon={<Bug size={16} />} label="Report Bug" />
            </div>
          </section>

          {/* Bug Hunter + Testnet Faucet — the two "utility" destinations,
              framed side by side as illustrated cards (glow blob + rotated
              icon badge) per reference. Each keeps its real functionality:
              FaucetClaimCard is the exact same wallet-connected component
              used before (untouched), and Report a Bug still links to the
              existing /earn/bug-hunter flow — only the shell around them
              changed. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section id="report-bug" className="scroll-mt-24 relative overflow-hidden rounded-md border border-line bg-bg-surface p-4 shadow-card">
              <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-signal/25 blur-3xl" />
              <div className="pointer-events-none absolute right-5 top-5 flex h-14 w-14 rotate-45 items-center justify-center rounded-2xl border border-signal/40 bg-signal/10 shadow-glow-signal">
                <Bug size={22} className="-rotate-45 text-signal-glow" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-signal-glow">Bug Hunter</p>
              <p className="mt-1 max-w-[70%] text-sm font-medium text-ink">Found a vulnerability?</p>
              <p className="mt-1 max-w-[75%] text-xs text-ink-muted">
                Temukan bug di ELSTAND Intelligence? Laporkan dan dapatkan reward ELS.
              </p>
              <a
                href="/earn/bug-hunter"
                className="mt-3 inline-block rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow transition-colors hover:bg-signal/20"
              >
                Report a Bug
              </a>
            </section>

            {rewards?.faucet?.configured && rewards.faucet.address && (
              <section id="faucet" className="scroll-mt-24 relative overflow-hidden rounded-md border border-line bg-bg-surface p-4 shadow-card">
                <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-smartmoney/25 blur-3xl" />
                <div className="pointer-events-none absolute right-5 top-5 flex h-14 w-14 rotate-45 items-center justify-center rounded-2xl border border-smartmoney/40 bg-smartmoney/10 shadow-glow-smartmoney">
                  <Waves size={22} className="-rotate-45 text-smartmoney-glow" />
                </div>
                <p className="mb-3 max-w-[70%] text-[10px] font-semibold uppercase tracking-wide text-smartmoney-glow">Testnet Faucet</p>
                <FaucetClaimCard address={rewards.faucet.address} chainId={rewards.faucet.chainId} />
              </section>
            )}
          </div>

          {/* TEMPORARY — see components/earn/TestDistributeButton.tsx. Only renders when ENABLE_TEST_DISTRIBUTE=true server-side; remove once ELSTestnetSwap exists. */}
          {rewards?.testDistributeEnabled && <TestDistributeButton />}
        </>
      )}
    </div>
  );
}

function StatBlock({
  icon,
  iconClassName,
  label,
  value,
  mono = true,
  primary = false,
}: {
  icon: React.ReactNode;
  iconClassName?: string;
  label: string;
  value: string | number;
  mono?: boolean;
  primary?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-bg-raised/40 p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
        <span className={clsx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", iconClassName)}>{icon}</span>
        {label}
      </p>
      <p className={clsx("mt-1.5 font-semibold text-ink", primary ? "text-xl" : "text-sm", mono && "mono-num")}>{value}</p>
    </div>
  );
}

/**
 * Ticks down a real server-provided timestamp (rewards.nextClaimAt, same
 * value the old `timeUntil()` text used) once a second on the client — no
 * invented duration, just a live display of an already-real deadline.
 */
function DailyRewardCountdown({ nextClaimAt }: { nextClaimAt: string }) {
  const target = useMemo(() => new Date(nextClaimAt).getTime(), [nextClaimAt]);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    setRemainingMs(Math.max(0, target - Date.now()));
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, target - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  const totalSeconds = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const display = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return <p className="mono-num text-2xl font-semibold text-ink">{display}</p>;
}

function QuickActionTile({
  href,
  external = false,
  icon,
  label,
}: {
  href: string;
  external?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-md border border-line bg-bg-raised/40 px-2 py-3 text-center shadow-card transition-all hover:-translate-y-0.5 hover:border-signal/40 hover:bg-signal/10 hover:shadow-glow-signal"
    >
      <span className="text-signal-glow">{icon}</span>
      <span className="text-[11px] font-medium text-ink-muted">{label}</span>
    </a>
  );
}
