import { binanceRequest, num } from "./restClient";
import { getBinanceConfig, type BinanceConfig } from "./config";
import { cached } from "../cache";
import type {
  AccountBalanceEntry,
  FuturesAccountSummary,
  PositionInfo,
  OpenOrderInfo,
  TradeHistoryEntry,
  Kline,
  OrderBookSnapshot,
  TickerPrice,
  SymbolFilters,
  LeverageBracket,
  OrderSide,
  PositionSide,
} from "./types";

// ---------------------------------------------------------------------------
// USDT-M Futures Testnet/Live client. Every function accepts an optional
// `cfg` so callers can pin a specific credential set (e.g. the auto-trader
// resolving DB-stored credentials) — defaults to the process-wide env
// config from lib/binance/config.ts.
// ---------------------------------------------------------------------------

const FUTURES_PREFIX = "/fapi/v1";
const FUTURES_PREFIX_V2 = "/fapi/v2";

export async function getServerTime(cfg: BinanceConfig = getBinanceConfig()): Promise<number> {
  const res = await binanceRequest<{ serverTime: number }>(`${FUTURES_PREFIX}/time`, {}, cfg);
  return res.serverTime;
}

export async function pingFutures(cfg: BinanceConfig = getBinanceConfig()): Promise<boolean> {
  await binanceRequest<Record<string, never>>(`${FUTURES_PREFIX}/ping`, {}, cfg);
  return true;
}

interface RawSymbolInfo {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string; minQty?: string; notional?: string; minNotional?: string }>;
}

/** Symbol precision/step-size filters, cached for an hour — these change rarely and every order/risk calc needs them for correct rounding. */
export async function getSymbolFilters(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<SymbolFilters> {
  return cached(`bn:futures:filters:${cfg.mode}:${symbol}`, 3_600_000, async () => {
    const info = await binanceRequest<{ symbols: RawSymbolInfo[] }>(`${FUTURES_PREFIX}/exchangeInfo`, {}, cfg);
    const found = info.symbols.find((s) => s.symbol === symbol);
    if (!found) {
      throw new Error(`Symbol ${symbol} tidak ditemukan di Binance Futures ${cfg.mode}.`);
    }
    const tickFilter = found.filters.find((f) => f.filterType === "PRICE_FILTER");
    const lotFilter = found.filters.find((f) => f.filterType === "LOT_SIZE");
    const notionalFilter = found.filters.find((f) => f.filterType === "MIN_NOTIONAL");
    return {
      symbol,
      pricePrecision: found.pricePrecision,
      quantityPrecision: found.quantityPrecision,
      tickSize: num(tickFilter?.tickSize, Math.pow(10, -found.pricePrecision)),
      stepSize: num(lotFilter?.stepSize, Math.pow(10, -found.quantityPrecision)),
      minQty: num(lotFilter?.minQty, 0),
      minNotional: num(notionalFilter?.notional ?? notionalFilter?.minNotional, 5),
    };
  });
}

export async function getLeverageBrackets(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<LeverageBracket[]> {
  return cached(`bn:futures:brackets:${cfg.mode}:${symbol}`, 3_600_000, async () => {
    const res = await binanceRequest<Array<{ symbol: string; brackets: Array<Record<string, number>> }>>(
      `${FUTURES_PREFIX}/leverageBracket`,
      { params: { symbol }, signed: true },
      cfg
    );
    const entry = res.find((r) => r.symbol === symbol);
    if (!entry) return [];
    return entry.brackets.map((b) => ({
      bracket: b.bracket,
      initialLeverage: b.initialLeverage,
      notionalCap: b.notionalCap,
      notionalFloor: b.notionalFloor,
      maintMarginRatio: b.maintMarginRatio,
      cum: b.cum,
    }));
  });
}

export async function getTickerPrice(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<TickerPrice> {
  const res = await binanceRequest<{ symbol: string; price: string; time: number }>(
    `${FUTURES_PREFIX}/ticker/price`,
    { params: { symbol } },
    cfg
  );
  return { symbol: res.symbol, price: num(res.price), time: res.time ?? Date.now() };
}

export async function getMarkPrice(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<number> {
  const res = await binanceRequest<{ markPrice: string }>(`${FUTURES_PREFIX}/premiumIndex`, { params: { symbol } }, cfg);
  return num(res.markPrice);
}

const KLINE_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"];

export function isValidInterval(interval: string): boolean {
  return KLINE_INTERVALS.includes(interval);
}

export async function getKlines(symbol: string, interval: string, limit = 200, cfg: BinanceConfig = getBinanceConfig()): Promise<Kline[]> {
  const raw = await binanceRequest<
    Array<[number, string, string, string, string, string, number, string, number, string, string, string]>
  >(`${FUTURES_PREFIX}/klines`, { params: { symbol, interval, limit: Math.min(1500, limit) } }, cfg);
  return raw.map(
    (k): Kline => ({
      openTime: k[0],
      open: num(k[1]),
      high: num(k[2]),
      low: num(k[3]),
      close: num(k[4]),
      volume: num(k[5]),
      closeTime: k[6],
      quoteVolume: num(k[7]),
      trades: k[8],
      takerBuyBaseVolume: num(k[9]),
      takerBuyQuoteVolume: num(k[10]),
    })
  );
}

export async function getOrderBook(symbol: string, limit = 50, cfg: BinanceConfig = getBinanceConfig()): Promise<OrderBookSnapshot> {
  const res = await binanceRequest<{ lastUpdateId: number; bids: [string, string][]; asks: [string, string][] }>(
    `${FUTURES_PREFIX}/depth`,
    { params: { symbol, limit } },
    cfg
  );
  const bids = res.bids.map(([p, q]) => ({ price: num(p), qty: num(q) }));
  const asks = res.asks.map(([p, q]) => ({ price: num(p), qty: num(q) }));
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const midPrice = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : bestBid || bestAsk;
  return {
    lastUpdateId: res.lastUpdateId,
    bids,
    asks,
    spread,
    spreadPct: midPrice ? (spread / midPrice) * 100 : 0,
    midPrice,
  };
}

// --- Signed: account & positions ------------------------------------------

interface RawFuturesAccount {
  totalWalletBalance: string;
  totalMarginBalance: string;
  totalUnrealizedProfit: string;
  totalMaintMargin: string;
  totalInitialMargin: string;
  availableBalance: string;
  totalPositionInitialMargin: string;
  totalOpenOrderInitialMargin: string;
  maxWithdrawAmount: string;
  canTrade: boolean;
  updateTime: number;
  assets: Array<{ asset: string; walletBalance: string; unrealizedProfit: string; marginBalance: string; availableBalance: string; crossWalletBalance: string }>;
}

export async function getFuturesAccount(cfg: BinanceConfig = getBinanceConfig()): Promise<FuturesAccountSummary> {
  const res = await binanceRequest<RawFuturesAccount>(`${FUTURES_PREFIX_V2}/account`, { signed: true }, cfg);
  const assets: AccountBalanceEntry[] = res.assets
    .filter((a) => num(a.walletBalance) !== 0 || num(a.crossWalletBalance) !== 0)
    .map((a) => ({
      asset: a.asset,
      free: num(a.availableBalance),
      locked: num(a.walletBalance) - num(a.availableBalance),
      total: num(a.walletBalance),
      crossWalletBalance: num(a.crossWalletBalance),
    }));
  return {
    totalWalletBalance: num(res.totalWalletBalance),
    totalMarginBalance: num(res.totalMarginBalance),
    totalUnrealizedProfit: num(res.totalUnrealizedProfit),
    totalMaintMargin: num(res.totalMaintMargin),
    totalInitialMargin: num(res.totalInitialMargin),
    availableBalance: num(res.availableBalance),
    totalPositionInitialMargin: num(res.totalPositionInitialMargin),
    totalOpenOrderInitialMargin: num(res.totalOpenOrderInitialMargin),
    maxWithdrawAmount: num(res.maxWithdrawAmount),
    assets,
    canTrade: res.canTrade,
    updateTime: res.updateTime,
  };
}

interface RawPositionRisk {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  isolatedMargin: string;
  positionSide: string;
  updateTime: number;
}

export async function getPositions(cfg: BinanceConfig = getBinanceConfig(), symbol?: string): Promise<PositionInfo[]> {
  const res = await binanceRequest<RawPositionRisk[]>(
    `${FUTURES_PREFIX_V2}/positionRisk`,
    { params: symbol ? { symbol } : {}, signed: true },
    cfg
  );
  return res
    .filter((p) => num(p.positionAmt) !== 0)
    .map((p): PositionInfo => {
      const amt = num(p.positionAmt);
      const entryPrice = num(p.entryPrice);
      const markPrice = num(p.markPrice);
      const isolatedMargin = num(p.isolatedMargin);
      const leverage = num(p.leverage, 1);
      const unrealizedProfit = num(p.unRealizedProfit);
      const marginBasis = p.marginType === "isolated" ? isolatedMargin : (Math.abs(amt) * entryPrice) / Math.max(1, leverage);
      return {
        symbol: p.symbol,
        positionSide: (p.positionSide as PositionSide) ?? "BOTH",
        side: amt > 0 ? "LONG" : "SHORT",
        entryPrice,
        markPrice,
        positionAmt: amt,
        notional: Math.abs(amt) * markPrice,
        leverage,
        marginType: p.marginType === "isolated" ? "isolated" : "cross",
        isolatedMargin,
        unrealizedProfit,
        unrealizedProfitPct: marginBasis > 0 ? (unrealizedProfit / marginBasis) * 100 : 0,
        liquidationPrice: num(p.liquidationPrice),
        updateTime: p.updateTime,
      };
    });
}

interface RawOrder {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: string;
  positionSide: string;
  type: string;
  status: string;
  price: string;
  stopPrice: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  reduceOnly: boolean;
  closePosition: boolean;
  activatePrice?: string;
  priceRate?: string;
  workingType?: string;
  time: number;
  updateTime: number;
}

function mapOrder(o: RawOrder): OpenOrderInfo {
  return {
    orderId: o.orderId,
    clientOrderId: o.clientOrderId,
    symbol: o.symbol,
    side: o.side as OrderSide,
    positionSide: (o.positionSide as PositionSide) ?? "BOTH",
    type: o.type,
    status: o.status,
    price: num(o.price),
    stopPrice: num(o.stopPrice),
    avgPrice: num(o.avgPrice),
    origQty: num(o.origQty),
    executedQty: num(o.executedQty),
    reduceOnly: Boolean(o.reduceOnly),
    closePosition: Boolean(o.closePosition),
    activatePrice: o.activatePrice ? num(o.activatePrice) : undefined,
    priceRate: o.priceRate ? num(o.priceRate) : undefined,
    workingType: o.workingType,
    time: o.time,
    updateTime: o.updateTime,
  };
}

export async function getOpenOrders(cfg: BinanceConfig = getBinanceConfig(), symbol?: string): Promise<OpenOrderInfo[]> {
  const res = await binanceRequest<RawOrder[]>(`${FUTURES_PREFIX}/openOrders`, { params: symbol ? { symbol } : {}, signed: true }, cfg);
  return res.map(mapOrder);
}

export async function getOrderHistory(
  cfg: BinanceConfig = getBinanceConfig(),
  symbol?: string,
  limit = 100
): Promise<OpenOrderInfo[]> {
  if (!symbol) {
    // /fapi/v1/allOrders requires a symbol on Binance Futures — callers without one get an empty list
    // rather than an error, since "order history across all symbols" isn't a single Binance call.
    return [];
  }
  const res = await binanceRequest<RawOrder[]>(
    `${FUTURES_PREFIX}/allOrders`,
    { params: { symbol, limit: Math.min(1000, limit) }, signed: true },
    cfg
  );
  return res.map(mapOrder).sort((a, b) => b.time - a.time);
}

interface RawUserTrade {
  id: number;
  orderId: number;
  symbol: string;
  side: string;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  realizedPnl: string;
  time: number;
  maker: boolean;
  buyer: boolean;
}

export async function getTradeHistory(
  cfg: BinanceConfig = getBinanceConfig(),
  symbol?: string,
  limit = 100
): Promise<TradeHistoryEntry[]> {
  if (!symbol) return [];
  const res = await binanceRequest<RawUserTrade[]>(
    `${FUTURES_PREFIX}/userTrades`,
    { params: { symbol, limit: Math.min(1000, limit) }, signed: true },
    cfg
  );
  return res
    .map(
      (t): TradeHistoryEntry => ({
        id: t.id,
        orderId: t.orderId,
        symbol: t.symbol,
        side: t.side as OrderSide,
        price: num(t.price),
        qty: num(t.qty),
        quoteQty: num(t.quoteQty),
        commission: num(t.commission),
        commissionAsset: t.commissionAsset,
        realizedPnl: num(t.realizedPnl),
        time: t.time,
        isMaker: t.maker,
        isBuyer: t.buyer,
      })
    )
    .sort((a, b) => b.time - a.time);
}

// --- Signed: trading actions -------------------------------------------

export interface RawNewOrderParams {
  symbol: string;
  side: OrderSide;
  type: string;
  quantity?: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: string;
  reduceOnly?: boolean;
  closePosition?: boolean;
  callbackRate?: number;
  activationPrice?: number;
  workingType?: string;
  newClientOrderId?: string;
  positionSide?: PositionSide;
}

export async function placeFuturesOrder(params: RawNewOrderParams, cfg: BinanceConfig = getBinanceConfig()): Promise<OpenOrderInfo> {
  const query: Record<string, string | number | boolean | undefined> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    quantity: params.quantity,
    price: params.price,
    stopPrice: params.stopPrice,
    timeInForce: params.timeInForce,
    reduceOnly: params.closePosition ? undefined : params.reduceOnly,
    closePosition: params.closePosition,
    callbackRate: params.callbackRate,
    activationPrice: params.activationPrice,
    workingType: params.workingType,
    newClientOrderId: params.newClientOrderId,
  };
  const res = await binanceRequest<RawOrder>(`${FUTURES_PREFIX}/order`, { method: "POST", params: query, signed: true }, cfg);
  return mapOrder(res);
}

export async function cancelFuturesOrder(
  symbol: string,
  orderId: number | undefined,
  clientOrderId: string | undefined,
  cfg: BinanceConfig = getBinanceConfig()
): Promise<OpenOrderInfo> {
  const res = await binanceRequest<RawOrder>(
    `${FUTURES_PREFIX}/order`,
    { method: "DELETE", params: { symbol, orderId, origClientOrderId: clientOrderId }, signed: true },
    cfg
  );
  return mapOrder(res);
}

export async function cancelAllFuturesOrders(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<void> {
  await binanceRequest<Record<string, unknown>>(`${FUTURES_PREFIX}/allOpenOrders`, { method: "DELETE", params: { symbol }, signed: true }, cfg);
}

export async function setLeverage(symbol: string, leverage: number, cfg: BinanceConfig = getBinanceConfig()): Promise<number> {
  const res = await binanceRequest<{ leverage: number; symbol: string }>(
    `${FUTURES_PREFIX}/leverage`,
    { method: "POST", params: { symbol, leverage }, signed: true },
    cfg
  );
  return res.leverage;
}

export async function setMarginType(
  symbol: string,
  marginType: "ISOLATED" | "CROSSED",
  cfg: BinanceConfig = getBinanceConfig()
): Promise<boolean> {
  try {
    await binanceRequest<Record<string, unknown>>(`${FUTURES_PREFIX}/marginType`, { method: "POST", params: { symbol, marginType }, signed: true }, cfg);
    return true;
  } catch (err) {
    // Binance returns -4046 "No need to change margin type" when it already matches — treat as success.
    if (err instanceof Error && err.message.includes("No need to change")) return true;
    throw err;
  }
}
