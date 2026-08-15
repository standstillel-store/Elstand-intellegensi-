"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";
import type { PriceProfile } from "@/lib/elvoid/marketProfile";
import { formatUsd } from "@/lib/format";

interface BarLayout {
  y: number;
  h: number;
  widthPct: number;
  isPoc: boolean;
  inValueArea: boolean;
  price: number;
}

export function ProfileEmbeddedChart({
  symbol,
  interval,
  height,
  mode,
}: {
  symbol: string;
  interval: string;
  height: number;
  mode: "volume-profile" | "tpo";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [profile, setProfile] = useState<PriceProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bars, setBars] = useState<BarLayout[]>([]);

  const label = mode === "tpo" ? "TPO / Market Profile" : "Volume Profile";
  const profileInterval = mode === "tpo" ? "30m" : interval;
  const profileEndpoint = mode === "tpo" ? "/api/tpo" : "/api/volume-profile";

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([
      fetch(`/api/klines?symbol=${symbol}&interval=${interval}&limit=150`).then((r) => r.json()),
      fetch(`${profileEndpoint}?symbol=${symbol}&interval=${profileInterval}`).then((r) => r.json()),
    ])
      .then(([klineData, profileData]) => {
        if (cancelled) return;
        if (klineData.error || !Array.isArray(klineData.candles) || profileData.error || !profileData.profile) {
          setStatus("error");
          return;
        }
        setCandles(klineData.candles);
        setProfile(profileData.profile);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol, interval, profileInterval, profileEndpoint]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8A8F98", fontFamily: "var(--font-sans)" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      width: containerRef.current.clientWidth,
      height,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#1E2129" },
      rightPriceScale: { borderColor: "#1E2129" },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;
    const series = chart.addCandlestickSeries({
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });
    seriesRef.current = series;

    const recompute = () => recomputeRef.current?.();
    chart.timeScale().subscribeVisibleTimeRangeChange(recompute);
    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      recompute();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(recompute);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(
      candles.map((c) => ({ time: (c.time / 1000) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    chartRef.current?.timeScale().fitContent();
    recomputeRef.current?.();
  }, [candles]);

  const recomputeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    recomputeRef.current = () => {
      const series = seriesRef.current;
      if (!series || !profile || profile.bins.length === 0) return;
      const maxValue = Math.max(...profile.bins.map((b) => b.value));
      const next: BarLayout[] = profile.bins
        .map((bin) => {
          const yTop = series.priceToCoordinate(bin.priceHigh);
          const yBottom = series.priceToCoordinate(bin.priceLow);
          if (yTop === null || yBottom === null) return null;
          const top = Number(yTop);
          const bottom = Number(yBottom);
          const isPoc = profile.poc?.priceLow === bin.priceLow;
          const inValueArea = profile.vah !== null && profile.val !== null && bin.priceHigh > profile.val && bin.priceLow < profile.vah;
          return {
            y: top,
            h: Math.max(2, bottom - top),
            widthPct: maxValue > 0 ? (bin.value / maxValue) * 100 : 0,
            isPoc,
            inValueArea,
            price: (bin.priceLow + bin.priceHigh) / 2,
          };
        })
        .filter((b): b is BarLayout => b !== null);
      setBars(next);
    };
    recomputeRef.current();
  }, [profile]);

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-line bg-bg-surface/40">
      <div ref={containerRef} className="h-full w-full" />

      {status === "loading" && candles.length === 0 && (
        <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          Menghitung {label.toLowerCase()} untuk {symbol}/USDT…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          {label} tidak tersedia saat ini.
        </div>
      )}

      {/* Profile histogram — anchored to the real price scale on the right edge, beside actual price action. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[28%] max-w-[180px]">
        {bars.map((b, i) => (
          <div
            key={i}
            className="absolute right-0 rounded-l-[2px]"
            style={{
              top: b.y,
              height: b.h,
              width: `${Math.max(2, b.widthPct)}%`,
              backgroundColor: b.isPoc ? "#a78bfa" : b.inValueArea ? "#7c3aed66" : "#4b556355",
            }}
          />
        ))}
      </div>

      {profile?.poc && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-bg-raised/90 px-2 py-1 text-[10px]">
          <p className="font-semibold text-ink-muted">{label}</p>
          <p className="mono-num mt-0.5 flex gap-2 text-ink-faint">
            {profile.vah !== null && <span>VAH <span className="text-ink">{formatUsd(profile.vah)}</span></span>}
            <span>POC <span className="text-signal-glow">{formatUsd((profile.poc.priceLow + profile.poc.priceHigh) / 2)}</span></span>
            {profile.val !== null && <span>VAL <span className="text-ink">{formatUsd(profile.val)}</span></span>}
          </p>
        </div>
      )}
    </div>
  );
}
