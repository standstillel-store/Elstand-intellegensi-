"use client";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

/**
 * Small "AI Energy" pill for the Dashboard ("widget kecil" per the brief).
 * Same visual treatment as the balance pill already used in Settings' AI
 * Energy card and the Profile Dropdown's AI Energy row — reusing the app's
 * existing style rather than inventing a new one.
 *
 * Deliberately its own tiny, self-fetching component (not threaded through
 * dashboard/page.tsx's props/data flow) so dropping it in is a one-line,
 * additive change that can't disturb that page's existing layout or its
 * unified data-computation pattern — see the brief's "Jangan mengubah
 * Dashboard Layout".
 */
export function AiEnergyWidget() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-energy")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.balance === "number") setBalance(data.balance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Not signed in, Supabase not configured, or still loading — stay
  // invisible rather than show a placeholder/zero that isn't real yet.
  if (balance === null) return null;

  return (
    <span className="flex items-center gap-1.5 rounded-md border border-signal/30 bg-signal/10 px-2.5 py-1 text-xs font-semibold text-signal-glow">
      <Zap size={12} />
      AI Energy {balance}
    </span>
  );
}
