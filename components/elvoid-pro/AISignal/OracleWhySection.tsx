import { CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import type { ConfluenceFactor, ConfluenceSource } from "@/lib/ai/oracle/confluenceTypes";
import type { MtfContext } from "@/lib/ai/oracle/mtf";
import type { LiquidityOrderFlowContext } from "@/lib/ai/oracle/liquidityOrderFlow";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";

/**
 * "WHY ELVOID DECIDED" — a categorized read of fields the Oracle API
 * already returns (confluence factors, liquidityOrderFlow, mtf,
 * contradictions, riskIntelligence). This file only groups and labels
 * those existing values; it computes no score, weight, or decision.
 * A category with no usable data renders "Unavailable" — never a filled-in
 * guess — per the redesign brief's explicit rule.
 */

type WhyStatus = "confirm" | "warn" | "unavailable";

interface WhyRow {
  label: string;
  status: WhyStatus;
  text: string | null;
}

const MTF_RELATIONSHIP_LABEL: Record<string, string> = {
  ALIGNED_BULLISH: "HTF & MTF searah bullish",
  ALIGNED_BEARISH: "HTF & MTF searah bearish",
  PULLBACK_IN_UPTREND: "Kemungkinan pullback dalam uptrend",
  PULLBACK_IN_DOWNTREND: "Kemungkinan pullback dalam downtrend",
  CONTINUATION_AFTER_PULLBACK_BULLISH: "Kandidat continuation bullish setelah pullback",
  CONTINUATION_AFTER_PULLBACK_BEARISH: "Kandidat continuation bearish setelah pullback",
  HTF_THESIS_THREATENED_BULLISH: "Tesis HTF bullish terancam",
  HTF_THESIS_THREATENED_BEARISH: "Tesis HTF bearish terancam",
  NEUTRAL_OR_MIXED: "HTF/MTF/LTF campuran",
  INSUFFICIENT_DATA: "Data timeframe tidak lengkap",
};

function summarizeFactors(factors: ConfluenceFactor[], sources: ConfluenceSource[], side: "LONG" | "SHORT" | null): { status: WhyStatus; text: string | null } {
  const matched = factors.filter((f) => sources.includes(f.source));
  if (matched.length === 0) return { status: "unavailable", text: null };
  if (matched.every((f) => f.quality === "unavailable")) return { status: "unavailable", text: null };
  const supporting = side ? matched.filter((f) => (side === "LONG" ? f.longWeight : f.shortWeight) > 0) : [];
  if (supporting.length > 0) {
    const top = [...supporting].sort((a, b) => (side === "LONG" ? b.longWeight - a.longWeight : b.shortWeight - a.shortWeight))[0];
    return { status: "confirm", text: top.evidence };
  }
  return { status: "warn", text: matched[0].evidence };
}

function buildMarketStructureRow(factors: ConfluenceFactor[], side: "LONG" | "SHORT" | null): WhyRow {
  const r = summarizeFactors(factors, ["market_structure", "smc_ict"], side);
  return { label: "Market Structure", ...r };
}

function buildLiquidityRow(ctx: LiquidityOrderFlowContext | null | undefined, side: "LONG" | "SHORT" | null): WhyRow {
  if (!ctx || ctx.event.quality === "unavailable") return { label: "Liquidity", status: "unavailable", text: null };
  const { event } = ctx;
  if (event.type === "NO_CLEAR_EVENT") return { label: "Liquidity", status: "warn", text: event.evidence };
  return { label: "Liquidity", status: event.side === side ? "confirm" : "warn", text: event.evidence };
}

function buildOrderFlowRow(ctx: LiquidityOrderFlowContext | null | undefined, side: "LONG" | "SHORT" | null): WhyRow {
  const pr = ctx?.priceResponse;
  if (!pr || pr.quality === "unavailable") return { label: "Order Flow", status: "unavailable", text: null };
  const supportsLong = pr.interpretation === "BUYING_PRESSURE" && side === "LONG";
  const supportsShort = pr.interpretation === "SELLING_PRESSURE" && side === "SHORT";
  return { label: "Order Flow", status: supportsLong || supportsShort ? "confirm" : "warn", text: pr.evidence };
}

function buildMtfRow(mtf: MtfContext | null | undefined): WhyRow {
  if (!mtf) return { label: "Multi-Timeframe", status: "unavailable", text: null };
  const rel = mtf.relationship;
  if (rel === "INSUFFICIENT_DATA") return { label: "Multi-Timeframe", status: "unavailable", text: null };
  const confirming = rel === "ALIGNED_BULLISH" || rel === "ALIGNED_BEARISH" || rel === "CONTINUATION_AFTER_PULLBACK_BULLISH" || rel === "CONTINUATION_AFTER_PULLBACK_BEARISH";
  return { label: "Multi-Timeframe", status: confirming ? "confirm" : "warn", text: MTF_RELATIONSHIP_LABEL[rel] ?? rel };
}

function buildConflictRow(report: ContradictionReport | null | undefined): WhyRow {
  if (!report) return { label: "Conflict", status: "unavailable", text: null };
  const genuine = report.contradictions.filter((c) => c.genuineness === "GENUINE");
  if (genuine.length === 0) return { label: "Conflict", status: "confirm", text: "No unresolved contradiction identified in current evidence." };
  const order = { HIGH: 0, MODERATE: 1, LOW: 2 } as const;
  const worst = [...genuine].sort((a, b) => order[a.severity] - order[b.severity])[0];
  return { label: "Conflict", status: "warn", text: worst.description };
}

function buildRiskRow(intel: RiskIntelligence | null | undefined): WhyRow {
  if (!intel) return { label: "Risk", status: "unavailable", text: null };
  const status: WhyStatus = intel.overall === "LOW" ? "confirm" : "warn";
  const top = [...intel.factors].sort((a, b) => {
    const order = { HIGH: 0, MODERATE: 1, LOW: 2 } as const;
    return order[a.severity] - order[b.severity];
  })[0];
  return { label: "Risk", status, text: top ? top.evidence : null };
}

const STATUS_STYLE: Record<WhyStatus, { icon: typeof CheckCircle2; iconClass: string; textClass: string }> = {
  confirm: { icon: CheckCircle2, iconClass: "text-up", textClass: "text-ink-muted" },
  warn: { icon: AlertTriangle, iconClass: "text-amber", textClass: "text-ink-muted" },
  unavailable: { icon: MinusCircle, iconClass: "text-ink-faint", textClass: "text-ink-faint" },
};

function WhyRowView({ row }: { row: WhyRow }) {
  const style = STATUS_STYLE[row.status];
  const Icon = style.icon;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon size={13} className={`mt-[1px] shrink-0 ${style.iconClass}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">{row.label}</p>
        <p className={`text-[11px] leading-relaxed ${style.textClass}`}>{row.status === "unavailable" ? "Unavailable" : row.text}</p>
      </div>
    </div>
  );
}

export function OracleWhySection({
  side,
  factors,
  liquidityOrderFlow,
  mtf,
  contradictions,
  riskIntelligence,
}: {
  side: "LONG" | "SHORT" | null;
  factors: ConfluenceFactor[];
  liquidityOrderFlow: LiquidityOrderFlowContext | null | undefined;
  mtf: MtfContext | null | undefined;
  contradictions: ContradictionReport | null | undefined;
  riskIntelligence: RiskIntelligence | null | undefined;
}) {
  const rows: WhyRow[] = [
    buildMarketStructureRow(factors, side),
    buildLiquidityRow(liquidityOrderFlow, side),
    buildMtfRow(mtf),
    buildOrderFlowRow(liquidityOrderFlow, side),
    buildConflictRow(contradictions),
    buildRiskRow(riskIntelligence),
  ];

  return (
    <div>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-ink-faint">Why ELVOID Decided</p>
      <div className="divide-y divide-line/60">
        {rows.map((row) => (
          <WhyRowView key={row.label} row={row} />
        ))}
      </div>
    </div>
  );
}
