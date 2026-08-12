"use client";
import { useMemo } from "react";
import clsx from "clsx";
import { Activity } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd } from "@/lib/format";
import { rsi, ema, calcMacd, calcVolumeProfile } from "@/lib/elvoid/indicators";
import type { Candle } from "@/lib/elvoid/types";

function InsufficientData({ symbol, label = "" }: { symbol: string; label?: string }) {
  return (
    <div className="flex h-full min-h-[5rem] items-center justify-center rounded-md border border-dashed border-line text-center text-[9.5px] leading-tight text-ink-faint">
      INSUFFICIENT DATA{label ? ` — ${label}` : ""} · candle {symbol} kurang
    </div>
  );
}

/** Big-panel card wrapper for RSI / MACD / Volume Profile — the three always-visible hero charts. */
function HeroCard({ code, title, hint, children }: { code: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="hover-glow relative overflow-hidden rounded-xl border border-line bg-bg-raised/60 p-2.5 sm:p-3">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-signal/10 blur-2xl" />
      <div className="relative mb-1.5">
        <SectionHeader code={code} title={title} hint={hint} />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/** RSI line chart with fixed overbought(70)/oversold(30) reference lines — shrunk to fit both mobile and desktop without a long scroll. Now also shows current price, same as MACD/Volume Profile, so every hero card reads like a TradingView panel. */
function RsiChart({ series, last, lastPrice }: { series: number[]; last: number; lastPrice?: number }) {
  const tail = series.filter((v) => !Number.isNaN(v)).slice(-50);
  if (tail.length < 2) return null;
  const yFor = (v: number) => 100 - v;
  const points = tail.map((v, i) => `${(i / (tail.length - 1)) * 100},${yFor(v)}`).join(" ");
  const tone = last >= 70 ? "#FF5252" : last <= 30 ? "#00E676" : "#A78BFA";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] uppercase tracking-wide text-ink-faint">RSI (14)</span>
          <span className="mono-num text-[13px] font-bold" style={{ color: tone }}>
            {last.toFixed(2)}
          </span>
        </div>
        {lastPrice !== undefined && <span className="mono-num text-[10px] text-up">{formatUsd(lastPrice)}</span>}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-14 w-full sm:h-16">
        {[70, 30].map((level) => (
          <line key={level} x1={0} x2={100} y1={yFor(level)} y2={yFor(level)} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 2" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        ))}
        <polyline points={points} fill="none" stroke={tone} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-0.5 flex justify-between text-[8.5px] text-ink-faint">
        <span className="text-down">70 overbought</span>
        <span className="text-up">30 oversold</span>
      </div>
    </div>
  );
}

/** MACD + Signal lines with a histogram — shrunk version of the reference MACD panel. */
function MacdChart({
  macdSeries,
  signalSeries,
  histSeries,
  macd,
  signal,
  hist,
  lastPrice,
}: {
  macdSeries: number[];
  signalSeries: number[];
  histSeries: number[];
  macd: number;
  signal: number;
  hist: number;
  lastPrice?: number;
}) {
  const tailLen = 50;
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
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-1.5 text-[9px]">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="uppercase tracking-wide text-ink-faint">MACD</span>
          <span className="mono-num font-bold text-signal-glow">{macd.toFixed(1)}</span>
          <span className="mono-num font-bold text-amber">{signal.toFixed(1)}</span>
          <span className={`mono-num font-bold ${hist >= 0 ? "text-up" : "text-down"}`}>{hist.toFixed(1)}</span>
        </div>
        {lastPrice !== undefined && <span className="mono-num text-[10px] text-up">{formatUsd(lastPrice)}</span>}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-14 w-full sm:h-16">
        <line x1={0} x2={100} y1={yFor(0)} y2={yFor(0)} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        {hTail.map((v, i) => {
          if (Number.isNaN(v)) return null;
          const x = (i / (hTail.length - 1)) * 100;
          const y0 = yFor(0);
          const y1 = yFor(v);
          return <rect key={i} x={x - 0.5} y={Math.min(y0, y1)} width={0.9} height={Math.max(0.4, Math.abs(y1 - y0))} fill={v >= 0 ? "rgba(0,230,118,0.55)" : "rgba(255,82,82,0.55)"} />;
        })}
        <polyline points={lineFor(mTail)} fill="none" stroke="#A78BFA" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        <polyline points={lineFor(sTail)} fill="none" stroke="#FFB020" strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** Horizontal Volume Profile bars with a highlighted POC row — shrunk row height + fewer buckets so it fits without a long scroll. */
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
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[9px]">
        <span className="uppercase tracking-wide text-ink-faint">Volume Profile</span>
        {lastPrice !== undefined && <span className="mono-num text-up">{formatUsd(lastPrice)}</span>}
      </div>
      <div className="space-y-[2px] overflow-hidden">
        {sorted.map((b) => {
          const mid = (b.priceLow + b.priceHigh) / 2;
          const isPoc = Math.abs(mid - pocPrice) < 1e-9;
          return (
            <div key={b.priceLow} className="relative flex h-[11px] items-center overflow-hidden rounded-sm text-[8.5px]">
              <div
                className={clsx("absolute inset-y-0 left-0", isPoc ? "bg-gradient-to-r from-signal/70 to-signal-glow/70" : "bg-gradient-to-r from-amber/50 to-amber/25")}
                style={{ width: `${Math.max(3, (b.volume / maxVolume) * 100)}%` }}
              />
              <span className="mono-num relative z-10 ml-1 w-14 shrink-0 text-ink">{formatUsd(mid)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-0.5 text-[8px] text-ink-faint">POC ~ {formatUsd(pocPrice)}</p>
    </div>
  );
}

/**
 * Real Indicators Suite. RSI / MACD / Volume Profile are the three
 * always-visible hero charts (per the reference layout) — each now also
 * shows the current price, same as a TradingView panel. The other 8
 * indicators (EMA/SMA/VWAP/ATR/ADX/Bollinger/Ichimoku/Supertrend) were
 * removed from this panel: they're already plotted on the main chart above,
 * so showing them again here was pure duplication. Every value here comes
 * from the same OHLCV `candles` already loaded for the chart — no duplicate
 * fetch, no fabricated numbers.
 */
export function IndicatorsSuitePanel({ symbol, candles }: { symbol: string; candles: Candle[] }) {
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

  const volumeProfile = useMemo(() => calcVolumeProfile(candles, 10), [candles]);

  return (
    <div className="glow-card relative overflow-hidden p-3 sm:p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-signal/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-smartmoney/10 blur-3xl" />

      <div className="relative mb-3 flex items-center justify-between">
        <SectionHeader code="IND" title="Indicators Suite" hint={symbol} icon={<Activity size={13} />} />
      </div>

      {/* RSI | MACD | Volume Profile — three always-visible hero charts, sized to fit mobile without a long scroll */}
      <div className="relative grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <HeroCard code="RSI" title="RSI">
          {Number.isNaN(lastRsi ?? NaN) ? <InsufficientData symbol={symbol} label="RSI" /> : <RsiChart series={rsiSeries} last={lastRsi!} lastPrice={lastPrice} />}
        </HeroCard>
        <HeroCard code="MACD" title="MACD" hint="12,26,9">
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
              lastPrice={lastPrice}
            />
          )}
        </HeroCard>
        <HeroCard code="VP" title="Volume Profile">
          {!volumeProfile ? <InsufficientData symbol={symbol} label="Volume Profile" /> : <VolumeProfileChart buckets={volumeProfile.buckets} pocPrice={volumeProfile.pocPrice} maxVolume={volumeProfile.maxVolume} lastPrice={lastPrice} />}
        </HeroCard>
      </div>
    </div>
  );
}
