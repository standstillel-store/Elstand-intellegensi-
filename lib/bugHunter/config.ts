import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

// ---------------------------------------------------------------------------
// Phase 6.6.1 — Bug Hunter config.
//
// Mirrors lib/rewards/config.ts conventions: everything reads from env at
// call time (not module-load time, so tests/build don't require the vars),
// and every consumer must branch on *_CONFIGURED before assuming the
// contract exists. Never hardcode the deployed address here — it's a
// testnet address today and will change on redeploy/mainnet.
// ---------------------------------------------------------------------------

export function getBugBountyEscrowAddress(): `0x${string}` | null {
  const addr = process.env.BUG_BOUNTY_ESCROW_ADDRESS;
  if (!addr || !addr.startsWith("0x")) return null;
  return addr as `0x${string}`;
}

export const BUG_BOUNTY_ESCROW_CONFIGURED = Boolean(process.env.BUG_BOUNTY_ESCROW_ADDRESS);

export const BUG_HUNTER_CHAIN_ID = WALLET_NETWORK_CONFIG.chainId; // 97 (BSC Testnet)
export const ELS_TESTNET_ADDRESS = WALLET_NETWORK_CONFIG.ELS_CONTRACT;

export const BUG_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

export const BUG_CATEGORIES = [
  "Smart Contract",
  "Frontend / UI",
  "API / Backend",
  "Wallet / Web3 Integration",
  "Authentication",
  "Data / Privacy",
  "Other",
] as const;

/** Only the functions/errors this integration actually calls — matches contracts/BugBountyEscrow.sol exactly. Keep in sync manually if the contract changes. */
export const BUG_BOUNTY_ESCROW_ABI = [
  {
    type: "function",
    name: "createBounty",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_bountyId", type: "bytes32" },
      { name: "_researcher", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_expiryTime", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fundBounty",
    stateMutability: "nonpayable",
    inputs: [{ name: "_bountyId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "approveBounty",
    stateMutability: "nonpayable",
    inputs: [{ name: "_bountyId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimBounty",
    stateMutability: "nonpayable",
    inputs: [{ name: "_bountyId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getBounty",
    stateMutability: "view",
    inputs: [{ name: "_bountyId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "state", type: "uint8" },
          { name: "researcher", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "expiryTime", type: "uint256" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
] as const;

/** ELS token — only the two functions this integration needs (approve/allowance check happens off-chain via the operational wallet's own prior approve, done once manually — see deployment steps). */
export const ELS_ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export enum BountyState {
  NONE = 0,
  CREATED = 1,
  FUNDED = 2,
  APPROVED = 3,
  CLAIMED = 4,
  REJECTED = 5,
  CANCELLED = 6,
  EXPIRED = 7,
}
