import { NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";
import { getSymbolFilters } from "@/lib/binance/futuresClient";
import { buildTpoSessions, TPO_BLOCK_SIZES_MS, TPO_PROFILE_PERIODS_MS } from "@/lib/elvoid/tpo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const days = Math.min(10, Math.max(1, Number(searchParams.get("days") ?? 6)));
  const blockSize = searchParams.get("blockSize") ?? "30m";
  const period = searchParams.get("period") ?? "1D";
  const valueAreaPct = Math.min(0.95, Math.max(0.1, Number(searchParams.get("va") ?? 70) / 100));
  const ibrBlocks = Math.min(12, Math.max(1, Number(searchParams.get("ibrBlocks") ?? 2)));
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  const blockMs = TPO_BLOCK_SIZES_MS[blockSize] ?? TPO_BLOCK_SIZES_MS["30m"];
  const sessionMs = TPO_PROFILE_PERIODS_MS[period] ?? TPO_PROFILE_PERIODS_MS["1D"];

  try {
    // Fetch source candles at (or finer than) the requested block size so
    // blocks are built from real traversal, not guessed. Binance klines
    // don't offer every arbitrary block size directly, so we pick the
    // closest available interval at or below blockSize and re-bucket.
    const sourceInterval = blockSize === "5m" || blockSize === "10m" ? "5m" : blockSize === "15m" ? "15m" : "30m";
    const blocksNeeded = Math.ceil((days * sessionMs) / blockMs) + 4;
    const sourceCandlesNeeded = Math.min(1000, Math.ceil((blocksNeeded * blockMs) / (sourceInterval === "5m" ? 300_000 : sourceInterval === "15m" ? 900_000 : 1_800_000)) + 10);

    const [candles, filters] = await Promise.all([
      getKlines(symbol, sourceInterval, sourceCandlesNeeded),
      getSymbolFilters(`${symbol}USDT`).catch(() => null),
    ]);

    const sessions = buildTpoSessions(candles, {
      blockMs,
      sessionMs,
      tickSize: filters?.tickSize,
      valueAreaPct,
      ibrBlocks,
    });
    return NextResponse.json({ sessions: sessions.slice(-days), tickSize: filters?.tickSize ?? null });
  } catch (err) {
    console.error("[ElVoid AI] tpo-sessions error:", err);
    return NextResponse.json({ error: "Gagal membangun TPO sessions." }, { status: 502 });
  }
}
