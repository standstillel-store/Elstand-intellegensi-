import { binanceRequest, num } from "./restClient";
import { getBinanceConfig, type BinanceConfig } from "./config";
import { cached } from "../cache";
import type {
  AccountBalanceEntry,
  SpotAccountSummary,
  OpenOrderInfo,
  TradeHistoryEntry,
  Kline,
  OrderBookSnapshot,
  TickerPrice,
  SymbolFilters,
  OrderSide,
} from "./types";

// ---------------------------------------------------------------------------
// Spot Testnet/Live client. Spot has no leveraged "positions" — buying is
// the only way to go long, and there is no native short — so this client
// intentionally exposes balances + order placement/history only. Long/Short
// positions, leverage, trailing stop, and liquidation price are Futures
// concepts and live in futuresClient.ts, matching Binance's own product
// boundaries rather than inventing a synthetic "spot position".
// ---------------------------------------------------------------------------

const SPOT_PREFIX = "/api/v3";

export async function getServerTime(cfg: BinanceConfig = getBinanceConfig()): Promise<number> {
  const res = await binanceRequest<{ serverTime: number }>(`${SPOT_PREFIX}/time`, {}, cfg);
  return res.serverTime;
}

export async function pingSpot(cfg: BinanceConfig = getBinanceConfig()): Promise<boolean> {
  await binanceRequest<Record<string, never>>(`${SPOT_PREFIX}/ping`, {}, cfg);
  return true;
}

interface RawSymbolInfo {
  symbol: string;
  baseAssetPrecision: number;
  quoteAssetPrecision: number;
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string; minQty?: string; minNotional?: string }>;
}

export async function getSymbolFilters(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<SymbolFilters> {
  return cached(`bn:spot:filters:${cfg.mode}:${symbol}`, 3_600_000, async () => {
    const info = await binanceRequest<{ symbols: RawSymbolInfo[] }>(`${SPOT_PREFIX}/exchangeInfo`, { params: { symbol } }, cfg);
    const found = info.symbols[0];
    if (!found) throw new Error(`Symbol ${symbol} tidak ditemukan di Binance Spot ${cfg.mode}.`);
    const tickFilter = found.filters.find((f) => f.filterType === "PRICE_FILTER");
    const lotFilter = found.filters.find((f) => f.filterType === "LOT_SIZE");
    const notionalFilter = found.filters.find((f) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL");
    return {
      symbol,
      pricePrecision: found.quoteAssetPrecision,
      quantityPrecision: found.baseAssetPrecision,
      tickSize: num(tickFilter?.tickSize, Math.pow(10, -found.quoteAssetPrecision)),
      stepSize: num(lotFilter?.stepSize, Math.pow(10, -found.baseAssetPrecision)),
      minQty: num(lotFilter?.minQty, 0),
      minNotional: num(notionalFilter?.minNotional, 5),
    };
  });
}

export async function getTickerPrice(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<TickerPrice> {
  const res = await binanceRequest<{ symbol: string; price: string }>(`${SPOT_PREFIX}/ticker/price`, { params: { symbol } }, cfg);
  return { symbol: res.symbol, price: num(res.price), time: Date.now() };
}

export async function getKlines(symbol: string, interval: string, limit = 200, cfg: BinanceConfig = getBinanceConfig()): Promise<Kline[]> {
  const raw = await binanceRequest<
    Array<[number, string, string, string, string, string, number, string, number, string, string, string]>
  >(`${SPOT_PREFIX}/klines`, { params: { symbol, interval, limit: Math.min(1000, limit) } }, cfg);
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
    `${SPOT_PREFIX}/depth`,
    { params: { symbol, limit } },
    cfg
  );
  const bids = res.bids.map(([p, q]) => ({ price: num(p), qty: num(q) }));
  const asks = res.asks.map(([p, q]) => ({ price: num(p), qty: num(q) }));
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const midPrice = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : bestBid || bestAsk;
  return { lastUpdateId: res.lastUpdateId, bids, asks, spread, spreadPct: midPrice ? (spread / midPrice) * 100 : 0, midPrice };
}

// --- Signed ---------------------------------------------------------------

interface RawSpotAccount {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  balances: Array<{ asset: string; free: string; locked: string }>;
}

export async function getSpotAccount(cfg: BinanceConfig = getBinanceConfig()): Promise<SpotAccountSummary> {
  const res = await binanceRequest<RawSpotAccount>(`${SPOT_PREFIX}/account`, { signed: true }, cfg);
  const balances: AccountBalanceEntry[] = res.balances
    .filter((b) => num(b.free) > 0 || num(b.locked) > 0)
    .map((b) => ({ asset: b.asset, free: num(b.free), locked: num(b.locked), total: num(b.free) + num(b.locked) }));
  return { balances, canTrade: res.canTrade, canWithdraw: res.canWithdraw, canDeposit: res.canDeposit, updateTime: res.updateTime };
}

interface RawOrder {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  price: string;
  stopPrice: string;
  origQty: string;
  executedQty: string;
  time: number;
  updateTime: number;
}

function mapOrder(o: RawOrder): OpenOrderInfo {
  const executed = num(o.executedQty);
  const orig = num(o.origQty);
  return {
    orderId: o.orderId,
    clientOrderId: o.clientOrderId,
    symbol: o.symbol,
    side: o.side as OrderSide,
    positionSide: "BOTH",
    type: o.type,
    status: o.status,
    price: num(o.price),
    stopPrice: num(o.stopPrice),
    avgPrice: num(o.price), // spot fills report avg via myTrades; price is the resting/limit reference here
    origQty: orig,
    executedQty: executed,
    reduceOnly: false,
    closePosition: false,
    time: o.time,
    updateTime: o.updateTime ?? o.time,
  };
}

export async function getOpenOrders(cfg: BinanceConfig = getBinanceConfig(), symbol?: string): Promise<OpenOrderInfo[]> {
  const res = await binanceRequest<RawOrder[]>(`${SPOT_PREFIX}/openOrders`, { params: symbol ? { symbol } : {}, signed: true }, cfg);
  return res.map(mapOrder);
}

export async function getOrderHistory(cfg: BinanceConfig = getBinanceConfig(), symbol?: string, limit = 100): Promise<OpenOrderInfo[]> {
  if (!symbol) return [];
  const res = await binanceRequest<RawOrder[]>(`${SPOT_PREFIX}/allOrders`, { params: { symbol, limit: Math.min(1000, limit) }, signed: true }, cfg);
  return res.map(mapOrder).sort((a, b) => b.time - a.time);
}

interface RawTrade {
  id: number;
  orderId: number;
  symbol: string;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
}

export async function getTradeHistory(cfg: BinanceConfig = getBinanceConfig(), symbol?: string, limit = 100): Promise<TradeHistoryEntry[]> {
  if (!symbol) return [];
  const res = await binanceRequest<RawTrade[]>(`${SPOT_PREFIX}/myTrades`, { params: { symbol, limit: Math.min(1000, limit) }, signed: true }, cfg);
  return res
    .map(
      (t): TradeHistoryEntry => ({
        id: t.id,
        orderId: t.orderId,
        symbol: t.symbol,
        side: t.isBuyer ? "BUY" : "SELL",
        price: num(t.price),
        qty: num(t.qty),
        quoteQty: num(t.quoteQty),
        commission: num(t.commission),
        commissionAsset: t.commissionAsset,
        realizedPnl: 0, // spot has no per-trade realized PnL field — P&L is derived from balance deltas, not a single trade
        time: t.time,
        isMaker: t.isMaker,
        isBuyer: t.isBuyer,
      })
    )
    .sort((a, b) => b.time - a.time);
}

export interface RawSpotOrderParams {
  symbol: string;
  side: OrderSide;
  type: string; // MARKET | LIMIT | STOP_LOSS_LIMIT | TAKE_PROFIT_LIMIT
  quantity?: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: string;
  newClientOrderId?: string;
}

export async function placeSpotOrder(params: RawSpotOrderParams, cfg: BinanceConfig = getBinanceConfig()): Promise<OpenOrderInfo> {
  const res = await binanceRequest<RawOrder>(
    `${SPOT_PREFIX}/order`,
    {
      method: "POST",
      params: {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: params.quantity,
        price: params.price,
        stopPrice: params.stopPrice,
        timeInForce: params.timeInForce,
        newClientOrderId: params.newClientOrderId,
      },
      signed: true,
    },
    cfg
  );
  return mapOrder(res);
}

export async function cancelSpotOrder(
  symbol: string,
  orderId: number | undefined,
  clientOrderId: string | undefined,
  cfg: BinanceConfig = getBinanceConfig()
): Promise<OpenOrderInfo> {
  const res = await binanceRequest<RawOrder>(
    `${SPOT_PREFIX}/order`,
    { method: "DELETE", params: { symbol, orderId, origClientOrderId: clientOrderId }, signed: true },
    cfg
  );
  return mapOrder(res);
}

export async function cancelAllSpotOrders(symbol: string, cfg: BinanceConfig = getBinanceConfig()): Promise<void> {
  await binanceRequest<unknown>(`${SPOT_PREFIX}/openOrders`, { method: "DELETE", params: { symbol }, signed: true }, cfg);
}
