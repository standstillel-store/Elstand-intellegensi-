"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Gift, WalletMinimal, User } from "lucide-react";
import clsx from "clsx";

// Mobile-only bottom tab bar — Dashboard / Earn / Wallet / Profile, per the
// ELSTAND INTEL mobile reference. Purely a navigation shell: no data of its
// own. Rendered from AppShell (lg:hidden), fixed to the viewport bottom with
// safe-area padding for iOS home-indicator devices. `main` in AppShell needs
// bottom padding on mobile so content never sits underneath this bar.
const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/earn", label: "Earn", icon: Gift },
  { href: "/wallet", label: "Wallet", icon: WalletMinimal },
  { href: "/settings", label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                active ? "text-signal-glow" : "text-ink-faint hover:text-ink-muted"
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
