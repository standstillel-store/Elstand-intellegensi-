"use client";
import { useMemo } from "react";
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
    <div className="hover-glow relative flex h-full min-h-[11rem] flex-col overflow-hidden rounded-xl border border-line bg-bg-raised/60 p-2.5 sm:p-3">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-signal/10 blur-2xl" />
      <div className="relative mb-1.5">
        <SectionHeader code={code} title={title} hint={hint} />
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

/** Compact, bright/light tile for the remaining 8 indicators — a grid column instead of a tab selection, per request. */
function LightTile({
  label,
  value,
  valueTone,
  sub,
  accent,
  children,
}: {
  label: string;
  value: string;
  valueTone?: "up" | "down" | "neutral";
  sub?: string;
  accent: "amber" | "signal" | "smartmoney" | "up" | "down";
  children?: React.ReactNode;
}) {
  const ACCENT_BG: Record<string, string> = {
    amber: "from-amber/25 via-amber/10 to-transparent",
    signal: "from-signal/25 via-signal/10 to-transparent",
    smartmoney: "from-smartmoney/25 via-smartmoney/10 to-transparent",
    up: "from-up/25 via-up/10 to-transparent",
    down: "from-down/25 via-down/10 to-transparent",
  };
  const VALUE_TONE: Record<string, string> = { up: "text-up", down: "text-down", neutral: "text-ink" };
  return (
    <div
      className={clsx(
        "relative flex min-h-[6.5rem] flex-col justify-between overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br p-2.5 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]",
        ACCENT_BG[accent]
      )}
      style={{ backgroundColor: "rgba(255,255,255,0.045)" }}
    >
      <div className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      {children ? (
        <div className="my-1 flex-1">{children}</div>
      ) : (
        <div className={clsx("mono-num mt-1 text-[15px] font-bold", VALUE_TONE[valueTone ?? "neutral"])}>{value}</div>
      )}
      {sub && <div className="text-[9px] leading-tight text-ink-faint">{sub}</div>}
    </div>
  );
}

/** Small inline sparkline — no charting lib, just an SVG polyline. */
function Sparkline({ values, tone = "#A78BFA", height = "h-8" }: { values: number[]; tone?: string; height?: string }) {
  const clean = values.filter((v) => !Number.isNaN(v));
  if (clean.length < 2) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const points = clean.map((v, i) => `${(i / (clean.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={clsx("w-full", height)}>
      <polyline points={points} fill="none" stroke={tone} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** RSI line chart with fixed overbought(70)/oversold(30) reference lines — shrunk to fit both mobile and desktop without a long scroll. */
function RsiChart({ series, last }: { series: number[]; last: number }) {
  const tail = series.filter((v) => !Number.isNaN(v)).slice(-50);
  if (tail.length < 2) return null;
  const yFor = (v: number) => 100 - v;
  const points = tail.map((v, i) => `${(i / (tail.length - 1)) * 100},${yFor(v)}`).join(" ");
  const tone = last >= 70 ? "#FF5252" : last <= 30 ? "#00E676" : "#A78BFA";
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-[9px] uppercase tracking-wide text-ink-faint">RSI (14)</span>
        <span className="mono-num text-[13px] font-bold" style={{ color: tone }}>
          {last.toFixed(2)}
        </span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full flex-1 sm:h-20">
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
}: {
  macdSeries: number[];
  signalSeries: number[];
  histSeries: number[];
  macd: number;
  signal: number;
  hist: number;
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
    <div className="flex h-full flex-col">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-1.5 text-[9px]">
        <span className="uppercase tracking-wide text-ink-faint">MACD</span>
        <span className="mono-num font-bold text-signal-glow">{macd.toFixed(1)}</span>
        <span className="mono-num font-bold text-amber">{signal.toFixed(1)}</span>
        <span className={`mono-num font-bold ${hist >= 0 ? "text-up" : "text-down"}`}>{hist.toFixed(1)}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full flex-1 sm:h-20">
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
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-baseline justify-between text-[9px]">
        <span className="uppercase tracking-wide text-ink-faint">Volume Profile</span>
        {lastPrice !== undefined && <span className="mono-num text-up">{formatUsd(lastPrice)}</span>}
      </div>
      <div className="flex-1 space-y-[2px] overflow-hidden">
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
 * Real Indicators Suite. RSI / MACD / Volume Profile stay as three
 * always-visible hero charts (per the reference layout). The remaining 8
 * indicators (EMA/SMA/VWAP/ATR/ADX/Bollinger/Ichimoku/Supertrend) are no
 * longer a tab selection — every one renders as its own grid tile at once
 * (3 columns on mobile, 4 on desktop), so there's nothing to "click and
 * nothing happens". Every value here comes from the same OHLCV `candles`
 * already loaded for the chart — no duplicate fetch, no fabricated numbers.
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

  const ema20 = ema20Series.at(-1);
  const ema50 = ema50Series.at(-1);
  const sma20 = sma20Series.at(-1);
  const sma50 = sma50Series.at(-1);

  return (
    <div className="glow-card relative overflow-hidden p-3 sm:p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-signal/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-smartmoney/10 blur-3xl" />

      <div className="relative mb-3 flex items-center justify-between">
        <SectionHeader code="IND" title="Indicators Suite" hint={symbol} icon={<Activity size={13} />} />
      </div>

      {/* RSI | MACD | Volume Profile — three always-visible hero charts, sized to fit mobile without a long scroll */}
      <div className="relative mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <HeroCard code="RSI" title="RSI">
          {Number.isNaN(lastRsi ?? NaN) ? <InsufficientData symbol={symbol} label="RSI" /> : <RsiChart series={rsiSeries} last={lastRsi!} />}
        </HeroCard>
        <HeroCard code="MACD" title="MACD" hint="12,26,9">
          {!macd || !macdSeriesBundle ? (
            <InsufficientData symbol={symbol} label="MACD" />
          ) : (
            <MacdChart macdSeries={macdSeriesBundle.macdLine} signalSeries={macdSeriesBundle.signalLine} histSeries={macdSeriesBundle.histLine} macd={macd.macd} signal={macd.signal} hist={macd.histogram} />
          )}
        </HeroCard>
        <HeroCard code="VP" title="Volume Profile">
          {!volumeProfile ? <InsufficientData symbol={symbol} label="Volume Profile" /> : <VolumeProfileChart buckets={volumeProfile.buckets} pocPrice={volumeProfile.pocPrice} maxVolume={volumeProfile.maxVolume} lastPrice={lastPrice} />}
        </HeroCard>
      </div>

      {/* Remaining 8 indicators — grid columns instead of tabs (3x3 mobile, 4x4 desktop), bright/light tiles */}
      <div className="relative grid grid-cols-3 gap-2 lg:grid-cols-4">
        {/* EMA */}
        {candles.length < 20 || ema20 === undefined || Number.isNaN(ema20) ? (
          <LightTile label="EMA" value="N/A" accent="signal" sub="Candle kurang" />
        ) : (
          <LightTile label="EMA 20/50" value="" accent="signal" sub={`20: ${formatUsd(ema20)}${ema50 !== undefined && !Number.isNaN(ema50) ? ` · 50: ${formatUsd(ema50)}` : ""}`}>
            <Sparkline values={ema20Series.slice(-30)} tone="#8B7BFF" />
          </LightTile>
        )}

        {/* SMA */}
        {candles.length < 20 || sma20 === undefined || Number.isNaN(sma20) ? (
          <LightTile label="SMA" value="N/A" accent="amber" sub="Candle kurang" />
        ) : (
          <LightTile label="SMA 20/50" value="" accent="amber" sub={`20: ${formatUsd(sma20)}${sma50 !== undefined && !Number.isNaN(sma50) ? ` · 50: ${formatUsd(sma50)}` : ""}`}>
            <Sparkline values={sma20Series.slice(-30)} tone="#FFB020" />
          </LightTile>
        )}

        {/* VWAP */}
        {!vwap ? (
          <LightTile label="VWAP" value="N/A" accent="smartmoney" sub="Volume kurang" />
        ) : (
          <LightTile
            label="VWAP"
            value={formatUsd(vwap.vwap)}
            valueTone={vwap.deviationPct >= 0 ? "up" : "down"}
            accent="smartmoney"
            sub={`${vwap.deviationPct >= 0 ? "+" : ""}${vwap.deviationPct.toFixed(2)}% dari harga`}
          />
        )}

        {/* ATR */}
        {Number.isNaN(lastAtr ?? NaN) ? (
          <LightTile label="ATR (14)" value="N/A" accent="amber" sub="Candle kurang" />
        ) : (
          <LightTile label="ATR (14)" value="" accent="amber" sub={`Volatilitas: ${formatUsd(lastAtr!)}`}>
            <Sparkline values={atrSeries.slice(-30)} tone="#FFB020" />
          </LightTile>
        )}

        {/* ADX */}
        {!adx ? (
          <LightTile label="ADX" value="N/A" accent="signal" sub="Candle kurang" />
        ) : (
          <LightTile
            label="ADX"
            value={adx.adx.toFixed(1)}
            valueTone={adx.plusDI > adx.minusDI ? "up" : adx.minusDI > adx.plusDI ? "down" : "neutral"}
            accent="signal"
            sub={`+DI ${adx.plusDI.toFixed(1)} · -DI ${adx.minusDI.toFixed(1)} · ${adx.trendStrength}`}
          />
        )}

        {/* Bollinger */}
        {!bollinger ? (
          <LightTile label="Bollinger" value="N/A" accent="up" sub="Candle kurang" />
        ) : (
          <LightTile label="Bollinger %B" value={`${(bollinger.percentB * 100).toFixed(0)}%`} valueTone={bollinger.percentB > 0.6 ? "up" : bollinger.percentB < 0.4 ? "down" : "neutral"} accent="up" sub={`U ${formatUsd(bollinger.upper)} · L ${formatUsd(bollinger.lower)}`} />
        )}

        {/* Ichimoku */}
        {!ichimoku ? (
          <LightTile label="Ichimoku" value="N/A" accent="down" sub="Butuh 52 candle" />
        ) : (
          <LightTile label="Ichimoku Cloud" value={ichimoku.cloud.toUpperCase()} valueTone={ichimoku.cloud === "bullish" ? "up" : ichimoku.cloud === "bearish" ? "down" : "neutral"} accent="down" sub={`Harga ${ichimoku.priceVsCloud} cloud`} />
        )}

        {/* Supertrend */}
        {!supertrend ? (
          <LightTile label="Supertrend" value="N/A" accent="up" sub="Candle kurang" />
        ) : (
          <LightTile
            label="Supertrend"
            value={supertrend.direction.toUpperCase()}
            valueTone={supertrend.direction === "up" ? "up" : "down"}
            accent="up"
            sub={`${formatUsd(supertrend.value)}${supertrend.flippedThisBar ? " · baru flip" : ""}`}
          />
        )}
      </div>
    </div>
  );
}
