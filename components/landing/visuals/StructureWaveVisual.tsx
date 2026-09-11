// Phase 9 — Mock Panel Redesign (Quant). Renders inside
// <IllustrativePanel visual={...}> for QuantSection's "STRUCTURE WAVE"
// panel. A fixed, hand-drawn path suggesting market structure (a
// support/resistance read, not a live chart) plus two dashed horizontal
// levels. No price values, no numbers, no fabricated data — abstract
// geometry only, matching this section's own tile values ("·") which are
// deliberately non-numeric. Motion: the structure path drifts a few
// pixels vertically on a slow loop (a "reading the tape" feel, not a
// price move), and the two level lines have a slow dash-offset drift.
// Both are pure CSS keyframes, automatically covered by the app's blanket
// prefers-reduced-motion rule.
export function StructureWaveVisual() {
  return (
    <svg
      className="elv-wave-visual"
      viewBox="0 0 320 190"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <line x1="0" y1="55" x2="320" y2="55" className="elv-wave-level" />
      <line x1="0" y1="132" x2="320" y2="132" className="elv-wave-level" />
      <path
        d="M8,150 L46,96 L84,118 L122,58 L160,90 L198,46 L236,84 L274,38 L312,66"
        className="elv-wave-path"
      />
    </svg>
  );
}
