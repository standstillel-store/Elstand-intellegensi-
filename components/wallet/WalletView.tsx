"use client";
import { useRef } from "react";
import { useAccount } from "wagmi";
import { Loader2, ShieldAlert } from "lucide-react";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";
import { useWalletAutoVerify } from "@/lib/wallet/useAutoVerify";
import { WalletConnectGate } from "./WalletConnectGate";
import { WalletHeader } from "./WalletHeader";
import { WalletAssets } from "./WalletAssets";
import { WalletProCards } from "./WalletProCards";
import { WalletAiEnergy } from "./WalletAiEnergy";
import { WalletRecentActivity } from "./WalletRecentActivity";

function scrollTo(ref: React.RefObject<HTMLDivElement>) {
  ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function WalletView() {
  // `status` distinguishes a real disconnect from wagmi's transient
  // "reconnecting" phase (fired on tab focus / visibility regain while it
  // re-establishes the AppKit/WalletConnect session from cookieStorage).
  // Gating on `!isConnected` alone flashes the "Connect Wallet" gate every
  // time the user switches back to this tab, even though the session is
  // still valid and about to resolve — that's the perceived
  // disconnect-on-tab-switch bug, not an actual session loss.
  const { address, isConnected, status } = useAccount();
  const proRef = useRef<HTMLDivElement>(null);
  const energyRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);

  // Previously this page only established a client-side wagmi/AppKit
  // connection — it LOOKED connected (address + balance visible) but never
  // asked for an ownership signature, so nothing ever reached the `wallets`
  // table. Settings > Wallet was the only screen that did this. Mounting
  // the same hook here means connecting from /wallet now also signs and
  // persists — the wallet actually becomes the account's verified/primary
  // wallet instead of a client-only session that vanishes on refresh.
  const { verifying, verifyError } = useWalletAutoVerify();

  if (status === "reconnecting" || status === "connecting") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-line bg-bg-surface/60 px-6 py-14 text-center text-xs text-ink-faint">
        Restoring wallet session…
      </div>
    );
  }

  if (!isConnected || !address) {
    return <WalletConnectGate />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {verifying && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-bg-surface/60 px-3.5 py-2.5 text-xs text-ink-faint">
          <Loader2 size={13} className="animate-spin" /> Waiting for signature to verify wallet ownership…
        </div>
      )}
      {verifyError && (
        <div className="flex items-center gap-2 rounded-md border border-down/30 bg-down/5 px-3.5 py-2.5 text-xs text-down">
          <ShieldAlert size={13} /> {verifyError} — your wallet is connected but not yet saved to your account.
        </div>
      )}
      <WalletHeader
        address={address}
        onBuyPro={() => scrollTo(proRef)}
        onBuyEnergy={() => scrollTo(energyRef)}
        onViewActivity={() => scrollTo(activityRef)}
      />
      <WalletAssets address={address} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <WalletProCards ref={proRef} />
        <WalletAiEnergy ref={energyRef} />
      </div>

      <WalletRecentActivity ref={activityRef} address={address} />

      <p className="text-center text-[11px] text-ink-faint">
        All ELS transactions are recorded on {WALLET_NETWORK_CONFIG.chainName}.
      </p>
    </div>
  );
}
