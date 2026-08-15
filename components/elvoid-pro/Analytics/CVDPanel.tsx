"use client";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";

interface CvdPoint {
  time: number;
  delta: number;
  cvd: number;
}

export function CVDPanel({ symbol, interval = "5m" }: { symbol: string; interval?: string }) {
  const [series, setSeries] = useState<CvdPoint[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/cvd?symbol=${symbol}&interval=${interval}&limit=100`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error || !Array.isArray(data.series)) {
          setStatus("error");
          return;
        }
        setSeries(data.series);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    const id = setInterval(() => {
      fetch(`/api/cvd?symbol=${symbol}&interval=${interval}&limit=100`)
        .then((res) => res.json())
        .then((data) => !cancelled && Array.isArray(data.series) && setSeries(data.series))
        .catch(() => {});
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, interval]);

  const latest = series.at(-1);
  const isPositive = (latest?.cvd ?? 0) >= 0;

  const path = (() => {
    if (series.length < 2) return "";
    const values = series.map((p) => p.cvd);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 100;
    const h = 32;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  })();

  return (
    <div className="rounded-lg border border-line bg-bg-surface/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-muted">CVD (Cumulative Volume Delta)</p>
        {latest && (
          <span className={clsx("flex items-center gap-1 text-[11px] font-semibold", isPositive ? "text-up" : "text-down")}>
            {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {latest.cvd >= 0 ? "+" : ""}
            {latest.cvd.toFixed(2)}
          </span>
        )}
      </div>

      {status === "loading" && series.length === 0 && (
        <p className="mt-3 animate-pulse text-[11px] text-ink-faint">Menghitung CVD…</p>
      )}
      {status === "error" && <p className="mt-3 text-[11px] text-ink-faint">CVD tidak tersedia saat ini.</p>}

      {status === "ready" && path && (
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-2 h-10 w-full">
          <path d={path} fill="none" stroke={isPositive ? "#22c55e" : "#ef4444"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      <p className="mt-1 text-[9px] text-ink-faint">Basis taker buy/sell per candle · {interval}</p>
    </div>
  );
}
