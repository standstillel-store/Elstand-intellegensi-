import { NextResponse } from "next/server";
import { getTopMarkets, getGlobal } from "@/lib/coingecko";

export async function GET() {
  try {
    const [markets, global] = await Promise.all([getTopMarkets(150), getGlobal()]);
    return NextResponse.json({ markets, global });
  } catch {
    return NextResponse.json({ error: "market_fetch_failed" }, { status: 502 });
  }
}
