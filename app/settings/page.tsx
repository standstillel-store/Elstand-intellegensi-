import { SettingsView } from "@/components/settings/SettingsView";

export const metadata = {
  title: "Settings | ELSTAND INTELLIGENCE",
};

// Phase 9 — used to fetch the Paper Trader wallet here (getWallet/
// getDefaultWallet from lib/elvoid/paperTrader) just to hand it down to the
// now-removed Paper Trading / Advanced / Danger Zone sections. Settings is
// appearance-only now, so this page has no data to fetch and no reason to
// import from lib/elvoid/* at all — a smaller ELVOID surface for Settings
// to depend on, not a bigger one.
export default function SettingsPage() {
  return <SettingsView />;
}
