"use client";
import { useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { Hexagon, Sparkles } from "lucide-react";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

// Minimal ERC-20 read surface — balanceOf + decimals only, no writes here.
const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

function AssetRow({
  icon,
  name,
  symbol,
  balance,
  network,
}: {
  icon: React.ReactNode;
  name: string;
  symbol: string;
  balance: string | null;
  network: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-bg-raised">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="text-[11px] text-ink-faint">{symbol}</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="mono-num text-sm text-ink">{balance ?? "-"}</p>
        <p className="text-[11px] text-ink-faint">{network}</p>
      </div>
    </div>
  );
}

export function WalletAssets({ address }: { address: `0x${string}` | undefined }) {
  const { chainName, ELS_CONTRACT } = WALLET_NETWORK_CONFIG;

  const nativeBalance = useBalance({
    address,
    chainId: WALLET_NETWORK_CONFIG.chainId,
    query: { enabled: Boolean(address) },
  });

  const elsBalance = useReadContract({
    address: ELS_CONTRACT ?? undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: WALLET_NETWORK_CONFIG.chainId,
    query: { enabled: Boolean(address && ELS_CONTRACT) },
  });
  const elsDecimals = useReadContract({
    address: ELS_CONTRACT ?? undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: WALLET_NETWORK_CONFIG.chainId,
    query: { enabled: Boolean(ELS_CONTRACT) },
  });

  const bnbFormatted = nativeBalance.data
    ? `${Number(nativeBalance.data.formatted).toFixed(4)}`
    : address
      ? nativeBalance.isLoading
        ? "…"
        : "N/A"
      : "-";

  const elsFormatted = !ELS_CONTRACT
    ? "-"
    : elsBalance.data !== undefined && elsDecimals.data !== undefined
      ? Number(formatUnits(elsBalance.data as bigint, elsDecimals.data as number)).toFixed(2)
      : address
        ? elsBalance.isLoading
          ? "…"
          : "N/A"
        : "-";

  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-4">
      <p className="text-sm font-semibold text-ink">Your Assets</p>

      <div className="mt-3 space-y-2">
        <AssetRow
          icon={<Hexagon size={15} className="text-amber" />}
          name={`${WALLET_NETWORK_CONFIG.nativeSymbol} Testnet`}
          symbol="BNB"
          balance={bnbFormatted}
          network={chainName}
        />
        <AssetRow
          icon={<Sparkles size={15} className="text-signal-glow" />}
          name="ELS (Testnet)"
          symbol="ELSTAND Token"
          balance={elsFormatted}
          network={ELS_CONTRACT ? chainName : "Contract not configured"}
        />
      </div>

      <p className="mt-3 text-[11px] text-ink-faint">USD values are not shown — no price feed configured for testnet assets.</p>
    </div>
  );
}
