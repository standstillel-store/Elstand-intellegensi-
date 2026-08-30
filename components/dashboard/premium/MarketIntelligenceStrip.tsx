"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatPct, formatUsd, timeAgo } from "@/lib/format";
import { DataStateBadge, DataUnavailable } from "@/components/ui/DataStateBadge";
import { Sparkline } from "@/components/intelligence/ui/Sparkline";
import { LiveDot } from "@/components/ui/LiveDot";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import type { PremiumIntelligenceSnapshot } from "@/lib/intelligence/premium";

type Tone = "up" | "down" | "neutral";

function toneFor(n: number | undefined): Tone {
  if (n === undefined || n === 0) return "neutral";
  return n > 0 ? "up" : "down";
}
function toneClass(t: Tone) {
  return t === "up" ? "text-up" : t === "down" ? "text-down" : "text-ink-faint";
}

interface Slide {
  key: string;
  label: string;
  state: "real" | "proxy" | "unavailable";
  value?: string;
  changeLabel?: string;
  changeTone?: Tone;
  spark?: number[];
  note?: string;
  asOf?: string;
}

const AUTO_SLIDE_MS = 6000;
// How long a manual interaction (arrow click, dot click, or swipe) pauses
// autoplay before it resumes — long enough to read the slide the user just
// picked, short enough that the carousel doesn't feel like it's stuck.
const RESUME_AFTER_MS = 9000;
const SWIPE_DISTANCE_THRESHOLD = 60; // px
const SWIPE_VELOCITY_THRESHOLD = 400; // px/s

function FeatureCard({ slide }: { slide: Slide }) {
  return (
    <div className="flex h-full min-h-[168px] w-full flex-col items-center justify-center rounded-lg border border-line/70 bg-bg-surface/50 px-6 py-8 text-center sm:min-h-[196px]">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="eyebrow text-[11px] text-ink-muted">{slide.label}</span>
        <DataStateBadge state={slide.state} compact title={slide.note ?? (slide.asOf ? `As of ${slide.asOf}` : undefined)} />
      </div>

      {slide.state === "unavailable" || !slide.value ? (
        <DataUnavailable />
      ) : (
        <>
          <div className="mono-num truncate text-[34px] font-semibold leading-tight text-ink sm:text-[42px]">{slide.value}</div>
          <div className="mt-2 flex min-h-[20px] items-center justify-center gap-2">
            {slide.changeLabel ? (
              <span className={`mono-num text-[13px] ${toneClass(slide.changeTone ?? "neutral")}`}>{slide.changeLabel}</span>
            ) : null}
          </div>
          {slide.spark && slide.spark.length > 1 ? (
            <div className="mt-3 w-full max-w-[220px]">
              <Sparkline series={slide.spark} tone={slide.changeTone === "neutral" ? "neutral" : slide.changeTone} height={32} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function MarketIntelligenceStrip({ snapshot }: { snapshot: PremiumIntelligenceSnapshot }) {
  const { usDebt, dxy, sp500, nasdaq, us10y, fedFunds, cryptoGlobal, btc, eth } = snapshot;
  const reducedMotion = usePrefersReducedMotion();

  const debtChange =
    usDebt.data?.changeUsdYoy !== undefined ? `${usDebt.data.changeUsdYoy >= 0 ? "+" : "-"}${formatUsd(Math.abs(usDebt.data.changeUsdYoy))} (YoY)` : undefined;

  const fedFundsValue = fedFunds.data ? `${fedFunds.data.lower.toFixed(2)}–${fedFunds.data.upper.toFixed(2)}%` : undefined;
  const fedFundsChange = fedFunds.data?.lastChange
    ? `${fedFunds.data.lastChange.bps >= 0 ? "+" : ""}${fedFunds.data.lastChange.bps}bps · ${new Date(fedFunds.data.lastChange.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" })}`
    : undefined;

  // Same 11 metrics the two-row grid used to show — reused as-is, just
  // reshaped into one slide each. No new data, no new fetches.
  const slides: Slide[] = useMemo(
    () => [
      {
        key: "usDebt",
        label: "US National Debt",
        state: usDebt.state,
        value: usDebt.data ? formatUsd(usDebt.data.valueUsd) : undefined,
        changeLabel: debtChange,
        changeTone: usDebt.data?.changeUsdYoy !== undefined ? (usDebt.data.changeUsdYoy > 0 ? "down" : "up") : "neutral",
        asOf: usDebt.data?.asOf,
      },
      {
        key: "dxy",
        label: "Dollar Index (DXY)",
        state: dxy.state,
        value: dxy.data ? dxy.data.value.toFixed(2) : undefined,
        changeLabel: dxy.data?.changePct !== undefined ? formatPct(dxy.data.changePct) : undefined,
        changeTone: toneFor(dxy.data?.changePct),
        spark: dxy.data?.series,
        asOf: dxy.data?.asOf,
      },
      {
        key: "sp500",
        label: "S&P 500",
        state: sp500.state,
        value: sp500.data ? formatUsd(sp500.data.price) : undefined,
        changeLabel: sp500.data?.changePct !== undefined ? formatPct(sp500.data.changePct) : undefined,
        changeTone: toneFor(sp500.data?.changePct),
        note: sp500.note,
      },
      {
        key: "cryptoMcap",
        label: "Total Crypto Mcap",
        state: cryptoGlobal.state,
        value: cryptoGlobal.data ? formatUsd(cryptoGlobal.data.totalMarketCapUsd) : undefined,
        changeLabel: cryptoGlobal.data ? formatPct(cryptoGlobal.data.changePct24h) : undefined,
        changeTone: toneFor(cryptoGlobal.data?.changePct24h),
      },
      {
        key: "btcDominance",
        label: "BTC Dominance",
        state: cryptoGlobal.state,
        value: cryptoGlobal.data ? `${cryptoGlobal.data.btcDominance.toFixed(2)}%` : undefined,
      },
      {
        key: "nasdaq",
        label: "Nasdaq (QQQ)",
        state: nasdaq.state,
        value: nasdaq.data ? formatUsd(nasdaq.data.price) : undefined,
        changeLabel: nasdaq.data?.changePct !== undefined ? formatPct(nasdaq.data.changePct) : undefined,
        changeTone: toneFor(nasdaq.data?.changePct),
        note: nasdaq.note,
      },
      {
        key: "us10y",
        label: "US 10Y Yield",
        state: us10y.state,
        value: us10y.data ? `${us10y.data.value.toFixed(2)}%` : undefined,
        changeLabel: us10y.data?.changeBps !== undefined ? `${us10y.data.changeBps >= 0 ? "+" : ""}${us10y.data.changeBps}bps` : undefined,
        changeTone: toneFor(us10y.data?.changeBps),
        asOf: us10y.data?.asOf,
      },
      {
        key: "fedFunds",
        label: "Fed Funds Rate",
        state: fedFunds.state,
        value: fedFundsValue,
        changeLabel: fedFundsChange,
        changeTone: "neutral",
        asOf: fedFunds.data?.asOf,
      },
      {
        key: "btc",
        label: "BTC",
        state: btc.state,
        value: btc.data ? formatUsd(btc.data.price) : undefined,
        changeLabel: btc.data?.change24h !== undefined ? formatPct(btc.data.change24h) : undefined,
        changeTone: toneFor(btc.data?.change24h),
        spark: btc.data?.series,
      },
      {
        key: "eth",
        label: "ETH",
        state: eth.state,
        value: eth.data ? formatUsd(eth.data.price) : undefined,
        changeLabel: eth.data?.change24h !== undefined ? formatPct(eth.data.change24h) : undefined,
        changeTone: toneFor(eth.data?.change24h),
        spark: eth.data?.series,
      },
      {
        key: "24hChange",
        label: "24H Market Change",
        state: cryptoGlobal.state,
        value: cryptoGlobal.data ? formatPct(cryptoGlobal.data.changePct24h) : undefined,
        changeTone: toneFor(cryptoGlobal.data?.changePct24h),
      },
    ],
    [usDebt, dxy, sp500, nasdaq, us10y, fedFunds, cryptoGlobal, btc, eth, debtChange, fedFundsValue, fedFundsChange],
  );

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const goTo = useCallback(
    (next: number, dir: 1 | -1) => {
      setDirection(dir);
      setIndex(((next % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );

  // Manual interaction (arrow, dot, swipe) pauses autoplay for a while so
  // acting on the carousel never gets immediately overridden by the timer.
  const registerInteraction = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_AFTER_MS);
  }, []);

  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  useEffect(() => {
    if (paused || hovered || reducedMotion || slides.length <= 1) return;
    const id = setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % slides.length);
    }, AUTO_SLIDE_MS);
    return () => clearInterval(id);
  }, [paused, hovered, reducedMotion, slides.length]);

  const handlePrev = () => {
    registerInteraction();
    goTo(index - 1, -1);
  };
  const handleNext = () => {
    registerInteraction();
    goTo(index + 1, 1);
  };
  const handleDot = (i: number) => {
    registerInteraction();
    goTo(i, i > index ? 1 : -1);
  };
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x < -SWIPE_DISTANCE_THRESHOLD || velocity.x < -SWIPE_VELOCITY_THRESHOLD) {
      handleNext();
    } else if (offset.x > SWIPE_DISTANCE_THRESHOLD || velocity.x > SWIPE_VELOCITY_THRESHOLD) {
      handlePrev();
    }
  };

  const active = slides[index];

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
  };

  return (
    <section className="panel p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="eyebrow text-[11px] text-ink-muted">Global Market Intelligence</h2>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
          <LiveDot />
          <span>Real-time · Updated {timeAgo(snapshot.asOf)}</span>
        </div>
      </div>

      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="region"
        aria-roledescription="carousel"
        aria-label="Global market intelligence metrics"
      >
        <div className="relative overflow-hidden rounded-lg">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={active.key}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reducedMotion ? 0 : 0.32, ease: "easeOut" }}
              drag={reducedMotion ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className="w-full cursor-grab active:cursor-grabbing"
            >
              <FeatureCard slide={active} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Manual navigation — desktop-visible chevrons; always tappable on touch. */}
        <button
          type="button"
          aria-label="Previous metric"
          onClick={handlePrev}
          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full border border-line/70 bg-bg-raised/80 p-1.5 text-ink-faint transition-colors hover:border-signal/40 hover:text-ink"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          aria-label="Next metric"
          onClick={handleNext}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-line/70 bg-bg-raised/80 p-1.5 text-ink-faint transition-colors hover:border-signal/40 hover:text-ink"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Pagination dots */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-label={`Show ${s.label}`}
            aria-current={i === index}
            onClick={() => handleDot(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-signal" : "w-1.5 bg-line hover:bg-ink-faint"}`}
          />
        ))}
      </div>
    </section>
  );
}
