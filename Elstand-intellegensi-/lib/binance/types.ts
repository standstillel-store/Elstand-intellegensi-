// ---------------------------------------------------------------------------
// Types for ElVoid AI's Binance Spot/Futures integration (Testnet + Live).
// This module is deliberately separate from lib/binance.ts (the public,
// no-key market-data feed the rest of the dashboard already uses for
// funding/OI/klines) — everything here is the *authenticated* trading path:
// account, positions, orders, and order placement, gated by an API
// key/secret and aware of TESTNET vs LIVE mode. See lib/binance/config.ts.
// ---------------------------------------------------------------------------

export type BinanceMode = "testnet" | "live";
export type BinanceMarket = "spot" | "futures";

export type OrderSide = "BUY" | "SELL";
export type PositionSide = "LONG" | "SHORT" | "BOTH";

/**
 * The order types ElVoid AI's Trading Engine exposes. These map onto
 * Binance's native order types (see lib/binance/futuresClient.ts /
 * spotClient.ts for the exact translation per market).
 */
export type EngineOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP" // stop-limit
  | "STOP_MARKET"
  | "TAKE_PROFIT" // take-profit-limit
  | "TAKE_PROFIT_MARKET"
  | "TRAILING_STOP_MARKET";

export interface AccountBalanceEntry {
  asset: string;
  free: number;
  locked: number;
  total: number;
  /** Futures only — wallet balance including unrealized PnL is `total`, this is the margin-only figure. */
  crossWalletBalance?: number;
}

export interface FuturesAccountSummary {
  totalWalletBalance: number;
  totalMarginBalance: number;
  totalUnrealizedProfit: number;
  totalMaintMargin: number;
  totalInitialMargin: number;
  availableBalance: number;
  totalPositionInitialMargin: number;
  totalOpenOrderInitialMargin: number;
  maxWithdrawAmount: number;
  assets: AccountBalanceEntry[];
  canTrade: boolean;
  updateTime: number;
}

export interface SpotAccountSummary {
  balances: AccountBalanceEntry[];
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
}

export interface PositionInfo {
  symbol: string;
  positionSide: PositionSide;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  positionAmt: number; // signed size in base asset
  notional: number; // abs(positionAmt) * markPrice
  leverage: number;
  marginType: "isolated" | "cross";
  isolatedMargin: number;
  unrealizedProfit: number;
  unrealizedProfitPct: number; // relative to isolated margin / initial margin
  liquidationPrice: number;
  updateTime: number;
}

export interface OpenOrderInfo {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  positionSide: PositionSide;
  type: string;
  status: string;
  price: number;
  stopPrice: number;
  avgPrice: number;
  origQty: number;
  executedQty: number;
  reduceOnly: boolean;
  closePosition: boolean;
  activatePrice?: number;
  priceRate?: number;
  workingType?: string;
  time: number;
  updateTime: number;
}

export interface TradeHistoryEntry {
  id: number;
  orderId: number;
  symbol: string;
  side: OrderSide;
  price: number;
  qty: number;
  quoteQty: number;
  commission: number;
  commissionAsset: string;
  realizedPnl: number;
  time: number;
  isMaker: boolean;
  isBuyer: boolean;
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  takerBuyBaseVolume: number;
  takerBuyQuoteVolume: number;
}

export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBookSnapshot {
  lastUpdateId: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  spreadPct: number;
  midPrice: number;
}

export interface TickerPrice {
  symbol: string;
  price: number;
  time: number;
}

export interface SymbolFilters {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
  maxLeverage?: number;
}

export interface LeverageBracket {
  bracket: number;
  initialLeverage: number;
  notionalCap: number;
  notionalFloor: number;
  maintMarginRatio: number;
  cum: number;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: OrderSide;
  type: EngineOrderType;
  quantity?: number;
  /** When set, sizes the order from account-risk instead of a fixed `quantity`. */
  riskPercent?: number;
  price?: number; // required for LIMIT / STOP / TAKE_PROFIT
  stopPrice?: number; // required for STOP / STOP_MARKET / TAKE_PROFIT / TAKE_PROFIT_MARKET
  callbackRate?: number; // TRAILING_STOP_MARKET, percent e.g. 1 = 1%
  activationPrice?: number; // TRAILING_STOP_MARKET
  timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
  reduceOnly?: boolean;
  closePosition?: boolean;
  positionSide?: PositionSide;
  /** Client-supplied idempotency key. If omitted, one is generated. */
  clientOrderId?: string;
  /** Attach a Take Profit + Stop Loss bracket automatically after a MARKET/LIMIT entry fills. */
  attachStopLoss?: number; // stop price
  attachTakeProfit?: number; // stop price
  market?: BinanceMarket;
}

export interface OrderResult {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: string;
  status: string;
  price: number;
  origQty: number;
  executedQty: number;
  avgPrice: number;
  reduceOnly: boolean;
  attachedOrders?: OrderResult[];
}

export interface RiskCalculationInput {
  symbol: string;
  entryPrice: number;
  stopPrice: number;
  side: "LONG" | "SHORT";
  accountEquity: number;
  riskPercent: number;
  leverage: number;
}

export interface RiskCalculationResult {
  ok: boolean;
  reason?: string;
  quantity: number;
  notional: number;
  marginRequired: number;
  maxLossUsd: number;
  maxLossPercent: number;
  riskRewardHint?: number;
  liquidationPrice?: number;
  distanceToLiquidationPct?: number;
}

export interface BinanceApiError {
  code: number;
  msg: string;
}

export class BinanceRequestError extends Error {
  code: number;
  status: number;
  constructor(message: string, code: number, status: number) {
    super(message);
    this.name = "BinanceRequestError";
    this.code = code;
    this.status = status;
  }
}
