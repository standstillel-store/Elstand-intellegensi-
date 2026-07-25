"use client";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { ReactNode } from "react";

const TONE_HOVER_SHADOW: Record<string, string> = {
  neutral: "hover:shadow-glow-signal hover:border-signal/40",
  up: "hover:shadow-glow-up hover:border-up/40",
  down: "hover:shadow-glow-down hover:border-down/40",
  rugpull: "hover:shadow-glow-rugpull hover:border-rugpull/40",
  smartmoney: "hover:shadow-glow-smartmoney hover:border-smartmoney/40",
};

export function GlowCard({
  children,
  tone = "neutral",
  className,
  onClick,
  as = "div",
  delay = 0,
}: {
  children: ReactNode;
  tone?: "neutral" | "up" | "down" | "rugpull" | "smartmoney";
  className?: string;
  onClick?: () => void;
  as?: "div" | "button";
  delay?: number;
}) {
  const Comp = motion[as as "div"];
  return (
    <Comp
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={clsx(
        "bg-bg-surface border border-line rounded-xl shadow-card transition-shadow duration-300",
        TONE_HOVER_SHADOW[tone],
        onClick && "text-left",
        className
      )}
    >
      {children}
    </Comp>
  );
}
