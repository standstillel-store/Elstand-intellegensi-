import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet, arbitrum, optimism, base, polygon, bsc, bscTestnet, type AppKitNetwork } from "@reown/appkit/networks";

// ---------------------------------------------------------------------------
// Wallet Connect (Phase 3, section 3) — MetaMask, Rabby, OKX Wallet, and
// Coinbase Wallet all inject an EIP-1193 provider and are auto-detected by
// AppKit via EIP-6963 (no per-wallet SDK needed); WalletConnect covers
// everything else (mobile wallets via QR). One integration, five wallets.
//
// This file must NOT have "use client" — createAppKit() (in
// components/providers/Web3Provider.tsx) needs to call new WagmiAdapter()
// from both a Server Component (app/layout.tsx, for cookieToInitialState)
// and the client, so the adapter/config itself has to be isomorphic.
//
// Get a free projectId at https://cloud.reown.com (Reown was formerly
// WalletConnect / Web3Modal — same company, same dashboard). Without it,
// Web3Provider skips initializing AppKit entirely and the Wallet section in
// Settings shows "not configured" instead of throwing — same
// "everything degrades gracefully" rule as the rest of this app's
// integrations (see lib/supabase.ts, lib/alchemy.ts).
// ---------------------------------------------------------------------------

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

export const isWalletConnectConfigured = Boolean(projectId);

// EVM networks this dashboard cares about — extend freely, AppKit re-exports
// every Viem-supported chain from '@reown/appkit/networks'. bscTestnet added
// for the /wallet dashboard (Phase: Wallet) — that page is testnet-only by
// spec, see NETWORK_CONFIG below.
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  mainnet,
  arbitrum,
  optimism,
  base,
  polygon,
  bsc,
  bscTestnet,
];

// Human-readable labels for the chain IDs above — kept next to `networks`
// itself so the two can't drift apart. Consumed by components/settings/
// sections/WalletSection.tsx and app/login/page.tsx; add an entry here
// whenever a chain is added to `networks`.
export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  42161: "Arbitrum",
  10: "Optimism",
  8453: "Base",
  137: "Polygon",
  56: "BNB Chain",
  97: "BNB Smart Chain Testnet",
};

// ---------------------------------------------------------------------------
// Wallet dashboard (/wallet) — Phase: Wallet, BSC Testnet only, ELS-only
// payment interface (no swap/DEX — see components/wallet/WalletView.tsx).
//
// Single centralized config so no component ever hardcodes a chain ID, RPC
// URL, explorer URL, or contract address. ELS_CONTRACT is the real deployed
// testnet token. SWAP_CONTRACT / purchase contracts stay null until they
// exist — every /wallet component MUST branch on null and show
// "Contract not configured" / "Coming Soon" instead of fabricating a
// balance, price, or transaction.
// ---------------------------------------------------------------------------
export const WALLET_NETWORK_CONFIG = {
  chainId: 97,
  chainName: "BNB Smart Chain Testnet",
  chainShortLabel: "BNB TESTNET",
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
  explorerUrl: "https://testnet.bscscan.com",
  nativeSymbol: "tBNB",
  /** ELS testnet token (BEP-20). Real deployed contract. */
  ELS_CONTRACT: "0x4AeA3938eb5c5A594410Bf67c2F2107970901a4D" as `0x${string}`,
  ELS_NAME: "ELSTAND",
  ELS_SYMBOL: "ELS",
  /**
   * Phase 6.6.3.3 — ELSTestnetSell.sol. Standalone contract, separate from
   * ELSTestnetSwap.sol (buy) and ELSTestnetRewardDistributor.sol (claim).
   * Not secret — same reasoning as ELS_CONTRACT/SWAP above, safe to ship to
   * the client since /earn/dex calls quote()/sell() directly from the
   * user's own wallet (no server-signed tx involved).
   */
  SELL_CONTRACT: "0x97A8EE8157C1fe62124c5fBD475b1282cB248D34" as `0x${string}`,
  /**
   * Phase 6.6.4 — ELSTestnetPayment.sol. Deployed on BSC Testnet (chain 97),
   * tx 0x92ef00363b40601234e9f8f314ff494f1be04986a0bb4981699d59d85925ec7a.
   * Single processor for BOTH Elvoid Pro membership and AI Energy purchases
   * (see the contract's `purchase(paymentId, productId, amount)` and its
   * three seeded productIds: ELVOID_PRO_WEEK, ELVOID_PRO_MONTH,
   * AI_ENERGY_10). Owner/treasury: 0x1a4F964D13dFe8050d3eB5CE560c190E005FF49A.
   * Same contract address for both constants below — there is only one
   * payment contract, not two.
   */
  PREMIUM_PURCHASE_CONTRACT: "0x576bba3714983B59d5440C8f6Bb7Dd048cf9628b" as `0x${string}` | null,
  /** Same ELSTestnetPayment.sol deployment as PREMIUM_PURCHASE_CONTRACT above — see that comment. */
  AI_ENERGY_PURCHASE_CONTRACT: "0x576bba3714983B59d5440C8f6Bb7Dd048cf9628b" as `0x${string}` | null,
} as const;

// ---------------------------------------------------------------------------
// Phase 6.6, Section 8/9 — the wallet dashboard must display BOTH BSC
// Mainnet and BSC Testnet ELS/BNB balances, clearly separated, never
// summed/mixed. This is the same real mainnet ELS token already used by
// lib/rewards/config.ts's Add Liquidity / Buy ELS quests
// (0x3a0664...C82) — kept here too so /wallet doesn't need its own copy.
// `bsc` (chain 56) is already in `networks` above, so no separate RPC
// client is needed — wagmi/AppKit's existing transport covers it.
// ---------------------------------------------------------------------------
export const WALLET_MAINNET_CONFIG = {
  chainId: 56,
  chainName: "BNB Smart Chain",
  chainShortLabel: "BNB MAINNET",
  explorerUrl: "https://bscscan.com",
  nativeSymbol: "BNB",
  ELS_CONTRACT: "0x3a0664300EA06Ba7c01EDC9951c1b04BE9101C82" as `0x${string}`,
  ELS_NAME: "ELSTAND",
  ELS_SYMBOL: "ELS",
} as const;

export const wagmiAdapter = new WagmiAdapter({
  // `as any`: wagmi & @reown/appkit-adapter-wagmi punya definisi tipe
  // Storage yang sedikit beda meski secara runtime kompatibel — ini cuma
  // bypass type-check, bukan bug fungsional.
  storage: createStorage({ storage: cookieStorage }) as any,
  ssr: true,
  projectId: projectId || "unconfigured",
  networks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
