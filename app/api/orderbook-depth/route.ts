import { getOrderBookDepth } from "@/lib/binance";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

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
    return getOrderBookDepth(symbol, limit);
  });
}
