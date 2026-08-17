import { NextResponse } from "next/server";
import { loadStoredLiquiditySnapshots } from "@/lib/marketHistory/store";
import { getLiquidityHistoryMs } from "@/lib/market-data/liquidityHistory";

// Serves REAL, previously-persisted order-book snapshots (see
// persistLiquiditySnapshotThrottled in orderbook-depth/route.ts for how
// they're captured going forward). This is deliberately a separate,
// honestly-named source from the volume-derived proxy the client also has
// available — never blended silently, see spec section G.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const interval = searchParams.get("interval") ?? "1h";
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const windowMs = getLiquidityHistoryMs(interval);
    const sinceMs = Date.now() - windowMs;
    const snapshots = await loadStoredLiquiditySnapshots(symbol, sinceMs);
    return NextResponse.json({ snapshots, windowMs, sinceMs });
  } catch (err) {
    console.error("[ElVoid AI] liquidity-history error:", err);
    return NextResponse.json({ error: "Gagal memuat riwayat liquidity." }, { status: 502 });
  }
}
