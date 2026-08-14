"use client";
import { FileText } from "lucide-react";

/**
 * No indexer/transaction source is wired up yet for the BSC Testnet swap
 * contract (SWAP_CONTRACT is null in lib/web3/config.ts), so there is no
 * real transaction data to read. Per the wallet spec this renders the empty
 * state rather than any placeholder/dummy rows. Once swaps go live, wire
 * this to real on-chain events (e.g. via the explorer API or a log
 * subscription) — never fabricate rows here.
 */
export function WalletRecentActivity({ address }: { address: `0x${string}` | undefined }) {
  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Recent Transactions</p>
      </div>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-bg-raised">
          <FileText size={18} className="text-ink-faint" />
        </div>
        <div>
          <p className="text-sm text-ink">No transactions yet.</p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            {address ? "Your swap and transfer history will appear here." : "Connect your wallet to see activity."}
          </p>
        </div>
      </div>
    </div>
  );
}
