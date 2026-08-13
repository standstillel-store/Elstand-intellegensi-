"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { useTokenAnalyzer } from "@/components/token-analyzer/TokenAnalyzerContext";
import { formatUsd, formatPct } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import type { IntelligenceRow, DerivativesOverview } from "@/lib/derivatives";
import { DERIVATIVES_WATCHLIST } from "@/lib/binance";
import { LiveLiquidations } from "@/components/scanner/LiveLiquidations";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "pump", label: "Top Pump" },
  { key: "momentum", label: "Momentum" },
  { key: "accumulation", label: "Accumulation" },
  { key: "smartMoney", label: "Smart Money" },
  { key: "dumpRisk", label: "Dump Risk" },
  { key: "rugPullRisk", label: "Rug Pull Risk" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

function filterByCategory(rows: IntelligenceRow[], key: CategoryKey): IntelligenceRow[] {
  switch (key) {
    case "pump":
      return rows.filter((r) => r.aiOpportunity >= 60).sort((a, b) => b.aiOpportunity - a.aiOpportunity);
    case "momentum":
      return rows.filter((r) => r.change24h > 5).sort((a, b) => b.change24h - a.change24h);
    case "accumulation":
      return rows.filter((r) => r.phase === "B" || r.phase === "C").sort((a, b) => b.whaleNetFlowUsd - a.whaleNetFlowUsd);
    case "smartMoney":
      return rows.filter((r) => r.whaleNetFlowUsd > 150_000).sort((a, b) => b.whaleNetFlowUsd - a.whaleNetFlowUsd);
    case "dumpRisk":
      return rows.filter((r) => r.change24h < -5 || r.aiRisk >= 60).sort((a, b) => b.aiRisk - a.aiRisk);
    case "rugPullRisk":
      return rows.filter((r) => r.aiRisk >= 70).sort((a, b) => b.aiRisk - a.aiRisk);
    default:
      return rows.sort((a, b) => b.aiOpportunity - a.aiOpportunity);
  }
}

function signalTone(row: IntelligenceRow): "up" | "down" | "rugpull" | "smartmoney" | "amber" {
  if (row.aiRisk >= 70) return "rugpull";
  if (row.aiRisk >= 45 && row.aiRisk > row.aiOpportunity) return "amber";
  if (row.phase === "C" || row.whaleNetFlowUsd > 250_000) return "smartmoney";
  if (row.aiOpportunity >= 55) return "up";
  return "down";
}

function signalLabel(row: IntelligenceRow): string {
  if (row.aiRisk >= 70) return "Rug Pull Risk";
  if (row.aiRisk >= 45 && row.aiRisk > row.aiOpportunity) return "Dump Risk";
  if (row.phase) return row.phaseLabel;
  return "Neutral";
}

function DerivCell({ value, suffix = "", tone }: { value?: number; suffix?: string; tone?: "up" | "down" }) {
  if (value === undefined) return <span className="text-ink-faint">N/A</span>;
  const cls = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink";
  return <span className={cls}>{value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}{suffix}</span>;
}

function OverviewStrip({ overview }: { overview: DerivativesOverview }) {
  const fundingPct = overview.avgFundingRate * 100;
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wide text-signal-glow">DERIVATIVES OVERVIEW</span>
        <span className="text-[10px] text-ink-faint">{overview.coveredSymbols} pairs tracked (Binance Futures watchlist)</span>
      </div>
      <div className="mono-num grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <p className="text-ink-faint">TOTAL OI</p>
          <p className="text-sm font-semibold">{formatUsd(overview.totalOpenInterestUsd)}</p>
        </div>
        <div>
          <p className="text-ink-faint">OI 24H CHANGE</p>
          <p className={clsx("text-sm font-semibold", (overview.totalOpenInterestChangePct ?? 0) >= 0 ? "text-up" : "text-down")}>
            {overview.totalOpenInterestChangePct !== undefined ? formatPct(overview.totalOpenInterestChangePct) : "N/A"}
          </p>
        </div>
        <div>
          <p className="text-ink-faint">AVG FUNDING</p>
          <p className={clsx("text-sm font-semibold", fundingPct >= 0 ? "text-up" : "text-down")}>{fundingPct.toFixed(4)}%</p>
        </div>
        <div>
          <p className="text-ink-faint">LONG/SHORT RATIO</p>
          <p className="text-sm font-semibold">{overview.longShortRatio !== undefined ? overview.longShortRatio.toFixed(2) : "N/A"}</p>
        </div>
        <div>
          <p className="text-ink-faint">LIQUIDATIONS</p>
          <p className="text-sm font-semibold text-ink-muted">See live feed →</p>
        </div>
      </div>
    </div>
  );
}

export function IntelligenceTerminal({ rows, overview }: { rows: IntelligenceRow[]; overview: DerivativesOverview }) {
  const [category, setCategory] = useState<CategoryKey>("all");
  const { open } = useTokenAnalyzer();

  const filtered = useMemo(() => filterByCategory(rows, category).slice(0, 50), [rows, category]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <OverviewStrip overview={overview} />
        <LiveLiquidations watchlistSymbols={DERIVATIVES_WATCHLIST.map((p) => p.replace("USDT", ""))} />
      </div>

      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={clsx(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              category === c.key ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-muted hover:text-ink"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Desktop: dense table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
        <table className="mono-num w-full min-w-[1100px] text-left text-xs">
          <thead className="border-b border-line bg-panel/70 text-[10px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Coin</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">24h %</th>
              <th className="px-3 py-2">Volume</th>
              <th className="px-3 py-2">Mkt Cap</th>
              <th className="px-3 py-2">Funding</th>
              <th className="px-3 py-2">OI</th>
              <th className="px-3 py-2">OI Chg</th>
              <th className="px-3 py-2">L/S</th>
              <th className="px-3 py-2">Whale Flow</th>
              <th className="px-3 py-2">AI Opp</th>
              <th className="px-3 py-2">AI Risk</th>
              <th className="px-3 py-2">Signal</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id} onClick={() => open(r.symbol)} className="cursor-pointer border-b border-line/60 hover:bg-panel/50">
                <td className="px-3 py-2 text-ink-faint">{i + 1}</td>
                <td className="px-3 py-2">
                  <span className="font-bold text-ink">{r.symbol}</span>
                  <span className="ml-1.5 text-[10px] text-ink-faint">{r.name}</span>
                </td>
                <td className="px-3 py-2">{formatUsd(r.price)}</td>
                <td className={clsx("px-3 py-2", r.change24h >= 0 ? "text-up" : "text-down")}>{formatPct(r.change24h)}</td>
                <td className="px-3 py-2 text-ink-muted">{formatUsd(r.volume24hUsd)}</td>
                <td className="px-3 py-2 text-ink-muted">{formatUsd(r.marketCapUsd)}</td>
                <td className="px-3 py-2">
                  {r.derivatives.hasData ? <DerivCell value={r.derivatives.fundingRate! * 100} suffix="%" tone={r.derivatives.fundingRate! >= 0 ? "up" : "down"} /> : <span className="text-ink-faint">N/A</span>}
                </td>
                <td className="px-3 py-2">{r.derivatives.hasData && r.derivatives.openInterestUsd ? formatUsd(r.derivatives.openInterestUsd) : <span className="text-ink-faint">N/A</span>}</td>
                <td className="px-3 py-2">
                  {r.derivatives.hasData && r.derivatives.openInterestChangePct !== undefined ? (
                    <span className={r.derivatives.openInterestChangePct >= 0 ? "text-up" : "text-down"}>{formatPct(r.derivatives.openInterestChangePct)}</span>
                  ) : (
                    <span className="text-ink-faint">N/A</span>
                  )}
                </td>
                <td className="px-3 py-2">{r.derivatives.hasData && r.derivatives.longShortRatio !== undefined ? r.derivatives.longShortRatio.toFixed(2) : <span className="text-ink-faint">N/A</span>}</td>
                <td className="px-3 py-2">
                  <span className={r.whaleNetFlowUsd >= 0 ? "text-up" : "text-down"}>
                    {r.whaleNetFlowUsd === 0 ? "N/A" : `${r.whaleNetFlowUsd >= 0 ? "+" : ""}${formatUsd(r.whaleNetFlowUsd)}`}
                  </span>
                </td>
                <td className="px-3 py-2 font-semibold text-signal-glow">{r.aiOpportunity}</td>
                <td className={clsx("px-3 py-2 font-semibold", r.aiRisk >= 60 ? "text-rugpull-glow" : "text-ink-muted")}>{r.aiRisk}</td>
                <td className="px-3 py-2">
                  <Badge tone={signalTone(r) === "amber" ? "amber" : signalTone(r) === "rugpull" ? "rugpull" : signalTone(r) === "smartmoney" ? "smartmoney" : signalTone(r) === "up" ? "up" : "down"}>
                    {signalLabel(r)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-signal-glow">Details</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">Tidak ada koin di kategori ini saat ini.</p>}
      </div>

      {/* Mobile: stacked intelligence cards */}
      <div className="space-y-2.5 md:hidden">
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => open(r.symbol)}
            className="w-full rounded-xl border border-line bg-panel/60 p-3.5 text-left active:bg-panel/80"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold">{r.symbol}</span>
                <span className="ml-1.5 text-[11px] text-ink-faint">{r.name}</span>
              </div>
              <Badge tone={signalTone(r) === "amber" ? "amber" : signalTone(r) === "rugpull" ? "rugpull" : signalTone(r) === "smartmoney" ? "smartmoney" : signalTone(r) === "up" ? "up" : "down"}>
                AI {r.aiOpportunity}
              </Badge>
            </div>
            <div className="mono-num mt-1 flex items-center gap-2 text-sm">
              <span className="font-semibold">{formatUsd(r.price)}</span>
              <span className={r.change24h >= 0 ? "text-up" : "text-down"}>{formatPct(r.change24h)}</span>
            </div>

            <div className="mono-num mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <p className="text-ink-faint">FUNDING</p>
                <p>{r.derivatives.hasData ? `${(r.derivatives.fundingRate! * 100).toFixed(4)}%` : "N/A"}</p>
              </div>
              <div>
                <p className="text-ink-faint">OI</p>
                <p>{r.derivatives.hasData && r.derivatives.openInterestUsd ? formatUsd(r.derivatives.openInterestUsd) : "N/A"}</p>
              </div>
              <div>
                <p className="text-ink-faint">L/S</p>
                <p>{r.derivatives.hasData && r.derivatives.longShortRatio !== undefined ? r.derivatives.longShortRatio.toFixed(2) : "N/A"}</p>
              </div>
            </div>

            <div className="mono-num mt-2 flex items-center justify-between text-[11px] text-ink-muted">
              <span>Vol {formatUsd(r.volume24hUsd)}</span>
              <span>MCap {formatUsd(r.marketCapUsd)}</span>
              <span className={r.whaleNetFlowUsd >= 0 ? "text-up" : "text-down"}>
                Whale {r.whaleNetFlowUsd === 0 ? "N/A" : formatUsd(r.whaleNetFlowUsd)}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-ink-muted">{signalLabel(r)}{r.phase ? ` · Phase ${r.phase}` : ""}</span>
              <span className={clsx("font-semibold", r.aiRisk >= 60 ? "text-rugpull-glow" : "text-ink-faint")}>Risk {r.aiRisk}</span>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">Tidak ada koin di kategori ini saat ini.</p>}
      </div>

      <p className="text-center text-[11px] text-ink-faint">
        Funding/OI/L-S real hanya untuk pair di watchlist Binance Futures — pair lain tampil N/A, bukan angka karangan. AI Opportunity/Risk dihitung deterministik dari sinyal live, bukan random.
      </p>
    </div>
  );
}
