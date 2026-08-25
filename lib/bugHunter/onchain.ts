import { createWalletClient, createPublicClient, http, isAddress, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { BUG_BOUNTY_ESCROW_ABI, BUG_BOUNTY_ESCROW_CONFIGURED, getBugBountyEscrowAddress, BountyState } from "@/lib/bugHunter/config";

// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 7/11 — BugBountyEscrow integration point.
//
// CRITICAL BOUNDARY (per final decision): the operational signer here is
// ONLY ever used for createBounty / fundBounty / approveBounty — all
// owner-only functions. It is NEVER used to call claimBounty(). The
// contract's own `msg.sender == bounty.researcher` check inside
// claimBounty makes this a hard on-chain guarantee, not just a convention:
// even if this file had a bug that tried to call claimBounty with the
// operational key, the contract itself would revert UnauthorizedCaller
// unless the operational wallet happened to literally be the researcher.
// claimBounty is called exclusively from the browser via the researcher's
// own connected wallet — see components/earn/BugClaimView.tsx.
//
// Same operator/deployer key separation rule as
// lib/rewards/distributor.ts: BUG_BOUNTY_ESCROW_OPERATOR_PRIVATE_KEY
// should be a dedicated operational wallet, not the address that deployed
// the contract, and it needs its own ELS `approve()` to the escrow address
// done once manually (see deployment steps in the final report).
// ---------------------------------------------------------------------------

export type OnchainResult = { ok: true; txHash: Hash } | { ok: false; reason: string; detail?: string };

function getPublicClient() {
  return createPublicClient({
    chain: bscTestnet,
    transport: http(process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545"),
  });
}

function getOperationalWalletClient() {
  const privateKey = process.env.BUG_BOUNTY_ESCROW_OPERATOR_PRIVATE_KEY;
  if (!privateKey) return null;
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain: bscTestnet,
    transport: http(process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545"),
  });
}

export interface OnchainBounty {
  state: BountyState;
  researcher: `0x${string}`;
  amount: bigint;
  expiryTime: bigint;
  claimed: boolean;
}

/** Read-only — safe to call from anywhere, no signer needed. Returns null if the bounty ID has never been created (state NONE) or the contract isn't configured. */
export async function readBounty(bountyId: `0x${string}`): Promise<OnchainBounty | null> {
  const address = getBugBountyEscrowAddress();
  if (!address) return null;
  const client = getPublicClient();
  try {
    const result = (await client.readContract({
      address,
      abi: BUG_BOUNTY_ESCROW_ABI,
      functionName: "getBounty",
      args: [bountyId],
    })) as OnchainBounty;
    return result;
  } catch {
    // getBounty reverts BountyNotFound for state NONE — that's a valid
    // "doesn't exist yet" answer here, not an error to propagate.
    return null;
  }
}

/**
 * Ensures a bounty exists on-chain in FUNDED+APPROVED state for the given
 * report, calling createBounty -> fundBounty -> approveBounty as needed
 * (idempotent: skips any step whose on-chain state already satisfies it,
 * so retrying after a partial failure doesn't re-do completed steps or
 * double-fund). Called only from the admin approve route and the claim
 * "prepare" route — never from anything reachable pre-approval.
 */
export async function ensureBountyPrepared(params: {
  bountyId: `0x${string}`;
  researcherWallet: `0x${string}`;
  amountWei: bigint;
  expiryTimeSeconds: bigint;
}): Promise<OnchainResult> {
  if (!BUG_BOUNTY_ESCROW_CONFIGURED) return { ok: false, reason: "not_configured" };
  if (!isAddress(params.researcherWallet)) return { ok: false, reason: "invalid_wallet" };

  const address = getBugBountyEscrowAddress();
  if (!address) return { ok: false, reason: "not_configured" };

  const walletClient = getOperationalWalletClient();
  if (!walletClient) return { ok: false, reason: "signer_not_configured" };

  const publicClient = getPublicClient();

  try {
    let current = await readBounty(params.bountyId);

    if (!current || current.state === BountyState.NONE) {
      const hash = await walletClient.writeContract({
        address,
        abi: BUG_BOUNTY_ESCROW_ABI,
        functionName: "createBounty",
        args: [params.bountyId, params.researcherWallet, params.amountWei, params.expiryTimeSeconds],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") return { ok: false, reason: "create_failed", detail: hash };
      current = await readBounty(params.bountyId);
    }

    if (!current) return { ok: false, reason: "state_unreadable_after_create" };

    if (current.state === BountyState.CREATED) {
      const hash = await walletClient.writeContract({
        address,
        abi: BUG_BOUNTY_ESCROW_ABI,
        functionName: "fundBounty",
        args: [params.bountyId],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") return { ok: false, reason: "fund_failed", detail: hash };
      current = await readBounty(params.bountyId);
    }

    if (!current) return { ok: false, reason: "state_unreadable_after_fund" };

    let lastTxHash: Hash | null = null;

    if (current.state === BountyState.FUNDED) {
      const hash = await walletClient.writeContract({
        address,
        abi: BUG_BOUNTY_ESCROW_ABI,
        functionName: "approveBounty",
        args: [params.bountyId],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") return { ok: false, reason: "approve_failed", detail: hash };
      lastTxHash = hash;
      current = await readBounty(params.bountyId);
    }

    if (!current || current.state !== BountyState.APPROVED) {
      return { ok: false, reason: "unexpected_final_state", detail: String(current?.state) };
    }

    return { ok: true, txHash: lastTxHash ?? ("0x0" as Hash) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "onchain_error", detail };
  }
}

/** Verifies a claimBounty transaction the researcher submitted from their own wallet: confirms it landed, targeted the right contract/bounty, and left the bounty CLAIMED. Never trusts the client's say-so alone. */
export async function verifyClaimTransaction(params: { txHash: `0x${string}`; bountyId: `0x${string}`; expectedResearcher: `0x${string}` }): Promise<OnchainResult> {
  const address = getBugBountyEscrowAddress();
  if (!address) return { ok: false, reason: "not_configured" };

  const publicClient = getPublicClient();
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: params.txHash, timeout: 60_000 });
    if (receipt.status !== "success") return { ok: false, reason: "tx_reverted" };
    if (receipt.to?.toLowerCase() !== address.toLowerCase()) return { ok: false, reason: "wrong_contract" };
    if (receipt.from.toLowerCase() !== params.expectedResearcher.toLowerCase()) return { ok: false, reason: "wrong_sender" };

    const bounty = await readBounty(params.bountyId);
    if (!bounty || bounty.state !== BountyState.CLAIMED || !bounty.claimed) {
      return { ok: false, reason: "state_not_claimed" };
    }

    return { ok: true, txHash: params.txHash };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "verify_error", detail };
  }
}
