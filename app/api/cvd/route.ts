import { NextResponse } from "next/server";
import { getCvdSeries } from "@/lib/binance";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const interval = searchParams.get("interval") ?? "5m";
  const limit = Math.min(200, Math.max(20, Number(searchParams.get("limit") ?? 100)));
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const series = await getCvdSeries(symbol, interval, limit);
    return NextResponse.json({ series });
  } catch (err) {
    console.error("[ElVoid AI] cvd error:", err);
    return NextResponse.json({ error: "Gagal menghitung CVD dari Binance." }, { status: 502 });
  }
}
