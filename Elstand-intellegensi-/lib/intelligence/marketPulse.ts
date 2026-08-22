import { formatUsd } from "../format";
import type { GlobalSentimentReading } from "./globalSentiment";
import type { AltseasonReading, MacroReading, WhaleSummary } from "../market-insights";

export type PulseTone = "up" | "down" | "amber" | "neutral" | "signal";

export interface PulseMetric {
  key: string;
  label: string;
  /** 0-100 gauge position. */
  value: number;
  stateLabel: string;
  detail: string;
  tone: PulseTone;
  connected: boolean;
}

export interface MarketPulseInputs {
  sentiment: GlobalSentimentReading;
  macro: MacroReading;
  whaleSummary: WhaleSummary;
  fngValue?: number;
  fngClassification?: string;
  stablecoinChange24hUsd?: number;
  btcFundingRate?: number;
  altseason?: AltseasonReading;
  etfNetTotalUsd?: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function waiting(key: string, label: string, note: string): PulseMetric {
  return { key, label, value: 50, stateLabel: "Waiting", detail: note, tone: "neutral", connected: false };
}

/**
 * Every metric here re-reads a signal some other panel on the dashboard
 * already computes and displays (sentiment, macro calendar, whale flow,
 * F&G, stablecoin supply, funding rate, altseason, ETF flow) — nothing is
 * invented for the gauge. Where a source is missing, the gauge reports
 * "Waiting" rather than guessing, same rule as the rest of the app.
 */
export function deriveMarketPulse(input: MarketPulseInputs): PulseMetric[] {
  const metrics: PulseMetric[] = [];

  const riskMap: Record<GlobalSentimentReading["status"], { value: number; tone: PulseTone; label: string }> = {
    "risk-on": { value: 85, tone: "up", label: "Risk On" },
    "risk-off": { value: 15, tone: "down", label: "Risk Off" },
    neutral: { value: 50, tone: "neutral", label: "Netral" },
    transition: { value: 50, tone: "amber", label: "Transisi" },
  };
  const rm = riskMap[input.sentiment.status];
  metrics.push({
    key: "risk",
    label: "Risk Mode",
    value: rm.value,
    stateLabel: rm.label,
    tone: rm.tone,
    detail: input.sentiment.reasons[0]?.text ?? `${input.sentiment.signalsAvailable} sinyal terbaca`,
    connected: input.sentiment.signalsAvailable > 0,
  });

  const macroMap: Record<MacroReading["level"], { value: number; tone: PulseTone; label: string }> = {
    calm: { value: 85, tone: "up", label: "Calm" },
    watch: { value: 50, tone: "amber", label: "Watch" },
    alert: { value: 15, tone: "down", label: "Alert" },
  };
  const mm = macroMap[input.macro.level];
  metrics.push({ key: "macro", label: "Macro", value: mm.value, stateLabel: mm.label, tone: mm.tone, detail: input.macro.label, connected: true });

  const whaleUsd = input.whaleSummary.totalUsd;
  const whaleLabel = whaleUsd >= 150_000_000 ? "Tinggi" : whaleUsd >= 40_000_000 ? "Sedang" : "Rendah";
  metrics.push({
    key: "whale",
    label: "Whale Activity",
    value: whaleUsd > 0 ? clamp(30 + Math.log10(whaleUsd / 1_000_000 + 1) * 22, 20, 92) : 20,
    stateLabel: whaleLabel,
    tone: whaleLabel === "Tinggi" ? "amber" : "neutral",
    detail: input.whaleSummary.count ? `${formatUsd(whaleUsd)} · ${input.whaleSummary.count} transfer besar` : "Belum ada transfer besar",
    connected: true,
  });

  if (input.etfNetTotalUsd !== undefined) {
    const net = input.etfNetTotalUsd;
    metrics.push({
      key: "institution",
      label: "Institution",
      value: clamp(50 + (net / 1_000_000_000) * 40, 10, 90),
      stateLabel: net > 5_000_000 ? "Net Inflow" : net < -5_000_000 ? "Net Outflow" : "Flat",
      tone: net > 5_000_000 ? "up" : net < -5_000_000 ? "down" : "neutral",
      detail: `${net >= 0 ? "+" : ""}${formatUsd(net)} ETF (24h)`,
      connected: true,
    });
  } else {
    metrics.push(waiting("institution", "Institution", "Data ETF belum tersedia"));
  }

  if (input.fngValue !== undefined) {
    const v = input.fngValue;
    metrics.push({
      key: "sentiment",
      label: "Sentiment",
      value: v,
      stateLabel: input.fngClassification ?? (v <= 25 ? "Extreme Fear" : v <= 45 ? "Fear" : v <= 55 ? "Netral" : v <= 75 ? "Greed" : "Extreme Greed"),
      tone: v <= 40 ? "down" : v >= 60 ? "up" : "neutral",
      detail: "Fear & Greed Index",
      connected: true,
    });
  } else {
    metrics.push(waiting("sentiment", "Sentiment", "Fear & Greed belum tersedia"));
  }

  if (input.stablecoinChange24hUsd !== undefined) {
    const chg = input.stablecoinChange24hUsd;
    metrics.push({
      key: "liquidity",
      label: "Liquidity",
      value: clamp(50 + (chg / 300_000_000) * 40, 10, 90),
      stateLabel: chg > 20_000_000 ? "Expanding" : chg < -20_000_000 ? "Contracting" : "Stabil",
      tone: chg > 20_000_000 ? "up" : chg < -20_000_000 ? "down" : "neutral",
      detail: `${chg >= 0 ? "+" : ""}${formatUsd(chg)} stablecoin (24h)`,
      connected: true,
    });
  } else {
    metrics.push(waiting("liquidity", "Liquidity", "Data stablecoin belum tersedia"));
  }

  if (input.btcFundingRate !== undefined) {
    const abs = Math.abs(input.btcFundingRate);
    const label = abs >= 0.001 ? "Tinggi" : abs >= 0.0004 ? "Sedang" : "Rendah";
    metrics.push({
      key: "volatility",
      label: "Volatility",
      value: clamp(25 + abs * 40000, 20, 95),
      stateLabel: label,
      tone: label === "Tinggi" ? "down" : label === "Sedang" ? "amber" : "neutral",
      detail: `Funding rate ${(input.btcFundingRate * 100).toFixed(3)}%`,
      connected: true,
    });
  } else {
    metrics.push(waiting("volatility", "Volatility", "Funding rate belum tersedia"));
  }

  if (input.altseason) {
    metrics.push({
      key: "bias",
      label: "Market Bias",
      value: input.altseason.index,
      stateLabel: input.altseason.label,
      tone: input.altseason.index >= 75 || input.altseason.index <= 25 ? "amber" : "neutral",
      detail: `${input.altseason.sampleSize} altcoin disampel`,
      connected: true,
    });
  } else {
    metrics.push(waiting("bias", "Market Bias", "Data altseason belum tersedia"));
  }

  metrics.push({
    key: "confidence",
    label: "Confidence",
    value: input.sentiment.confidence,
    stateLabel: input.sentiment.confidence >= 70 ? "Tinggi" : input.sentiment.confidence >= 40 ? "Sedang" : "Rendah",
    tone: "signal",
    detail: `${input.sentiment.signalsAvailable} sinyal terbaca`,
    connected: input.sentiment.signalsAvailable > 0,
  });

  return metrics;
}
