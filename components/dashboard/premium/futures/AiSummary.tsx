import { Bot } from "lucide-react";
import { timeAgo } from "@/lib/format";
import type { FuturesIntelligenceSummary } from "@/lib/intelligence/premiumFuturesIntelligence";

/**
 * Real ELVOID Intelligence connector card. Replaces the old
 * AiSummaryIsolated static placeholder now that Phase 8.5 wires
 * ELSTAND PREMIUM Futures to the existing ELVOID PRO ORACLE pipeline
 * (see lib/intelligence/premiumFuturesIntelligence.ts).
 *
 * Every value rendered here is copied straight from the Oracle response
 * normalized by that adapter — nothing here computes, infers, or
 * fabricates direction/confidence/grade/evidence. A field that the Oracle
 * didn't return is simply omitted, never replaced with a placeholder.
 */

const STATUS_LABEL: Record<FuturesIntelligenceSummary["status"], string> = {
  CONNECTED: "Connected",
  NO_TRADE: "No Trade",
  INSUFFICIENT_CONTEXT: "Insufficient Context",
  DATA_UNAVAILABLE: "Data Unavailable",
  MEMBERSHIP_REQUIRED: "Membership Required",
  CONNECTOR_ERROR: "Connector Error",
};

function StatusBadge({ status }: { status: FuturesIntelligenceSummary["status"] }) {
  const tone = status === "CONNECTED" ? "text-up border-up/40" : status === "NO_TRADE" ? "text-ink-faint border-line" : "text-down border-down/40";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${tone}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function Header({ status }: { status: FuturesIntelligenceSummary["status"] }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        <Bot size={12} />
        AI Summary
      </span>
      <StatusBadge status={status} />
    </div>
  );
}

export function AiSummary({ data, loading }: { data: FuturesIntelligenceSummary | null; loading: boolean }) {
  if (loading && !data) {
    return (
      <div className="rounded-lg border border-line bg-bg/40 p-3">
        <Header status="CONNECTED" />
        <p className="text-[12px] leading-relaxed text-ink-muted">Loading ELVOID intelligence…</p>
      </div>
    );
  }

  if (!data || data.status === "DATA_UNAVAILABLE" || data.status === "CONNECTOR_ERROR") {
    return (
      <div className="rounded-lg border border-line bg-bg/40 p-3">
        <Header status={data?.status ?? "DATA_UNAVAILABLE"} />
        <p className="text-[12px] leading-relaxed text-ink-muted">
          {data?.error ?? "ELVOID Intelligence Core is unavailable right now."}
        </p>
      </div>
    );
  }

  if (data.status === "MEMBERSHIP_REQUIRED") {
    return (
      <div className="rounded-lg border border-line bg-bg/40 p-3">
        <Header status={data.status} />
        <p className="text-[12px] leading-relaxed text-ink-muted">ELVOID Intelligence requires an active membership.</p>
      </div>
    );
  }

  if (data.status === "INSUFFICIENT_CONTEXT") {
    return (
      <div className="rounded-lg border border-line bg-bg/40 p-3">
        <Header status={data.status} />
        <p className="text-[12px] leading-relaxed text-ink-muted">
          Not enough candle history for {data.pair} yet for the Oracle to analyze.
        </p>
      </div>
    );
  }

  // CONNECTED or NO_TRADE — render whatever fields the Oracle actually returned.
  return (
    <div className="rounded-lg border border-line bg-bg/40 p-3">
      <Header status={data.status} />
      <div className="space-y-1.5 text-[12px] leading-relaxed">
        {data.grade && (
          <div className="flex items-center justify-between">
            <span className="text-ink-faint">Oracle Grade</span>
            <span className="font-semibold text-ink">{data.grade}</span>
          </div>
        )}
        {data.side !== undefined && data.side !== null && (
          <div className="flex items-center justify-between">
            <span className="text-ink-faint">Side</span>
            <span className={`font-semibold ${data.side === "LONG" ? "text-up" : "text-down"}`}>{data.side}</span>
          </div>
        )}
        {typeof data.confidence === "number" && (
          <div className="flex items-center justify-between">
            <span className="text-ink-faint">Confidence</span>
            <span className="font-semibold text-ink">{data.confidence}%</span>
          </div>
        )}
        {data.riskOverall && (
          <div className="flex items-center justify-between">
            <span className="text-ink-faint">Risk</span>
            <span className="font-semibold text-ink">{data.riskOverall}</span>
          </div>
        )}
        {data.summary && <p className="text-ink-muted">{data.summary}</p>}
        {!!data.supportingEvidence?.length && (
          <ul className="list-inside list-disc text-ink-faint">
            {data.supportingEvidence.slice(0, 3).map((ev) => (
              <li key={ev}>{ev}</li>
            ))}
          </ul>
        )}
      </div>
      {data.lastUpdated && (
        <p className="mt-2 text-[10px] text-ink-faint">Last updated {timeAgo(data.lastUpdated)}</p>
      )}
    </div>
  );
}
