"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import { EquityCurveChart } from "./EquityCurveChart";
import { MonthlyPerformanceChart } from "./MonthlyPerformanceChart";
import { OpenTradesTable } from "./OpenTradesTable";
import { PendingOrdersTable } from "./PendingOrdersTable";
import { ClosedTradesTable } from "./ClosedTradesTable";
import { formatUsd } from "@/lib/format";
import type { AiSignal, AiStatistics, PaperWallet, JournalWithSignal } from "@/lib/elvoid/types";
import type { EquityPoint, MonthlyPoint } from "@/lib/elvoid/performance";

interface ViewState {
  wallet: PaperWallet | null;
  stats: AiStatistics | null;
  openSignals: AiSignal[];
  pendingSignals: AiSignal[];
  closedEntries: JournalWithSignal[];
  equityCurve: EquityPoint[];
  monthly: MonthlyPoint[];
  priceBySymbol: Record<string, number>;
  configured: boolean;
}

const EMPTY_STATE: ViewState = {
  wallet: null,
  stats: null,
  openSignals: [],
  pendingSignals: [],
  closedEntries: [],
  equityCurve: [],
  monthly: [],
  priceBySymbol: {},
  configured: true,
};

export function PaperTraderView() {
  const [state, setState] = useState<ViewState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [walletRes, statsRes, openRes, pendingRes, journalRes, perfRes, marketRes] = await Promise.all([
        fetch("/api/paper-trader/wallet").then((r) => r.json()),
        fetch("/api/paper-trader/stats").then((r) => r.json()),
        fetch("/api/ai-signals?status=open,tp1_hit&limit=50").then((r) => r.json()),
        fetch("/api/ai-signals?status=pending&limit=50").then((r) => r.json()),
        fetch("/api/ai-journal?limit=30").then((r) => r.json()),
        fetch("/api/ai-performance").then((r) => r.json()),
        fetch("/api/market")
          .then((r) => r.json())
          .catch(() => ({ markets: [] })),
      ]);

      const priceBySymbol: Record<string, number> = {};
      for (const m of marketRes.markets ?? []) {
        if (m?.symbol) priceBySymbol[String(m.symbol).toLowerCase()] = m.current_price;
      }

      setState({
        wallet: walletRes.wallet ?? null,
        stats: statsRes.stats ?? null,
        openSignals: openRes.signals ?? [],
        pendingSignals: pendingRes.signals ?? [],
        closedEntries: journalRes.entries ?? [],
        equityCurve: perfRes.equityCurve ?? [],
        monthly: perfRes.monthly ?? [],
        priceBySymbol,
        configured: Boolean(walletRes.configured),
      });
      setError(null);
    } catch {
      setError("Gagal memuat data Paper Trader — coba refresh halaman.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/paper-trader/sync", { method: "POST" });
      await loadAll();
    } finally {
      setSyncing(false);
    }
  }

  async function handleClose(signal: AiSignal) {
    setClosingId(signal.id);
    try {
      await fetch("/api/paper-trader/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id, coin: signal.coin }),
      });
      await loadAll();
    } finally {
      setClosingId(null);
    }
  }

  async function handleCancel(signal: AiSignal) {
    setCancelingId(signal.id);
    try {
      await fetch("/api/paper-trader/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id }),
      });
      await loadAll();
    } finally {
      setCancelingId(null);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink-muted">Memuat Paper Trader…</p>;
  }

  const { wallet, stats } = state;

  return (
    <div className="space-y-5">
      <Disclaimer />

      {!state.configured && (
        <div className="rounded-lg border border-signal/30 bg-signal/5 px-4 py-3 text-xs leading-relaxed text-ink-muted">
          Supabase belum dikonfigurasi — Paper Trader berjalan dengan data sementara dan tidak akan tersimpan. Lihat{" "}
          <span className="text-ink">Settings</span> untuk instruksi setup.
        </div>
      )}
      {error && <p className="text-sm text-down">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          {wallet ? `Terakhir diperbarui ${new Date(wallet.updated_at).toLocaleString("id-ID")}` : ""}
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-ink-muted hover:border-signal/40 hover:text-ink disabled:opacity-50"
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Sinkronisasi…" : "Sync Harga"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Virtual Balance" value={formatUsd(wallet?.balance ?? 10000)} />
        <StatCard label="Equity" value={formatUsd(wallet?.equity ?? 10000)} />
        <StatCard
          label="Total Profit"
          value={`${(wallet?.total_profit ?? 0) >= 0 ? "+" : ""}${(wallet?.total_profit ?? 0).toFixed(2)}%`}
          tone={(wallet?.total_profit ?? 0) >= 0 ? "up" : "down"}
        />
        <StatCard label="Win Rate" value={`${(stats?.win_rate ?? 0).toFixed(1)}%`} />
        <StatCard label="Profit Factor" value={(stats?.profit_factor ?? 0).toFixed(2)} />
        <StatCard label="Average RR" value={`${(stats?.average_rr ?? 0).toFixed(2)}R`} />
        <StatCard label="Max Drawdown" value={`${(stats?.max_drawdown ?? 0).toFixed(2)}%`} tone={(stats?.max_drawdown ?? 0) > 0 ? "down" : "neutral"} />
        <StatCard label="Total Trade" value={`${stats?.total_trade ?? 0}`} hint={stats ? `${stats.wins}W · ${stats.losses}L` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EquityCurveChart points={state.equityCurve} />
        <MonthlyPerformanceChart months={state.monthly} />
      </div>

      <PendingOrdersTable signals={state.pendingSignals} onCancel={handleCancel} cancelingId={cancelingId} />

      <OpenTradesTable
        signals={state.openSignals}
        priceBySymbol={state.priceBySymbol}
        riskPerTrade={wallet?.risk_per_trade ?? 1}
        onClose={handleClose}
        closingId={closingId}
      />

      <ClosedTradesTable entries={state.closedEntries} onRefresh={loadAll} />

      {stats && stats.total_trade > 0 && (
        <p className="text-center text-[11px] text-ink-faint">
          {stats.total_trade} total trade · {stats.wins} win · {stats.losses} loss · Max drawdown {stats.max_drawdown.toFixed(2)}%
        </p>
      )}
    </div>
  );
}
