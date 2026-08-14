import { AppShell } from "@/components/AppShell";
import { WalletView } from "@/components/wallet/WalletView";

export const metadata = {
  title: "Wallet | ELSTAND INTELLIGENCE",
};

export default function WalletPage() {
  return (
    <AppShell title="Wallet" subtitle="Manage your assets, swap tokens, and track your transactions.">
      <WalletView />
    </AppShell>
  );
}
