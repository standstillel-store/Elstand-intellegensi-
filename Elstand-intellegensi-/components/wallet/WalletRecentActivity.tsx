"use client";
import { forwardRef } from "react";
import { FileText } from "lucide-react";

/**
 * No indexer/event source is wired up yet for ELS Testnet purchases (both
 * purchase contracts in WALLET_NETWORK_CONFIG are still null), so there is
 * no real transaction data to read. Renders the empty state per spec —
 * never a dummy/placeholder row. Once purchases go live, wire this to real
 * on-chain ELS transfer events for `address` (e.g. via BscScan API or a log
 * subscription).
 */
export const WalletRecentActivity = forwardRef<HTMLDivElement, { address: `0x${string}` }>(
  function WalletRecentActivity(_props, ref) {
    return (
      <div ref={ref} className="rounded-lg border border-line bg-bg-surface/60 p-4">
        <p className="text-sm font-semibold text-ink">Recent Activity</p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-bg-raised">
            <FileText size={18} className="text-ink-faint" />
          </div>
          <div>
            <p className="text-sm text-ink">No transactions yet.</p>
            <p className="mt-0.5 text-[11px] text-ink-faint">Your ELS purchases will appear here.</p>
          </div>
        </div>
      </div>
    );
  }
);
