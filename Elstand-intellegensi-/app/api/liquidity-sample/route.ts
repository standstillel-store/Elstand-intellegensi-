import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";
import { persistLiquiditySnapshotThrottled, type LiquiditySnapshotLevel } from "@/lib/marketHistory/store";

// Receives a real, client-sampled order-book snapshot from the shared
// Binance depth WebSocket (lib/elvoid/depthStream.ts + useLiveLiquiditySnapshots)
// and opportunistically persists it. This replaces the old
// /api/orderbook-depth-triggered persistence: that only fired when the
// REST-polling Live Book tab was open, so collection stopped whenever
// nobody had that specific tab open. This route is called by ANY mounted
// consumer of the live depth stream (Order Book panel OR either heatmap
// sub-mode), roughly every 12s per active client — genuinely decoupling
// historical collection from which tab a user happens to be looking at.
//
// Still routes through persistLiquiditySnapshotThrottled, which enforces
// its own 5-minute-per-symbol DB write spacing (storage budget guard) —
// this endpoint can be hit far more often than that without growing the
// table any faster; extra calls within the window are free no-ops.
export async function POST(req: Request) {
  return withRouteErrorHandling("liquidity-sample", async () => {
    const body = (await req.json().catch(() => null)) as { symbol?: string; timestamp?: number; levels?: LiquiditySnapshotLevel[] } | null;
    if (!body?.symbol || !Array.isArray(body.levels) || body.levels.length === 0) {
      return badRequest("symbol dan levels wajib diisi.");
    }
    const timestamp = typeof body.timestamp === "number" && body.timestamp > 0 ? body.timestamp : Date.now();
    await persistLiquiditySnapshotThrottled(body.symbol.toUpperCase().trim(), timestamp, body.levels);
    return { ok: true };
  });
}
