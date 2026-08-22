// ---------------------------------------------------------------------------
// Phase 6.5 — Earn & Reward System config.
//
// Single source of truth for quest slugs, reward amounts (mirrors
// supabase/migrations/2026-08-earn-rewards.sql's seed — the DB is what's
// actually read for amounts at claim time, this is what the UI/verifier
// code references), and the on-chain addresses each quest's verifier
// checks against.
//
// Follows the exact same "null until confirmed/deployed, never fabricate an
// address" rule lib/web3/config.ts already uses for
// PREMIUM_PURCHASE_CONTRACT / AI_ENERGY_PURCHASE_CONTRACT — a quest whose
// contract config is null must show "Coming Soon" / stay disabled, never
// silently accept an unverified transaction.
// ---------------------------------------------------------------------------

export type QuestSlug = "referral" | "add_liquidity" | "buy_els";

export const QUEST_REWARDS: Record<QuestSlug, { els: number; aiEnergy: number; oneTime: boolean }> = {
  referral: { els: 0, aiEnergy: 15, oneTime: false }, // one-time is enforced per referred wallet, not per quest
  add_liquidity: { els: 15, aiEnergy: 35, oneTime: true },
  buy_els: { els: 25, aiEnergy: 35, oneTime: true },
};

/**
 * ⚠️ CONFIG NOTE — the Add Liquidity destination URL supplied in the brief
 * points at `chain=bnb` on app.uniswap.org, which is Uniswap's slug for BSC
 * MAINNET (chain id 56), and its `currencyB` (0x3a0664...C82) is a
 * DIFFERENT address than the already-configured BSC TESTNET ELS token in
 * lib/web3/config.ts's WALLET_NETWORK_CONFIG.ELS_CONTRACT
 * (0x4AeA3938eb5c5A594410Bf67c2F2107970901a4D, chain id 97). That conflicts
 * with this same brief's "ELS TESTNET" reward label and Section 18
 * ("clearly separate MAINNET ELS from TESTNET ELS ... do not accidentally
 * use mainnet reward contracts").
 *
 * Rather than silently pick one interpretation, this config keeps the two
 * possible chains/tokens explicit and defaults to what the literal URL
 * says (mainnet, since that's the actual destination users will be sent
 * to) — an operator MUST confirm which is correct (most likely the URL
 * needs to be regenerated against the testnet pool) before this quest goes
 * live. See the final report for this flagged as a blocking open question.
 */
export const LIQUIDITY_QUEST_CHAIN_CONFIG = {
  chainId: Number(process.env.EARN_LIQUIDITY_CHAIN_ID ?? 56),
  elsTokenAddress: (process.env.EARN_LIQUIDITY_ELS_ADDRESS ?? "0x3a0664300EA06Ba7c01EDC9951c1b04BE9101C82").toLowerCase(),
  /**
   * Uniswap V4 PoolManager (BSC mainnet) — the singleton contract every V4
   * pool's ModifyLiquidity/Swap events are emitted from, per
   * https://docs.uniswap.org/contracts/v4/deployments. Confirmed against
   * BscScan's verified "Uniswap V4: Pool Manager" contract. This is the
   * one address a liquidity-add transaction is structurally guaranteed to
   * touch, regardless of which periphery router/PositionManager built the
   * calldata — verifying against this (rather than a specific
   * PositionManager, which Uniswap's own docs warn is NOT guaranteed to be
   * the same address across chains/deployments) is what makes rule 5 of
   * Section 4 ("interacts with the expected Uniswap V4 infrastructure")
   * actually reliable here.
   */
  poolManager: (process.env.EARN_UNISWAP_V4_POOL_MANAGER ?? "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df").toLowerCase(),
  /**
   * Null until an operator confirms the real Position Manager address for
   * this deployment (see the class-level note above) — when set, the
   * verifier additionally requires the tx's `to` address to match it,
   * tightening rule 5 beyond "touched the PoolManager at all". Left
   * unset by default rather than guessed, per this file's header rule.
   */
  positionManager: (process.env.EARN_UNISWAP_V4_POSITION_MANAGER as `0x${string}` | undefined) ?? null,
  /** Minimum ELS-side liquidity amount (in ELS token's smallest unit, pre-decimals) a ModifyLiquidity/Transfer must move to count — rule 9 of Section 4. 0 = no minimum enforced (any nonzero add counts). Set via env once the desired floor is decided. */
  minimumElsAmountRaw: process.env.EARN_LIQUIDITY_MIN_ELS_RAW ? BigInt(process.env.EARN_LIQUIDITY_MIN_ELS_RAW) : BigInt(0),
} as const;

export const LIQUIDITY_QUEST_CONFIGURED = Boolean(LIQUIDITY_QUEST_CHAIN_CONFIG.poolManager);

/**
 * Buy ELS — unlike Add Liquidity, the brief gives no destination URL and no
 * router/contract address, and the existing codebase has NO deployed ELS
 * purchase contract anywhere (lib/web3/config.ts's
 * PREMIUM_PURCHASE_CONTRACT / AI_ENERGY_PURCHASE_CONTRACT are both `null`
 * for the exact same reason — "Coming Soon" until deployed). Per Section 20
 * ("do not overengineer" / do not fabricate infrastructure that doesn't
 * exist), this stays unconfigured: the quest card renders but its verify
 * button is disabled with "Coming Soon" until these are filled in.
 */
export const BUY_ELS_QUEST_CONFIG = {
  chainId: Number(process.env.EARN_BUY_ELS_CHAIN_ID ?? 97), // reuses the existing BSC-testnet wallet chain
  elsTokenAddress: (process.env.NEXT_PUBLIC_ELS_TESTNET_ADDRESS ?? "0x4AeA3938eb5c5A594410Bf67c2F2107970901a4D").toLowerCase(),
  /** Router/pair/pool contract ELS is actually bought through. Null = not deployed yet. */
  purchaseContract: (process.env.EARN_BUY_ELS_CONTRACT as `0x${string}` | undefined) ?? null,
  minimumElsAmountRaw: process.env.EARN_BUY_ELS_MIN_ELS_RAW ? BigInt(process.env.EARN_BUY_ELS_MIN_ELS_RAW) : BigInt(0),
} as const;

export const BUY_ELS_QUEST_CONFIGURED = Boolean(BUY_ELS_QUEST_CONFIG.purchaseContract);

/** How many times VERIFYING may be attempted before a SYSTEM_ERROR row stops offering "RETRY VERIFICATION" automatically in the UI (the backend itself never hard-caps retries — Section 8: "do not permanently reject a transaction merely because one attempt failed" — this is a UI nudge only, not enforced server-side). */
export const MAX_SUGGESTED_VERIFY_RETRIES = 10;
