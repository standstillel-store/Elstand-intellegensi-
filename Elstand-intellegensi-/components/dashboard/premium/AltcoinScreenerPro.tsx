"use client";

import { useState } from "react";
import { DataStateBadge, DataUnavailable } from "@/components/ui/DataStateBadge";
import { formatUsd, formatPct } from "@/lib/format";
import { pumpGrade, rugpullGrade, type DataState } from "@/lib/intelligence/premium";
import type { PumpCandidate, RugpullRisk } from "@/lib/types";

function CoinIcon({ src, symbol }: { src?: string; symbol: string }) {
  if (!src) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-raised text-[9px] font-bold text-ink-faint">
        {symbol.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  // Plain <img>, not next/image — coin logos come from whichever CDN CoinGecko/GeckoTerminal
  // returns per-asset, so a static remotePatterns allowlist can't cover it up front.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-5 w-5 shrink-0 rounded-full bg-bg-raised" loading="lazy" />;
}

function AccumulationRow({ c }: { c: PumpCandidate }) {
  const g = pumpGrade(c.score);
  const badgeClass =
    g.tone === "up" ? "border-up/30 bg-up/10 text-up" : g.tone === "amber" ? "border-amber/30 bg-amber/10 text-amber" : "border-line bg-bg-raised text-ink-faint";
  return (
    <div className="border-b border-line/50 px-3 py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CoinIcon src={c.image} symbol={c.symbol} />
          <span className="truncate text-[13px] font-semibold text-ink">{c.symbol.toUpperCase()}</span>
          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${badgeClass}`}>{g.grade}</span>
          <span className="shrink-0 text-[9px] uppercase tracking-wide text-ink-faint">{g.label}</span>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono-num text-[12px] text-ink">{formatUsd(c.price)}</div>
          <div className={`mono-num text-[10px] ${c.change24h >= 0 ? "text-up" : "text-down"}`}>{formatPct(c.change24h)}</div>
        </div>
      </div>
      <div className="mt-1 text-[10px] text-ink-faint">
        Score {Math.round(c.score)} · Confidence {Math.round(c.confidence)}%
      </div>
      {c.reasons.length > 0 && <div className="mt-0.5 truncate text-[10.5px] text-ink-muted">{c.reasons.slice(0, 2).join(" · ")}</div>}
    </div>
  );
}

function RiskRow({ r }: { r: RugpullRisk }) {
  const g = rugpullGrade(r.score);
  const badgeClass =
    g.tone === "down" ? "border-down/30 bg-down/10 text-down" : g.tone === "amber" ? "border-amber/30 bg-amber/10 text-amber" : "border-line bg-bg-raised text-ink-faint";
  return (
    <div className="border-b border-line/50 px-3 py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CoinIcon symbol={r.symbol} />
          <span className="truncate text-[13px] font-semibold text-ink">{r.symbol.toUpperCase()}</span>
          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${badgeClass}`}>{g.label}</span>
          <span className="shrink-0 text-[9px] uppercase tracking-wide text-ink-faint">{r.network}</span>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono-num text-[12px] text-ink">{formatUsd(r.liquidityUsd)}</div>
          <div className="text-[9px] text-ink-faint">Liquidity</div>
        </div>
      </div>
      <div className="mt-1 text-[10px] text-ink-faint">
        Score {Math.round(r.score)} · Confidence {Math.round(r.confidence)}% · Vol {formatUsd(r.volume24hUsd)}
      </div>
      {r.flags.length > 0 && <div className="mt-0.5 truncate text-[10.5px] text-ink-muted">{r.flags.slice(0, 2).join(" · ")}</div>}
    </div>
  );
}

function AccumulationTable({ candidates, state }: { candidates: PumpCandidate[]; state: DataState }) {
  return (
    <div className="rounded-md border border-up/20">
      <div className="flex items-center justify-between border-b border-up/20 bg-up/[0.06] px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-up">Accumulation (Potential Expansion)</span>
        <DataStateBadge state={state} compact />
      </div>
      {state === "unavailable" || candidates.length === 0 ? (
        <div className="p-4">
          <DataUnavailable label={state === "unavailable" ? "DATA UNAVAILABLE" : "No accumulation setups right now"} />
        </div>
      ) : (
        <div>
          {candidates.slice(0, 5).map((c) => (
            <AccumulationRow key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function RiskTable({ risks, state }: { risks: RugpullRisk[]; state: DataState }) {
  return (
    <div className="rounded-md border border-down/20">
      <div className="flex items-center justify-between border-b border-down/20 bg-down/[0.06] px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-down">Dump / Rugpull Risk</span>
        <DataStateBadge state={state} compact />
      </div>
      {state === "unavailable" || risks.length === 0 ? (
        <div className="p-4">
          <DataUnavailable label={state === "unavailable" ? "DATA UNAVAILABLE" : "No elevated risk flags right now"} />
        </div>
      ) : (
        <div>
          {risks.slice(0, 5).map((r) => (
            <RiskRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AltcoinScreenerPro({
  pumpCandidates,
  pumpState,
  rugpullRisks,
  rugpullState,
}: {
  pumpCandidates: PumpCandidate[];
  pumpState: DataState;
  rugpullRisks: RugpullRisk[];
  rugpullState: DataState;
}) {
  const [mode, setMode] = useState<"accumulation" | "risk">("accumulation");

  return (
    <section className="panel p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="eyebrow text-[11px] text-ink-muted">Altcoin Screener Pro</h2>
        <a href="/scanner" className="text-[11px] text-signal-glow hover:underline">
          Lihat Semua &rarr;
        </a>
      </div>

      {/* Mobile: the brief's "two-mode selector", one table at a time. */}
      <div className="mb-2 flex gap-1.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMode("accumulation")}
          className={`flex-1 rounded border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            mode === "accumulation" ? "border-up/40 bg-up/10 text-up" : "border-line text-ink-faint"
          }`}
        >
          Accumulation
        </button>
        <button
          type="button"
          onClick={() => setMode("risk")}
          className={`flex-1 rounded border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            mode === "risk" ? "border-down/40 bg-down/10 text-down" : "border-line text-ink-faint"
          }`}
        >
          Dump / Rugpull Risk
        </button>
      </div>
      <div className="lg:hidden">
        {mode === "accumulation" ? (
          <AccumulationTable candidates={pumpCandidates} state={pumpState} />
        ) : (
          <RiskTable risks={rugpullRisks} state={rugpullState} />
        )}
      </div>

      {/* Desktop: both modes side by side — a dense terminal reads better with both visible. */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-3">
        <AccumulationTable candidates={pumpCandidates} state={pumpState} />
        <RiskTable risks={rugpullRisks} state={rugpullState} />
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
        Skor multi-faktor (volume, likuiditas, DEX, whale flow) — bukan prediksi harga. Lihat baris &ldquo;Score/Confidence&rdquo; untuk evidence di balik tiap grade.
      </p>
    </section>
  );
}
