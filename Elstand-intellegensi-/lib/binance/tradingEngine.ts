import * as futures from "./futuresClient";
import * as spot from "./spotClient";
import { getBinanceConfig, type BinanceConfig } from "./config";
import { calculateRisk, roundToTick, roundDownToStep } from "./riskManager";
import { getSymbolFilters } from "./marketData";
import { generateClientOrderId, assertNoDuplicateEntry, withSymbolLock } from "./orderGuard";
import { logOrder, updateOrderLogStatus, upsertPositionMeta, deletePositionMeta, getPositionMeta } from "./db";
import { BinanceRequestError } from "./types";
import type { OrderSide, OrderResult, PlaceOrderRequest, PositionInfo, OpenOrderInfo } from "./types";

// ---------------------------------------------------------------------------
// The Trading Engine: every "place an order" / "manage a position" action
// in ElVoid AI funnels through here, whether triggered by a person clicking
// a button on the dashboard or by the AI Auto Trader. This is the one file
// that actually mutates a Binance account — everything upstream (risk calc,
// signal generation, the API routes) only decides *whether* to call it.
//
// Design decisions worth stating plainly:
//   - One-way position mode is assumed (Binance's default): one net
//     position per symbol, sized/direction by BUY vs SELL. Hedge mode
//     (simultaneous LONG+SHORT on one symbol) is out of scope — it would
//     double the state this file has to track for marginal benefit in an
//     automated system that's supposed to never be net-both-directions
//     anyway.
//   - Protective Stop Loss / Take Profit are placed as Binance-native
//     conditional orders (STOP_MARKET / TAKE_PROFIT_MARKET) with
//     `closePosition: true`, not tracked client-side. That means they keep
//     working even if this server is down — the whole point of a stop.
//   - Spot has no leveraged "position" to open/close — Spot trading here is
//     a direct market/limit buy or sell (see placeSpotOrderDirect below);
//     the richer position lifecycle (open Long/Short, trailing stop,
//     liquidation, breakeven) is Futures-only, matching what these features
//     actually mean on Binance itself.
// ---------------------------------------------------------------------------

export interface OpenPositionParams {
  symbol: string;
  direction: "LONG" | "SHORT";
  orderType: "MARKET" | "LIMIT";
  limitPrice?: number; // required if orderType === LIMIT
  quantity?: number; // explicit size; omit to size from risk
  riskPercent?: number; // used with stopLoss to size the position (<=1, enforced in riskManager)
  stopLoss?: number; // price — also used for sizing when riskPercent is set
  /** Take Profit target(s). A single value attaches one closePosition TAKE_PROFIT_MARKET bracket
   *  (the whole position exits at once). Providing `takeProfit2` as well splits the exit in two —
   *  `takeProfitPercent`% of the position closes at `takeProfit` (partial TP1), the remainder closes
   *  at `takeProfit2` (final TP2) — both as native Binance conditional orders, no polling required. */
  takeProfit?: number;
  takeProfit2?: number;
  takeProfitPercent?: number; // portion closed at the first TP target when takeProfit2 is set; default 50
  leverage?: number;
  marginType?: "ISOLATED" | "CROSSED";
  source: "manual" | "auto_trader";
  strategy?: string;
  confluences?: number;
  riskReward?: number;
  reason?: string;
}

export interface OpenPositionResult {
  ok: boolean;
  reason?: string;
  entryOrder?: OrderResult;
  stopLossOrder?: OrderResult;
  takeProfitOrder?: OrderResult;
  quantity?: number;
}

function toOrderResult(o: OpenOrderInfo): OrderResult {
  return {
    orderId: o.orderId,
    clientOrderId: o.clientOrderId,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    status: o.status,
    price: o.price,
    origQty: o.origQty,
    executedQty: o.executedQty,
    avgPrice: o.avgPrice,
    reduceOnly: o.reduceOnly,
  };
}

/**
 * Opens (or adds to — "Scale In" reuses this directly) a Futures position.
 * Sizing: pass an explicit `quantity`, or `riskPercent` + `stopLoss` to size
 * from account risk (hard-capped at 1% regardless of what's requested —
 * see lib/binance/riskManager.ts). Attaches Stop Loss / Take Profit as
 * native closePosition orders immediately after the entry fills.
 */
export async function openPosition(params: OpenPositionParams, cfg: BinanceConfig = getBinanceConfig()): Promise<OpenPositionResult> {
  return withSymbolLock(params.symbol, async () => {
    const symbol = params.symbol.toUpperCase();
    const side: OrderSide = params.direction === "LONG" ? "BUY" : "SELL";

    if (params.source === "manual") {
      const dup = await assertNoDuplicateEntry(symbol, side, params.orderType);
      if (!dup.ok) return { ok: false, reason: dup.reason };
    }

    let quantity = params.quantity;
    let leverage = params.leverage ?? 5;

    if (!quantity) {
      if (!params.stopLoss || !params.riskPercent) {
        return { ok: false, reason: "Berikan quantity eksplisit, atau riskPercent + stopLoss untuk position sizing otomatis." };
      }
      const account = await futures.getFuturesAccount(cfg);
      const entryEstimate = params.orderType === "LIMIT" && params.limitPrice ? params.limitPrice : (await futures.getTickerPrice(symbol, cfg)).price;
      const risk = await calculateRisk(
        {
          symbol,
          entryPrice: entryEstimate,
          stopPrice: params.stopLoss,
          side: params.direction,
          accountEquity: account.totalMarginBalance,
          riskPercent: params.riskPercent,
          leverage,
        },
        cfg
      );
      if (!risk.ok) return { ok: false, reason: risk.reason };
      quantity = risk.quantity;
    }

    if (params.marginType) {
      await futures.setMarginType(symbol, params.marginType, cfg).catch(() => undefined);
    }
    if (params.leverage) {
      const requestedLeverage = params.leverage;
      leverage = await futures.setLeverage(symbol, requestedLeverage, cfg).catch(() => requestedLeverage);
    }

    const clientOrderId = generateClientOrderId(params.source === "auto_trader" ? "auto" : "el");
    const filters = await getSymbolFilters(symbol, cfg);
    const roundedQty = roundDownToStep(quantity, filters.stepSize);
    if (roundedQty <= 0) return { ok: false, reason: "Quantity setelah pembulatan lot size menjadi 0 — perbesar risk atau equity." };

    await logOrder({
      client_order_id: clientOrderId,
      symbol,
      market: "futures",
      mode: cfg.mode,
      side,
      position_side: "BOTH",
      order_type: params.orderType,
      quantity: roundedQty,
      price: params.limitPrice,
      stop_price: params.stopLoss,
      status: "SENDING",
      source: params.source,
      strategy: params.strategy,
      confluences: params.confluences,
      risk_percent: params.riskPercent,
      risk_reward: params.riskReward,
      reason: params.reason,
    });

    let entryOrder: OpenOrderInfo;
    try {
      entryOrder = await futures.placeFuturesOrder(
        {
          symbol,
          side,
          type: params.orderType,
          quantity: roundedQty,
          price: params.orderType === "LIMIT" ? roundToTick(params.limitPrice!, filters.tickSize) : undefined,
          timeInForce: params.orderType === "LIMIT" ? "GTC" : undefined,
          newClientOrderId: clientOrderId,
        },
        cfg
      );
    } catch (err) {
      await updateOrderLogStatus(clientOrderId, "REJECTED");
      const reason = err instanceof BinanceRequestError ? err.message : "Gagal mengirim order entry ke Binance.";
      return { ok: false, reason };
    }
    await updateOrderLogStatus(clientOrderId, entryOrder.status, entryOrder.orderId);

    const closeSide: OrderSide = side === "BUY" ? "SELL" : "BUY";
    let stopLossOrder: OpenOrderInfo | undefined;
    let takeProfitOrder: OpenOrderInfo | undefined;

    if (params.stopLoss) {
      try {
        stopLossOrder = await futures.placeFuturesOrder(
          {
            symbol,
            side: closeSide,
            type: "STOP_MARKET",
            stopPrice: roundToTick(params.stopLoss, filters.tickSize),
            closePosition: true,
            workingType: "MARK_PRICE",
            newClientOrderId: generateClientOrderId(params.source === "auto_trader" ? "auto" : "el"),
          },
          cfg
        );
      } catch (err) {
        console.error("[ElVoid AI][Binance] Gagal memasang Stop Loss setelah entry:", err instanceof Error ? err.message : err);
      }
    }
    if (params.takeProfit && params.takeProfit2) {
      // Multiple TP: TP1 takes a partial (reduceOnly, quantity-based — closePosition can't be
      // partial), TP2 is a closePosition order that mops up whatever remains after TP1 fills.
      const tp1Percent = Math.min(90, Math.max(10, params.takeProfitPercent ?? 50));
      const tp1Qty = roundDownToStep(roundedQty * (tp1Percent / 100), filters.stepSize);
      try {
        if (tp1Qty > 0) {
          await futures.placeFuturesOrder(
            {
              symbol,
              side: closeSide,
              type: "TAKE_PROFIT_MARKET",
              stopPrice: roundToTick(params.takeProfit, filters.tickSize),
              quantity: tp1Qty,
              reduceOnly: true,
              workingType: "MARK_PRICE",
              newClientOrderId: generateClientOrderId(params.source === "auto_trader" ? "auto" : "el"),
            },
            cfg
          );
        }
        takeProfitOrder = await futures.placeFuturesOrder(
          {
            symbol,
            side: closeSide,
            type: "TAKE_PROFIT_MARKET",
            stopPrice: roundToTick(params.takeProfit2, filters.tickSize),
            closePosition: true,
            workingType: "MARK_PRICE",
            newClientOrderId: generateClientOrderId(params.source === "auto_trader" ? "auto" : "el"),
          },
          cfg
        );
      } catch (err) {
        console.error("[ElVoid AI][Binance] Gagal memasang Multiple Take Profit setelah entry:", err instanceof Error ? err.message : err);
      }
    } else if (params.takeProfit) {
      try {
        takeProfitOrder = await futures.placeFuturesOrder(
          {
            symbol,
            side: closeSide,
            type: "TAKE_PROFIT_MARKET",
            stopPrice: roundToTick(params.takeProfit, filters.tickSize),
            closePosition: true,
            workingType: "MARK_PRICE",
            newClientOrderId: generateClientOrderId(params.source === "auto_trader" ? "auto" : "el"),
          },
          cfg
        );
      } catch (err) {
        console.error("[ElVoid AI][Binance] Gagal memasang Take Profit setelah entry:", err instanceof Error ? err.message : err);
      }
    }

    await upsertPositionMeta({
      symbol,
      side: params.direction,
      entry_client_order_id: clientOrderId,
      strategy: params.strategy,
      confluences: params.confluences,
      risk_reward: params.riskReward,
      initial_entry: entryOrder.avgPrice || params.limitPrice || entryOrder.price,
      initial_stop: params.stopLoss,
      tp1: params.takeProfit,
      tp2: params.takeProfit2,
      breakeven_moved: false,
      tp1_filled: false,
      tp2_filled: false,
      trailing_active: false,
      opened_by: params.source === "auto_trader" ? "auto_trader" : "manual",
      opened_at: new Date().toISOString(),
    });

    return {
      ok: true,
      entryOrder: toOrderResult(entryOrder),
      stopLossOrder: stopLossOrder ? toOrderResult(stopLossOrder) : undefined,
      takeProfitOrder: takeProfitOrder ? toOrderResult(takeProfitOrder) : undefined,
      quantity: roundedQty,
    };
  });
}

/** Closes a Futures position at market — fully by default, or a percentage of it (Scale Out / Partial TP). */
export async function closePosition(
  symbol: string,
  opts: { percent?: number; source: "manual" | "auto_trader" | "emergency"; reason?: string } = { source: "manual" },
  cfg: BinanceConfig = getBinanceConfig()
): Promise<{ ok: boolean; reason?: string; order?: OrderResult }> {
  return withSymbolLock(symbol, async () => {
    const sym = symbol.toUpperCase();
    const positions = await futures.getPositions(cfg, sym);
    const position = positions[0];
    if (!position) return { ok: false, reason: `Tidak ada posisi terbuka untuk ${sym}.` };

    const percent = Math.min(100, Math.max(1, opts.percent ?? 100));
    const filters = await getSymbolFilters(sym, cfg);
    const fullQty = Math.abs(position.positionAmt);
    const closeQty = percent >= 100 ? fullQty : roundDownToStep(fullQty * (percent / 100), filters.stepSize);
    if (closeQty <= 0) return { ok: false, reason: "Quantity penutupan menjadi 0 setelah pembulatan." };

    const side: OrderSide = position.positionAmt > 0 ? "SELL" : "BUY";
    const clientOrderId = generateClientOrderId(opts.source === "auto_trader" ? "auto" : opts.source === "emergency" ? "emg" : "el");

    await logOrder({
      client_order_id: clientOrderId,
      symbol: sym,
      market: "futures",
      mode: cfg.mode,
      side,
      position_side: "BOTH",
      order_type: "MARKET",
      quantity: closeQty,
      status: "SENDING",
      reduce_only: true,
      source: opts.source,
      reason: opts.reason ?? (percent >= 100 ? "Close position" : `Scale out ${percent}%`),
    });

    try {
      const order =
        percent >= 100
          ? await futures.placeFuturesOrder({ symbol: sym, side, type: "MARKET", closePosition: true, newClientOrderId: clientOrderId }, cfg)
          : await futures.placeFuturesOrder({ symbol: sym, side, type: "MARKET", quantity: closeQty, reduceOnly: true, newClientOrderId: clientOrderId }, cfg);
      await updateOrderLogStatus(clientOrderId, order.status, order.orderId);

      if (percent >= 100) {
        await futures.cancelAllFuturesOrders(sym, cfg).catch(() => undefined); // clean up now-orphaned SL/TP orders
        await deletePositionMeta(sym);
      } else if (percent >= 50) {
        await upsertPositionMeta({ symbol: sym, side: position.side, tp1_filled: true });
      }

      return { ok: true, order: toOrderResult(order) };
    } catch (err) {
      await updateOrderLogStatus(clientOrderId, "REJECTED");
      return { ok: false, reason: err instanceof BinanceRequestError ? err.message : "Gagal menutup posisi." };
    }
  });
}

/**
 * Emergency Close All Positions: cancels every open order, then
 * market-closes every open position, symbol by symbol. Best-effort and
 * continues past individual failures so one problem symbol can't block the
 * rest of the account from being flattened — exactly what an emergency
 * button needs to guarantee.
 */
export async function closeAllPositions(
  reason: string,
  cfg: BinanceConfig = getBinanceConfig()
): Promise<{ closed: string[]; failed: { symbol: string; reason: string }[] }> {
  const positions = await futures.getPositions(cfg);
  const closed: string[] = [];
  const failed: { symbol: string; reason: string }[] = [];

  for (const position of positions) {
    try {
      await futures.cancelAllFuturesOrders(position.symbol, cfg).catch(() => undefined);
      const result = await closePosition(position.symbol, { source: "emergency", reason }, cfg);
      if (result.ok) closed.push(position.symbol);
      else failed.push({ symbol: position.symbol, reason: result.reason ?? "Gagal menutup." });
    } catch (err) {
      failed.push({ symbol: position.symbol, reason: err instanceof Error ? err.message : "Error tidak diketahui." });
    }
  }
  return { closed, failed };
}

export async function cancelOrder(
  symbol: string,
  orderId: number | undefined,
  clientOrderId: string | undefined,
  cfg: BinanceConfig = getBinanceConfig()
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const order =
      cfg.market === "spot"
        ? await spot.cancelSpotOrder(symbol.toUpperCase(), orderId, clientOrderId, cfg)
        : await futures.cancelFuturesOrder(symbol.toUpperCase(), orderId, clientOrderId, cfg);
    await updateOrderLogStatus(order.clientOrderId, "CANCELED", order.orderId);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof BinanceRequestError ? err.message : "Gagal membatalkan order." };
  }
}

/**
 * Trailing Stop: places (or replaces) a TRAILING_STOP_MARKET order sized to
 * the full current position, `callbackRate`% behind the best price reached
 * since activation. Cancels any prior trailing-stop order on the symbol
 * first so re-arming never leaves two trailing stops racing each other.
 */
export async function setTrailingStop(
  symbol: string,
  callbackRate: number,
  activationPrice: number | undefined,
  cfg: BinanceConfig = getBinanceConfig()
): Promise<{ ok: boolean; reason?: string; order?: OrderResult }> {
  return withSymbolLock(symbol, async () => {
    const sym = symbol.toUpperCase();
    const positions = await futures.getPositions(cfg, sym);
    const position = positions[0];
    if (!position) return { ok: false, reason: `Tidak ada posisi terbuka untuk ${sym}.` };

    const existing = await futures.getOpenOrders(cfg, sym);
    for (const o of existing.filter((o) => o.type === "TRAILING_STOP_MARKET")) {
      await futures.cancelFuturesOrder(sym, o.orderId, undefined, cfg).catch(() => undefined);
    }

    const side: OrderSide = position.positionAmt > 0 ? "SELL" : "BUY";
    const clamped = Math.min(5, Math.max(0.1, callbackRate));
    const clientOrderId = generateClientOrderId("el");
    try {
      const order = await futures.placeFuturesOrder(
        {
          symbol: sym,
          side,
          type: "TRAILING_STOP_MARKET",
          quantity: Math.abs(position.positionAmt),
          callbackRate: clamped,
          activationPrice,
          reduceOnly: true,
          workingType: "MARK_PRICE",
          newClientOrderId: clientOrderId,
        },
        cfg
      );
      await logOrder({
        client_order_id: clientOrderId,
        symbol: sym,
        market: "futures",
        mode: cfg.mode,
        side,
        position_side: "BOTH",
        order_type: "TRAILING_STOP_MARKET",
        quantity: Math.abs(position.positionAmt),
        status: order.status,
        reduce_only: true,
        source: "manual",
        reason: `Trailing stop ${clamped}%`,
      });
      await upsertPositionMeta({ symbol: sym, side: position.side, trailing_active: true });
      return { ok: true, order: toOrderResult(order) };
    } catch (err) {
      return { ok: false, reason: err instanceof BinanceRequestError ? err.message : "Gagal memasang Trailing Stop." };
    }
  });
}

/**
 * Move SL to Break Even: cancels the existing protective Stop Loss (any
 * STOP_MARKET reduceOnly/closePosition order on the symbol) and replaces it
 * with one at the position's entry price — the standard "de-risk the
 * trade" move once it's shown enough favorable movement (TP1, typically).
 */
export async function moveStopToBreakeven(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<{ ok: boolean; reason?: string }> {
  return withSymbolLock(symbol, async () => {
    const sym = symbol.toUpperCase();
    const positions = await futures.getPositions(cfg, sym);
    const position = positions[0];
    if (!position) return { ok: false, reason: `Tidak ada posisi terbuka untuk ${sym}.` };

    const existing = await futures.getOpenOrders(cfg, sym);
    for (const o of existing.filter((o) => o.type === "STOP_MARKET" && o.closePosition)) {
      await futures.cancelFuturesOrder(sym, o.orderId, undefined, cfg).catch(() => undefined);
    }

    const filters = await getSymbolFilters(sym, cfg);
    const side: OrderSide = position.positionAmt > 0 ? "SELL" : "BUY";
    try {
      await futures.placeFuturesOrder(
        {
          symbol: sym,
          side,
          type: "STOP_MARKET",
          stopPrice: roundToTick(position.entryPrice, filters.tickSize),
          closePosition: true,
          workingType: "MARK_PRICE",
          newClientOrderId: generateClientOrderId("el"),
        },
        cfg
      );
      await upsertPositionMeta({ symbol: sym, side: position.side, breakeven_moved: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof BinanceRequestError ? err.message : "Gagal memindahkan SL ke breakeven." };
    }
  });
}

/**
 * Dynamic SL / Dynamic TP: replaces whichever protective order matches
 * `kind` with a fresh one at `price`. Used by the auto-trader's Trade
 * Monitor when structure/ATR moves enough to justify tightening or
 * widening a level intra-trade (never used to *loosen* risk past the
 * original 1% basis — callers are responsible for that check).
 */
export async function updateProtectiveOrder(
  symbol: string,
  kind: "SL" | "TP",
  price: number,
  cfg: BinanceConfig = getBinanceConfig()
): Promise<{ ok: boolean; reason?: string }> {
  return withSymbolLock(symbol, async () => {
    const sym = symbol.toUpperCase();
    const positions = await futures.getPositions(cfg, sym);
    const position = positions[0];
    if (!position) return { ok: false, reason: `Tidak ada posisi terbuka untuk ${sym}.` };

    const targetType = kind === "SL" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET";
    const existing = await futures.getOpenOrders(cfg, sym);
    for (const o of existing.filter((o) => o.type === targetType && o.closePosition)) {
      await futures.cancelFuturesOrder(sym, o.orderId, undefined, cfg).catch(() => undefined);
    }

    const filters = await getSymbolFilters(sym, cfg);
    const side: OrderSide = position.positionAmt > 0 ? "SELL" : "BUY";
    try {
      await futures.placeFuturesOrder(
        {
          symbol: sym,
          side,
          type: targetType,
          stopPrice: roundToTick(price, filters.tickSize),
          closePosition: true,
          workingType: "MARK_PRICE",
          newClientOrderId: generateClientOrderId("el"),
        },
        cfg
      );
      await upsertPositionMeta({ symbol: sym, side: position.side, ...(kind === "SL" ? { initial_stop: price } : { tp1: price }) });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof BinanceRequestError ? err.message : `Gagal memperbarui ${kind}.` };
    }
  });
}

/** Spot: direct market/limit buy or sell — no position lifecycle, matches what Spot trading actually is on Binance. */
export async function placeSpotOrderDirect(
  params: { symbol: string; side: OrderSide; type: "MARKET" | "LIMIT"; quantity: number; price?: number; source: "manual" | "auto_trader" },
  cfg: BinanceConfig = getBinanceConfig()
): Promise<{ ok: boolean; reason?: string; order?: OrderResult }> {
  return withSymbolLock(params.symbol, async () => {
    const symbol = params.symbol.toUpperCase();
    const dup = await assertNoDuplicateEntry(symbol, params.side, params.type);
    if (!dup.ok) return { ok: false, reason: dup.reason };

    const filters = await getSymbolFilters(symbol, cfg);
    const quantity = roundDownToStep(params.quantity, filters.stepSize);
    if (quantity < filters.minQty) return { ok: false, reason: `Quantity di bawah minimum ${filters.minQty} ${symbol}.` };

    const clientOrderId = generateClientOrderId("el");
    await logOrder({
      client_order_id: clientOrderId,
      symbol,
      market: "spot",
      mode: cfg.mode,
      side: params.side,
      position_side: "BOTH",
      order_type: params.type,
      quantity,
      price: params.price,
      status: "SENDING",
      source: params.source,
    });

    try {
      const order = await spot.placeSpotOrder(
        {
          symbol,
          side: params.side,
          type: params.type,
          quantity,
          price: params.type === "LIMIT" ? roundToTick(params.price!, filters.tickSize) : undefined,
          timeInForce: params.type === "LIMIT" ? "GTC" : undefined,
          newClientOrderId: clientOrderId,
        },
        cfg
      );
      await updateOrderLogStatus(clientOrderId, order.status, order.orderId);
      return { ok: true, order: toOrderResult(order) };
    } catch (err) {
      await updateOrderLogStatus(clientOrderId, "REJECTED");
      return { ok: false, reason: err instanceof BinanceRequestError ? err.message : "Gagal mengirim order Spot." };
    }
  });
}

export async function getManagedPosition(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<PositionInfo | null> {
  const positions = await futures.getPositions(cfg, symbol.toUpperCase());
  return positions[0] ?? null;
}

// ---------------------------------------------------------------------------
// General-purpose order placement covering every order type the spec asks
// for as a standalone primitive: Market, Limit, Stop (stop-limit), Stop
// Market, Take Profit (limit), Take Profit Market, Trailing Stop. This is
// what /api/binance/order calls directly. `openPosition` above stays as the
// higher-level "enter with an SL/TP bracket attached" convenience the Order
// Panel's Long/Short buttons and the AI Auto Trader use — both ultimately
// place orders through the same futures/spot client + guard + audit-log path.
// ---------------------------------------------------------------------------

const FUTURES_TYPE_MAP: Record<PlaceOrderRequest["type"], string> = {
  MARKET: "MARKET",
  LIMIT: "LIMIT",
  STOP: "STOP",
  STOP_MARKET: "STOP_MARKET",
  TAKE_PROFIT: "TAKE_PROFIT",
  TAKE_PROFIT_MARKET: "TAKE_PROFIT_MARKET",
  TRAILING_STOP_MARKET: "TRAILING_STOP_MARKET",
};

const SPOT_TYPE_MAP: Partial<Record<PlaceOrderRequest["type"], string>> = {
  MARKET: "MARKET",
  LIMIT: "LIMIT",
  STOP: "STOP_LOSS_LIMIT",
  STOP_MARKET: "STOP_LOSS",
  TAKE_PROFIT: "TAKE_PROFIT_LIMIT",
  TAKE_PROFIT_MARKET: "TAKE_PROFIT",
};

function needsPrice(type: PlaceOrderRequest["type"]): boolean {
  return type === "LIMIT" || type === "STOP" || type === "TAKE_PROFIT";
}
function needsStopPrice(type: PlaceOrderRequest["type"]): boolean {
  return type === "STOP" || type === "STOP_MARKET" || type === "TAKE_PROFIT" || type === "TAKE_PROFIT_MARKET";
}

export interface StandaloneOrderResult {
  ok: boolean;
  reason?: string;
  order?: OrderResult;
}

/** Places one order of any supported type on Futures or Spot, with full validation, sizing, guard checks, and audit logging. */
export async function placeStandaloneOrder(request: PlaceOrderRequest, cfg: BinanceConfig = getBinanceConfig()): Promise<StandaloneOrderResult> {
  const symbol = request.symbol.toUpperCase();
  // `cfg.market` is what actually decided `cfg.baseUrl` (see config.ts) — the server is
  // only ever connected to ONE Binance market at a time. A caller can't route a single
  // order to the other market by passing a different `request.market`; that would send
  // futures-shaped requests at the spot host (or vice versa). If the caller explicitly
  // asked for a market that doesn't match, fail clearly instead of silently misrouting.
  if (request.market && request.market !== cfg.market) {
    return {
      ok: false,
      reason: `Server ini terhubung ke Binance ${cfg.market === "futures" ? "Futures" : "Spot"} (BINANCE_MARKET=${cfg.market}), bukan ${request.market}. Ganti konfigurasi server untuk berpindah market.`,
    };
  }
  const market = cfg.market;

  if (needsPrice(request.type) && !request.price) {
    return { ok: false, reason: `Order type ${request.type} butuh price.` };
  }
  if (needsStopPrice(request.type) && !request.stopPrice) {
    return { ok: false, reason: `Order type ${request.type} butuh stopPrice.` };
  }
  if (request.type === "TRAILING_STOP_MARKET" && !request.callbackRate) {
    return { ok: false, reason: "Trailing Stop butuh callbackRate (%)." };
  }
  if (market === "spot" && (request.type === "TRAILING_STOP_MARKET" || !SPOT_TYPE_MAP[request.type])) {
    return { ok: false, reason: `Order type ${request.type} tidak didukung di Binance Spot — gunakan Futures.` };
  }

  return withSymbolLock(symbol, async () => {
    if (!request.reduceOnly && !request.closePosition) {
      const dup = await assertNoDuplicateEntry(symbol, request.side, request.type);
      if (!dup.ok) return { ok: false, reason: dup.reason };
    }

    const filters = await getSymbolFilters(symbol, cfg);
    let quantity = request.quantity;

    if (!quantity && !request.closePosition) {
      if (!request.riskPercent || !request.stopPrice) {
        return { ok: false, reason: "Berikan quantity, atau riskPercent + stopPrice untuk sizing otomatis." };
      }
      const side: "LONG" | "SHORT" = request.side === "BUY" ? "LONG" : "SHORT";
      const entryEstimate = request.price ?? (await (market === "spot" ? spot.getTickerPrice(symbol, cfg) : futures.getTickerPrice(symbol, cfg))).price;
      const accountEquity =
        market === "spot"
          ? (await spot.getSpotAccount(cfg)).balances.find((b) => b.asset === "USDT")?.total ?? 0
          : (await futures.getFuturesAccount(cfg)).totalMarginBalance;
      const risk = await calculateRisk(
        { symbol, entryPrice: entryEstimate, stopPrice: request.stopPrice, side, accountEquity, riskPercent: request.riskPercent, leverage: 1 },
        cfg
      );
      if (!risk.ok) return { ok: false, reason: risk.reason };
      quantity = risk.quantity;
    }

    const roundedQty = quantity ? roundDownToStep(quantity, filters.stepSize) : undefined;
    if (!request.closePosition && (!roundedQty || roundedQty <= 0)) {
      return { ok: false, reason: "Quantity tidak valid setelah pembulatan lot size." };
    }

    const clientOrderId = request.clientOrderId ?? generateClientOrderId("el");
    await logOrder({
      client_order_id: clientOrderId,
      symbol,
      market,
      mode: cfg.mode,
      side: request.side,
      position_side: request.positionSide ?? "BOTH",
      order_type: request.type,
      quantity: roundedQty ?? 0,
      price: request.price,
      stop_price: request.stopPrice,
      status: "SENDING",
      reduce_only: Boolean(request.reduceOnly || request.closePosition),
      source: "manual",
      reason: "Manual order via Order Panel",
    });

    try {
      if (market === "spot") {
        const order = await spot.placeSpotOrder(
          {
            symbol,
            side: request.side,
            type: SPOT_TYPE_MAP[request.type]!,
            quantity: roundedQty,
            price: request.price ? roundToTick(request.price, filters.tickSize) : undefined,
            stopPrice: needsStopPrice(request.type) && request.stopPrice ? roundToTick(request.stopPrice, filters.tickSize) : undefined,
            timeInForce: needsPrice(request.type) ? "GTC" : undefined,
            newClientOrderId: clientOrderId,
          },
          cfg
        );
        await updateOrderLogStatus(clientOrderId, order.status, order.orderId);
        return { ok: true, order: toOrderResult(order) };
      }

      const order = await futures.placeFuturesOrder(
        {
          symbol,
          side: request.side,
          type: FUTURES_TYPE_MAP[request.type],
          quantity: request.closePosition ? undefined : roundedQty,
          price: request.price ? roundToTick(request.price, filters.tickSize) : undefined,
          stopPrice: needsStopPrice(request.type) && request.stopPrice ? roundToTick(request.stopPrice, filters.tickSize) : undefined,
          timeInForce: needsPrice(request.type) ? "GTC" : undefined,
          reduceOnly: request.reduceOnly,
          closePosition: request.closePosition,
          callbackRate: request.callbackRate,
          activationPrice: request.activationPrice,
          workingType: needsStopPrice(request.type) ? "MARK_PRICE" : undefined,
          newClientOrderId: clientOrderId,
        },
        cfg
      );
      await updateOrderLogStatus(clientOrderId, order.status, order.orderId);
      return { ok: true, order: toOrderResult(order) };
    } catch (err) {
      await updateOrderLogStatus(clientOrderId, "REJECTED");
      return { ok: false, reason: err instanceof BinanceRequestError ? err.message : "Gagal mengirim order." };
    }
  });
}

export { getPositionMeta };
