import clsx from "clsx";
import { Sparkles, TerminalSquare, Compass, Gauge, Waves, Landmark, Droplets, Scale } from "lucide-react";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatPct } from "@/lib/format";
import type { ReportRow, ReportTone, TerminalReport } from "@/lib/terminalReport";

/**
 * V4 "AI Snapshot" redesign — was the same divide-y row table as every
 * chat reply (via TerminalReportView), now a dedicated premium status-card
 * layout for this one spot on the dashboard. Deliberately NOT a change to
 * TerminalReportView itself: that component is still what renders the AI
 * Final Conclusion card and every AIChatDock/ElVoidChatPanel/AskNocturnBar
 * reply, and a generic chat message can't be reflowed into a fixed status
 * grid the way this one, always-the-same-shape report can. `report` is
 * still built once in app/dashboard/page.tsx by
 * lib/intelligence/marketSnapshotReport.ts — nothing below computes or
 * fetches anything; it only picks known rows out of the same object and
 * lays them out differently.
 */

// Scoped to this card only — the rest of the app's shared Badge/LiveDot
// tone maps are untouched. Follows the dashboard's color system: Bullish
// green, Bearish red, Neutral blue, Transition gold, AI purple. `signal`
// here is exactly the one metric the underlying data already tags as AI
// (marketPulse.ts's `confidence` entry has tone: "signal"), so Confidence
// reading as purple isn't a new rule — it's already true, just now shown.
const TONE_STYLES: Record<ReportTone, { text: string; bg: string; border: string }> = {
  up: { text: "text-up", bg: "bg-up/10", border: "border-up/30" },
  down: { text: "text-down", bg: "bg-down/10", border: "border-down/30" },
  amber: { text: "text-gold", bg: "bg-gold/10", border: "border-gold/30" },
  neutral: { text: "text-smartmoney-glow", bg: "bg-smartmoney/10", border: "border-smartmoney/30" },
  signal: { text: "text-signal-glow", bg: "bg-signal/10", border: "border-signal/30" },
};

function findRow(rows: ReportRow[], label: string): ReportRow | undefined {
  return rows.find((r) => r.label === label);
}

type IconType = React.ElementType;

function StatCard({ title, icon: Icon, row }: { title: string; icon: IconType; row?: ReportRow }) {
  const connected = row?.connected ?? false;
  const style = TONE_STYLES[connected && row ? row.tone : "neutral"];
  return (
    <div
      className={clsx(
        "group rounded-lg border bg-bg-surface p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card",
        connected ? style.border : "border-dashed border-line"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", connected ? style.bg : "bg-ink-faint/10")}>
          <Icon size={12} className={connected ? style.text : "text-ink-faint"} />
        </span>
        <span className="eyebrow truncate text-[9px] uppercase tracking-wide text-ink-faint">{title}</span>
      </div>
      <p className={clsx("mono-num mt-2 truncate text-[14px] font-bold", connected ? style.text : "text-ink-faint")}>
        {connected && row ? row.value : "Waiting"}
      </p>
      {row?.detail && <p className="mt-0.5 truncate text-[10px] text-ink-faint">{row.detail}</p>}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="eyebrow text-[10px] uppercase tracking-wide text-ink-faint">AI Confidence</span>
        <span className="mono-num text-xs font-bold text-signal-glow">{Math.round(clamped)}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-gradient-to-r from-signal-dim via-signal to-signal-glow shadow-glow-signal transition-[width] duration-700 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function VerdictHero({ report }: { report: TerminalReport }) {
  const statusStyle = TONE_STYLES[report.statusTone ?? "neutral"];
  const actionStyle = TONE_STYLES[report.actionTone ?? "neutral"];
  return (
    <div className="ambient-glow ambient-glow-ai relative overflow-hidden rounded-xl border border-signal/25 bg-gradient-to-br from-signal/10 via-bg-raised to-bg-raised p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-signal/30 bg-signal/15 text-signal-glow">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow text-[10px] uppercase tracking-wide text-signal-glow">AI Verdict</span>
            {report.statusLabel && (
              <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusStyle.border, statusStyle.bg, statusStyle.text)}>
                {report.statusLabel}
              </span>
            )}
          </div>
          {report.conclusion && <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{report.conclusion}</p>}
        </div>
      </div>
      {report.actionLabel && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
          <span className="text-[10px] uppercase tracking-wide text-ink-faint">Recommended</span>
          <span className={clsx("rounded-md border px-2 py-0.5 text-[11px] font-semibold", actionStyle.border, actionStyle.bg, actionStyle.text)}>
            {report.actionLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export function AISummaryCard({ report }: { report: TerminalReport }) {
  return (
    <div className="glow-card ambient-glow ambient-glow-ai animate-fadeUp overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line/70 bg-bg-raised px-4 py-2.5">
        <TerminalSquare size={13} className="shrink-0 text-signal-glow" />
        <span className="eyebrow shrink-0 text-[10px] text-signal-glow">
          {report.eyebrow}
          <span className="text-ink-faint">&lt;GO&gt;</span>
        </span>
        <span className="mono-num truncate text-[11px] font-bold tracking-widest text-ink">ELVOID AI — {report.title}</span>
        <LiveDot tone="signal" className="ml-auto shrink-0" />
      </div>

      {!report.found ? (
        <div className="px-4 py-4">
          <p className="text-[13px] leading-relaxed text-ink-muted">{report.emptyNote}</p>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <VerdictHero report={report} />

          {report.confidence !== undefined && <ConfidenceBar value={report.confidence} />}

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <StatCard title="Market Mode" icon={Compass} row={findRow(report.rows, "MARKET MODE")} />
            <StatCard title="Fear & Greed" icon={Gauge} row={findRow(report.rows, "SENTIMENT")} />
            <StatCard title="Whale Activity" icon={Waves} row={findRow(report.rows, "WHALE ACTIVITY")} />
            <StatCard title="Macro" icon={Landmark} row={findRow(report.rows, "MACRO")} />
            <StatCard title="Liquidity" icon={Droplets} row={findRow(report.rows, "LIQUIDITY")} />
            <StatCard title="Market Bias" icon={Scale} row={findRow(report.rows, "MARKET BIAS")} />
          </div>

          {report.watchlist && (
            <div>
              <p className="eyebrow text-[10px] tracking-wide text-ink-faint">WATCHLIST</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {report.watchlist.length ? (
                  report.watchlist.map((w) => (
                    <span key={w.symbol} className="mono-num flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px]">
                      <span className="text-ink">{w.symbol}</span>
                      {w.change24h !== undefined && (
                        <span className={w.change24h >= 0 ? "text-up" : "text-down"}>{formatPct(w.change24h)}</span>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-ink-faint">Belum ada kandidat yang cukup signifikan.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {report.found && report.actionNote && (
        <div className="border-t border-line/70 bg-bg-raised px-4 py-2">
          <p className="text-[10px] leading-relaxed text-ink-faint">{report.actionNote}</p>
        </div>
      )}
    </div>
  );
}
