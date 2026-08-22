import { Construction } from "lucide-react";
import type { ChartModeDef } from "./chartModes";

export function ComingSoonMode({ mode, height }: { mode: ChartModeDef; height: number }) {
  return (
    <div
      style={{ height }}
      className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-bg-surface/40 text-center"
    >
      <Construction size={22} className="text-ink-faint" />
      <p className="text-sm font-medium text-ink-muted">{mode.label} — belum tersedia</p>
      <p className="max-w-xs text-[11px] text-ink-faint">
        {mode.phase ? `Dijadwalkan di ${mode.phase}.` : "Belum dijadwalkan."} Chart engine ini sudah siap menerima
        data real-time begitu sumber datanya terhubung — tidak ada data simulasi yang ditampilkan.
      </p>
    </div>
  );
}
