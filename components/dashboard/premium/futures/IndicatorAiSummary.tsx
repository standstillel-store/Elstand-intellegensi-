import { Bot } from "lucide-react";
import { timeAgo } from "@/lib/format";
import type { FuturesIntelligenceSummary } from "@/lib/intelligence/premiumFuturesIntelligence";
import type { IndicatorInterpretation, OracleAlignment } from "@/lib/intelligence/premiumIndicatorInterpretation";

/**
 * Phase 8.5 correction: this used to render the full ELVOID Oracle summary
 * verbatim, so Funding/Order Flow/Order Book all showed the exact same
 * grade/side/confidence/evidence as if each indicator produced that
 * conclusion itself. It didn't — the Oracle assessment is one thing, each
 * indicator's own reading is another. This component now shows the
 * indicator-specific interpretation (see
 * lib/intelligence/premiumIndicatorInterpretation.ts) as the primary
 * content, with the Oracle's own fields demoted to a compact secondary row.
 */

const ALIGNMENT_LABEL: Record<OracleAlignment, string> = {
  ALIGNED: "Aligned",
  CONFLICTING: "Conflicting",
  NEUTRAL: "Neutral",
  UNAVAILABLE: "Unavailable",
};

const ALIGNMENT_TONE: Record<OracleAlignment, string> = {
  ALIGNED: "text-up border-up/40",
  CONFLICTING: "text-down border-down/40",
  NEUTRAL: "text-ink-faint border-line",
  UNAVAILABLE: "text-ink-faint border-line",
};

function AlignmentBadge({ alignment }: { alignment: OracleAlignment }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${ALIGNMENT_TONE[alignment]}`}>
      {ALIGNMENT_LABEL[alignment]}
    </span>
  );
}

/** Secondary row only — never the card's primary content. Every field is
 *  copied verbatim from the Oracle response (never recomputed here); a
 *  field the Oracle didn't return is simply omitted. */
function OracleContextRow({ oracle, loading }: { oracle: FuturesIntelligenceSummary | null; loading: boolean }) {
  if (loading && !oracle) {
    return <p className="mt-2 text-[10px] text-ink-faint">Loading Oracle context…</p>;
  }
  if (!oracle || oracle.status === "DATA_UNAVAILABLE" || oracle.status === "CONNECTOR_ERROR") {
    return <p className="mt-2 text-[10px] text-ink-faint">Oracle context unavailable{oracle?.error ? ` — ${oracle.error}` : "."}</p>;
  }
  if (oracle.status === "MEMBERSHIP_REQUIRED") {
    return <p className="mt-2 text-[10px] text-ink-faint">Oracle context requires an active membership.</p>;
  }
  if (oracle.status === "INSUFFICIENT_CONTEXT") {
    return <p className="mt-2 text-[10px] text-ink-faint">Oracle context unavailable — insufficient candle history.</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/60 pt-1.5 text-[10px] text-ink-faint">
      <span className="font-semibold uppercase tracking-wide">Oracle</span>
      {oracle.grade && (
        <span>
          Grade <b className="text-ink">{oracle.grade}</b>
        </span>
      )}
      {oracle.side !== undefined && oracle.side !== null && (
        <span>
          Side <b className={oracle.side === "LONG" ? "text-up" : "text-down"}>{oracle.side}</b>
        </span>
      )}
      {typeof oracle.confidence === "number" && (
        <span>
          Confidence <b className="text-ink">{oracle.confidence}%</b>
        </span>
      )}
      {oracle.riskOverall && (
        <span>
          Risk <b className="text-ink">{oracle.riskOverall}</b>
        </span>
      )}
      {oracle.lastUpdated && <span>{timeAgo(oracle.lastUpdated)}</span>}
    </div>
  );
}

export function IndicatorAiSummary({
  interpretation,
  oracle,
  oracleLoading,
}: {
  interpretation: IndicatorInterpretation;
  oracle: FuturesIntelligenceSummary | null;
  oracleLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-bg/40 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          <Bot size={12} />
          AI Interpretation
        </span>
        <AlignmentBadge alignment={interpretation.oracleAlignment} />
      </div>
      <p className="text-[12px] leading-relaxed text-ink-muted">
        {interpretation.observation} {interpretation.interpretation}
      </p>
      <p className="mt-1 text-[10px] italic text-ink-faint">{interpretation.caveat}</p>
      <OracleContextRow oracle={oracle} loading={oracleLoading} />
    </div>
  );
}
