import { CircleUser } from "lucide-react";
import { SettingsCard, SettingsRow } from "../SettingsCard";
import type { AppUser, AppProfile } from "@/lib/auth/profile";

// AccountSection renders inside SettingsView, which is a Client Component —
// so this runs on both the server's SSR pass AND the client's hydration
// pass. toLocaleDateString()/toLocaleString() without an explicit timeZone
// default to the HOST machine's local timezone, which differs between a
// server (often UTC) and a browser (the user's local zone) — a classic
// Next.js hydration-mismatch source. Pinning timeZone: "UTC" explicitly on
// both calls makes the output byte-identical in both environments.
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function AccountSection({ account, profile }: { account: AppUser | null; profile: AppProfile | null }) {
  if (!account) {
    return (
      <SettingsCard id="account" icon={CircleUser} title="Account" description="Profil akun ELSTAND kamu.">
        <p className="text-xs text-ink-faint">
          Sign in dengan Google untuk melihat profil akun — lihat{" "}
          <a href="/login" className="underline decoration-line underline-offset-2 hover:text-ink-muted">
            halaman login
          </a>
          .
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard id="account" icon={CircleUser} title="Account" description="Profil akun ELSTAND kamu — disinkron dari Google saat login.">
      <div className="flex items-center gap-3 border-b border-line pb-4">
        {profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Google avatar URL, not worth next/image's domain allowlist config for one small round avatar
          <img src={profile.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border border-line" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-bg-raised text-ink-faint">
            <CircleUser size={22} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{profile?.username || "Trader"}</p>
          <p className="truncate text-xs text-ink-faint">{account.email}</p>
        </div>
      </div>

      <SettingsRow label="Member since" hint="Tanggal akun ini pertama kali dibuat.">
        <span className="mono-num text-xs text-ink-muted">{formatDate(account.createdAt)}</span>
      </SettingsRow>
      <SettingsRow label="Last login" hint="Login terakhir via Google.">
        <span className="mono-num text-xs text-ink-muted">{formatDateTime(account.lastLoginAt)}</span>
      </SettingsRow>
    </SettingsCard>
  );
}
