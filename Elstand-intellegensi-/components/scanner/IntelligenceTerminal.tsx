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
  { key: "all", label: "All", icon: "◎" },
  { key: "pump", label: "Pump Setup", icon: "🚀" },
  { key: "momentum", label: "Momentum", icon: "📈" },
  { key: "accumulation", label: "Whale Accumulation", icon: "🐋" },
  { key: "smartMoney", label: "Smart Money", icon: "💰" },
  { key: "dumpRisk", label: "Dump Risk", icon: "📉" },
  { key: "rugPullRisk", label: "Rug Pull Risk", icon: "⚠️" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];
type SortKey = "aiScore" | "change24h" | "volume" | "marketCap";
type MobileLayout = "list" | "grid2";
const PAGE_SIZE = 50;

function filterByCategory(rows: IntelligenceRow[], key: CategoryKey): IntelligenceRow[] {
  switch (key) {
    case "pump":
      return rows.filter((r) => r.aiOpportunity >= 60);
    case "momentum":
      return rows.filter((r) => r.change24h > 5);
    case "accumulation":
      return rows.filter((r) => r.phase === "B" || r.phase === "C");
    case "smartMoney":
      return rows.filter((r) => r.whaleNetFlowUsd > 150_000);
    case "dumpRisk":
      return rows.filter((r) => r.change24h < -5 || r.aiRisk >= 60);
    case "rugPullRisk":
      return rows.filter((r) => r.aiRisk >= 70);
    default:
      return rows;
  }
}

function sortRows(rows: IntelligenceRow[], key: SortKey): IntelligenceRow[] {
  const sorted = [...rows];
  switch (key) {
    case "change24h":
      return sorted.sort((a, b) => b.change24h - a.change24h);
    case "volume":
      return sorted.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    case "marketCap":
      return sorted.sort((a, b) => b.marketCapUsd - a.marketCapUsd);
    default:
      return sorted.sort((a, b) => b.aiOpportunity - a.aiOpportunity);
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

function riskBand(risk: number): { label: string; textClass: string } {
  if (risk >= 70) return { label: "Critical", textClass: "text-rugpull-glow" };
  if (risk >= 45) return { label: "Medium", textClass: "text-amber" };
  return { label: "Low", textClass: "text-up" };
}

function scoreColor(score: number): string {
  if (score >= 80) return "#00E676";
  if (score >= 60) return "#A78BFA";
  if (score >= 40) return "#F5B942";
  return "#FF5252";
}

function clampPct(n: number) {
  return Math.max(0, Math.min(100, n));
}

/** Circular AI Score gauge — plain SVG ring, colored by score band, no extra deps. */
function ScoreRing({ score }: { score: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const filled = (clampPct(score) / 100) * c;
  const color = scoreColor(score);
  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${filled} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="mono-num absolute text-[10px] font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

/** Real 7d sparkline from CoinGecko price points — no synthetic data; renders empty if too thin to draw. */
function Sparkline({ points, positive }: { points?: number[]; positive: boolean }) {
  if (!points || points.length < 2) return <div className="h-8 w-20 shrink-0" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - ((p - min) / range) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-20 shrink-0">
      <path d={d} fill="none" stroke={positive ? "#00E676" : "#FF5252"} strokeWidth="1.5" />
    </svg>
  );
}

function FilterBar({ sort, setSort }: { sort: SortKey; setSort: (s: SortKey) => void }) {
  const selectCls = "rounded-lg border border-line bg-panel/60 px-2.5 py-1.5 text-xs text-ink-muted";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select className={selectCls} disabled title="Watchlist saat ini cuma cover pair Binance Futures + top 150 CoinGecko — multi-chain belum tersedia">
        <option>All Chains</option>
      </select>
      <select className={selectCls} disabled title="Belum diwire — placeholder untuk fase Custom Filter">
        <option>Market Cap: All</option>
      </select>
      <select className={selectCls} disabled title="Belum diwire — placeholder untuk fase Custom Filter">
        <option>Liquidity: All</option>
      </select>
      <select className={selectCls} disabled title="Belum diwire — placeholder untuk fase Custom Filter">
        <option>Volume 24H: All</option>
      </select>
      <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={clsx(selectCls, "text-ink")}>
        <option value="aiScore">Sort: AI Score</option>
        <option value="change24h">Sort: 24h %</option>
        <option value="volume">Sort: Volume</option>
        <option value="marketCap">Sort: Market Cap</option>
      </select>
    </div>
  );
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
  const [sort, setSort] = useState<SortKey>("aiScore");
  const [page, setPage] = useState(1);
  const [mobileLayout, setMobileLayout] = useState<MobileLayout>("list");
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const { open } = useTokenAnalyzer();

  const filtered = useMemo(() => sortRows(filterByCategory(rows, category), sort), [rows, category, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function changeCategory(key: CategoryKey) {
    setCategory(key);
    setPage(1);
  }

  function toggleStar(id: string) {
    setStarred((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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
            onClick={() => changeCategory(c.key)}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              category === c.key ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-muted hover:text-ink"
            )}
          >
            <span>{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <FilterBar sort={sort} setSort={setSort} />
        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5 md:hidden">
          <button
            onClick={() => setMobileLayout("list")}
            className={clsx("rounded px-2 py-1 text-xs", mobileLayout === "list" ? "bg-signal/15 text-signal-glow" : "text-ink-faint")}
            aria-label="1 kolom"
          >
            ▤
          </button>
          <button
            onClick={() => setMobileLayout("grid2")}
            className={clsx("rounded px-2 py-1 text-xs", mobileLayout === "grid2" ? "bg-signal/15 text-signal-glow" : "text-ink-faint")}
            aria-label="2 kolom"
          >
            ▦
          </button>
        </div>
      </div>

      {/* Desktop: dense table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
        <table className="mono-num w-full min-w-[1200px] text-left text-xs">
          <thead className="border-b border-line bg-panel/70 text-[10px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-2 py-2"></th>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Coin</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">24h %</th>
              <th className="px-3 py-2">Volume</th>
              <th className="px-3 py-2">Mkt Cap</th>
              <th className="px-3 py-2">Funding</th>
              <th className="px-3 py-2">OI (USD)</th>
              <th className="px-3 py-2">OI 24h %</th>
              <th className="px-3 py-2">L/S</th>
              <th className="px-3 py-2">Whale Flow 24h</th>
              <th className="px-3 py-2">7d</th>
              <th className="px-3 py-2">AI Score</th>
              <th className="px-3 py-2">Signal</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => {
              const risk = riskBand(r.aiRisk);
              return (
                <tr key={r.id} className="border-b border-line/60 hover:bg-panel/50">
                  <td className="px-2 py-2">
                    <button onClick={() => toggleStar(r.id)} className={starred.has(r.id) ? "text-gold" : "text-ink-faint hover:text-ink-muted"}>
                      ★
                    </button>
                  </td>
                  <td className="cursor-pointer px-3 py-2 text-ink-faint" onClick={() => open(r.symbol)}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="cursor-pointer px-3 py-2" onClick={() => open(r.symbol)}>
                    <span className="font-bold text-ink">{r.symbol}</span>
                    <span className="ml-1.5 text-[10px] text-ink-faint">{r.name}</span>
                  </td>
                  <td className="px-3 py-2">{formatUsd(r.price)}</td>
                  <td className={clsx("px-3 py-2", r.change24h >= 0 ? "text-up" : "text-down")}>{formatPct(r.change24h)}</td>
                  <td className="px-3 py-2 text-ink-muted">{formatUsd(r.volume24hUsd)}</td>
                  <td className="px-3 py-2 text-ink-muted">{formatUsd(r.marketCapUsd)}</td>
                  <td className="px-3 py-2">
                    {r.derivatives.hasData && r.derivatives.fundingRate !== undefined ? (
                      <span className={r.derivatives.fundingRate >= 0 ? "text-up" : "text-down"}>{(r.derivatives.fundingRate * 100).toFixed(4)}%</span>
                    ) : (
                      <span className="text-ink-faint">N/A</span>
                    )}
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
                  <td className="px-3 py-2">
                    <Sparkline points={r.sparkline7d} positive={r.change24h >= 0} />
                  </td>
                  <td className="px-3 py-2">
                    <ScoreRing score={r.aiOpportunity} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <Badge
                        tone={signalTone(r) === "amber" ? "amber" : signalTone(r) === "rugpull" ? "rugpull" : signalTone(r) === "smartmoney" ? "smartmoney" : signalTone(r) === "up" ? "up" : "down"}
                      >
                        {signalLabel(r)}
                      </Badge>
                      {r.phase && <span className="text-[10px] text-ink-faint">Phase {r.phase}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={clsx("font-semibold", risk.textClass)}>{r.aiRisk}</span>
                    <span className="ml-1 text-[10px] text-ink-faint">{risk.label}</span>
                  </td>
                  <td className="px-3 py-2 text-signal-glow">
                    <button onClick={() => open(r.symbol)}>Details</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pageRows.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">Tidak ada koin di kategori ini saat ini.</p>}

        <div className="flex items-center justify-between border-t border-line px-3 py-2.5 text-[11px] text-ink-faint">
          <span>
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} results
          </span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-line px-2 py-1 disabled:opacity-30">
              ‹
            </button>
            <span className="mono-num">
              {page} / {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded border border-line px-2 py-1 disabled:opacity-30">
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: stacked or 2-col intelligence cards */}
      <div className={clsx("md:hidden", mobileLayout === "grid2" ? "grid grid-cols-2 gap-2.5" : "space-y-2.5")}>
        {pageRows.map((r) => {
          const risk = riskBand(r.aiRisk);
          return (
            <button key={r.id} onClick={() => open(r.symbol)} className="w-full rounded-xl border border-line bg-panel/60 p-3 text-left active:bg-panel/80">
              <div className="flex items-center justify-between gap-1.5">
                <div className="min-w-0">
                  <span className="text-sm font-bold">{r.symbol}</span>
                  {mobileLayout === "list" && <span className="ml-1.5 text-[11px] text-ink-faint">{r.name}</span>}
                </div>
                <Badge
                  size="sm"
                  tone={signalTone(r) === "amber" ? "amber" : signalTone(r) === "rugpull" ? "rugpull" : signalTone(r) === "smartmoney" ? "smartmoney" : signalTone(r) === "up" ? "up" : "down"}
                >
                  AI {r.aiOpportunity}
                </Badge>
              </div>

              <div className="mono-num mt-1 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{formatUsd(r.price)}</span>
                  <span className={clsx("text-xs", r.change24h >= 0 ? "text-up" : "text-down")}>{formatPct(r.change24h)}</span>
                </div>
                {mobileLayout === "list" && <Sparkline points={r.sparkline7d} positive={r.change24h >= 0} />}
              </div>

              <div className="mono-num mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
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

              <div className="mono-num mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ink-muted">
                <span>Vol {formatUsd(r.volume24hUsd)}</span>
                <span>MCap {formatUsd(r.marketCapUsd)}</span>
              </div>
              <div className="mono-num text-[10px]">
                <span className={r.whaleNetFlowUsd >= 0 ? "text-up" : "text-down"}>Whale {r.whaleNetFlowUsd === 0 ? "N/A" : formatUsd(r.whaleNetFlowUsd)}</span>
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-ink-muted">{r.phase ? `Phase ${r.phase}` : signalLabel(r)}</span>
                <span className={clsx("font-semibold", risk.textClass)}>
                  Risk {r.aiRisk} · {risk.label}
                </span>
              </div>
            </button>
          );
        })}
        {pageRows.length === 0 && <p className="col-span-full py-10 text-center text-sm text-ink-muted">Tidak ada koin di kategori ini saat ini.</p>}
      </div>

      <div className="flex items-center justify-between text-[11px] text-ink-faint md:hidden">
        <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-line px-2.5 py-1 disabled:opacity-30">
          Prev
        </button>
        <span>
          Page {page} / {totalPages} · {filtered.length} coins
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded border border-line px-2.5 py-1 disabled:opacity-30">
          Next
        </button>
      </div>

      <p className="text-center text-[11px] text-ink-faint">
        Funding/OI/L-S real hanya untuk pair di watchlist Binance Futures — pair lain tampil N/A, bukan angka karangan. AI Opportunity/Risk dihitung deterministik dari sinyal live, bukan random.
      </p>
    </div>
  );
}
