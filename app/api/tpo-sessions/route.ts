import { NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";
import { buildTpoSessions } from "@/lib/elvoid/tpo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const days = Math.min(10, Math.max(1, Number(searchParams.get("days") ?? 6)));
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    // 30m periods, standard TPO granularity — up to 48 periods/day.
    const candles = await getKlines(symbol, "30m", Math.min(300, days * 48 + 10));
    const sessions = buildTpoSessions(candles, 26);
    return NextResponse.json({ sessions: sessions.slice(-days) });
  } catch (err) {
    console.error("[ElVoid AI] tpo-sessions error:", err);
    return NextResponse.json({ error: "Gagal membangun TPO sessions." }, { status: 502 });
  }
}
