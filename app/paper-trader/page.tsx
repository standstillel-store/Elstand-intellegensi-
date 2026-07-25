import { AppShell } from "@/components/AppShell";
import { PaperTraderView } from "@/components/paper-trader/PaperTraderView";

export const metadata = {
  title: "Paper Trader | ELSTAND INTELLIGENCE",
};

export default function PaperTraderPage() {
  return (
    <AppShell title="ElVoid AI Paper Trader" subtitle="Simulasi trading berbasis sinyal AI — tanpa dana nyata, tanpa koneksi exchange.">
      <PaperTraderView />
    </AppShell>
  );
}
