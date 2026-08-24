"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 section 3 — admin login UI.
//
// The password field is a normal controlled input held only in component
// state for the duration of the submit — never written to localStorage,
// sessionStorage, or any client-side cache, and never logged. It's sent
// once, over POST, to the private route handler (app/[adminEntry]/login).
// Authentication itself (verifying the password against
// ADMIN_PASSWORD_HASH) happens entirely server-side.
// ---------------------------------------------------------------------------

export function AdminLoginForm({ adminEntry }: { adminEntry: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/${adminEntry}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => null);
        const seconds = typeof body?.retryAfterSeconds === "number" ? body.retryAfterSeconds : null;
        setError(seconds ? `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).` : "Too many attempts. Try again later.");
        return;
      }
      if (!res.ok) {
        setError("Invalid password.");
        return;
      }
      setPassword("");
      router.replace(`/${adminEntry}/dashboard`);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-bg-surface p-8">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Elstand</p>
          <h1 className="mt-1 text-lg font-semibold text-white">Admin Control Center</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-password" className="mb-1.5 block text-xs font-medium text-white/60">
              Admin Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg-raised px-3 py-2.5 text-sm text-white outline-none focus:border-gold/60"
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-xs text-down">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || password.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Authenticate
          </button>
        </form>
      </div>
    </main>
  );
}
