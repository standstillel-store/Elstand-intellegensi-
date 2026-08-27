"use client";
import { useCallback, useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { CircleUser, Zap, Coins } from "lucide-react";
import type { AppUser, AppProfile } from "@/lib/auth/profile";
import { shortAddr } from "@/lib/format";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";
import { useAiEnergyRefresh } from "@/lib/energyBus";

interface AccountMeResponse {
  signedIn: boolean;
  user: AppUser | null;
  profile: AppProfile | null;
  energy: { balance: number; nextResetAt: string } | null;
  wallet: { wallet_address: string; wallet_type: string | null; chain_id: number | null } | null;
}

const ERC20_BALANCE_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/**
 * ELS balance for whichever address the sidebar is showing. Deliberately
 * reads on-chain via the PRIMARY VERIFIED wallet address (not a connected
 * wagmi session) — useReadContract just makes an RPC call, it doesn't
 * require an active wallet connection, so this renders a real balance even
 * when the user hasn't opened /wallet or connected in this browser tab.
 * Testnet only, matching the existing "primary ELS surface is testnet"
 * design (see lib/web3/config.ts WALLET_NETWORK_CONFIG). Never hardcoded.
 */
function ElsBalance({ address }: { address: `0x${string}` }) {
  const { ELS_CONTRACT, chainId } = WALLET_NETWORK_CONFIG;
  const balance = useReadContract({ address: ELS_CONTRACT, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [address], chainId });
  const decimals = useReadContract({ address: ELS_CONTRACT, abi: ERC20_BALANCE_ABI, functionName: "decimals", chainId });

  if (balance.data !== undefined && decimals.data !== undefined) {
    return <>{Number(formatUnits(balance.data as bigint, decimals.data as number)).toLocaleString("en-US", { maximumFractionDigits: 2 })}</>;
  }
  return <>{balance.isLoading ? "…" : "N/A"}</>;
}

// Single source of truth: /api/account/me now resolves the PRIMARY VERIFIED
// wallet server-side (lib/wallet/primary.ts — the same helper Earn/Rewards
// trusts), so this component no longer makes its own /api/wallet call that
// could surface an unverified or merely-most-recent address instead.
export function SidebarProfile() {
  const [me, setMe] = useState<AccountMeResponse | null>(null);

  const loadMe = useCallback(() => {
    fetch("/api/account/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setMe(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // AI Energy purchase bug fix: also refetch when a purchase/claim happens
  // anywhere else in the app, not only on mount.
  useAiEnergyRefresh(loadMe);

  const nickname = me?.profile?.username || "Trader";
  const energyBalance = me?.energy?.balance;
  const walletAddr = me?.wallet?.wallet_address ?? null;

  return (
    <div className="space-y-2.5 rounded-md border border-line bg-bg-raised/60 p-3">
      <div className="flex items-center gap-2.5">
        {me?.profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.profile.avatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border border-line"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-bg-surface text-ink-faint">
            <CircleUser size={16} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{nickname}</p>
          <p className="truncate text-[11px] text-ink-faint">{walletAddr ? shortAddr(walletAddr) : "Wallet: N/A"}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Zap size={12} className="text-signal-glow" /> AI Energy
        </span>
        <span className="mono-num font-semibold text-ink">{energyBalance ?? "—"}</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Coins size={12} className="text-ink-faint" /> ELS
        </span>
        <span className="mono-num font-semibold text-ink-faint">
          {walletAddr ? <ElsBalance address={walletAddr as `0x${string}`} /> : "N/A"}
        </span>
      </div>
    </div>
  );
}
