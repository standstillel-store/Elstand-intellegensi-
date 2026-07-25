import { getBinanceConfig } from "@/lib/binance/config";
import { getTickerPrice } from "@/lib/binance/marketData";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

export async function GET(req: Request) {
  return withRouteErrorHandling("price", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();
    if (!symbol) return badRequest("symbol wajib diisi.");
    // Price is a public endpoint — no signed credentials needed, so this
    // reads straight from env config rather than resolveBinanceConfig().
    const ticker = await getTickerPrice(symbol, getBinanceConfig());
    return ticker;
  });
}
