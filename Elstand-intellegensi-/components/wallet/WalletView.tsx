"use client";
import { useRef } from "react";
import { useAccount } from "wagmi";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";
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
  const { address, isConnected } = useAccount();
  const proRef = useRef<HTMLDivElement>(null);
  const energyRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);

  if (!isConnected || !address) {
    return <WalletConnectGate />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
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
