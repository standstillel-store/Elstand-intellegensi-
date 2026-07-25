import { NextResponse } from "next/server";
import { buildScanContext, buildSignalForSymbol } from "@/lib/elvoid/service";

const VALID_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase().trim();
  const timeframe = searchParams.get("timeframe") ?? "4h";

  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });
  if (!VALID_INTERVALS.includes(timeframe)) {
    return NextResponse.json({ error: `timeframe harus salah satu dari: ${VALID_INTERVALS.join(", ")}.` }, { status: 400 });
  }

  try {
    const ctx = await buildScanContext();
    const signal = await buildSignalForSymbol(symbol, ctx, timeframe);
    if (!signal) {
      return NextResponse.json({
        signal: null,
        message: `Belum cukup data candle Binance untuk ${symbol} pada timeframe ${timeframe}, atau pair ${symbol}USDT tidak tersedia di Binance Futures.`,
      });
    }
    return NextResponse.json({ signal });
  } catch (err) {
    console.error("[ElVoid AI] analyze-chart error:", err);
    return NextResponse.json({ error: "Analisa gagal — coba lagi sebentar." }, { status: 500 });
  }
}
