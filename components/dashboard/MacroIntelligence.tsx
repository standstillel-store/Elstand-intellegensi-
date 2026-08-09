import { AlertTriangle, Clock, Newspaper, Radar, TrendingDown, TrendingUp } from "lucide-react";
import type { MacroEventView } from "@/lib/intelligence/macroEvents";
import type { NewsItem } from "@/lib/types";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";

// ---------------------------------------------------------------------------
// Macro Intelligence — replaces the old standalone "News" + "Economic
// Calendar" surfaces on the dashboard with one connected intelligence layer:
// EVENT -> NEWS -> SENTIMENT -> MARKET IMPACT -> INSIGHT.
//
// Everything below is derived from data the dashboard already fetches
// (macroEvents, newsItems, sentiment reasons) — nothing here is fabricated.
// Where a value genuinely isn't available, the UI says so instead of
// inventing a number.
// ---------------------------------------------------------------------------

export interface MacroImpactAsset {
  label: string;
  direction: "up" | "down";
}

export interface MacroImpactRow {
  trigger: string;
  assets: MacroImpactAsset[];
}

function formatCountdown(hoursAway: number): string {
  const abs = Math.abs(hoursAway);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  const label = `${h}h ${m}m`;
  return hoursAway >= 0 ? label : `${label} ago`;
}

function impactBadgeClass(impact: "high" | "medium" | "low") {
  if (impact === "high") return "bg-down/15 text-down border-down/30";
  if (impact === "medium") return "bg-amber/15 text-amber border-amber/30";
  return "bg-line/40 text-ink-faint border-line";
}

function sentimentBadgeClass(sentiment?: "positive" | "negative" | "neutral") {
  if (sentiment === "positive") return "bg-up/15 text-up border-up/30";
  if (sentiment === "negative") return "bg-down/15 text-down border-down/30";
  return "bg-line/40 text-ink-faint border-line";
}

function statusLabel(status: GlobalSentimentReading["status"]) {
  switch (status) {
    case "risk-on":
      return { label: "Risk-On", cls: "text-up" };
    case "risk-off":
      return { label: "Risk-Off", cls: "text-down" };
    case "transition":
      return { label: "Transition", cls: "text-amber" };
    default:
      return { label: "Neutral", cls: "text-ink-muted" };
  }
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = diffMs / 36e5;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function MacroIntelligence({
  macroEvents,
  newsItems,
  sentiment,
  nextHighImpact,
  marketImpact,
}: {
  macroEvents: MacroEventView[];
  newsItems: NewsItem[];
  sentiment: GlobalSentimentReading;
  nextHighImpact?: { title: string; hoursAway: number };
  marketImpact: MacroImpactRow[];
}) {
  const highImpactCount = macroEvents.filter((e) => e.impact === "high").length;
  const posReasons = sentiment.reasons.filter((r) => r.direction === 1).length;
  const negReasons = sentiment.reasons.filter((r) => r.direction === -1).length;
  const status = statusLabel(sentiment.status);
  const topNews = newsItems.slice(0, 5);
  const upcomingEvents = macroEvents.slice(0, 6);

  return (
    <div className="glow-card overflow-hidden p-0">
      {/* Custom section header — deliberately its own compact bar rather
          than reusing the global TopNav, so this reads as an intelligence
          module inside the dashboard, matching the reference layout. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg-raised/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-signal/15 text-signal">
            <Radar size={14} />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-bold tracking-tight text-ink">ELSTAND</p>
            <p className="eyebrow text-[9px] tracking-[0.18em] text-ink-faint">MACRO INTELLIGENCE</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {["Overview", "Macro Intel", "Markets", "Watchlist", "Insights"].map((item, i) => (
            <span
              key={item}
              className={
                i === 1
                  ? "rounded-md bg-signal/15 px-2.5 py-1 font-medium text-signal"
                  : "rounded-md px-2.5 py-1 text-ink-faint"
              }
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Top summary strip */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Macro Events" value={String(macroEvents.length)} />
          <SummaryCard label="High Impact" value={String(highImpactCount)} accent={highImpactCount > 0 ? "down" : undefined} />
          <SummaryCard label="Market Risk" value={status.label} accentClass={status.cls} />
          <SummaryCard label="Macro Sentiment" value={`+${posReasons} / -${negReasons}`} />
          <SummaryCard
            label="Next Event"
            value={nextHighImpact ? formatCountdown(nextHighImpact.hoursAway) : "None imminent"}
            sub={nextHighImpact?.title}
          />
        </div>

        {/* Main intelligence area — 2 columns on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Macro Events */}
          <div className="panel p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              <Clock size={12} />
              Macro Events
            </div>
            {upcomingEvents.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-faint">Waiting API</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((e, i) => (
                  <div
                    key={`${e.title}-${e.date}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink">{e.title}</p>
                      <p className="mt-0.5 text-[10px] text-ink-faint">
                        {e.category} · {e.status === "upcoming" ? formatCountdown(e.hoursAway) : "Released"}
                        {e.forecast ? ` · Exp: ${e.forecast}` : ""}
                        {e.previous ? ` · Prev: ${e.previous}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${impactBadgeClass(e.impact)}`}>
                      {e.impact}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Macro News */}
          <div className="panel p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              <Newspaper size={12} />
              Macro News
            </div>
            {topNews.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-faint">Waiting API</p>
            ) : (
              <div className="space-y-2">
                {topNews.map((n) => (
                  <a
                    key={n.id}
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2 transition-colors hover:border-signal/40"
                  >
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${sentimentBadgeClass(n.sentiment)}`}
                    >
                      {n.sentiment ?? "neutral"}
                    </span>
                    <p className="mt-1.5 line-clamp-2 text-xs font-medium text-ink">{n.title}</p>
                    <p className="mt-1 text-[10px] text-ink-faint">
                      {n.source} · {timeAgo(n.publishedAt)}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Secondary intelligence: Market Impact */}
        <div className="panel p-3.5">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <TrendingUp size={12} />
            Market Impact
          </div>
          {marketImpact.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">Waiting API</p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {marketImpact.map((row) => (
                <div key={row.trigger} className="rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
                  <p className="text-xs font-semibold text-ink">{row.trigger}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {row.assets.map((a) => (
                      <span
                        key={a.label}
                        className={`flex items-center gap-1 text-[11px] font-medium ${a.direction === "up" ? "text-up" : "text-down"}`}
                      >
                        {a.label}
                        {a.direction === "up" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Macro Insight — synthesis */}
        <div className="rounded-xl border border-signal/25 bg-signal/[0.04] p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-signal">
            <AlertTriangle size={12} />
            Macro Insight
          </div>
          <p className="text-[13px] leading-relaxed text-ink">
            {sentiment.note ??
              (sentiment.reasons[0]
                ? `${sentiment.reasons[0].text} tetap jadi katalis makro dominan untuk sesi trading berikutnya.`
                : "Belum cukup sinyal makro untuk sintesis saat ini.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
            <span className="text-ink-faint">
              Risk: <span className={`font-semibold ${status.cls}`}>{status.label}</span>
            </span>
            <span className="text-ink-faint">
              Confidence: <span className="mono-num font-semibold text-ink">{sentiment.confidence}%</span>
            </span>
            <span className="text-ink-faint">
              Signals: <span className="mono-num font-semibold text-ink">{sentiment.signalsAvailable}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
  accentClass,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "up" | "down";
  accentClass?: string;
}) {
  const cls = accentClass ?? (accent === "up" ? "text-up" : accent === "down" ? "text-down" : "text-ink");
  return (
    <div className="rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-1 text-base font-bold tracking-tight ${cls}`}>{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[10px] text-ink-faint">{sub}</p> : null}
    </div>
  );
}
