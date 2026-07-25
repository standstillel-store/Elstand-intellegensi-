import { getEmergencyStop, setEmergencyStop, logDecision } from "@/lib/binance/db";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

export async function GET() {
  return withRouteErrorHandling("emergency-stop:get", async () => {
    const state = await getEmergencyStop();
    return state;
  });
}

interface EmergencyStopBody {
  stopped?: boolean;
  reason?: string;
}

export async function POST(req: Request) {
  return withRouteErrorHandling("emergency-stop:set", async () => {
    const body = (await req.json().catch(() => null)) as EmergencyStopBody | null;
    if (body?.stopped === undefined) return badRequest("stopped (boolean) wajib diisi.");

    await setEmergencyStop(body.stopped, body.reason);
    await logDecision({
      action: body.stopped ? "emergency_stop_engaged" : "emergency_stop_cleared",
      detail: body.stopped ? `Emergency Stop diaktifkan: ${body.reason ?? "Tidak ada alasan diberikan."}` : "Emergency Stop dinonaktifkan — entry baru diizinkan lagi.",
    });
    return await getEmergencyStop();
  });
}
