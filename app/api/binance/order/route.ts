import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { placeStandaloneOrder, openPosition, cancelOrder } from "@/lib/binance/tradingEngine";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";
import type { EngineOrderType, OrderSide, PositionSide, BinanceMarket } from "@/lib/binance/types";

const VALID_TYPES: EngineOrderType[] = ["MARKET", "LIMIT", "STOP", "STOP_MARKET", "TAKE_PROFIT", "TAKE_PROFIT_MARKET", "TRAILING_STOP_MARKET"];

interface OrderRequestBody {
  symbol?: string;
  market?: BinanceMarket;
  // Two ways to open exposure:
  //  - direction ("LONG"/"SHORT") + type MARKET/LIMIT -> goes through openPosition
  //    (attaches Stop Loss / Take Profit brackets automatically when provided).
  //  - side ("BUY"/"SELL") + any type -> goes through placeStandaloneOrder
  //    (a single order — used for standalone conditional orders, adding a
  //    protective order to an existing position, or reduceOnly/closePosition actions).
  direction?: "LONG" | "SHORT";
  side?: OrderSide;
  positionSide?: PositionSide;
  type?: EngineOrderType;
  quantity?: number;
  riskPercent?: number;
  price?: number;
  stopPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  takeProfit2?: number;
  takeProfitPercent?: number;
  leverage?: number;
  marginType?: "ISOLATED" | "CROSSED";
  callbackRate?: number;
  activationPrice?: number;
  reduceOnly?: boolean;
  closePosition?: boolean;
}

export async function POST(req: Request) {
  return withRouteErrorHandling("order:create", async () => {
    const body = (await req.json().catch(() => null)) as OrderRequestBody | null;
    if (!body?.symbol) return badRequest("symbol wajib diisi.");
    if (!body.type || !VALID_TYPES.includes(body.type)) return badRequest(`type wajib salah satu dari: ${VALID_TYPES.join(", ")}.`);

    const cfg = await resolveBinanceConfig();
    const symbol = body.symbol.toUpperCase();

    // Entry path: direction + Market/Limit -> full open-position flow with SL/TP bracket.
    // openPosition() is unconditionally a Futures operation (see tradingEngine.ts) — it
    // uses whatever cfg.baseUrl the server is configured with, so a client-supplied
    // `market` can never override that; the account's own configured market decides.
    if (body.direction && (body.type === "MARKET" || body.type === "LIMIT")) {
      if (cfg.market !== "futures") {
        return badRequest("Open Long/Open Short (posisi + leverage) hanya tersedia saat BINANCE_MARKET=futures. Gunakan side (BUY/SELL) untuk order Spot biasa.");
      }
      const result = await openPosition(
        {
          symbol,
          direction: body.direction,
          orderType: body.type,
          limitPrice: body.price,
          quantity: body.quantity,
          riskPercent: body.riskPercent,
          stopLoss: body.stopLoss,
          takeProfit: body.takeProfit,
          takeProfit2: body.takeProfit2,
          takeProfitPercent: body.takeProfitPercent,
          leverage: body.leverage,
          marginType: body.marginType,
          source: "manual",
        },
        cfg
      );
      if (!result.ok) return badRequest(result.reason ?? "Gagal membuka posisi.");
      return result;
    }

    // Standalone order path: explicit side + any order type (protective orders, spot buy/sell, trailing stop, etc.)
    if (!body.side) return badRequest("Berikan direction (LONG/SHORT untuk entry) atau side (BUY/SELL untuk order langsung).");
    const result = await placeStandaloneOrder(
      {
        symbol,
        side: body.side,
        type: body.type,
        quantity: body.quantity,
        riskPercent: body.riskPercent,
        price: body.price,
        stopPrice: body.stopPrice,
        callbackRate: body.callbackRate,
        activationPrice: body.activationPrice,
        reduceOnly: body.reduceOnly,
        closePosition: body.closePosition,
        positionSide: body.positionSide,
        market: body.market,
      },
      cfg
    );
    if (!result.ok) return badRequest(result.reason ?? "Gagal mengirim order.");
    return result;
  });
}

export async function DELETE(req: Request) {
  return withRouteErrorHandling("order:cancel", async () => {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const orderIdRaw = searchParams.get("orderId");
    const clientOrderId = searchParams.get("clientOrderId") ?? undefined;
    if (!symbol) return badRequest("symbol wajib diisi.");
    if (!orderIdRaw && !clientOrderId) return badRequest("orderId atau clientOrderId wajib diisi.");

    const cfg = await resolveBinanceConfig();
    const result = await cancelOrder(symbol, orderIdRaw ? Number(orderIdRaw) : undefined, clientOrderId, cfg);
    if (!result.ok) return badRequest(result.reason ?? "Gagal membatalkan order.");
    return result;
  });
}
