import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./layout/TopNav";
import { ProfileMenu } from "./layout/ProfileMenu";
import { NavDrawer } from "./mobile/NavDrawer";
import { BottomNav } from "./mobile/BottomNav";
import { Footer } from "./Footer";
import { AIChatDock } from "./AIChatDock";
import { AlertsBell } from "./alerts/AlertsBell";

export function AppShell({
  title,
  subtitle,
  right,
  children,
  fullBleed = false,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  /** ELVOID PRO terminal needs the whole content column (chart + right rail),
   * not the max-w-6xl centered reading width every other page uses. Only
   * affects the <main> wrapper below — Sidebar/TopNav/mobile header are
   * untouched so global nav stays identical everywhere. */
  fullBleed?: boolean;
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
              <ProfileMenu />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
            <span className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-faint">{title}</span>
          </div>
        </div>

        {/* Desktop header */}
        <div className="sticky top-14 z-20 hidden border-b border-line bg-bg/90 px-6 py-4 backdrop-blur lg:block">
          <div className={clsx("flex items-center justify-between gap-4", !fullBleed && "mx-auto max-w-6xl")}>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            </div>
            {right}
          </div>
        </div>

        <main
          className={clsx(
            "pb-20 lg:pb-0", // clear the fixed BottomNav on mobile
            fullBleed ? "px-3 py-4 lg:px-4 lg:py-4" : "mx-auto max-w-6xl px-4 py-5 lg:px-6 lg:py-6"
          )}
        >
          <div className={fullBleed ? "space-y-3" : "space-y-5"}>{children}</div>
        </main>

        <div className="hidden lg:block">
          <Footer />
        </div>
      </div>

      <BottomNav />
      <AIChatDock />
    </div>
  );
}
