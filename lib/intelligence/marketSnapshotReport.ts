import { formatPct, formatUsd } from "../format";
import type { TerminalReport, ReportRow, ReportTone } from "../terminalReport";
import type { FinalConclusion } from "./finalConclusion";
import type { PulseMetric } from "./marketPulse";

// Market Mode and Confidence already live at the top of the report (they
// come straight from deriveFinalConclusion / deriveGlobalSentiment), so the
// matching "Risk Mode" and "Confidence" gauges from deriveMarketPulse would
// just repeat them — skipped here to avoid showing the same number twice
// under two different labels.
const PULSE_KEYS_SHOWN_ELSEWHERE = new Set(["risk", "confidence"]);

export interface MarketSnapshotInput {
  pulse: PulseMetric[];
  finalConclusion: FinalConclusion;
  totalMarketCapUsd?: number;
  marketCapChange24h?: number;
  btcDominance?: number;
  fngValue?: number;
  fngClassification?: string;
  btcFundingRate?: number;
  btcOpenInterestUsd?: number;
}

const ACTION_LABEL: Record<FinalConclusion["actionLabel"], string> = {
  WAIT: "Wait",
  MONITOR: "Monitor",
  CONFIRMED: "Confirmed",
};

function fundingTone(rate: number): ReportTone {
  return rate < -0.0005 ? "amber" : "neutral";
}

/**
 * Reshapes numbers that already exist elsewhere on the dashboard —
 * deriveGlobalSentiment (Map header), deriveMarketPulse (Market Pulse
 * gauges), deriveFinalConclusion (AI Final Conclusion card) — into the V3
 * brief's "AI Summary" terminal layout. No scoring logic lives here; this
 * is presentation only, so the AI Summary card, the chat's "ringkasan
 * market" reply, and the rest of the dashboard can never disagree.
 */
export function buildMarketSnapshotReport(input: MarketSnapshotInput): TerminalReport {
  const c = input.finalConclusion;

  const headerRows: ReportRow[] = [];
  if (input.totalMarketCapUsd !== undefined) {
    headerRows.push({
      label: "MARKET CAP",
      value: formatUsd(input.totalMarketCapUsd),
      detail: input.marketCapChange24h !== undefined ? `${formatPct(input.marketCapChange24h)} 24h` : undefined,
      tone: (input.marketCapChange24h ?? 0) >= 0 ? "up" : "down",
      connected: true,
    });
  }
  if (input.btcDominance !== undefined) {
    headerRows.push({ label: "BTC DOMINANCE", value: `${input.btcDominance.toFixed(1)}%`, tone: "neutral", connected: true });
  }
  if (input.fngValue !== undefined) {
    headerRows.push({
      label: "FEAR INDEX",
      value: `${Math.round(input.fngValue)}/100`,
      detail: input.fngClassification,
      tone: input.fngValue <= 40 ? "down" : input.fngValue >= 60 ? "up" : "neutral",
      connected: true,
    });
  }

  const pulseRows: ReportRow[] = input.pulse
    .filter((m) => !PULSE_KEYS_SHOWN_ELSEWHERE.has(m.key))
    .map((m) => ({
      label: m.label.toUpperCase(),
      value: m.connected ? m.stateLabel : "Waiting",
      detail: m.detail,
      tone: m.connected ? m.tone : "neutral",
      connected: m.connected,
    }));

  if (input.btcFundingRate !== undefined) {
    pulseRows.push({
      label: "FUNDING",
      value: `${(input.btcFundingRate * 100).toFixed(4)}%`,
      detail: input.btcFundingRate < 0 ? "Negatif — short bayar long" : "Positif — long bayar short",
      tone: fundingTone(input.btcFundingRate),
      connected: true,
    });
  }
  if (input.btcOpenInterestUsd !== undefined) {
    pulseRows.push({ label: "OPEN INTEREST", value: formatUsd(input.btcOpenInterestUsd), tone: "neutral", connected: true });
  }

  return {
    eyebrow: "AI",
    title: "MARKET SNAPSHOT",
    found: true,
    statusLabel: c.modeLabel,
    statusTone: c.modeTone,
    confidence: c.confidence,
    rows: [...headerRows, { label: "MARKET MODE", value: c.modeLabel, tone: c.modeTone, connected: true }, ...pulseRows],
    conclusion: buildConclusionSentence(c),
    actionLabel: ACTION_LABEL[c.actionLabel],
    actionTone: c.actionTone,
    actionNote: c.actionNote,
    watchlist: c.watchlist,
  };
}

function buildConclusionSentence(c: FinalConclusion): string {
  switch (c.modeLabel) {
    case "TRANSITION":
      return `Market tetap dalam kondisi Transition — konfirmasi arah belum terbentuk (confidence ${c.confidence}%).`;
    case "RISK ON":
      return `Sinyal rule-based condong ke Risk On (confidence ${c.confidence}%).`;
    case "RISK OFF":
      return `Sinyal rule-based condong ke Risk Off (confidence ${c.confidence}%).`;
    default:
      return `Kondisi pasar relatif netral saat ini (confidence ${c.confidence}%).`;
  }
}
