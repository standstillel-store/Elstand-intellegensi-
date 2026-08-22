import type { BinanceMarket, BinanceMode } from "./types";

// ---------------------------------------------------------------------------
// Single source of truth for which Binance environment ElVoid AI's Trading
// Engine talks to. Controlled entirely by env vars — there is no in-app
// toggle that can silently flip a session from Testnet to Live, on purpose:
// switching to real funds should require a redeploy/restart, not a click.
//
//   BINANCE_MODE       "testnet" (default) | "live"
//   BINANCE_MARKET     "futures" (default) | "spot"
//   BINANCE_API_KEY    API key for the selected mode
//   BINANCE_SECRET_KEY API secret for the selected mode
//   BINANCE_BASE_URL   optional override — if unset, the correct official
//                       Testnet/Live REST base for BINANCE_MARKET is used.
//
// Binance issues *separate* keys per environment (a Testnet key only works
// against Testnet hosts, and vice versa) — there is no cross-environment
// leakage risk from a misconfigured key, only a connection failure, which
// /api/binance/status surfaces clearly.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URLS: Record<BinanceMarket, Record<BinanceMode, string>> = {
  futures: {
    testnet: "https://testnet.binancefuture.com",
    live: "https://fapi.binance.com",
  },
  spot: {
    testnet: "https://testnet.binance.vision",
    live: "https://api.binance.com",
  },
};

const DEFAULT_WS_BASE_URLS: Record<BinanceMarket, Record<BinanceMode, string>> = {
  futures: {
    testnet: "wss://stream.binancefuture.com/ws",
    live: "wss://fstream.binance.com/ws",
  },
  spot: {
    testnet: "wss://testnet.binance.vision/ws",
    live: "wss://stream.binance.com:9443/ws",
  },
};

export interface BinanceConfig {
  mode: BinanceMode;
  market: BinanceMarket;
  baseUrl: string;
  wsBaseUrl: string;
  apiKey: string;
  secretKey: string;
  recvWindow: number;
  isLive: boolean;
  configured: boolean;
}

function readMode(): BinanceMode {
  const raw = (process.env.BINANCE_MODE ?? "testnet").trim().toLowerCase();
  return raw === "live" ? "live" : "testnet";
}

function readMarket(): BinanceMarket {
  const raw = (process.env.BINANCE_MARKET ?? "futures").trim().toLowerCase();
  return raw === "spot" ? "spot" : "futures";
}

/**
 * Resolves the active Binance environment from env vars. Pure + cheap
 * (no network, no caching needed) — safe to call per-request. Optionally
 * pass explicit credentials to override env vars (used by the encrypted
 * DB-stored credentials path — see lib/binance/credentials.ts).
 */
export function getBinanceConfig(overrides?: { apiKey?: string; secretKey?: string }): BinanceConfig {
  const mode = readMode();
  const market = readMarket();
  const baseUrl = (process.env.BINANCE_BASE_URL || DEFAULT_BASE_URLS[market][mode]).replace(/\/$/, "");
  const wsBaseUrl = DEFAULT_WS_BASE_URLS[market][mode];
  const apiKey = overrides?.apiKey ?? process.env.BINANCE_API_KEY ?? "";
  const secretKey = overrides?.secretKey ?? process.env.BINANCE_SECRET_KEY ?? "";
  const recvWindow = Math.min(60_000, Math.max(2_000, Number(process.env.BINANCE_RECV_WINDOW ?? 5000) || 5000));

  return {
    mode,
    market,
    baseUrl,
    wsBaseUrl,
    apiKey,
    secretKey,
    recvWindow,
    isLive: mode === "live",
    configured: Boolean(apiKey && secretKey),
  };
}

/** True only when BINANCE_MODE=live is explicit — used to gate extra UI confirmations for real-money actions. */
export function isLiveMode(): boolean {
  return readMode() === "live";
}
