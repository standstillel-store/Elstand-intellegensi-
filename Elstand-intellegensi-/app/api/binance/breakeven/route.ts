import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { moveStopToBreakeven } from "@/lib/binance/tradingEngine";
import { withRouteErrorHandling, badRequest, requireFuturesMarket } from "@/lib/binance/routeHelpers";

interface BreakevenBody {
  symbol?: string;
}

export async function POST(req: Request) {
  return withRouteErrorHandling("breakeven", async () => {
    const body = (await req.json().catch(() => null)) as BreakevenBody | null;
    if (!body?.symbol) return badRequest("symbol wajib diisi.");

    const cfg = await resolveBinanceConfig();
    const guard = requireFuturesMarket(cfg);
    if (guard) return guard;
    const result = await moveStopToBreakeven(body.symbol.toUpperCase(), cfg);
    if (!result.ok) return badRequest(result.reason ?? "Gagal memindahkan SL ke breakeven.");
    return result;
  });
}
