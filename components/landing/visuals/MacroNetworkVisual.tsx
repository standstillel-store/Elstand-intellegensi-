// Phase 9 — Mock Panel Redesign (Macro). Renders inside
// <IllustrativePanel visual={...}> for MacroSection's "MACRO CONTEXT
// NETWORK" panel. Pure SVG + CSS animation, no canvas/WebGL, no new
// dependency. A fixed, hand-placed hub-and-satellite layout — not a live
// graph, not fed by any data source — matching the honest "illustrative"
// framing already required by the <Note> under this panel. Motion is two
// restrained things: a slow breathing ping on the hub node, and a slow
// traveling dash on two of the five connecting lines (reusing the same
// stroke-dasharray/dashoffset technique already used elsewhere in this repo
// for cognitive-graph edges, at a deliberately slower, calmer speed here).
// Covered automatically by the app's blanket prefers-reduced-motion rule —
// no extra motion-safety code needed in this file.
export function MacroNetworkVisual() {
  const hub = { x: 160, y: 96 };
  const satellites = [
    { x: 58, y: 44 },
    { x: 252, y: 40 },
    { x: 36, y: 148 },
    { x: 268, y: 150 },
    { x: 160, y: 168 },
  ];
  // Only 2 of the 5 spokes animate — "restrained," not every element.
  const activeSpokeIndices = new Set([1, 3]);

  return (
    <svg
      className="elv-net-visual"
      viewBox="0 0 320 190"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {satellites.map((s, i) => (
        <line
          key={`line-${i}`}
          x1={hub.x}
          y1={hub.y}
          x2={s.x}
          y2={s.y}
          className={activeSpokeIndices.has(i) ? "elv-net-line elv-net-line-active" : "elv-net-line"}
        />
      ))}
      {satellites.map((s, i) => (
        <circle key={`node-${i}`} cx={s.x} cy={s.y} r="3.5" className="elv-net-node" />
      ))}
      <circle cx={hub.x} cy={hub.y} r="10" className="elv-net-ping" />
      <circle cx={hub.x} cy={hub.y} r="5" className="elv-net-node elv-net-node-hub" />
    </svg>
  );
}
