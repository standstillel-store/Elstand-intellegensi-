"use client";
import { useAppKit } from "@reown/appkit/react";
import { Wallet as WalletIcon, ShieldCheck } from "lucide-react";
import { isWalletConnectConfigured, WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

/**
 * Shown whenever the wallet isn't connected — no balance, address, or
 * activity renders until useAccount().isConnected is true. See WalletView.tsx.
 */
export function WalletConnectGate() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-lg border border-line bg-bg-surface/60 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-signal/30 bg-signal/10">
        <WalletIcon size={24} className="text-signal-glow" />
      </div>

      <div>
        <p className="eyebrow text-[10px] tracking-[0.18em] text-ink-faint">ELSTAND WALLET</p>
        <p className="mt-2 text-lg font-semibold text-ink">Connect your wallet</p>
        <p className="mt-1 text-xs text-ink-faint">
          View your ELS Testnet balance, buy Elvoid Pro, and top up AI Energy.
        </p>
      </div>

      {isWalletConnectConfigured ? (
        <ConnectButton />
      ) : (
        <p className="rounded-md border border-line px-3 py-2.5 text-xs text-ink-faint">
          Wallet Connect belum dikonfigurasi — tambahkan{" "}
          <code className="rounded bg-bg-raised px-1 py-0.5">NEXT_PUBLIC_REOWN_PROJECT_ID</code> di .env.local.
        </p>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <ShieldCheck size={12} />
        Supported Network — {WALLET_NETWORK_CONFIG.chainName}
      </div>
    </div>
  );
}

function ConnectButton() {
  const { open } = useAppKit();
  return (
    <button
      onClick={() => open()}
      className="w-full rounded-md border border-signal/40 bg-signal/10 py-3 text-sm font-medium text-signal-glow hover:bg-signal/20"
    >
      Connect Wallet
    </button>
  );
}
