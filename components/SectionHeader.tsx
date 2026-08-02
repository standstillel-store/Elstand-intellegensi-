import type { ReactNode } from "react";
import clsx from "clsx";

const ACCENT_TEXT: Record<string, string> = {
  signal: "text-signal-glow",
  gold: "text-gold",
  up: "text-up",
  down: "text-down",
};
const ACCENT_ICON_WRAP: Record<string, string> = {
  signal: "border-signal/30 bg-signal/10 text-signal-glow",
  gold: "border-gold/35 bg-gold/10 text-gold",
  up: "border-up/30 bg-up/10 text-up",
  down: "border-down/30 bg-down/10 text-down",
};

export function SectionHeader({
  code,
  title,
  hint,
  icon,
  accent = "signal",
}: {
  code: string;
  title: string;
  hint?: string;
  /** Optional header icon — new "important card" treatment. Omit to keep the plain text-only header used everywhere else. */
  icon?: ReactNode;
  /** Accent for the code chip and (if provided) the icon chip. Defaults to "signal", i.e. pixel-identical to before this change. */
  accent?: "signal" | "gold" | "up" | "down";
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
      <div className="flex items-center gap-2">
        {icon && (
          <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", ACCENT_ICON_WRAP[accent])}>
            {icon}
          </span>
        )}
        <div className="flex items-baseline gap-2">
          <span className={clsx("eyebrow text-[11px]", ACCENT_TEXT[accent])}>
            {code}
            <span className="text-ink-faint">&lt;GO&gt;</span>
          </span>
          <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
        </div>
      </div>
      {hint && <span className="shrink-0 text-[11px] text-ink-muted">{hint}</span>}
    </div>
  );
}
