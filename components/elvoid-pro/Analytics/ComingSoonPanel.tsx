import { Construction } from "lucide-react";

export function ComingSoonPanel({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-dashed border-line bg-bg-surface/40 p-3">
      <p className="text-xs font-semibold text-ink-muted">{title}</p>
      <div className="mt-auto flex flex-col items-center gap-1 py-3 text-center">
        <Construction size={16} className="text-ink-faint" />
        <p className="text-[10px] text-ink-faint">Dijadwalkan di {phase}</p>
      </div>
    </div>
  );
}
