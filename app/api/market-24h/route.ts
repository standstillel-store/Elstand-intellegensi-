import { NextResponse } from "next/server";
import { get24hTicker } from "@/lib/binance";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const ticker = await get24hTicker(symbol);
    return NextResponse.json({ ticker });
  } catch (err) {
    console.error("[ElVoid AI] market-24h error:", err);
    return NextResponse.json({ error: "Gagal mengambil data 24hr dari Binance." }, { status: 502 });
  }
}
