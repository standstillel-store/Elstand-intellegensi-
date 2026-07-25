import { getBinanceConfig } from "@/lib/binance/config";
import { getKlines, isValidInterval } from "@/lib/binance/marketData";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

export async function GET(req: Request) {
  return withRouteErrorHandling("klines", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const interval = searchParams.get("interval") ?? "15m";
    const limit = Math.min(1500, Number(searchParams.get("limit") ?? 300) || 300);
    if (!symbol) return badRequest("symbol wajib diisi.");
    if (!isValidInterval(interval)) return badRequest(`interval tidak valid: ${interval}`);

    const candles = await getKlines(symbol, interval, limit, getBinanceConfig());
    return { symbol, interval, candles };
  });
}
