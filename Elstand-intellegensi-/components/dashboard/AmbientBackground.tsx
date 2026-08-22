/**
 * Terminal Visual Overhaul — global dashboard backdrop: the animated grid
 * texture + a handful of slow-drifting particles that make the page read
 * as "alive" instead of a static screenshot, per the brief's "Add soft
 * animated particles/grid background".
 *
 * Positions/sizes/delays are a fixed array, not Math.random() — random
 * values generated at render would differ between the server-rendered HTML
 * and the client's first paint and trip a hydration mismatch. A fixed,
 * hand-picked layout is deterministic and still reads as organic because
 * the values aren't on a grid themselves.
 *
 * Purely decorative: fixed position, inset-0, -z-10, pointer-events-none —
 * never intercepts clicks and never affects layout/flow of real content.
 */
const PARTICLES: { top: string; left: string; size: number; opacity: number; duration: number; delay: number; tone: "gold" | "signal" }[] = [
  { top: "8%", left: "12%", size: 3, opacity: 0.5, duration: 10, delay: 0, tone: "gold" },
  { top: "16%", left: "68%", size: 2, opacity: 0.4, duration: 12, delay: 1.2, tone: "signal" },
  { top: "24%", left: "34%", size: 2.5, opacity: 0.45, duration: 9, delay: 2.4, tone: "gold" },
  { top: "12%", left: "88%", size: 2, opacity: 0.35, duration: 13, delay: 0.6, tone: "signal" },
  { top: "38%", left: "6%", size: 2, opacity: 0.4, duration: 11, delay: 3.1, tone: "signal" },
  { top: "44%", left: "78%", size: 3, opacity: 0.5, duration: 10.5, delay: 1.8, tone: "gold" },
  { top: "58%", left: "22%", size: 2, opacity: 0.35, duration: 12.5, delay: 2.9, tone: "gold" },
  { top: "62%", left: "92%", size: 2.5, opacity: 0.4, duration: 9.5, delay: 0.3, tone: "signal" },
  { top: "72%", left: "48%", size: 2, opacity: 0.35, duration: 11.5, delay: 4.2, tone: "gold" },
  { top: "81%", left: "16%", size: 3, opacity: 0.45, duration: 10, delay: 1.5, tone: "signal" },
  { top: "88%", left: "64%", size: 2, opacity: 0.4, duration: 13.5, delay: 2.1, tone: "gold" },
  { top: "94%", left: "38%", size: 2.5, opacity: 0.35, duration: 9.8, delay: 3.6, tone: "signal" },
  { top: "30%", left: "52%", size: 2, opacity: 0.3, duration: 14, delay: 5, tone: "gold" },
  { top: "50%", left: "40%", size: 2, opacity: 0.3, duration: 12, delay: 0.9, tone: "signal" },
];

export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="bg-grid-animated absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg" />
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="bg-particle"
          style={
            {
              top: p.top,
              left: p.left,
              width: p.size,
              height: p.size,
              background: p.tone === "gold" ? "rgba(212, 175, 55, 0.9)" : "rgb(var(--signal-glow-rgb) / 0.9)",
              boxShadow: p.tone === "gold" ? "0 0 6px rgba(212, 175, 55, 0.6)" : "0 0 6px rgb(var(--signal-glow-rgb) / 0.6)",
              "--particle-duration": `${p.duration}s`,
              "--particle-delay": `${p.delay}s`,
              opacity: p.opacity,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
