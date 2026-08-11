"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd } from "@/lib/format";
import {
  rsi,
  ema,
  sma,
  calcMacd,
  atr,
  calcAdx,
  calcBollinger,
  calcVwap,
  calcIchimoku,
  calcSupertrend,
  calcVolumeProfile,
} from "@/lib/elvoid/indicators";
import type { Candle } from "@/lib/elvoid/types";

const TABS = ["RSI", "MACD", "EMA", "SMA", "VWAP", "ATR", "ADX", "Bollinger", "Ichimoku", "Supertrend", "Volume Profile"] as const;
type Tab = (typeof TABS)[number];

/** Tiny inline sparkline — no charting lib, just an SVG polyline over the tail of a numeric series. Used for oscillators (RSI/MACD histogram/ADX). */
function Sparkline({ values, tone = "signal" }: { values: number[]; tone?: "up" | "down" | "signal" }) {
  const clean = values.filter((v) => !Number.isNaN(v));
  if (clean.length < 2) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const points = clean
    .map((v, i) => {
      const x = (i / (clean.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const strokeColor = tone === "up" ? "#00E676" : tone === "down" ? "#FF5252" : "#8B7BFF";
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full">
      <polyline points={points} fill="none" stroke={strokeColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-line bg-bg px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mono-num text-[13px] font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function InsufficientData({ symbol }: { symbol: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line text-center text-[11px] text-ink-faint">
      INSUFFICIENT DATA — belum cukup candle {symbol} untuk indikator ini
    </div>
  );
}

/**
 * Real Indicators Suite: every value here comes from the same OHLCV
 * candles already loaded for the chart (`candles` prop) — no duplicate
 * fetch, no fabricated numbers. When there isn't enough history for a
 * given indicator's period, that tab shows INSUFFICIENT DATA instead of a
 * guessed value.
 */
export function IndicatorsSuitePanel({ symbol, candles }: { symbol: string; candles: Candle[] }) {
  const [active, setActive] = useState<Tab>("RSI");
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const lastPrice = closes.at(-1);

  const rsiSeries = useMemo(() => rsi(closes, 14), [closes]);
  const lastRsi = rsiSeries.at(-1);

  const macd = useMemo(() => calcMacd(candles), [candles]);
  const macdHistSeries = useMemo(() => {
    if (candles.length < 26 + 9) return [];
    const emaFast = ema(closes, 12);
    const emaSlow = ema(closes, 26);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = ema(macdLine, 9);
    return macdLine.map((v, i) => v - signalLine[i]).slice(-40);
  }, [candles, closes]);

  const ema20Series = useMemo(() => ema(closes, 20), [closes]);
  const ema50Series = useMemo(() => ema(closes, 50), [closes]);
  const sma20Series = useMemo(() => sma(closes, 20), [closes]);
  const sma50Series = useMemo(() => sma(closes, 50), [closes]);
  const atrSeries = useMemo(() => atr(candles, 14), [candles]);
  const lastAtr = atrSeries.at(-1);

  const adx = useMemo(() => calcAdx(candles), [candles]);
  const bollinger = useMemo(() => calcBollinger(candles), [candles]);
  const vwap = useMemo(() => calcVwap(candles), [candles]);
  const ichimoku = useMemo(() => calcIchimoku(candles), [candles]);
  const supertrend = useMemo(() => calcSupertrend(candles), [candles]);
  const volumeProfile = useMemo(() => calcVolumeProfile(candles), [candles]);

  function renderBody() {
    if (!candles.length) return <InsufficientData symbol={symbol} />;

    switch (active) {
      case "RSI": {
        if (Number.isNaN(lastRsi ?? NaN)) return <InsufficientData symbol={symbol} />;
        const tone = lastRsi! >= 70 ? "text-down" : lastRsi! <= 30 ? "text-up" : "text-ink";
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
            <Stat label="RSI (14)" value={lastRsi!.toFixed(2)} tone={tone} />
            <Sparkline values={rsiSeries.slice(-60)} tone={lastRsi! >= 70 ? "down" : lastRsi! <= 30 ? "up" : "signal"} />
          </div>
        );
      }
      case "MACD": {
        if (!macd) return <InsufficientData symbol={symbol} />;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="MACD" value={macd.macd.toFixed(2)} />
              <Stat label="Signal" value={macd.signal.toFixed(2)} />
              <Stat label="Histogram" value={macd.histogram.toFixed(2)} tone={macd.histogram >= 0 ? "text-up" : "text-down"} />
            </div>
            <Sparkline values={macdHistSeries} tone={macd.trend === "bullish" ? "up" : macd.trend === "bearish" ? "down" : "signal"} />
            {macd.crossover !== "none" && (
              <p className={`text-[11px] ${macd.crossover === "bullish_cross" ? "text-up" : "text-down"}`}>
                {macd.crossover === "bullish_cross" ? "Bullish cross baru terjadi." : "Bearish cross baru terjadi."}
              </p>
            )}
          </div>
        );
      }
      case "EMA": {
        const e20 = ema20Series.at(-1);
        const e50 = ema50Series.at(-1);
        if (candles.length < 20 || Number.isNaN(e20 ?? NaN)) return <InsufficientData symbol={symbol} />;
        return (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="EMA 20" value={formatUsd(e20!)} />
            <Stat label="EMA 50" value={candles.length >= 50 && !Number.isNaN(e50 ?? NaN) ? formatUsd(e50!) : "INSUFFICIENT DATA"} />
            {lastPrice !== undefined && (
              <p className="col-span-2 text-[11px] text-ink-faint">
                Harga saat ini {e20! < lastPrice ? "di atas" : "di bawah"} EMA20.
              </p>
            )}
          </div>
        );
      }
      case "SMA": {
        const s20 = sma20Series.at(-1);
        const s50 = sma50Series.at(-1);
        if (candles.length < 20 || Number.isNaN(s20 ?? NaN)) return <InsufficientData symbol={symbol} />;
        return (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="SMA 20" value={formatUsd(s20!)} />
            <Stat label="SMA 50" value={candles.length >= 50 && !Number.isNaN(s50 ?? NaN) ? formatUsd(s50!) : "INSUFFICIENT DATA"} />
          </div>
        );
      }
      case "VWAP": {
        if (!vwap) return <InsufficientData symbol={symbol} />;
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="VWAP (window)" value={formatUsd(vwap.vwap)} />
              <Stat label="Deviasi" value={`${vwap.deviationPct >= 0 ? "+" : ""}${vwap.deviationPct.toFixed(2)}%`} tone={vwap.deviationPct >= 0 ? "text-up" : "text-down"} />
            </div>
            <p className="text-[10px] text-ink-faint">VWAP dihitung dari kandle yang sedang dimuat di chart, bukan per sesi bursa.</p>
          </div>
        );
      }
      case "ATR": {
        if (Number.isNaN(lastAtr ?? NaN)) return <InsufficientData symbol={symbol} />;
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
            <Stat label="ATR (14)" value={formatUsd(lastAtr!)} />
            <Sparkline values={atrSeries.slice(-60)} />
          </div>
        );
      }
      case "ADX": {
        if (!adx) return <InsufficientData symbol={symbol} />;
        return (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="ADX" value={adx.adx.toFixed(1)} tone={adx.trendStrength === "strong" ? "text-up" : "text-ink"} />
            <Stat label="+DI" value={adx.plusDI.toFixed(1)} tone="text-up" />
            <Stat label="-DI" value={adx.minusDI.toFixed(1)} tone="text-down" />
            <p className="col-span-3 text-[11px] text-ink-faint">Kekuatan tren: {adx.trendStrength}.</p>
          </div>
        );
      }
      case "Bollinger": {
        if (!bollinger) return <InsufficientData symbol={symbol} />;
        return (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Upper" value={formatUsd(bollinger.upper)} tone="text-down" />
            <Stat label="Middle" value={formatUsd(bollinger.middle)} />
            <Stat label="Lower" value={formatUsd(bollinger.lower)} tone="text-up" />
            <p className="col-span-3 text-[11px] text-ink-faint">
              %B {(bollinger.percentB * 100).toFixed(0)}% · Bandwidth {(bollinger.bandwidth * 100).toFixed(2)}%
            </p>
          </div>
        );
      }
      case "Ichimoku": {
        if (!ichimoku) return <InsufficientData symbol={symbol} />;
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Tenkan-sen" value={formatUsd(ichimoku.tenkan)} />
              <Stat label="Kijun-sen" value={formatUsd(ichimoku.kijun)} />
              <Stat label="Senkou A" value={formatUsd(ichimoku.senkouA)} />
              <Stat label="Senkou B" value={formatUsd(ichimoku.senkouB)} />
            </div>
            <p className={`text-[11px] ${ichimoku.cloud === "bullish" ? "text-up" : ichimoku.cloud === "bearish" ? "text-down" : "text-ink-faint"}`}>
              Cloud {ichimoku.cloud} · Harga {ichimoku.priceVsCloud} cloud.
            </p>
          </div>
        );
      }
      case "Supertrend": {
        if (!supertrend) return <InsufficientData symbol={symbol} />;
        return (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Supertrend" value={formatUsd(supertrend.value)} tone={supertrend.direction === "up" ? "text-up" : "text-down"} />
            <Stat label="Arah" value={supertrend.direction === "up" ? "UP" : "DOWN"} tone={supertrend.direction === "up" ? "text-up" : "text-down"} />
            {supertrend.flippedThisBar && <p className="col-span-2 text-[11px] text-signal-glow">Baru saja flip arah pada kandle terakhir.</p>}
          </div>
        );
      }
      case "Volume Profile": {
        if (!volumeProfile) return <InsufficientData symbol={symbol} />;
        const sorted = [...volumeProfile.buckets].sort((a, b) => b.priceHigh - a.priceHigh);
        return (
          <div className="space-y-1">
            {sorted.map((b) => (
              <div key={b.priceLow} className="relative flex items-center overflow-hidden rounded px-1.5 py-1 text-[10px]">
                <div
                  className={clsx(
                    "absolute inset-y-0 left-0 transition-all duration-500",
                    Math.abs((b.priceLow + b.priceHigh) / 2 - volumeProfile.pocPrice) < 1e-9 ? "bg-signal/40" : "bg-signal/15"
                  )}
                  style={{ width: `${(b.volume / volumeProfile.maxVolume) * 100}%` }}
                />
                <span className="mono-num relative z-10 w-24 shrink-0 text-ink-muted">{formatUsd((b.priceLow + b.priceHigh) / 2)}</span>
                <span className="mono-num relative z-10 text-ink-faint">{b.volume.toFixed(1)}</span>
              </div>
            ))}
            <p className="pt-1 text-[10px] text-ink-faint">POC (Point of Control) ~ {formatUsd(volumeProfile.pocPrice)}</p>
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="glow-card p-4">
      <SectionHeader code="IND" title="Indicators Suite" hint={symbol} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={clsx(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
              active === t ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-muted hover:text-ink"
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {renderBody()}
    </div>
  );
}
