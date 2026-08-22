import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { closeAllPositions } from "@/lib/binance/tradingEngine";
import { setEmergencyStop, logDecision } from "@/lib/binance/db";
import { withRouteErrorHandling } from "@/lib/binance/routeHelpers";

interface CloseAllBody {
  reason?: string;
  /** Also flips the Emergency Stop flag so the AI Auto Trader won't immediately re-open new positions. Defaults to true — the whole point of an emergency button is that it stays stopped until a person clears it. */
  haltAutoTrader?: boolean;
}

export async function POST(req: Request) {
  return withRouteErrorHandling("position:close-all", async () => {
    const body = (await req.json().catch(() => ({}))) as CloseAllBody;
    const reason = body.reason?.trim() || "Emergency Close All Positions (manual trigger)";
    const haltAutoTrader = body.haltAutoTrader ?? true;

    const cfg = await resolveBinanceConfig();
    // Spot has no leveraged positions to close (see tradingEngine.ts) — the kill-switch
    // itself is still meaningful there (it pauses Auto Trading), so this degrades to
    // "nothing to close" rather than a hard error, unlike the other Futures-only routes.
    const result = cfg.market === "futures" ? await closeAllPositions(reason, cfg) : { closed: [], failed: [] };

    if (haltAutoTrader) {
      await setEmergencyStop(true, reason);
    }
    await logDecision({
      action: "emergency_close_all",
      detail:
        cfg.market === "futures"
          ? `Emergency Close All: ${result.closed.length} posisi ditutup, ${result.failed.length} gagal. Alasan: ${reason}`
          : `Emergency Stop diaktifkan (mode Spot — tidak ada posisi leveraged untuk ditutup). Alasan: ${reason}`,
      meta: { closed: result.closed, failed: result.failed },
    });

    return { ...result, emergencyStopSet: haltAutoTrader };
  });
}
