"use client";
import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi";
import { Droplets, Loader2 } from "lucide-react";
import clsx from "clsx";

/** Minimal ABI — only what this card calls. Matches contracts/TestnetFaucet.sol exactly; no invented function names. */
const FAUCET_ABI = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "claimAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "timeUntilNextClaim", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function formatCooldown(seconds: number): string {
  if (seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Claim tBNB from contracts/TestnetFaucet.sol — a direct wallet transaction
 * (claim() has no args, pays no reward, isn't backend-verified) so this
 * calls the contract straight from the client via wagmi, unlike the Earn
 * quest cards above which submit a txHash to the backend for verification.
 * chainId is read from props (from /api/rewards/status's `faucet` field,
 * itself sourced from TESTNET_FAUCET_CONFIG — chain 97, never guessed).
 */
export function FaucetClaimCard({ address, chainId }: { address: `0x${string}`; chainId: number }) {
  const { address: wallet, isConnected, chainId: walletChainId } = useAccount();
  const { writeContractAsync, isPending: isSubmitting } = useWriteContract();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  const wrongChain = isConnected && walletChainId !== chainId;

  const { data: cooldownSeconds, refetch: refetchCooldown } = useReadContract({
    address,
    abi: FAUCET_ABI,
    functionName: "timeUntilNextClaim",
    args: wallet ? [wallet] : undefined,
    chainId,
    query: { enabled: Boolean(wallet), refetchInterval: 15_000 },
  });

  const { data: claimAmount } = useReadContract({ address, abi: FAUCET_ABI, functionName: "claimAmount", chainId });

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const onCooldown = Boolean(cooldownSeconds && cooldownSeconds > BigInt(0));
  const amountLabel = claimAmount ? `${Number(claimAmount) / 1e18} tBNB` : "tBNB";

  async function handleClaim() {
    if (!wallet) return;
    setError(null);
    try {
      // Wagmi refuses to send a tx whose target chainId doesn't match the
      // wallet's currently-connected chain (exactly the "current chain ...
      // does not match target chain" error) — switch first, explicitly,
      // rather than letting that call fail and confusing the user with a
      // wagmi-internal error message.
      if (walletChainId !== chainId) {
        await switchChainAsync({ chainId });
      }
      const hash = await writeContractAsync({ address, abi: FAUCET_ABI, functionName: "claim", chainId });
      setTxHash(hash);
    } catch (err) {
      // Most common cases: rejected in wallet, cooldown not elapsed
      // (reverted), or user rejected the chain-switch prompt.
      setError(err instanceof Error ? err.message.split("\n")[0] : "Claim failed.");
    }
  }

  // Once confirmed, refresh the cooldown read so the button correctly disables.
  if (isSuccess && txHash) {
    refetchCooldown();
  }

  return (
    <div className="rounded-md border border-line bg-bg-raised/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal-glow">
            <Droplets size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Testnet Faucet</p>
            <p className="text-xs text-ink-faint">
              {!isConnected
                ? "Connect a wallet to claim."
                : wrongChain
                ? "Wrong network — switch to BNB Smart Chain Testnet to claim."
                : onCooldown
                ? `Available again in ${formatCooldown(Number(cooldownSeconds))}.`
                : `Claim ${amountLabel} on BNB Smart Chain Testnet.`}
            </p>
          </div>
        </div>
        <button
          onClick={handleClaim}
          disabled={!isConnected || (onCooldown && !wrongChain) || isSubmitting || isConfirming || isSwitching}
          className={clsx(
            "shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
            isConnected && (wrongChain || !onCooldown) && !isSubmitting && !isConfirming && !isSwitching
              ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20"
              : "cursor-not-allowed border-line text-ink-faint"
          )}
        >
          {isSwitching ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Switching network…
            </span>
          ) : isSubmitting || isConfirming ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> {isSubmitting ? "Confirm in wallet…" : "Claiming…"}
            </span>
          ) : wrongChain ? (
            "Switch to BSC Testnet"
          ) : (
            "Claim tBNB"
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-down">{error}</p>}
      {isSuccess && !error && <p className="mt-2 text-[11px] text-up">Claimed — tBNB sent to your wallet.</p>}
    </div>
  );
}
