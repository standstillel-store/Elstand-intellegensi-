"use client";
import { formatUsd, shortAddr, timeAgo } from "@/lib/format";
import { BSC_EXPLORER_URL } from "../lib/config";
import type { PaginatedTransfers } from "../types";

function AddressCell({ address, onSelect }: { address: string; onSelect: (address: string) => void }) {
  return (
    <button onClick={() => onSelect(address)} className="mono-num text-[11px] text-ink-muted transition-colors hover:text-gold hover:underline" title={address}>
      {shortAddr(address)}
    </button>
  );
}

export function TransfersTable({
  data,
  loading,
  page,
  onPageChange,
  onSelectAddress,
  onRefresh,
}: {
  data: PaginatedTransfers | null;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onSelectAddress: (address: string) => void;
  onRefresh: () => void;
}) {
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col sm:min-h-0 sm:flex-1">
      {/* overflow-x-auto here (not overflow-auto) so on mobile the table
          scrolls sideways within its own box instead of the From/To address
          columns pushing past the screen edge ("nerobos batas") — the table
          has min-w-[560px] below so it needs somewhere to overflow into. On
          sm: and up, this also becomes the vertical scroll container since
          the panel has real bounded height there. pb-16 keeps the last rows
          clear of the floating AI chat bubble on mobile. */}
      <div className="overflow-x-auto pb-16 sm:min-h-0 sm:flex-1 sm:overflow-auto sm:pb-0">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead className="bg-bg-surface sm:sticky sm:top-0 sm:z-10">
            <tr className="border-b border-line text-[10px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium"></th>
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Token</th>
              <th className="px-3 py-2 text-right font-medium">USD</th>
            </tr>
          </thead>
          <tbody className="mono-num text-[11px]">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="animate-pulse px-3 py-8 text-center text-ink-faint">
                  Memuat whale transfers…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-faint">
                  Belum ada transfer yang cocok dengan filter ini.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.txHash}-${row.logIndex}`} className="border-b border-line/60 transition-colors hover:bg-bg-base/60">
                  <td className="px-3 py-1.5 text-ink-muted">
                    <a href={`${BSC_EXPLORER_URL}/tx/${row.txHash}`} target="_blank" rel="noreferrer" className="hover:text-gold hover:underline">
                      {timeAgo(row.blockTimestamp)}
                    </a>
                  </td>
                  <td className="px-3 py-1.5">
                    <AddressCell address={row.fromAddress} onSelect={onSelectAddress} />
                  </td>
                  <td className="px-1 py-1.5 text-ink-faint">→</td>
                  <td className="px-3 py-1.5">
                    <AddressCell address={row.toAddress} onSelect={onSelectAddress} />
                  </td>
                  <td className="px-3 py-1.5 text-right text-ink">{row.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-1.5 text-ink-muted">{row.tokenSymbol ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right text-[9.5px] font-semibold text-gold sm:text-[11px]" title={row.valueUsd == null ? "Harga token ini belum ke-index / tidak ada pool likuiditas yang kedeteksi" : undefined}>
                    {row.valueUsd == null ? <span className="text-ink-faint">—</span> : formatUsd(row.valueUsd)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Solid bg + relative z so this footer always sits cleanly above/below
          the scroll area instead of visually blending into table rows when
          the panel's height math is tight (short mobile viewports). */}
      <div className="relative z-10 flex items-center justify-between border-t border-line bg-bg-surface px-3 py-2 text-[11px] text-ink-faint">
        <button onClick={onRefresh} className="rounded-md border border-line px-2 py-1 text-ink-muted transition-colors hover:border-gold/40 hover:text-gold">
          ⟳ Refresh
        </button>
        <span className="hidden sm:inline">
          {total === 0 ? "Showing 0" : `Showing ${rangeStart}-${rangeEnd}`} of {total.toLocaleString("en-US")} transfers
        </span>
        <span className="sm:hidden mono-num">
          {rangeStart}-{rangeEnd} / {total.toLocaleString("en-US")}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-md border border-line px-2 py-1 text-ink-muted transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
          >
            ‹
          </button>
          <span className="mono-num">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-md border border-line px-2 py-1 text-ink-muted transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
