import clsx from "clsx";
import { Landmark, TrendingUp, Activity } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd } from "@/lib/format";
import type { SmartMoneyEntry } from "@/lib/scanner-categories";
import { getInstitutionalFlowData } from "@/lib/intelligence/institutionalFlow";

function WaitingBox({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-line px-3 py-6 text-center text-[11px] text-ink-faint">
      {label}
    </div>
  );
}

function FlowBar({ label, valueUsd, maxAbs }: { label: string; valueUsd: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.min(100, (Math.abs(valueUsd) / maxAbs) * 100) : 0;
  const positive = valueUsd >= 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-14 shrink-0 font-medium text-ink-muted">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={clsx("absolute inset-y-0", positive ? "left-1/2 bg-up" : "right-1/2 bg-down")}
          style={{ width: `${pct / 2}%` }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-ink-faint/40" />
      </div>
      <span className={clsx("mono-num w-20 shrink-0 text-right", positive ? "text-up" : "text-down")}>
        {positive ? "+" : ""}
        {formatUsd(valueUsd)}
      </span>
    </div>
  );
}

export async function InstitutionalFlowPanel({ smartMoney }: { smartMoney?: SmartMoneyEntry[] }) {
  const { etfFlows, etfNetTotalUsd, movements, connected } = await getInstitutionalFlowData();
  const maxAbs = Math.max(...etfFlows.map((f) => Math.abs(f.netFlowUsd)), 1);
  const hasSmartMoney = Boolean(smartMoney?.length);

  return (
    <div className="glow-card p-4">
      <SectionHeader
        code="INF"
        title="Institutional Flow"
        hint={connected ? `Net ETF ${etfNetTotalUsd >= 0 ? "+" : ""}${formatUsd(etfNetTotalUsd)}` : "Waiting for API"}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-ink-faint">
            <Landmark size={13} />
            <span className="eyebrow text-[10px] uppercase tracking-wider">ETF Flow</span>
          </div>
          {connected ? (
            <div className="space-y-2">
              {etfFlows.map((f) => (
                <FlowBar key={f.ticker} label={f.ticker} valueUsd={f.netFlowUsd} maxAbs={maxAbs} />
              ))}
            </div>
          ) : (
            <WaitingBox label="Waiting for API Connection" />
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-ink-faint">
            <TrendingUp size={13} />
            <span className="eyebrow text-[10px] uppercase tracking-wider">Smart Money Activity</span>
          </div>
          {hasSmartMoney ? (
            <ul className="divide-y divide-line">
              {smartMoney!.slice(0, 5).map((s) => (
                <li key={s.symbol} className="flex items-center gap-3 py-2 text-xs">
                  <span className="mono-num w-14 shrink-0 font-medium text-smartmoney-glow">{s.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-faint">{s.txCount} transaksi besar</span>
                  <span className="mono-num shrink-0 text-up">+{formatUsd(s.netInflowUsd)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <WaitingBox label="Belum ada aktivitas smart money terdeteksi" />
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-ink-faint">
            <Activity size={13} />
            <span className="eyebrow text-[10px] uppercase tracking-wider">Institutional Movement</span>
          </div>
          {connected && movements.length ? (
            <ul className="space-y-2.5">
              {movements.map((m) => (
                <li key={m.label} className="flex items-start gap-2 text-xs">
                  <span
                    className={clsx(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      m.tone === "up" ? "bg-up" : m.tone === "down" ? "bg-down" : "bg-ink-faint"
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-ink">{m.label}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">{m.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <WaitingBox label="Waiting for API Connection" />
          )}
        </div>
      </div>

      {!connected && (
        <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">
          ETF Flow &amp; Institutional Movement belum punya sumber data gratis tanpa API key — lihat komentar di
          lib/intelligence/institutionalFlow.ts untuk opsi (Farside Investors, SoSoValue, atau vendor berbayar). Smart
          Money Activity di sebelah sudah real dari data on-chain yang ada.
        </p>
      )}
    </div>
  );
}
