import { AppShell } from "@/components/AppShell";
import { TerminalShell } from "@/components/elvoid-pro/TerminalShell";
import { MembershipLocked } from "@/components/membership/MembershipLocked";
import { getMembershipStatus } from "@/lib/membership";

export const metadata = {
  title: "ELVOID PRO — Terminal | ELSTAND INTEL",
};

// Server-rendered gate — the terminal tree below only mounts when the
// request itself carries an active membership. A logged-out or
// non-member request never gets TerminalShell (and therefore never gets
// the Binance/Oracle data it fetches) in the first place.
export const dynamic = "force-dynamic";

export default async function ElvoidProPage() {
  const status = await getMembershipStatus();

  if (!status.active) {
    return (
      <AppShell title="ELVOID PRO" subtitle="Professional crypto market terminal">
        <MembershipLocked
          title="ELVOID PRO Locked"
          description="Access requires an active ELVOID PRO membership."
          reason={!status.signedIn ? "signed_out" : status.expiresAt ? "expired" : "no_membership"}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="ELVOID PRO" subtitle="Professional crypto market terminal" fullBleed>
      <TerminalShell />
    </AppShell>
  );
}
