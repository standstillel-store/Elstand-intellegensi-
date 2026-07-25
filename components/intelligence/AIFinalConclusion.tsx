import clsx from "clsx";
import { TerminalSquare } from "lucide-react";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatPct } from "@/lib/format";
import { deriveFinalConclusion, type WatchlistEntry } from "@/lib/intelligence/finalConclusion";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";

const TONE_TEXT: Record<string, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-amber",
  neutral: "text-ink-muted",
};

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="eyebrow text-[10px] tracking-wide text-ink-faint">{label}</span>
      <span className={clsx("mono-num text-sm font-bold", TONE_TEXT[tone])}>{value}</span>
    </div>
  );
}

export function AIFinalConclusion({
  sentiment,
  btcChange24h,
  ethChange24h,
  altChange24h,
  watchlist,
}: {
  sentiment: GlobalSentimentReading;
  btcChange24h?: number;
  ethChange24h?: number;
  altChange24h?: number;
  watchlist: WatchlistEntry[];
}) {
  const c = deriveFinalConclusion({ sentiment, btcChange24h, ethChange24h, altChange24h, watchlist });
  const assetRows = [
    { label: "BTC", momentum: c.btc },
    { label: "ETH", momentum: c.eth },
    { label: "ALT", momentum: c.alt },
  ];

  return (
    <div className="glow-card overflow-hidden">
      <div className="border-b border-line/70 bg-bg-raised px-4 py-2.5">
        <div className="flex items-center gap-2">
          <TerminalSquare size={13} className="text-signal-glow" />
          <span className="mono-num text-[11px] font-bold tracking-widest text-ink">ELVOID AI — FINAL CONCLUSION</span>
          <LiveDot tone="signal" />
        </div>
      </div>

      <div className="divide-y divide-line/70">
        <Row label="MARKET MODE" value={c.modeLabel} tone={c.modeTone} />
        <Row label="CONFIDENCE" value={`${c.confidence}%`} tone="neutral" />

        <div className="grid grid-cols-3 divide-x divide-line/70">
          {assetRows.map((row) => (
            <div key={row.label} className="px-3 py-2.5 text-center">
              <p className="eyebrow text-[9px] text-ink-faint">{row.label}</p>
              <p className={clsx("mono-num mt-0.5 text-[13px] font-bold", TONE_TEXT[row.momentum.tone])}>{row.momentum.label}</p>
              {row.momentum.change24h !== undefined && (
                <p className="mono-num text-[9px] text-ink-faint">{formatPct(row.momentum.change24h)}</p>
              )}
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5">
          <p className="eyebrow text-[10px] tracking-wide text-ink-faint">WATCHLIST</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.watchlist.length ? (
              c.watchlist.map((w) => (
                <span key={w.symbol} className="mono-num flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px]">
                  <span className="text-ink">{w.symbol}</span>
                  <span className={w.change24h >= 0 ? "text-up" : "text-down"}>{formatPct(w.change24h)}</span>
                </span>
              ))
            ) : (
              <span className="text-[11px] text-ink-faint">Belum ada kandidat yang cukup signifikan.</span>
            )}
          </div>
        </div>

        <Row label="FINAL ACTION" value={c.actionLabel} tone={c.actionTone} />
      </div>

      <div className="border-t border-line/70 bg-bg-raised px-4 py-2">
        <p className="text-[10px] leading-relaxed text-ink-faint">
          {c.actionNote} Dibuat otomatis setelah semua modul di atas selesai dimuat — bukan sinyal beli/jual.
        </p>
      </div>
    </div>
  );
}
