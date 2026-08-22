import { NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";
import { buildPriceProfile } from "@/lib/elvoid/marketProfile";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const interval = searchParams.get("interval") ?? "5m";
  const limit = Math.min(300, Math.max(20, Number(searchParams.get("limit") ?? 200)));
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const candles = await getKlines(symbol, interval, limit);
    const profile = buildPriceProfile(candles, "volume", 28, 0.7);
    return NextResponse.json({ profile });
  } catch (err) {
    console.error("[ElVoid AI] volume-profile error:", err);
    return NextResponse.json({ error: "Gagal membangun Volume Profile." }, { status: 502 });
  }
}
