import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CircleUser } from "lucide-react";
import { AlertsBell } from "@/components/alerts/AlertsBell";

// Phase 9 — Settings is appearance-only now (a single section), so the
// scroll-spy left nav (SettingsNav) and its mobile pill-tab twin
// (SettingsMobileTabs) — both built for jumping between what used to be 8
// sections — no longer have a reason to exist and were removed. The
// header/back-to-Dashboard chrome below is unchanged: it's the actual
// "existing dashboard navigation entry" the brief said to keep, not the
// removed section nav.
export function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:pt-14">
      {/* Settings-only top bar — replaces TopNav's search/ticker with a breadcrumb back to Dashboard */}
      <header className="fixed inset-x-0 top-0 z-40 hidden h-14 border-b border-line bg-bg/95 backdrop-blur lg:flex">
        <div className="flex w-full items-center gap-3 px-5">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 text-ink-muted hover:text-ink" aria-label="Kembali ke Dashboard">
            <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
            <span className="text-sm font-bold tracking-tight text-ink">ELSTAND</span>
          </Link>
          <span className="text-ink-faint">/</span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            Settings
          </span>
          <span className="hidden text-xs text-ink-faint sm:inline">Appearance</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AlertsBell />
            <Link href="/dashboard" className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted hover:border-signal/40 hover:text-ink">
              <ArrowLeft size={13} /> Dashboard
            </Link>
            <span className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-ink-muted">
              <CircleUser size={16} />
            </span>
          </div>
        </div>
      </header>

      <div>
        {/* Mobile Settings header — ☰ acts as "back to Dashboard" (no global drawer here), title reads "Settings" */}
        <div className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Link
              href="/dashboard"
              aria-label="Tutup Settings, kembali ke Dashboard"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-bg-raised hover:text-ink"
            >
              <ArrowLeft size={18} />
            </Link>
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-signal animate-pulseGlow" />
              <span className="truncate text-sm font-bold tracking-tight">Settings</span>
            </Link>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <AlertsBell />
              <CircleUser size={18} className="text-ink-faint" />
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-3xl px-4 py-5 lg:px-8 lg:py-8">
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
