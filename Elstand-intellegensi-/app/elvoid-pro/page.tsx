import { AppShell } from "@/components/AppShell";
import { TerminalShell } from "@/components/elvoid-pro/TerminalShell";

export const metadata = {
  title: "ELVOID PRO — Terminal | ELSTAND INTEL",
};

export default function ElvoidProPage() {
  return (
    <AppShell title="ELVOID PRO" subtitle="Professional crypto market terminal" fullBleed>
      <TerminalShell />
    </AppShell>
  );
}
