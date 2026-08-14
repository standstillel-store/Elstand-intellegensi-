"use client";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";
import { formatUsd, formatPct } from "@/lib/format";

interface OiFlow {
  openInterestValue: number;
  deltaValueUsd: number;
  deltaPct: number;
}

interface FundingRow {
  symbol: string;
  lastFundingRate: number;
  markPrice: number;
}

export function FundingOIPanel({ symbol }: { symbol: string }) {
  const [oi, setOi] = useState<OiFlow | null>(null);
  const [funding, setFunding] = useState<FundingRow | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([
      fetch(`/api/oi-flow?symbol=${symbol}USDT`).then((r) => r.json()),
      fetch(`/api/funding`).then((r) => r.json()),
    ])
      .then(([oiData, fundingData]) => {
        if (cancelled) return;
        if (!oiData.error) setOi(oiData);
        const row = (fundingData.funding ?? []).find((f: FundingRow) => f.symbol === `${symbol}USDT`);
        setFunding(row ?? null);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div className="rounded-lg border border-line bg-bg-surface/40 p-3">
      <p className="text-xs font-semibold text-ink-muted">Open Interest & Funding</p>

      {status === "loading" && <p className="mt-3 animate-pulse text-[11px] text-ink-faint">Memuat…</p>}
      {status === "error" && <p className="mt-3 text-[11px] text-ink-faint">Data tidak tersedia.</p>}

      {status === "ready" && (
        <div className="mono-num mt-2 space-y-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-ink-faint">Open Interest</span>
            <span className="text-ink">{oi ? formatUsd(oi.openInterestValue) : "N/A"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-faint">OI Δ 24h</span>
            {oi ? (
              <span className={clsx("flex items-center gap-1", oi.deltaPct >= 0 ? "text-up" : "text-down")}>
                {oi.deltaPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {formatPct(oi.deltaPct)}
              </span>
            ) : (
              <span className="text-ink-faint">N/A</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-faint">Funding Rate</span>
            <span className={clsx(funding && funding.lastFundingRate >= 0 ? "text-up" : "text-down")}>
              {funding ? `${(funding.lastFundingRate * 100).toFixed(4)}%` : "N/A"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
