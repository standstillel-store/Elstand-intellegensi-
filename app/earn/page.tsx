import { AppShell } from "@/components/AppShell";
import { EarnView } from "@/components/earn/EarnView";

export const metadata = {
  title: "Earn | ELSTAND INTELLIGENCE",
};

export default function EarnPage() {
  return (
    <AppShell title="Earn" subtitle="Klaim AI Energy harian dan lihat riwayat reward kamu.">
      <EarnView />
    </AppShell>
  );
}
