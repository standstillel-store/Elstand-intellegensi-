import { getRsiHeatmapForSymbols, RSI_HEATMAP_DEFAULT_INTERVAL } from "@/lib/intelligence/rsiHeatmap";
import { isValidInterval } from "@/lib/binance/marketData";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

// Re-scans an already-chosen symbol universe at a different candle
// interval — used only by the RSI Heatmap's timeframe buttons, so the
// client doesn't have to redo the CoinGecko universe selection that
// app/dashboard/page.tsx already did for the initial render.
export async function GET(req: Request) {
  return withRouteErrorHandling("rsi-heatmap", async () => {
    const { searchParams } = new URL(req.url);
    const interval = searchParams.get("interval") ?? RSI_HEATMAP_DEFAULT_INTERVAL;
    const symbols = (searchParams.get("symbols") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!isValidInterval(interval)) return badRequest(`interval tidak valid: ${interval}`);
    if (!symbols.length) return badRequest("symbols wajib diisi.");

    return getRsiHeatmapForSymbols(symbols, interval);
  });
}
