import { NextResponse } from "next/server";
import { getTopMarkets } from "@/lib/coingecko";
import { evaluateOpenTrades, evaluatePendingOrders } from "@/lib/elvoid/paperTrader";

async function runSync() {
  const markets = await getTopMarkets(200).catch(() => []);
  const priceBySymbol: Record<string, number> = {};
  for (const m of markets) priceBySymbol[m.symbol.toLowerCase()] = m.current_price;
  const [openResult, pendingResult] = await Promise.all([
    evaluateOpenTrades(priceBySymbol),
    evaluatePendingOrders(priceBySymbol),
  ]);
  return { ...openResult, pending: pendingResult };
}

export async function POST() {
  try {
    return NextResponse.json(await runSync());
  } catch (err) {
    console.error("[ElVoid AI] sync error:", err);
    return NextResponse.json({ closed: [], stillOpen: [], pending: { triggered: [], expired: [], stillPending: [] } });
  }
}

export async function GET() {
  try {
    return NextResponse.json(await runSync());
  } catch (err) {
    console.error("[ElVoid AI] sync error:", err);
    return NextResponse.json({ closed: [], stillOpen: [], pending: { triggered: [], expired: [], stillPending: [] } });
  }
}
