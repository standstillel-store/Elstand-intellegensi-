"use client";
import { useState } from "react";
import clsx from "clsx";
import { JournalView } from "./JournalView";
import { PerformanceView } from "@/components/ai-performance/PerformanceView";
import type { JournalWithSignal } from "@/lib/elvoid/types";
import type { PerformanceReport } from "@/lib/elvoid/performance";

export function JournalTabs({ entries, report }: { entries: JournalWithSignal[]; report: PerformanceReport }) {
  const [tab, setTab] = useState<"trades" | "performance">("trades");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["trades", "performance"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
              tab === t ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-muted hover:text-ink"
            )}
          >
            {t === "trades" ? "Trade History" : "Performance"}
          </button>
        ))}
      </div>
      {tab === "trades" ? <JournalView entries={entries} /> : <PerformanceView report={report} />}
    </div>
  );
}
