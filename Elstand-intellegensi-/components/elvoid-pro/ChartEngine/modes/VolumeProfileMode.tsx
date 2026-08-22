"use client";
import { useEffect, useState } from "react";
import type { PriceProfile } from "@/lib/elvoid/marketProfile";
import { formatUsd } from "@/lib/format";

export function VolumeProfileMode({
  symbol,
  interval,
  height,
  endpoint = "/api/volume-profile",
  label = "Volume Profile",
}: {
  symbol: string;
  interval: string;
  height: number;
  endpoint?: string;
  label?: string;
}) {
  const [profile, setProfile] = useState<PriceProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`${endpoint}?symbol=${symbol}&interval=${interval}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error || !data.profile) {
          setStatus("error");
          return;
        }
        setProfile(data.profile);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol, interval, endpoint]);

  if (status === "loading") {
    return (
      <div style={{ height }} className="flex animate-pulse items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Menghitung {label.toLowerCase()}…
      </div>
    );
  }

  if (status === "error" || !profile || profile.bins.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        {label} tidak tersedia saat ini.
      </div>
    );
  }

  const maxValue = Math.max(...profile.bins.map((b) => b.value));
  const bins = [...profile.bins].reverse(); // highest price first

  return (
    <div style={{ height }} className="flex flex-col rounded-md border border-line bg-bg-surface/40 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-ink-muted">{label}</span>
        <span className="mono-num flex gap-3 text-ink-faint">
          {profile.vah !== null && <span>VAH <span className="text-ink">{formatUsd(profile.vah)}</span></span>}
          {profile.poc && <span>POC <span className="text-signal-glow">{formatUsd((profile.poc.priceLow + profile.poc.priceHigh) / 2)}</span></span>}
          {profile.val !== null && <span>VAL <span className="text-ink">{formatUsd(profile.val)}</span></span>}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-px overflow-hidden">
        {bins.map((bin, i) => {
          const isPoc = profile.poc && bin.priceLow === profile.poc.priceLow;
          const inValueArea = profile.vah !== null && profile.val !== null && bin.priceHigh > profile.val && bin.priceLow < profile.vah;
          const widthPct = maxValue > 0 ? (bin.value / maxValue) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="mono-num w-16 shrink-0 text-right text-[9px] text-ink-faint">
                {formatUsd((bin.priceLow + bin.priceHigh) / 2)}
              </span>
              <div className="h-2 flex-1 rounded-sm bg-bg-raised">
                <div
                  className="h-2 rounded-sm"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: isPoc ? "#a78bfa" : inValueArea ? "#7c3aed77" : "#4b556377",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
