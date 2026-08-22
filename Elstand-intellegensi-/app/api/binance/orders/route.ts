import { resolveBinanceConfig } from "@/lib/binance/credentials";
import * as futures from "@/lib/binance/futuresClient";
import * as spot from "@/lib/binance/spotClient";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

export async function GET(req: Request) {
  return withRouteErrorHandling("orders", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase() || undefined;
    const status = searchParams.get("status") ?? "open"; // "open" | "history"
    const limit = Math.min(500, Number(searchParams.get("limit") ?? 100) || 100);

    const cfg = await resolveBinanceConfig();
    const client = cfg.market === "spot" ? spot : futures;

    if (status === "history") {
      if (!symbol) return badRequest("symbol wajib diisi untuk order history.");
      const orders = await client.getOrderHistory(cfg, symbol, limit);
      return { orders, status: "history", market: cfg.market };
    }
    const orders = await client.getOpenOrders(cfg, symbol);
    return { orders, status: "open", market: cfg.market };
  });
}
