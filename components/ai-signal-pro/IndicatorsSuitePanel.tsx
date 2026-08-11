"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Activity } from "lucide-react";
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

function InsufficientData({ symbol, label = "" }: { symbol: string; label?: string }) {
  return (
    <div className="flex h-full min-h-[10rem] items-center justify-center rounded-md border border-dashed border-line text-center text-[10.5px] text-ink-faint">
      INSUFFICIENT DATA{label ? ` — ${label}` : ""} · belum cukup candle {symbol}
    </div>
  );
}

function MiniCard({
  code,
  title,
  hint,
  children,
  glow = false,
}: {
  code: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
  glow?: boolean;
}) {
  return (
    <div
      className={clsx(
        "hover-glow relative flex h-full min-h-[15rem] flex-col overflow-hidden rounded-xl border border-line bg-bg-raised/60 p-3 transition-shadow duration-300",
        glow && "shadow-[0_0_26px_rgb(var(--signal-glow-rgb)/0.14)]"
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-signal/10 blur-2xl" />
      <div className="relative mb-2 flex items-center justify-between">
        <SectionHeader code={code} title={title} hint={hint} />
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

/** RSI line chart with fixed overbought(70)/oversold(30) reference lines, gridlines and a live-value badge — same visual language as the reference RSI panel. */
function RsiChart({ series, last }: { series: number[]; last: number }) {
  const clean = series.filter((v) => !Number.isNaN(v));
  const tail = clean.slice(-60);
  if (tail.length < 2) return null;
  const min = 0;
  const max = 100;
  const range = max - min;
  const points = tail.map((v, i) => `${(i / (tail.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(" ");
  const yFor = (v: number) => 100 - ((v - min) / range) * 100;
  const tone = last >= 70 ? "#FF5252" : last <= 30 ? "#00E676" : "#A78BFA";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">RSI (14)</span>
        <span className="mono-num text-sm font-bold" style={{ color: tone }}>
          {last.toFixed(2)}
        </span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full flex-1">
        {[80, 70, 50, 30, 20].map((level) => (
          <line
            key={level}
            x1={0}
            x2={100}
            y1={yFor(level)}
            y2={yFor(level)}
            stroke={level === 70 || level === 30 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)"}
            strokeDasharray={level === 70 || level === 30 ? "3 2" : undefined}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline points={points} fill="none" stroke={tone} strokeWidth={1.6} vectorEffect="non-scaling-stroke" filter="drop-shadow(0 0 3px currentColor)" />
      </svg>
      <div className="mt-1 flex justify-between text-[9px] text-ink-faint">
        <span className="text-down">70 overbought</span>
        <span className="text-up">30 oversold</span>
      </div>
    </div>
  );
}

/** MACD + Signal lines with a histogram, plus current-value badges — mirrors the reference MACD panel (dual line + colored bars + numeric readout). */
function MacdChart({
  macdSeries,
  signalSeries,
  histSeries,
  macd,
  signal,
  hist,
}: {
  macdSeries: number[];
  signalSeries: number[];
  histSeries: number[];
  macd: number;
  signal: number;
  hist: number;
}) {
  const tailLen = 60;
  const mTail = macdSeries.slice(-tailLen);
  const sTail = signalSeries.slice(-tailLen);
  const hTail = histSeries.slice(-tailLen);
  if (mTail.length < 2) return null;

  const allVals = [...mTail, ...sTail, ...hTail].filter((v) => !Number.isNaN(v));
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const yFor = (v: number) => 100 - ((v - min) / range) * 100;
  const lineFor = (arr: number[]) => arr.map((v, i) => `${(i / (arr.length - 1)) * 100},${yFor(v)}`).join(" ");

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">MACD (12,26,close,9)</span>
        <span className="mono-num text-[11px] font-bold text-signal-glow">{macd.toFixed(2)}</span>
        <span className="mono-num text-[11px] font-bold text-amber">{signal.toFixed(2)}</span>
        <span className={`mono-num text-[11px] font-bold ${hist >= 0 ? "text-up" : "text-down"}`}>{hist.toFixed(2)}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full flex-1">
        <line x1={0} x2={100} y1={yFor(0)} y2={yFor(0)} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        {hTail.map((v, i) => {
          if (Number.isNaN(v)) return null;
          const x = (i / (hTail.length - 1)) * 100;
          const y0 = yFor(0);
          const y1 = yFor(v);
          return (
            <rect
              key={i}
              x={x - 0.5}
              y={Math.min(y0, y1)}
              width={0.9}
              height={Math.max(0.4, Math.abs(y1 - y0))}
              fill={v >= 0 ? "rgba(0,230,118,0.55)" : "rgba(255,82,82,0.55)"}
            />
          );
        })}
        <polyline points={lineFor(mTail)} fill="none" stroke="#A78BFA" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <polyline points={lineFor(sTail)} fill="none" stroke="#FFB020" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** Horizontal Volume Profile bars with a highlighted POC row and a "current price" marker — mirrors the reference Volume Profile panel. */
function VolumeProfileChart({
  buckets,
  pocPrice,
  maxVolume,
  lastPrice,
}: {
  buckets: { priceLow: number; priceHigh: number; volume: number }[];
  pocPrice: number;
  maxVolume: number;
  lastPrice?: number;
}) {
  const sorted = [...buckets].sort((a, b) => b.priceHigh - a.priceHigh);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">Volume Profile (Visible Range)</span>
        {lastPrice !== undefined && <span className="mono-num text-[10px] text-up">{formatUsd(lastPrice)}</span>}
      </div>
      <div className="flex-1 space-y-[3px] overflow-hidden">
        {sorted.map((b) => {
          const mid = (b.priceLow + b.priceHigh) / 2;
          const isPoc = Math.abs(mid - pocPrice) < 1e-9;
          const isNearPrice = lastPrice !== undefined && lastPrice >= b.priceLow && lastPrice <= b.priceHigh;
          return (
            <div key={b.priceLow} className="relative flex h-[15px] items-center overflow-hidden rounded-sm text-[9.5px]">
              <div
                className={clsx("absolute inset-y-0 left-0 transition-all duration-500", isPoc ? "bg-gradient-to-r from-signal/70 to-signal-glow/70" : "bg-gradient-to-r from-amber/50 to-amber/25")}
                style={{ width: `${Math.max(3, (b.volume / maxVolume) * 100)}%` }}
              />
              {isNearPrice && <div className="absolute inset-y-0 left-0 right-0 border border-up/70" />}
              <span className="mono-num relative z-10 ml-1.5 w-16 shrink-0 text-ink">{formatUsd(mid)}</span>
              <span className="mono-num relative z-10 text-ink-faint">{Math.round(b.volume).toLocaleString()}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[9px] text-ink-faint">POC ~ {formatUsd(pocPrice)}</p>
    </div>
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

/**
 * Real Indicators Suite. RSI / MACD / Volume Profile render as three
 * always-visible columns (matching the reference layout) — every value
 * computed from the same OHLCV `candles` already loaded for the chart, no
 * duplicate fetch, no fabricated numbers. The tab row above still selects
 * among the remaining indicators (EMA/SMA/VWAP/ATR/ADX/Bollinger/Ichimoku/
 * Supertrend), shown as a detail strip below the three columns.
 */
export function IndicatorsSuitePanel({ symbol, candles }: { symbol: string; candles: Candle[] }) {
  const [active, setActive] = useState<Tab>("RSI");
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const lastPrice = closes.at(-1);

  const rsiSeries = useMemo(() => rsi(closes, 14), [closes]);
  const lastRsi = rsiSeries.at(-1);

  const macd = useMemo(() => calcMacd(candles), [candles]);
  const macdSeriesBundle = useMemo(() => {
    if (candles.length < 26 + 9) return undefined;
    const emaFast = ema(closes, 12);
    const emaSlow = ema(closes, 26);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = ema(macdLine, 9);
    const histLine = macdLine.map((v, i) => v - signalLine[i]);
    return { macdLine, signalLine, histLine };
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
  const volumeProfile = useMemo(() => calcVolumeProfile(candles, 10), [candles]);

  function renderDetail() {
    if (!candles.length) return <InsufficientData symbol={symbol} />;
    switch (active) {
      case "EMA": {
        const e20 = ema20Series.at(-1);
        const e50 = ema50Series.at(-1);
        if (candles.length < 20 || Number.isNaN(e20 ?? NaN)) return <InsufficientData symbol={symbol} label="EMA" />;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="EMA 20" value={formatUsd(e20!)} />
            <Stat label="EMA 50" value={candles.length >= 50 && !Number.isNaN(e50 ?? NaN) ? formatUsd(e50!) : "N/A"} />
            {lastPrice !== undefined && <Stat label="Vs EMA20" value={e20! < lastPrice ? "Di atas" : "Di bawah"} tone={e20! < lastPrice ? "text-up" : "text-down"} />}
          </div>
        );
      }
      case "SMA": {
        const s20 = sma20Series.at(-1);
        const s50 = sma50Series.at(-1);
        if (candles.length < 20 || Number.isNaN(s20 ?? NaN)) return <InsufficientData symbol={symbol} label="SMA" />;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="SMA 20" value={formatUsd(s20!)} />
            <Stat label="SMA 50" value={candles.length >= 50 && !Number.isNaN(s50 ?? NaN) ? formatUsd(s50!) : "N/A"} />
          </div>
        );
      }
      case "VWAP": {
        if (!vwap) return <InsufficientData symbol={symbol} label="VWAP" />;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="VWAP (window)" value={formatUsd(vwap.vwap)} />
            <Stat label="Deviasi" value={`${vwap.deviationPct >= 0 ? "+" : ""}${vwap.deviationPct.toFixed(2)}%`} tone={vwap.deviationPct >= 0 ? "text-up" : "text-down"} />
          </div>
        );
      }
      case "ATR": {
        if (Number.isNaN(lastAtr ?? NaN)) return <InsufficientData symbol={symbol} label="ATR" />;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="ATR (14)" value={formatUsd(lastAtr!)} />
          </div>
        );
      }
      case "ADX": {
        if (!adx) return <InsufficientData symbol={symbol} label="ADX" />;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="ADX" value={adx.adx.toFixed(1)} tone={adx.trendStrength === "strong" ? "text-up" : "text-ink"} />
            <Stat label="+DI" value={adx.plusDI.toFixed(1)} tone="text-up" />
            <Stat label="-DI" value={adx.minusDI.toFixed(1)} tone="text-down" />
            <Stat label="Kekuatan Tren" value={adx.trendStrength} />
          </div>
        );
      }
      case "Bollinger": {
        if (!bollinger) return <InsufficientData symbol={symbol} label="Bollinger" />;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Upper" value={formatUsd(bollinger.upper)} tone="text-down" />
            <Stat label="Middle" value={formatUsd(bollinger.middle)} />
            <Stat label="Lower" value={formatUsd(bollinger.lower)} tone="text-up" />
            <Stat label="%B" value={`${(bollinger.percentB * 100).toFixed(0)}%`} />
          </div>
        );
      }
      case "Ichimoku": {
        if (!ichimoku) return <InsufficientData symbol={symbol} label="Ichimoku" />;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Tenkan-sen" value={formatUsd(ichimoku.tenkan)} />
            <Stat label="Kijun-sen" value={formatUsd(ichimoku.kijun)} />
            <Stat label="Cloud" value={ichimoku.cloud} tone={ichimoku.cloud === "bullish" ? "text-up" : ichimoku.cloud === "bearish" ? "text-down" : "text-ink"} />
            <Stat label="Harga vs Cloud" value={ichimoku.priceVsCloud} />
          </div>
        );
      }
      case "Supertrend": {
        if (!supertrend) return <InsufficientData symbol={symbol} label="Supertrend" />;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Supertrend" value={formatUsd(supertrend.value)} tone={supertrend.direction === "up" ? "text-up" : "text-down"} />
            <Stat label="Arah" value={supertrend.direction.toUpperCase()} tone={supertrend.direction === "up" ? "text-up" : "text-down"} />
            {supertrend.flippedThisBar && <Stat label="Status" value="Baru flip" tone="text-signal-glow" />}
          </div>
        );
      }
      case "RSI":
      case "MACD":
      case "Volume Profile":
        return <p className="text-[11px] text-ink-faint">Ditampilkan permanen di tiga kolom di atas.</p>;
      default:
        return null;
    }
  }

  return (
    <div className="glow-card relative overflow-hidden p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-signal/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-smartmoney/10 blur-3xl" />

      <div className="relative mb-3 flex items-center justify-between">
        <SectionHeader code="IND" title="Indicators Suite" hint={symbol} icon={<Activity size={13} />} />
      </div>

      <div className="relative mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={clsx(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-all",
              active === t
                ? "border-signal/60 bg-signal/20 text-signal-glow shadow-[0_0_12px_rgb(var(--signal-glow-rgb)/0.35)]"
                : "border-line text-ink-muted hover:border-signal/30 hover:text-ink"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Fixed 3-column row: RSI | MACD | Volume Profile — always visible, per reference design */}
      <div className="relative grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MiniCard code="RSI" title="RSI" glow={active === "RSI"}>
          {Number.isNaN(lastRsi ?? NaN) ? <InsufficientData symbol={symbol} label="RSI" /> : <RsiChart series={rsiSeries} last={lastRsi!} />}
        </MiniCard>

        <MiniCard code="MACD" title="MACD" glow={active === "MACD"}>
          {!macd || !macdSeriesBundle ? (
            <InsufficientData symbol={symbol} label="MACD" />
          ) : (
            <MacdChart
              macdSeries={macdSeriesBundle.macdLine}
              signalSeries={macdSeriesBundle.signalLine}
              histSeries={macdSeriesBundle.histLine}
              macd={macd.macd}
              signal={macd.signal}
              hist={macd.histogram}
            />
          )}
        </MiniCard>

        <MiniCard code="VP" title="Volume Profile" glow={active === "Volume Profile"}>
          {!volumeProfile ? (
            <InsufficientData symbol={symbol} label="Volume Profile" />
          ) : (
            <VolumeProfileChart buckets={volumeProfile.buckets} pocPrice={volumeProfile.pocPrice} maxVolume={volumeProfile.maxVolume} lastPrice={lastPrice} />
          )}
        </MiniCard>
      </div>

      {/* Detail strip for the remaining indicators selected via the tabs above */}
      {active !== "RSI" && active !== "MACD" && active !== "Volume Profile" && (
        <div className="relative mt-3 rounded-lg border border-line bg-bg-raised/60 p-3">{renderDetail()}</div>
      )}
    </div>
  );
}
