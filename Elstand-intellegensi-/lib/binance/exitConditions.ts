import { ema, findSwingPoints, type SwingPoint } from "../elvoid/indicators";
import { scanMarketStructure, scanPriceAction, scanLiquiditySweep } from "../elvoid/scanners";
import type { Candle } from "../elvoid/types";
import type { Kline } from "./types";
import { buildNewsWindow, newsOpposesPosition, type NewsWindowState } from "./newsGate";

// ---------------------------------------------------------------------------
// Auto Exit: "Immediately close trade if Market Structure breaks / CHOCH
// appears / Order Flow reverses / EMA Alignment fails / Liquidity Sweep
// against position / High Impact News confirms opposite direction / Risk
// exceeds 1% / Emergency Exit triggered." Each structural check below is
// independent and any single one firing is enough (OR). The news-based exit
// is different by design — it only fires when News + Price Action + Market
// Structure + Order Flow all agree (AND), per the explicit "do NOT close on
// sentiment alone" instruction — see evaluateExitConditions' newsConfirmed leg.
// ---------------------------------------------------------------------------

export function klinesToCandles(klines: Kline[]): Candle[] {
  return klines.map((k) => ({ time: k.openTime, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume }));
}

export interface ExitCheckResult {
  key: string;
  label: string;
  triggered: boolean;
  detail: string;
}

export interface ExitEvaluation {
  shouldExit: boolean;
  checks: ExitCheckResult[];
  triggeredReasons: string[];
}

/** EMA20/50/200 alignment check — "fails" when price/EMA order no longer supports the position's direction. */
function checkEmaAlignment(candles: Candle[], side: "LONG" | "SHORT"): ExitCheckResult {
  const closes = candles.map((c) => c.close);
  if (closes.length < 60) return { key: "ema_alignment", label: "EMA Alignment", triggered: false, detail: "Data candle belum cukup." };
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const longPeriod = Math.min(200, Math.max(50, closes.length - 1));
  const eLong = ema(closes, longPeriod);
  const last = closes.length - 1;
  const price = closes[last];

  const bullishAligned = price > e20[last] && e20[last] > e50[last] && e50[last] >= eLong[last] * 0.999;
  const bearishAligned = price < e20[last] && e20[last] < e50[last] && e50[last] <= eLong[last] * 1.001;

  const failed = side === "LONG" ? !bullishAligned : !bearishAligned;
  return {
    key: "ema_alignment",
    label: "EMA Alignment",
    triggered: failed,
    detail: failed
      ? `Struktur EMA20/50/${longPeriod} tidak lagi mendukung posisi ${side}.`
      : `EMA20/50/${longPeriod} masih sejajar mendukung posisi ${side}.`,
  };
}

/**
 * CHOCH (Change of Character): in an uptrend, price closing below the most
 * recent confirmed swing low that formed the higher-low sequence; the
 * mirror for a downtrend. This is the earliest, most literal SMC signal
 * that the prevailing structure has broken — distinct from (and usually
 * precedes) a full trend reversal.
 */
function checkChoch(candles: Candle[], swings: SwingPoint[], side: "LONG" | "SHORT"): ExitCheckResult {
  const lastClose = candles[candles.length - 1]?.close;
  if (!lastClose || swings.length < 3) {
    return { key: "choch", label: "Change of Character (CHOCH)", triggered: false, detail: "Belum cukup swing point untuk deteksi CHOCH." };
  }
  if (side === "LONG") {
    const lows = swings.filter((s) => s.type === "low").slice(-2);
    if (lows.length < 2) return { key: "choch", label: "Change of Character (CHOCH)", triggered: false, detail: "Belum ada swing low pembanding." };
    const referenceLow = lows[lows.length - 1].price;
    const triggered = lastClose < referenceLow;
    return {
      key: "choch",
      label: "Change of Character (CHOCH)",
      triggered,
      detail: triggered
        ? `Harga close (${lastClose}) menembus swing low terakhir (${referenceLow}) — CHOCH bearish, struktur higher-low pecah.`
        : `Harga masih di atas swing low terakhir (${referenceLow}) — struktur bullish belum pecah.`,
    };
  }
  const highs = swings.filter((s) => s.type === "high").slice(-2);
  if (highs.length < 2) return { key: "choch", label: "Change of Character (CHOCH)", triggered: false, detail: "Belum ada swing high pembanding." };
  const referenceHigh = highs[highs.length - 1].price;
  const triggered = lastClose > referenceHigh;
  return {
    key: "choch",
    label: "Change of Character (CHOCH)",
    triggered,
    detail: triggered
      ? `Harga close (${lastClose}) menembus swing high terakhir (${referenceHigh}) — CHOCH bullish, struktur lower-high pecah.`
      : `Harga masih di bawah swing high terakhir (${referenceHigh}) — struktur bearish belum pecah.`,
  };
}

/**
 * Order Flow proxy from Binance's own kline taker-buy field (real exchange
 * data, not simulated): delta = takerBuyVolume - takerSellVolume per
 * candle. "Reverses" = the last few candles' net delta flips against the
 * position after having supported it — a lightweight footprint-chart read
 * without needing raw tick/aggTrade data.
 */
function checkOrderFlow(candles: Candle[], klines: Kline[], side: "LONG" | "SHORT"): ExitCheckResult {
  const n = klines.length;
  if (n < 10) return { key: "order_flow", label: "Order Flow", triggered: false, detail: "Data taker volume belum cukup." };
  const recent = klines.slice(-5);
  const deltas = recent.map((k) => {
    const buy = k.takerBuyBaseVolume;
    const sell = Math.max(0, k.volume - k.takerBuyBaseVolume);
    return buy - sell;
  });
  const netDelta = deltas.reduce((a, b) => a + b, 0);
  const reversedAgainst = side === "LONG" ? netDelta < 0 : netDelta > 0;
  const magnitudeOk = Math.abs(netDelta) > 0;
  const triggered = reversedAgainst && magnitudeOk;
  return {
    key: "order_flow",
    label: "Order Flow",
    triggered,
    detail: triggered
      ? `Net taker delta 5 candle terakhir ${netDelta > 0 ? "positif" : "negatif"} (${netDelta.toFixed(2)}) — melawan posisi ${side}.`
      : `Net taker delta 5 candle terakhir masih mendukung atau netral terhadap posisi ${side}.`,
  };
}

function checkMarketStructure(swings: SwingPoint[], side: "LONG" | "SHORT"): ExitCheckResult {
  const scan = scanMarketStructure(swings);
  const against = side === "LONG" ? scan.bias === "bearish" : scan.bias === "bullish";
  return { key: "market_structure", label: "Market Structure", triggered: against && scan.weight > 0, detail: scan.detail };
}

function checkLiquiditySweep(candles: Candle[], swings: SwingPoint[], lastAtr: number, side: "LONG" | "SHORT"): ExitCheckResult {
  const scan = scanLiquiditySweep(candles, swings, lastAtr);
  const against = side === "LONG" ? scan.bias === "bearish" : scan.bias === "bullish";
  return { key: "liquidity_sweep", label: "Liquidity Sweep", triggered: against && scan.weight > 0, detail: scan.detail };
}

function checkPriceAction(candles: Candle[], side: "LONG" | "SHORT"): ExitCheckResult {
  const scan = scanPriceAction(candles);
  const against = side === "LONG" ? scan.bias === "bearish" : scan.bias === "bullish";
  return { key: "price_action", label: "Price Action", triggered: against && scan.weight > 0, detail: scan.detail };
}

export interface RiskBreachInput {
  currentEquity: number;
  positionQty: number;
  entryPrice: number;
  protectiveStop: number | null;
}

function checkRiskBreach(input: RiskBreachInput): ExitCheckResult {
  if (!input.protectiveStop || input.currentEquity <= 0) {
    return { key: "risk_breach", label: "Risk > 1%", triggered: false, detail: "Stop protektif atau equity tidak tersedia untuk dihitung." };
  }
  const potentialLossUsd = Math.abs(input.entryPrice - input.protectiveStop) * Math.abs(input.positionQty);
  const potentialLossPct = (potentialLossUsd / input.currentEquity) * 100;
  const triggered = potentialLossPct > 1 + 0.05;
  return {
    key: "risk_breach",
    label: "Risk > 1%",
    triggered,
    detail: `Potensi loss jika stop tersentuh: ${potentialLossPct.toFixed(2)}% dari equity saat ini.`,
  };
}

/**
 * Runs every Auto Exit check for one open position. `newsWindow` is shared
 * across all symbols in a tick (see autoTrader.ts) rather than re-fetched
 * per symbol.
 */
export function evaluateExitConditions(params: {
  klines: Kline[];
  side: "LONG" | "SHORT";
  currentEquity: number;
  positionQty: number;
  entryPrice: number;
  protectiveStop: number | null;
  newsWindow: NewsWindowState;
  lastAtr: number;
}): ExitEvaluation {
  const candles = klinesToCandles(params.klines);
  const swings = findSwingPoints(candles, 3);

  const structure = checkMarketStructure(swings, params.side);
  const choch = checkChoch(candles, swings, params.side);
  const orderFlow = checkOrderFlow(candles, params.klines, params.side);
  const emaAlignment = checkEmaAlignment(candles, params.side);
  const liquiditySweep = checkLiquiditySweep(candles, swings, params.lastAtr, params.side);
  const priceAction = checkPriceAction(candles, params.side);
  const riskBreach = checkRiskBreach({
    currentEquity: params.currentEquity,
    positionQty: params.positionQty,
    entryPrice: params.entryPrice,
    protectiveStop: params.protectiveStop,
  });

  const newsLeg = newsOpposesPosition(params.newsWindow, params.side);
  const newsConfirmedReversal =
    newsLeg.opposes && priceAction.triggered && structure.triggered && orderFlow.triggered;
  const newsCheck: ExitCheckResult = {
    key: "news_confirmed_reversal",
    label: "High Impact News (confirmed)",
    triggered: newsConfirmedReversal,
    detail: newsConfirmedReversal
      ? `${newsLeg.detail} Dikonfirmasi oleh Price Action + Market Structure + Order Flow yang juga melawan posisi.`
      : newsLeg.detail,
  };

  const checks = [structure, choch, orderFlow, emaAlignment, liquiditySweep, riskBreach, newsCheck];
  const triggeredReasons = checks.filter((c) => c.triggered).map((c) => c.label);

  return { shouldExit: triggeredReasons.length > 0, checks, triggeredReasons };
}

export { buildNewsWindow };
