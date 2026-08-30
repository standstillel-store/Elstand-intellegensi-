import { NextResponse } from "next/server";
import { getMembershipStatus } from "@/lib/membership";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";
import {
  getPremiumMicrostructure,
  SUPPORTED_PAIRS,
  type SupportedPair,
  type MicrostructurePeriod,
} from "@/lib/intelligence/premiumMicrostructure";

const PERIODS: MicrostructurePeriod[] = ["1D", "7D", "1M"];

// ELSTAND PREMIUM only — re-checks membership server-side on every call.
// Never trusts a client-submitted entitlement; same rule as every other
// premium surface (see lib/membership.ts).
export async function GET(req: Request) {
  const status = await getMembershipStatus();
  if (!status.active) {
    return NextResponse.json({ error: "ELSTAND PREMIUM membership required." }, { status: 403 });
  }

  return withRouteErrorHandling("premium-microstructure", async () => {
    const { searchParams } = new URL(req.url);
    const pairParam = (searchParams.get("pair") ?? "BTC").toUpperCase();
    const periodParam = (searchParams.get("period") ?? "7D").toUpperCase();

    if (!SUPPORTED_PAIRS.includes(pairParam as SupportedPair)) {
      return badRequest(`pair harus salah satu dari: ${SUPPORTED_PAIRS.join(", ")}`);
    }
    if (!PERIODS.includes(periodParam as MicrostructurePeriod)) {
      return badRequest(`period harus salah satu dari: ${PERIODS.join(", ")}`);
    }

    return getPremiumMicrostructure(pairParam as SupportedPair, periodParam as MicrostructurePeriod);
  });
}
