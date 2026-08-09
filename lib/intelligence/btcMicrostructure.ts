import { getOrderBookDepth, getOpenInterestHistory } from "@/lib/binance";
import type { FundingInfo, OrderBookSnapshot } from "@/lib/types";

/**
 * BTC-only order-flow/funding snapshot for the dashboard's microstructure
 * row. Reuses the funding + spot price the page already fetched (no
 * duplicate call) and adds two more public, no-key-needed Binance reads:
 * order-book depth and OI history. Every derived figure (spread, basis, OI
 * change) is computed from those real reads — nothing here is simulated.
 */
export interface BtcMicrostructure {
  orderbook?: OrderBookSnapshot;
  spread?: number;
  spreadPercent?: number;
  midPrice?: number;
  bidVolume?: number;
  askVolume?: number;
  fundingRate?: number;
  fundingRateAnnualized?: number;
  markPrice?: number;
  basis?: number;
  basisPercent?: number;
  openInterestValue?: number;
  openInterestChangePercent?: number;
  connected: {
    orderbook: boolean;
    funding: boolean;
    oiHistory: boolean;
  };
}

export async function getBtcMicrostructure(
  btcFunding: FundingInfo | undefined,
  btcSpotPrice: number | undefined
): Promise<BtcMicrostructure> {
  const [orderbook, oiHistory] = await Promise.all([
    getOrderBookDepth("BTC", 20).catch(() => undefined),
    getOpenInterestHistory("BTC", "1h", 2).catch(() => undefined),
  ]);

  const result: BtcMicrostructure = {
    orderbook,
    connected: {
      orderbook: Boolean(orderbook?.bids.length && orderbook.asks.length),
      funding: Boolean(btcFunding),
      oiHistory: Boolean(oiHistory && oiHistory.length >= 2),
    },
  };

  if (result.connected.orderbook && orderbook) {
    const bestBid = orderbook.bids[0].price;
    const bestAsk = orderbook.asks[0].price;
    result.midPrice = (bestBid + bestAsk) / 2;
    result.spread = bestAsk - bestBid;
    result.spreadPercent = result.midPrice ? (result.spread / result.midPrice) * 100 : undefined;
    result.bidVolume = orderbook.bids.reduce((s, l) => s + l.qty, 0);
    result.askVolume = orderbook.asks.reduce((s, l) => s + l.qty, 0);
  }

  if (btcFunding) {
    result.fundingRate = btcFunding.lastFundingRate;
    // Binance BTC funding settles 3x/day — the usual "if this rate held for
    // a year" convention for comparing across assets/periods.
    result.fundingRateAnnualized = btcFunding.lastFundingRate * 3 * 365;
    result.markPrice = btcFunding.markPrice;
    result.openInterestValue = btcFunding.openInterestValue;
    if (btcSpotPrice && btcFunding.markPrice) {
      result.basis = btcFunding.markPrice - btcSpotPrice;
      result.basisPercent = (result.basis / btcSpotPrice) * 100;
    }
  }

  if (result.connected.oiHistory && oiHistory) {
    const first = oiHistory[0].openInterestValue;
    const last = oiHistory[oiHistory.length - 1].openInterestValue;
    if (first > 0) result.openInterestChangePercent = ((last - first) / first) * 100;
  }

  return result;
}
