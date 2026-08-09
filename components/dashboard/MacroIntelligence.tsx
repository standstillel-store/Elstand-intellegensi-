import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  Clock,
  Gauge,
  MessageSquare,
  Newspaper,
  Scale,
  Shield,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { MacroEventView } from "@/lib/intelligence/macroEvents";
import type { NewsItem } from "@/lib/types";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";

// ---------------------------------------------------------------------------
// Macro Intelligence — replaces the old standalone "News" + "Economic
// Calendar" pages with one connected intelligence layer:
// EVENT -> NEWS -> SENTIMENT -> MARKET IMPACT -> WATCHLIST -> INSIGHT.
//
// Layout follows the ELSTAND Intel Hub reference: icon-badge summary strip,
// a "next high impact" banner, a two-column desktop grid (single column on
// mobile), a watchlist row, and a 4-card Market Insight grid at the bottom.
//
// Everything is derived from real data passed in as props — where a value
// genuinely isn't available, the UI says so ("Waiting API") instead of
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

export interface WatchlistAsset {
  symbol: string;
  price: number;
  changePct?: number;
  /** Oldest -> newest. Renders a tiny inline sparkline if present. */
  series?: number[];
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

function formatPrice(v: number) {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 4 : 2 });
}

function Sparkline({ series, up }: { series: number[]; up: boolean }) {
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const w = 64;
  const h = 20;
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline points={points} fill="none" stroke={up ? "var(--up, #22c55e)" : "var(--down, #ef4444)"} strokeWidth={1.5} />
    </svg>
  );
}

export function MacroIntelligence({
  macroEvents,
  newsItems,
  sentiment,
  nextHighImpact,
  marketImpact,
  watchlist = [],
}: {
  macroEvents: MacroEventView[];
  newsItems: NewsItem[];
  sentiment: GlobalSentimentReading;
  nextHighImpact?: { title: string; hoursAway: number };
  marketImpact: MacroImpactRow[];
  watchlist?: WatchlistAsset[];
}) {
  const highImpactCount = macroEvents.filter((e) => e.impact === "high").length;
  const posReasons = sentiment.reasons.filter((r) => r.direction === 1).length;
  const negReasons = sentiment.reasons.filter((r) => r.direction === -1).length;
  const status = statusLabel(sentiment.status);
  const topNews = newsItems.slice(0, 5);
  const upcomingEvents = macroEvents.slice(0, 6);
  const nextEvent = macroEvents.find((e) => e.status === "upcoming") ?? macroEvents[0];

  // Market Insight 4-card synthesis — every value traces back to data
  // already on this page (event impact count, news pos/neg ratio, sentiment
  // status), not a separate fabricated score.
  const riskLevel = highImpactCount >= 5 ? "High" : highImpactCount >= 2 ? "Medium" : "Low";
  const newsBias = posReasons > negReasons ? "Bullish" : negReasons > posReasons ? "Bearish" : "Neutral";
  const expectedVolatility = highImpactCount >= 5 ? "High" : highImpactCount >= 2 ? "Medium" : "Low";

  return (
    <div className="glow-card overflow-hidden p-0">
      {/* Custom section header — its own compact bar rather than reusing
          the global TopNav, so this reads as a dedicated intelligence
          module inside the app. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg-raised/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-signal/15 text-signal">
            <Gauge size={16} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-ink">ELSTAND</p>
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
        {/* Top summary strip — icon-badge cards */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard icon={Calendar} iconBg="bg-signal/15 text-signal" label="Macro Events" value={String(macroEvents.length)} />
          <SummaryCard icon={AlertTriangle} iconBg="bg-down/15 text-down" label="High Impact" value={String(highImpactCount)} valueCls="text-down" />
          <SummaryCard icon={MessageSquare} iconBg="bg-signal/15 text-signal" label="Market Risk" value={riskLevel} valueCls={status.cls} />
          <SummaryCard icon={TrendingUp} iconBg="bg-up/15 text-up" label="Macro Sentiment" value={`+${posReasons} / -${negReasons}`} />
          <SummaryCard
            icon={Clock}
            iconBg="bg-signal/15 text-signal"
            label="Next Event"
            value={nextHighImpact ? formatCountdown(nextHighImpact.hoursAway) : "None imminent"}
            sub={nextHighImpact?.title}
          />
        </div>

        {/* Next major event banner */}
        {nextEvent ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-raised/40 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-signal/15 text-signal">
                <Zap size={14} />
              </span>
              <div>
                <p className="text-xs font-semibold text-ink">{nextEvent.title}</p>
                <p className="mt-0.5 text-[10px] text-ink-faint">
                  {nextEvent.category} · {nextEvent.status === "upcoming" ? formatCountdown(nextEvent.hoursAway) : "Released"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${impactBadgeClass(nextEvent.impact)}`}>
                {nextEvent.impact}
              </span>
              <ChevronRight size={14} className="text-ink-faint" />
            </div>
          </div>
        ) : null}

        {/* Main intelligence area — 2 columns on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Macro Events */}
          <div className="panel p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              <Calendar size={12} />
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

        {/* Market Impact */}
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
                        className={`text-[11px] font-medium ${a.direction === "up" ? "text-up" : "text-down"}`}
                      >
                        {a.label} {a.direction === "up" ? "\u2191" : "\u2193"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Watchlist */}
        <div className="panel p-3.5">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <Scale size={12} />
            Market Watchlist
          </div>
          {watchlist.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">Waiting API</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {watchlist.map((a) => {
                const up = (a.changePct ?? 0) >= 0;
                return (
                  <div key={a.symbol} className="rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-ink">{a.symbol}</p>
                    <p className="mono-num mt-1 text-sm font-semibold text-ink">{formatPrice(a.price)}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {a.changePct !== undefined ? (
                        <span className={`text-[10px] font-medium ${up ? "text-up" : "text-down"}`}>
                          {up ? "+" : ""}
                          {a.changePct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-faint">—</span>
                      )}
                      {a.series && a.series.length > 1 ? <Sparkline series={a.series} up={up} /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Market Insight — 4-card grid */}
        <div>
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <AlertTriangle size={12} />
            Market Insight
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <InsightCard icon={Shield} iconBg="bg-down/15 text-down" label="Risk Level" value={riskLevel} sub="Volatility may increase" />
            <InsightCard icon={TrendingUp} iconBg="bg-down/15 text-down" label="News Bias" value={newsBias} sub={negReasons >= posReasons ? "Negative news dominates" : "Positive news dominates"} />
            <InsightCard icon={Scale} iconBg="bg-signal/15 text-signal" label="Macro Bias" value={status.label} sub="Mixed economic signals" />
            <InsightCard icon={Zap} iconBg="bg-down/15 text-down" label="Expected Volatility" value={expectedVolatility} sub="Prepare for spikes" />
          </div>
        </div>

        {/* Macro Insight — synthesis note */}
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
  icon: Icon,
  iconBg,
  label,
  value,
  sub,
  valueCls,
}: {
  icon: LucideIcon;
  iconBg: string;
  label: string;
  value: string;
  sub?: string;
  valueCls?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconBg}`}>
        <Icon size={13} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wide text-ink-faint">{label}</p>
        <p className={`mt-0.5 truncate text-sm font-bold tracking-tight ${valueCls ?? "text-ink"}`}>{value}</p>
        {sub ? <p className="mt-0.5 truncate text-[10px] text-ink-faint">{sub}</p> : null}
      </div>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
      <span className={`flex h-7 w-7 items-center justify-center rounded-md ${iconBg}`}>
        <Icon size={13} />
      </span>
      <p className="mt-2 text-[9px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 text-sm font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[10px] text-ink-faint">{sub}</p>
    </div>
  );
}
