"use client";
import { formatUsd, shortAddr, timeAgo } from "@/lib/format";
import { BSC_EXPLORER_URL } from "../lib/config";
import { useWalletDetail } from "../hooks/useWalletDetail";

export function WalletDetailDrawer({ address, onClose, onSelectAddress }: { address: string | null; onClose: () => void; onSelectAddress: (address: string) => void }) {
  const { detail, loading, refreshing, refreshLive } = useWalletDetail(address);
  if (!address) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-bg-surface" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="eyebrow text-[10px] text-gold">WALLET INTELLIGENCE</p>
            <a href={`${BSC_EXPLORER_URL}/address/${address}`} target="_blank" rel="noreferrer" className="mono-num text-xs text-ink hover:text-gold hover:underline">
              {shortAddr(address)} ↗
            </a>
          </div>
          <button onClick={onClose} className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink">
            Close
          </button>
        </div>

        {loading && !detail ? (
          <p className="animate-pulse px-4 py-8 text-center text-xs text-ink-faint">Memuat wallet intelligence…</p>
        ) : detail ? (
          <div className="flex-1 space-y-4 px-4 py-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line p-2.5">
                <p className="text-[10px] text-ink-faint">EQUITY</p>
                <p className="mono-num text-base font-semibold text-gold">{detail.equityUsd == null ? "—" : formatUsd(detail.equityUsd)}</p>
              </div>
              <div className="rounded-lg border border-line p-2.5">
                <p className="text-[10px] text-ink-faint">NET FLOW</p>
                <p className={`mono-num text-base font-semibold ${detail.netFlowUsd >= 0 ? "text-up" : "text-down"}`}>
                  {detail.netFlowUsd >= 0 ? "+" : ""}
                  {formatUsd(detail.netFlowUsd)}
                </p>
              </div>
              <div className="rounded-lg border border-line p-2.5">
                <p className="text-[10px] text-ink-faint">INFLOW</p>
                <p className="mono-num text-sm text-up">{formatUsd(detail.inflowUsd)}</p>
              </div>
              <div className="rounded-lg border border-line p-2.5">
                <p className="text-[10px] text-ink-faint">OUTFLOW</p>
                <p className="mono-num text-sm text-down">{formatUsd(detail.outflowUsd)}</p>
              </div>
            </div>

            <button
              onClick={refreshLive}
              disabled={refreshing}
              className="w-full rounded-md border border-line py-1.5 text-[11px] text-ink-muted transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-50"
            >
              {refreshing ? "Membaca on-chain balance…" : "⟳ Refresh live balance"}
            </button>

            <section>
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">Holdings</p>
              <div className="divide-y divide-line/60 rounded-lg border border-line">
                {detail.holdings.length === 0 ? (
                  <p className="px-2.5 py-3 text-center text-[11px] text-ink-faint">Belum ada data balance — coba Refresh live balance.</p>
                ) : (
                  detail.holdings.map((h) => (
                    <div key={h.tokenAddress} className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
                      <span className="text-ink">{h.tokenSymbol ?? shortAddr(h.tokenAddress)}</span>
                      <span className="mono-num text-ink-muted">{h.balance.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
                      <span className="mono-num font-medium text-ink">{h.valueUsd == null ? "Price unavailable" : formatUsd(h.valueUsd)}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">Top Counterparties</p>
              <div className="divide-y divide-line/60 rounded-lg border border-line">
                {detail.topCounterparties.length === 0 ? (
                  <p className="px-2.5 py-3 text-center text-[11px] text-ink-faint">Belum ada counterparty tercatat.</p>
                ) : (
                  detail.topCounterparties.map((c) => (
                    <button key={c.address} onClick={() => onSelectAddress(c.address)} className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] transition-colors hover:bg-bg-base/60">
                      <span className="mono-num text-ink-muted hover:text-gold">{shortAddr(c.address)}</span>
                      <span className="mono-num text-ink">{formatUsd(c.volumeUsd)}</span>
                      <span className="text-ink-faint">{c.txCount}× tx</span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section>
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">Recent Transfers</p>
              <div className="divide-y divide-line/60 rounded-lg border border-line">
                {detail.recentTransfers.length === 0 ? (
                  <p className="px-2.5 py-3 text-center text-[11px] text-ink-faint">Belum ada transfer tercatat.</p>
                ) : (
                  detail.recentTransfers.map((t) => (
                    <div key={`${t.txHash}-${t.logIndex}`} className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
                      <span className="text-ink-faint">{timeAgo(t.blockTimestamp)}</span>
                      <span className="mono-num text-ink-muted">
                        {t.fromAddress === address.toLowerCase() ? "→ " : "← "}
                        {shortAddr(t.fromAddress === address.toLowerCase() ? t.toAddress : t.fromAddress)}
                      </span>
                      <span className="mono-num font-medium text-ink">{t.valueUsd == null ? "—" : formatUsd(t.valueUsd)}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-xs text-ink-faint">Gagal memuat data wallet.</p>
        )}
      </div>
    </div>
  );
}
