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

export type QuestSlug = "referral" | "add_liquidity" | "buy_els" | "buy_els_testnet";

export const QUEST_REWARDS: Record<QuestSlug, { els: number; aiEnergy: number; oneTime: boolean }> = {
  referral: { els: 0, aiEnergy: 15, oneTime: false }, // one-time is enforced per referred wallet, not per quest
  add_liquidity: { els: 15, aiEnergy: 35, oneTime: true },
  buy_els: { els: 25, aiEnergy: 35, oneTime: true },
  buy_els_testnet: { els: 25, aiEnergy: 35, oneTime: true },
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
 * Shared Uniswap V4 pool identity for the ELS/native pool — used by BOTH
 * quests (Add Liquidity provisions it, Buy ELS swaps against it), so this
 * lives once here rather than duplicated.
 *
 * Values are NOT invented: they're read from the exact same pool the app
 * already sends users to for Add Liquidity — see
 * components/earn/EarnView.tsx's ADD_LIQUIDITY_URL, whose `fee` param
 * decodes to {"feeAmount":375,"tickSpacing":4,"isDynamic":false} and whose
 * `hook` param is `undefined` (no hook contract). V4's PoolKey is
 * {currency0, currency1, fee, tickSpacing, hooks}, sorted so the lower
 * address is currency0 — the native-currency sentinel (0x0) is always the
 * lowest possible address, so it is currency0 here regardless of what the
 * ELS address happens to be.
 *
 * If a second ELS pool with different parameters is ever created, this
 * must be repointed (via the env vars below) or Buy ELS will verify
 * against the wrong pool and reject genuine swaps in the new one — this
 * is a real limitation, not a hidden assumption; noted in the final report.
 */
export const ELS_BNB_POOL_KEY = {
  currency0: "0x0000000000000000000000000000000000000000" as `0x${string}`, // native BNB sentinel
  currency1: LIQUIDITY_QUEST_CHAIN_CONFIG.elsTokenAddress as `0x${string}`,
  fee: Number(process.env.EARN_ELS_BNB_POOL_FEE ?? 375),
  tickSpacing: Number(process.env.EARN_ELS_BNB_POOL_TICK_SPACING ?? 4),
  hooks: (process.env.EARN_ELS_BNB_POOL_HOOKS ?? "0x0000000000000000000000000000000000000000").toLowerCase() as `0x${string}`,
} as const;

/**
 * Buy ELS — per explicit operator decision (no new purchase/presale
 * contract, no new deployment): reuses the SAME already-verified Uniswap
 * V4 infrastructure as Add Liquidity. "Buying ELS" here means "swapping
 * native BNB for ELS in the existing ELS/BNB V4 pool" — the PoolManager
 * singleton is the contract this actually touches, exactly like Add
 * Liquidity. `EARN_BUY_ELS_CONTRACT` is kept as an optional override (for
 * a future dedicated purchase/router contract, if one is ever deployed)
 * but now defaults to the PoolManager rather than defaulting to `null`,
 * since there genuinely is verifiable purchase infrastructure today.
 */
export const BUY_ELS_QUEST_CONFIG = {
  chainId: Number(process.env.EARN_BUY_ELS_CHAIN_ID ?? 56),
  elsTokenAddress: (process.env.EARN_BUY_ELS_ELS_ADDRESS ?? "0x3a0664300EA06Ba7c01EDC9951c1b04BE9101C82").toLowerCase(),
  /** Contract a Buy ELS transaction must touch. Defaults to the same verified V4 PoolManager Add Liquidity uses (see LIQUIDITY_QUEST_CHAIN_CONFIG.poolManager's source note) — override only if a dedicated purchase/router contract is deployed later. */
  purchaseContract: ((process.env.EARN_BUY_ELS_CONTRACT as `0x${string}` | undefined) ?? LIQUIDITY_QUEST_CHAIN_CONFIG.poolManager) as `0x${string}`,
  minimumElsAmountRaw: process.env.EARN_BUY_ELS_MIN_ELS_RAW ? BigInt(process.env.EARN_BUY_ELS_MIN_ELS_RAW) : BigInt(0),
} as const;

/**
 * Always true now that purchaseContract defaults to the verified
 * PoolManager rather than null — Buy ELS no longer waits on a
 * never-deployed presale contract. Kept as a named export (rather than
 * inlining `true`) so the verifier/status route/UI all read the same
 * single source of truth, and so a future operator who explicitly wants
 * to force this back to "Coming Soon" only has to null out
 * EARN_BUY_ELS_CONTRACT's fallback here, not hunt through call sites.
 */
export const BUY_ELS_QUEST_CONFIGURED = Boolean(BUY_ELS_QUEST_CONFIG.purchaseContract);

/**
 * Section 6 — the actual "$10 USD equivalent" floor, enforced against a
 * price-converted native-currency amount (lib/rewards/pricing.ts +
 * verifier.ts), NOT the raw `minimumElsAmountRaw` fields above (those stay
 * as an optional secondary/defense-in-depth floor on the ELS leg itself,
 * off by default). Previously there was no USD conversion anywhere in this
 * module — both quests only had the ELS-raw-amount floor, which defaults
 * to 0, i.e. no minimum was actually enforced at all.
 */
export const MINIMUM_USD_VALUE = Number(process.env.EARN_MINIMUM_USD_VALUE ?? 10);

/**
 * Section 8 — Reward Distributor. Deployed SEPARATELY on BNB Testnet, not
 * part of this codebase. Same "null until confirmed/deployed" rule as
 * every other contract address in this file: until an operator supplies
 * this, lib/rewards/distributor.ts refuses to attempt an on-chain
 * transfer, and the UI must show "Testnet reward distribution is
 * currently being configured" (Section 14) rather than implying a real
 * token was sent — see REWARD_DISTRIBUTION_STATUS_MESSAGE in
 * lib/rewards/distributor.ts, surfaced via GET /api/rewards/status's
 * `distributorConfigured` field.
 */
export const REWARD_DISTRIBUTOR_ADDRESS = (process.env.EARN_REWARD_DISTRIBUTOR_ADDRESS as `0x${string}` | undefined) ?? null;
export const REWARD_DISTRIBUTOR_CONFIGURED = Boolean(REWARD_DISTRIBUTOR_ADDRESS);

/**
 * Testnet-only "Buy ELS" — separate quest slug from `buy_els` (mainnet V4),
 * per explicit operator decision: mainnet quest config/behavior is left
 * completely untouched, this is new/additive infrastructure sitting
 * alongside it. Verifies against ELSTestnetSwap.sol's `SwapExecuted` event
 * (contracts/ELSTestnetSwap.sol) — a fixed-rate vending contract, not an
 * AMM, since Uniswap V4 has no verified deployment on BSC Testnet (chain
 * 97) as of this writing (checked docs.uniswap.org/contracts/v4/deployments
 * — only Sepolia listed — and found no verified PoolManager on
 * testnet.bscscan.com). "Provide Liquidity" has no testnet equivalent by
 * explicit operator decision (a fixed-rate vending contract has no real
 * user-facing liquidity-provision action) and is intentionally NOT ported
 * here — testnet only ever has Buy ELS + the Faucet (which isn't an Earn
 * quest, it's a direct claim — see contracts/TestnetFaucet.sol).
 *
 * Same "null until an operator supplies the deployed address, never
 * fabricate one" rule as every other contract config in this file.
 */
export const BUY_ELS_TESTNET_QUEST_CONFIG = {
  chainId: 97,
  elsTokenAddress: "0x4aea3938eb5c5a594410bf67c2f2107970901a4d" as `0x${string}`, // WALLET_NETWORK_CONFIG.ELS_CONTRACT, lowercased
  swapContract: (process.env.SWAP_CONTRACT_ADDRESS as `0x${string}` | undefined) ?? null,
  minimumElsAmountRaw: process.env.EARN_BUY_ELS_TESTNET_MIN_ELS_RAW ? BigInt(process.env.EARN_BUY_ELS_TESTNET_MIN_ELS_RAW) : BigInt(0),
} as const;

export const BUY_ELS_TESTNET_QUEST_CONFIGURED = Boolean(BUY_ELS_TESTNET_QUEST_CONFIG.swapContract);

/**
 * contracts/TestnetFaucet.sol — not tied to a quest/reward, just the
 * deployed address the /wallet or /earn UI will point the "Claim tBNB"
 * button at once that UI exists. Same null-until-configured rule as every
 * other contract in this file — set via env, never hardcoded/guessed.
 *
 * chainId is explicit (not just inherited from BSC_TESTNET_RPC_URL) so any
 * future frontend/backend code reading this config has an unambiguous,
 * self-contained answer to "what chain is this faucet on" without having
 * to cross-reference chainClient.ts.
 */
export const TESTNET_FAUCET_CONFIG = {
  chainId: 97,
  address: (process.env.TESTNET_FAUCET_ADDRESS as `0x${string}` | undefined) ?? null,
} as const;

export const TESTNET_FAUCET_ADDRESS = TESTNET_FAUCET_CONFIG.address;
export const TESTNET_FAUCET_CONFIGURED = Boolean(TESTNET_FAUCET_CONFIG.address);

/**
 * TEMPORARY dev/test-only switch — lets a signed-in user trigger a tiny,
 * fixed-amount ELSTestnetRewardDistributor.distribute() call directly from
 * the web UI, bypassing the real "Buy ELS (Testnet)" quest's swap-tx
 * verification entirely (see app/api/rewards/test-distribute/route.ts).
 * This exists ONLY because ELSTestnetSwap isn't deployed yet, so there's
 * currently no real user action that can exercise the distributor —
 * without this, the only way to test it is manually in Remix.
 *
 * Explicit opt-in, defaults OFF. Do NOT leave this on in a real production
 * deploy once ELSTestnetSwap exists — at that point the real quest flow is
 * the only path that should ever call distribute(), and this becomes an
 * unverified reward-printing button. Unset ENABLE_TEST_DISTRIBUTE (or set
 * it to anything other than "true") to fully remove it from the UI/API.
 */
export const TEST_DISTRIBUTE_ENABLED = process.env.ENABLE_TEST_DISTRIBUTE === "true";
export const TEST_DISTRIBUTE_AMOUNT_ELS = 1;

/** How many times VERIFYING may be attempted before a SYSTEM_ERROR row stops offering "RETRY VERIFICATION" automatically in the UI (the backend itself never hard-caps retries — Section 8: "do not permanently reject a transaction merely because one attempt failed" — this is a UI nudge only, not enforced server-side). */
export const MAX_SUGGESTED_VERIFY_RETRIES = 10;
