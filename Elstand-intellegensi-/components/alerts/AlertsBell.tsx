"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, Waves, TrendingUp, Zap, Newspaper, GitBranch } from "lucide-react";
import clsx from "clsx";
import { timeAgo } from "@/lib/format";
import type { AlertItem, AlertType } from "@/lib/alerts";

const TYPE_ICON: Record<AlertType, typeof Bell> = {
  liquidity_sweep: Waves,
  bos_choch: GitBranch,
  whale: Waves,
  funding_extreme: Zap,
  open_interest: TrendingUp,
  news: Newspaper,
};

const SEVERITY_DOT = { info: "bg-signal", warning: "bg-amber", critical: "bg-down" } as const;

export function AlertsBell() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/alerts").then((r) => r.json());
        if (!cancelled) setAlerts(res.alerts ?? []);
      } catch {
        /* keep last known alerts */
      }
    }
    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unseen = Math.max(0, alerts.length - seenCount);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          setSeenCount(alerts.length);
        }}
        className="relative flex items-center rounded-md border border-line p-1.5 text-ink-muted hover:border-signal/40 hover:text-ink"
        aria-label="Alerts"
      >
        <Bell size={16} />
        {unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-down px-1 text-[9px] font-bold text-white">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] max-h-96 w-80 overflow-y-auto rounded-md border border-line bg-bg-raised py-1 shadow-2xl shadow-black/40">
          <p className="eyebrow px-3 py-2 text-[10px] uppercase tracking-wider text-ink-faint">Alerts</p>
          {!alerts.length && <p className="px-3 py-4 text-center text-xs text-ink-muted">Tidak ada alert saat ini.</p>}
          {alerts.map((a) => {
            const Icon = TYPE_ICON[a.type];
            return (
              <div key={a.id} className="flex items-start gap-2 border-t border-line px-3 py-2.5 text-xs">
                <span className={clsx("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", SEVERITY_DOT[a.severity])} />
                <Icon size={13} className="mt-0.5 shrink-0 text-ink-faint" />
                <div className="min-w-0">
                  <p className="text-ink">{a.message}</p>
                  <p className="mt-0.5 text-[10px] text-ink-faint">{timeAgo(a.timestamp)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
