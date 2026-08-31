// ---------------------------------------------------------------------------
// Phase B — Landing Redesign. The supplied HTML template renders its
// ambient background with a hand-written WebGL fragment shader on a
// three.js full-screen quad ("ferrofluid" effect). This app's dependency
// set has no three.js/WebGL library, and the implementation brief is
// explicit: don't add a new dependency for a cosmetic effect when the
// existing stack (CSS + Framer Motion, already used by Reveal.tsx) can
// reproduce the same visual intent — a slow-drifting amber/teal glow field.
//
// This is a Server Component (no "use client") — it's pure static markup;
// all motion is CSS animation defined under `.landing-root` in
// app/globals.css, and already covered by the app's existing blanket
// `@media (prefers-reduced-motion: reduce)` rule, so no JS is needed here
// to respect that preference.
// ---------------------------------------------------------------------------

export function AmbientField() {
  return (
    <div className="elv-ambient" aria-hidden="true">
      <div className="elv-ambient-blob elv-ambient-blob-amber" />
      <div className="elv-ambient-blob elv-ambient-blob-teal" />
      <div className="elv-ambient-grid" />
    </div>
  );
}
