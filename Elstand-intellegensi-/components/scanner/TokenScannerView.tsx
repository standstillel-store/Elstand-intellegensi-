"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { GlowCard } from "@/components/ui/GlowCard";
import { Badge } from "@/components/ui/Badge";
import { useTokenAnalyzer } from "@/components/token-analyzer/TokenAnalyzerContext";
import { formatUsd, formatPct } from "@/lib/format";
import type { PumpCandidate, RugpullRisk } from "@/lib/types";
import type { MomentumCandidate, SmartMoneyEntry, WhaleFlowGroup } from "@/lib/scanner-categories";

interface ScannerData {
  pump: PumpCandidate[];
  dump: MomentumCandidate[];
  rugpull: RugpullRisk[];
  smartMoney: SmartMoneyEntry[];
  momentum: MomentumCandidate[];
  whaleBuying: WhaleFlowGroup[];
  whaleSelling: WhaleFlowGroup[];
}

const TABS = [
  { key: "pump", label: "Top Pump Candidate", tone: "up" as const },
  { key: "dump", label: "Top Dump Candidate", tone: "down" as const },
  { key: "rugpull", label: "Top Rugpull Risk", tone: "rugpull" as const },
  { key: "smartMoney", label: "Smart Money Accumulation", tone: "smartmoney" as const },
  { key: "momentum", label: "High Momentum", tone: "signal" as const },
  { key: "whaleBuying", label: "Whale Buying", tone: "up" as const },
  { key: "whaleSelling", label: "Whale Selling", tone: "down" as const },
] satisfies { key: keyof ScannerData; label: string; tone: "up" | "down" | "rugpull" | "smartmoney" | "signal" }[];

function ScoreCard({ symbol, price, change24h, score, scoreLabel, tone, reasons, onOpen, delay }: {
  symbol: string;
  price?: number;
  change24h?: number;
  score: number;
  scoreLabel: string;
  tone: "up" | "down" | "rugpull" | "smartmoney";
  reasons: string[];
  onOpen: () => void;
  delay: number;
}) {
  return (
    <GlowCard tone={tone} delay={delay} onClick={onOpen} as="button" className="p-3.5 text-left">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{symbol}</span>
        <Badge tone={tone}>
          {scoreLabel} {score}
        </Badge>
      </div>
      <div className="mono-num mt-1.5 flex items-center gap-2 text-xs text-ink-muted">
        {price !== undefined && <span>{formatUsd(price)}</span>}
        {change24h !== undefined && <span className={change24h >= 0 ? "text-up" : "text-down"}>{formatPct(change24h)}</span>}
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="truncate text-[11px] text-ink-faint">
              • {r}
            </li>
          ))}
        </ul>
      )}
    </GlowCard>
  );
}

function FlowCard({ asset, totalUsd, count, tone, onOpen, delay }: {
  asset: string;
  totalUsd: number;
  count: number;
  tone: "up" | "down";
  onOpen: () => void;
  delay: number;
}) {
  return (
    <GlowCard tone={tone} delay={delay} onClick={onOpen} as="button" className="p-3.5 text-left">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{asset}</span>
        <Badge tone={tone}>{count} transfer</Badge>
      </div>
      <p className={clsx("mono-num mt-1.5 text-lg font-semibold", tone === "up" ? "text-up" : "text-down")}>{formatUsd(totalUsd)}</p>
    </GlowCard>
  );
}

export function TokenScannerView({ data }: { data: ScannerData }) {
  const [tab, setTab] = useState<keyof ScannerData>("pump");
  const { open } = useTokenAnalyzer();
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              tab === t.key ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-muted hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {tab === "pump" &&
          (data.pump.length ? (
            data.pump.map((c, i) => (
              <ScoreCard key={c.id} symbol={c.symbol} price={c.price} change24h={c.change24h} score={c.score} scoreLabel="Pump" tone="up" reasons={c.reasons} onOpen={() => open(c.symbol)} delay={i * 0.02} />
            ))
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-ink-muted">Tidak ada kandidat pump signifikan saat ini.</p>
          ))}

        {tab === "dump" &&
          (data.dump.length ? (
            data.dump.map((c, i) => (
              <ScoreCard key={c.id} symbol={c.symbol} price={c.price} change24h={c.change24h} score={c.score} scoreLabel="Dump" tone="down" reasons={c.reasons} onOpen={() => open(c.symbol)} delay={i * 0.02} />
            ))
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-ink-muted">Tidak ada kandidat dump signifikan saat ini.</p>
          ))}

        {tab === "rugpull" &&
          (data.rugpull.length ? (
            data.rugpull.map((c, i) => (
              <GlowCard key={c.id} tone="rugpull" delay={i * 0.02} onClick={() => open(c.symbol)} as="button" className="p-3.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{c.symbol}</span>
                  <Badge tone="rugpull">Risk {c.score}</Badge>
                </div>
                <div className="mono-num mt-1.5 flex items-center gap-3 text-xs text-ink-muted">
                  <span>Liq {formatUsd(c.liquidityUsd)}</span>
                  <span>Vol {formatUsd(c.volume24hUsd)}</span>
                </div>
                {c.flags.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {c.flags.slice(0, 3).map((f, fi) => (
                      <li key={fi} className="truncate text-[11px] text-ink-faint">
                        • {f}
                      </li>
                    ))}
                  </ul>
                )}
              </GlowCard>
            ))
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-ink-muted">Tidak ada token dengan risiko rugpull tinggi saat ini.</p>
          ))}

        {tab === "smartMoney" &&
          (data.smartMoney.length ? (
            data.smartMoney.map((c, i) => (
              <GlowCard key={c.symbol} tone="smartmoney" delay={i * 0.02} onClick={() => open(c.symbol)} as="button" className="p-3.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{c.symbol}</span>
                  <Badge tone="smartmoney">{c.txCount} tx</Badge>
                </div>
                <p className="mono-num mt-1.5 text-lg font-semibold text-smartmoney-glow">+{formatUsd(c.netInflowUsd)}</p>
                <p className="mt-1 text-[11px] text-ink-faint">Net whale inflow, harga belum banyak bergerak (24h {formatPct(c.change24h ?? 0)}).</p>
              </GlowCard>
            ))
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-ink-muted">Tidak ada akumulasi smart money yang signifikan saat ini.</p>
          ))}

        {tab === "momentum" &&
          (data.momentum.length ? (
            data.momentum.map((c, i) => (
              <ScoreCard key={c.id} symbol={c.symbol} price={c.price} change24h={c.change24h} score={Math.round(c.score)} scoreLabel="Momentum" tone="up" reasons={c.reasons} onOpen={() => open(c.symbol)} delay={i * 0.02} />
            ))
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-ink-muted">Tidak ada momentum signifikan saat ini.</p>
          ))}

        {tab === "whaleBuying" &&
          (data.whaleBuying.length ? (
            data.whaleBuying.map((c, i) => <FlowCard key={c.asset} asset={c.asset} totalUsd={c.totalUsd} count={c.count} tone="up" onOpen={() => open(c.asset)} delay={i * 0.02} />)
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-ink-muted">Tidak ada whale buying signifikan saat ini.</p>
          ))}

        {tab === "whaleSelling" &&
          (data.whaleSelling.length ? (
            data.whaleSelling.map((c, i) => <FlowCard key={c.asset} asset={c.asset} totalUsd={c.totalUsd} count={c.count} tone="down" onOpen={() => open(c.asset)} delay={i * 0.02} />)
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-ink-muted">Tidak ada whale selling signifikan saat ini.</p>
          ))}
      </motion.div>

      <p className="text-center text-[11px] text-ink-faint">
        Menampilkan kategori: <span className="text-ink-muted">{active.label}</span> — semua skor dihitung rule-based dari data live, bukan prediksi.
      </p>
    </div>
  );
}
