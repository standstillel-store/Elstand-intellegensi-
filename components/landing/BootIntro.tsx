"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// ---------------------------------------------------------------------------
// Phase B — Landing Redesign. Reproduces the template's brief "boot
// sequence" intro (a few terminal-style status lines before the page
// settles) using Framer Motion instead of a hand-rolled GSAP timeline.
// Skips straight to "done" for prefers-reduced-motion, same as the
// template's own `if(reduced){ bootEl.remove(); ... }` branch.
// Auto-dismisses after a short, fixed sequence — never blocks interaction
// (pointer-events: none) and never re-shows on the same visit.
// ---------------------------------------------------------------------------

const LINES = [
  "> INITIALIZING ELSTAND CORE",
  "> LOADING CONTEXT ENGINE... OK",
  "> LOADING ELVOID QUANT... OK",
  "> LOADING ELVOID ORACLE... OK",
  "> ACCESS LAYER... OK",
];

export function BootIntro() {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(!reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(() => setVisible(false), LINES.length * 220 + 500);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="elv-boot mono"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          aria-hidden="true"
        >
          {LINES.map((line, i) => (
            <motion.div
              key={line}
              className="elv-boot-line"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.22, duration: 0.2 }}
            >
              {line}
              {i === 0 && <span className="elv-boot-cursor" />}
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
