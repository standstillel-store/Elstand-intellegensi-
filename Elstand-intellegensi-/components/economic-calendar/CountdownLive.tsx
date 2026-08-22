"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { preciseCountdown } from "@/lib/format";

export function CountdownLive({ date }: { date: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const { text, isPast, isSoon } = preciseCountdown(date);

  return (
    <span
      className={clsx(
        "mono-num inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]",
        isPast ? "text-ink-faint" : isSoon ? "animate-pulseGlow bg-down/10 text-down" : "text-ink-muted"
      )}
    >
      {text}
    </span>
  );
}
