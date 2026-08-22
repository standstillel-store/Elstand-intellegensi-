import type { WhaleTransfer, FundingInfo } from "@/lib/types";
import type { WhaleSummary } from "@/lib/market-insights";
import type { DisplayTone, TrendTone } from "./shared";
import type { ExchangeFlowReading } from "./sources/cryptoquant";

export interface WhaleTrackerCard {
  label: string;
  value: string;
  hint: string;
  tone: DisplayTone;
  sample?: boolean;
}

function formatWhaleUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Whale Tracker cards derived from the real WhaleTransfer feed, with
 * honesty caveats flagged inline via `sample`:
 *  - lib/alchemy.ts currently watches a handful of ERC-20 tokens (WETH,
 *    USDT, LINK, UNI, SHIB, PEPE), not native BTC — a genuine "Large BTC
 *    Transaction" needs a BTC-chain data source before this shows a real
 *    number, so it falls back to the largest tracked transfer instead.
 *  - `direction` in that feed is currently always "wallet-to-wallet" (no
 *    exchange-address tagging yet), so a wallet-transfer-only Exchange
 *    Inflow/Outflow can't be computed for real from `transfers` alone.
 *
 * Exchange Inflow/Outflow now has a real source: pass a CryptoQuant
 * `flow` reading (lib/intelligence/sources/cryptoquant.ts, needs
 * CRYPTOQUANT_API_KEY on a Professional/Premium plan — see honesty note
 * there) and `btcPriceUsd` to convert its native-BTC totals to USD. When
 * `flow` is present these two cards use it directly and stop depending on
 * exchange-address tagging entirely. Without it, they fall back to the
 * previous wallet-transfer estimate (still gated behind
 * `hasDirectionalData`, which stays false until addresses are tagged).
 */
export function buildWhaleTrackerCards(
  transfers: WhaleTransfer[],
  summary?: WhaleSummary,
  flow?: ExchangeFlowReading,
  btcPriceUsd?: number,
): WhaleTrackerCard[] {
  const btcTransfers = transfers.filter((t) => t.asset.toUpperCase() === "BTC");
  const largest = btcTransfers.length ? [...btcTransfers].sort((a, b) => b.valueUsd - a.valueUsd)[0] : summary?.largest;

  const hasRealFlow = !!flow && !!btcPriceUsd;
  const flowInflowUsd = hasRealFlow ? flow!.inflow * btcPriceUsd! : 0;
  const flowOutflowUsd = hasRealFlow ? flow!.outflow * btcPriceUsd! : 0;
  const flowNetflowUsd = hasRealFlow ? flow!.netflow * btcPriceUsd! : 0;

  const walletInflow = transfers.filter((t) => t.direction === "in").reduce((s, t) => s + t.valueUsd, 0);
  const walletOutflow = transfers.filter((t) => t.direction === "out").reduce((s, t) => s + t.valueUsd, 0);
  const hasDirectionalData = transfers.some((t) => t.direction === "in" || t.direction === "out");
  const walletNetAccumulation = walletOutflow - walletInflow;

  // Prefer the real CryptoQuant flow; otherwise fall back to the older
  // wallet-transfer estimate; otherwise "—" / waiting, same as before.
  const inflow = hasRealFlow ? flowInflowUsd : walletInflow;
  const outflow = hasRealFlow ? flowOutflowUsd : walletOutflow;
  const netAccumulation = hasRealFlow ? -flowNetflowUsd : walletNetAccumulation; // netflow = inflow - outflow, so accumulation is its negation
  const hasAnyDirectionalData = hasRealFlow || hasDirectionalData;

  return [
    {
      label: "Large Transaction",
      value: largest ? `${largest.asset} ${formatWhaleUsd(largest.valueUsd)}` : "—",
      hint: largest
        ? largest.direction === "wallet-to-wallet"
          ? "Wallet-to-wallet · terbesar terpantau"
          : `${largest.direction === "in" ? "Masuk" : "Keluar"} · terbesar terpantau`
        : "Belum ada transfer besar terdeteksi",
      tone: "neutral",
      sample: !btcTransfers.length,
    },
    {
      label: "Exchange Inflow",
      value: hasAnyDirectionalData ? formatWhaleUsd(inflow) : "—",
      hint: hasRealFlow
        ? `Potensi tekanan jual · ${flow!.exchange.replace("_", " ")} (CryptoQuant)`
        : hasDirectionalData
          ? "Potensi tekanan jual"
          : "Perlu CryptoQuant API atau tagging alamat exchange",
      tone: "down",
      sample: !hasAnyDirectionalData,
    },
    {
      label: "Exchange Outflow",
      value: hasAnyDirectionalData ? formatWhaleUsd(outflow) : "—",
      hint: hasRealFlow
        ? `Sinyal potensi accumulation · ${flow!.exchange.replace("_", " ")} (CryptoQuant)`
        : hasDirectionalData
          ? "Sinyal potensi accumulation"
          : "Perlu CryptoQuant API atau tagging alamat exchange",
      tone: "up",
      sample: !hasAnyDirectionalData,
    },
    {
      label: "Wallet Accumulation",
      value: hasAnyDirectionalData ? formatWhaleUsd(netAccumulation) : summary ? formatWhaleUsd(summary.totalUsd) : "—",
      hint: hasAnyDirectionalData
        ? `Net outflow dari exchange (${hasRealFlow ? "1 jam terakhir" : "tertimbang periode data"})`
        : `${summary?.count ?? 0} transfer besar terpantau`,
      tone: hasAnyDirectionalData ? (netAccumulation >= 0 ? "up" : "down") : "neutral",
      sample: !hasAnyDirectionalData,
    },
  ];
}

export function getSampleWhaleTrackerCards(): WhaleTrackerCard[] {
  return [
    { label: "Large Transaction", value: "BTC 2,500 BTC", hint: "Keluar exchange · terbesar 24 jam", tone: "neutral", sample: true },
    { label: "Exchange Inflow", value: "$18.4M", hint: "Potensi tekanan jual", tone: "down", sample: true },
    { label: "Exchange Outflow", value: "$42.1M", hint: "Sinyal potensi accumulation", tone: "up", sample: true },
    { label: "Wallet Accumulation", value: "+$23.7M", hint: "Net outflow dari exchange (24 jam)", tone: "up", sample: true },
  ];
}

export interface LiquidityZone {
  label: string;
  range: string;
  tone: TrendTone;
}

export interface LiquidityReading {
  symbol: string;
  markPrice: number;
  openInterestUsd?: number;
  fundingRatePct?: number;
  fundingTone: DisplayTone;
  liquidationZones: LiquidityZone[];
  sample?: boolean;
}

/**
 * Open Interest & Funding Rate are real, sourced from Binance Futures via
 * lib/binance.ts (already wired, no key needed). Liquidation Zone / High
 * Liquidity Area are a heuristic band around mark price, not real order-book
 * or liquidation-heatmap data (this app has no source for that yet) — always
 * rendered with an "estimate" flag in the UI.
 */
export function buildLiquidityReading(funding: FundingInfo[], symbol = "BTCUSDT"): LiquidityReading | undefined {
  const f = funding.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase());
  if (!f) return undefined;

  const fundingTone: DisplayTone = Math.abs(f.lastFundingRate) > 0.001 ? "amber" : "neutral";
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return {
    symbol: f.symbol,
    markPrice: f.markPrice,
    openInterestUsd: f.openInterestValue,
    fundingRatePct: f.lastFundingRate * 100,
    fundingTone,
    liquidationZones: [
      { label: "Liquidation cluster (long)", range: `${fmt(f.markPrice * 0.97)} – ${fmt(f.markPrice * 0.99)}`, tone: "down" },
      { label: "High liquidity area", range: `${fmt(f.markPrice * 1.01)} – ${fmt(f.markPrice * 1.03)}`, tone: "up" },
    ],
    sample: false,
  };
}

export function getSampleLiquidityReading(): LiquidityReading {
  return {
    symbol: "BTCUSDT",
    markPrice: 67_250,
    openInterestUsd: 4_820_000_000,
    fundingRatePct: 0.012,
    fundingTone: "amber",
    liquidationZones: [
      { label: "Liquidation cluster (long)", range: "$65,200 – $66,100", tone: "down" },
      { label: "High liquidity area", range: "$68,400 – $69,600", tone: "up" },
    ],
    sample: true,
  };
}

/**
 * Short whale-activity note for a single asset, for the map's BTC/ETH node
 * drawers. Returns undefined (not a fabricated note) when nothing for that
 * asset was seen in the tracked feed — e.g. BTC today, since lib/alchemy.ts
 * only watches ERC-20 tokens (WETH stands in for ETH, native BTC isn't
 * tracked yet).
 */
export function deriveAssetWhaleNote(transfers: WhaleTransfer[], assetSymbols: string[]): string | undefined {
  const matches = transfers.filter((t) => assetSymbols.some((s) => t.asset.toUpperCase() === s.toUpperCase()));
  if (!matches.length) return undefined;
  const totalUsd = matches.reduce((s, t) => s + t.valueUsd, 0);
  const largest = [...matches].sort((a, b) => b.valueUsd - a.valueUsd)[0];
  return `${matches.length} transfer besar (${formatWhaleUsd(totalUsd)} total), terbesar ${formatWhaleUsd(largest.valueUsd)}`;
}
