import { NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";
import { buildPriceProfile } from "@/lib/elvoid/marketProfile";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const interval = searchParams.get("interval") ?? "30m";
  const limit = Math.min(300, Math.max(20, Number(searchParams.get("limit") ?? 48))); // ~1 session at 30m
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const candles = await getKlines(symbol, interval, limit);
    const profile = buildPriceProfile(candles, "time", 24, 0.7);
    return NextResponse.json({ profile, sessionCandles: candles.length });
  } catch (err) {
    console.error("[ElVoid AI] tpo error:", err);
    return NextResponse.json({ error: "Gagal membangun TPO profile." }, { status: 502 });
  }
}
