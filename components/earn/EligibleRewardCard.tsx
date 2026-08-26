"use client";
import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import Image from "next/image";
import { Trophy, ShoppingCart, Bug, Sparkles, Loader2, CheckCircle2, XCircle, ExternalLink, X } from "lucide-react";
import clsx from "clsx";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

/** ELS token mark — swapped in for the generic Trophy icon wherever this
 * card represents the actual ELS reward being claimed. */
function ElsMark({ size }: { size: number }) {
  return <Image src="/tokens/els-logo.png" alt="ELS" width={size} height={size} style={{ width: size, height: size }} />;
}

// ---------------------------------------------------------------------------
// Phase 6.6.3.2 — Eligible Reward Center. A SEPARATE reward flow from Buy
// ELS/Add Liquidity quest cards (QuestCard.tsx) — this never touches
// reward_submissions or the +25 ELS/+35 AI Energy quest payout. It only
// ever reads GET /api/rewards/eligibility (any wallet, read-only) and, once
// eligible, calls POST /api/rewards/eligibility/claim (session-scoped to
// the caller's own verified wallet — server enforces this, see the route).
// ---------------------------------------------------------------------------

interface EligibilityResult {
  wallet: string;
  rank: number | null;
  isTop10: boolean;
  hasVerifiedBuy: boolean;
  bugBountyCount: number;
  bugBountyBonus: number;
  baseReward: number;
  totalReward: number;
  eligible: boolean;
  alreadyClaimed: boolean;
  reasons: string[];
}

type PipelineStep = "idle" | "checking" | "buy_els" | "leaderboard" | "bug_bounty" | "oracle" | "done";
type ClaimStep = "idle" | "verifying" | "distributing" | "claimed" | "error";

/** The idle, premium "highlight" card shown on /earn — clicking opens the full dashboard. */
export function EligibleRewardCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="relative overflow-hidden rounded-md border border-gold/40 bg-bg-surface p-5 shadow-glow-gold sm:p-6">
        {/* radial glow + subtle shine, same visual language as the Bug Hunter / Faucet blob accents elsewhere on this page, just gold instead of signal/smartmoney */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gold/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-smartmoney/10 blur-3xl" />
        <div className="relative flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/50 bg-gold/10 shadow-glow-gold">
            <ElsMark size={30} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-glow">Eligible Reward Center</p>
            <p className="mt-1 text-sm text-ink-muted">Check your eligibility and claim your verified ELS reward</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="group relative mt-1 overflow-hidden rounded-md border border-gold/50 bg-gold/10 px-5 py-2.5 text-xs font-semibold text-gold-glow transition-colors hover:bg-gold/20"
          >
            <span className="relative z-10">Check Your Eligibility</span>
            {/* subtle shine sweep */}
            <span className="pointer-events-none absolute inset-y-0 -left-1/2 z-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-gold/30 to-transparent transition-transform duration-700 group-hover:translate-x-[250%]" />
          </button>
        </div>
      </section>

      {open && <EligibleRewardDashboard onClose={() => setOpen(false)} />}
    </>
  );
}

function EligibleRewardDashboard({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const [walletInput, setWalletInput] = useState(address ?? "");
  const [step, setStep] = useState<PipelineStep>("idle");
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [claimStep, setClaimStep] = useState<ClaimStep>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (address) setWalletInput(address);
  }, [address]);

  const runCheck = useCallback(async () => {
    if (!walletInput) return;
    setCheckError(null);
    setResult(null);
    setStep("checking");

    try {
      const res = await fetch(`/api/rewards/eligibility?wallet=${walletInput}`);
      const data = await res.json();
      if (!res.ok) {
        setCheckError(data?.message ?? "Could not check eligibility for this address.");
        setStep("idle");
        return;
      }

      // Vertical pipeline reveal — each stage only appears once we already
      // HAVE the real backend result; this is a staged reveal of true data,
      // never a fake intermediate "AI is thinking" state with no basis.
      setStep("buy_els");
      await sleep(500);
      setStep("leaderboard");
      await sleep(500);
      setStep("bug_bounty");
      await sleep(500);
      setStep("oracle");
      await sleep(700);
      setResult(data as EligibilityResult);
      setStep("done");
    } catch {
      setCheckError("Network error — please try again.");
      setStep("idle");
    }
  }, [walletInput]);

  const runClaim = useCallback(async () => {
    setClaimError(null);
    setClaimStep("verifying");
    try {
      await sleep(400);
      setClaimStep("distributing");
      const res = await fetch("/api/rewards/eligibility/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: walletInput }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "CLAIMED") {
        setClaimError(claimErrorMessage(data));
        setClaimStep("error");
        return;
      }
      setTxHash(data.txHash);
      setClaimStep("claimed");
    } catch {
      setClaimError("Network error — please try again.");
      setClaimStep("error");
    }
  }, [walletInput]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-lg border border-gold/40 bg-bg-surface p-5 shadow-glow-gold sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-faint hover:text-ink" aria-label="Close">
          <X size={18} />
        </button>

        {claimStep === "claimed" && txHash ? (
          <ClaimedState totalReward={result?.totalReward ?? 0} txHash={txHash} onClose={onClose} />
        ) : (
          <>
            <div className="mb-4 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/50 bg-gold/10">
                <ElsMark size={26} />
              </div>
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-glow">Claim Your Token</p>
              <p className="mt-1 text-xs text-ink-muted">Verified ELS Reward</p>
            </div>

            <div className="mb-4 flex gap-2">
              <input
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder="0x..."
                className="flex-1 rounded-md border border-line bg-bg-raised/40 px-3 py-2 text-xs text-ink outline-none focus:border-gold/50"
              />
              <button
                onClick={runCheck}
                disabled={step !== "idle" && step !== "done"}
                className="shrink-0 rounded-md border border-gold/50 bg-gold/10 px-4 py-2 text-xs font-semibold text-gold-glow transition-colors hover:bg-gold/20 disabled:opacity-50"
              >
                Check
              </button>
            </div>

            {checkError && <p className="mb-3 text-xs text-down">{checkError}</p>}

            {step !== "idle" && (
              <div className="space-y-2.5 border-t border-line pt-4">
                <PipelineRow
                  icon={<ShoppingCart size={15} />}
                  label="Buy ELS"
                  active={step === "buy_els"}
                  done={["leaderboard", "bug_bounty", "oracle", "done"].includes(step)}
                  result={result ? (result.hasVerifiedBuy ? "Verified" : "Not found") : undefined}
                  ok={result?.hasVerifiedBuy}
                />
                <PipelineRow
                  icon={<Trophy size={15} />}
                  label="Leaderboard"
                  active={step === "leaderboard"}
                  done={["bug_bounty", "oracle", "done"].includes(step)}
                  result={result ? (result.rank ? `Rank #${result.rank}` : "Unranked") : undefined}
                  ok={result?.isTop10}
                />
                <PipelineRow
                  icon={<Bug size={15} />}
                  label="Bug Bounty"
                  active={step === "bug_bounty"}
                  done={["oracle", "done"].includes(step)}
                  result={
                    result
                      ? result.bugBountyCount > 0
                        ? `+${result.bugBountyBonus} ELS bonus`
                        : "No bounty on record"
                      : undefined
                  }
                  ok={result ? result.bugBountyCount > 0 : undefined}
                  optional
                />
                <PipelineRow
                  icon={<Sparkles size={15} />}
                  label="AI Oracle"
                  active={step === "oracle"}
                  done={step === "done"}
                  result={step === "done" ? (result?.eligible ? "Eligibility confirmed" : "Not eligible yet") : undefined}
                  ok={result?.eligible}
                />
              </div>
            )}

            {step === "done" && result && (
              <div className="mt-4 border-t border-line pt-4">
                {result.eligible ? (
                  <>
                    <div className="rounded-md border border-gold/40 bg-gold/5 p-3">
                      <div className="flex justify-between text-xs text-ink-muted">
                        <span>Base Reward</span>
                        <span className="mono-num text-ink">{result.baseReward} ELS</span>
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-ink-muted">
                        <span>Bug Bonus</span>
                        <span className="mono-num text-ink">+{result.bugBountyBonus} ELS</span>
                      </div>
                      <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-semibold">
                        <span className="text-ink">Total</span>
                        <span className="mono-num text-gold-glow">{result.totalReward} ELS</span>
                      </div>
                    </div>

                    {claimError && <p className="mt-2 text-xs text-down">{claimError}</p>}

                    <button
                      onClick={runClaim}
                      disabled={claimStep === "verifying" || claimStep === "distributing"}
                      className="group relative mt-3 w-full overflow-hidden rounded-md border border-gold/50 bg-gold/15 py-2.5 text-xs font-semibold text-gold-glow transition-colors hover:bg-gold/25 disabled:opacity-70"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {claimStep === "verifying" && (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Verifying claim...
                          </>
                        )}
                        {claimStep === "distributing" && (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Distributing ELS...
                          </>
                        )}
                        {(claimStep === "idle" || claimStep === "error") && "Claim Reward"}
                      </span>
                      <span className="pointer-events-none absolute inset-y-0 -left-1/2 z-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-gold/40 to-transparent transition-transform duration-700 group-hover:translate-x-[250%]" />
                    </button>
                  </>
                ) : (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-down">Eligibility Not Complete</p>
                    <ul className="space-y-1">
                      {result.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-ink-muted">
                          <XCircle size={13} className="mt-0.5 shrink-0 text-down" /> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PipelineRow({
  icon,
  label,
  active,
  done,
  result,
  ok,
  optional = false,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  done: boolean;
  result?: string;
  ok?: boolean;
  optional?: boolean;
}) {
  return (
    <div className={clsx("flex items-center gap-2.5 rounded-md border px-3 py-2 transition-colors", active ? "border-gold/40 bg-gold/5" : "border-line bg-bg-raised/30")}>
      <span className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border", active ? "border-gold/50 text-gold-glow" : "border-line text-ink-faint")}>
        {active && !done ? <Loader2 size={14} className="animate-spin" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">{label}</p>
        {result && (
          <p className={clsx("text-[11px]", ok === false && !optional ? "text-down" : ok ? "text-up" : "text-ink-faint")}>{result}</p>
        )}
      </div>
      {done && result && (ok || optional) && <CheckCircle2 size={15} className="shrink-0 text-up" />}
      {done && result && ok === false && !optional && <XCircle size={15} className="shrink-0 text-down" />}
    </div>
  );
}

function ClaimedState({ totalReward, txHash, onClose }: { totalReward: number; txHash: string; onClose: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/50 bg-gold/15 shadow-glow-gold">
        <ElsMark size={30} />
      </div>
      <p className="text-sm font-semibold uppercase tracking-wide text-gold-glow">Reward Claimed ✓</p>
      <p className="mono-num mt-2 text-2xl font-semibold text-ink">{totalReward} ELS</p>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-faint">Transaction confirmed</p>
      <p className="mono-num mt-1 break-all text-xs text-ink-muted">{txHash}</p>
      <a
        href={`${WALLET_NETWORK_CONFIG.explorerUrl}/tx/${txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold text-gold-glow hover:bg-gold/20"
      >
        View on BscScan <ExternalLink size={13} />
      </a>
      {/* Section 12/16 — separate contract, separate flow (ELSTestnetSell,
          not the reward distributor); actual wallet ELS balance is still
          the source of truth on /earn/dex itself, not "claimed" status. */}
      <a
        href="/earn/dex"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-4 py-2 text-xs font-semibold text-signal-glow hover:bg-signal/20"
      >
        Sell ELS to tBNB
      </a>
      <button onClick={onClose} className="mt-3 block w-full text-xs text-ink-faint hover:text-ink">
        Back to Earn
      </button>
    </div>
  );
}

function claimErrorMessage(data: { status?: string; message?: string; reason?: string; detail?: string; reasons?: string[] }): string {
  switch (data.status) {
    case "NOT_ELIGIBLE":
      return data.reasons?.join(" ") ?? "You are not eligible yet.";
    case "ALREADY_CLAIMED":
      return "This wallet has already claimed its Eligible Reward.";
    case "CLAIM_IN_PROGRESS":
      return "A claim is already being processed for this wallet.";
    case "DISTRIBUTOR_NOT_CONFIGURED":
      return data.message ?? "Reward distribution is currently being configured.";
    case "wallet_mismatch":
      return data.message ?? "Wallet mismatch — refresh and try again.";
    case "CLAIM_ERROR":
      // `detail` carries the actual on-chain/backend failure (e.g.
      // "insufficient_distributor_balance: distributor holds 0 ELS, needs
      // 200 ELS..." or a specific revert reason) — `reason` alone is just
      // the generic bucket ("transfer_failed") and hides the real cause.
      return data.detail ?? data.reason ?? "Claim failed — please try again.";
    default:
      return data.message ?? data.detail ?? data.reason ?? "Claim failed — please try again.";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
