import { RadialGauge } from "@/components/ui/RadialGauge";
import { MarketStatusBadge } from "@/components/intelligence/MarketStatusBadge";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";

const GAUGE_TONE = {
  "risk-on": "up",
  "risk-off": "down",
  neutral: "signal",
  transition: "amber",
} as const;

function summarize(sentiment: GlobalSentimentReading): string {
  if (sentiment.reasons.length) {
    return sentiment.reasons
      .slice(0, 3)
      .map((r) => r.text)
      .join(" ");
  }
  return sentiment.note ?? "Belum cukup sinyal live untuk menilai regime pasar saat ini — menunggu lebih banyak sumber data terhubung.";
}

export function GlobalRiskRegimePanel({ sentiment }: { sentiment: GlobalSentimentReading }) {
  const summary = summarize(sentiment);

  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow text-[11px] text-ink-muted">Global Risk Regime</h2>
        <span className="text-[10px] text-ink-faint">
          {sentiment.signalsAvailable} signal{sentiment.signalsAvailable === 1 ? "" : "s"} live
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2 sm:w-32">
          <RadialGauge value={sentiment.confidence} label="SCORE" tone={GAUGE_TONE[sentiment.status]} />
          <MarketStatusBadge status={sentiment.status} size="sm" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">AI Summary</div>
          <p className="text-[13px] leading-relaxed text-ink-muted">{summary}</p>
        </div>

        {sentiment.reasons.length > 0 && (
          <div className="shrink-0 sm:w-56">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Key Factors</div>
            <ul className="space-y-1">
              {sentiment.reasons.slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-ink-muted">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${r.direction === 1 ? "bg-up" : "bg-down"}`} />
                  <span className="leading-snug">{r.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
