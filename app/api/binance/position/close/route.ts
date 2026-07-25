import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { closePosition } from "@/lib/binance/tradingEngine";
import { withRouteErrorHandling, badRequest, requireFuturesMarket } from "@/lib/binance/routeHelpers";

interface ClosePositionBody {
  symbol?: string;
  percent?: number;
}

export async function POST(req: Request) {
  return withRouteErrorHandling("position:close", async () => {
    const body = (await req.json().catch(() => null)) as ClosePositionBody | null;
    if (!body?.symbol) return badRequest("symbol wajib diisi.");

    const cfg = await resolveBinanceConfig();
    const guard = requireFuturesMarket(cfg);
    if (guard) return guard;
    const result = await closePosition(body.symbol.toUpperCase(), { percent: body.percent, source: "manual" }, cfg);
    if (!result.ok) return badRequest(result.reason ?? "Gagal menutup posisi.");
    return result;
  });
}
