import { AppearanceSection } from "./sections/AppearanceSection";

// Phase 9 — was previously the orchestrator for 9 sections (General,
// Appearance, AI Engine, Paper Trading, API Integration, Security,
// Advanced, Danger Zone) and owned Paper Trader wallet state (risk %,
// save, reset) plus an /api/settings/status fetch for the API Integration
// section. All of that was removed along with the sections that used it —
// Settings is appearance-only now, so this component no longer needs to be
// a client component or hold any state at all.
export function SettingsView() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow text-[10px] uppercase tracking-[0.18em] text-signal-glow">Control Center</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Tema dan tampilan dashboard ElStand AI.</p>
      </div>

      <AppearanceSection />
    </div>
  );
}
