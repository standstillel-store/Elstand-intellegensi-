"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Bug, Gift, Users, ScrollText, LogOut, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 section 6 — Admin Dashboard shell.
//
// Bug Hunter / Rewards / Users are intentionally rendered as disabled,
// non-navigable items (no page.tsx exists for them yet — that's Phase
// 6.6.1+) rather than linking to a placeholder route, so this phase adds
// exactly the pages the spec asks for and nothing more.
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "dashboard" as const, comingSoon: false },
  { key: "bug-hunter", label: "Bug Hunter", icon: Bug, href: null, comingSoon: true },
  { key: "rewards", label: "Rewards", icon: Gift, href: null, comingSoon: true },
  { key: "users", label: "Users", icon: Users, href: null, comingSoon: true },
  { key: "logs", label: "System Logs", icon: ScrollText, href: "logs" as const, comingSoon: false },
];

export function AdminDashboardShell({ adminEntry, active, children }: { adminEntry: string; active: "dashboard" | "logs"; children: ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch(`/${adminEntry}/logout`, { method: "POST" });
    } finally {
      router.replace(`/${adminEntry}`);
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Elstand Intelligence</p>
        <h1 className="text-base font-semibold text-white">Admin Control Center</h1>
      </header>

      <div className="flex flex-col md:flex-row">
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-line p-3 md:w-56 md:flex-col md:border-b-0 md:border-r md:p-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === active;
            if (!item.href) {
              return (
                <div key={item.key} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/30">
                  <Icon className="h-4 w-4" />
                  <span className="whitespace-nowrap">{item.label}</span>
                  <span className="ml-auto whitespace-nowrap rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium text-white/30">SOON</span>
                </div>
              );
            }
            return (
              <Link
                key={item.key}
                href={`/${adminEntry}/${item.href}`}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-gold/10 text-gold" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="mt-0 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-down/80 transition hover:bg-down/10 hover:text-down md:mt-auto"
          >
            {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            <span className="whitespace-nowrap">Logout</span>
          </button>
        </nav>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
