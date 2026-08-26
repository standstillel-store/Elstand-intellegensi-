"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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

// Phase 6.6.3.3 — ELSTestnetSell.sol. Standalone, ELS -> tBNB. Minimal ABI,
// nothing beyond what the sell dashboard actually calls (Section 18: no
// duplicate/invented functions beyond what the deployed contract exposes).
const SELL_ABI = [
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{ name: "amountEls", type: "uint256" }], outputs: [] },
  { type: "function", name: "quote", stateMutability: "view", inputs: [{ name: "amountEls", type: "uint256" }], outputs: [{ name: "amountOut", type: "uint256" }] },
  { type: "function", name: "minSellAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_DECIMALS_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

// Minimal ERC20 reads/writes the sell flow needs on top of `decimals` above
// (balance to drive MAX + validation, allowance/approve for the
// approve-then-sell two-step). Kept separate from ERC20_DECIMALS_ABI so the
// buy-only read path above doesn't pull in write-capable ABI entries it
// never uses.
const ERC20_ALLOWANCE_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** Leaves a small buffer for gas when MAX is tapped on the native-token
 * side — tapping MAX and spending the entire tBNB balance would leave
 * nothing to pay for the swap tx itself and the wallet would just reject
 * it. 0.002 tBNB is a rough, deliberately generous testnet gas buffer, not
 * a precise estimate. */
const GAS_BUFFER = parseUnits("0.002", 18);

type SwapStep = "idle" | "confirm_wallet" | "submitted" | "confirmed" | "error";
type Direction = "buy" | "sell";
// Separate from SwapStep: an ERC20 approve() is its own tx with its own
// wallet-confirm/submitted/confirmed lifecycle, distinct from the sell()
// tx that follows it (Section 6 — "jangan meminta approval ulang jika
// allowance masih mencukupi").
type ApproveStep = "idle" | "confirm_wallet" | "submitted" | "done" | "error";

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

  // Sell (ELS -> tBNB) — kept fully separate from the buy/reward-claim
  // state above (Section 11: sell must never touch reward/claim logic).
  const [approveStep, setApproveStep] = useState<ApproveStep>("idle");
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const [sellStep, setSellStep] = useState<SwapStep>("idle");
  const [sellError, setSellError] = useState<string | null>(null);
  const [sellTxHash, setSellTxHash] = useState<`0x${string}` | undefined>();

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

  // --- Sell (ELS -> tBNB), Section 19: address lives in
  // WALLET_NETWORK_CONFIG, never hardcoded inline. ---
  const sellAddress = WALLET_NETWORK_CONFIG.SELL_CONTRACT;
  const sellConfigured = Boolean(sellAddress);

  const sellParsedAmount = (() => {
    try {
      return amount ? parseUnits(amount, elsDecimals) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  })();

  const elsBalanceRead = useReadContract({
    address: WALLET_NETWORK_CONFIG.ELS_CONTRACT,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "balanceOf",
    args: [wallet ?? ZERO_ADDRESS],
    chainId,
    query: { enabled: Boolean(wallet) },
  });

  const allowanceRead = useReadContract({
    address: WALLET_NETWORK_CONFIG.ELS_CONTRACT,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "allowance",
    args: [wallet ?? ZERO_ADDRESS, sellAddress],
    chainId,
    query: { enabled: Boolean(wallet) && sellConfigured && direction === "sell" },
  });

  const sellQuoted = useReadContract({
    address: sellAddress,
    abi: SELL_ABI,
    functionName: "quote",
    args: [sellParsedAmount],
    chainId,
    query: { enabled: sellConfigured && direction === "sell" && sellParsedAmount > BigInt(0) },
  });

  const sellRateQuote = useReadContract({
    address: sellAddress,
    abi: SELL_ABI,
    functionName: "quote",
    args: [parseUnits("1", elsDecimals)],
    chainId,
    query: { enabled: sellConfigured && direction === "sell" },
  });

  const minSell = useReadContract({
    address: sellAddress,
    abi: SELL_ABI,
    functionName: "minSellAmount",
    chainId,
    query: { enabled: sellConfigured && direction === "sell" },
  });

  // Liquidity the sell contract can actually pay out with — its own native
  // tBNB balance (Section 16: read the real contract balance, never a
  // fabricated "Available" label).
  const sellLiquidity = useBalance({
    address: sellAddress,
    chainId,
    query: { enabled: sellConfigured && direction === "sell" },
  });

  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTxHash });
  const sellReceipt = useWaitForTransactionReceipt({ hash: sellTxHash });

  const sellEstimatedOut = sellQuoted.data !== undefined ? Number(formatUnits(sellQuoted.data as bigint, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : sellParsedAmount > BigInt(0) ? "…" : "0";
  const sellRateLabel = sellRateQuote.data !== undefined ? Number(formatUnits(sellRateQuote.data as bigint, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "…";

  const elsBalance = elsBalanceRead.data as bigint | undefined;
  const sellBelowMin = minSell.data !== undefined && sellParsedAmount > BigInt(0) && sellParsedAmount < (minSell.data as bigint);
  const sellInsufficientBalance = elsBalance !== undefined && sellParsedAmount > elsBalance;
  const needsApproval = sellConfigured && allowanceRead.data !== undefined && sellParsedAmount > BigInt(0) && (allowanceRead.data as bigint) < sellParsedAmount;
  const insufficientLiquidity = sellQuoted.data !== undefined && sellLiquidity.data !== undefined && (sellLiquidity.data.value as bigint) < (sellQuoted.data as bigint);
  const approveBusy = approveStep === "confirm_wallet" || approveStep === "submitted" || approveReceipt.isLoading;
  const sellBusy = sellStep === "confirm_wallet" || sellStep === "submitted" || sellReceipt.isLoading;

  let sellInputError: string | null = null;
  if (!isConnected) sellInputError = null;
  else if (sellParsedAmount > BigInt(0) && sellInsufficientBalance) sellInputError = "Insufficient ELS balance.";
  else if (sellParsedAmount > BigInt(0) && sellBelowMin) sellInputError = `Minimum ${formatUnits(minSell.data as bigint, elsDecimals)} ELS.`;
  else if (sellParsedAmount > BigInt(0) && insufficientLiquidity) sellInputError = "Not enough tBNB liquidity for this amount.";

  const canApprove = sellConfigured && isConnected && sellParsedAmount > BigInt(0) && !sellInsufficientBalance && !sellBelowMin && needsApproval && !approveBusy && !sellBusy;
  const canSell = sellConfigured && isConnected && sellParsedAmount > BigInt(0) && !sellInsufficientBalance && !sellBelowMin && !insufficientLiquidity && !needsApproval && !sellBusy && !approveBusy;

  function handleSellShortcut(pct: 25 | 50 | 75 | 100) {
    if (elsBalance === undefined) return;
    const portion = (elsBalance * BigInt(pct)) / BigInt(100);
    setAmount(formatUnits(portion, elsDecimals));
  }

  async function handleApprove() {
    if (!wallet || !sellConfigured || sellParsedAmount <= BigInt(0)) return;
    setApproveError(null);
    setApproveStep("confirm_wallet");
    try {
      if (walletChainId !== chainId) {
        await switchChainAsync({ chainId });
      }
      const hash = await writeContractAsync({
        address: WALLET_NETWORK_CONFIG.ELS_CONTRACT,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: "approve",
        chainId,
        args: [sellAddress, sellParsedAmount],
      });
      setApproveTxHash(hash);
      setApproveStep("submitted");
    } catch (err) {
      setApproveStep("error");
      setApproveError(err instanceof Error ? err.message.split("\n")[0] : "Approval failed.");
    }
  }

  useEffect(() => {
    if (approveReceipt.isSuccess && approveStep === "submitted") {
      setApproveStep("done");
      allowanceRead.refetch();
    } else if (approveReceipt.isError && approveStep === "submitted") {
      setApproveStep("error");
      setApproveError("Approval reverted or failed to confirm.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess, approveReceipt.isError, approveStep]);

  async function handleSell() {
    if (!wallet || !sellConfigured || sellParsedAmount <= BigInt(0)) return;
    setSellError(null);
    setSellTxHash(undefined);
    setSellStep("confirm_wallet");
    try {
      if (walletChainId !== chainId) {
        await switchChainAsync({ chainId });
      }
      const hash = await writeContractAsync({
        address: sellAddress,
        abi: SELL_ABI,
        functionName: "sell",
        chainId,
        args: [sellParsedAmount],
      });
      setSellTxHash(hash);
      setSellStep("submitted");
    } catch (err) {
      setSellStep("error");
      setSellError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed.");
    }
  }

  useEffect(() => {
    if (sellReceipt.isSuccess && sellStep === "submitted") {
      setSellStep("confirmed");
      elsBalanceRead.refetch();
      allowanceRead.refetch();
    } else if (sellReceipt.isError && sellStep === "submitted") {
      setSellStep("error");
      setSellError("Transaction reverted or failed to confirm.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellReceipt.isSuccess, sellReceipt.isError, sellStep]);

  function resetSell() {
    setSellStep("idle");
    setSellTxHash(undefined);
    setApproveStep("idle");
    setApproveTxHash(undefined);
    setAmount("");
  }

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
        <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center">
          <Image src="/tokens/els-logo.png" alt="ELS" width={40} height={40} className="h-10 w-10" />
        </div>
        <p className="text-center text-sm font-semibold text-ink">ELSTAND DEX</p>
        <p className="mt-0.5 text-center text-[11px] text-ink-faint">
          {direction === "buy" ? "Buy ELS with tBNB" : "Sell your ELS for tBNB"} — BNB Smart Chain Testnet
        </p>

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

        {direction === "buy" && (
          <>
            {step !== "confirmed" && (
              <div className="mt-4 space-y-1">
                {/* Top input */}
                <TokenPanel
                  symbol="tBNB"
                  value={amount}
                  onChange={setAmount}
                  disabled={busy || !configured}
                  placeholder="0.0"
                  onMax={handleMax}
                  balanceLabel={
                    nativeBalance.data
                      ? `${Number(formatUnits(nativeBalance.data.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} tBNB`
                      : isConnected
                      ? "…"
                      : "—"
                  }
                />

                <DirectionToggle onClick={() => setDirection("sell")} />

                {/* Bottom output */}
                <TokenPanel symbol="ELS" value={estimatedOut} readOnly disabled={!configured} placeholder="0.0" balanceLabel="" />

                <div className="flex items-center justify-between px-1 pt-2 text-[11px] text-ink-faint">
                  <span>Estimated received</span>
                  <span className="mono-num text-ink">{estimatedOut} ELS</span>
                </div>
                <div className="flex items-center justify-between px-1 text-[11px] text-ink-faint">
                  <span>Rate</span>
                  <span className="mono-num text-ink">1 tBNB ≈ {rateLabel} ELS</span>
                </div>

                {!isConnected ? (
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
          </>
        )}

        {direction === "sell" && (
          <>
            {sellStep !== "confirmed" && (
              <div className="mt-4 space-y-1">
                <TokenPanel
                  symbol="ELS"
                  value={amount}
                  onChange={setAmount}
                  disabled={sellBusy || approveBusy || !sellConfigured}
                  placeholder="0.0"
                  balanceLabel={
                    elsBalance !== undefined
                      ? `${Number(formatUnits(elsBalance, elsDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ELS`
                      : isConnected
                      ? "…"
                      : "—"
                  }
                />

                {isConnected && (
                  <div className="flex items-center justify-end gap-1.5 px-1 pt-1">
                    {([25, 50, 75, 100] as const).map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleSellShortcut(pct)}
                        disabled={sellBusy || approveBusy || !sellConfigured || elsBalance === undefined}
                        className="rounded border border-line px-2 py-1 text-[10px] font-semibold text-ink-faint hover:border-signal/40 hover:text-signal-glow disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pct === 100 ? "MAX" : `${pct}%`}
                      </button>
                    ))}
                  </div>
                )}

                <DirectionToggle onClick={() => setDirection("buy")} />

                <TokenPanel symbol="tBNB" value={sellEstimatedOut} readOnly disabled={!sellConfigured} placeholder="0.0" balanceLabel="" />

                <div className="flex items-center justify-between px-1 pt-2 text-[11px] text-ink-faint">
                  <span>Estimated received</span>
                  <span className="mono-num text-ink">{sellEstimatedOut} tBNB</span>
                </div>
                <div className="flex items-center justify-between px-1 text-[11px] text-ink-faint">
                  <span>Rate</span>
                  <span className="mono-num text-ink">1 ELS = {sellRateLabel} tBNB</span>
                </div>
                <div className="flex items-center justify-between px-1 text-[11px] text-ink-faint">
                  <span>Contract liquidity</span>
                  <span className={clsx("font-medium", insufficientLiquidity ? "text-down" : "text-up")}>
                    {sellLiquidity.data
                      ? insufficientLiquidity
                        ? "Insufficient"
                        : "Available ✓"
                      : "…"}
                  </span>
                </div>

                {!sellConfigured ? (
                  <div className="mt-3 rounded-md border border-line bg-bg-raised/40 p-3 text-center text-[11px] text-ink-faint">
                    ELS → tBNB sell contract not configured yet.
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
                ) : insufficientLiquidity && sellParsedAmount > BigInt(0) ? (
                  <div className="mt-3 rounded-md border border-down/30 bg-down/5 p-3 text-center text-[11px] text-down">
                    SELL TEMPORARILY UNAVAILABLE — not enough tBNB liquidity.
                  </div>
                ) : needsApproval ? (
                  <button
                    onClick={handleApprove}
                    disabled={!canApprove}
                    className={clsx(
                      "mt-3 w-full rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors",
                      canApprove ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20" : "cursor-not-allowed border-line text-ink-faint"
                    )}
                  >
                    {approveStep === "confirm_wallet" ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <Loader2 size={14} className="animate-spin" /> Waiting for wallet confirmation…
                      </span>
                    ) : approveStep === "submitted" ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <Loader2 size={14} className="animate-spin" /> APPROVING ELS…
                      </span>
                    ) : (
                      "APPROVE ELS"
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleSell}
                    disabled={!canSell}
                    className={clsx(
                      "mt-3 w-full rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors",
                      canSell ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20" : "cursor-not-allowed border-line text-ink-faint"
                    )}
                  >
                    {sellStep === "confirm_wallet" ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <Loader2 size={14} className="animate-spin" /> Waiting for wallet confirmation…
                      </span>
                    ) : sellStep === "submitted" ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <Loader2 size={14} className="animate-spin" /> SELLING ELS…
                      </span>
                    ) : approveStep === "done" ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={14} className="text-up" /> ELS APPROVED ✓ — SELL ELS
                      </span>
                    ) : (
                      "SELL ELS"
                    )}
                  </button>
                )}

                {sellInputError && <p className="mt-2 text-center text-[11px] text-down">{sellInputError}</p>}
                {approveStep === "error" && approveError && <p className="mt-2 text-center text-[11px] text-down">{approveError}</p>}
                {sellStep === "error" && sellError && <p className="mt-2 text-center text-[11px] text-down">{sellError}</p>}
              </div>
            )}

            {sellStep === "confirmed" && sellTxHash && (
              <SellReceipt
                sellAddress={sellAddress as string}
                txHash={sellTxHash}
                explorerUrl={WALLET_NETWORK_CONFIG.explorerUrl}
                amountIn={amount}
                amountOut={sellEstimatedOut}
                onSellMore={resetSell}
              />
            )}
          </>
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

function DirectionToggle({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center py-1">
      <button
        type="button"
        onClick={onClick}
        aria-label="Swap direction"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-bg-surface text-ink-faint transition-colors hover:border-signal/40 hover:text-signal-glow"
      >
        <ArrowDownUp size={14} />
      </button>
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

// Section 11 — deliberately NOT reusing <TransactionReceipt>: that
// component's whole bottom half is the buy_els_testnet quest verify/claim
// flow, which sell must never touch. This is a plain success card, no
// reward-claim wiring at all.
function SellReceipt({
  sellAddress,
  txHash,
  explorerUrl,
  amountIn,
  amountOut,
  onSellMore,
}: {
  sellAddress: string;
  txHash: string;
  explorerUrl: string;
  amountIn: string;
  amountOut: string;
  onSellMore: () => void;
}) {
  return (
    <div className="mt-4 text-center">
      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-up/40 bg-up/10">
        <CheckCircle2 size={22} className="text-up" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-wide text-up">Sell Success ✓</p>

      <div className="mt-3 rounded-md border border-line bg-bg-raised/40 p-3">
        <p className="mono-num text-sm text-ink">{amountIn || "0"} ELS</p>
        <p className="text-ink-faint">↓</p>
        <p className="mono-num text-sm text-ink">{amountOut} tBNB</p>
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-line bg-bg-raised/40 p-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">Transaction confirmed</p>
        <ReceiptRow label="Contract" value={sellAddress} />
        <ReceiptRow label="Tx Hash" value={txHash} />
        <a
          href={`${explorerUrl}/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs font-semibold text-ink hover:border-signal/40 hover:text-signal-glow"
        >
          View transaction <ExternalLink size={12} />
        </a>
      </div>

      <button onClick={onSellMore} className="mt-3 w-full rounded-md border border-line px-4 py-2 text-xs font-semibold text-ink-faint hover:text-ink">
        SELL MORE ELS
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
