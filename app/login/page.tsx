"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/auth/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in isn't configured yet.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <Link href="/" className="mb-10 flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
        <span className="text-sm font-bold tracking-tight text-ink">ElStand AI</span>
      </Link>

      <div className="w-full max-w-sm rounded-xl border border-line bg-bg-surface p-8 shadow-card">
        <h1 className="text-xl font-bold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Continue with Google to reach your dashboard.</p>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-line bg-bg-raised px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-signal/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        {error && (
          <p className="mt-3 rounded-md border border-down/30 bg-down/5 px-3 py-2 text-xs text-down">{error}</p>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-faint">
          By continuing, you agree to ElStand AI&rsquo;s{" "}
          <Link href="/terms" className="underline decoration-line underline-offset-2 hover:text-ink-muted">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy-policy" className="underline decoration-line underline-offset-2 hover:text-ink-muted">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <p className="mt-8 max-w-sm text-center text-[11px] leading-relaxed text-ink-faint">
        ElStand AI provides market analysis tools, not financial advice. Nothing here guarantees profit.
      </p>
    </main>
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
