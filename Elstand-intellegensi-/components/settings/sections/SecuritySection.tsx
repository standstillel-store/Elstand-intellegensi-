"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Monitor, LogOut, Loader2 } from "lucide-react";
import { SettingsCard, SettingsRow } from "../SettingsCard";

function parseDevice(ua: string): string {
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return `${browser} · ${os}${isMobile ? " · Mobile" : ""}`;
}

export function SecuritySection() {
  const router = useRouter();
  const [device, setDevice] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDevice(parseDevice(navigator.userAgent));
  }, []);

  async function handleLogoutAll() {
    setLoggingOut(true);
    setError(null);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/auth/client");
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut({ scope: "global" });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth belum dikonfigurasi.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <SettingsCard id="security" icon={ShieldCheck} title="Security" description="Sesi aktif dan kontrol logout.">
      <SettingsRow label="Session" hint="Perangkat yang sedang membuka dashboard ini sekarang.">
        <span className="flex items-center gap-1.5 rounded-md border border-up/30 bg-up/10 px-2.5 py-1 text-xs text-up">
          <Monitor size={12} /> Aktif
        </span>
      </SettingsRow>

      <SettingsRow label="Login Device" hint="Riwayat multi-device belum dilacak — hanya perangkat ini yang tampil untuk sekarang.">
        <span className="mono-num text-xs text-ink-muted">{device ?? "…"}</span>
      </SettingsRow>

      <SettingsRow label="Logout All" hint="Mengakhiri seluruh sesi login (semua device) via Supabase Auth.">
        <button
          onClick={handleLogoutAll}
          disabled={loggingOut}
          className="flex items-center gap-1.5 rounded-md border border-down/40 px-3.5 py-2 text-xs font-medium text-down hover:bg-down/10 disabled:opacity-50"
        >
          {loggingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
          {loggingOut ? "Memproses…" : "Logout All Devices"}
        </button>
      </SettingsRow>
      {error && <p className="text-[11px] text-ink-faint">{error}</p>}
    </SettingsCard>
  );
}
