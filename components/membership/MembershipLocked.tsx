import Link from "next/link";
import { Lock, Crown } from "lucide-react";

/**
 * Shown server-side in place of ELVOID PRO / ELSTAND PREMIUM content when
 * lib/membership.ts's getMembershipStatus() says the request isn't
 * entitled. Purely presentational — the actual gate is the page never
 * rendering the real dashboard tree, not this component hiding it.
 */
export function MembershipLocked({
  title,
  description,
  reason,
}: {
  title: string;
  description: string;
  /** Why access is denied, so expired members see a different message than never-purchased ones. */
  reason: "signed_out" | "no_membership" | "expired";
}) {
  const reasonText =
    reason === "expired"
      ? "Your ELVOID PRO membership has expired. Renew in Wallet to restore access."
      : reason === "signed_out"
        ? "Sign in and connect a verified wallet to check your membership."
        : description;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-amber/25 bg-bg-surface/60 p-8 text-center shadow-[0_0_40px_-12px_rgba(245,166,35,0.25)] backdrop-blur">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,166,35,0.12),transparent_60%)]"
        />
        <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber/30 bg-amber/10">
          <Lock size={22} className="text-amber" />
        </div>

        <p className="relative mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
          <Crown size={14} className="text-amber" />
          {title}
        </p>

        <p className="relative mt-3 text-sm text-ink-muted">{reasonText}</p>

        <Link
          href="/wallet"
          className="relative mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-amber/40 bg-amber/10 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber transition-colors hover:bg-amber/20 active:bg-amber/25"
        >
          Buy Premium in Wallet
        </Link>
      </div>
    </div>
  );
}
