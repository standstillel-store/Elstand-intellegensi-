import type { BtcMicrostructure } from "@/lib/intelligence/btcMicrostructure";

function fmtUsd(n: number | undefined, digits = 0) {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function fmtPct(n: number | undefined, digits = 3) {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function Stat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-surface px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mono-num mt-0.5 text-sm font-semibold ${valueClassName ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

export function BtcFundingPanel({ data }: { data: BtcMicrostructure }) {
  const fundingClass =
    data.fundingRate === undefined ? "text-ink-faint" : data.fundingRate >= 0 ? "text-up" : "text-down";
  const oiChangeClass =
    data.openInterestChangePercent === undefined
      ? "text-ink-faint"
      : data.openInterestChangePercent >= 0
        ? "text-up"
        : "text-down";

  return (
    <div className="glow-card ambient-glow ambient-glow-gold overflow-hidden p-4">
      <div className="flex items-center gap-2.5">
        <span className={`live-dot ${data.connected.funding ? "bg-up" : "bg-ink-faint"}`} />
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink">BTC Funding &amp; Open Interest</h2>
      </div>

      {!data.connected.funding ? (
        <div className="mt-3 flex h-32 items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
          DATA UNAVAILABLE
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Stat
            label="Funding Rate (8h)"
            value={data.fundingRate !== undefined ? fmtPct(data.fundingRate * 100) : "—"}
            valueClassName={fundingClass}
          />
          <Stat
            label="Est. Annualized"
            value={data.fundingRateAnnualized !== undefined ? fmtPct(data.fundingRateAnnualized * 100, 1) : "—"}
            valueClassName={fundingClass}
          />
          <Stat label="Mark Price" value={fmtUsd(data.markPrice, 1)} />
          <Stat
            label="Basis vs Spot"
            value={
              data.basis !== undefined
                ? `${data.basis >= 0 ? "+" : ""}${data.basis.toFixed(1)} (${fmtPct(data.basisPercent)})`
                : "—"
            }
          />
          <Stat label="Open Interest" value={fmtUsd(data.openInterestValue)} />
          <Stat
            label="OI Change (1h)"
            value={data.connected.oiHistory ? fmtPct(data.openInterestChangePercent, 2) : "MENUNGGU DATA"}
            valueClassName={data.connected.oiHistory ? oiChangeClass : "text-ink-faint"}
          />
        </div>
      )}

      <p className="mt-3 text-[10px] text-ink-faint">
        {data.fundingRate !== undefined
          ? data.fundingRate >= 0
            ? "Funding positif — posisi long membayar short."
            : "Funding negatif — posisi short membayar long."
          : "Kalkulasi real dari funding, mark price, dan open interest Binance — bukan sinyal beli/jual."}
      </p>
    </div>
  );
}
