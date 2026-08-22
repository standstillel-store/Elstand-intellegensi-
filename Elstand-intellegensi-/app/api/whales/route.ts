import { NextResponse } from "next/server";
import { getWhaleTransfers } from "@/lib/alchemy";
import { getTopMarkets } from "@/lib/coingecko";

export async function GET() {
  try {
    const markets = await getTopMarkets(150);
    const priceBySymbol: Record<string, number> = {};
    for (const m of markets) priceBySymbol[m.symbol.toLowerCase()] = m.current_price;
    const transfers = await getWhaleTransfers(priceBySymbol);
    return NextResponse.json({ transfers });
  } catch {
    return NextResponse.json({ transfers: [] });
  }
}
