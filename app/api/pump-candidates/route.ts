import { NextResponse } from "next/server";
import { getTopMarkets } from "@/lib/coingecko";
import { getTrendingPools } from "@/lib/geckoterminal";
import { getFundingSnapshot } from "@/lib/binance";
import { getWhaleTransfers } from "@/lib/alchemy";
import { buildPumpCandidates } from "@/lib/scoring";

export async function GET() {
  try {
    const markets = await getTopMarkets(150);
    const priceBySymbol: Record<string, number> = {};
    for (const m of markets) priceBySymbol[m.symbol.toLowerCase()] = m.current_price;

    const [pools, funding, whales] = await Promise.all([
      getTrendingPools(),
      getFundingSnapshot().catch(() => []),
      getWhaleTransfers(priceBySymbol).catch(() => []),
    ]);

    const candidates = buildPumpCandidates(markets, pools, funding, whales);
    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json({ candidates: [], error: "pump_scoring_failed" }, { status: 502 });
  }
}
