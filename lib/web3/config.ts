import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet, arbitrum, optimism, base, polygon, bsc, type AppKitNetwork } from "@reown/appkit/networks";

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
// every Viem-supported chain from '@reown/appkit/networks'.
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, arbitrum, optimism, base, polygon, bsc];

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
};

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
