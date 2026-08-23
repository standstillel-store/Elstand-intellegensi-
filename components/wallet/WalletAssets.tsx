"use client";
import { useReadContract, useBalance } from "wagmi";
import { formatUnits } from "viem";
import { Sparkles, Coins } from "lucide-react";
import { shortAddr } from "@/lib/format";
import { WALLET_NETWORK_CONFIG, WALLET_MAINNET_CONFIG } from "@/lib/web3/config";

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

function formatBalance(value: bigint | undefined, decimals: number | undefined, isLoading: boolean): string {
  if (value !== undefined && decimals !== undefined) {
    return Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  return isLoading ? "…" : "N/A";
}

function ElsRow({ label, config, address }: { label: string; config: typeof WALLET_NETWORK_CONFIG | typeof WALLET_MAINNET_CONFIG; address: `0x${string}` }) {
  const { ELS_CONTRACT, ELS_SYMBOL, chainId, chainName } = config;

  const balance = useReadContract({ address: ELS_CONTRACT, abi: ERC20_ABI, functionName: "balanceOf", args: [address], chainId });
  const decimals = useReadContract({ address: ELS_CONTRACT, abi: ERC20_ABI, functionName: "decimals", chainId });

  return (
    <div className="rounded-md border border-line px-3.5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10">
            <Sparkles size={16} className="text-signal-glow" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{label}</p>
            <p className="text-[11px] text-ink-faint">{chainName}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="mono-num text-sm text-ink">
            {formatBalance(balance.data as bigint | undefined, decimals.data as number | undefined, balance.isLoading)} {ELS_SYMBOL}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1 border-t border-line pt-3 text-[11px] text-ink-faint sm:grid-cols-2">
        <p>Network: {chainName}</p>
        <p className="mono-num truncate sm:text-right" title={ELS_CONTRACT}>
          Contract: {shortAddr(ELS_CONTRACT)}
        </p>
      </div>
    </div>
  );
}

function BnbRow({ label, chainId, chainName, symbol, address }: { label: string; chainId: number; chainName: string; symbol: string; address: `0x${string}` }) {
  const native = useBalance({ address, chainId });

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10">
          <Coins size={16} className="text-signal-glow" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{label}</p>
          <p className="text-[11px] text-ink-faint">{chainName}</p>
        </div>
      </div>
      <p className="mono-num shrink-0 text-sm text-ink">
        {native.data ? Number(formatUnits(native.data.value, native.data.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 }) : native.isLoading ? "…" : "N/A"} {symbol}
      </p>
    </div>
  );
}

/**
 * Section 8/9 — ELS and BNB, each shown separately for Mainnet and
 * Testnet. Deliberately never summed into one figure: a mainnet ELS
 * balance and a testnet ELS balance are different tokens on different
 * networks that happen to share a symbol, and conflating them would
 * misrepresent real (mainnet) holdings as test-only ones or vice versa.
 */
export function WalletAssets({ address }: { address: `0x${string}` }) {
  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-4">
      <p className="text-sm font-semibold text-ink">Wallet Assets</p>

      <div className="mt-3 space-y-2">
        <ElsRow label="ELS — Mainnet" config={WALLET_MAINNET_CONFIG} address={address} />
        <ElsRow label="ELS — Testnet" config={WALLET_NETWORK_CONFIG} address={address} />
        <BnbRow
          label="BNB — Mainnet"
          chainId={WALLET_MAINNET_CONFIG.chainId}
          chainName={WALLET_MAINNET_CONFIG.chainName}
          symbol={WALLET_MAINNET_CONFIG.nativeSymbol}
          address={address}
        />
        <BnbRow
          label="tBNB — Testnet"
          chainId={WALLET_NETWORK_CONFIG.chainId}
          chainName={WALLET_NETWORK_CONFIG.chainName}
          symbol={WALLET_NETWORK_CONFIG.nativeSymbol}
          address={address}
        />
      </div>
    </div>
  );
}
