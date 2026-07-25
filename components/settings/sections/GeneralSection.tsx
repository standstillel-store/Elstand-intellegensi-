"use client";
import { SlidersHorizontal, Globe2 } from "lucide-react";
import { usePreferences } from "@/lib/hooks/usePreferences";
import { SettingsCard, SettingsRow, SegmentedControl } from "../SettingsCard";

const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "UTC",
  "America/New_York",
  "Europe/London",
];

export function GeneralSection() {
  const { prefs, update, hydrated } = usePreferences();

  return (
    <SettingsCard
      id="general"
      icon={SlidersHorizontal}
      title="General"
      description="Preferensi tampilan dasar — tersimpan di browser ini."
    >
      <SettingsRow label="Language" hint="Bahasa antarmuka ElStand AI.">
        <SegmentedControl
          value={prefs.general.language}
          options={[
            { value: "id", label: "Indonesia" },
            { value: "en", label: "English" },
          ]}
          onChange={(language: "id" | "en") => update((p) => ({ ...p, general: { ...p.general, language } }))}
        />
      </SettingsRow>

      <SettingsRow label="Timezone" hint="Dipakai untuk countdown Economic Calendar & timestamp.">
        <div className="relative">
          <Globe2 size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <select
            value={prefs.general.timezone}
            onChange={(e) => update((p) => ({ ...p, general: { ...p.general, timezone: e.target.value } }))}
            className="rounded-md border border-line bg-bg py-1.5 pl-8 pr-3 text-xs text-ink outline-none focus:border-signal/50"
          >
            {[...new Set([prefs.general.timezone, ...TIMEZONES])].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </SettingsRow>

      <SettingsRow label="Currency" hint="Format tampilan nilai di Paper Trader & signal card.">
        <SegmentedControl
          value={prefs.general.currency}
          options={[
            { value: "USD", label: "USD" },
            { value: "IDR", label: "IDR" },
            { value: "EUR", label: "EUR" },
          ]}
          onChange={(currency: "USD" | "IDR" | "EUR") => update((p) => ({ ...p, general: { ...p.general, currency } }))}
        />
      </SettingsRow>

      {hydrated && prefs.general.currency !== "USD" && (
        <p className="rounded-md border border-amber/20 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed text-amber">
          Semua sinyal &amp; API market dihitung dalam USD. Memilih {prefs.general.currency} menyimpan preferensi tampilanmu,
          tapi konversi nilai di seluruh halaman belum dipasang di ronde ini.
        </p>
      )}
    </SettingsCard>
  );
}
