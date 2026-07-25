import { getBinanceConfig, type BinanceConfig } from "./config";
import * as futures from "./futuresClient";
import * as spot from "./spotClient";
import type { Kline, OrderBookSnapshot, SymbolFilters, TickerPrice } from "./types";

// ---------------------------------------------------------------------------
// Unified market-data surface: every reader (dashboard widgets, risk calc,
// the signal engine bridge) calls these instead of branching on
// cfg.market itself. Explicit `market` override lets a caller ask for the
// "other" market's data even while the other is active (e.g. Settings
// showing both connectivity checks side by side).
// ---------------------------------------------------------------------------

export async function getServerTime(cfg: BinanceConfig = getBinanceConfig()): Promise<number> {
  return cfg.market === "spot" ? spot.getServerTime(cfg) : futures.getServerTime(cfg);
}

export async function ping(cfg: BinanceConfig = getBinanceConfig()): Promise<boolean> {
  return cfg.market === "spot" ? spot.pingSpot(cfg) : futures.pingFutures(cfg);
}

export async function getTickerPrice(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<TickerPrice> {
  return cfg.market === "spot" ? spot.getTickerPrice(symbol, cfg) : futures.getTickerPrice(symbol, cfg);
}

export async function getKlines(symbol: string, interval: string, limit = 200, cfg: BinanceConfig = getBinanceConfig()): Promise<Kline[]> {
  return cfg.market === "spot" ? spot.getKlines(symbol, interval, limit, cfg) : futures.getKlines(symbol, interval, limit, cfg);
}

export async function getOrderBook(symbol: string, limit = 50, cfg: BinanceConfig = getBinanceConfig()): Promise<OrderBookSnapshot> {
  return cfg.market === "spot" ? spot.getOrderBook(symbol, limit, cfg) : futures.getOrderBook(symbol, limit, cfg);
}

export async function getSymbolFilters(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<SymbolFilters> {
  return cfg.market === "spot" ? spot.getSymbolFilters(symbol, cfg) : futures.getSymbolFilters(symbol, cfg);
}

export { isValidInterval } from "./futuresClient";
