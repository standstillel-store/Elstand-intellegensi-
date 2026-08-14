"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Lock } from "lucide-react";
import clsx from "clsx";
import { CHART_MODE_GROUPS, CHART_MODE_LABEL, type ChartMode } from "./chartModes";

export function IndicatorSelector({
  activeMode,
  onSelect,
}: {
  activeMode: ChartMode;
  onSelect: (mode: ChartMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-signal/40 hover:text-ink"
      >
        {CHART_MODE_LABEL[activeMode]}
        <ChevronDown size={13} className={clsx("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-[70vh] w-64 overflow-y-auto rounded-lg border border-line bg-bg-raised shadow-2xl">
          {CHART_MODE_GROUPS.map((group) => (
            <div key={group.label} className="border-b border-line/60 py-1.5 last:border-b-0">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{group.label}</p>
              {group.items.map((item) => {
                const active = item.id === activeMode;
                return (
                  <button
                    key={item.id}
                    disabled={!item.ready}
                    onClick={() => {
                      if (!item.ready) return;
                      onSelect(item.id);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors",
                      item.ready ? "text-ink hover:bg-signal/10" : "cursor-not-allowed text-ink-faint",
                      active && "bg-signal/10 text-signal-glow"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {active && <Check size={12} className="text-signal-glow" />}
                      {item.label}
                    </span>
                    {!item.ready && (
                      <span title={item.phase} className="shrink-0">
                        <Lock size={11} className="text-ink-faint" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
