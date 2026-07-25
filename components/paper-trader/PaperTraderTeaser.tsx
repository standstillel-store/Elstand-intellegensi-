import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { formatUsd } from "@/lib/format";
import type { PaperWallet, AiStatistics } from "@/lib/elvoid/types";

export function PaperTraderTeaser({
  wallet,
  stats,
  newSignalCount,
}: {
  wallet: PaperWallet;
  stats: AiStatistics;
  newSignalCount: number;
}) {
  return (
    <Link href="/paper-trader" className="panel flex items-center justify-between gap-4 p-4 transition-colors hover:border-signal/40">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-signal/10 text-signal-glow">
          <Wallet size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">ElVoid AI Paper Trader</p>
          <p className="mono-num truncate text-xs text-ink-muted">
            Equity {formatUsd(wallet.equity)} · Win rate {stats.win_rate.toFixed(1)}%
            {newSignalCount > 0 ? ` · ${newSignalCount} sinyal baru` : ""}
          </p>
        </div>
      </div>
      <ArrowRight size={16} className="shrink-0 text-ink-faint" />
    </Link>
  );
}
