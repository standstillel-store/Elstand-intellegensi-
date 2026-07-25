"use client";
import { useEffect, useState } from "react";
import { TradingChart, type ChartLevels } from "@/components/ai-signal-pro/TradingChart";
import { buildKlineWsUrl } from "@/lib/binance/wsUrl";
import type { Candle } from "@/lib/elvoid/types";
import type { PositionInfo } from "@/lib/binance/types";
import type { PositionMeta } from "@/lib/binance/db";
import type { StatusState } from "@/lib/hooks/useBinanceTrading";

const TIMEFRAMES = ["5m", "15m", "1h", "4h"];

export function LiveTradingChart({ symbol, status, position }: { symbol: string; status: StatusState | null; position: (PositionInfo & { meta: PositionMeta | null }) | undefined }) {
  const [timeframe, setTimeframe] = useState("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/binance/klines?symbol=${symbol}&interval=${timeframe}&limit=300`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        const mapped: Candle[] = (body.candles ?? []).map((k: { openTime: number; open: number; high: number; low: number; close: number; volume: number }) => ({
          time: k.openTime,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          volume: k.volume,
        }));
        setCandles(mapped);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  const wsUrl = status ? buildKlineWsUrl(status.mode, status.market, symbol, timeframe) : undefined;

  const levels: ChartLevels | null =
    position && position.meta
      ? {
          side: position.side,
          entry: position.entryPrice,
          sl: position.meta.initial_stop ?? position.entryPrice,
          tp1: position.meta.tp1 ?? position.entryPrice,
          tp2: position.meta.tp2 ?? position.entryPrice,
          tp3: null,
        }
      : null;

  return (
    <div className="glow-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">
          {symbol} <span className="text-ink-faint">· {status?.mode === "live" ? "LIVE" : "Testnet"}</span>
        </h2>
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded-md border px-2 py-1 text-[11px] ${timeframe === tf ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      {loading && !candles.length ? (
        <div className="flex h-[440px] items-center justify-center text-sm text-ink-faint">Memuat candle…</div>
      ) : (
        <TradingChart symbol={symbol} interval={timeframe} candles={candles} levels={levels} wsUrl={wsUrl} />
      )}
    </div>
  );
}
