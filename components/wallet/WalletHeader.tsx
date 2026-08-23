"use client";
import { useState } from "react";
import { Copy, Check, ExternalLink, Crown, Zap, History } from "lucide-react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { shortAddr } from "@/lib/format";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export function WalletHeader({
  address,
  onBuyPro,
  onBuyEnergy,
  onViewActivity,
}: {
  address: `0x${string}`;
  onBuyPro: () => void;
  onBuyEnergy: () => void;
  onViewActivity: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { ELS_CONTRACT, chainShortLabel, explorerUrl } = WALLET_NETWORK_CONFIG;

  const balance = useReadContract({
    address: ELS_CONTRACT,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
    chainId: WALLET_NETWORK_CONFIG.chainId,
  });
  const decimals = useReadContract({
    address: ELS_CONTRACT,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: WALLET_NETWORK_CONFIG.chainId,
  });

  const elsBalance =
    balance.data !== undefined && decimals.data !== undefined
      ? Number(formatUnits(balance.data as bigint, decimals.data as number)).toLocaleString("en-US", { maximumFractionDigits: 2 })
      : balance.isLoading
        ? "…"
        : "N/A";

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-5 text-center sm:p-7">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="eyebrow text-[10px] tracking-[0.18em] text-ink-faint">ELSTAND WALLET</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="mono-num rounded-md border border-line bg-bg-raised px-2.5 py-1 text-xs text-ink">
              {shortAddr(address)}
            </span>
            <button onClick={handleCopy} className="text-ink-faint hover:text-ink" aria-label="Copy address">
              {copied ? <Check size={13} className="text-up" /> : <Copy size={13} />}
            </button>
            <a
              href={`${explorerUrl}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="text-ink-faint hover:text-ink"
              aria-label="View on BscScan"
            >
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
        <span className="rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-[11px] font-medium text-signal-glow">
          {chainShortLabel}
        </span>
      </div>

      <div className="mt-6">
        {/* Section 8 — this headline number is the TESTNET balance only
            (this dashboard's payment/quest actions are testnet-scoped).
            Mainnet ELS is shown separately, never summed in here, in the
            Wallet Assets section below. */}
        <p className="text-xs text-ink-muted">ELS Testnet Balance</p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-ink">
          {elsBalance} <span className="text-lg font-medium text-ink-faint">ELS</span>
        </p>
        <p className="mt-1 text-[11px] text-ink-faint">Testnet Asset — No market value · Mainnet balance shown below</p>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          onClick={onBuyPro}
          className="flex items-center justify-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-4 py-2.5 text-xs font-medium text-signal-glow hover:bg-signal/20"
        >
          <Crown size={13} /> Buy Elvoid Pro
        </button>
        <button
          onClick={onBuyEnergy}
          className="flex items-center justify-center gap-1.5 rounded-md border border-line px-4 py-2.5 text-xs font-medium text-ink-muted hover:bg-bg-raised hover:text-ink"
        >
          <Zap size={13} /> Buy AI Energy
        </button>
        <button
          onClick={onViewActivity}
          className="flex items-center justify-center gap-1.5 rounded-md border border-line px-4 py-2.5 text-xs font-medium text-ink-muted hover:bg-bg-raised hover:text-ink"
        >
          <History size={13} /> Transaction History
        </button>
      </div>
    </div>
  );
}
