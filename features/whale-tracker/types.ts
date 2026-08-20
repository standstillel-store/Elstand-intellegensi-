// Whale Tracker — shared types. Deliberately separate from lib/types.ts's
// `WhaleTransfer` (the legacy /whale + lib/alchemy.ts shape) — that one is
// an in-memory, Ethereum-only, symbol-keyed shape with no persistence. This
// one mirrors the whale_transfers table 1:1 and is chain-agnostic.

export type WhaleChain = "bsc";

export interface WhaleTransferRow {
  id: number;
  chain: WhaleChain;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: string; // ISO
  fromAddress: string;
  toAddress: string;
  isNative: boolean;
  tokenAddress: string | null; // null only in-memory before persistence; DB stores 'native' sentinel via NATIVE_TOKEN_ADDRESS
  tokenSymbol: string | null;
  tokenName: string | null;
  tokenDecimals: number | null;
  amount: number;
  priceUsd: number | null; // null = "Price unavailable" — never fabricated
  valueUsd: number | null;
  createdAt: string;
}

export interface TransferFilters {
  minUsd?: number;
  tokenSymbol?: string;
  fromAddress?: string;
  toAddress?: string;
  /** Matches either from OR to. */
  address?: string;
  sinceIso?: string;
  untilIso?: string;
}

export interface PaginatedTransfers {
  rows: WhaleTransferRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface WhaleSummary {
  totalTransfers: number;
  volume24hUsd: number;
  largestTransferUsd: number;
  activeWallets24h: number;
  tokensTracked: number;
  asOf: string;
}

export interface TokenMetadataRow {
  chain: WhaleChain;
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  priceUsd: number | null;
  priceUpdatedAt: string | null;
  logoUrl: string | null;
}

export interface WalletHolding {
  tokenAddress: string;
  tokenSymbol: string | null;
  balance: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface WalletCounterparty {
  address: string;
  volumeUsd: number;
  txCount: number;
}

export interface WalletDetail {
  address: string;
  chain: WhaleChain;
  label: string | null;
  category: string | null;
  equityUsd: number | null;
  inflowUsd: number;
  outflowUsd: number;
  netFlowUsd: number;
  holdings: WalletHolding[];
  topCounterparties: WalletCounterparty[];
  recentTransfers: WhaleTransferRow[];
}
