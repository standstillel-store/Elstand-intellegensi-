// ---------------------------------------------------------------------------
// ELSTAND PREMIUM — per-indicator interpretation layer (Phase 8.5 correction)
//
// Phase 8.5's first pass wired the ELVOID Oracle connector but then had
// every Futures panel (Funding, Order Flow, Order Book) display the exact
// same Oracle summary — making every indicator look like it produced the
// same AI conclusion, which it didn't.
//
// This module fixes that: it is a small, deterministic, pure function
// layer (no LLM call, no network, no new Oracle, no re-derivation of
// confluence/grading) that takes each indicator's OWN already-computed
// real data plus (optionally) the Oracle's side/grade, and returns an
// honest, indicator-specific explanation:
//
//   { indicator, observation, interpretation, oracleAlignment, caveat }
//
// `oracleAlignment` is a comparison, never a re-decision: it never claims
// the indicator itself produced the Oracle's grade/side, and it is
// UNAVAILABLE whenever there is no Oracle side to compare against, NEUTRAL
// whenever the indicator's own reading is too balanced to mean anything
// directionally. Never forced, never fabricated.
// ---------------------------------------------------------------------------

import type { ExchangeFundingReading } from "@/lib/intelligence/premiumMicrostructure";

export type OracleAlignment = "ALIGNED" | "CONFLICTING" | "NEUTRAL" | "UNAVAILABLE";

export interface IndicatorInterpretation {
  indicator: "funding" | "order_flow" | "order_book";
  observation: string;
  interpretation: string;
  oracleAlignment: OracleAlignment;
  caveat: string;
}

/** Only what an interpretation function needs from the Oracle — never the
 *  full response, and never used if the Oracle didn't actually produce a
 *  side (NO_TRADE, unavailable, etc. all mean `side` is absent here). */
export interface OracleContextForInterpretation {
  side?: "LONG" | "SHORT" | null;
  grade?: string;
}

// --- Funding ---------------------------------------------------------------

export type FundingBias = "LONG_CROWDED" | "LONG_SLIGHT" | "NEUTRAL" | "SHORT_SLIGHT" | "SHORT_CROWDED";

/** Same thresholds the Funding Rate gauge (BiasBar) uses — a single source
 *  of truth so the gauge label and the AI interpretation can never drift
 *  apart on what counts as "crowded". */
export const FUNDING_THRESHOLDS = { crowded: 0.0005, slight: 0.0001 } as const;

export function classifyFundingBias(rate: number): FundingBias {
  if (rate > FUNDING_THRESHOLDS.crowded) return "LONG_CROWDED";
  if (rate > FUNDING_THRESHOLDS.slight) return "LONG_SLIGHT";
  if (rate < -FUNDING_THRESHOLDS.crowded) return "SHORT_CROWDED";
  if (rate < -FUNDING_THRESHOLDS.slight) return "SHORT_SLIGHT";
  return "NEUTRAL";
}

function pctText(rate: number): string {
  const pct = rate * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(4)}%`;
}

export function interpretFunding(input: {
  currentFundingRate?: number;
  crossExchangeFunding?: ExchangeFundingReading[];
  oracle?: OracleContextForInterpretation;
}): IndicatorInterpretation {
  const caveat = "Funding alone does not establish price direction.";

  if (input.currentFundingRate === undefined) {
    return {
      indicator: "funding",
      observation: "Funding rate data is currently unavailable for this pair.",
      interpretation: "Insufficient data to interpret positioning.",
      oracleAlignment: "UNAVAILABLE",
      caveat,
    };
  }

  const rate = input.currentFundingRate;
  const bias = classifyFundingBias(rate);
  const positioning: "long" | "short" | "neutral" =
    bias === "LONG_CROWDED" || bias === "LONG_SLIGHT" ? "long" : bias === "SHORT_CROWDED" || bias === "SHORT_SLIGHT" ? "short" : "neutral";

  let observation: string;
  if (positioning === "long") {
    observation = `Funding is currently ${bias === "LONG_CROWDED" ? "strongly" : "mildly"} positive at ${pctText(rate)}, meaning longs are paying shorts.`;
  } else if (positioning === "short") {
    observation = `Funding is currently ${bias === "SHORT_CROWDED" ? "strongly" : "mildly"} negative at ${pctText(rate)}, meaning shorts are paying longs.`;
  } else {
    observation = `Funding is currently near neutral at ${pctText(rate)}, providing weak directional information.`;
  }

  const connected = (input.crossExchangeFunding ?? []).filter((r) => r.connected && r.currentFundingRate !== undefined);
  if (connected.length > 1) {
    const rates = connected.map((r) => ({ exchange: r.exchange, rate: r.currentFundingRate as number }));
    const lowest = rates.reduce((a, b) => (b.rate < a.rate ? b : a));
    const highest = rates.reduce((a, b) => (b.rate > a.rate ? b : a));
    if (lowest.exchange !== highest.exchange) {
      observation += ` Across the observed exchanges it ranges from ${pctText(lowest.rate)} (${lowest.exchange}) to ${pctText(highest.rate)} (${highest.exchange}).`;
    }
  }

  let interpretation: string =
    positioning === "neutral"
      ? "Funding does not currently favor either side strongly, so it provides limited standalone directional signal."
      : `This indicates relatively ${positioning}-biased positioning among perpetual holders.`;

  let oracleAlignment: OracleAlignment;
  if (positioning === "neutral") {
    oracleAlignment = "NEUTRAL";
  } else if (!input.oracle?.side) {
    oracleAlignment = "UNAVAILABLE";
  } else if ((positioning === "long" && input.oracle.side === "LONG") || (positioning === "short" && input.oracle.side === "SHORT")) {
    oracleAlignment = "ALIGNED";
  } else {
    oracleAlignment = "CONFLICTING";
  }

  if (positioning !== "neutral" && input.oracle?.side) {
    interpretation += ` Relative to the Oracle's ${input.oracle.side} assessment, this is ${
      oracleAlignment === "ALIGNED" ? "aligned" : "conflicting"
    } positioning evidence.`;
  }

  return { indicator: "funding", observation, interpretation, oracleAlignment, caveat };
}

// --- Order Flow --------------------------------------------------------------

/** Percentage-point gap below which buy/sell taker flow is treated as
 *  balanced rather than dominant either way. */
const ORDER_FLOW_BALANCE_THRESHOLD_PP = 2;

export function interpretOrderFlow(input: {
  buyPct?: number;
  sellPct?: number;
  oracle?: OracleContextForInterpretation;
}): IndicatorInterpretation {
  const caveat = "This describes the currently observed flow and does not guarantee continuation.";

  if (input.buyPct === undefined || input.sellPct === undefined) {
    return {
      indicator: "order_flow",
      observation: "Taker buy/sell flow data is currently unavailable.",
      interpretation: "Insufficient data to interpret order flow dominance.",
      oracleAlignment: "UNAVAILABLE",
      caveat,
    };
  }

  const { buyPct, sellPct } = input;
  const diff = Math.abs(buyPct - sellPct);
  const dominant: "buy" | "sell" | "balanced" = diff < ORDER_FLOW_BALANCE_THRESHOLD_PP ? "balanced" : buyPct > sellPct ? "buy" : "sell";

  let observation: string;
  if (dominant === "balanced") {
    observation = `Buy volume is ${buyPct.toFixed(1)}% versus ${sellPct.toFixed(1)}% sell volume — order flow is currently balanced.`;
  } else if (dominant === "buy") {
    observation = `Buy volume currently dominates sell volume by ${diff.toFixed(1)} percentage points (${buyPct.toFixed(1)}% vs ${sellPct.toFixed(1)}%).`;
  } else {
    observation = `Sell volume currently dominates buy volume by ${diff.toFixed(1)} percentage points (${sellPct.toFixed(1)}% vs ${buyPct.toFixed(1)}%).`;
  }

  let interpretation: string =
    dominant === "balanced"
      ? "Order flow provides limited directional confirmation at this balance."
      : `This indicates stronger aggressive ${dominant === "buy" ? "buying" : "selling"} in the observed taker flow.`;

  let oracleAlignment: OracleAlignment;
  if (dominant === "balanced") {
    oracleAlignment = "NEUTRAL";
  } else if (!input.oracle?.side) {
    oracleAlignment = "UNAVAILABLE";
  } else if ((dominant === "buy" && input.oracle.side === "LONG") || (dominant === "sell" && input.oracle.side === "SHORT")) {
    oracleAlignment = "ALIGNED";
  } else {
    oracleAlignment = "CONFLICTING";
  }

  if (dominant !== "balanced" && input.oracle?.side) {
    interpretation += ` Oracle: ${input.oracle.side}. Current order flow: ${dominant === "buy" ? "BUY" : "SELL"} dominant. This ${
      oracleAlignment === "ALIGNED" ? "is directionally aligned with the Oracle." : "conflicts with the Oracle and weakens directional confirmation."
    }`;
  }

  return { indicator: "order_flow", observation, interpretation, oracleAlignment, caveat };
}

// --- Order Book / Liquidity -------------------------------------------------

/** Percentage-point gap below which bid/ask depth dominance is treated as
 *  balanced. Order-book imbalance snapshots run wider than order-flow taker
 *  ratios in practice, hence the larger threshold than ORDER_FLOW's. */
const ORDER_BOOK_BALANCE_THRESHOLD_PP = 4;

export function interpretOrderBook(input: {
  bidPct?: number;
  askPct?: number;
  oracle?: OracleContextForInterpretation;
}): IndicatorInterpretation {
  const caveat = "Order-book liquidity is a snapshot and can change rapidly; it does not guarantee future price movement.";

  if (input.bidPct === undefined || input.askPct === undefined) {
    return {
      indicator: "order_book",
      observation: "Order book depth data is currently unavailable.",
      interpretation: "Insufficient data to interpret book imbalance.",
      oracleAlignment: "UNAVAILABLE",
      caveat,
    };
  }

  const { bidPct, askPct } = input;
  const diff = Math.abs(bidPct - askPct);
  const dominant: "bid" | "ask" | "balanced" = diff < ORDER_BOOK_BALANCE_THRESHOLD_PP ? "balanced" : bidPct > askPct ? "bid" : "ask";

  let observation: string;
  if (dominant === "balanced") {
    observation = `Bid depth (${bidPct.toFixed(0)}%) and ask depth (${askPct.toFixed(0)}%) are roughly balanced in the observed book.`;
  } else if (dominant === "ask") {
    observation = `Ask depth represents ${askPct.toFixed(0)}% of the observed book versus ${bidPct.toFixed(0)}% bid depth, showing ask-side depth dominance.`;
  } else {
    observation = `Bid depth represents ${bidPct.toFixed(0)}% of the observed book versus ${askPct.toFixed(0)}% ask depth, showing bid-side depth dominance.`;
  }

  let interpretation: string =
    dominant === "balanced" ? "Order book depth provides limited directional confirmation at this balance." : `This is a resting-liquidity snapshot only, not a guarantee of future price movement.`;

  let oracleAlignment: OracleAlignment;
  if (dominant === "balanced") {
    oracleAlignment = "NEUTRAL";
  } else if (!input.oracle?.side) {
    oracleAlignment = "UNAVAILABLE";
  } else if ((dominant === "bid" && input.oracle.side === "LONG") || (dominant === "ask" && input.oracle.side === "SHORT")) {
    oracleAlignment = "ALIGNED";
  } else {
    oracleAlignment = "CONFLICTING";
  }

  if (dominant !== "balanced" && input.oracle?.side) {
    interpretation = `Against the Oracle ${input.oracle.side} assessment, ${
      oracleAlignment === "ALIGNED" ? "this is directionally aligned." : "the current book imbalance is not aligned, so the snapshot provides conflicting evidence."
    }`;
  }

  return { indicator: "order_book", observation, interpretation, oracleAlignment, caveat };
}
