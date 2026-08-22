import { FlaskConical } from "lucide-react";

export function SimulatedTag({ label = "Simulated" }: { label?: string }) {
  return (
    <span className="simulated-tag" title="Preview data — sumber real-time untuk panel ini belum terhubung">
      <FlaskConical size={9} />
      {label}
    </span>
  );
}
