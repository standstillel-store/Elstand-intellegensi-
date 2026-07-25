"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

// Landed on straight from app/auth/callback/route.ts after a successful
// Google sign-in. Shows a brief "signed in" beat, then pushes to wherever
// the user was headed (?next=, /dashboard by default) — never back to the
// landing page. Respects prefers-reduced-motion by skipping straight to the
// redirect instead of holding on the animation frame.
export default function AuthSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const delay = reducedMotion ? 0 : 850;
    const id = setTimeout(() => router.replace(next), delay);
    return () => clearTimeout(id);
  }, [router, next, reducedMotion]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <motion.div
        initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex h-16 w-16 items-center justify-center rounded-full border border-signal/40 bg-signal/10 shadow-glow-signal"
      >
        <Check size={28} className="text-signal-glow" strokeWidth={2.5} />
      </motion.div>
      <motion.p
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-5 text-sm font-medium tracking-tight text-ink"
      >
        Signed in — welcome to ELSTAND
      </motion.p>
      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-signal animate-pulseGlow" />
    </main>
  );
}
