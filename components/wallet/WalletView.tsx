"use client";
import { useAccount } from "wagmi";
import { isWalletConnectConfigured, WALLET_NETWORK_CONFIG } from "@/lib/web3/config";
import { WalletHeader } from "./WalletHeader";
import { WalletAssets } from "./WalletAssets";
import { WalletSwap } from "./WalletSwap";
import { WalletProCards } from "./WalletProCards";
import { WalletAiEnergy } from "./WalletAiEnergy";
import { WalletRecentActivity } from "./WalletRecentActivity";

export function WalletView() {
  const { address } = useAccount();

  if (!isWalletConnectConfigured) {
    return (
      <div className="rounded-lg border border-line bg-bg-surface/60 p-6 text-center">
        <p className="text-sm text-ink">Wallet Connect belum dikonfigurasi.</p>
        <p className="mt-1 text-xs text-ink-faint">
          Tambahkan <code className="rounded bg-bg-raised px-1 py-0.5">NEXT_PUBLIC_REOWN_PROJECT_ID</code> di .env.local
          (project gratis di cloud.reown.com) untuk mengaktifkan koneksi wallet {WALLET_NETWORK_CONFIG.chainName}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WalletHeader address={address} />
      <WalletAssets address={address} />
      <WalletSwap />

      {/* Desktop: Elvoid Pro + AI Energy side by side. Mobile: stacked, Pro before Energy. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <WalletProCards />
        <WalletAiEnergy />
      </div>

      <WalletRecentActivity address={address} />

      <p className="text-center text-[11px] text-ink-faint">
        All transactions are recorded on {WALLET_NETWORK_CONFIG.chainName}.
      </p>
    </div>
  );
}
