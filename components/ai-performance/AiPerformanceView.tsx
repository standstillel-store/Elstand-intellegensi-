import Link from "next/link";
import clsx from "clsx";
import { LayoutDashboard, ClipboardList, Wallet, Briefcase, LineChart } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { SectionHeader } from "@/components/SectionHeader";
import { EquityCurveChart } from "@/components/paper-trader/EquityCurveChart";
import { Disclaimer } from "@/components/Disclaimer";
import { formatUsd } from "@/lib/format";
import type { AiSignal, AiStatistics, PaperWallet } from "@/lib/elvoid/types";
import type { PerformanceReport } from "@/lib/elvoid/performance";
import type { JournalWithSignal } from "@/lib/elvoid/types";

// One value formatter shared by every KPI on this page so the "don't show
// 0% with zero closed trades, show N/A" rule (spec §4/§18) is enforced in
// exactly one place instead of re-implemented per card.
function na(hasData: boolean, value: string): string {
  return hasData ? value : "N/A";
}

// Mobile-only in-page tab bar (per reference screenshot) — these are anchor
// jumps to sections on THIS page, not separate routes/hamburger items.
const MOBILE_TABS = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#ai-journal", label: "AI Journal", icon: ClipboardList },
  { href: "#paper-trader", label: "Paper Trader", icon: Wallet },
  { href: "#portfolio", label: "Portfolio", icon: Briefcase },
  { href: "#performance", label: "Performance", icon: LineChart },
];

function ResultBadge({ result }: { result: string }) {
  const win = result === "win";
  return (
    <span
      className={clsx(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
        win ? "bg-up/15 text-up" : "bg-down/15 text-down"
      )}
    >
      {win ? "WIN" : "LOSS"}
    </span>
  );
}

export function AiPerformanceView({
  wallet,
  stats,
  openSignals,
  report,
  recentJournal,
}: {
  wallet: PaperWallet;
  stats: AiStatistics;
  openSignals: AiSignal[];
  report: PerformanceReport;
  recentJournal: JournalWithSignal[];
}) {
  const hasClosedTrades = stats.total_trade > 0;
  // Expectancy: average realized result per closed trade, in the same
  // profit_percent unit ai_journal already stores — no new metric invented.
  const expectancy = hasClosedTrades ? stats.total_profit / stats.total_trade : null;

  const totalRisk = openSignals.reduce((s, sig) => s + sig.risk_percent, 0) || 1;
  const allocationMap = new Map<string, { coin: string; side: "LONG" | "SHORT"; risk: number; count: number }>();
  for (const s of openSignals) {
    const key = `${s.coin}-${s.side}`;
    const prev = allocationMap.get(key) ?? { coin: s.coin, side: s.side, risk: 0, count: 0 };
    prev.risk += s.risk_percent;
    prev.count += 1;
    allocationMap.set(key, prev);
  }
  const allocation = [...allocationMap.values()].sort((a, b) => b.risk - a.risk).slice(0, 6);

  const winCount = recentJournal.filter((e) => e.result === "win").length;
  const lossCount = recentJournal.length - winCount;

  return (
    <div className="space-y-5 pb-16 lg:pb-0">
      <Disclaimer />

      {/* ===== TOP KPI STRIP — real data only, N/A when no closed trades ===== */}
      <section id="overview" className="scroll-mt-20">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="AI Win Rate"
            value={na(hasClosedTrades, `${stats.win_rate.toFixed(1)}%`)}
            hint={hasClosedTrades ? `${stats.wins} Win / ${stats.total_trade} Trades` : "No closed trades yet"}
            tone={hasClosedTrades ? (stats.win_rate >= 50 ? "up" : "down") : "neutral"}
          />
          <StatCard label="Closed Trades" value={String(stats.total_trade)} hint="Closed only — open positions excluded" />
          <StatCard
            label="Profit Factor"
            value={na(hasClosedTrades, stats.profit_factor.toFixed(2))}
            hint="Gross Profit / Loss"
            tone={hasClosedTrades ? (stats.profit_factor >= 1 ? "up" : "down") : "neutral"}
          />
          <StatCard label="Avg RR" value={na(hasClosedTrades, `${stats.average_rr.toFixed(2)}R`)} hint="Average realized R-multiple" />
          <StatCard
            label="Expectancy"
            value={expectancy === null ? "N/A" : `${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(2)}%`}
            hint="Per trade"
            tone={expectancy === null ? "neutral" : expectancy >= 0 ? "up" : "down"}
          />
          <StatCard
            label="Max Drawdown"
            value={na(hasClosedTrades, `-${stats.max_drawdown.toFixed(1)}%`)}
            hint="From equity peak"
            tone={hasClosedTrades ? "down" : "neutral"}
          />
        </div>
      </section>

      {/* ===== EQUITY CURVE + PERFORMANCE BREAKDOWN ===== */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <EquityCurveChart points={report.equityCurve} />

        <div className="glow-card p-4">
          <SectionHeader code="PBD" title="Performance Breakdown" />
          {!hasClosedTrades ? (
            <p className="py-6 text-center text-sm text-ink-muted">No sufficient closed-trade data yet.</p>
          ) : (
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Winning Trades</dt>
                <dd className="mono-num text-up">
                  {stats.wins} ({stats.win_rate.toFixed(1)}%)
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Losing Trades</dt>
                <dd className="mono-num text-down">
                  {stats.losses} ({(100 - stats.win_rate).toFixed(1)}%)
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2">
                <dt className="text-ink-muted">Profit Factor</dt>
                <dd className="mono-num">{stats.profit_factor.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Expectancy</dt>
                <dd className="mono-num">{expectancy !== null ? `${expectancy.toFixed(2)}%` : "N/A"}</dd>
              </div>
              {report.bestCoin && (
                <div className="flex justify-between border-t border-line pt-2">
                  <dt className="text-ink-muted">Best Coin</dt>
                  <dd className="mono-num text-up">
                    {report.bestCoin.coin} (+{report.bestCoin.totalProfit.toFixed(1)}%)
                  </dd>
                </div>
              )}
              {report.worstCoin && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Worst Coin</dt>
                  <dd className="mono-num text-down">
                    {report.worstCoin.coin} ({report.worstCoin.totalProfit.toFixed(1)}%)
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      {/* ===== RECENT AI TRADES (from ai_journal x ai_signals — real data) ===== */}
      <div id="ai-journal" className="glow-card scroll-mt-20 p-4">
        <SectionHeader code="JRN" title="Recent AI Trades (Journal)" />
        {recentJournal.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">Belum ada trade yang ditutup.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-ink-faint">
                <tr>
                  <th className="pb-2 font-medium">Pair</th>
                  <th className="pb-2 font-medium">Side</th>
                  <th className="pb-2 font-medium">RR</th>
                  <th className="pb-2 font-medium">Result</th>
                  <th className="pb-2 font-medium">AI Conf.</th>
                  <th className="pb-2 font-medium">Profit%</th>
                  <th className="pb-2 font-medium">Closed</th>
                </tr>
              </thead>
              <tbody>
                {recentJournal.map((e) => (
                  <tr key={e.id} className="border-t border-line/60">
                    <td className="py-2 font-medium">{e.signal?.coin ?? "—"}</td>
                    <td className={clsx("py-2", e.signal?.side === "LONG" ? "text-up" : "text-down")}>{e.signal?.side ?? "—"}</td>
                    <td className="mono-num py-2">{e.rr.toFixed(2)}R</td>
                    <td className="py-2">
                      <ResultBadge result={e.result} />
                    </td>
                    <td className="mono-num py-2">{e.signal?.confidence ?? "—"}%</td>
                    <td className={clsx("mono-num py-2", e.profit_percent >= 0 ? "text-up" : "text-down")}>
                      {e.profit_percent >= 0 ? "+" : ""}
                      {e.profit_percent.toFixed(2)}%
                    </td>
                    <td className="py-2 text-ink-faint">{new Date(e.closed_at).toLocaleDateString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link href="/ai-journal" className="mt-3 inline-block text-xs font-medium text-signal hover:underline">
          View Full Journal →
        </Link>
      </div>

      {/* ===== PAPER TRADING SUMMARY (same wallet, not a duplicate) ===== */}
      <div id="paper-trader" className="grid gap-4 sm:grid-cols-2">
        <div className="glow-card scroll-mt-20 p-4">
          <SectionHeader code="PPT" title="Paper Trading" />
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Virtual Balance</dt>
              <dd className="mono-num">{formatUsd(wallet.balance)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Equity</dt>
              <dd className="mono-num">{formatUsd(wallet.equity)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Open Positions</dt>
              <dd className="mono-num">{openSignals.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Total PnL</dt>
              <dd className={clsx("mono-num", wallet.total_profit >= 0 ? "text-up" : "text-down")}>
                {wallet.total_profit >= 0 ? "+" : ""}
                {formatUsd(wallet.total_profit)}
              </dd>
            </div>
          </dl>
          <Link href="/paper-trader" className="mt-3 inline-block text-xs font-medium text-signal hover:underline">
            View Paper Trade Details →
          </Link>
        </div>

        {/* ===== PORTFOLIO — allocation lens over the same paper wallet ===== */}
        <div id="portfolio" className="glow-card scroll-mt-20 p-4">
          <SectionHeader code="PRT" title="Portfolio" />
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Equity</dt>
              <dd className="mono-num">{formatUsd(wallet.equity)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Return</dt>
              <dd className={clsx("mono-num", wallet.total_profit >= 0 ? "text-up" : "text-down")}>
                {((wallet.total_profit / (wallet.balance - wallet.total_profit || 1)) * 100).toFixed(2)}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Open Positions</dt>
              <dd className="mono-num">{openSignals.length}</dd>
            </div>
          </dl>
          {allocation.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {allocation.map((a) => (
                <div key={`${a.coin}-${a.side}`} className="flex items-center justify-between text-[11px]">
                  <span>
                    {a.coin} <span className={a.side === "LONG" ? "text-up" : "text-down"}>{a.side}</span>
                  </span>
                  <span className="mono-num text-ink-muted">{((a.risk / totalRisk) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
          <Link href="/portfolio" className="mt-3 inline-block text-xs font-medium text-signal hover:underline">
            View Portfolio Details →
          </Link>
        </div>
      </div>

      {/* ===== SIGNAL RELIABILITY ===== */}
      <div id="performance" className="glow-card scroll-mt-20 p-4">
        <SectionHeader code="REL" title="AI Signal Reliability" />
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
          <div>
            <p className="text-[11px] uppercase text-ink-faint">Avg Confidence</p>
            <p className="mono-num text-lg font-semibold">{report.avgConfidence !== null ? `${report.avgConfidence.toFixed(0)}%` : "N/A"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-ink-faint">Sample Size</p>
            <p className="mono-num text-lg font-semibold">{stats.total_trade}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-ink-faint">Best Setup</p>
            <p className="text-sm font-medium">{report.bestSetup ? `${report.bestSetup.setup} (${report.bestSetup.winRate}%)` : "N/A"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-ink-faint">Recent Win/Loss</p>
            <p className="mono-num text-lg font-semibold">
              <span className="text-up">{winCount}W</span> / <span className="text-down">{lossCount}L</span>
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink-faint">
          Signal Quality dan Stability butuh minimal 50 closed trades untuk dianggap stabil secara statistik — di
          bawah itu tetap ditampilkan sebagai indikasi awal, bukan kesimpulan final.
        </p>
      </div>

      {/* ===== Mobile in-page tab bar — anchor jumps within this page ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_TABS.map((tab) => (
          <a
            key={tab.href}
            href={tab.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-ink-faint hover:text-ink-muted"
          >
            <tab.icon size={16} />
            {tab.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
