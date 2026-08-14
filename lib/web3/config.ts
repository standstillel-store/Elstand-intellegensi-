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
  nativeSymbol: "BNB",
  /** ELS testnet token (BEP-20). Real deployed contract. */
  ELS_CONTRACT: "0x4AeA3938eb5c5A594410Bf67c2F2107970901a4D" as `0x${string}`,
  ELS_NAME: "ELSTAND",
  ELS_SYMBOL: "ELS",
  /** Premium (Elvoid Pro) purchase contract. Null until deployed — purchase stays disabled/"Coming Soon". */
  PREMIUM_PURCHASE_CONTRACT: null as `0x${string}` | null,
  /** AI Energy purchase contract. Null until deployed — purchase stays disabled/"Coming Soon". */
  AI_ENERGY_PURCHASE_CONTRACT: null as `0x${string}` | null,
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
