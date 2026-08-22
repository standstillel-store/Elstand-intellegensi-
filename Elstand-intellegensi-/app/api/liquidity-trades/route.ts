import { getRecentTrades } from "@/lib/binance";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

// Real executed trades for the Liquidity Heatmap's order-flow bubble layer
// (spec section 9/11) — reuses the SAME lib/binance.ts getRecentTrades()
// Footprint already uses, but is its own route/consumer: this never calls
// buildFootprintByCandle or touches Footprint's persistence, so Footprint's
// pipeline stays fully independent of the heatmap. No fabricated trades —
// if the upstream aggTrades call fails, this returns an error and the
// heatmap simply renders without the bubble layer rather than inventing
// activity.
//
// Trades are clustered server-side (time-bucket x price-bucket) before
// being sent to the client: aggTrades can return up to 1000 raw prints,
// which would be far more circles than a mobile canvas should draw. Each
// cluster sums real qty and keeps the real dominant side — no synthetic
// volume is added anywhere in this aggregation.
interface TradeCluster {
  time: number;
  price: number;
  qty: number;
  buyQty: number;
  sellQty: number;
}

const CLUSTER_TIME_MS = 3000; // 3s time buckets — dense enough for a visible trail, coarse enough to keep cluster count low
const MAX_CLUSTERS = 220;

export async function GET(req: Request) {
  return withRouteErrorHandling("liquidity-trades", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const limit = Math.min(1000, Number(searchParams.get("limit") ?? 1000) || 1000);
    if (!symbol) return badRequest("symbol wajib diisi.");

    const trades = await getRecentTrades(symbol, limit);
    if (trades.length === 0) return { clusters: [] };

    // Adaptive price bucket: ~0.02% of current price, so clustering stays
    // meaningful across both a $60k BTC and a sub-$1 altcoin.
    const lastPrice = trades[trades.length - 1].price;
    const priceBucket = Math.max(lastPrice * 0.0002, 1e-9);

    const buckets = new Map<string, TradeCluster>();
    for (const t of trades) {
      const timeKey = Math.floor(t.time / CLUSTER_TIME_MS);
      const priceKey = Math.round(t.price / priceBucket);
      const key = `${timeKey}:${priceKey}`;
      const existing = buckets.get(key);
      if (existing) {
        const totalQty = existing.qty + t.qty;
        existing.price = (existing.price * existing.qty + t.price * t.qty) / totalQty;
        existing.qty = totalQty;
        if (t.isSell) existing.sellQty += t.qty;
        else existing.buyQty += t.qty;
      } else {
        buckets.set(key, {
          time: timeKey * CLUSTER_TIME_MS,
          price: t.price,
          qty: t.qty,
          buyQty: t.isSell ? 0 : t.qty,
          sellQty: t.isSell ? t.qty : 0,
        });
      }
    }

    // Keep only the largest clusters if there are still too many — real
    // clusters only, never padded/invented to reach a target count.
    const clusters = Array.from(buckets.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, MAX_CLUSTERS)
      .sort((a, b) => a.time - b.time);

    return { clusters };
  });
}
