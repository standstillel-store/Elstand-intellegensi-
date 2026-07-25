import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CircleUser } from "lucide-react";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import { SettingsNav } from "./SettingsNav";
import { SettingsMobileTabs } from "./SettingsMobileTabs";

export function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:flex lg:pt-14">
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
          <span className="hidden text-xs text-ink-faint sm:inline">Dashboard Control Center</span>
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

      {/* Settings-only left nav — NOT the global Sidebar */}
      <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-60 flex-col border-r border-line bg-bg-surface/60 lg:top-14 lg:flex">
        <div className="border-b border-line px-5 py-4">
          <p className="eyebrow text-[9px] tracking-[0.18em] text-ink-faint">Control Center</p>
          <span className="text-base font-bold tracking-tight">Settings</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SettingsNav />
        </div>
        <div className="border-t border-line p-3">
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-ink-faint hover:text-ink-muted">
            <ArrowLeft size={14} />
            Kembali ke Dashboard
          </Link>
        </div>
      </aside>

      <div className="flex-1 lg:pl-60">
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
          <SettingsMobileTabs />
        </div>

        <main className="mx-auto max-w-3xl px-4 py-5 lg:px-8 lg:py-8">
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
