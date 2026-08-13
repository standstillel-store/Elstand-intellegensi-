"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  SlidersHorizontal,
  Palette,
  Cpu,
  Wallet,
  Plug,
  ShieldCheck,
  Wrench,
  AlertTriangle,
} from "lucide-react";

export const SETTINGS_SECTIONS = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "ai-engine", label: "AI Engine", icon: Cpu },
  { id: "paper-trading", label: "Paper Trading", icon: Wallet },
  { id: "api-integration", label: "API Integration", icon: Plug },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "advanced", label: "Advanced", icon: Wrench },
  { id: "danger-zone", label: "Danger Zone", icon: AlertTriangle, tone: "down" as const },
];

/** Tracks which section is centered in the viewport so the nav can highlight it, both here and in the mobile pill strip. */
export function useActiveSettingsSection() {
  const [active, setActive] = useState<string>(SETTINGS_SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    SETTINGS_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return active;
}

export function SettingsNav({ className }: { className?: string }) {
  const active = useActiveSettingsSection();

  return (
    <nav className={clsx("space-y-0.5", className)}>
      {SETTINGS_SECTIONS.map((item) => {
        const isActive = active === item.id;
        const isDanger = item.tone === "down";
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={clsx(
              "flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? isDanger
                  ? "border-down bg-down/10 font-medium text-down"
                  : "border-signal bg-signal/10 font-medium text-ink shadow-glow-signal"
                : isDanger
                ? "border-transparent text-down/70 hover:bg-down/5 hover:text-down"
                : "border-transparent text-ink-muted hover:bg-bg-raised hover:text-ink"
            )}
          >
            <item.icon size={16} className={isActive && !isDanger ? "text-signal-glow" : ""} />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
