"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Small client-only wrapper so section files (Features, Roadmap, Security,
// TokenSection) can add scroll-triggered animation without becoming client
// components themselves — a Server Component can render a Client Component
// and pass it server-rendered JSX as children, so this is the only file in
// this batch that needs "use client".
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
