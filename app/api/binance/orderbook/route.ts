import { getBinanceConfig } from "@/lib/binance/config";
import { getOrderBook } from "@/lib/binance/marketData";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

export async function GET(req: Request) {
  return withRouteErrorHandling("orderbook", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const limit = Math.min(500, Number(searchParams.get("limit") ?? 50) || 50);
    if (!symbol) return badRequest("symbol wajib diisi.");

    const book = await getOrderBook(symbol, limit, getBinanceConfig());
    return { symbol, ...book };
  });
}
