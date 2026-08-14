"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Crown, Zap } from "lucide-react";
import { formatUsd, formatPct } from "@/lib/format";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

interface Ticker24h {
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number;
}

interface FundingRow {
  symbol: string;
  lastFundingRate: number;
  openInterestValue?: number;
}

/** AI Energy widget re-fetches its own balance (same /api/ai-energy contract
 * as components/dashboard/AiEnergyWidget.tsx) — kept local/minimal here
 * since the terminal only needs the number, not the claim flow. */
function useAiEnergy() {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-energy")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && data && setBalance(data.balance))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return balance;
}

export function MarketHeader({ symbol }: { symbol: string }) {
  const [ticker, setTicker] = useState<Ticker24h | null>(null);
  const [funding, setFunding] = useState<FundingRow | null>(null);
  const aiEnergy = useAiEnergy();

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const [tickerRes, fundingRes] = await Promise.all([
          fetch(`/api/market-24h?symbol=${symbol}`).then((r) => r.json()),
          fetch(`/api/funding`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (!tickerRes.error) setTicker(tickerRes.ticker);
        const row = (fundingRes.funding ?? []).find((f: FundingRow) => f.symbol === `${symbol}USDT`);
        setFunding(row ?? null);
      } catch {
        /* keep last known values */
      }
    }
    poll();
    const id = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-bg-surface/60 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        <div>
          <p className="text-sm font-bold text-ink">
            {symbol}/USDT <span className="text-[10px] font-normal text-ink-faint">Perpetual</span>
          </p>
        </div>

        <div className="mono-num flex items-baseline gap-2">
          <span className="text-xl font-bold text-ink">{ticker ? formatUsd(ticker.lastPrice) : "—"}</span>
          {ticker && (
            <span className={clsx("text-xs font-semibold", ticker.priceChangePercent >= 0 ? "text-up" : "text-down")}>
              {formatPct(ticker.priceChangePercent)}
            </span>
          )}
        </div>

        <div className="mono-num hidden items-center gap-4 text-[11px] text-ink-faint sm:flex">
          <span>
            24H High <span className="text-ink">{ticker ? formatUsd(ticker.highPrice) : "—"}</span>
          </span>
          <span>
            24H Low <span className="text-ink">{ticker ? formatUsd(ticker.lowPrice) : "—"}</span>
          </span>
          <span>
            24H Volume <span className="text-ink">{ticker ? formatUsd(ticker.quoteVolume) : "—"}</span>
          </span>
          <span>
            Open Interest <span className="text-ink">{funding?.openInterestValue ? formatUsd(funding.openInterestValue) : "N/A"}</span>
          </span>
          <span>
            Funding{" "}
            <span className={funding && funding.lastFundingRate >= 0 ? "text-up" : "text-down"}>
              {funding ? `${(funding.lastFundingRate * 100).toFixed(4)}%` : "N/A"}
            </span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-[11px]">
        <span className="hidden items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-ink-faint md:flex">
          {WALLET_NETWORK_CONFIG.chainShortLabel ?? "BSC Testnet"}
        </span>
        <span className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-ink-muted">
          <Zap size={12} className="text-signal-glow" />
          {aiEnergy !== null ? aiEnergy : "—"}
        </span>
        <span className="hidden items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-gold sm:flex">
          <Crown size={12} />
          ELVOID PRO
        </span>
      </div>
    </div>
  );
}
