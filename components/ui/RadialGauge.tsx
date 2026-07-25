"use client";
import { useEffect, useId, useState } from "react";
import clsx from "clsx";

/**
 * A 270°-sweep circular gauge. Pass `value` 0-100; the arc animates in on
 * mount/change via CSS transition on stroke-dashoffset (see .gauge-ring-value
 * in globals.css) rather than JS-driven interpolation, so it stays cheap to
 * render inside lists of many cards.
 */
export function RadialGauge({
  value,
  size = 84,
  strokeWidth = 8,
  label,
  sublabel,
  tone = "signal",
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  tone?: "signal" | "up" | "down" | "amber";
}) {
  const id = useId();
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweep = 0.75; // 270° of the circle is the visible track
  const arcLength = circumference * sweep;

  const [dashOffset, setDashOffset] = useState(arcLength);
  useEffect(() => {
    const id2 = requestAnimationFrame(() => setDashOffset(arcLength - (clamped / 100) * arcLength));
    return () => cancelAnimationFrame(id2);
  }, [clamped, arcLength]);

  const toneClass = {
    signal: "stroke-signal-glow",
    up: "stroke-up",
    down: "stroke-down",
    amber: "stroke-amber",
  }[tone];

  return (
    <div className="relative inline-flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-[135deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          className="gauge-ring-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          className={clsx("gauge-ring-value", toneClass)}
          id={id}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono-num text-lg font-bold leading-none text-ink">{Math.round(clamped)}</span>
        {label && <span className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-faint">{label}</span>}
      </div>
      {sublabel && <span className="mt-1 text-[10px] text-ink-muted">{sublabel}</span>}
    </div>
  );
}
