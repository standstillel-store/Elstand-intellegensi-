"use client";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { Sparkles } from "lucide-react";
import { shortAddr } from "@/lib/format";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/** Single-asset list — ELS Testnet only, per spec (no long generic token lists). */
export function WalletAssets({ address }: { address: `0x${string}` }) {
  const { ELS_CONTRACT, ELS_NAME, ELS_SYMBOL, chainName } = WALLET_NETWORK_CONFIG;

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

  const formatted =
    balance.data !== undefined && decimals.data !== undefined
      ? Number(formatUnits(balance.data as bigint, decimals.data as number)).toLocaleString("en-US", { maximumFractionDigits: 2 })
      : balance.isLoading
        ? "…"
        : "N/A";

  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-4">
      <p className="text-sm font-semibold text-ink">Wallet Assets</p>

      <div className="mt-3 rounded-md border border-line px-3.5 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10">
              <Sparkles size={16} className="text-signal-glow" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{ELS_NAME}</p>
              <p className="text-[11px] text-ink-faint">{ELS_SYMBOL}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="mono-num text-sm text-ink">{formatted} ELS</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-1 border-t border-line pt-3 text-[11px] text-ink-faint sm:grid-cols-2">
          <p>Network: {chainName}</p>
          <p className="mono-num truncate sm:text-right" title={ELS_CONTRACT}>
            Contract: {shortAddr(ELS_CONTRACT)}
          </p>
        </div>
      </div>
    </div>
  );
}
