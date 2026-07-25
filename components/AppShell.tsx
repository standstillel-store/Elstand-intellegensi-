import type { ReactNode } from "react";
import Link from "next/link";
import { CircleUser } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./layout/TopNav";
import { NavDrawer } from "./mobile/NavDrawer";
import { Footer } from "./Footer";
import { AIChatDock } from "./AIChatDock";
import { AlertsBell } from "./alerts/AlertsBell";

export function AppShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen lg:flex lg:pt-14">
      <TopNav />
      <Sidebar />

      <div className="flex-1 lg:pl-60">
        {/* Mobile header — ☰ / ELSTAND INTEL (→ Dashboard) / Notification / Profile */}
        <div className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <NavDrawer />
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-signal animate-pulseGlow" />
              <span className="truncate text-sm font-bold tracking-tight">ELSTAND INTEL</span>
            </Link>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <AlertsBell />
              <Link
                href="/settings"
                aria-label="Profile & settings"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-bg-raised hover:text-ink"
              >
                <CircleUser size={18} />
              </Link>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
            <span className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-faint">{title}</span>
          </div>
        </div>

        {/* Desktop header */}
        <div className="sticky top-14 z-20 hidden border-b border-line bg-bg/90 px-6 py-4 backdrop-blur lg:block">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            </div>
            {right}
          </div>
        </div>

        <main className="mx-auto max-w-6xl px-4 py-5 lg:px-6 lg:py-6">
          <div className="space-y-5">{children}</div>
        </main>

        <Footer />
      </div>

      <AIChatDock />
    </div>
  );
}
