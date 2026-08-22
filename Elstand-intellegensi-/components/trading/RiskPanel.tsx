"use client";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd, formatPct } from "@/lib/format";
import { MAX_RISK_PERCENT_CLIENT, MIN_RISK_REWARD_CLIENT, MAX_RISK_REWARD_CLIENT, MIN_CONFLUENCES_CLIENT } from "@/lib/binance/constantsClient";
import type { PositionInfo } from "@/lib/binance/types";
import type { PositionMeta } from "@/lib/binance/db";

type PositionRow = PositionInfo & { meta: PositionMeta | null };

export function RiskPanel({ positions, equity }: { positions: PositionRow[]; equity: number }) {
  const rows = positions.map((p) => {
    const stop = p.meta?.initial_stop;
    const riskUsd = stop ? Math.abs(p.entryPrice - stop) * Math.abs(p.positionAmt) : null;
    const riskPct = riskUsd !== null && equity > 0 ? (riskUsd / equity) * 100 : null;
    return { ...p, riskUsd, riskPct };
  });
  const totalRiskUsd = rows.reduce((sum, r) => sum + (r.riskUsd ?? 0), 0);
  const totalRiskPct = equity > 0 ? (totalRiskUsd / equity) * 100 : 0;
  const anyBreach = rows.some((r) => r.riskPct !== null && r.riskPct > MAX_RISK_PERCENT_CLIENT + 0.05);

  return (
    <div className="glow-card p-4">
      <SectionHeader code="RSK" title="Risk Panel" hint="Hard cap 1% per trade" />

      <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div className="rounded-md border border-line p-2.5">
          <p className="text-[10px] uppercase text-ink-faint">Max Risk / Trade</p>
          <p className="mono-num mt-1 text-sm font-semibold text-ink">{formatPct(MAX_RISK_PERCENT_CLIENT)}</p>
        </div>
        <div className="rounded-md border border-line p-2.5">
          <p className="text-[10px] uppercase text-ink-faint">Min Risk:Reward</p>
          <p className="mono-num mt-1 text-sm font-semibold text-ink">1:{MIN_RISK_REWARD_CLIENT}</p>
        </div>
        <div className="rounded-md border border-line p-2.5">
          <p className="text-[10px] uppercase text-ink-faint">Max Risk:Reward</p>
          <p className="mono-num mt-1 text-sm font-semibold text-ink">1:{MAX_RISK_REWARD_CLIENT}</p>
        </div>
        <div className="rounded-md border border-line p-2.5">
          <p className="text-[10px] uppercase text-ink-faint">Min Confluence</p>
          <p className="mono-num mt-1 text-sm font-semibold text-ink">{MIN_CONFLUENCES_CLIENT}</p>
        </div>
      </div>

      <div className={`mb-4 flex items-center gap-2 rounded-md border p-2.5 text-xs ${anyBreach ? "border-down/40 bg-down/10 text-down" : "border-up/30 bg-up/5 text-up"}`}>
        {anyBreach ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
        <span>
          Total exposure risk saat ini: <span className="mono-num font-medium">{formatUsd(totalRiskUsd)}</span> ({formatPct(totalRiskPct)} dari equity)
          {anyBreach && " — salah satu posisi melebihi batas 1%, cek Stop Loss-nya."}
        </span>
      </div>

      {!rows.length && <p className="py-4 text-center text-sm text-ink-muted">Tidak ada posisi terbuka untuk dihitung risikonya.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-3 font-medium">Symbol</th>
                <th className="pb-2 pr-3 font-medium">Leverage</th>
                <th className="pb-2 pr-3 font-medium">SL Distance</th>
                <th className="pb-2 pr-3 font-medium">Risk $</th>
                <th className="pb-2 font-medium">Risk %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td className="py-2 pr-3 font-medium">{r.symbol}</td>
                  <td className="mono-num py-2 pr-3 text-xs">{r.leverage}x</td>
                  <td className="mono-num py-2 pr-3 text-xs text-ink-muted">{r.meta?.initial_stop ? formatUsd(Math.abs(r.entryPrice - r.meta.initial_stop)) : "—"}</td>
                  <td className="mono-num py-2 pr-3 text-xs">{r.riskUsd !== null ? formatUsd(r.riskUsd) : "—"}</td>
                  <td className={`mono-num py-2 text-xs font-medium ${r.riskPct !== null && r.riskPct > MAX_RISK_PERCENT_CLIENT ? "text-down" : "text-ink"}`}>
                    {r.riskPct !== null ? formatPct(r.riskPct) : "No SL"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
