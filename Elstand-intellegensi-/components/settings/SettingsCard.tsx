import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import clsx from "clsx";

export function SettingsCard({
  id,
  icon: Icon,
  title,
  description,
  tone = "signal",
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: "signal" | "down";
  children: ReactNode;
}) {
  return (
    <section id={id} className={clsx("glow-card scroll-mt-24 p-5", tone === "down" && "border-down/25")}>
      <div className="mb-4 flex items-start gap-3">
        <div
          className={clsx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            tone === "down" ? "border-down/30 bg-down/10 text-down" : "border-signal/30 bg-signal/10 text-signal-glow"
          )}
        >
          <Icon size={17} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className={clsx("text-sm font-semibold tracking-tight", tone === "down" ? "text-down" : "text-ink")}>{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** One row inside a SettingsCard: label + control, the shape almost every setting takes. */
export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3.5 first:mt-0 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** The on/off pill switch used throughout — extracted from the old inline JSX so every toggle in Settings looks identical. */
export function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      className={clsx(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-signal" : "bg-bg-raised"
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/** Segmented control (pill group) for small enum choices — theme, accent, speed, personality, etc. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-line text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "px-3 py-1.5 capitalize transition-colors",
            value === opt.value ? "bg-signal/20 text-signal-glow" : "text-ink-faint hover:text-ink"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
