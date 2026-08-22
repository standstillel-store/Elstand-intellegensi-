"use client";
import { Wifi, WifiOff, Clock, Radio } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { LiveDot } from "@/components/ui/LiveDot";
import type { StatusState } from "@/lib/hooks/useBinanceTrading";

export function ConnectionStatusBar({ status }: { status: StatusState | null }) {
  if (!status) {
    return (
      <div className="glow-card flex items-center gap-2 px-4 py-3 text-xs text-ink-faint">
        <Clock size={13} className="animate-pulse" /> Menghubungkan ke Binance…
      </div>
    );
  }

  const serverTimeLabel = status.serverTime ? new Date(status.serverTime).toLocaleTimeString("en-US", { hour12: false }) : "—";

  return (
    <div className="glow-card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <div className="flex items-center gap-2">
        {status.connected ? <Wifi size={15} className="text-up" /> : <WifiOff size={15} className="text-down" />}
        <span className="text-xs font-medium text-ink">{status.connected ? "Connected" : "Disconnected"}</span>
      </div>

      <Badge tone={status.mode === "live" ? "down" : "signal"} size="sm">
        {status.mode === "live" ? "● LIVE MODE" : "TESTNET"}
      </Badge>
      <Badge tone="neutral" size="sm">
        {status.market === "futures" ? "USDT-M Futures" : "Spot"}
      </Badge>

      {!status.configured && <span className="text-xs text-amber">API key belum dikonfigurasi (.env.local)</span>}
      {status.configured && status.error && <span className="text-xs text-down">{status.error}</span>}

      {status.connected && (
        <>
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Clock size={12} />
            Server: <span className="mono-num text-ink">{serverTimeLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Radio size={12} />
            Latency:{" "}
            <span className={`mono-num ${!status.latencyMs ? "text-ink" : status.latencyMs < 300 ? "text-up" : status.latencyMs < 800 ? "text-amber" : "text-down"}`}>
              {status.latencyMs ?? "—"}ms
            </span>
          </div>
          {status.clockDriftMs !== undefined && Math.abs(status.clockDriftMs) > 1000 && (
            <span className="text-xs text-amber">Clock drift {status.clockDriftMs}ms — cek jam sistem server.</span>
          )}
        </>
      )}

      {status.emergencyStopped && (
        <Badge tone="down" size="sm">
          🛑 EMERGENCY STOP AKTIF
        </Badge>
      )}
      {!status.persistenceConfigured && <span className="text-xs text-ink-faint">Supabase belum diset — Auto Trader &amp; jurnal nonaktif.</span>}

      <div className="ml-auto">
        <LiveDot tone={status.connected ? "up" : "down"} label={status.connected ? "Live" : "Offline"} />
      </div>
    </div>
  );
}
