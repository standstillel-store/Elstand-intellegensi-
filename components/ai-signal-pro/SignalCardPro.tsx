"use client";
import { Fragment, useState } from "react";
import { motion } from "framer-motion";
import { Check, Minus, ShieldAlert, Clock, Target } from "lucide-react";
import clsx from "clsx";
import { SideBadge, StatusBadge, Badge } from "@/components/ui/Badge";
import { formatUsd } from "@/lib/format";
import { useTokenAnalyzer } from "@/components/token-analyzer/TokenAnalyzerContext";
import type { AiSignal, ScanResult, OrderType, TradeGrade } from "@/lib/elvoid/types";
import { evaluateEntryConfirmation } from "@/lib/elvoid/confirmation";
import { SignalProgress } from "./SignalProgress";
import { SignalChartMini } from "./SignalChartMini";
import { KnowledgeTerm } from "@/components/ui/KnowledgeTerm";

type DisplayStatus = "running" | "win" | "loss" | "invalidated" | "expired" | "breakeven" | "pending";

function statusFor(signal: Pick<AiSignal, "status">, journalResult?: "win" | "loss" | "breakeven"): DisplayStatus {
  if (signal.status === "closed") return journalResult ?? "win";
  if (signal.status === "invalidated") return "invalidated";
  if (signal.status === "expired") return "expired";
  if (signal.status === "pending") return "pending";
  return "running";
}

const GRADE_TONE: Record<TradeGrade, "up" | "signal" | "amber" | "neutral"> = {
  "A++": "up",
  "A+": "up",
  A: "up",
  "B+": "signal",
  B: "signal",
  "C+": "amber",
  C: "amber",
};

/** Order + display label for the AI Reasoning checklist — the 12 named confluence factors from the Phase 2.8 brief, each backed by a real scanner key. `term` (when set) links to the Phase 2.8 knowledge glossary. */
const REASONING_MAP: { key: string; label: string; term?: string }[] = [
  { key: "trend", label: "Trend" },
  { key: "market_structure", label: "BOS / CHoCH" },
  { key: "liquidity_sweep", label: "Liquidity Sweep", term: "Liquidity" },
  { key: "volume", label: "Volume Confirmation", term: "Volume" },
  { key: "order_block", label: "Order Block", term: "Order Block" },
  { key: "fair_value_gap", label: "Fair Value Gap", term: "Fair Value Gap" },
  { key: "funding_rate", label: "Funding", term: "Funding" },
  { key: "open_interest", label: "Open Interest", term: "OI" },
  { key: "whale_activity", label: "Whale Flow", term: "Whale" },
  { key: "news_sentiment", label: "News" },
  { key: "macro", label: "Macro", term: "DXY" },
  { key: "sentiment", label: "Sentiment", term: "Fear & Greed" },
];

function rr(entry: number, sl: number, tp: number | null | undefined): string {
  if (!tp) return "—";
  const risk = Math.abs(entry - sl) || 1e-9;
  return `${(Math.abs(tp - entry) / risk).toFixed(2)}R`;
}

export function SignalCardPro({
  signal,
  journalResult,
  onExecute,
  executing,
  compact = false,
}: {
  signal: Pick<
    AiSignal,
    | "coin"
    | "side"
    | "entry"
    | "sl"
    | "tp1"
    | "tp2"
    | "tp3"
    | "timeframe"
    | "confidence"
    | "strategy"
    | "reason"
    | "status"
    | "scans"
    | "extra_reasoning"
    | "risk_percent"
    | "trade_grade"
    | "probability_tp"
    | "probability_sl"
    | "confluence_count"
    | "confluence_total"
    | "ideal_entry_low"
    | "ideal_entry_high"
    | "expected_duration"
    | "confirmation_status"
    | "confirmation_zone_ok"
  >;
  journalResult?: "win" | "loss" | "breakeven";
  onExecute?: (orderType: OrderType) => void;
  executing?: boolean;
  compact?: boolean;
}) {
  const { open } = useTokenAnalyzer();
  const [orderType, setOrderType] = useState<OrderType>("market");
  const isLong = signal.side === "LONG";
  const winningBias = isLong ? "bullish" : "bearish";
  const status = statusFor(signal, journalResult);

  const allScans: ScanResult[] = [...(signal.scans ?? []), ...(signal.extra_reasoning ?? [])];
  const scanByKey = new Map(allScans.map((s) => [s.key, s]));

  const confirmation =
    signal.scans && signal.confirmation_zone_ok !== null && signal.confirmation_zone_ok !== undefined
      ? evaluateEntryConfirmation({
          side: signal.side,
          scans: signal.scans,
          extraReasoning: signal.extra_reasoning ?? [],
          zoneOk: signal.confirmation_zone_ok,
        })
      : null;
  const trendScan = scanByKey.get("trend");
  const macroScan = scanByKey.get("macro");
  const whaleScan = scanByKey.get("whale_activity");

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="glow-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <SideBadge side={signal.side} />
          {signal.trade_grade && (
            <Badge tone={GRADE_TONE[signal.trade_grade]} size="md" icon={<Target size={11} />}>
              {signal.trade_grade}
            </Badge>
          )}
          {trendScan && trendScan.bias !== "neutral" && (
            <Badge tone={trendScan.bias === "bullish" ? "up" : "down"}>Trend {trendScan.bias === "bullish" ? "Up" : "Down"}</Badge>
          )}
          <button onClick={() => open(signal.coin)} className="text-left hover:text-signal-glow">
            <p className="text-sm font-bold leading-tight">{signal.coin}</p>
            <p className="text-[11px] text-ink-faint">{signal.strategy}</p>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {confirmation && (
            <Badge
              tone={confirmation.status === "confirmed" ? "up" : confirmation.status === "invalid" ? "down" : "amber"}
              icon={<Check size={10} />}
            >
              {confirmation.statusLabel}
            </Badge>
          )}
          <StatusBadge status={status} />
          <Badge tone="neutral" icon={<Clock size={10} />}>
            {signal.timeframe}
          </Badge>
        </div>
      </div>

      {/* Chart + indikator (RSI/MACD/Volume Profile) — persis sama dengan tab Chart Analysis, sekarang melekat di tiap kartu sinyal */}
      <div className="mt-3 border-t border-line pt-3">
        <SignalChartMini
          symbol={signal.coin}
          timeframe={signal.timeframe}
          levels={{ side: signal.side, entry: signal.entry, sl: signal.sl, tp1: signal.tp1, tp2: signal.tp2, tp3: signal.tp3 ?? null }}
        />
      </div>

      <div className="mono-num mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
        <div>
          <p className="text-[10px] uppercase text-ink-faint">{signal.ideal_entry_low && signal.ideal_entry_high ? "Ideal Entry Zone" : "Entry"}</p>
          <p>
            {signal.ideal_entry_low && signal.ideal_entry_high
              ? `${formatUsd(signal.ideal_entry_low)} – ${formatUsd(signal.ideal_entry_high)}`
              : formatUsd(signal.entry)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-ink-faint">Stop Loss</p>
          <p className="text-down">{formatUsd(signal.sl)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-ink-faint">TP1 · {rr(signal.entry, signal.sl, signal.tp1)}</p>
          <p className="text-up">{formatUsd(signal.tp1)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-ink-faint">TP2 · {rr(signal.entry, signal.sl, signal.tp2)}</p>
          <p className="text-up">{formatUsd(signal.tp2)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-ink-faint">TP3 · {rr(signal.entry, signal.sl, signal.tp3)}</p>
          <p className="text-up">{signal.tp3 ? formatUsd(signal.tp3) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-ink-faint">Risk/Trade</p>
          <p className="flex items-center gap-1">
            <ShieldAlert size={11} className="text-ink-faint" /> {signal.risk_percent}%
          </p>
        </div>
      </div>

      {(macroScan?.bias !== "neutral" || whaleScan?.bias !== "neutral" || signal.expected_duration) && (
        <div className="mt-2.5 space-y-1 border-t border-line pt-2.5 text-[11px] text-ink-muted">
          {macroScan && macroScan.bias !== "neutral" && (
            <p>
              <span className={clsx("font-medium", macroScan.bias === "bullish" ? "text-up" : "text-down")}>Macro Effect: </span>
              {macroScan.detail}
            </p>
          )}
          {whaleScan && whaleScan.bias !== "neutral" && (
            <p>
              <span className={clsx("font-medium", whaleScan.bias === "bullish" ? "text-up" : "text-down")}>Whale Effect: </span>
              {whaleScan.detail}
            </p>
          )}
          {signal.expected_duration && (
            <p className="flex items-center gap-1 text-ink-faint">
              <Clock size={11} /> {signal.expected_duration}
            </p>
          )}
        </div>
      )}

      {!compact && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="eyebrow mb-2 text-[10px] uppercase tracking-wider text-ink-faint">AI Reasoning</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-2">
            {REASONING_MAP.map(({ key, label, term }) => {
              const scan = scanByKey.get(key);
              const fired = Boolean(scan && scan.bias === winningBias && scan.weight > 0);
              return (
                <Fragment key={key}>
                  <div
                    className={clsx("flex items-start gap-1.5 rounded-md px-1.5 py-1 text-[11px]", fired ? "text-ink" : "text-ink-faint/70")}
                    title={scan?.detail ?? "Belum ada data untuk kategori ini."}
                  >
                    {fired ? (
                      <Check size={13} className={clsx("mt-0.5 shrink-0", isLong ? "text-up" : "text-down")} />
                    ) : (
                      <Minus size={13} className="mt-0.5 shrink-0 text-ink-faint/50" />
                    )}
                    {term ? (
                      <KnowledgeTerm term={term}>
                        <span>{label}</span>
                      </KnowledgeTerm>
                    ) : (
                      <span>{label}</span>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {!compact && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="eyebrow mb-2 text-[10px] uppercase tracking-wider text-ink-faint">Signal Progress</p>
          <SignalProgress
            side={signal.side}
            scans={signal.scans ?? []}
            extraReasoning={signal.extra_reasoning ?? []}
            confluenceCount={signal.confluence_count}
            confluenceTotal={signal.confluence_total}
            confidence={signal.confidence}
          />
        </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">{signal.reason}</p>

      {/* Confidence / Prob. TP / Prob. SL — sama seperti bagian yang dilingkari di AI Signal, diulang di bawah Reason untuk tiap kartu */}
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-ink-faint">Confidence</span>
            <span className="mono-num font-semibold text-signal-glow">{signal.confidence}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${signal.confidence}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-signal"
            />
          </div>
        </div>
        {signal.probability_tp !== null && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-ink-faint">Prob. TP</span>
              <span className="mono-num font-semibold text-up">{signal.probability_tp}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
              <div className="h-full rounded-full bg-up" style={{ width: `${signal.probability_tp}%` }} />
            </div>
          </div>
        )}
        {signal.probability_sl !== null && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-ink-faint">Prob. SL</span>
              <span className="mono-num font-semibold text-down">{signal.probability_sl}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
              <div className="h-full rounded-full bg-down" style={{ width: `${signal.probability_sl}%` }} />
            </div>
          </div>
        )}
      </div>

      {onExecute && signal.status === "new" && (
        <div className="mt-3 space-y-2">
          <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
            {(["market", "limit", "stop"] as OrderType[]).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={clsx(
                  "flex-1 py-1.5 capitalize transition-colors",
                  orderType === t ? "bg-signal/20 text-signal-glow" : "text-ink-faint hover:text-ink"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => onExecute(orderType)}
            disabled={executing}
            className="w-full rounded-md bg-signal py-2 text-xs font-medium text-white transition-colors hover:bg-signal-glow disabled:opacity-50"
          >
            {executing
              ? "Memproses…"
              : orderType === "market"
              ? "Execute Market Order"
              : orderType === "limit"
              ? `Pasang Limit Order @ ${formatUsd(signal.entry)}`
              : "Pasang Stop Order (breakout)"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
