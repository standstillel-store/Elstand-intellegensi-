import { AppShell } from "@/components/AppShell";
import { ElstandDexView } from "@/components/earn/ElstandDexView";

export const metadata = {
  title: "Elstand DEX | ELSTAND INTELLIGENCE",
};

export default function ElstandDexPage() {
  return (
    <AppShell title="Elstand DEX" subtitle="Buy ELS Testnet — BNB Smart Chain Testnet.">
      <ElstandDexView />
    </AppShell>
  );
}
