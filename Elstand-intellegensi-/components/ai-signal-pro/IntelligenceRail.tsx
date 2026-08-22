"use client";
import { useEffect, useMemo, useState } from "react";
import { Waves, Building2, Newspaper } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { SimulatedTag } from "@/components/ui/SimulatedTag";
import { Badge } from "@/components/ui/Badge";
import { formatUsd, timeAgo } from "@/lib/format";
import type { FundingInfo, WhaleTransfer, NewsItem, FearGreedPoint, CoinMarket } from "@/lib/types";
import type { TradeGrade } from "@/lib/elvoid/types";

interface AnalyzeSignalLike {
  side: "LONG" | "SHORT";
  confidence: number;
  tradeGrade: TradeGrade;
  probabilityTp: number;
  probabilitySl: number;
  entry: number;
}

interface OiFlow {
  deltaValueUsd: number;
  deltaPct: number;
  windowHours: number;
}

export function IntelligenceRail({ symbol, signal }: { symbol: string; signal: AnalyzeSignalLike | null }) {
  const [funding, setFunding] = useState<FundingInfo[]>([]);
  const [fng, setFng] = useState<{ now: FearGreedPoint } | null>(null);
  const [whales, setWhales] = useState<WhaleTransfer[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [markets, setMarkets] = useState<CoinMarket[]>([]);
  const [oiFlow, setOiFlow] = useState<OiFlow | null>(null);
  const [oiFlowError, setOiFlowError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/funding").then((r) => r.json()).then((d) => !cancelled && setFunding(d.funding ?? [])).catch(() => {});
    fetch("/api/feargreed").then((r) => r.json()).then((d) => !cancelled && d?.now && setFng(d)).catch(() => {});
    fetch("/api/whales").then((r) => r.json()).then((d) => !cancelled && setWhales(d.transfers ?? [])).catch(() => {});
    fetch("/api/news").then((r) => r.json()).then((d) => !cancelled && setNews(Array.isArray(d) ? d : d.news ?? [])).catch(() => {});
    // Market Breadth — real: count actual 24h advancers/decliners across the top-150 coins by market cap (CoinGecko), not a simulated split.
    fetch("/api/market").then((r) => r.json()).then((d) => !cancelled && setMarkets(Array.isArray(d?.markets) ? d.markets : [])).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOiFlow(null);
    setOiFlowError(false);
    fetch(`/api/oi-flow?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setOiFlowError(true);
        else setOiFlow(d);
      })
      .catch(() => !cancelled && setOiFlowError(true));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const symbolFunding = funding.find((f) => f.symbol.toUpperCase() === `${symbol.toUpperCase()}USDT`);
  const relevantWhales = whales.filter((w) => w.asset.toUpperCase().includes(symbol.toUpperCase())).slice(0, 3);
  const relevantNews = news.filter((n) => n.title.toUpperCase().includes(symbol.toUpperCase())).slice(0, 3);
  const newsToShow = relevantNews.length ? relevantNews : news.slice(0, 3);

  const breadth = useMemo(() => {
    if (!markets.length) return null;
    const withChange = markets.filter((m) => typeof m.price_change_percentage_24h_in_currency === "number");
    if (!withChange.length) return null;
    const advancers = withChange.filter((m) => (m.price_change_percentage_24h_in_currency ?? 0) >= 0).length;
    const advancersPct = Math.round((advancers / withChange.length) * 100);
    return { advancersPct, declinersPct: 100 - advancersPct, sampleSize: withChange.length };
  }, [markets]);


  return (
    <div className="space-y-4">
      <div className="terminal-divider text-[10px] uppercase tracking-wider">Market Intelligence — {symbol}</div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* AI Score & Confidence — real, from the analyzed signal */}
        <div className="glow-card p-4">
          <SectionHeader code="AI" title="AI Score" />
          <div className="flex items-center justify-center gap-4 py-1">
            <RadialGauge
              value={signal?.confidence ?? 0}
              label="Confidence"
              tone={signal ? (signal.side === "LONG" ? "up" : "down") : "signal"}
            />
            {signal && (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">Grade</span>
                  <Badge tone={signal.tradeGrade === "C" ? "amber" : "up"}>{signal.tradeGrade}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">Prob. TP</span>
                  <span className="mono-num text-up">{signal.probabilityTp}%</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">Prob. SL</span>
                  <span className="mono-num text-down">{signal.probabilitySl}%</span>
                </div>
              </div>
            )}
          </div>
          {!signal && <p className="py-3 text-center text-[11px] text-ink-faint">Analisa coin untuk melihat AI Score.</p>}
        </div>

        {/* Fear & Greed — real, alternative.me */}
        <div className="glow-card p-4">
          <SectionHeader code="FNG" title="Fear & Greed" />
          <div className="flex items-center justify-center gap-4 py-1">
            <RadialGauge
              value={fng?.now.value ?? 50}
              label={fng?.now.classification ?? "…"}
              tone={fng ? (fng.now.value >= 55 ? "up" : fng.now.value <= 45 ? "down" : "amber") : "signal"}
            />
          </div>
        </div>

        {/* Market Breadth — real: top-150 coins by market cap, real 24h change from CoinGecko */}
        <div className="glow-card p-4">
          <SectionHeader code="BREADTH" title="Market Breadth" />
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] text-ink-faint">Advancers vs Decliners</span>
            {breadth && <span className="text-[9px] text-ink-faint">Top {breadth.sampleSize} coin</span>}
          </div>
          {breadth ? (
            <>
              <div className="flex h-2 overflow-hidden rounded-full bg-bg-raised">
                <div className="h-full bg-up" style={{ width: `${breadth.advancersPct}%` }} />
                <div className="h-full bg-down" style={{ width: `${breadth.declinersPct}%` }} />
              </div>
              <div className="mono-num mt-1.5 flex justify-between text-[11px]">
                <span className="text-up">{breadth.advancersPct}% up</span>
                <span className="text-down">{breadth.declinersPct}% down</span>
              </div>
            </>
          ) : (
            <p className="py-3 text-center text-[11px] text-ink-faint">Memuat data pasar…</p>
          )}
        </div>

        {/* Funding & Open Interest — real, keyless Binance Futures public feed */}
        <div className="glow-card p-4">
          <SectionHeader code="FUND" title="Funding & OI" />
          {symbolFunding ? (
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-ink-faint">Funding Rate</span>
                <span className={`mono-num ${symbolFunding.lastFundingRate >= 0 ? "text-up" : "text-down"}`}>
                  {(symbolFunding.lastFundingRate * 100).toFixed(4)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">Mark Price</span>
                <span className="mono-num text-ink">{formatUsd(symbolFunding.markPrice)}</span>
              </div>
              {symbolFunding.openInterestValue !== undefined && (
                <div className="flex justify-between">
                  <span className="text-ink-faint">Open Interest</span>
                  <span className="mono-num text-ink">{formatUsd(symbolFunding.openInterestValue)}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="py-3 text-center text-[11px] text-ink-faint">{symbol}USDT tidak tersedia di Binance Futures.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Whale Activity — real if ALCHEMY_API_KEY is configured; otherwise an honest empty state, never a fabricated row */}
        <div className="glow-card p-4">
          <div className="mb-1 flex items-center justify-between">
            <SectionHeader code="WHALE" title="Whale Activity" />
            {!whales.length && <SimulatedTag />}
          </div>
          {relevantWhales.length ? (
            <ul className="space-y-2">
              {relevantWhales.map((w) => (
                <li key={w.hash} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-ink-muted">
                    <Waves size={11} className={w.direction === "in" ? "text-up" : "text-down"} /> {w.asset}
                  </span>
                  <span className="mono-num text-ink">{formatUsd(w.valueUsd)}</span>
                  <span className="text-ink-faint">{timeAgo(w.timestamp)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-center text-[11px] text-ink-faint">
              {whales.length ? `Belum ada transfer besar untuk ${symbol}.` : "ALCHEMY_API_KEY belum diset — belum ada feed whale live."}
            </p>
          )}
        </div>

        {/* Institution / Positioning Flow — real Binance Futures Open Interest 24h change (proxy). No free legitimate institutional/ETF flow API exists, so this is honestly labeled as an OI-based positioning proxy rather than pretending to be ETF flow. */}
        <div className="glow-card p-4">
          <div className="mb-1 flex items-center justify-between">
            <SectionHeader code="OI-FLOW" title="Positioning Flow" hint="OI Δ24h" />
          </div>
          {oiFlow ? (
            <div className="flex items-center gap-3 py-1">
              <Building2 size={22} className={oiFlow.deltaValueUsd >= 0 ? "text-up" : "text-down"} />
              <div>
                <p className={`mono-num text-lg font-bold ${oiFlow.deltaValueUsd >= 0 ? "text-up" : "text-down"}`}>
                  {oiFlow.deltaValueUsd >= 0 ? "+" : ""}
                  {formatUsd(oiFlow.deltaValueUsd)}
                </p>
                <p className="text-[10px] text-ink-faint">
                  Open Interest {symbol}USDT, {oiFlow.windowHours}h terakhir ({oiFlow.deltaPct >= 0 ? "+" : ""}
                  {oiFlow.deltaPct.toFixed(2)}%)
                </p>
              </div>
            </div>
          ) : (
            <p className="py-3 text-center text-[11px] text-ink-faint">
              {oiFlowError ? `${symbol}USDT tidak tersedia di Binance Futures.` : "Memuat data Open Interest…"}
            </p>
          )}
        </div>

        {/* News Impact — real feed, client-side impact heuristic */}
        <div className="glow-card p-4">
          <SectionHeader code="NEWS" title="News Impact" />
          {newsToShow.length ? (
            <ul className="space-y-2">
              {newsToShow.map((n) => (
                <li key={n.id}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-1.5 text-[11px]">
                    <Newspaper size={11} className="mt-0.5 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-ink group-hover:text-signal-glow">{n.title}</span>
                      <span
                        className={`mt-0.5 block text-[10px] ${
                          n.sentiment === "positive" ? "text-up" : n.sentiment === "negative" ? "text-down" : "text-ink-faint"
                        }`}
                      >
                        {n.sentiment ?? "neutral"} · {timeAgo(n.publishedAt)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-center text-[11px] text-ink-faint">Belum ada berita — NEWSAPI_KEY belum diset.</p>
          )}
          <Link href="/news" className="mt-2 block border-t border-line pt-2 text-center text-[11px] text-ink-muted hover:text-ink">
            Lihat semua berita →
          </Link>
        </div>
      </div>
    </div>
  );
}
