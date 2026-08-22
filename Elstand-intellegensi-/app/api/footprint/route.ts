import { NextResponse } from "next/server";
import { getRecentTrades } from "@/lib/binance";
import { buildFootprintLadder } from "@/lib/elvoid/footprint";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const trades = await getRecentTrades(symbol, 1000);
    const ladder = buildFootprintLadder(trades, 20);
    return NextResponse.json({ ladder, tradeCount: trades.length });
  } catch (err) {
    console.error("[ElVoid AI] footprint error:", err);
    return NextResponse.json({ error: "Gagal membangun Footprint dari Binance." }, { status: 502 });
  }
}
