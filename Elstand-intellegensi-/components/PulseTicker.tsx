export function PulseTicker({ items }: { items: string[] }) {
  if (!items.length) return null;
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden border-b border-line bg-bg-surface/60 py-1.5">
      <div className="mono-num flex w-max animate-ticker gap-8 whitespace-nowrap px-4 text-xs text-ink-muted">
        {loop.map((it, i) => (
          <span key={i}>{it}</span>
        ))}
      </div>
    </div>
  );
}
