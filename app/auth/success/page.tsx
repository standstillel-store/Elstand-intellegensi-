"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, ShieldCheck, AlertTriangle } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";

// Landed on straight from app/auth/callback/route.ts after a successful
// Google sign-in. Shows a brief "signed in" beat, then pushes to wherever
// the user was headed (?next=, /dashboard by default) — never back to the
// landing page. Respects prefers-reduced-motion by skipping straight to the
// redirect instead of holding on the animation frame.
//
// Wallet-linking finish step: app/login/page.tsx routes here (instead of
// straight to `next`) specifically when a wallet was verified but not yet
// linked to any account (no Supabase session existed at verification time —
// see the note at the top of app/login/page.tsx and app/api/wallet/session/
// route.ts). It leaves that proof in sessionStorage under
// "elstand:pendingWalletProof", which survives the OAuth redirect. This page
// checks for that key: if it's absent (the ordinary Google-only sign-in,
// the overwhelming majority of visits here), everything below is a no-op
// and this behaves exactly as before. If present, it replays the proof
// against /api/wallet/session now that a session exists, waits for that to
// actually settle (not a fixed timer, since a network round-trip can easily
// exceed the usual 850ms beat), shows the outcome briefly, then continues
// to `next`.
interface PendingWalletProof {
  address: string;
  chainId: number;
  connectorName: string | undefined;
  message: string;
  signature: string;
}

type LinkOutcome = "checking" | "none" | "linking" | "linked" | "failed";

// Some browsers throw on ANY sessionStorage access (not just quota errors) —
// see the matching wrappers and comment in app/login/page.tsx. Here the
// stakes are specifically: the mount effect below calls this as its very
// first line, with nothing to catch a throw — without this wrapper, that
// would leave linkOutcome stuck at "checking" forever, and the person would
// never get redirected off this page at all.
function safeSessionStorageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSessionStorageRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clean up if it was never stored.
  }
}

function AuthSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const reducedMotion = usePrefersReducedMotion();
  const [linkOutcome, setLinkOutcome] = useState<LinkOutcome>("checking");
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(null);

  // Discover on mount whether there's a proof to finish — synchronous read,
  // so it's known before the redirect-scheduling effect below decides how
  // to behave. Always resolves out of "checking" into either "none" or
  // "linking" before that effect is allowed to schedule anything.
  useEffect(() => {
    const raw = safeSessionStorageGet("elstand:pendingWalletProof");
    if (!raw) {
      setLinkOutcome("none"); // ordinary Google sign-in — nothing else to do
      return;
    }
    try {
      const proof = JSON.parse(raw) as PendingWalletProof;
      setLinkOutcome("linking");
      fetch("/api/wallet/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: proof.address,
          chainId: proof.chainId,
          connectorName: proof.connectorName,
          message: proof.message,
          signature: proof.signature,
        }),
      })
        .then((r) => r.json())
        .then((res) => {
          safeSessionStorageRemove("elstand:pendingWalletProof");
          if (res.error) {
            setLinkErrorMessage(res.error);
            setLinkOutcome("failed");
          } else {
            setLinkOutcome("linked");
          }
        })
        .catch(() => {
          safeSessionStorageRemove("elstand:pendingWalletProof");
          // Signature messages expire (see RECENCY_WINDOW_MS in
          // lib/wallet/message.ts) — rather than retry a possibly-stale
          // signature automatically, point the person at Settings, where
          // WalletSection.tsx can generate a fresh one.
          setLinkErrorMessage("Couldn't reach the server to finish linking. You can connect your wallet again from Settings.");
          setLinkOutcome("failed");
        });
    } catch {
      safeSessionStorageRemove("elstand:pendingWalletProof");
      setLinkOutcome("none");
    }
  }, []);

  // "checking": nothing scheduled yet — effect 1 hasn't resolved which case
  // this is. "linking": a request is in flight — still nothing scheduled.
  // Only once linkOutcome is "none" (ordinary sign-in) or has settled into
  // "linked"/"failed" does a redirect get scheduled at all, so there's no
  // window where the wrong-case timer could fire.
  useEffect(() => {
    if (linkOutcome === "checking" || linkOutcome === "linking") return;
    const delay = reducedMotion ? 0 : linkOutcome === "none" ? 850 : 1100;
    const id = setTimeout(() => router.replace(next), delay);
    return () => clearTimeout(id);
  }, [router, next, reducedMotion, linkOutcome]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <motion.div
        initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={
          "flex h-16 w-16 items-center justify-center rounded-full border shadow-glow-signal " +
          (linkOutcome === "failed" ? "border-down/40 bg-down/10" : "border-signal/40 bg-signal/10")
        }
      >
        {linkOutcome === "failed" ? (
          <AlertTriangle size={26} className="text-down" strokeWidth={2.5} />
        ) : linkOutcome === "linking" ? (
          <ShieldCheck size={28} className="text-signal-glow" strokeWidth={2.5} />
        ) : (
          <Check size={28} className="text-signal-glow" strokeWidth={2.5} />
        )}
      </motion.div>
      <motion.p
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-5 max-w-[280px] text-center text-sm font-medium tracking-tight text-ink"
      >
        {linkOutcome === "linking"
          ? "Connecting your wallet…"
          : linkOutcome === "linked"
            ? "Wallet connected — welcome to ELSTAND"
            : linkOutcome === "failed"
              ? linkErrorMessage ?? "Signed in — wallet linking didn't complete"
              : "Signed in — welcome to ELSTAND"}
      </motion.p>
      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-signal animate-pulseGlow" />
    </main>
  );
}

// useSearchParams() forces this page out of the static-prerender path unless
// it's wrapped in Suspense — this wrapper is the fix.
export default function AuthSuccessPage() {
  return (
    <Suspense fallback={null}>
      <AuthSuccessContent />
    </Suspense>
  );
}
