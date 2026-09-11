// Phase 9 — Mock Panel Redesign (Web3). Renders inside
// <IllustrativePanel visual={...}> for Web3Section's "ON-CHAIN SETTLEMENT
// — BSC TESTNET" panel. A fixed 4-node sequence (Wallet -> Transaction ->
// Service -> Settlement) with small mono labels underneath each node —
// this is the settlement flow described in the section's own copy, drawn
// as a diagram, not a claim of a specific live transaction. No amounts, no
// addresses, no contract data. Motion: a single small "packet" dot travels
// once along the whole path on a slow loop (CSS motion-path/offset-path —
// degrades gracefully to a static dot at the start in browsers that don't
// support it, no error either way). Covered automatically by the app's
// blanket prefers-reduced-motion rule.
// Kept as a plain string (not built from NODES below) because the exact
// same coordinates are also hard-coded into `.elv-settle-packet`'s
// `offset-path` in globals.css — CSS custom properties can't carry an
// SVG path string, so this one geometry value is intentionally duplicated
// in the two places that need it (documented here rather than computed at
// runtime, to keep the CSS declarative and avoid an inline style with a
// motion-path value that some `@types/react`/csstype versions don't model
// cleanly).
const NODES = [
  { x: 30, label: "WALLET" },
  { x: 120, label: "TX" },
  { x: 210, label: "SERVICE" },
  { x: 300, label: "SETTLEMENT" },
];

export function SettlementFlowVisual() {
  return (
    <svg
      className="elv-settle-visual"
      viewBox="0 0 330 110"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M30,60 L120,60 L210,60 L300,60" className="elv-settle-line" />
      {NODES.map((n) => (
        <g key={n.label}>
          <circle cx={n.x} cy="60" r="5" className="elv-settle-node" />
          <text x={n.x} y="86" textAnchor="middle" className="elv-settle-label mono">
            {n.label}
          </text>
        </g>
      ))}
      <circle r="3.5" className="elv-settle-packet" />
    </svg>
  );
}
