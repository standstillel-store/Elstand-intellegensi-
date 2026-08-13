"use client";
import { useEffect, useState } from "react";
import { CircleUser, Zap, Coins } from "lucide-react";
import type { AppUser, AppProfile } from "@/lib/auth/profile";
import { shortAddr } from "@/lib/format";

interface AccountMeResponse {
  signedIn: boolean;
  user: AppUser | null;
  profile: AppProfile | null;
  energy: { balance: number; nextResetAt: string } | null;
}

interface WalletRow {
  wallet_address: string;
}

// Reuses the exact same /api/account/me source ProfileMenu.tsx already uses
// for nickname + AI Energy, plus /api/wallet for a connected address (both
// pre-existing endpoints — no new state introduced). ELS has no real
// contract/balance source anywhere in the codebase yet, so it always shows
// N/A here rather than a fabricated number.
export function SidebarProfile() {
  const [me, setMe] = useState<AccountMeResponse | null>(null);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setMe(data);
      })
      .catch(() => {});
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.wallets?.[0]?.wallet_address) {
          setWalletAddr(data.wallets[0].wallet_address);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const nickname = me?.profile?.username || "Trader";
  const energyBalance = me?.energy?.balance;

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
        <span className="mono-num font-semibold text-ink-faint">N/A</span>
      </div>
    </div>
  );
}
