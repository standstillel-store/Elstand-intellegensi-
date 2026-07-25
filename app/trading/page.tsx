import { AppShell } from "@/components/AppShell";
import { TradingDashboardView } from "@/components/trading/TradingDashboardView";

export const metadata = {
  title: "Live Trading | ELSTAND INTELLIGENCE",
};

export default function TradingPage() {
  return (
    <AppShell title="ElVoid AI Live Trading" subtitle="Binance Spot/Futures Testnet — order sungguhan, dana Testnet. Ganti ke Live Mode lewat BINANCE_MODE hanya jika sudah siap.">
      <TradingDashboardView />
    </AppShell>
  );
}
