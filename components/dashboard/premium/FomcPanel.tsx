"use client";

import { useEffect, useState } from "react";
import { DataStateBadge, DataUnavailable } from "@/components/ui/DataStateBadge";
import type { FedFundsReading } from "@/lib/macro";
import type { FomcEvent, DataState } from "@/lib/intelligence/premium";

interface Remaining {
  d: number;
  h: number;
  m: number;
  s: number;
  isPast: boolean;
}

function useCountdown(targetIso?: string): Remaining | null {
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining({ d: 0, h: 0, m: 0, s: 0, isPast: true });
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      setRemaining({
        d: Math.floor(totalSec / 86400),
        h: Math.floor((totalSec % 86400) / 3600),
        m: Math.floor((totalSec % 3600) / 60),
        s: totalSec % 60,
        isPast: false,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return remaining;
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-[46px] flex-col items-center rounded border border-line/60 bg-bg-raised px-2 py-1.5">
      <span className="mono-num text-lg font-bold text-signal-glow">{String(value).padStart(2, "0")}</span>
      <span className="text-[8px] uppercase tracking-wide text-ink-faint">{label}</span>
    </div>
  );
}

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

export function FomcPanel({
  event,
  fedFunds,
  fedFundsState,
}: {
  event?: FomcEvent;
  fedFunds?: FedFundsReading;
  fedFundsState: DataState;
}) {
  const remaining = useCountdown(event?.date);

  return (
    <div className="panel flex h-full flex-col p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="eyebrow text-[11px] text-ink-muted">FOMC Countdown &amp; Rate</h2>
        <DataStateBadge state={event ? "real" : "unavailable"} compact />
      </div>

      {!event ? (
        <DataUnavailable label="NEXT FOMC MEETING — DATA UNAVAILABLE" />
      ) : (
        <>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Next FOMC Meeting</div>
          <div className="mb-0.5 text-[14px] font-semibold text-ink">{dateFmt(event.date)}</div>
          <div className="mb-2.5 text-[9.5px] text-ink-faint">
            {event.source === "calendar" ? "Source: live economic calendar" : "Source: Federal Reserve published meeting calendar"}
          </div>
          {remaining && !remaining.isPast ? (
            <div className="mb-3 flex gap-1.5">
              <CountdownBox value={remaining.d} label="Days" />
              <CountdownBox value={remaining.h} label="Hours" />
              <CountdownBox value={remaining.m} label="Min" />
              <CountdownBox value={remaining.s} label="Sec" />
            </div>
          ) : remaining?.isPast ? (
            <div className="mb-3 text-[12px] font-semibold text-amber">Meeting in session or just concluded</div>
          ) : null}
        </>
      )}

      <div className="my-2 border-t border-line/60" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Current Target Rate</div>
          {fedFunds ? (
            <div className="mono-num text-[15px] font-semibold text-ink">
              {fedFunds.lower.toFixed(2)}–{fedFunds.upper.toFixed(2)}%
            </div>
          ) : (
            <DataUnavailable />
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Last Rate Change</div>
          {fedFunds?.lastChange ? (
            <div className="text-[12px] text-ink-muted">
              {fedFunds.lastChange.bps > 0 ? "+" : ""}
              {fedFunds.lastChange.bps}bps · {dateFmt(fedFunds.lastChange.date)}
            </div>
          ) : (
            <DataUnavailable label={fedFundsState === "unavailable" ? "DATA UNAVAILABLE" : "No change in window"} />
          )}
        </div>
      </div>

      <div className="my-2 border-t border-line/60" />

      <div className="mt-auto rounded border border-line/60 bg-bg-raised/50 p-2.5">
        <div className="text-[10px] uppercase tracking-wide text-ink-faint">Rate-Cut Probability</div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
          DATA UNAVAILABLE — this needs a market-implied rate feed (e.g. CME FedWatch), which isn&rsquo;t connected yet. Everything above this line is live.
        </p>
      </div>
    </div>
  );
}
