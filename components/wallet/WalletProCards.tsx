"use client";
import { forwardRef, useState } from "react";
import { Crown, Check } from "lucide-react";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";
import { PAYMENT_PRODUCTS, type PaymentProductId } from "@/lib/payments/config";
import { BuyWithElsButton } from "./BuyWithElsButton";

const PLANS: { id: PaymentProductId; label: string; price: string; highlight: string | null; benefits: string[] }[] = [
  {
    id: "ELVOID_PRO_WEEK",
    label: "ELVOID PRO — 1 WEEK",
    price: "1,500",
    highlight: "POPULAR",
    benefits: ["Unlock Elvoid Premium Dashboard", "AI Energy: 25/day", "AI Signal Grade A+", "50 AI Energy First Bonus"],
  },
  {
    id: "ELVOID_PRO_MONTH",
    label: "ELVOID PRO — 1 MONTH",
    price: "15,000",
    highlight: null,
    benefits: ["Unlock Elvoid Premium Dashboard", "AI Energy: 25/day", "AI Signal Grade A++", "100 AI Energy First Bonus"],
  },
];

/**
 * Phase 6.6.4 — wired to contracts/ELSTestnetPayment.sol via
 * BuyWithElsButton (approve -> purchase -> /api/payments/verify). The
 * button still self-disables to "Coming Soon" if
 * WALLET_NETWORK_CONFIG.PREMIUM_PURCHASE_CONTRACT is ever unset again
 * (e.g. a future redeploy before the address is updated) — see that
 * component's own configured check.
 */
export const WalletProCards = forwardRef<HTMLDivElement>(function WalletProCards(_props, ref) {
  const configured = Boolean(WALLET_NETWORK_CONFIG.PREMIUM_PURCHASE_CONTRACT);
  const [grantedPlan, setGrantedPlan] = useState<PaymentProductId | null>(null);

  return (
    <div ref={ref} className="rounded-lg border border-line bg-bg-surface/60 p-4">
      <div className="flex items-center gap-2">
        <Crown size={15} className="text-amber" />
        <p className="text-sm font-semibold text-ink">Elvoid Pro</p>
      </div>
      <p className="mt-0.5 text-[11px] text-ink-faint">Unlock the ELSTAND premium intelligence ecosystem.</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div key={plan.id} className="relative rounded-md border border-signal/25 bg-signal/[0.04] p-3.5">
            {plan.highlight && (
              <span className="absolute right-3 top-3 rounded bg-amber/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber">
                {plan.highlight}
              </span>
            )}
            <p className="text-[11px] font-medium uppercase tracking-wide text-signal-glow">{plan.label}</p>
            <p className="mt-1.5 text-2xl font-bold text-ink">
              {plan.price} <span className="text-sm font-medium text-ink-faint">ELS</span>
            </p>

            <ul className="mt-3 space-y-1.5">
              {plan.benefits.map((b) => (
                <li key={b} className="flex items-start gap-1.5 text-xs text-ink-muted">
                  <Check size={12} className="mt-0.5 shrink-0 text-signal-glow" />
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-3.5">
              {grantedPlan === plan.id ? (
                <p className="flex items-center justify-center gap-1.5 rounded-md border border-up/30 bg-up/10 py-2 text-xs font-medium text-up">
                  <Check size={13} /> Premium Active
                </p>
              ) : (
                <BuyWithElsButton
                  productId={plan.id}
                  priceElsRaw={PAYMENT_PRODUCTS[plan.id].priceElsRaw}
                  onGranted={() => setGrantedPlan(plan.id)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {!configured && (
        <p className="mt-3 text-[11px] text-ink-faint">Testnet purchase contract not configured.</p>
      )}
    </div>
  );
});
