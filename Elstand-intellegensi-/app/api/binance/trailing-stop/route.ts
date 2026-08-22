import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { setTrailingStop } from "@/lib/binance/tradingEngine";
import { withRouteErrorHandling, badRequest, requireFuturesMarket } from "@/lib/binance/routeHelpers";

interface TrailingStopBody {
  symbol?: string;
  callbackRate?: number; // percent, e.g. 1.5 = 1.5%
  activationPrice?: number;
}

export async function POST(req: Request) {
  return withRouteErrorHandling("trailing-stop", async () => {
    const body = (await req.json().catch(() => null)) as TrailingStopBody | null;
    if (!body?.symbol) return badRequest("symbol wajib diisi.");
    if (!body.callbackRate) return badRequest("callbackRate (%) wajib diisi.");

    const cfg = await resolveBinanceConfig();
    const guard = requireFuturesMarket(cfg);
    if (guard) return guard;
    const result = await setTrailingStop(body.symbol.toUpperCase(), body.callbackRate, body.activationPrice, cfg);
    if (!result.ok) return badRequest(result.reason ?? "Gagal memasang Trailing Stop.");
    return result;
  });
}
