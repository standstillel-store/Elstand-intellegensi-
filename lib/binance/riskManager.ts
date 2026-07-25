import { getSymbolFilters } from "./marketData";
import { getLeverageBrackets } from "./futuresClient";
import { getBinanceConfig, type BinanceConfig } from "./config";
import type { RiskCalculationInput, RiskCalculationResult, SymbolFilters, LeverageBracket } from "./types";

// ---------------------------------------------------------------------------
// The one hard rule this whole integration is built around: "Never allow
// risk greater than 1%. Reject trade if Risk > 1%." MAX_RISK_PERCENT is a
// ceiling, not a default — callers may request less, never more. It is
// enforced here (server-side, the only place that matters) rather than
// trusted from the client or from the AI signal engine.
// ---------------------------------------------------------------------------

export const MAX_RISK_PERCENT = 1;
const RISK_TOLERANCE_PCT = 0.05; // rounding slack from stepSize/minQty snapping — never enough to matter economically

export function roundDownToStep(value: number, step: number): number {
  if (!step || step <= 0) return value;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  const snapped = Math.floor(value / step) * step;
  return Number(snapped.toFixed(precision));
}

export function roundToTick(value: number, tick: number): number {
  if (!tick || tick <= 0) return value;
  const precision = Math.max(0, Math.round(-Math.log10(tick)));
  const snapped = Math.round(value / tick) * tick;
  return Number(snapped.toFixed(precision));
}

/**
 * Estimated liquidation price for a single isolated-margin position in
 * one-way mode, ignoring funding fees and any margin added beyond the
 * initial margin requirement. Derived from Binance's own maintenance-margin
 * bracket table (fetched live via /fapi/v1/leverageBracket), not a fixed
 * guess — see the derivation note below. This is the same simplification
 * every retail bot makes (Binance's own UI liquidation estimate carries the
 * same caveat); it will drift from the exchange's real-time figure once
 * funding accrues or extra margin is added, which is why /api/binance/positions
 * always prefers Binance's own `liquidationPrice` field when a position is
 * already open — this function is only for *pre-trade* estimation.
 *
 * Derivation (isolated margin, single position, ignoring fees):
 *   at liquidation, marginBalance == maintenanceMargin
 *   walletBalance + qty*(markPrice-entryPrice)   = qty*markPrice*mmr - cum      [long]
 *   walletBalance + qty*(entryPrice-markPrice)   = qty*markPrice*mmr - cum      [short]
 *   walletBalance := qty*entryPrice/leverage (isolated margin == initial margin)
 * Solve each for markPrice at the liquidation boundary.
 */
export function estimateLiquidationPrice(params: {
  entryPrice: number;
  quantity: number;
  leverage: number;
  side: "LONG" | "SHORT";
  bracket: LeverageBracket | undefined;
}): number | undefined {
  const { entryPrice, quantity, leverage, side, bracket } = params;
  if (!bracket || quantity <= 0 || leverage <= 0) return undefined;
  const mmr = bracket.maintMarginRatio;
  const cum = bracket.cum;
  if (side === "LONG") {
    const denom = quantity * (1 - mmr);
    if (denom <= 0) return undefined;
    return (entryPrice * (1 - 1 / leverage) * quantity - cum) / denom;
  }
  const denom = quantity * (1 + mmr);
  if (denom <= 0) return undefined;
  return (entryPrice * (1 + 1 / leverage) * quantity + cum) / denom;
}

function pickBracket(brackets: LeverageBracket[], notional: number): LeverageBracket | undefined {
  return brackets.find((b) => notional >= b.notionalFloor && notional < (b.notionalCap || Infinity)) ?? brackets[0];
}

/**
 * Position-size calculator with the 1% hard cap baked in. Sizes the
 * position so a full stop-loss hit loses exactly `riskPercent`% of
 * `accountEquity` (never more, per rounding-down of quantity to the
 * exchange's lot step). Returns `ok: false` with a human-readable reason
 * whenever the trade can't be sized within the risk cap — callers (the
 * order route, the auto-trader) must refuse to place the order when
 * `ok` is false.
 */
export async function calculateRisk(input: RiskCalculationInput, cfg: BinanceConfig = getBinanceConfig()): Promise<RiskCalculationResult> {
  const { symbol, entryPrice, stopPrice, side, accountEquity, riskPercent, leverage } = input;

  if (!(entryPrice > 0) || !(stopPrice > 0) || entryPrice === stopPrice) {
    return { ok: false, reason: "Entry dan Stop Loss harus valid dan berbeda.", quantity: 0, notional: 0, marginRequired: 0, maxLossUsd: 0, maxLossPercent: 0 };
  }
  if ((side === "LONG" && stopPrice >= entryPrice) || (side === "SHORT" && stopPrice <= entryPrice)) {
    return { ok: false, reason: "Stop Loss harus di sisi yang benar dari Entry (di bawah untuk Long, di atas untuk Short).", quantity: 0, notional: 0, marginRequired: 0, maxLossUsd: 0, maxLossPercent: 0 };
  }
  if (!(accountEquity > 0)) {
    return { ok: false, reason: "Equity akun tidak valid atau nol.", quantity: 0, notional: 0, marginRequired: 0, maxLossUsd: 0, maxLossPercent: 0 };
  }
  const cappedRiskPercent = Math.min(riskPercent, MAX_RISK_PERCENT);
  if (riskPercent > MAX_RISK_PERCENT + 1e-9) {
    return {
      ok: false,
      reason: `Risk ${riskPercent.toFixed(2)}% melebihi batas maksimum ${MAX_RISK_PERCENT}%. Trade ditolak.`,
      quantity: 0,
      notional: 0,
      marginRequired: 0,
      maxLossUsd: 0,
      maxLossPercent: riskPercent,
    };
  }

  let filters: SymbolFilters;
  try {
    filters = await getSymbolFilters(symbol, cfg);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Gagal mengambil filter simbol dari Binance.",
      quantity: 0,
      notional: 0,
      marginRequired: 0,
      maxLossUsd: 0,
      maxLossPercent: 0,
    };
  }

  const riskDistance = Math.abs(entryPrice - stopPrice);
  const targetLossUsd = accountEquity * (cappedRiskPercent / 100);
  const rawQuantity = targetLossUsd / riskDistance;
  const quantity = roundDownToStep(rawQuantity, filters.stepSize || Math.pow(10, -filters.quantityPrecision));

  if (quantity <= 0 || quantity < filters.minQty) {
    return {
      ok: false,
      reason: `Ukuran posisi hasil perhitungan (${quantity}) di bawah minimum ${filters.minQty} ${symbol}. Perbesar equity, perlebar stop, atau perbesar leverage.`,
      quantity: 0,
      notional: 0,
      marginRequired: 0,
      maxLossUsd: 0,
      maxLossPercent: 0,
    };
  }

  const notional = quantity * entryPrice;
  if (notional < filters.minNotional) {
    return {
      ok: false,
      reason: `Notional order ($${notional.toFixed(2)}) di bawah minimum Binance ($${filters.minNotional}).`,
      quantity: 0,
      notional: 0,
      marginRequired: 0,
      maxLossUsd: 0,
      maxLossPercent: 0,
    };
  }

  const actualLossUsd = quantity * riskDistance;
  const actualLossPercent = (actualLossUsd / accountEquity) * 100;
  if (actualLossPercent > MAX_RISK_PERCENT + RISK_TOLERANCE_PCT) {
    return {
      ok: false,
      reason: `Setelah pembulatan lot size, risk aktual (${actualLossPercent.toFixed(3)}%) tetap melebihi ${MAX_RISK_PERCENT}%. Trade ditolak.`,
      quantity: 0,
      notional: 0,
      marginRequired: 0,
      maxLossUsd: 0,
      maxLossPercent: actualLossPercent,
    };
  }

  const marginRequired = leverage > 0 ? notional / leverage : notional;

  let liquidationPrice: number | undefined;
  try {
    const brackets = await getLeverageBrackets(symbol, cfg);
    const bracket = pickBracket(brackets, notional);
    liquidationPrice = estimateLiquidationPrice({ entryPrice, quantity, leverage, side, bracket });
  } catch {
    liquidationPrice = undefined; // non-fatal — brackets are informational, not required to place the order
  }
  const distanceToLiquidationPct = liquidationPrice ? (Math.abs(entryPrice - liquidationPrice) / entryPrice) * 100 : undefined;

  return {
    ok: true,
    quantity,
    notional: Number(notional.toFixed(2)),
    marginRequired: Number(marginRequired.toFixed(2)),
    maxLossUsd: Number(actualLossUsd.toFixed(2)),
    maxLossPercent: Number(actualLossPercent.toFixed(3)),
    liquidationPrice: liquidationPrice ? Number(liquidationPrice.toFixed(6)) : undefined,
    distanceToLiquidationPct: distanceToLiquidationPct ? Number(distanceToLiquidationPct.toFixed(2)) : undefined,
  };
}

/** Reward:Risk multiple for a given entry/stop/take-profit — used by the RR gate (min 1:3) in signalBridge.ts. */
export function computeRR(entry: number, stop: number, takeProfit: number): number {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(takeProfit - entry);
  if (risk <= 0) return 0;
  return reward / risk;
}
