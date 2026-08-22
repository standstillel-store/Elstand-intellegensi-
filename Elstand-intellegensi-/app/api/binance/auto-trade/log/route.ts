import { getRecentDecisions } from "@/lib/binance/db";
import { withRouteErrorHandling } from "@/lib/binance/routeHelpers";

export async function GET(req: Request) {
  return withRouteErrorHandling("auto-trade:log", async () => {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(300, Number(searchParams.get("limit") ?? 100) || 100);
    const decisions = await getRecentDecisions(limit);
    return { decisions };
  });
}
