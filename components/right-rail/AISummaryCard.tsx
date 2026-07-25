import { TerminalReportView } from "@/components/ui/TerminalReportView";
import type { TerminalReport } from "@/lib/terminalReport";

/**
 * V3 "AI Summary" redesign — was a Sparkles-icon paragraph, now the same
 * terminal card format as the AI Final Conclusion card and every chat
 * reply. `report` is built once in app/dashboard/page.tsx by reshaping the
 * same sentiment/pulse/final-conclusion numbers already shown elsewhere on
 * the page (lib/intelligence/marketSnapshotReport.ts) — nothing here
 * computes anything new.
 */
export function AISummaryCard({ report }: { report: TerminalReport }) {
  return <TerminalReportView report={report} variant="card" />;
}
