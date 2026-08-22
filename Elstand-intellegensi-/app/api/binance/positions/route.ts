import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { getPositions } from "@/lib/binance/futuresClient";
import { getAllPositionMeta } from "@/lib/binance/db";
import { withRouteErrorHandling, requireFuturesMarket } from "@/lib/binance/routeHelpers";
import type { PositionInfo } from "@/lib/binance/types";
import type { PositionMeta } from "@/lib/binance/db";

export async function GET(req: Request) {
  return withRouteErrorHandling("positions", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase() || undefined;
    const cfg = await resolveBinanceConfig();
    const guard = requireFuturesMarket(cfg);
    if (guard) return guard;
    const [positions, metaRows]: [PositionInfo[], PositionMeta[]] = await Promise.all([getPositions(cfg, symbol), getAllPositionMeta()]);
    const metaBySymbol = new Map(metaRows.map((m) => [m.symbol, m]));
    return {
      positions: positions.map((p) => ({ ...p, meta: metaBySymbol.get(p.symbol) ?? null })),
      count: positions.length,
    };
  });
}
