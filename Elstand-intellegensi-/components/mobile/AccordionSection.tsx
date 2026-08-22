"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/**
 * Same Bloomberg-terminal "<GO> code" identity as the desktop SectionHeader,
 * just collapsible: closed rows still show a one-line glance summary so the
 * screen stays scannable without every section expanded at once.
 */
export function AccordionSection({
  code,
  title,
  glance,
  defaultOpen = false,
  children,
}: {
  code: string;
  title: string;
  glance?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-bg-raised/60"
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="eyebrow shrink-0 text-[11px] text-signal-glow">
            {code}
            <span className="text-ink-faint">&lt;GO&gt;</span>
          </span>
          <span className="truncate text-sm font-semibold tracking-wide text-ink">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {!open && glance}
          <ChevronDown
            size={16}
            className={clsx("shrink-0 text-ink-muted transition-transform duration-200", open && "rotate-180")}
          />
        </span>
      </button>
      {open && <div className="border-t border-line px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}
