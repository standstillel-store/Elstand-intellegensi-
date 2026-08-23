"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle, RefreshCw, Copy, Check } from "lucide-react";
import clsx from "clsx";

// ---------------------------------------------------------------------------
// Renders exactly the state machine from brief Section 3/17:
// NOT_STARTED → SUBMITTED → VERIFYING → VALID → CLAIMABLE → CLAIMING → CLAIMED
// with SYSTEM_ERROR / CLAIM_ERROR / INVALID as side states, each with the
// specific copy and button the brief calls for. This component owns none of
// the actual verify/claim network calls — it's driven by (state, onVerify,
// onClaim) props from EarnView so the same shape can back Add Liquidity and
// Buy ELS without duplicating the state-machine logic.
// ---------------------------------------------------------------------------

export type QuestState =
  | "AVAILABLE"
  | "COMING_SOON"
  | "SUBMITTED"
  | "VERIFYING"
  | "VALID"
  | "CLAIMABLE"
  | "CLAIMING"
  | "CLAIMED"
  | "SYSTEM_ERROR"
  | "CLAIM_ERROR"
  | "INVALID";

interface QuestCardProps {
  icon: React.ReactNode;
  title: string;
  rewardLabel: string;
  description?: string;
  state: QuestState;
  lastErrorMessage?: string | null;
  /**
   * Phase 6.6 — a rejection that happened BEFORE a submission row was
   * created (no linked wallet, or connected wallet ≠ verified linked
   * wallet — see app/api/rewards/verify/route.ts). Distinct from
   * `lastErrorMessage` (which comes from a submission row's own INVALID
   * state) because this case never gets one. Shown above the tx-hash
   * input regardless of `state`; cleared by the parent on the next
   * verify attempt.
   */
  blockingError?: string | null;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  onVerify: (txHash: string) => Promise<void>;
  onClaim: () => Promise<void>;
  /**
   * Whether a wallet is currently connected. Section 6 of the brief:
   * "COMING SOON" must never depend on wallet-connection state — a quest
   * that's genuinely live/configured stays ACTIVE (its real backend
   * `state`) whether or not a wallet happens to be connected right now.
   * This prop only gates the INTERACTIVE part of the card (the tx-hash
   * form / claim button / external action link) behind a "Connect
   * Wallet" prompt — it never downgrades the badge/state itself.
   */
  walletConnected: boolean;
  onConnectWallet?: () => void;
}

export function QuestCard({ icon, title, rewardLabel, description, state, lastErrorMessage, blockingError, actionLabel, actionHref, onAction, onVerify, onClaim, walletConnected, onConnectWallet }: QuestCardProps) {
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);

  // A quest that's actually live/configured but has no wallet connected
  // yet needs the wallet before any of its interactive states (AVAILABLE
  // / tx submission / claim) can proceed — but COMING_SOON (genuinely not
  // configured) and CLAIMED (already-settled history) render exactly the
  // same regardless of wallet connection.
  const needsWalletFirst = !walletConnected && state !== "COMING_SOON" && state !== "CLAIMED";

  async function handleVerify() {
    if (!txHash.trim()) return;
    setBusy(true);
    try {
      await onVerify(txHash.trim());
    } finally {
      setBusy(false);
    }
  }

  async function handleClaim() {
    setBusy(true);
    try {
      await onClaim();
    } finally {
      setBusy(false);
    }
  }

  const isTxStage = ["SUBMITTED", "VERIFYING", "SYSTEM_ERROR", "INVALID"].includes(state);
  const showRetryVerification = state === "SYSTEM_ERROR";
  const showClaim = state === "CLAIMABLE";
  const showRetryClaim = state === "CLAIM_ERROR";

  return (
    <div className="rounded-md border border-line bg-bg-raised/60 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal-glow">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{title}</p>
            <p className="text-xs font-semibold text-signal-glow">{rewardLabel}</p>
            {description && <p className="mt-0.5 text-[11px] text-ink-faint">{description}</p>}
          </div>
        </div>
        <StatusBadge state={state} />
      </div>

      {state === "COMING_SOON" && (
        <p className="mt-3 text-[11px] text-ink-faint">This quest isn't live on this deployment yet.</p>
      )}

      {!needsWalletFirst && blockingError && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md border border-down/30 bg-down/5 px-2.5 py-2 text-[11px] text-down">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {blockingError}
        </p>
      )}

      {needsWalletFirst && (
        <button
          onClick={onConnectWallet}
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow transition-colors hover:bg-signal/20"
        >
          Connect Wallet
        </button>
      )}

      {!needsWalletFirst && state === "AVAILABLE" && actionHref && (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onAction}
          className="mt-3 inline-flex items-center justify-center rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow transition-colors hover:bg-signal/20"
        >
          {actionLabel ?? "Get Started"}
        </a>
      )}

      {!needsWalletFirst && isTxStage && (
        <div className="mt-3 space-y-2">
          {state === "INVALID" && (
            <p className="flex items-start gap-1.5 text-[11px] text-down">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {lastErrorMessage ?? "This transaction does not meet the quest requirements."}
            </p>
          )}
          {state === "SYSTEM_ERROR" && (
            <p className="flex items-start gap-1.5 text-[11px] text-ink-faint">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-signal-glow" /> Verification temporarily failed. Your transaction was not rejected. You can retry using the same TX hash.
            </p>
          )}
          {state !== "SYSTEM_ERROR" && state !== "INVALID" && (
            <input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="0x… transaction hash"
              disabled={state === "VERIFYING"}
              className="w-full rounded-md border border-line bg-bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-signal/50 focus:outline-none"
            />
          )}
          <div className="flex gap-2">
            {(state === "SUBMITTED" || state === "VERIFYING") && (
              <button
                onClick={handleVerify}
                disabled={busy || state === "VERIFYING" || !txHash.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow transition-colors hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === "VERIFYING" || busy ? <Loader2 size={12} className="animate-spin" /> : null}
                {state === "VERIFYING" || busy ? "Verifying…" : "Verify Transaction"}
              </button>
            )}
            {showRetryVerification && (
              <button
                onClick={handleVerify}
                disabled={busy || !txHash.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-signal/40 hover:text-signal-glow disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Retry Verification
              </button>
            )}
            {state === "INVALID" && (
              <button
                onClick={() => {
                  setTxHash("");
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-signal/40 hover:text-signal-glow"
              >
                Try a Different Transaction
              </button>
            )}
          </div>
        </div>
      )}

      {!needsWalletFirst && showClaim && (
        <button
          onClick={handleClaim}
          disabled={busy}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-up/40 bg-up/10 px-3 py-1.5 text-xs font-semibold text-up transition-colors hover:bg-up/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          {busy ? "Claiming…" : "Claim Reward"}
        </button>
      )}

      {!needsWalletFirst && state === "CLAIMING" && (
        <div className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-ink-faint">
          <Loader2 size={12} className="animate-spin" /> Claiming…
        </div>
      )}

      {!needsWalletFirst && showRetryClaim && (
        <div className="mt-3 space-y-2">
          <p className="flex items-start gap-1.5 text-[11px] text-ink-faint">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-signal-glow" /> Your transaction was verified, but the reward transfer failed. Your eligibility is preserved.
          </p>
          <button
            onClick={handleClaim}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-up/40 hover:text-up disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Retry Claim
          </button>
        </div>
      )}

      {state === "CLAIMED" && (
        <div className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-up/30 bg-up/5 px-3 py-1.5 text-xs font-semibold text-up">
          <CheckCircle2 size={12} /> Reward claimed successfully.
        </div>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: QuestState }) {
  const map: Record<QuestState, { label: string; className: string }> = {
    AVAILABLE: { label: "Available", className: "border-line text-ink-faint" },
    COMING_SOON: { label: "Coming Soon", className: "border-line text-ink-faint" },
    SUBMITTED: { label: "Pending", className: "border-signal/30 text-signal-glow" },
    VERIFYING: { label: "Verifying", className: "border-signal/30 text-signal-glow" },
    VALID: { label: "Valid", className: "border-up/30 text-up" },
    CLAIMABLE: { label: "Claimable", className: "border-up/30 text-up" },
    CLAIMING: { label: "Claiming", className: "border-signal/30 text-signal-glow" },
    CLAIMED: { label: "Completed", className: "border-up/30 text-up" },
    SYSTEM_ERROR: { label: "System Error", className: "border-signal/30 text-signal-glow" },
    CLAIM_ERROR: { label: "Claim Error", className: "border-down/30 text-down" },
    INVALID: { label: "Invalid", className: "border-down/30 text-down" },
  };
  const cfg = map[state];
  return <span className={clsx("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cfg.className)}>{cfg.label}</span>;
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable — no-op, button just won't confirm
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-signal/40 hover:text-signal-glow"
    >
      {copied ? <Check size={12} className="text-up" /> : <Copy size={12} />}
      {copied ? "Copied" : label}
    </button>
  );
}
