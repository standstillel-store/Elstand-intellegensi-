import { resolveBinanceConfig } from "@/lib/binance/credentials";
import * as futures from "@/lib/binance/futuresClient";
import * as spot from "@/lib/binance/spotClient";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

export async function GET(req: Request) {
  return withRouteErrorHandling("trades", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const limit = Math.min(1000, Number(searchParams.get("limit") ?? 100) || 100);
    if (!symbol) return badRequest("symbol wajib diisi.");

    const cfg = await resolveBinanceConfig();
    const client = cfg.market === "spot" ? spot : futures;
    const trades = await client.getTradeHistory(cfg, symbol, limit);
    return { trades, symbol, market: cfg.market };
  });
}
