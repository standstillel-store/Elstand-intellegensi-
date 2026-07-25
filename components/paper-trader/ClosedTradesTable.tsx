"use client";
import { useRef, useState } from "react";
import { ImageIcon, Upload, Loader2 } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { timeAgo } from "@/lib/format";
import type { JournalWithSignal } from "@/lib/elvoid/types";

const RESULT_STYLE: Record<string, string> = {
  win: "bg-up/15 text-up border-up/30",
  loss: "bg-down/15 text-down border-down/30",
  breakeven: "bg-ink-faint/10 text-ink-muted border-line",
};

function ScreenshotSlot({ entry, onUploaded }: { entry: JournalWithSignal; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await fetch("/api/paper-trader/journal/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalId: entry.id, filename: file.name, dataUrl }),
      });
      onUploaded();
    } finally {
      setUploading(false);
    }
  }

  if (entry.screenshot_url) {
    return (
      <a
        href={entry.screenshot_url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-ink-faint hover:text-signal-glow"
        title="Lihat screenshot trade"
      >
        <ImageIcon size={13} />
      </a>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Tambah screenshot trade"
        className="shrink-0 text-ink-faint/50 hover:text-signal-glow disabled:opacity-50"
      >
        {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
      </button>
    </>
  );
}

export function ClosedTradesTable({ entries, onRefresh }: { entries: JournalWithSignal[]; onRefresh?: () => void }) {
  return (
    <div className="glow-card p-4">
      <SectionHeader code="CLS" title="Recent Trades" hint={`${entries.length} trade ditutup`} />
      {!entries.length && <p className="py-6 text-center text-sm text-ink-muted">Belum ada trade yang ditutup.</p>}
      {entries.length > 0 && (
        <ul className="divide-y divide-line">
          {entries.slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span
                className={`mono-num inline-flex h-6 w-16 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium uppercase ${RESULT_STYLE[e.result]}`}
              >
                {e.result}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{e.signal?.coin ?? "?"}</span>
                  {e.signal && (
                    <span className={`mono-num text-[11px] ${e.signal.side === "LONG" ? "text-up" : "text-down"}`}>{e.signal.side}</span>
                  )}
                  <span className="truncate text-[11px] text-ink-faint">{e.signal?.strategy}</span>
                </div>
              </div>
              <div className="mono-num shrink-0 text-right text-xs">
                <div className={e.profit_percent >= 0 ? "text-up" : "text-down"}>
                  {e.profit_percent >= 0 ? "+" : ""}
                  {e.profit_percent.toFixed(2)}%
                </div>
                <div className="text-ink-faint">{e.rr.toFixed(2)}R</div>
              </div>
              <ScreenshotSlot entry={e} onUploaded={() => onRefresh?.()} />
              <span className="w-14 shrink-0 text-right text-[11px] text-ink-faint">{timeAgo(e.closed_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
