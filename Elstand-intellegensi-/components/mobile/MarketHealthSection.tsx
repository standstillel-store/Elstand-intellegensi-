import type { ReactNode } from "react";
import { AccordionSection } from "./AccordionSection";
import { formatUsd, formatPct, timeUntil } from "@/lib/format";
import type { AltseasonReading, MacroReading } from "@/lib/market-insights";
import type { FearGreedPoint } from "@/lib/types";
import clsx from "clsx";

function fngTone(classification: string) {
  const c = classification.toLowerCase();
  if (c.includes("extreme fear")) return "text-down";
  if (c.includes("fear")) return "text-amber";
  if (c.includes("extreme greed")) return "text-up";
  if (c.includes("greed")) return "text-signal-glow";
  return "text-ink-muted";
}

function macroTone(level: MacroReading["level"]) {
  if (level === "alert") return "text-down";
  if (level === "watch") return "text-amber";
  return "text-up";
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <div className="mono-num text-right text-sm">{children}</div>
    </div>
  );
}

export function MarketHealthSection({
  fng,
  btcDominance,
  altseason,
  totalMcUsd,
  mcChange24h,
  macro,
}: {
  fng?: { now: FearGreedPoint; yesterday?: FearGreedPoint };
  btcDominance?: number;
  altseason?: AltseasonReading;
  totalMcUsd?: number;
  mcChange24h?: number;
  macro: MacroReading;
}) {
  const glance = fng ? (
    <span className={clsx("mono-num text-xs font-medium", fngTone(fng.now.classification))}>
      F&amp;G {fng.now.value}
    </span>
  ) : undefined;

  return (
    <AccordionSection code="HLT" title="Market Health" glance={glance} defaultOpen>
      <div className="divide-y divide-line">
        <Row label="Fear & Greed">
          {fng ? (
            <span className={fngTone(fng.now.classification)}>
              {fng.now.value}/100 <span className="text-ink-faint">· {fng.now.classification}</span>
            </span>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </Row>
        <Row label="BTC Dominance">
          {btcDominance !== undefined ? `${btcDominance.toFixed(1)}%` : <span className="text-ink-faint">—</span>}
        </Row>
        <Row label="Altseason">
          {altseason ? (
            <span
              className={clsx(
                altseason.label === "Alt Season" && "text-up",
                altseason.label === "BTC Season" && "text-amber",
                altseason.label === "Netral" && "text-ink-muted"
              )}
            >
              {altseason.index}/100 <span className="text-ink-faint">· {altseason.label}</span>
            </span>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </Row>
        <Row label="Total MC">
          {totalMcUsd !== undefined ? (
            <span>
              {formatUsd(totalMcUsd)}{" "}
              {mcChange24h !== undefined && (
                <span className={mcChange24h >= 0 ? "text-up" : "text-down"}>{formatPct(mcChange24h)}</span>
              )}
            </span>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </Row>
        <Row label="Macro Status">
          <span className={macroTone(macro.level)}>{macro.label}</span>
        </Row>
      </div>
      {macro.nextEvent && (
        <p className="mt-2.5 text-xs text-ink-faint">
          Berikutnya: {macro.nextEvent.title} ({macro.nextEvent.country}) — {timeUntil(macro.nextEvent.date)}
        </p>
      )}
      <p className="mt-2.5 text-[11px] text-ink-faint">
        Altseason dihitung dari % top 50 altcoin yang mengungguli BTC dalam 7 hari terakhir — bukan indikator resmi.
      </p>
    </AccordionSection>
  );
}
