"use client";
import { GlowCard } from "@/components/ui/GlowCard";
import { formatUsd } from "@/lib/format";
import { useWhaleSummary } from "../hooks/useWhaleSummary";

const CARDS: Array<{ key: "totalTransfers" | "volume24hUsd" | "largestTransferUsd" | "activeWallets24h" | "tokensTracked"; label: string; format: "count" | "usd" }> = [
  { key: "totalTransfers", label: "TOTAL TRANSFERS", format: "count" },
  { key: "volume24hUsd", label: "24H VOLUME", format: "usd" },
  { key: "largestTransferUsd", label: "LARGEST TRANSFER", format: "usd" },
  { key: "activeWallets24h", label: "ACTIVE WALLETS", format: "count" },
  { key: "tokensTracked", label: "TOKENS TRACKED", format: "count" },
];

export function SummaryCards() {
  const summary = useWhaleSummary();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map((card, i) => {
        const value = summary ? summary[card.key] : null;
        return (
          <GlowCard key={card.key} tone="gold" delay={i * 0.03} className="px-3 py-2.5">
            <p className="eyebrow text-[10px] text-ink-faint">{card.label}</p>
            <p className="mono-num mt-1 text-lg font-semibold text-ink">
              {value == null ? "—" : card.format === "usd" ? formatUsd(value) : value.toLocaleString("en-US")}
            </p>
          </GlowCard>
        );
      })}
    </div>
  );
}
