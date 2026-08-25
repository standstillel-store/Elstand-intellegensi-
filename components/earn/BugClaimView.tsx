"use client";
import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useSwitchChain } from "wagmi";
import { CheckCircle2, Loader2, ExternalLink, Wallet as WalletIcon } from "lucide-react";
import { useAppKit } from "@reown/appkit/react";
import { BUG_BOUNTY_ESCROW_ABI, BUG_HUNTER_CHAIN_ID } from "@/lib/bugHunter/config";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

type LoadState = "loading" | "ready" | "error";
type ClaimStep = "idle" | "confirm" | "signing" | "verifying" | "done" | "error";

interface ClaimInfo {
  publicId: string;
  title: string;
  rewardAmount: string;
  researcherWallet: `0x${string}`;
  bountyId: `0x${string}`;
  escrowAddress: `0x${string}`;
}

/**
 * Phase 6.6.1 Section 10/11 — claim UI.
 *
 * The actual claimBounty() call is signed by the CONNECTED wallet via
 * wagmi's writeContract — never by the server. This is the client half of
 * the Opsi B decision: the contract itself requires msg.sender to be the
 * bounty's researcher address, so the wallet that signs here MUST be the
 * same wallet the report was filed under, or the transaction will revert
 * on-chain (UnauthorizedCaller) regardless of anything this UI does.
 */
export function BugClaimView({ token }: { token: string }) {
  const { address: connectedWallet, chainId: walletChainId } = useAccount();
  const { open: openWalletConnect } = useAppKit();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [step, setStep] = useState<ClaimStep>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bug-hunter/claim/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Link klaim tidak valid.");
        if (!cancelled) {
          setInfo(json);
          setLoadState("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Gagal memuat data klaim.");
          setLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const walletMismatch = Boolean(info && connectedWallet && connectedWallet.toLowerCase() !== info.researcherWallet.toLowerCase());

  async function handleClaim() {
    if (!info || !connectedWallet) return;
    setClaimError(null);
    setStep("signing");
    try {
      if (walletChainId !== BUG_HUNTER_CHAIN_ID) {
        await switchChainAsync({ chainId: BUG_HUNTER_CHAIN_ID });
      }
      const hash = await writeContractAsync({
        address: info.escrowAddress,
        abi: BUG_BOUNTY_ESCROW_ABI,
        functionName: "claimBounty",
        args: [info.bountyId],
        chainId: BUG_HUNTER_CHAIN_ID,
      });
      setTxHash(hash);
      setStep("verifying");

      const res = await fetch(`/api/bug-hunter/claim/${encodeURIComponent(token)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Verifikasi gagal.");

      setStep("done");
    } catch (err) {
      setStep("error");
      setClaimError(err instanceof Error ? err.message.split("\n")[0] : "Klaim gagal.");
    }
  }

  if (loadState === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
        <Loader2 size={16} className="animate-spin" /> Memuat data klaim...
      </div>
    );
  }

  if (loadState === "error" || !info) {
    return <p className="rounded-md border border-down/30 bg-down/10 p-4 text-sm text-down">{loadError}</p>;
  }

  if (step === "done") {
    return (
      <div className="rounded-md border border-up/30 bg-up/10 p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto mb-2 text-up" />
        <p className="text-sm font-semibold text-ink">REWARD CLAIMED</p>
        <p className="mt-3 text-xs text-ink-faint">{info.publicId}</p>
        <p className="mt-1 text-lg font-semibold text-ink">{info.rewardAmount} ELS</p>
        <p className="mt-2 break-all font-mono text-[11px] text-ink-muted">{info.researcherWallet}</p>
        <p className="mt-1 text-xs text-ink-faint">Network: {WALLET_NETWORK_CONFIG.chainName}</p>
        <p className="mt-3 text-xs text-up">Status: CONFIRMED</p>
        {txHash && (
          <a
            href={`${WALLET_NETWORK_CONFIG.explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-xs text-signal-glow hover:underline"
          >
            View Transaction <ExternalLink size={12} />
          </a>
        )}
        <div className="mt-4">
          <a href="/earn" className="rounded-md border border-line px-3 py-1.5 text-xs text-ink-muted hover:bg-bg-raised/60">
            Back to Earn
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line bg-bg-surface p-5">
      <p className="text-xs text-ink-faint">{info.publicId}</p>
      <p className="mt-1 text-sm font-medium text-ink">{info.title}</p>
      <p className="mt-3 text-xs uppercase tracking-wide text-ink-faint">Status</p>
      <p className="text-sm text-up">APPROVED</p>
      <p className="mt-3 text-xs uppercase tracking-wide text-ink-faint">Reward</p>
      <p className="text-lg font-semibold text-ink">{info.rewardAmount} ELS</p>
      <p className="mt-3 text-xs uppercase tracking-wide text-ink-faint">Researcher wallet</p>
      <p className="break-all font-mono text-xs text-ink-muted">{info.researcherWallet}</p>

      {!connectedWallet ? (
        <button
          onClick={() => openWalletConnect()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm font-semibold text-signal-glow hover:bg-signal/20"
        >
          <WalletIcon size={14} /> Connect Wallet
        </button>
      ) : walletMismatch ? (
        <p className="mt-5 rounded-md border border-down/30 bg-down/10 p-3 text-xs text-down">
          Wallet yang terhubung ({connectedWallet.slice(0, 8)}...) tidak cocok dengan wallet researcher pada laporan ini. Hubungkan wallet yang benar.
        </p>
      ) : step === "idle" || step === "error" ? (
        <>
          <button
            onClick={handleClaim}
            className="mt-5 w-full rounded-md border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm font-semibold text-signal-glow hover:bg-signal/20"
          >
            CLAIM REWARD
          </button>
          {claimError && <p className="mt-2 text-xs text-down">{claimError}</p>}
        </>
      ) : (
        <button disabled className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-line px-4 py-2.5 text-sm text-ink-faint">
          <Loader2 size={14} className="animate-spin" /> {step === "signing" ? "Confirm in wallet..." : "Verifying..."}
        </button>
      )}
    </div>
  );
}
