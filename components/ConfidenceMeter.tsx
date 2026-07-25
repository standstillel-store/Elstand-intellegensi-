export function ConfidenceMeter({ value }: { value: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" title={`Confidence ${value}%`}>
      <div className="h-1 w-9 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-signal-glow" style={{ width: `${value}%` }} />
      </div>
      <span className="mono-num text-[10px] text-ink-faint">{value}%</span>
    </div>
  );
}
