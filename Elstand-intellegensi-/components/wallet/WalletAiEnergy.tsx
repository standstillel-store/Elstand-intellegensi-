"use client";
import { forwardRef } from "react";
import { Zap, Lock } from "lucide-react";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

/** Same "no fake transaction" rule as WalletProCards — disabled until AI_ENERGY_PURCHASE_CONTRACT is deployed. */
export const WalletAiEnergy = forwardRef<HTMLDivElement>(function WalletAiEnergy(_props, ref) {
  const configured = Boolean(WALLET_NETWORK_CONFIG.AI_ENERGY_PURCHASE_CONTRACT);

  return (
    <div ref={ref} className="rounded-lg border border-line bg-bg-surface/60 p-4">
      <div className="flex items-center gap-2">
        <Zap size={15} className="text-signal-glow" />
        <p className="text-sm font-semibold text-ink">AI Energy</p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line px-4 py-3.5">
        <div>
          <p className="text-xl font-bold text-signal-glow">10 AI Energy</p>
          <p className="text-[11px] text-ink-faint">15 ELS</p>
        </div>
        <button
          disabled
          title={configured ? undefined : "Testnet purchase contract not configured"}
          className="flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md border border-line bg-bg-raised px-3.5 py-2 text-xs font-medium text-ink-faint"
        >
          <Lock size={12} />
          {configured ? "Buy with ELS" : "Coming Soon"}
        </button>
      </div>
      {!configured && (
        <p className="mt-2 text-[11px] text-ink-faint">Testnet purchase contract not configured.</p>
      )}
    </div>
  );
});
