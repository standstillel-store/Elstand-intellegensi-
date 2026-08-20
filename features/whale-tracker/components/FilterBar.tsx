"use client";
import clsx from "clsx";
import type { TransferFilters } from "../types";

const QUICK_USD = [
  { label: "ALL", value: undefined },
  { label: "USD ≥ $1K", value: 1_000 },
  { label: "USD ≥ $10K", value: 10_000 },
  { label: "USD ≥ $50K", value: 50_000 },
  { label: "USD ≥ $100K", value: 100_000 },
  { label: "USD ≥ $1M", value: 1_000_000 },
];

export function FilterBar({
  filters,
  onChange,
}: {
  filters: TransferFilters;
  onChange: (next: TransferFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_USD.map((chip) => {
          const active = filters.minUsd === chip.value;
          return (
            <button
              key={chip.label}
              onClick={() => onChange({ ...filters, minUsd: chip.value })}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                active ? "border-gold/50 bg-gold/10 text-gold" : "border-line text-ink-muted hover:border-line hover:text-ink"
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <input
          value={filters.address ?? ""}
          onChange={(e) => onChange({ ...filters, address: e.target.value || undefined })}
          placeholder="Search address…"
          className="w-40 rounded-md border border-line bg-bg-base px-2 py-1 text-[11px] text-ink placeholder:text-ink-faint focus:border-gold/40 focus:outline-none"
        />
        <input
          value={filters.tokenSymbol ?? ""}
          onChange={(e) => onChange({ ...filters, tokenSymbol: e.target.value || undefined })}
          placeholder="Token…"
          className="w-24 rounded-md border border-line bg-bg-base px-2 py-1 text-[11px] text-ink placeholder:text-ink-faint focus:border-gold/40 focus:outline-none"
        />
      </div>
    </div>
  );
}
