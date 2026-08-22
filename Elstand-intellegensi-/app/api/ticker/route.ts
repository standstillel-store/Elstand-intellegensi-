import { NextResponse } from "next/server";
import { getTopMarkets } from "@/lib/coingecko";

export const revalidate = 60;

const TICKER_SYMBOLS = ["BTC", "ETH", "SOL"];

export async function GET() {
  try {
    const markets = await getTopMarkets(150);
    const ticker = TICKER_SYMBOLS.map((sym) => {
      const m = markets.find((x) => x.symbol.toUpperCase() === sym);
      return {
        symbol: sym,
        price: m?.current_price ?? null,
        change24h: m?.price_change_percentage_24h_in_currency ?? null,
      };
    });
    return NextResponse.json({ ticker });
  } catch {
    return NextResponse.json({ ticker: TICKER_SYMBOLS.map((symbol) => ({ symbol, price: null, change24h: null })) });
  }
}
