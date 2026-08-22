import type { ScanResult } from "@/lib/elvoid/types";

function pctFor(scans: ScanResult[], keys: string[], wantedBias: "bullish" | "bearish"): number {
  const best = Math.max(0, ...scans.filter((s) => keys.includes(s.key) && s.bias === wantedBias).map((s) => s.weight));
  return Math.max(6, Math.min(100, Math.round((best / 15) * 100)));
}

function Bar({ label, value, tone = "signal" }: { label: string; value: number; tone?: "signal" | "up" }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-faint">{label}</span>
        <span className="mono-num text-ink-muted">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
        <div
          className={tone === "up" ? "h-full rounded-full bg-up transition-all duration-700" : "h-full rounded-full bg-signal transition-all duration-700"}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function SignalProgress({
  side,
  scans,
  extraReasoning,
  confluenceCount,
  confluenceTotal,
  confidence,
}: {
  side: "LONG" | "SHORT";
  scans: ScanResult[];
  extraReasoning: ScanResult[];
  confluenceCount: number | null;
  confluenceTotal: number | null;
  confidence: number;
}) {
  const wanted = side === "LONG" ? "bullish" : "bearish";
  const all = [...scans, ...extraReasoning];
  const marketScanPct = confluenceCount !== null && confluenceTotal ? Math.round((confluenceCount / confluenceTotal) * 100) : 0;

  return (
    <div className="space-y-2.5">
      <Bar label="Market Scan" value={marketScanPct} tone="up" />
      <Bar label="Liquidity" value={pctFor(all, ["liquidity_sweep", "liquidity_pool"], wanted)} />
      <Bar label="Structure" value={pctFor(all, ["market_structure"], wanted)} />
      <Bar label="Volume" value={pctFor(all, ["volume"], wanted)} />
      <Bar label="Macro" value={pctFor(all, ["macro", "sentiment"], wanted)} />
      <Bar label="Final Confidence" value={confidence} tone="up" />
    </div>
  );
}
