"use client";
import { useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { SummaryCards } from "./SummaryCards";
import { FilterBar } from "./FilterBar";
import { TransfersTable } from "./TransfersTable";
import { WalletDetailDrawer } from "./WalletDetailDrawer";
import { useWhaleTransfers } from "../hooks/useWhaleTransfers";
import { useWhaleIndexerTick } from "../hooks/useWhaleIndexerTick";
import { DEFAULT_PAGE_SIZE } from "../lib/config";
import type { TransferFilters } from "../types";

/**
 * Rendered inside ELVOID PRO's TerminalShell when the "Whale Tracker" tab is
 * selected — a native module of Premium Dashboard, not a standalone page or
 * embedded external app (spec: "UI harus terasa seperti fitur native ELVOID
 * Premium, bukan embed aplikasi eksternal").
 */
export function WhaleTrackerPanel() {
  const [filters, setFilters] = useState<TransferFilters>({});
  const [page, setPage] = useState(1);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const { data, loading, refresh } = useWhaleTransfers(filters, page, DEFAULT_PAGE_SIZE);
  // Advances the BSC scanner while this panel is open — see hook doc for why
  // this (not a frequent server cron) is the primary indexing trigger.
  useWhaleIndexerTick(true);

  function updateFilters(next: TransferFilters) {
    setFilters(next);
    setPage(1); // any filter change resets pagination — stale offsets on a changed result set is a common, easy-to-miss bug
  }

  return (
    <div className="flex flex-col gap-3 sm:h-full sm:min-h-0">
      <SectionHeader code="WHALE" title="Whale Tracker" hint="BSC · BEP-20 + native BNB" accent="gold" />
      <SummaryCards />

      <div className="flex flex-col rounded-lg border border-line bg-bg-surface/60 sm:min-h-0 sm:flex-1">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <p className="text-xs font-semibold text-ink">All Transfers</p>
          <span className="text-[9px] uppercase tracking-wide text-ink-faint">bsc · live</span>
        </div>
        <FilterBar filters={filters} onChange={updateFilters} />
        <TransfersTable data={data} loading={loading} page={page} onPageChange={setPage} onSelectAddress={setSelectedAddress} onRefresh={refresh} />
      </div>

      <WalletDetailDrawer address={selectedAddress} onClose={() => setSelectedAddress(null)} onSelectAddress={setSelectedAddress} />
    </div>
  );
}
