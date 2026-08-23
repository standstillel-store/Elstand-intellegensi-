import { createWalletClient, http, isAddress, keccak256, toHex, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { REWARD_DISTRIBUTOR_ADDRESS, REWARD_DISTRIBUTOR_CONFIGURED } from "./config";
import { getRewardChainClient } from "./chainClient";

// ---------------------------------------------------------------------------
// Brief Section 8 — Reward Distributor integration point.
//
// contracts/ELSTestnetRewardDistributor.sol is now the deployed contract
// EARN_REWARD_DISTRIBUTOR_ADDRESS is expected to point at (BSC Testnet,
// chain 97). This function calls its `distribute(user, amount, claimId)`
// as the OPERATIONAL signer — a private key held only in
// REWARD_DISTRIBUTOR_OPERATOR_PRIVATE_KEY, an env var on the server, never
// committed to source (per Section 7: "jangan hardcode private key",
// "signer deployment dan operational signer harus dipisahkan" — the
// deployer key that ran `new ELSTestnetRewardDistributor(...)` and set its
// `owner` should NOT be the same key configured here in steady state;
// transfer ownership to a dedicated operational key post-deploy, see the
// deployment checklist in the final report).
//
// claimId is derived deterministically from the backend's own
// reward_submissions.id (keccak256 of the UUID's bytes) — see
// lib/rewards/store.ts's claimReward(), which already guarantees exactly
// one CLAIMED row per (wallet, quest) via its atomic UPDATE ... WHERE
// status='VALID'. Reusing that id as claimId means the CONTRACT's replay
// guard and the DATABASE's replay guard are keyed off the same identity —
// a bug in either one doesn't silently let the other one alone decide
// whether a double-pay is possible.
// ---------------------------------------------------------------------------

export type DistributorTransferResult =
  | { ok: true; txHash: `0x${string}` }
  | { ok: false; reason: "not_configured" | "not_implemented" | "signer_not_configured" | "transfer_failed"; detail?: string };

const DISTRIBUTE_ABI = [
  {
    type: "function",
    name: "distribute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "claimId", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/** Derives the on-chain claimId from a reward_submissions row id — same id both the DB unique constraint and this contract call key off. */
export function claimIdFromSubmissionId(submissionId: string): `0x${string}` {
  return keccak256(toHex(submissionId));
}

export async function attemptDistributorTransfer(params: {
  walletAddress: string;
  amountElsTestnet: number;
  submissionId: string;
  elsDecimals?: number;
}): Promise<DistributorTransferResult> {
  if (!REWARD_DISTRIBUTOR_CONFIGURED || !REWARD_DISTRIBUTOR_ADDRESS) {
    return { ok: false, reason: "not_configured" };
  }
  if (!isAddress(params.walletAddress)) {
    return { ok: false, reason: "transfer_failed", detail: "Malformed wallet address." };
  }

  const privateKey = process.env.REWARD_DISTRIBUTOR_OPERATOR_PRIVATE_KEY;
  if (!privateKey) {
    // Address IS configured but no operational signer is set — refuse
    // rather than guess, same "null until confirmed" rule as every other
    // contract config in this codebase.
    return { ok: false, reason: "signer_not_configured" };
  }

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: bscTestnet,
      transport: http(process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545"),
    });

    const decimals = params.elsDecimals ?? 18;
    const amountRaw = BigInt(Math.round(params.amountElsTestnet * 10 ** decimals));
    const claimId = claimIdFromSubmissionId(params.submissionId);

    const txHash = await walletClient.writeContract({
      address: REWARD_DISTRIBUTOR_ADDRESS,
      abi: DISTRIBUTE_ABI,
      functionName: "distribute",
      args: [params.walletAddress as `0x${string}`, amountRaw, claimId],
    });

    // Wait for confirmation so the caller (store.ts's claimReward) can
    // record a txHash it KNOWS landed, not just one it submitted — a
    // submitted-but-dropped/reverted tx must not be recorded as if the
    // reward was actually delivered.
    const publicClient = getRewardChainClient(97);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return { ok: false, reason: "transfer_failed", detail: `Distributor tx reverted: ${txHash}` };
    }

    return { ok: true, txHash };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "transfer_failed", detail };
  }
}

/** Brief Section 14's exact required copy for when distributor delivery isn't live yet. */
export const REWARD_DISTRIBUTION_STATUS_MESSAGE = "Testnet reward distribution is currently being configured.";
