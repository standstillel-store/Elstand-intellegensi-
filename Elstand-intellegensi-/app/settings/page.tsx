import { SettingsView } from "@/components/settings/SettingsView";
import { getWallet, getDefaultWallet } from "@/lib/elvoid/paperTrader";

export const metadata = {
  title: "Settings | ELSTAND INTELLIGENCE",
};

export default async function SettingsPage() {
  const wallet = (await getWallet()) ?? getDefaultWallet();
  return <SettingsView initialWallet={wallet} />;
}
