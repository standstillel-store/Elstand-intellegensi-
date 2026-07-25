"use client";
import { useState, type ReactNode } from "react";
import { Search, Loader2 } from "lucide-react";
import { AccordionSection } from "./AccordionSection";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ConfidenceMeter } from "@/components/ConfidenceMeter";
import { formatUsd, formatPct, timeAgo } from "@/lib/format";
import type { CoinReport } from "@/lib/analysis";

const SUGGESTIONS = ["BTC", "ETH", "SOL", "PEPE"];

function MiniCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-bg-raised p-3">
      <p className="eyebrow mb-1.5 text-[10px] text-ink-faint">{label}</p>
      {children}
    </div>
  );
}

export function TokenAnalyzerSection() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CoinReport | null>(null);

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/token-analysis?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as CoinReport;
      setReport(data);
    } catch {
      setError("Gagal mengambil data — coba lagi sebentar.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccordionSection code="TKN" title="Token Analyzer">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
          placeholder="Cari token... (mis. BTC, SOL, PEPE)"
          className="flex-1 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-signal"
        />
        <button
          onClick={() => runSearch(query)}
          disabled={loading}
          aria-label="Cari"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-signal text-white hover:bg-signal-glow disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuery(s);
              runSearch(s);
            }}
            className="rounded border border-line px-2 py-1 text-[11px] text-ink-muted hover:border-signal hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-down">{error}</p>}

      {report && !report.found && (
        <p className="mt-3 text-sm text-ink-muted">
          Tidak menemukan &quot;{report.query}&quot; di 150 coin teratas yang ElVoid AI pantau. Coba simbol lain.
        </p>
      )}

      {report && report.found && (
        <div className="mt-3 space-y-3">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
            <div>
              <span className="text-base font-semibold">{report.symbol}</span>
              <span className="ml-2 text-xs text-ink-muted">{report.name}</span>
            </div>
            <div className="mono-num text-right text-sm">
              <div>{formatUsd(report.price ?? 0)}</div>
              <div className={(report.change24h ?? 0) >= 0 ? "text-up" : "text-down"}>
                {formatPct(report.change24h ?? 0)}
              </div>
            </div>
          </div>

          <MiniCard label="AI Analysis">
            <p className="text-sm text-ink">{report.aiAnalysis.summary}</p>
            {report.aiAnalysis.pumpScore !== undefined && (
              <div className="mt-2 flex items-center gap-2">
                <ScoreBadge score={report.aiAnalysis.pumpScore} variant="pump" />
                <span className="text-xs text-ink-muted">Momentum Score</span>
                {report.aiAnalysis.confidence !== undefined && (
                  <ConfidenceMeter value={report.aiAnalysis.confidence} />
                )}
              </div>
            )}
            {!!report.aiAnalysis.reasons.length && (
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {report.aiAnalysis.reasons.slice(0, 3).map((r, i) => (
                  <li key={i}>· {r}</li>
                ))}
              </ul>
            )}
          </MiniCard>

          <MiniCard label="Whale">
            <p className="text-sm text-ink">{report.whale.text}</p>
          </MiniCard>

          <MiniCard label="Risk Assessment">
            <div className="flex items-center gap-2">
              {report.risk.score !== undefined && <ScoreBadge score={report.risk.score} variant="risk" />}
              <p className="flex-1 text-sm text-ink">{report.risk.text}</p>
              {report.risk.confidence !== undefined && <ConfidenceMeter value={report.risk.confidence} />}
            </div>
            {!!report.risk.flags.length && (
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {report.risk.flags.slice(0, 2).map((f, i) => (
                  <li key={i}>· {f}</li>
                ))}
              </ul>
            )}
          </MiniCard>

          <MiniCard label="News">
            {report.news.length ? (
              <ul className="space-y-1.5">
                {report.news.map((n, i) => (
                  <li key={i} className="text-xs">
                    <p className="text-ink">{n.title}</p>
                    <p className="text-ink-faint">
                      {n.source} · {timeAgo(n.publishedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Tidak ada berita spesifik untuk token ini.</p>
            )}
          </MiniCard>

          <MiniCard label="On-chain">
            {report.onchain ? (
              <div className="mono-num space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-xs text-ink-muted">Network</span>
                  <span className="uppercase">{report.onchain.network}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-ink-muted">Liquidity</span>
                  <span>{formatUsd(report.onchain.liquidityUsd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-ink-muted">Volume 24h</span>
                  <span>{formatUsd(report.onchain.volume24hUsd)}</span>
                </div>
                {report.onchain.poolCreatedAt && (
                  <div className="flex justify-between">
                    <span className="text-xs text-ink-muted">Pool Age</span>
                    <span>{timeAgo(report.onchain.poolCreatedAt)}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Tidak ada data pool DEX — wajar untuk aset besar yang mayoritas diperdagangkan di CEX.
              </p>
            )}
          </MiniCard>

          <div className="rounded-md border border-signal/30 bg-signal/10 p-3">
            <p className="eyebrow mb-1.5 text-[10px] text-signal-glow">Kesimpulan</p>
            <p className="text-sm text-ink">{report.conclusion}</p>
          </div>
        </div>
      )}
    </AccordionSection>
  );
}
