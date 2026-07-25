"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles, Newspaper, CalendarClock, ExternalLink } from "lucide-react";
import clsx from "clsx";
import { useTokenAnalyzer } from "./TokenAnalyzerContext";
import { formatUsd, formatPct, timeAgo, timeUntil } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import type { CoinReport } from "@/lib/analysis";

function ScoreMeter({ label, score, tone }: { label: string; score?: number; tone: "up" | "down" | "rugpull" | "smartmoney" }) {
  const barTone = {
    up: "bg-up",
    down: "bg-down",
    rugpull: "bg-rugpull",
    smartmoney: "bg-smartmoney",
  }[tone];
  const textTone = {
    up: "text-up",
    down: "text-down",
    rugpull: "text-rugpull-glow",
    smartmoney: "text-smartmoney-glow",
  }[tone];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-muted">{label}</span>
        <span className={clsx("mono-num font-semibold", textTone)}>{score ?? "—"}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score ?? 0}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={clsx("h-full rounded-full", barTone)}
        />
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <p className="eyebrow text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mono-num mt-0.5 text-sm text-ink">{value}</p>
    </div>
  );
}

export function TokenAnalyzerDrawer() {
  const { openSymbol, close } = useTokenAnalyzer();
  const [report, setReport] = useState<CoinReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!openSymbol) return;
    let cancelled = false;
    setLoading(true);
    setReport(null);
    fetch(`/api/token-analysis?q=${encodeURIComponent(openSymbol)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openSymbol]);

  return (
    <AnimatePresence>
      {openSymbol && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-line bg-bg-raised shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg-raised/95 px-4 py-3 backdrop-blur">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles size={14} className="text-signal-glow" /> Token Analyzer
              </span>
              <button onClick={close} aria-label="Close" className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-4">
              {loading && <SkeletonCard lines={6} />}

              {!loading && report && !report.found && (
                <p className="py-10 text-center text-sm text-ink-muted">
                  Tidak menemukan data untuk &ldquo;{openSymbol}&rdquo;.
                </p>
              )}

              {!loading && report?.found && (
                <>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-xl font-bold">{report.symbol}</h2>
                      <span className="text-xs text-ink-faint">#{report.marketCapRank}</span>
                    </div>
                    <p className="text-xs text-ink-muted">{report.name}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="mono-num text-2xl font-bold">{formatUsd(report.price ?? 0)}</span>
                      <Badge tone={(report.change24h ?? 0) >= 0 ? "up" : "down"}>{formatPct(report.change24h ?? 0)}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <StatCell label="Market Cap" value={formatUsd(report.marketCap ?? 0)} />
                    <StatCell label="Volume 24h" value={formatUsd(report.volume24h ?? 0)} />
                    <StatCell label="Liquidity" value={report.onchain ? formatUsd(report.onchain.liquidityUsd) : "—"} />
                    <StatCell label="FDV" value={report.onchain?.fdvUsd ? formatUsd(report.onchain.fdvUsd) : "—"} />
                    <StatCell label="Holders" value={report.holders !== null ? String(report.holders) : "Provider belum terhubung"} />
                    <StatCell
                      label="Next Unlock"
                      value={report.nextUnlock ? `${formatUsd(report.nextUnlock.amountUsd ?? 0)} · ${timeUntil(report.nextUnlock.date)}` : "Provider belum terhubung"}
                    />
                  </div>

                  <div className="panel space-y-3 p-3.5">
                    <p className="eyebrow text-[10px] uppercase tracking-wider text-ink-faint">Scanner Scores</p>
                    <ScoreMeter label="Pump Score" score={report.aiAnalysis.pumpScore} tone="up" />
                    <ScoreMeter label="Dump Score" score={report.dumpScore} tone="down" />
                    <ScoreMeter label="Rugpull Score" score={report.risk.score} tone="rugpull" />
                    <ScoreMeter label="Smart Money Score" score={report.smartMoneyScore} tone="smartmoney" />
                  </div>

                  <div className="panel p-3.5">
                    <p className="eyebrow mb-2 text-[10px] uppercase tracking-wider text-ink-faint">AI Summary</p>
                    <p className="text-[13px] leading-relaxed text-ink-muted">{report.aiAnalysis.summary}</p>
                    {report.aiAnalysis.reasons.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {report.aiAnalysis.reasons.slice(0, 4).map((r, i) => (
                          <li key={i} className="text-[12px] text-ink-faint">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 border-t border-line pt-2 text-[12px] italic text-ink-muted">{report.conclusion}</p>
                  </div>

                  <div className="panel p-3.5">
                    <p className="eyebrow mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
                      <Newspaper size={11} /> News
                    </p>
                    {!report.news.length ? (
                      <p className="text-xs text-ink-muted">Tidak ada berita spesifik untuk token ini saat ini.</p>
                    ) : (
                      <ul className="space-y-2">
                        {report.news.map((n, i) => (
                          <li key={i} className="text-xs">
                            <p className="text-ink">{n.title}</p>
                            <p className="mt-0.5 text-[10px] text-ink-faint">
                              {n.source} · {timeAgo(n.publishedAt)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="panel p-3.5">
                    <p className="eyebrow mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
                      <CalendarClock size={11} /> Economic Calendar Terkait
                    </p>
                    {!report.upcomingEvents.length ? (
                      <p className="text-xs text-ink-muted">Tidak ada event makro terjadwal.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {report.upcomingEvents.map((e, i) => (
                          <li key={i} className="flex items-center justify-between text-xs">
                            <span className="truncate text-ink-muted">{e.title}</span>
                            <span className="mono-num shrink-0 text-ink-faint">{timeUntil(e.date)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <a
                    href={`https://www.coingecko.com/en/coins/${report.symbol?.toLowerCase()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-md border border-line py-2 text-xs text-ink-muted hover:border-signal/40 hover:text-ink"
                  >
                    Lihat di CoinGecko <ExternalLink size={12} />
                  </a>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
