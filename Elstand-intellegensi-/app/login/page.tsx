"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { Wallet as WalletIcon, ShieldCheck, Loader2, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/auth/client";
import { isWalletConnectConfigured, CHAIN_NAMES } from "@/lib/web3/config";
import { buildVerificationMessage, generateNonce } from "@/lib/wallet/message";
import { connectorNameToWalletType, WALLET_TYPE_LABEL } from "@/lib/wallet/connectors";
import { shortAddr } from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";

// Some browsers throw on ANY sessionStorage access (not just quota errors) —
// Safari private mode historically, and third-party-storage-blocked iframe
// contexts more generally. A bare, unguarded call as the first line of an
// effect would crash that effect outright; in the "restore a pending proof"
// effects below, that would leave walletStep/linkOutcome stuck in an
// initial-loading state forever with no way to recover. These wrappers make
// every call site safe by construction instead of relying on each one
// remembering its own try/catch.
function safeSessionStorageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSessionStorageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Best-effort — if storage is unavailable, the wallet proof simply
    // won't survive a full-page OAuth redirect; the same-tab getSession()
    // effect and the auto-reverify-on-reconnect effect are still there as
    // fallbacks for that case.
  }
}
function safeSessionStorageRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clean up if it was never stored.
  }
}

// ---------------------------------------------------------------------------
// Sign in — two equal-priority paths: Continue with Google, Connect Wallet.
//
// Wallet flow honesty note: the `users` table currently requires an email
// (see supabase/schema.sql, "Phase 3 — Google Auth & User Profile"), so
// there's no such thing yet as a wallet-only account. "Connect Wallet" here
// therefore does the part that's real today — connect, prove ownership with
// a signature, check no one else already claimed the address — and if no
// Google session exists yet, it holds that proof and asks the person to
// finish with Google rather than pretending a full second independent login
// path already exists. Once Google completes, the same proof is replayed to
// app/api/wallet/session to finish the link. Building a true standalone
// wallet-only account is a real schema decision, intentionally left for a
// later phase (see the note at the top of app/api/wallet/session/route.ts).
// ---------------------------------------------------------------------------

type WalletStep =
  | "idle"
  | "connecting"
  | "awaiting-signature"
  | "verifying"
  | "verified-unlinked"
  | "linked"
  | "wrong-network"
  | "error";

interface PendingWalletProof {
  address: string;
  chainId: number;
  connectorName: string | undefined;
  message: string;
  signature: string;
}

// AppKit's own connect modal (see WalletSection.tsx) already lists whichever
// injected wallets are actually installed via EIP-6963 and offers
// WalletConnect for everything else — so the "which wallets" question is
// answered by the modal itself, not hardcoded here. This label set is only
// for messaging once a connection attempt is already underway.
const SUPPORTED_WALLET_HINT = "MetaMask, Rabby, OKX Wallet, Coinbase Wallet, or any mobile wallet via WalletConnect";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const reducedMotion = usePrefersReducedMotion();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [walletStep, setWalletStep] = useState<WalletStep>("idle");
  const [walletError, setWalletError] = useState<string | null>(null);
  const [pendingProof, setPendingProof] = useState<PendingWalletProof | null>(null);
  const attemptedAddressRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { address, isConnected, chainId, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();

  const isSupportedChain = chainId ? Boolean(CHAIN_NAMES[chainId]) : true;

  // Bumped at the start of every runVerification() call. Each async
  // continuation below checks its own captured generation against this
  // ref before writing any state, so a stale response — the timeout fired
  // and showed an error, but signMessageAsync/fetch resolves anyway a
  // moment later; or the person disconnected and reconnected with a
  // different address while the first attempt's fetch was still in
  // flight — can never silently overwrite what's already on screen.
  const verificationGenerationRef = useRef(0);

  const clearWalletTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearWalletTimeout(), [clearWalletTimeout]);

  // ---- Google -------------------------------------------------------------

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setGoogleError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // If a wallet is verified-but-unlinked, the person must land back on
      // /auth/success (not straight to `next`, and NOT /login) so a
      // component actually mounts and can replay the proof against
      // /api/wallet/session before continuing on. /login won't work for
      // this: middleware.ts unconditionally redirects any *already signed
      // in* request to /login straight to /dashboard before the page ever
      // renders (see the `user && pathname === "/login"` rule), so this
      // component would never get a chance to run its restore effect.
      // /auth/success isn't `/login`, so middleware leaves it alone, and it
      // already exists for exactly this "just landed from OAuth" moment
      // (previously built but never actually wired up by anything).
      const callbackNext = pendingProof ? `/auth/success?next=${encodeURIComponent(next)}` : next;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackNext)}`,
        },
      });
      if (signInError) {
        setGoogleError(signInError.message);
        setGoogleLoading(false);
      }
      // On success the browser navigates away to Google, so no further
      // state update happens here — the person lands back on
      // /auth/callback, which we don't modify (out of scope: it only
      // exchanges the code and redirects to whatever `next` we set above).
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Sign-in isn't configured yet.");
      setGoogleLoading(false);
    }
  }

  // A full-page OAuth redirect drops React state, so the verified-but-
  // unlinked wallet proof is parked in sessionStorage (never localStorage —
  // this holds a signature, and sessionStorage at least clears on tab
  // close) for the moment between "Continue with Google" and landing back
  // here signed in. Nothing sensitive like a private key ever exists to
  // store; a signature over a message that's already expired after
  // RECENCY_WINDOW_MS is only useful for finishing this exact link.
  useEffect(() => {
    if (pendingProof) {
      safeSessionStorageSet("elstand:pendingWalletProof", JSON.stringify(pendingProof));
    }
  }, [pendingProof]);

  const hasCheckedInitialProofRef = useRef(false);

  useEffect(() => {
    // This must only ever apply once, at mount — not as a reactive rule
    // that fires again on every later connect/disconnect transition. A
    // flaky disconnect-then-reconnect event while genuinely mid-flow (e.g.
    // during "awaiting-signature") must never let a stale stored proof
    // overwrite live state.
    if (hasCheckedInitialProofRef.current) return;
    hasCheckedInitialProofRef.current = true;

    // If the wallet is still connected (wagmi's cookie-persisted state
    // survived), the auto-verify effect below is about to run its own
    // fresh runVerification() for this address anyway — that produces a
    // new, unexpired signature, which is strictly better than whatever is
    // sitting in storage. Restoring the stale "verified-unlinked" state
    // here first would just get visibly overwritten a moment later when
    // the wallet suddenly prompts for a new signature out of nowhere.
    // Storage is only the authoritative source when there's no live
    // connection left to supersede it.
    if (isConnected) return;
    const raw = safeSessionStorageGet("elstand:pendingWalletProof");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PendingWalletProof;
      setPendingProof(parsed);
      setWalletStep("verified-unlinked");
    } catch {
      safeSessionStorageRemove("elstand:pendingWalletProof");
    }
  }, [isConnected]);

  const finishLinkAfterGoogle = useCallback(
    async (proof: PendingWalletProof) => {
      const myGeneration = ++verificationGenerationRef.current;
      const isCurrent = () => verificationGenerationRef.current === myGeneration;

      setWalletStep("verifying");
      try {
        const res = await fetch("/api/wallet/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: proof.address,
            chainId: proof.chainId,
            connectorName: proof.connectorName,
            message: proof.message,
            signature: proof.signature,
          }),
        }).then((r) => r.json());

        if (!isCurrent()) return;

        if (res.error) {
          setWalletError(res.error);
          setWalletStep("error");
          return;
        }
        safeSessionStorageRemove("elstand:pendingWalletProof");
        setPendingProof(null);
        setWalletStep("linked");
        router.replace(next);
      } catch {
        if (!isCurrent()) return;
        setWalletError("Couldn't finish linking the wallet — please retry from Settings once you're signed in.");
        setWalletStep("error");
      }
    },
    [router, next]
  );

  // If Google finished during this same tab session (no full redirect —
  // e.g. an already-open second tab that just got the session cookie), a
  // stored proof should be replayed immediately rather than waiting for the
  // person to notice a stale "Continue with Google to finish" card. The
  // ordinary post-redirect case is handled by app/auth/success/page.tsx
  // instead, since that's where the browser actually lands after a full
  // OAuth round-trip — this effect only covers the same-tab edge case.
  useEffect(() => {
    if (!pendingProof) return;
    try {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getSession().then(({ data }) => {
        if (data.session && walletStep === "verified-unlinked") {
          finishLinkAfterGoogle(pendingProof);
        }
      });
    } catch {
      // createSupabaseBrowserClient() throws if Supabase isn't configured —
      // nothing to do here since Google sign-in wouldn't work either in
      // that state; this effect is a same-tab convenience, not the only
      // path to finishing the link (the OAuth-redirect path through
      // app/auth/success/page.tsx doesn't depend on this effect at all).
    }
    // Only re-run when the proof itself changes — polling on every render
    // would spam getSession().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingProof]);

  // ---- Wallet ---------------------------------------------------------------

  const runVerification = useCallback(
    async (addr: string, cid: number) => {
      clearWalletTimeout();
      const myGeneration = ++verificationGenerationRef.current;
      const isCurrent = () => verificationGenerationRef.current === myGeneration;

      setWalletStep("awaiting-signature");
      setWalletError(null);

      timeoutRef.current = setTimeout(() => {
        if (!isCurrent()) return; // superseded or already settled — nothing to show
        setWalletError("The wallet didn't respond in time. Check it's unlocked, then try again.");
        setWalletStep("error");
      }, 60_000);

      let signature: string;
      let message: string;
      try {
        const nonce = generateNonce();
        const timestamp = new Date().toISOString();
        message = buildVerificationMessage({ address: addr, nonce, timestamp });
        signature = await signMessageAsync({ message });
      } catch (err) {
        clearWalletTimeout();
        if (!isCurrent()) return; // a newer attempt already took over the UI
        // wagmi/AppKit throws here for both an explicit user rejection and
        // some transport-level failures — the message text is the only
        // signal available to tell them apart, so this stays a best-effort
        // rather than a hard-coded error code check.
        const msg = err instanceof Error ? err.message : "";
        const rejected = /reject|denied|cancel/i.test(msg);
        setWalletError(rejected ? "Signature request was declined in the wallet." : msg || "Couldn't complete verification — please try again.");
        setWalletStep("error");
        return;
      }

      // The signature itself came back — the wallet did respond, so the
      // timeout no longer applies regardless of what happens next.
      clearWalletTimeout();
      if (!isCurrent()) return; // superseded while waiting on the wallet

      setWalletStep("verifying");
      try {
        const res = await fetch("/api/wallet/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, chainId: cid, connectorName: connector?.name, message, signature }),
        }).then((r) => r.json());

        if (!isCurrent()) return; // superseded while the request was in flight

        if (res.error) {
          setWalletError(res.error);
          setWalletStep("error");
          return;
        }

        if (res.linked) {
          setWalletStep("linked");
          router.replace(next);
          return;
        }

        // Verified, but no Google session existed yet — hold the proof and
        // let the person finish with Google. Nothing was written to
        // `wallets` on the server for this case.
        setPendingProof({ address: addr, chainId: cid, connectorName: connector?.name, message, signature });
        setWalletStep("verified-unlinked");
      } catch {
        if (!isCurrent()) return;
        setWalletError("Couldn't reach the server to verify — check your connection and try again.");
        setWalletStep("error");
      }
    },
    [connector, signMessageAsync, clearWalletTimeout, router, next]
  );

  // Auto-prompt the signature the moment a wallet connects, mirroring
  // Settings > Wallet's existing "connect → sign" continuous flow rather
  // than adding a separate manual step here.
  useEffect(() => {
    if (!isConnected || !address || !chainId) return;
    if (!isSupportedChain) {
      setWalletStep("wrong-network");
      return;
    }
    if (attemptedAddressRef.current === address) return;
    attemptedAddressRef.current = address;
    runVerification(address, chainId);
  }, [isConnected, address, chainId, isSupportedChain, runVerification]);

  function handleConnectWallet() {
    setWalletError(null);
    setWalletStep("connecting");
    open();
  }

  function handleDisconnectAndRetry() {
    verificationGenerationRef.current++; // invalidate any in-flight attempt
    clearWalletTimeout();
    attemptedAddressRef.current = null;
    setWalletError(null);
    setWalletStep("idle");
    setPendingProof(null);
    safeSessionStorageRemove("elstand:pendingWalletProof");
    disconnect();
  }

  const walletBusy = walletStep === "connecting" || walletStep === "awaiting-signature" || walletStep === "verifying";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg px-4 py-12">
      {/* Ambient backdrop — reuses the same grid + radial-glow language as globals.css's body background, just localized to this page since /login renders outside the dashboard shell. */}
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.4]" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, rgb(var(--signal-rgb)) 0%, transparent 70%)" }}
        aria-hidden
      />

      <Link href="/" className="relative z-10 mb-8 flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
        <span className="text-sm font-bold tracking-tight text-ink">ELSTAND</span>
      </Link>

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[400px]"
      >
        {/* Glass card — border + backdrop-blur + faint inner highlight, sitting on top of glow-card's existing shadow token rather than inventing a new shadow. */}
        <div
          className="relative overflow-hidden rounded-2xl border border-line/80 bg-bg-surface/70 p-7 shadow-card backdrop-blur-xl"
          style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 32px -12px rgba(0,0,0,0.7)" }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/50 to-transparent" />

          <h1 className="text-xl font-bold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Continue with Google or your wallet to reach your dashboard.</p>

          <div className="mt-6 space-y-2.5">
            {/* --- Google --- */}
            <button
              onClick={handleGoogleSignIn}
              disabled={googleLoading || walletBusy}
              className="group flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-bg-raised px-4 py-3 text-sm font-medium text-ink transition-all hover:border-ink-faint hover:bg-bg-raised/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {googleLoading ? <Loader2 size={16} className="animate-spin text-ink-muted" /> : <GoogleIcon />}
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            {/* --- Divider --- */}
            <div className="terminal-divider py-1 text-[11px] uppercase">
              <span className="eyebrow">Or</span>
            </div>

            {/* --- Wallet --- */}
            <WalletPanel
              step={walletStep}
              error={walletError}
              address={address}
              chainId={chainId}
              connectorName={connector?.name}
              disabledByGoogle={googleLoading}
              configured={isWalletConnectConfigured}
              onConnect={handleConnectWallet}
              onOpenNetworks={() => open({ view: "Networks" })}
              onRetry={handleDisconnectAndRetry}
            />
          </div>

          {googleError && (
            <p className="mt-4 rounded-lg border border-down/30 bg-down/5 px-3 py-2.5 text-xs text-down">{googleError}</p>
          )}

          <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-faint">
            By continuing, you agree to ELSTAND&rsquo;s{" "}
            <Link href="/terms" className="underline decoration-line underline-offset-2 hover:text-ink-muted">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy-policy" className="underline decoration-line underline-offset-2 hover:text-ink-muted">
              Privacy Policy
            </Link>
            . Wallet sign-in never requests a seed phrase or private key — only a message signature.
          </p>
        </div>
      </motion.div>

      <p className="relative z-10 mt-8 max-w-sm text-center text-[11px] leading-relaxed text-ink-faint">
        ELSTAND provides market analysis tools, not financial advice. Nothing here guarantees profit.
      </p>
    </main>
  );
}

// -----------------------------------------------------------------------------

function WalletPanel({
  step,
  error,
  address,
  chainId,
  connectorName,
  disabledByGoogle,
  configured,
  onConnect,
  onOpenNetworks,
  onRetry,
}: {
  step: WalletStep;
  error: string | null;
  address: string | undefined;
  chainId: number | undefined;
  connectorName: string | undefined;
  disabledByGoogle: boolean;
  configured: boolean;
  onConnect: () => void;
  onOpenNetworks: () => void;
  onRetry: () => void;
}) {
  if (!configured) {
    return (
      <div className="flex w-full items-center gap-2.5 rounded-xl border border-line/70 bg-bg-raised/40 px-4 py-3 text-xs text-ink-faint">
        <WalletIcon size={15} className="shrink-0" />
        Wallet sign-in isn&rsquo;t configured on this deployment yet.
      </div>
    );
  }

  const walletTypeLabel = WALLET_TYPE_LABEL[connectorNameToWalletType(connectorName)];

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {step === "idle" || step === "connecting" ? (
          <motion.button
            key="connect"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onConnect}
            disabled={disabledByGoogle || step === "connecting"}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-signal/40 bg-signal/10 px-4 py-3 text-sm font-medium text-signal-glow transition-all hover:border-signal/60 hover:bg-signal/[0.15] hover:shadow-glow-signal disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === "connecting" ? <Loader2 size={16} className="animate-spin" /> : <WalletIcon size={16} />}
            {step === "connecting" ? "Opening wallet…" : "Connect Wallet"}
          </motion.button>
        ) : step === "wrong-network" ? (
          <motion.div key="wrong-network" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-xs text-amber">
              <AlertTriangle size={15} className="shrink-0" />
              <span>
                {shortAddr(address ?? "")} is connected on an unsupported network{chainId ? ` (chain ${chainId})` : ""}. Switch to a
                supported chain to continue.
              </span>
            </div>
            <button
              onClick={onOpenNetworks}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-bg-raised px-4 py-2.5 text-xs font-medium text-ink hover:border-signal/40"
            >
              Switch network
            </button>
          </motion.div>
        ) : step === "awaiting-signature" || step === "verifying" ? (
          <motion.div
            key="signing"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full items-center gap-3 rounded-xl border border-signal/30 bg-signal/5 px-4 py-3 text-sm text-ink"
          >
            <Loader2 size={16} className="shrink-0 animate-spin text-signal-glow" />
            <span className="text-xs text-ink-muted">
              {step === "awaiting-signature"
                ? `Waiting for a signature in ${walletTypeLabel}…`
                : "Verifying signature…"}
            </span>
          </motion.div>
        ) : step === "verified-unlinked" ? (
          <motion.div key="verified-unlinked" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-up/30 bg-up/5 px-4 py-3 text-xs text-up">
              <ShieldCheck size={15} className="shrink-0" />
              <span>
                {shortAddr(address ?? "")} verified. Continue with Google above to finish connecting this wallet to your account.
              </span>
            </div>
            <button onClick={onRetry} className="w-full text-center text-[11px] text-ink-faint underline decoration-line underline-offset-2 hover:text-ink-muted">
              Wrong wallet? Connect a different one
            </button>
          </motion.div>
        ) : step === "linked" ? (
          <motion.div
            key="linked"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full items-center gap-2.5 rounded-xl border border-up/30 bg-up/5 px-4 py-3 text-xs text-up"
          >
            <CheckCircle2 size={15} className="shrink-0" />
            Wallet connected — taking you in <ArrowRight size={12} className="shrink-0" />
          </motion.div>
        ) : (
          <motion.div key="error" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-down/30 bg-down/5 px-4 py-3 text-xs text-down">
              <AlertTriangle size={15} className="mt-px shrink-0" />
              <span>{error ?? "Something went wrong."}</span>
            </div>
            <button
              onClick={onRetry}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-bg-raised px-4 py-2.5 text-xs font-medium text-ink hover:border-signal/40"
            >
              <WalletIcon size={13} /> Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-faint">{SUPPORTED_WALLET_HINT}</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.89c2.28-2.1 3.56-5.2 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.89-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1C3.26 21.3 7.31 24 12 24Z"
      />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a11.98 11.98 0 0 0 0 10.78l4.01-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}

// useSearchParams() inside LoginPageContent forces this route out of the
// static-prerender path unless wrapped in Suspense — same fix as
// app/auth/success/page.tsx. The fallback intentionally mirrors the same
// dark background so there's no flash of unstyled content while the
// client bundle for the real content hydrates.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-bg">
          <Loader2 size={20} className="animate-spin text-ink-faint" />
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
