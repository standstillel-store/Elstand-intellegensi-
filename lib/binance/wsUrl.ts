import type { BinanceMarket, BinanceMode } from "./types";

// ---------------------------------------------------------------------------
// Client Components need the right kline WebSocket host for the account's
// active Testnet/Live + Spot/Futures combination, but lib/binance/config.ts
// reads server-only env vars — importing it here would mix server/client
// concerns for no benefit, since none of this needs to be secret. `mode`
// and `market` themselves come from the (non-secret) /api/binance/status
// response, and this pure mapping turns them into a WS base URL client-side.
// ---------------------------------------------------------------------------

const WS_BASE: Record<BinanceMarket, Record<BinanceMode, string>> = {
  futures: {
    testnet: "wss://stream.binancefuture.com/ws",
    live: "wss://fstream.binance.com/ws",
  },
  spot: {
    testnet: "wss://testnet.binance.vision/ws",
    live: "wss://stream.binance.com:9443/ws",
  },
};

export function buildKlineWsUrl(mode: BinanceMode, market: BinanceMarket, symbol: string, interval: string): string {
  const streamSymbol = symbol.toLowerCase();
  return `${WS_BASE[market][mode]}/${streamSymbol}@kline_${interval}`;
}
