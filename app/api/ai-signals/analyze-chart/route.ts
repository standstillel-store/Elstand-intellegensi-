import { NextResponse } from "next/server";
import { buildScanContext, buildSignalForSymbol } from "@/lib/elvoid/service";
import { reserveEnergy, settleEnergy } from "@/lib/energyGate";

const VALID_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

// Phase 3.2: gated as "Load Chart" (-4 AI Energy). Reserved after input
// validation (a missing symbol/bad timeframe isn't a real attempt to use
// the feature) and before the actual chart-analysis work. A "not enough
// candle data" result still counts as a successful use (the engine ran and
// gave a real answer) and is charged, same principle as token-analysis;
// only a thrown exception is refunded. Anonymous/no-Supabase requests stay
// unmetered, not blocked.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase().trim();
  const timeframe = searchParams.get("timeframe") ?? "4h";

  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });
  if (!VALID_INTERVALS.includes(timeframe)) {
    return NextResponse.json({ error: `timeframe harus salah satu dari: ${VALID_INTERVALS.join(", ")}.` }, { status: 400 });
  }

  const gate = await reserveEnergy("load_chart");
  if (!gate.ok) return gate.response;

  try {
    const ctx = await buildScanContext();
    const signal = await buildSignalForSymbol(symbol, ctx, timeframe);
    if (!signal) {
      if (gate.reservation) await settleEnergy(gate.reservation, true);
      return NextResponse.json({
        signal: null,
        message: `Belum cukup data candle Binance untuk ${symbol} pada timeframe ${timeframe}, atau pair ${symbol}USDT tidak tersedia di Binance Futures.`,
      });
    }
    if (gate.reservation) await settleEnergy(gate.reservation, true);
    return NextResponse.json({ signal });
  } catch (err) {
    console.error("[ElVoid AI] analyze-chart error:", err);
    if (gate.reservation) await settleEnergy(gate.reservation, false);
    return NextResponse.json({ error: "Analisa gagal — coba lagi sebentar." }, { status: 500 });
  }
}
