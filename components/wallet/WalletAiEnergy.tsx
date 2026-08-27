"use client";
import { forwardRef, useState } from "react";
import { Zap, Check } from "lucide-react";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";
import { PAYMENT_PRODUCTS } from "@/lib/payments/config";
import { notifyAiEnergyChanged } from "@/lib/energyBus";
import { BuyWithElsButton } from "./BuyWithElsButton";

/** Phase 6.6.4 — wired to contracts/ELSTestnetPayment.sol's AI_ENERGY_10 product via BuyWithElsButton. Same "no fake transaction, backend verifies" rule as WalletProCards. */
export const WalletAiEnergy = forwardRef<HTMLDivElement>(function WalletAiEnergy(_props, ref) {
  const configured = Boolean(WALLET_NETWORK_CONFIG.AI_ENERGY_PURCHASE_CONTRACT);
  const [justPurchased, setJustPurchased] = useState(false);

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
        <div className="w-[136px] shrink-0">
          {justPurchased ? (
            <p className="flex items-center justify-center gap-1.5 rounded-md border border-up/30 bg-up/10 py-2 text-xs font-medium text-up">
              <Check size={13} /> Purchased
            </p>
          ) : (
            <BuyWithElsButton
              productId="AI_ENERGY_10"
              priceElsRaw={PAYMENT_PRODUCTS.AI_ENERGY_10.priceElsRaw}
              onGranted={() => {
                setJustPurchased(true);
                // AI Energy purchase bug fix: the server balance is already
                // credited by this point (BuyWithElsButton only calls
                // onGranted after /api/payments/verify returns GRANTED /
                // ALREADY_GRANTED) — this just tells every other mounted
                // balance display to re-fetch instead of showing a stale
                // number until the user reloads the page.
                notifyAiEnergyChanged();
              }}
            />
          )}
        </div>
      </div>
      {!configured && (
        <p className="mt-2 text-[11px] text-ink-faint">Testnet purchase contract not configured.</p>
      )}
    </div>
  );
});
