import clsx from "clsx";
import { TerminalSquare, LineChart } from "lucide-react";
import Link from "next/link";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatPct } from "@/lib/format";
import type { ReportRow, ReportTone, TerminalReport } from "@/lib/terminalReport";

const TONE_TEXT: Record<ReportTone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-amber",
  neutral: "text-ink-muted",
  signal: "text-signal-glow",
};

const TONE_DOT: Record<ReportTone, string> = {
  up: "bg-up",
  down: "bg-down",
  amber: "bg-amber",
  neutral: "bg-ink-faint",
  signal: "bg-signal",
};

function Row({ label, value, detail, tone, connected }: ReportRow) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="eyebrow shrink-0 text-[10px] tracking-wide text-ink-faint">{label}</span>
      <span className="min-w-0 text-right">
        <span className={clsx("mono-num block truncate text-sm font-bold", connected ? TONE_TEXT[tone] : "text-ink-faint")}>
          {connected ? value : "Waiting"}
        </span>
        {detail && <span className="mono-num block truncate text-[10px] text-ink-faint">{detail}</span>}
      </span>
    </div>
  );
}

/**
 * Renders any TerminalReport (see lib/terminalReport.ts) as an "institutional
 * terminal" card — title bar, label/value rows, optional list, plain-text
 * conclusion, recommended action, watchlist. This is the one component
 * behind the AI Summary card AND every chat reply (AIChatDock,
 * ElVoidChatPanel, AskNocturnBar), so a fix or style change here is a fix
 * everywhere at once instead of three near-copies drifting apart.
 *
 * variant="card"   — standalone dashboard card (AI Summary).
 * variant="inline" — sits inside a scrolling chat log, lighter chrome.
 */
export function TerminalReportView({ report, variant = "card" }: { report: TerminalReport; variant?: "card" | "inline" }) {
  return (
    <div
      className={clsx(
        "animate-fadeUp overflow-hidden",
        variant === "card" ? "glow-card" : "rounded-lg border border-line/70 bg-bg-raised/60"
      )}
    >
      <div className={clsx("flex items-center gap-2 border-b border-line/70 px-4 py-2.5", variant === "card" && "bg-bg-raised")}>
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
        <div className="divide-y divide-line/70">
          {report.statusLabel && <Row label="STATUS" value={report.statusLabel} tone={report.statusTone ?? "neutral"} connected />}
          {report.confidence !== undefined && <Row label="CONFIDENCE" value={`${report.confidence}%`} tone="neutral" connected />}

          {report.rows.map((r, i) => (
            <Row key={`${r.label}-${i}`} {...r} />
          ))}

          {report.listItems && report.listItems.length > 0 && (
            <div className="space-y-2 px-4 py-3">
              {report.listItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={clsx("mt-1.5 h-1 w-1 shrink-0 rounded-full", TONE_DOT[item.tone ?? "neutral"])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] leading-snug text-ink">{item.primary}</p>
                    {item.secondary && <p className="mono-num text-[10px] text-ink-faint">{item.secondary}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {report.conclusion && (
            <div className="px-4 py-2.5">
              <p className="eyebrow mb-1 text-[10px] tracking-wide text-ink-faint">CONCLUSION</p>
              <p className="text-[12px] leading-relaxed text-ink-muted">{report.conclusion}</p>
            </div>
          )}

          {report.watchlist && (
            <div className="px-4 py-2.5">
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

          {report.actionLabel && (
            <Row label="RECOMMENDED ACTION" value={report.actionLabel} tone={report.actionTone ?? "neutral"} connected />
          )}

          {report.chartSymbol && (
            <div className="px-4 py-2.5">
              <Link
                href={`/ai-signal?tab=chart&symbol=${report.chartSymbol}`}
                className="flex w-fit items-center gap-1.5 rounded-md border border-signal/40 px-2.5 py-1.5 text-[11px] font-medium text-signal-glow hover:border-signal"
              >
                <LineChart size={12} /> Buka Chart {report.chartSymbol}
              </Link>
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
