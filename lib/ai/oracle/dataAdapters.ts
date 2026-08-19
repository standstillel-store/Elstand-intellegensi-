// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — data adapters (Phase 1)
//
// Pulls real data from the ALREADY-EXISTING pipelines and wraps it into one
// OracleContext. This file only READS from lib/binance, lib/elvoid/*, and
// lib/intelligence/* — it never modifies them (spec §19 Footprint Safety
// applies to the whole confluence-source set, not just Footprint).
//
// Every source is tagged "real", "proxy", or "unavailable" in
// dataQuality so Phase 2/3 (confluence + grading) and Phase 4 (insight
// text) can honestly say what backs a conclusion instead of presenting a
// proxy as if it were real historical resting liquidity (spec §14).
// ---------------------------------------------------------------------------

import { getKlines, getRecentTrades, getOrderBookDepth, getFundingSnapshot } from "@/lib/binance";
import { buildFootprintByCandle } from "@/lib/elvoid/footprint";
import { buildTpoSessions, defaultBlockSizeForChartInterval, TPO_BLOCK_SIZES_MS } from "@/lib/elvoid/tpo";
import { buildLiquidityVolumeMap } from "@/lib/elvoid/liquidityVolumeMap";
import { getBtcMicrostructure } from "@/lib/intelligence/btcMicrostructure";
import type { OracleContext, OracleDataSourceStatus } from "./types";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/**
 * Assembles one OracleContext for `symbol` from real market data only.
 * Any source that fails to fetch is marked "unavailable" (never silently
 * swapped for a fabricated placeholder) — Phase 3 grading must treat an
 * "unavailable" source as reduced evidence, not as neutral-bullish filler.
 */
/**
 * Short-lived in-process cache so the ELVOID Pro Oracle panel and the AI
 * Insights & Patterns panel (which both need the same underlying market
 * data for the same symbol, mounted on the same page) don't each trigger
 * their own independent Binance fetch — spec §16 explicitly forbids
 * duplicate Binance/footprint/orderbook requests. Deliberately short (5s):
 * long enough to absorb the ~simultaneous mount of both panels, short
 * enough that neither panel is ever looking at meaningfully stale data.
 * Best-effort only — serverless/edge cold starts reset it, which is fine,
 * it degrades to "fetch again" rather than ever serving wrong data.
 */
const CONTEXT_CACHE_TTL_MS = 5_000;
const contextCache = new Map<string, { expires: number; promise: Promise<OracleContext> }>();

export async function assembleOracleContext(symbol: string, interval = "15m"): Promise<OracleContext> {
  const cacheKey = `${symbol.toUpperCase()}:${interval}`;
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.promise;

  const promise = assembleOracleContextUncached(symbol, interval);
  contextCache.set(cacheKey, { expires: Date.now() + CONTEXT_CACHE_TTL_MS, promise });
  // Don't let a rejected promise poison the cache for the full TTL.
  promise.catch(() => contextCache.delete(cacheKey));
  return promise;
}

async function assembleOracleContextUncached(symbol: string, interval: string): Promise<OracleContext> {
  const dataQuality: OracleDataSourceStatus[] = [];
  const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS["15m"];

  const [candlesResult, tradesResult, depthResult] = await Promise.allSettled([
    getKlines(symbol, interval, 200),
    getRecentTrades(symbol, 1000),
    getOrderBookDepth(symbol, 50),
  ]);

  const candles = candlesResult.status === "fulfilled" ? candlesResult.value : [];
  dataQuality.push({
    source: "structure",
    quality: candles.length >= 30 ? "real" : "unavailable",
    detail: candles.length >= 30 ? `${candles.length} candle real dari Binance (${interval})` : "Candle history tidak cukup untuk analisis struktur.",
  });

  const currentPrice = candles.length ? candles[candles.length - 1].close : 0;

  // Microstructure needs BTC funding + spot price as inputs — fetched here
  // (not in the Promise.allSettled batch above) since it depends on
  // currentPrice being resolved first for non-BTC symbols.
  let microstructure: Awaited<ReturnType<typeof getBtcMicrostructure>> | null = null;
  try {
    const funding = await getFundingSnapshot();
    const btcFunding = funding.find((f) => f.symbol === "BTCUSDT");
    const btcPrice = symbol.toUpperCase() === "BTC" ? currentPrice : btcFunding?.markPrice;
    microstructure = await getBtcMicrostructure(btcFunding, btcPrice);
  } catch {
    microstructure = null;
  }

  // --- Footprint: real when we have both candles and recent trades to bucket into them ---
  let footprint: ReturnType<typeof buildFootprintByCandle> | null = null;
  if (tradesResult.status === "fulfilled" && candles.length > 0) {
    footprint = buildFootprintByCandle(candles, tradesResult.value, intervalMs);
    dataQuality.push({
      source: "footprint",
      quality: footprint.size > 0 ? "real" : "unavailable",
      detail: footprint.size > 0 ? `Footprint real dari ${tradesResult.value.length} recent trades` : "Trade sample tidak cukup untuk footprint per-candle.",
    });
  } else {
    dataQuality.push({ source: "footprint", quality: "unavailable", detail: "Recent trades gagal diambil." });
  }

  // --- TPO: real, built off the same real candles ---
  let tpo: ReturnType<typeof buildTpoSessions> | null = null;
  if (candles.length > 0) {
    const blockKey = defaultBlockSizeForChartInterval(interval);
    const blockMs = TPO_BLOCK_SIZES_MS[blockKey] ?? TPO_BLOCK_SIZES_MS["30m"];
    tpo = buildTpoSessions(candles, { blockMs });
    dataQuality.push({ source: "tpo", quality: "real", detail: `TPO sessions dibangun dari ${candles.length} candle real.` });
  } else {
    dataQuality.push({ source: "tpo", quality: "unavailable", detail: "Tidak ada candle untuk membangun TPO." });
  }

  // --- Liquidity volume map: real (built from traded volume, not resting book history) — proxy for RESTING liquidity specifically ---
  let liquidity: ReturnType<typeof buildLiquidityVolumeMap> | null = null;
  if (candles.length > 0) {
    liquidity = buildLiquidityVolumeMap(candles);
    dataQuality.push({
      source: "liquidity",
      quality: "proxy",
      detail: "Liquidity volume map dari traded volume per price bin — proxy untuk resting liquidity, bukan order-book history asli.",
    });
  } else {
    dataQuality.push({ source: "liquidity", quality: "unavailable", detail: "Tidak ada candle untuk membangun liquidity map." });
  }

  // --- Order book: real, live snapshot from Binance depth endpoint ---
  const orderBook = depthResult.status === "fulfilled" ? { bids: depthResult.value.bids, asks: depthResult.value.asks } : null;
  dataQuality.push({
    source: "orderbook",
    quality: orderBook ? "real" : "unavailable",
    detail: orderBook ? "Live order book depth dari Binance (top 50 level)." : "Order book depth gagal diambil.",
  });

  // --- Microstructure: real when the intelligence module resolves ---
  dataQuality.push({
    source: "microstructure",
    quality: microstructure ? "real" : "unavailable",
    detail: microstructure ? "BTC microstructure snapshot berhasil diambil." : "Microstructure snapshot gagal diambil.",
  });

  // --- SMC/ICT and Macro are computed inside Phase 2 (confluence) from
  // these same candles/orderbook via lib/elvoid/scanners.ts's existing
  // scanFairValueGap / scanOrderBlock / scanLiquiditySweep / scanMacro —
  // no separate fetch needed, so they're not adapted here.
  dataQuality.push({ source: "smc_ict", quality: candles.length > 0 ? "real" : "unavailable", detail: "Dihitung di Phase 2 dari candle real via scanners.ts yang sudah ada." });
  dataQuality.push({ source: "macro", quality: "proxy", detail: "Dihitung di Phase 2 dari scanMacro() (DXY change) — belum full macro calendar integration." });

  return {
    symbol: symbol.toUpperCase(),
    currentPrice,
    candles,
    tpo,
    footprint,
    liquidity,
    orderBook,
    microstructure,
    macro: null,
    dataQuality,
  };
}
