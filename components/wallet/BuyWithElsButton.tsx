"use client";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useSwitchChain } from "wagmi";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { keccak256, stringToBytes, type Hash } from "viem";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";
import type { PaymentProductId } from "@/lib/payments/config";

/** Minimal ABI — only what this button calls. Matches contracts/ELSTestnetPayment.sol and OpenZeppelin's IERC20 exactly. */
const ERC20_ALLOWANCE_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
const PAYMENT_ABI = [
  { type: "function", name: "purchase", stateMutability: "nonpayable", inputs: [{ name: "paymentId", type: "bytes32" }, { name: "productId", type: "bytes32" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

type Step = "idle" | "approving" | "purchasing" | "verifying" | "done" | "error";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** localStorage key holding a purchase tx hash that reached the chain but
 * hasn't been confirmed GRANTED by the backend yet (e.g. the verify call
 * failed for a backend-side reason after the on-chain tx already
 * succeeded). Keyed per productId+wallet so it never bleeds across
 * products or accounts. Checked on mount so a page refresh / retry never
 * re-submits purchase() for ELS that's already been spent — it always
 * tries to verify the existing tx first. */
function pendingKey(productId: PaymentProductId, wallet?: string) {
  return `elstand:pending_purchase:${productId}:${(wallet ?? "").toLowerCase()}`;
}

/**
 * "Buy with ELS" execution — approve() only if current allowance is
 * insufficient (never re-prompts an approval the user already granted),
 * then purchase(), then hand the resulting tx hash to
 * /api/payments/verify so the backend — not this component — is what
 * actually decides whether Premium/AI Energy gets granted. A successful
 * purchase() receipt here only means "ready to verify", never "granted".
 */
export function BuyWithElsButton({
  productId,
  priceElsRaw,
  onGranted,
}: {
  productId: PaymentProductId;
  priceElsRaw: bigint;
  onGranted: () => void;
}) {
  const { address: wallet, chainId: walletChainId, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<Hash | null>(null);

  useEffect(() => {
    if (!wallet) return;
    const stored = localStorage.getItem(pendingKey(productId, wallet));
    if (stored) setPendingTxHash(stored as Hash);
  }, [wallet, productId]);

  async function verifyTx(txHash: Hash) {
    setStep("verifying");
    localStorage.setItem(pendingKey(productId, wallet), txHash);
    const verifyRes = await fetch("/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, txHash, walletAddress: wallet }),
    }).then((r) => r.json());
    if (verifyRes.status !== "GRANTED" && verifyRes.status !== "ALREADY_GRANTED") {
      throw new Error(verifyRes.reason || "Verification failed.");
    }
    localStorage.removeItem(pendingKey(productId, wallet));
    setPendingTxHash(null);
    setStep("done");
    onGranted();
  }

  const paymentContract = WALLET_NETWORK_CONFIG.PREMIUM_PURCHASE_CONTRACT ?? WALLET_NETWORK_CONFIG.AI_ENERGY_PURCHASE_CONTRACT;
  const chainId = WALLET_NETWORK_CONFIG.chainId;
  const configured = Boolean(paymentContract);
  const busy = step === "approving" || step === "purchasing" || step === "verifying";

  const allowanceRead = useReadContract({
    address: WALLET_NETWORK_CONFIG.ELS_CONTRACT,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "allowance",
    args: [wallet ?? ZERO_ADDRESS, paymentContract ?? ZERO_ADDRESS],
    chainId,
    query: { enabled: Boolean(wallet) && configured },
  });

  async function handleBuy() {
    if (!wallet || !paymentContract) return;
    setError(null);
    try {
      if (walletChainId !== chainId) {
        await switchChainAsync({ chainId });
      }

      const currentAllowance = (allowanceRead.data as bigint | undefined) ?? BigInt(0);
      if (currentAllowance < priceElsRaw) {
        setStep("approving");
        const approveHash = await writeContractAsync({
          address: WALLET_NETWORK_CONFIG.ELS_CONTRACT,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: "approve",
          chainId,
          args: [paymentContract, priceElsRaw],
        });
        // Re-check allowance after the approve tx is mined before moving
        // on — wagmi's writeContractAsync resolves on submission, not
        // confirmation, and purchase() would revert on stale allowance.
        await allowanceRead.refetch();
        void approveHash;
      }

      setStep("purchasing");
      // Caller-supplied nonce per contracts/ELSTestnetPayment.sol's replay
      // protection — must be unique per attempt. crypto.randomUUID() run
      // through keccak256 gives a bytes32 with no realistic collision risk.
      const paymentId = keccak256(stringToBytes(crypto.randomUUID()));
      const productIdHash = keccak256(stringToBytes(productId));
      const purchaseHash: Hash = await writeContractAsync({
        address: paymentContract,
        abi: PAYMENT_ABI,
        functionName: "purchase",
        chainId,
        args: [paymentId, productIdHash, priceElsRaw],
      });

      // Persisted BEFORE calling verify — if verify throws for any
      // backend-side reason (DB down, migration not applied, etc.) the ELS
      // has already left the wallet on-chain regardless, so the retry path
      // below must re-verify this exact tx, never submit purchase() again.
      await verifyTx(purchaseHash);
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Purchase failed.");
    }
  }

  async function handleRetryVerify() {
    if (!pendingTxHash) return;
    setError(null);
    try {
      await verifyTx(pendingTxHash);
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Verification failed.");
    }
  }

  if (!configured) {
    return (
      <button disabled title="Testnet purchase contract not configured" className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-line bg-bg-raised py-2 text-xs font-medium text-ink-faint">
        <Lock size={12} /> Coming Soon
      </button>
    );
  }

  if (step === "done") {
    return (
      <p className="flex items-center justify-center gap-1.5 rounded-md border border-up/30 bg-up/10 py-2 text-xs font-medium text-up">
        <CheckCircle2 size={13} /> Purchased
      </p>
    );
  }

  return (
    <div className="w-full">
      {pendingTxHash && step !== "verifying" && (
        <p className="mb-1.5 text-[10px] text-amber">
          Payment already sent on-chain but not yet confirmed by our server. Click below to finish — this will NOT charge you again.
        </p>
      )}
      <button
        onClick={isConnected ? (pendingTxHash ? handleRetryVerify : handleBuy) : undefined}
        disabled={busy || !isConnected}
        className={clsx(
          "flex w-full items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors",
          !busy && isConnected ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20" : "cursor-not-allowed border-line bg-bg-raised text-ink-faint"
        )}
      >
        {step === "approving" ? (
          <><Loader2 size={12} className="animate-spin" /> Approving ELS…</>
        ) : step === "purchasing" ? (
          <><Loader2 size={12} className="animate-spin" /> Confirm in wallet…</>
        ) : step === "verifying" ? (
          <><Loader2 size={12} className="animate-spin" /> Verifying…</>
        ) : pendingTxHash ? (
          "Finish verification"
        ) : (
          "Buy with ELS"
        )}
      </button>
      {error && <p className="mt-1.5 text-[10px] text-down">{error}</p>}
    </div>
  );
}
