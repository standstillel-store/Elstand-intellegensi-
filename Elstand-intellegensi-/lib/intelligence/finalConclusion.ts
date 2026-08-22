import type { GlobalSentimentReading } from "./globalSentiment";

export type MomentumLabel = "Bullish" | "Bearish" | "Neutral";
export type SimpleTone = "up" | "down" | "neutral";

export interface AssetMomentum {
  label: MomentumLabel;
  change24h?: number;
  tone: SimpleTone;
}

export interface WatchlistEntry {
  symbol: string;
  change24h: number;
}

export interface FinalConclusion {
  modeLabel: string;
  modeTone: "up" | "down" | "amber" | "neutral";
  confidence: number;
  btc: AssetMomentum;
  eth: AssetMomentum;
  alt: AssetMomentum;
  watchlist: WatchlistEntry[];
  actionLabel: "WAIT" | "MONITOR" | "CONFIRMED";
  actionTone: "neutral" | "amber" | "up";
  actionNote: string;
}

/** +/-2% 24h is the same "meaningful move" threshold used elsewhere on the dashboard (e.g. top decliners). */
function classifyMomentum(change24h?: number): AssetMomentum {
  if (change24h === undefined) return { label: "Neutral", tone: "neutral" };
  if (change24h >= 2) return { label: "Bullish", change24h, tone: "up" };
  if (change24h <= -2) return { label: "Bearish", change24h, tone: "down" };
  return { label: "Neutral", change24h, tone: "neutral" };
}

const MODE_LABEL: Record<GlobalSentimentReading["status"], string> = {
  "risk-on": "RISK ON",
  "risk-off": "RISK OFF",
  neutral: "NEUTRAL",
  transition: "TRANSITION",
};
const MODE_TONE: Record<GlobalSentimentReading["status"], "up" | "down" | "amber" | "neutral"> = {
  "risk-on": "up",
  "risk-off": "down",
  neutral: "neutral",
  transition: "amber",
};

export interface FinalConclusionInputs {
  sentiment: GlobalSentimentReading;
  btcChange24h?: number;
  ethChange24h?: number;
  altChange24h?: number;
  watchlist: WatchlistEntry[];
}

/**
 * "FINAL ACTION" is deliberately NOT a buy/sell/hold instruction — this app's
 * own disclaimer says it never gives trade signals. The three labels below
 * describe how much the rule-based signals above agree with each other, not
 * what anyone should do with money. Confidence itself is the same number
 * deriveGlobalSentiment() already computes and shows on the Intelligence Map.
 */
export function deriveFinalConclusion(input: FinalConclusionInputs): FinalConclusion {
  const confidence = input.sentiment.confidence;
  const actionLabel = confidence < 40 ? "WAIT" : confidence < 70 ? "MONITOR" : "CONFIRMED";
  const actionTone: FinalConclusion["actionTone"] = confidence < 40 ? "neutral" : confidence < 70 ? "amber" : "up";
  const actionNote =
    actionLabel === "WAIT"
      ? "Sinyal belum sejalan satu arah — belum ada keyakinan tinggi, bukan instruksi untuk diam."
      : actionLabel === "MONITOR"
        ? "Sebagian sinyal sejalan satu arah — layak dipantau lebih lanjut."
        : "Mayoritas sinyal rule-based di atas sejalan ke arah yang sama.";

  return {
    modeLabel: MODE_LABEL[input.sentiment.status],
    modeTone: MODE_TONE[input.sentiment.status],
    confidence,
    btc: classifyMomentum(input.btcChange24h),
    eth: classifyMomentum(input.ethChange24h),
    alt: classifyMomentum(input.altChange24h),
    watchlist: input.watchlist,
    actionLabel,
    actionTone,
    actionNote,
  };
}
