import { REWARD_DISTRIBUTOR_ADDRESS, REWARD_DISTRIBUTOR_CONFIGURED } from "./config";

// ---------------------------------------------------------------------------
// Brief Section 8 — Reward Distributor integration point.
//
// The distributor contract is deployed SEPARATELY (explicitly out of scope
// for this task) and this repo has no funded signer/private key anywhere.
// Per Section 8: "Until the distributor address is provided, the
// application must NOT attempt a real on-chain reward transfer ... Use a
// clear configuration state such as REWARD_DISTRIBUTOR_NOT_CONFIGURED
// rather than silently pretending the reward was sent."
//
// This function is the single seam where that real transfer will
// eventually be wired in. It deliberately does NOT attempt one yet, even
// once EARN_REWARD_DISTRIBUTOR_ADDRESS is set — see BLOCKERS in the final
// report for what's still needed:
//   1. A funded signer for the distributor's ELS Testnet balance, and an
//      explicit decision on how its private key is stored (env var on the
//      server is the minimum bar; a KMS/secrets manager is safer for
//      anything longer-lived). This repo intentionally does not invent
//      that decision.
//   2. The distributor contract's actual ABI, once deployed — this file
//      cannot guess a function signature for a contract that doesn't exist
//      yet.
//
// lib/rewards/store.ts's claimReward() calls this after crediting the
// internal ai_energy_ledger row and does not change CLAIMED/CLAIM_ERROR
// behavior based on its result today — every call currently returns
// `not_configured` or `not_implemented`, so behavior is unchanged from
// before this file existed. Once both blockers above are resolved, this
// function is the only place that needs a real implementation; nothing
// else in the claim flow should need to change.
// ---------------------------------------------------------------------------

export type DistributorTransferResult =
  | { ok: true; txHash: `0x${string}` }
  | { ok: false; reason: "not_configured" | "not_implemented" };

export async function attemptDistributorTransfer(_params: {
  walletAddress: string;
  amountElsTestnet: number;
}): Promise<DistributorTransferResult> {
  if (!REWARD_DISTRIBUTOR_CONFIGURED || !REWARD_DISTRIBUTOR_ADDRESS) {
    return { ok: false, reason: "not_configured" };
  }
  // An address IS configured, but no signer/ABI is wired up here yet (see
  // file header). Refusing rather than guessing, same as every other
  // "configured address, nothing else built yet" case in this codebase.
  return { ok: false, reason: "not_implemented" };
}

/** Brief Section 14's exact required copy for when distributor delivery isn't live yet. */
export const REWARD_DISTRIBUTION_STATUS_MESSAGE = "Testnet reward distribution is currently being configured.";
