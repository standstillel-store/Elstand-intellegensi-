"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Activity } from "lucide-react";
import { FundingRateCard } from "./FundingRateCard";
import { MarketOrderFlowCard } from "./MarketOrderFlowCard";
import { OrderBookImbalanceCard } from "./OrderBookImbalanceCard";
import { LiveDot } from "@/components/ui/LiveDot";
import {
  SUPPORTED_PAIRS,
  type SupportedPair,
  type MicrostructurePeriod,
  type PremiumMicrostructureSnapshot,
} from "@/lib/intelligence/premiumMicrostructure";

const PERIODS: MicrostructurePeriod[] = ["1D", "7D", "1M"];

export function FuturesMicrostructurePanel() {
  const [pair, setPair] = useState<SupportedPair>("BTC");
  const [period, setPeriod] = useState<MicrostructurePeriod>("7D");
  const [snapshot, setSnapshot] = useState<PremiumMicrostructureSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/premium/microstructure?pair=${pair}&period=${period}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PremiumMicrostructureSnapshot | null) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pair, period]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-bg-raised text-signal">
            <Activity size={16} />
          </span>
          <div>
            <h2 className="eyebrow text-[11px] text-ink-muted">Futures Microstructure Intelligence</h2>
            <p className="text-[11px] text-ink-faint">Real-time derivatives &amp; order flow analysis — Binance Futures</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value as SupportedPair)}
              className="appearance-none rounded-lg border border-line bg-bg-raised px-3 py-1.5 pr-7 text-[12px] font-semibold text-ink"
            >
              {SUPPORTED_PAIRS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint" />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-[11px] font-semibold ${
                  p === period ? "bg-signal text-white" : "bg-bg-raised text-ink-faint hover:text-ink"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <span className="hidden items-center gap-1.5 rounded-lg border border-line bg-bg-raised px-2.5 py-1.5 text-[10px] text-ink-faint sm:flex">
            <LiveDot tone="up" />
            Live Data
          </span>
        </div>
      </div>

      {loading && !snapshot ? (
        <div className="panel p-8 text-center text-[12px] text-ink-faint">Loading microstructure data…</div>
      ) : !snapshot ? (
        <div className="panel p-8 text-center text-[12px] text-ink-faint">
          Futures microstructure data unavailable right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <FundingRateCard
            pair={snapshot.pair}
            multiAssetFunding={snapshot.multiAssetFunding}
            crossExchangeFunding={snapshot.crossExchangeFunding}
            currentFundingRate={snapshot.currentFundingRate}
          />
          <MarketOrderFlowCard pair={snapshot.pair} series={snapshot.orderFlow} />
          <div className="lg:col-span-2">
            <OrderBookImbalanceCard pair={snapshot.pair} book={snapshot.orderBook} />
          </div>
        </div>
      )}
    </section>
  );
}
