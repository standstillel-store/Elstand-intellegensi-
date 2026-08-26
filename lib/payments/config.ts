// ---------------------------------------------------------------------------
// contracts/ELSTestnetPayment.sol — Phase 6.6.4. Single payment processor
// for both Elvoid Pro membership and AI Energy purchases (see the
// contract's three seeded productIds below). Same "null until deployed,
// never guessed" rule as lib/rewards/config.ts's BUY_ELS_TESTNET_QUEST_CONFIG
// — PAYMENT_CONTRACT_ADDRESS is read from env here (server-side config),
// separately from lib/web3/config.ts's client-side WALLET_NETWORK_CONFIG
// constant (which is what the browser bundle actually reads to build the
// wagmi tx). Both must point at the same deployed address; keep them in
// sync by hand when redeploying, same as SWAP_CONTRACT_ADDRESS today.
// ---------------------------------------------------------------------------

/** productId => on-chain price in ELS wei (18 decimals) and what one successful purchase grants. Prices here MUST match contracts/ELSTestnetPayment.sol's constructor seed exactly — this is a read-time mirror for the backend to validate against, not a separate source of truth. */
export const PAYMENT_PRODUCTS = {
  ELVOID_PRO_WEEK: { priceElsRaw: BigInt("1500000000000000000000"), kind: "premium" as const, durationDays: 7 },
  ELVOID_PRO_MONTH: { priceElsRaw: BigInt("15000000000000000000000"), kind: "premium" as const, durationDays: 30 },
  AI_ENERGY_10: { priceElsRaw: BigInt("15000000000000000000"), kind: "ai_energy" as const, aiEnergyAmount: 10 },
} as const;

export type PaymentProductId = keyof typeof PAYMENT_PRODUCTS;

export function isKnownProductId(id: string): id is PaymentProductId {
  return Object.prototype.hasOwnProperty.call(PAYMENT_PRODUCTS, id);
}

export const PAYMENT_CONTRACT_CONFIG = {
  chainId: 97,
  elsTokenAddress: "0x4aea3938eb5c5a594410bf67c2f2107970901a4d" as `0x${string}`, // WALLET_NETWORK_CONFIG.ELS_CONTRACT, lowercased — same convention as BUY_ELS_TESTNET_QUEST_CONFIG
  paymentContract: (process.env.PAYMENT_CONTRACT_ADDRESS as `0x${string}` | undefined) ?? "0x576bba3714983B59d5440C8f6Bb7Dd048cf9628b",
} as const;

export const PAYMENT_CONTRACT_CONFIGURED = Boolean(PAYMENT_CONTRACT_CONFIG.paymentContract);
