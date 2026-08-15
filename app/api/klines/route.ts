import { NextResponse } from "next/server";
import { getKlines, getKlinesRange } from "@/lib/binance";

const VALID_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase().trim();
  const interval = searchParams.get("interval") ?? "4h";
  const days = searchParams.get("days") ? Math.min(30, Math.max(1, Number(searchParams.get("days")))) : null;
  const limit = Math.min(1500, Number(searchParams.get("limit") ?? 300) || 300);

  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });
  if (!VALID_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: `interval harus salah satu dari: ${VALID_INTERVALS.join(", ")}.` }, { status: 400 });
  }

  try {
    const candles = days !== null ? await getKlinesRange(symbol, interval, days) : await getKlines(symbol, interval, limit);
    return NextResponse.json({ symbol, interval, candles });
  } catch (err) {
    console.error("[ElVoid AI] klines error:", err);
    return NextResponse.json({ error: "Gagal mengambil data candle dari Binance." }, { status: 502 });
  }
}
