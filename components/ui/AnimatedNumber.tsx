"use client";
import { useEffect, useRef } from "react";
import { animate, useMotionValue } from "framer-motion";
import clsx from "clsx";

/**
 * Tweens a numeric value on every change instead of snapping — the "live
 * terminal" feel Coinglass/Nansen-style dashboards use for tickers and
 * stat cards. Falls back to a plain static render on first mount so pages
 * don't animate from 0 on every load.
 */
export function AnimatedNumber({
  value,
  format = (n: number) => n.toLocaleString("en-US"),
  duration = 0.6,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (ref.current) ref.current.textContent = format(value);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [value, duration, format, mv]);

  return <span ref={ref} className={clsx("mono-num tabular-nums", className)} />;
}
