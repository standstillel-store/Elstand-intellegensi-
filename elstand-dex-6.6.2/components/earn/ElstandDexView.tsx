"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useBalance } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { ArrowDownUp, Loader2, CheckCircle2, ExternalLink, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";
import { shortAddr } from "@/lib/format";

/**
 * Same ABI BuyElsTestnetCard.tsx already uses — matches
 * contracts/ELSTestnetSwap.sol exactly, no new function names invented.
 * Reused verbatim rather than importing from that file because the two
 * components render completely different UI shapes; duplicating a 3-line
 * const is cheaper than coupling them.
 */
const SWAP_ABI = [
  { type: "function", name: "swap", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "quote", stateMutability: "view", inputs: [{ name: "amountIn", type: "uint256" }], outputs: [{ name: "amountOut", type: "uint256" }] },
  { type: "function", name: "minSwapAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_DECIMALS_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/** Leaves a small buffer for gas when MAX is tapped on the native-token
 * side — tapping MAX and spending the entire tBNB balance would leave
 * nothing to pay for the swap tx itself and the wallet would just reject
 * it. 0.002 tBNB is a rough, deliberately generous testnet gas buffer, not
 * a precise estimate. */
const GAS_BUFFER = parseUnits("0.002", 18);

type SwapStep = "idle" | "confirm_wallet" | "submitted" | "confirmed" | "error";
type Direction = "buy" | "sell";

interface RewardsStatus {
  buyElsTestnet: { configured: boolean; address: `0x${string}` | null; chainId: number };
}

export function ElstandDexView() {
  const { address: wallet, chainId: walletChainId, isConnected } = useAccount();
  const { open: openWalletConnect } = useAppKit();
  const { writeContractAsync, isPending: isSigning } = useWriteContract();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const [config, setConfig] = useState<RewardsStatus["buyElsTestnet"] | null | "error">(null);
  const [direction, setDirection] = useState<Direction>("buy");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<SwapStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  // Reward verify/claim — same existing flow BuyElsTestnetCard.tsx and
  // EarnView.tsx already use (Section 9: reuse /api/rewards/verify, don't
  // build a new verifier). Kept separate from the swap-confirmation state
  // above: the on-chain swap can be confirmed while the reward claim is
  // still pending, and the two shouldn't be conflated in one status string.
  const [rewardStep, setRewardStep] = useState<"idle" | "verifying" | "claimable" | "claiming" | "done" | "error">("idle");
  const [rewardError, setRewardError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rewards/status")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => setConfig(json?.buyElsTestnet ?? null))
      .catch(() => setConfig("error"));
  }, []);

  const swapAddress = config && config !== "error" ? config.address : null;
  const chainId = config && config !== "error" ? config.chainId : WALLET_NETWORK_CONFIG.chainId;
  const configured = Boolean(swapAddress);

  const parsedAmount = (() => {
    try {
      return amount ? parseUnits(amount, 18) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  })();

  const nativeBalance = useBalance({ address: wallet, chainId, query: { enabled: Boolean(wallet) } });

  const elsDecimalsRead = useReadContract({
    address: WALLET_NETWORK_CONFIG.ELS_CONTRACT,
    abi: ERC20_DECIMALS_ABI,
    functionName: "decimals",
    chainId,
  });
  const elsDecimals = (elsDecimalsRead.data as number | undefined) ?? 18;

  const quoted = useReadContract({
    address: swapAddress ?? undefined,
    abi: SWAP_ABI,
    functionName: "quote",
    args: [parsedAmount],
    chainId,
    query: { enabled: Boolean(swapAddress) && parsedAmount > BigInt(0) },
  });

  // Rate display (Section 1: "Rate: 1 tBNB ≈ XX ELS") — a fixed 1-unit
  // quote, independent of whatever the user has typed in the amount field.
  const rateQuote = useReadContract({
    address: swapAddress ?? undefined,
    abi: SWAP_ABI,
    functionName: "quote",
    args: [parseUnits("1", 18)],
    chainId,
    query: { enabled: Boolean(swapAddress) },
  });

  const minSwap = useReadContract({
    address: swapAddress ?? undefined,
    abi: SWAP_ABI,
    functionName: "minSwapAmount",
    chainId,
    query: { enabled: Boolean(swapAddress) },
  });

  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const wrongChain = isConnected && walletChainId !== chainId;
  const belowMin = minSwap.data !== undefined && parsedAmount > BigInt(0) && parsedAmount < (minSwap.data as bigint);
  const insufficientBalance = nativeBalance.data !== undefined && parsedAmount > nativeBalance.data.value;
  const busy = step === "confirm_wallet" || step === "submitted" || isSigning || isSwitching || receipt.isLoading;

  let inputError: string | null = null;
  if (!isConnected) inputError = null; // shown as the "Connect Wallet" state instead
  else if (parsedAmount > BigInt(0) && insufficientBalance) inputError = "Insufficient tBNB balance.";
  else if (parsedAmount > BigInt(0) && belowMin) inputError = `Minimum ${formatUnits(minSwap.data as bigint, 18)} tBNB.`;

  const canBuy = configured && isConnected && parsedAmount > BigInt(0) && !insufficientBalance && !belowMin && !busy;

  function handleMax() {
    if (!nativeBalance.data) return;
    const usable = nativeBalance.data.value > GAS_BUFFER ? nativeBalance.data.value - GAS_BUFFER : BigInt(0);
    setAmount(formatUnits(usable, 18));
  }

  async function handleBuy() {
    if (!wallet || !swapAddress || parsedAmount <= BigInt(0)) return;
    setError(null);
    setRewardStep("idle");
    setRewardError(null);
    setTxHash(undefined);
    setStep("confirm_wallet");
    try {
      if (walletChainId !== chainId) {
        await switchChainAsync({ chainId });
      }
      const hash = await writeContractAsync({
        address: swapAddress,
        abi: SWAP_ABI,
        functionName: "swap",
        chainId,
        value: parsedAmount,
      });
      setTxHash(hash);
      setStep("submitted");
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed.");
    }
  }

  // Status only flips to "confirmed" once the receipt actually comes back
  // successful — a submitted tx hash is not, by itself, proof of anything
  // (Section 4 / Section 11: frontend state is never treated as proof of a
  // transaction).
  useEffect(() => {
    if (receipt.isSuccess && step === "submitted") {
      setStep("confirmed");
    } else if (receipt.isError && step === "submitted") {
      setStep("error");
      setError("Transaction reverted or failed to confirm.");
    }
  }, [receipt.isSuccess, receipt.isError, step]);

  async function handleVerifyAndClaim() {
    if (!txHash || !wallet) return;
    setRewardStep("verifying");
    setRewardError(null);
    try {
      const verifyRes = await fetch("/api/rewards/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quest: "buy_els_testnet", txHash, walletAddress: wallet }),
      }).then((r) => r.json());
      if (verifyRes.error) throw new Error(verifyRes.error);
      setRewardStep("claimable");
    } catch (err) {
      setRewardStep("error");
      setRewardError(err instanceof Error ? err.message.split("\n")[0] : "Verification failed.");
    }
  }

  async function handleClaim() {
    if (!txHash) return;
    setRewardStep("claiming");
    setRewardError(null);
    try {
      const claimRes = await fetch("/api/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quest: "buy_els_testnet", txHash }),
      }).then((r) => r.json());
      if (claimRes.error) throw new Error(claimRes.error);
      setRewardStep("done");
    } catch (err) {
      setRewardStep("error");
      setRewardError(err instanceof Error ? err.message.split("\n")[0] : "Claim failed.");
    }
  }

  const estimatedOut = quoted.data !== undefined ? Number(formatUnits(quoted.data as bigint, elsDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : parsedAmount > BigInt(0) ? "…" : "0";
  const rateLabel = rateQuote.data !== undefined ? Number(formatUnits(rateQuote.data as bigint, elsDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "…";

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div className="rounded-lg border border-line bg-bg-surface/60 p-4 sm:p-5">
        <p className="text-center text-sm font-semibold text-ink">ELSTAND DEX</p>
        <p className="mt-0.5 text-center text-[11px] text-ink-faint">Swap / Buy ELS — BNB Smart Chain Testnet</p>

        {config === "error" && (
          <p className="mt-4 rounded-md border border-down/30 bg-down/5 p-3 text-[11px] text-down">
            Couldn&apos;t load swap configuration. Try again shortly.
          </p>
        )}

        {config !== "error" && !configured && config !== null && (
          <p className="mt-4 rounded-md border border-line bg-bg-raised/40 p-3 text-[11px] text-ink-faint">
            Testnet swap contract not configured yet.
          </p>
        )}

        {step !== "confirmed" && (
          <div className="mt-4 space-y-1">
            {/* Top input */}
            <TokenPanel
              symbol={direction === "buy" ? "tBNB" : "ELS"}
              value={direction === "buy" ? amount : ""}
              onChange={direction === "buy" ? setAmount : undefined}
              disabled={direction === "sell" || busy || !configured}
              placeholder="0.0"
              onMax={direction === "buy" ? handleMax : undefined}
              balanceLabel={
                direction === "buy"
                  ? nativeBalance.data
                    ? `${Number(formatUnits(nativeBalance.data.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} tBNB`
                    : isConnected
                    ? "…"
                    : "—"
                  : "Coming soon"
              }
            />

            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={() => setDirection((d) => (d === "buy" ? "sell" : "buy"))}
                aria-label="Swap direction"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-bg-surface text-ink-faint transition-colors hover:border-signal/40 hover:text-signal-glow"
              >
                <ArrowDownUp size={14} />
              </button>
            </div>

            {/* Bottom output */}
            <TokenPanel
              symbol={direction === "buy" ? "ELS" : "tBNB"}
              value={direction === "buy" ? estimatedOut : ""}
              readOnly
              disabled={direction === "sell" || !configured}
              placeholder="0.0"
              balanceLabel={direction === "buy" ? "" : "Coming soon"}
            />

            <div className="flex items-center justify-between px-1 pt-2 text-[11px] text-ink-faint">
              <span>Estimated received</span>
              <span className="mono-num text-ink">{direction === "buy" ? `${estimatedOut} ELS` : "—"}</span>
            </div>
            <div className="flex items-center justify-between px-1 text-[11px] text-ink-faint">
              <span>Rate</span>
              <span className="mono-num text-ink">{direction === "buy" ? `1 tBNB ≈ ${rateLabel} ELS` : "—"}</span>
            </div>

            {direction === "sell" ? (
              <div className="mt-3 rounded-md border border-line bg-bg-raised/40 p-3 text-center text-[11px] text-ink-faint">
                ELS → tBNB is coming soon. A sell contract hasn&apos;t been deployed yet.
              </div>
            ) : !isConnected ? (
              <button
                onClick={() => openWalletConnect()}
                className="mt-3 w-full rounded-md border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm font-semibold text-signal-glow hover:bg-signal/20"
              >
                Connect Wallet
              </button>
            ) : wrongChain ? (
              <button
                onClick={() => switchChainAsync({ chainId }).catch(() => undefined)}
                disabled={isSwitching}
                className="mt-3 w-full rounded-md border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm font-semibold text-signal-glow hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSwitching ? "Switching…" : "Switch to BNB Smart Chain Testnet"}
              </button>
            ) : (
              <button
                onClick={handleBuy}
                disabled={!canBuy}
                className={clsx(
                  "mt-3 w-full rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors",
                  canBuy ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20" : "cursor-not-allowed border-line text-ink-faint"
                )}
              >
                {step === "confirm_wallet" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" /> Waiting for wallet confirmation…
                  </span>
                ) : step === "submitted" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" /> Transaction submitted…
                  </span>
                ) : (
                  "BUY ELS"
                )}
              </button>
            )}

            {inputError && <p className="mt-2 text-center text-[11px] text-down">{inputError}</p>}
            {step === "error" && error && <p className="mt-2 text-center text-[11px] text-down">{error}</p>}
          </div>
        )}

        {step === "confirmed" && txHash && (
          <TransactionReceipt
            wallet={wallet ?? "—"}
            swapAddress={swapAddress as string}
            txHash={txHash}
            explorerUrl={WALLET_NETWORK_CONFIG.explorerUrl}
            amountIn={amount}
            amountOut={estimatedOut}
            rewardStep={rewardStep}
            rewardError={rewardError}
            onVerify={handleVerifyAndClaim}
            onClaim={handleClaim}
            onNewSwap={() => {
              setStep("idle");
              setTxHash(undefined);
              setAmount("");
              setRewardStep("idle");
            }}
          />
        )}
      </div>

      <Link
        href="/earn"
        className="flex items-center justify-center gap-1.5 text-xs text-ink-faint hover:text-ink"
      >
        <ArrowLeft size={12} /> Back to /earn
      </Link>
    </div>
  );
}

function TokenPanel({
  symbol,
  value,
  onChange,
  readOnly,
  disabled,
  placeholder,
  onMax,
  balanceLabel,
}: {
  symbol: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder: string;
  onMax?: () => void;
  balanceLabel: string;
}) {
  return (
    <div className={clsx("rounded-md border border-line bg-bg-raised/40 p-3", disabled && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent text-lg text-ink outline-none placeholder:text-ink-faint/50 disabled:cursor-not-allowed"
        />
        <span className="shrink-0 rounded-md border border-line bg-bg-surface px-2.5 py-1 text-xs font-semibold text-ink">{symbol}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-faint">
        <span>{balanceLabel}</span>
        {onMax && (
          <button type="button" onClick={onMax} disabled={disabled} className="font-semibold text-signal-glow hover:text-signal disabled:cursor-not-allowed disabled:opacity-60">
            MAX
          </button>
        )}
      </div>
    </div>
  );
}

function TransactionReceipt({
  wallet,
  swapAddress,
  txHash,
  explorerUrl,
  amountIn,
  amountOut,
  rewardStep,
  rewardError,
  onVerify,
  onClaim,
  onNewSwap,
}: {
  wallet: string;
  swapAddress: string;
  txHash: string;
  explorerUrl: string;
  amountIn: string;
  amountOut: string;
  rewardStep: "idle" | "verifying" | "claimable" | "claiming" | "done" | "error";
  rewardError: string | null;
  onVerify: () => void;
  onClaim: () => void;
  onNewSwap: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="rounded-md border border-line bg-bg-raised/40 p-3 text-center">
        <p className="text-xs text-ink-faint">tBNB ↔ ELS</p>
        <p className="mono-num mt-1 text-sm text-ink">{amountIn || "0"} tBNB</p>
        <p className="text-ink-faint">↓</p>
        <p className="mono-num text-sm text-ink">{amountOut} ELS</p>
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-line bg-bg-raised/40 p-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">Transaction Receipt</p>

        <ReceiptRow label="Address" value={wallet} />
        <ReceiptRow label="Contract" value={swapAddress} />
        <ReceiptRow label="Tx Hash" value={txHash} />

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-faint">Status</span>
          <span className="flex items-center gap-1 font-medium text-up">
            <CheckCircle2 size={12} /> Confirmed
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-faint">Network</span>
          <span className="text-ink">BSC Testnet</span>
        </div>

        <a
          href={`${explorerUrl}/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs font-semibold text-ink hover:border-signal/40 hover:text-signal-glow"
        >
          View on BscScan Testnet <ExternalLink size={12} />
        </a>
      </div>

      {/* Quest reward — existing /api/rewards/verify → /api/rewards/claim
          flow (Section 9), surfaced here since this swap tx is also the
          Buy ELS Testnet quest's proof-of-completion. */}
      <div className="mt-3 rounded-md border border-line bg-bg-raised/40 p-3 text-center">
        {rewardStep === "idle" && (
          <button onClick={onVerify} className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow hover:bg-signal/20">
            Verify quest reward
          </button>
        )}
        {rewardStep === "verifying" && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-ink-faint">
            <Loader2 size={12} className="animate-spin" /> Verifying…
          </p>
        )}
        {rewardStep === "claimable" && (
          <button onClick={onClaim} className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow hover:bg-signal/20">
            Claim reward
          </button>
        )}
        {rewardStep === "claiming" && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-ink-faint">
            <Loader2 size={12} className="animate-spin" /> Claiming…
          </p>
        )}
        {rewardStep === "done" && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-up">
            <CheckCircle2 size={13} /> Reward claimed.
          </p>
        )}
        {rewardStep === "error" && rewardError && <p className="text-xs text-down">{rewardError}</p>}
      </div>

      <button onClick={onNewSwap} className="mt-3 w-full rounded-md border border-line px-4 py-2 text-xs font-semibold text-ink-faint hover:text-ink">
        New swap
      </button>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span className="mono-num truncate text-ink" title={value}>
        {value.length > 14 ? shortAddr(value) : value}
      </span>
    </div>
  );
}
