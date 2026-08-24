"use client";
import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useSwitchChain } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { ShoppingCart, Loader2, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

/** Minimal ABI — only what this card calls. Matches contracts/ELSTestnetSwap.sol exactly. */
const SWAP_ABI = [
  { type: "function", name: "swap", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "quote", stateMutability: "view", inputs: [{ name: "amountIn", type: "uint256" }], outputs: [{ name: "amountOut", type: "uint256" }] },
  { type: "function", name: "minSwapAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

type Step = "idle" | "swapping" | "verifying" | "claimable" | "claiming" | "done" | "error";

/**
 * No external DEX exists for contracts/ELSTestnetSwap.sol (it's a custom
 * fixed-rate vending contract, not listed on Uniswap or anywhere else) —
 * unlike the mainnet "Buy ELS" quest, which links out to an existing DEX
 * and has the user paste back a tx hash. This card does the swap in-app
 * via wagmi, then chains straight into the existing /api/rewards/verify →
 * /api/rewards/claim flow with the resulting hash — same backend contract
 * as every other quest, just without the manual copy-paste step since
 * there's no external UI to send the user to first.
 */
export function BuyElsTestnetCard({
  swapAddress,
  chainId,
  rewardEls,
  rewardAiEnergy,
  walletConnected,
  onConnectWallet,
  onSettled,
}: {
  swapAddress: `0x${string}`;
  chainId: number;
  rewardEls: number;
  rewardAiEnergy: number;
  walletConnected: boolean;
  onConnectWallet: () => void;
  onSettled: () => void;
}) {
  const { address: wallet, chainId: walletChainId } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const [tbnbAmount, setTbnbAmount] = useState("0.02");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultTxHash, setResultTxHash] = useState<string | null>(null);

  const parsedAmount = (() => {
    try {
      return parseUnits(tbnbAmount || "0", 18);
    } catch {
      return BigInt(0);
    }
  })();

  const { data: quoted } = useReadContract({
    address: swapAddress,
    abi: SWAP_ABI,
    functionName: "quote",
    args: [parsedAmount],
    chainId,
    query: { enabled: parsedAmount > BigInt(0) },
  });

  const busy = step === "swapping" || step === "verifying" || step === "claiming";
  const wrongChain = walletChainId !== chainId;

  async function handleBuy() {
    if (!wallet || parsedAmount <= BigInt(0)) return;
    setError(null);
    setStep("swapping");
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
      setResultTxHash(hash);

      // Verify only — claim is a separate manual step below, so the user
      // sees "verified, ready to claim" before anything gets granted,
      // instead of everything happening invisibly in one chained call.
      setStep("verifying");
      const verifyRes = await fetch("/api/rewards/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quest: "buy_els_testnet", txHash: hash, walletAddress: wallet }),
      }).then((r) => r.json());
      if (verifyRes.error) throw new Error(verifyRes.error);

      setStep("claimable");
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Swap failed.");
    }
  }

  async function handleClaim() {
    if (!resultTxHash) return;
    setError(null);
    setStep("claiming");
    try {
      const claimRes = await fetch("/api/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quest: "buy_els_testnet", txHash: resultTxHash }),
      }).then((r) => r.json());
      if (claimRes.error) throw new Error(claimRes.error);

      setStep("done");
      onSettled();
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Claim failed.");
    }
  }

  const needsWalletFirst = !walletConnected;

  return (
    <div className="rounded-md border border-line bg-bg-raised/40 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal-glow">
          <ShoppingCart size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Buy ELS (Testnet)</p>
          <p className="text-xs text-ink-muted">+{rewardEls} ELS TESTNET · +{rewardAiEnergy} AI ENERGY</p>

          {needsWalletFirst ? (
            <button onClick={onConnectWallet} className="mt-2 rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow hover:bg-signal/20">
              Connect Wallet
            </button>
          ) : step === "done" ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-up">
              <CheckCircle2 size={13} /> Reward claimed.
            </p>
          ) : step === "claimable" ? (
            <div className="mt-2 flex items-center gap-2">
              <p className="text-[11px] text-ink-faint">Verified — ready to claim.</p>
              <button
                onClick={handleClaim}
                className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal-glow hover:bg-signal/20"
              >
                Claim reward
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={tbnbAmount}
                onChange={(e) => setTbnbAmount(e.target.value)}
                disabled={busy}
                className="w-24 rounded-md border border-line bg-bg-surface px-2 py-1.5 text-xs text-ink"
                placeholder="tBNB"
              />
              <span className="text-[11px] text-ink-faint">
                tBNB → {quoted !== undefined ? Number(formatUnits(quoted as bigint, 18)).toLocaleString() : "…"} ELS
              </span>
              <button
                onClick={handleBuy}
                disabled={busy || parsedAmount <= BigInt(0)}
                className={clsx(
                  "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                  !busy && parsedAmount > BigInt(0)
                    ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20"
                    : "cursor-not-allowed border-line text-ink-faint"
                )}
              >
                {step === "swapping" ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> {wrongChain ? "Switching…" : "Confirm in wallet…"}
                  </span>
                ) : step === "verifying" ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Verifying…
                  </span>
                ) : step === "claiming" ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Claiming…
                  </span>
                ) : (
                  "Buy ELS"
                )}
              </button>
            </div>
          )}

          {error && (
            <p className="mt-2 text-[11px] text-down">
              {error}
              {resultTxHash && <span className="block text-ink-faint">tx: {resultTxHash.slice(0, 12)}…</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
