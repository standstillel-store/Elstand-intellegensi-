"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Radar, Loader2 } from "lucide-react";
import clsx from "clsx";

type LatestSignal = {
  side: "LONG" | "SHORT";
  confidence: number;
  status: string;
  trade_grade: string | null;
  created_at: string;
} | null;

type WatchlistRow = {
  coin: string;
  added_at: string;
  latestSignal: LatestSignal;
};

function statusLabel(status: string): string {
  switch (status) {
    case "new":
      return "Signal";
    case "pending":
    case "open":
    case "tp1_hit":
      return "Trade Open";
    case "closed":
      return "Closed";
    case "invalidated":
      return "Invalidated";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function statusTone(status: string): string {
  switch (status) {
    case "pending":
    case "open":
    case "tp1_hit":
      return "border-signal/40 bg-signal/10 text-signal-glow";
    case "closed":
      return "border-line bg-bg-raised text-ink-muted";
    case "invalidated":
    case "expired":
      return "border-down/30 bg-down/10 text-down";
    default:
      return "border-line bg-bg-raised text-ink-muted";
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  return `${Math.floor(hrs / 24)}h lalu`;
}

/**
 * AI Signal -> Watchlist tab. Persistent list of tracked coins (add/remove),
 * each row showing its latest signal at a glance. "Scan Market" (in
 * AiSignalView's top bar) already scans this exact list — see
 * lib/elvoid/service.ts's scanWatchlist(), which now reads from here instead
 * of the old hardcoded ELVOID_WATCHLIST array. The per-row Radar button
 * scans just that one coin via the same /api/ai-signals endpoint the
 * "Analyze" box above uses.
 */
export function WatchlistPanel({ onSignalsChanged }: { onSignalsChanged?: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCoin, setNewCoin] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingCoin, setRemovingCoin] = useState<string | null>(null);
  const [scanningCoin, setScanningCoin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist").then((r) => r.json());
      setItems(res.watchlist ?? []);
    } catch {
      // Keep whatever's already on screen; don't wipe the list on a transient fetch failure.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    const coin = newCoin.trim();
    if (!coin) return;
    setAdding(true);
    setError(null);
    try {
      const raw = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin }),
      });
      const res = await raw.json();
      if (res.error) {
        setError(res.error);
      } else {
        setNewCoin("");
        await load();
      }
    } catch {
      setError("Gagal menambahkan coin — koneksi terputus, coba lagi.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(coin: string) {
    setRemovingCoin(coin);
    setError(null);
    try {
      await fetch("/api/watchlist/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin }),
      });
      await load();
    } catch {
      setError("Gagal menghapus coin — koneksi terputus, coba lagi.");
    } finally {
      setRemovingCoin(null);
    }
  }

  async function handleScanOne(coin: string) {
    setScanningCoin(coin);
    setError(null);
    try {
      const raw = await fetch("/api/ai-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin }),
      });
      const res = await raw.json();
      if (res.error) {
        setError(res.message ?? res.error);
      } else if (res.autoExecuted) {
        // Signal qualified and got auto-executed into the paper trader —
        // jump straight to Paper Trader so the user sees the new position.
        router.push("/paper-trader");
        return;
      }
      await load();
      onSignalsChanged?.();
    } catch {
      setError(`Scan ${coin} gagal — koneksi terputus, coba lagi.`);
    } finally {
      setScanningCoin(null);
    }
  }

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold text-ink">Watchlist</h3>
        <span className="text-[11px] text-ink-faint">{items.length} coin · Scan Market di atas scan semua coin di sini</span>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-2">
        <input
          value={newCoin}
          onChange={(e) => setNewCoin(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Tambah coin ke watchlist, mis. INJ"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newCoin.trim()}
          className="flex shrink-0 items-center gap-1 rounded-md bg-signal px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-signal-glow disabled:opacity-50"
        >
          {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
      </div>

      {error && <p className="text-xs text-down">{error}</p>}

      {loading ? (
        <p className="py-4 text-center text-xs text-ink-muted">Memuat watchlist…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-muted">Watchlist kosong — tambahkan coin lewat kotak di atas.</p>
      ) : (
        <div className="divide-y divide-line/60">
          {items.map((item) => {
            const s = item.latestSignal;
            return (
              <div key={item.coin} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5">
                <div className="flex min-w-[88px] items-center gap-2">
                  <span className="text-sm font-bold text-ink">{item.coin}</span>
                  {s && (
                    <span className={clsx("text-[11px] font-semibold", s.side === "LONG" ? "text-up" : "text-down")}>{s.side}</span>
                  )}
                </div>

                <div className="flex min-w-[68px] items-baseline gap-1 text-[11px]">
                  <span className="text-ink-faint">Conf.</span>
                  <span className="mono-num font-semibold text-signal-glow">{s ? `${s.confidence}%` : "—"}</span>
                </div>

                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    s ? statusTone(s.status) : "border-line bg-bg-raised text-ink-faint"
                  )}
                >
                  {s ? statusLabel(s.status) : "Belum discan"}
                </span>

                <span className="min-w-[52px] text-[11px] text-ink-faint">{s ? relativeTime(s.created_at) : ""}</span>

                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => handleScanOne(item.coin)}
                    disabled={scanningCoin === item.coin}
                    title={`Scan ${item.coin}`}
                    aria-label={`Scan ${item.coin}`}
                    className="rounded-md border border-line p-1.5 text-ink-muted transition-colors hover:border-signal/50 hover:text-signal-glow disabled:opacity-50"
                  >
                    {scanningCoin === item.coin ? <Loader2 size={13} className="animate-spin" /> : <Radar size={13} />}
                  </button>
                  <button
                    onClick={() => handleRemove(item.coin)}
                    disabled={removingCoin === item.coin}
                    title={`Hapus ${item.coin} dari watchlist`}
                    aria-label={`Hapus ${item.coin} dari watchlist`}
                    className="rounded-md border border-line p-1.5 text-ink-muted transition-colors hover:border-down/50 hover:text-down disabled:opacity-50"
                  >
                    {removingCoin === item.coin ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
