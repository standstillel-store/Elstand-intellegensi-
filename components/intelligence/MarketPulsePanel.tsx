import { Activity } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import { PulseGauge } from "./ui/PulseGauge";
import { deriveMarketPulse, type MarketPulseInputs } from "@/lib/intelligence/marketPulse";

export function MarketPulsePanel({ inputs }: { inputs: MarketPulseInputs }) {
  const metrics = deriveMarketPulse(inputs);
  const connectedCount = metrics.filter((m) => m.connected).length;

  return (
    <div className="glow-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={14} className="text-signal-glow" />
        <SectionHeader code="PULSE" title="Market Pulse" hint={`${connectedCount}/${metrics.length} sinyal terhubung`} />
        <LiveDot tone="signal" />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {metrics.map((m) => (
          <PulseGauge key={m.key} metric={m} />
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Tiap gauge membaca ulang sinyal yang sudah dihitung di panel lain (sentiment, kalender makro, whale, funding
        rate, altseason, ETF flow) — bukan angka baru. Gauge bertanda &quot;Waiting&quot; berarti sumber datanya belum
        tersambung.
      </p>
    </div>
  );
}
