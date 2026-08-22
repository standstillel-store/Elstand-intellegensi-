// ---------------------------------------------------------------------------
// Global Sentiment reasoning engine — the one place that reads every node's
// signal and casts a verdict. Same "show your work" rule as the rest of
// this app (lib/market-insights.ts, lib/scanner-categories.ts): a rule-based
// weighted vote, not an LLM call, so every number on screen traces back to a
// reason a person can check. Used by both the Market Status card (Top
// Market Overview) and the Global Intelligence Map's summary header, so the
// two can never disagree with each other.
// ---------------------------------------------------------------------------

import type { DisplayTone } from "./shared";

export type SentimentStatus = "risk-on" | "risk-off" | "neutral" | "transition";

/** Which Global Intelligence Map node a reason originates from — lets the drawer group a flat reasons list into an ordered, per-node chain. */
export type SentimentNode = "macro" | "usd" | "gold" | "stocks" | "crypto" | "altcoin";

export interface SentimentReason {
  text: string;
  direction: -1 | 1;
  node: SentimentNode;
}

export interface GlobalSentimentReading {
  status: SentimentStatus;
  confidence: number; // 0-100
  reasons: SentimentReason[];
  signalsAvailable: number;
  note?: string;
}

export interface GlobalSentimentInputs {
  fngValue?: number;
  mcChange24h?: number;
  dxyChangePct?: number;
  goldChangePct?: number;
  stocksChangePct?: number; // average across tracked indices
  btcChange24h?: number;
  btcChange7d?: number;
  altcoinChange24h?: number;
  imminentHighImpactEvent?: { title: string; hoursAway: number };
}

export function deriveGlobalSentiment(input: GlobalSentimentInputs): GlobalSentimentReading {
  const reasons: SentimentReason[] = [];
  const push = (direction: -1 | 1, node: SentimentNode, text: string) => reasons.push({ text, direction, node });

  if (input.fngValue !== undefined) {
    if (input.fngValue >= 60) push(1, "crypto", `Fear & Greed di zona Greed (${Math.round(input.fngValue)})`);
    else if (input.fngValue <= 40) push(-1, "crypto", `Fear & Greed di zona Fear (${Math.round(input.fngValue)})`);
  }

  if (input.mcChange24h !== undefined) {
    if (input.mcChange24h > 1) push(1, "crypto", `Market cap crypto naik ${input.mcChange24h.toFixed(1)}% (24h)`);
    else if (input.mcChange24h < -1) push(-1, "crypto", `Market cap crypto turun ${Math.abs(input.mcChange24h).toFixed(1)}% (24h)`);
  }

  if (input.dxyChangePct !== undefined) {
    if (input.dxyChangePct > 0.15) push(-1, "usd", "DXY naik — USD menguat, likuiditas mengetat");
    else if (input.dxyChangePct < -0.15) push(1, "usd", "DXY turun — USD melemah, mendukung aset berisiko");
  }

  if (input.goldChangePct !== undefined) {
    if (input.goldChangePct > 0.3) push(-1, "gold", "Gold menguat — permintaan safe-haven naik");
    else if (input.goldChangePct < -0.3) push(1, "gold", "Gold melemah — minat safe-haven berkurang");
  }

  if (input.stocksChangePct !== undefined) {
    if (input.stocksChangePct > 0.3) push(1, "stocks", "Saham AS menguat — risk appetite tinggi");
    else if (input.stocksChangePct < -0.3) push(-1, "stocks", "Saham AS melemah — risk-off menyebar lintas aset");
  }

  if (input.btcChange24h !== undefined && input.btcChange7d !== undefined) {
    if (input.btcChange24h > 0.5 && input.btcChange7d > 0) push(1, "crypto", "BTC mempertahankan struktur bullish");
    else if (input.btcChange24h < -0.5 && input.btcChange7d < 0) push(-1, "crypto", "BTC berada dalam struktur bearish");
  }

  if (input.altcoinChange24h !== undefined) {
    if (input.altcoinChange24h > 1) push(1, "altcoin", "Momentum altcoin menguat");
    else if (input.altcoinChange24h < -1) push(-1, "altcoin", "Momentum altcoin melemah");
  }

  if (input.imminentHighImpactEvent) {
    const { title, hoursAway } = input.imminentHighImpactEvent;
    push(-1, "macro", `${title} dalam ~${Math.max(1, Math.round(hoursAway))} jam — mendorong kehati-hatian`);
  }

  const onCount = reasons.filter((r) => r.direction === 1).length;
  const offCount = reasons.filter((r) => r.direction === -1).length;
  const total = reasons.length;
  const net = onCount - offCount;

  let status: SentimentStatus;
  let note: string | undefined;
  if (total === 0) {
    status = "neutral";
    note = "Belum cukup data untuk membaca sentimen — hubungkan lebih banyak sumber di bawah.";
  } else if (total >= 4 && Math.abs(net) <= 1) {
    status = "transition";
    note = "Sinyal saling berlawanan dalam jumlah seimbang — pasar kemungkinan sedang bertransisi arah.";
  } else if (net >= 2) {
    status = "risk-on";
  } else if (net <= -2) {
    status = "risk-off";
  } else {
    status = "neutral";
  }

  const agreement = total > 0 ? Math.abs(net) / total : 0;
  const coverage = Math.min(total, 7) / 7;
  const confidence = total === 0 ? 0 : Math.round(agreement * 65 + coverage * 35);

  return { status, confidence, reasons, signalsAvailable: total, note };
}

// ---------------------------------------------------------------------------
// "Not a black box" view. deriveGlobalSentiment() above already reads every
// node in parallel and votes — this just regroups that same flat `reasons`
// list by originating node, in a fixed macro-to-crypto reading order, so the
// UI can render it as a fan-in chain (each node's read -> converging into
// one AI verdict) instead of an unordered bullet list. No new scoring logic;
// a node with zero active reasons right now is shown as "no signal", never
// backfilled with an invented one.
// ---------------------------------------------------------------------------
export interface ReasoningChainStep {
  node: SentimentNode;
  nodeLabel: string;
  reasons: SentimentReason[];
  tone: DisplayTone;
}

const CHAIN_NODE_ORDER: SentimentNode[] = ["macro", "usd", "gold", "stocks", "crypto", "altcoin"];
const CHAIN_NODE_LABEL: Record<SentimentNode, string> = {
  macro: "Macro & News",
  usd: "USD (DXY)",
  gold: "Gold (XAU)",
  stocks: "Stocks (US)",
  crypto: "Crypto Market",
  altcoin: "Altcoin",
};

export function buildReasoningChain(sentiment: GlobalSentimentReading): ReasoningChainStep[] {
  return CHAIN_NODE_ORDER.map((node) => {
    const nodeReasons = sentiment.reasons.filter((r) => r.node === node);
    const net = nodeReasons.reduce((sum, r) => sum + r.direction, 0);
    const tone: DisplayTone = nodeReasons.length === 0 ? "neutral" : net > 0 ? "up" : net < 0 ? "down" : "amber";
    return { node, nodeLabel: CHAIN_NODE_LABEL[node], reasons: nodeReasons, tone };
  });
}
