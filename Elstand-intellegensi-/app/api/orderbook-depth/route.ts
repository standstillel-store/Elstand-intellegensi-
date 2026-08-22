import { getOrderBookDepth } from "@/lib/binance";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";
import { persistLiquiditySnapshotThrottled, type LiquiditySnapshotLevel } from "@/lib/marketHistory/store";

// Public order-book depth for the dashboard's live-polling Order Book
// panel. Deliberately separate from /api/binance/orderbook, which reads
// through the authenticated per-user Binance config used by the trading
// UI — this one is public market data, no account or API key needed.
export async function GET(req: Request) {
  return withRouteErrorHandling("orderbook-depth", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") ?? "BTC";
    const limit = Math.min(50, Number(searchParams.get("limit") ?? 20) || 20);
    if (!symbol) return badRequest("symbol wajib diisi.");
    const depth = await getOrderBookDepth(symbol, limit);

    // Opportunistic, throttled persistence of a real order-book snapshot —
    // see persistLiquiditySnapshotThrottled for the DB-level throttle that
    // makes this safe to attempt on every call. Awaited (not fire-and-
    // forget) for the same reason footprint persistence is awaited: a
    // serverless function can freeze right after the response is sent.
    // Never blocks/fails the actual response — errors are swallowed inside
    // the store function itself.
    const levels: LiquiditySnapshotLevel[] = [
      ...depth.bids.map((b) => ({ price: b.price, bidLiquidity: b.qty, askLiquidity: 0, totalLiquidity: b.qty })),
      ...depth.asks.map((a) => ({ price: a.price, bidLiquidity: 0, askLiquidity: a.qty, totalLiquidity: a.qty })),
    ];
    await persistLiquiditySnapshotThrottled(symbol.toUpperCase().trim(), Date.now(), levels);

    return depth;
  });
}
