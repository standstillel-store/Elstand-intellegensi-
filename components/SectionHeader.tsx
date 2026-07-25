export function SectionHeader({ code, title, hint }: { code: string; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow text-[11px] text-signal-glow">
          {code}
          <span className="text-ink-faint">&lt;GO&gt;</span>
        </span>
        <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
      </div>
      {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
    </div>
  );
}
