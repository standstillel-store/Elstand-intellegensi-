"use client";
import clsx from "clsx";
import { SETTINGS_SECTIONS, useActiveSettingsSection } from "./SettingsNav";

export function SettingsMobileTabs() {
  const active = useActiveSettingsSection();

  return (
    <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-2.5">
      {SETTINGS_SECTIONS.map((item) => {
        const isActive = active === item.id;
        const isDanger = item.tone === "down";
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
              isActive
                ? isDanger
                  ? "border-down/50 bg-down/15 text-down"
                  : "border-signal/50 bg-signal/15 text-signal-glow"
                : isDanger
                ? "border-line text-down/70"
                : "border-line text-ink-muted"
            )}
          >
            <item.icon size={12} />
            {item.label}
          </a>
        );
      })}
    </div>
  );
}
