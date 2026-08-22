import { NextResponse } from "next/server";
import { BinanceRequestError } from "./types";

// ---------------------------------------------------------------------------
// Every app/api/binance/* route follows the same shape: try the handler,
// map BinanceRequestError to its real HTTP status with a safe message, map
// anything else to a generic 500 — and, critically, never let an error
// object's stack/props leak fields that might contain request headers or
// query strings (which could, in principle, carry a redacted-but-still
// sensitive signature). console.error only ever gets `.message`.
// ---------------------------------------------------------------------------

export async function withRouteErrorHandling<T>(label: string, handler: () => Promise<T | NextResponse>): Promise<NextResponse> {
  try {
    const result = await handler();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result as object);
  } catch (err) {
    if (err instanceof BinanceRequestError) {
      console.error(`[ElVoid AI][Binance] ${label}: ${err.message}`);
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui.";
    console.error(`[ElVoid AI][Binance] ${label}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Positions, leverage, liquidation price, and trailing stop only exist on
 * Futures — Spot is balances + plain buy/sell (see tradingEngine.ts's top
 * comment). Routes that are inherently Futures-only call this first so a
 * BINANCE_MARKET=spot deployment gets one clear, honest error instead of a
 * request silently sent to the wrong Binance host (cfg.baseUrl only ever
 * matches ONE market at a time — there's no way to reach Futures endpoints
 * from a Spot-configured connection, and vice versa).
 */
export function requireFuturesMarket(cfg: { market: "spot" | "futures" }): NextResponse | null {
  if (cfg.market !== "futures") {
    return badRequest("Fitur ini (posisi, leverage, liquidation price, trailing stop) hanya tersedia saat BINANCE_MARKET=futures. Server ini sedang terhubung ke Binance Spot.");
  }
  return null;
}
