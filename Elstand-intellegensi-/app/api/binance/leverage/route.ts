import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { setLeverage, setMarginType } from "@/lib/binance/futuresClient";
import { withRouteErrorHandling, badRequest, requireFuturesMarket } from "@/lib/binance/routeHelpers";

interface LeverageBody {
  symbol?: string;
  leverage?: number;
  marginType?: "ISOLATED" | "CROSSED";
}

export async function POST(req: Request) {
  return withRouteErrorHandling("leverage", async () => {
    const body = (await req.json().catch(() => null)) as LeverageBody | null;
    if (!body?.symbol) return badRequest("symbol wajib diisi.");
    if (!body.leverage || body.leverage < 1 || body.leverage > 125) return badRequest("leverage wajib antara 1 dan 125.");

    const cfg = await resolveBinanceConfig();
    const guard = requireFuturesMarket(cfg);
    if (guard) return guard;
    const symbol = body.symbol.toUpperCase();
    if (body.marginType) {
      await setMarginType(symbol, body.marginType, cfg);
    }
    const leverage = await setLeverage(symbol, body.leverage, cfg);
    return { symbol, leverage, marginType: body.marginType ?? null };
  });
}
