import { NextResponse } from "next/server";
import { getMembershipStatus } from "@/lib/membership";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";
import { getFuturesIntelligenceSummary } from "@/lib/intelligence/premiumFuturesIntelligence";
import { SUPPORTED_PAIRS, type SupportedPair } from "@/lib/intelligence/premiumMicrostructure";

// ELSTAND PREMIUM only — re-checks membership server-side on every call,
// same rule as /api/premium/microstructure. The ELVOID Oracle route this
// calls into re-checks membership again itself (see
// lib/intelligence/premiumFuturesIntelligence.ts) — that's intentional
// defense-in-depth, not duplicated logic: this route never bypasses it.
export async function GET(req: Request) {
  const status = await getMembershipStatus();
  if (!status.active) {
    return NextResponse.json({ error: "ELSTAND PREMIUM membership required." }, { status: 403 });
  }

  return withRouteErrorHandling("premium-futures-intelligence", async () => {
    const { searchParams } = new URL(req.url);
    const pairParam = (searchParams.get("pair") ?? "BTC").toUpperCase();

    if (!SUPPORTED_PAIRS.includes(pairParam as SupportedPair)) {
      return badRequest(`pair harus salah satu dari: ${SUPPORTED_PAIRS.join(", ")}`);
    }

    return getFuturesIntelligenceSummary(pairParam as SupportedPair);
  });
}
