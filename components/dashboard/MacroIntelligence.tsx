import { AlertTriangle, Calendar, ChevronRight, Clock, MessageSquare, Scale, Shield, Target, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import type { MacroEventView } from "@/lib/intelligence/macroEvents";
import type { NewsItem, EconomicEvent } from "@/lib/types";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";
import { MACRO_KNOWLEDGE } from "@/lib/intelligence/macroKnowledge";
import { EconomicCalendarPanel } from "./EconomicCalendarPanel2";
import { MacroNewsPanel } from "./MacroNewsPanel";
import { MacroIntelligenceHeader, MacroIntelligenceBottomTabs } from "./MacroIntelligenceHeader";
import { Footer } from "@/components/Footer";
import { AIChatDock } from "@/components/AIChatDock";

// ---------------------------------------------------------------------------
// Macro Intelligence — merges the old standalone "News" + "Economic
// Calendar" pages into one connected intelligence layer:
// EVENT -> NEWS -> SENTIMENT -> MARKET IMPACT -> WATCHLIST -> INSIGHT.
//
// Desktop and mobile are deliberately two separate markup blocks (not one
// grid reflowed by breakpoint) because the reference layouts genuinely
// differ in which cards appear and how they're grouped, not just column
// count. Everything renders from real data passed in as props — where a
// value genuinely isn't available, the UI says so ("Waiting API" / "\u2013")
// instead of inventing a number.
// ---------------------------------------------------------------------------

export interface WatchlistAsset {
  symbol: string;
  name?: string;
  price: number;
  changePct?: number;
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
      <polyline points={points} fill="none" stroke={up ? "#00E676" : "#FF5252"} strokeWidth={1.5} />
    </svg>
  );
}

export function MacroIntelligence({
  macroEvents,
  calendar,
  newsItems,
  sentiment,
  nextHighImpact,
  watchlist = [],
  topAssetFocus,
}: {
  macroEvents: MacroEventView[];
  calendar: EconomicEvent[];
  newsItems: NewsItem[];
  sentiment: GlobalSentimentReading;
  nextHighImpact?: { title: string; hoursAway: number };
  watchlist?: WatchlistAsset[];
  topAssetFocus: string[];
}) {
  const highImpactCount = macroEvents.filter((e) => e.impact === "high").length;
  const posReasons = sentiment.reasons.filter((r) => r.direction === 1).length;
  const negReasons = sentiment.reasons.filter((r) => r.direction === -1).length;
  const status = statusLabel(sentiment.status);
  const nextEvent = macroEvents.find((e) => e.status === "upcoming") ?? macroEvents[0];

  const riskLevel = highImpactCount >= 5 ? "High" : highImpactCount >= 2 ? "Medium" : "Low";
  const newsBias = posReasons > negReasons ? "Bullish" : negReasons > posReasons ? "Bearish" : "Neutral";
  const expectedVolatility = highImpactCount >= 5 ? "High" : highImpactCount >= 2 ? "Medium" : "Low";

  // Only categories that actually appear among today's real high-impact
  // events get a "Why It Matters" / "Correlated Assets" card — nothing
  // invented for events that aren't really scheduled.
  const presentCategories = Array.from(
    new Set(macroEvents.filter((e) => e.impact === "high").map((e) => e.category)),
  ).filter((c) => MACRO_KNOWLEDGE[c]);

  return (
    <div className="min-h-screen bg-bg">
      <MacroIntelligenceHeader />

      <div className="mx-auto max-w-[1440px] space-y-4 p-4 pb-20 lg:space-y-5 lg:p-6 lg:pb-8">
        {/* ============================= MOBILE ============================= */}
        <div className="space-y-4 lg:hidden">
          <div className="grid grid-cols-2 gap-2.5">
            <SummaryCard icon={Calendar} iconBg="bg-signal/15 text-signal" label="Events Today" value={String(macroEvents.length)} sub={`High Impact: ${highImpactCount}`} />
            <SummaryCard icon={AlertTriangle} iconBg="bg-down/15 text-down" label="High Impact" value={String(highImpactCount)} valueCls="text-down" sub="Next 24h" />
            <SummaryCard icon={MessageSquare} iconBg="bg-signal/15 text-signal" label="Breaking News" value={String(newsItems.length)} sub="Last 24h" />
            <SummaryCard icon={TrendingUp} iconBg="bg-up/15 text-up" label="Sentiment" value={`+${posReasons} / -${negReasons}`} sub="Balanced" />
          </div>

          {nextEvent ? <NextEventBanner event={nextEvent} /> : null}

          <EconomicCalendarPanel events={calendar} />
          <MacroNewsPanel news={newsItems} />

          {watchlist.length > 0 ? (
            <div className="panel p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Market Watchlist</span>
                <span className="text-[11px] font-medium text-signal">Edit</span>
              </div>
              <div className="-mx-3.5 flex gap-2.5 overflow-x-auto px-3.5 pb-1">
                {watchlist.map((a) => (
                  <WatchlistCard key={a.symbol} asset={a} />
                ))}
              </div>
            </div>
          ) : null}

          <MarketInsightGrid riskLevel={riskLevel} newsBias={newsBias} expectedVolatility={expectedVolatility} statusLabel={status.label} negDominant={negReasons >= posReasons} />
        </div>

        {/* ============================= DESKTOP ============================= */}
        <div className="hidden lg:block lg:space-y-5">
          <div className="grid grid-cols-5 gap-3">
            <SummaryCard icon={Calendar} iconBg="bg-signal/15 text-signal" label="Total Events (Today)" value={String(macroEvents.length)} sub={`High Impact: ${highImpactCount}`} />
            <SummaryCard icon={MessageSquare} iconBg="bg-signal/15 text-signal" label="Breaking News" value={String(newsItems.length)} sub="Last 24h" />
            <SummaryCard icon={TrendingUp} iconBg="bg-up/15 text-up" label="Market Sentiment" value={`+${posReasons} / -${negReasons}`} sub={newsBias} />
            <SummaryCard icon={Target} iconBg="bg-gold/15 text-gold" label="Top Asset Focus" value={topAssetFocus.join(", ") || "\u2014"} sub="High Volatility Risk" subCls="text-down" />
            <SummaryCard
              icon={Clock}
              iconBg="bg-signal/15 text-signal"
              label="Next High Impact"
              value={nextHighImpact?.title ?? "None imminent"}
              sub={nextHighImpact ? formatCountdown(nextHighImpact.hoursAway) : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <EconomicCalendarPanel events={calendar} />
            <MacroNewsPanel news={newsItems} />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="panel p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Market Focus / Watchlist</span>
              </div>
              {watchlist.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-faint">Waiting API</p>
              ) : (
                <div className="space-y-2.5">
                  {watchlist.map((a) => {
                    const up = (a.changePct ?? 0) >= 0;
                    return (
                      <div key={a.symbol} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-ink">{a.symbol}</p>
                          {a.name ? <p className="text-[10px] text-ink-faint">{a.name}</p> : null}
                        </div>
                        {a.series && a.series.length > 1 ? <Sparkline series={a.series} up={up} /> : <span />}
                        <div className="text-right">
                          <p className="mono-num text-[12px] font-semibold text-ink">{formatPrice(a.price)}</p>
                          {a.changePct !== undefined ? (
                            <p className={`text-[10px] font-medium ${up ? "text-up" : "text-down"}`}>
                              {up ? "+" : ""}
                              {a.changePct.toFixed(2)}%
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="panel p-3.5">
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Why It Matters</div>
              {presentCategories.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-faint">Waiting API</p>
              ) : (
                <div className="space-y-3">
                  {presentCategories.map((cat) => (
                    <div key={cat} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-signal/15 text-signal">
                        <Zap size={13} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-ink">{cat}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{MACRO_KNOWLEDGE[cat]?.why}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel p-3.5">
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Correlated Assets</div>
              {presentCategories.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-faint">Waiting API</p>
              ) : (
                <div className="space-y-3">
                  {presentCategories.map((cat) => (
                    <div key={cat}>
                      <p className="text-[11px] font-medium text-ink-muted">{cat}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {MACRO_KNOWLEDGE[cat]?.assets.map((a) => (
                          <span key={a.label} className={`text-[11px] font-medium ${a.direction === "up" ? "text-up" : "text-down"}`}>
                            {a.label} {a.direction === "up" ? "\u2191" : "\u2193"}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <MarketInsightGrid riskLevel={riskLevel} newsBias={newsBias} expectedVolatility={expectedVolatility} statusLabel={status.label} negDominant={negReasons >= posReasons} compact />
          </div>
        </div>
      </div>

      <Footer />
      <MacroIntelligenceBottomTabs />
      <AIChatDock />
    </div>
  );
}

function NextEventBanner({ event }: { event: MacroEventView }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-raised/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
          <Clock size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint">Next High Impact</p>
          <p className="truncate text-xs font-semibold text-ink">{event.title}</p>
          <p className="mt-0.5 text-[10px] text-ink-faint">{event.status === "upcoming" ? formatCountdown(event.hoursAway) : "Released"}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${impactBadgeClass(event.impact)}`}>{event.impact}</span>
        <ChevronRight size={14} className="text-ink-faint" />
      </div>
    </div>
  );
}

function WatchlistCard({ asset }: { asset: WatchlistAsset }) {
  const up = (asset.changePct ?? 0) >= 0;
  return (
    <div className="w-[104px] shrink-0 rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
      <p className="text-[10px] font-semibold text-ink">{asset.symbol}</p>
      <p className="mono-num mt-1 text-[13px] font-semibold text-ink">{formatPrice(asset.price)}</p>
      <div className="mt-1 flex items-center justify-between gap-1">
        {asset.changePct !== undefined ? (
          <span className={`text-[10px] font-medium ${up ? "text-up" : "text-down"}`}>
            {up ? "+" : ""}
            {asset.changePct.toFixed(2)}%
          </span>
        ) : (
          <span className="text-[10px] text-ink-faint">&mdash;</span>
        )}
      </div>
      {asset.series && asset.series.length > 1 ? <Sparkline series={asset.series} up={up} /> : null}
    </div>
  );
}

function MarketInsightGrid({
  riskLevel,
  newsBias,
  expectedVolatility,
  statusLabel,
  negDominant,
  compact,
}: {
  riskLevel: string;
  newsBias: string;
  expectedVolatility: string;
  statusLabel: string;
  negDominant: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="panel grid grid-cols-2 gap-3 p-3.5">
        <InsightCard icon={Shield} iconBg="bg-down/15 text-down" label="Next 2 Hours Risk" value={riskLevel} sub="Volatility may increase" />
        <InsightCard icon={TrendingUp} iconBg="bg-down/15 text-down" label="News Sentiment Bias" value={newsBias} sub={negDominant ? "Negative news dominates" : "Positive news dominates"} />
        <InsightCard icon={Scale} iconBg="bg-signal/15 text-signal" label="Macro Bias" value={statusLabel} sub="Mixed economic signals" />
        <InsightCard icon={Zap} iconBg="bg-down/15 text-down" label="Expected Volatility" value={expectedVolatility} sub="Prepare for spikes" />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        <AlertTriangle size={12} />
        Market Insight
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <InsightCard icon={Shield} iconBg="bg-down/15 text-down" label="Risk Level" value={riskLevel} sub="Volatility may increase" />
        <InsightCard icon={TrendingUp} iconBg="bg-down/15 text-down" label="News Bias" value={newsBias} sub={negDominant ? "Negative news dominates" : "Positive news dominates"} />
        <InsightCard icon={Scale} iconBg="bg-signal/15 text-signal" label="Macro Bias" value={statusLabel} sub="Mixed economic signals" />
        <InsightCard icon={Zap} iconBg="bg-down/15 text-down" label="Expected Volatility" value={expectedVolatility} sub="Prepare for spikes" />
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
  subCls,
}: {
  icon: LucideIcon;
  iconBg: string;
  label: string;
  value: string;
  sub?: string;
  valueCls?: string;
  subCls?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${iconBg}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wide text-ink-faint">{label}</p>
        <p className={`mt-0.5 truncate text-[15px] font-bold tracking-tight ${valueCls ?? "text-ink"}`}>{value}</p>
        {sub ? <p className={`mt-0.5 truncate text-[10px] ${subCls ?? "text-ink-faint"}`}>{sub}</p> : null}
      </div>
    </div>
  );
}

function InsightCard({ icon: Icon, iconBg, label, value, sub }: { icon: LucideIcon; iconBg: string; label: string; value: string; sub: string }) {
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
