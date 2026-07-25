import { getSupabase } from "../supabase";
import { getBinanceConfig, type BinanceConfig } from "./config";
import { encryptSecret, decryptSecret, isEncryptionConfigured, maskKey, type EncryptedPayload } from "./crypto";

// ---------------------------------------------------------------------------
// Two ways to configure Binance credentials, in priority order:
//   1. Database (bn_credentials, singleton row id=1) — API key/secret
//      encrypted at rest with AES-256-GCM (crypto.ts), only decrypted
//      server-side, immediately before a signed Binance call. Lets the
//      Settings UI manage keys without a redeploy. Requires ENCRYPTION_KEY.
//   2. Environment variables (BINANCE_API_KEY / BINANCE_SECRET_KEY) — the
//      default, zero-setup path. Always available, never touches a
//      database, and is what most self-hosted deployments should use.
// The DB row, if present and decryptable, wins — this lets a user rotate
// keys from the UI without redeploying. Falling back to env vars on any DB
// or decryption error keeps the app tradeable even if Supabase is down.
// ---------------------------------------------------------------------------

interface CredentialsRow {
  id: number;
  api_key_encrypted: EncryptedPayload;
  secret_key_encrypted: EncryptedPayload;
  updated_at: string;
}

export interface CredentialsStatus {
  source: "database" | "env" | "none";
  configured: boolean;
  maskedApiKey: string | null;
  mode: BinanceConfig["mode"];
  market: BinanceConfig["market"];
  encryptionAvailable: boolean;
}

async function loadDbCredentials(): Promise<{ apiKey: string; secretKey: string } | null> {
  if (!isEncryptionConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("bn_credentials").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  const row = data as CredentialsRow;
  try {
    const apiKey = decryptSecret(row.api_key_encrypted);
    const secretKey = decryptSecret(row.secret_key_encrypted);
    if (!apiKey || !secretKey) return null;
    return { apiKey, secretKey };
  } catch (err) {
    console.error("[ElVoid AI][Binance] Gagal mendekripsi kredensial tersimpan — fallback ke env var.", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Resolves the active Binance config, preferring DB-stored (encrypted) credentials over env vars when available. Never logs or returns the raw secret. */
export async function resolveBinanceConfig(): Promise<BinanceConfig> {
  const dbCreds = await loadDbCredentials();
  if (dbCreds) return getBinanceConfig(dbCreds);
  return getBinanceConfig();
}

export async function getCredentialsStatus(): Promise<CredentialsStatus> {
  const dbCreds = await loadDbCredentials();
  const base = getBinanceConfig(dbCreds ?? undefined);
  return {
    source: dbCreds ? "database" : base.configured ? "env" : "none",
    configured: base.configured,
    maskedApiKey: base.apiKey ? maskKey(base.apiKey) : null,
    mode: base.mode,
    market: base.market,
    encryptionAvailable: isEncryptionConfigured(),
  };
}

export async function saveCredentials(apiKey: string, secretKey: string): Promise<{ ok: true } | { error: string }> {
  if (!isEncryptionConfigured()) {
    return { error: "ENCRYPTION_KEY belum diset di environment — tidak bisa menyimpan API key dengan aman. Gunakan .env.local (BINANCE_API_KEY/BINANCE_SECRET_KEY) sebagai gantinya." };
  }
  const sb = getSupabase();
  if (!sb) return { error: "Supabase belum dikonfigurasi." };
  if (!apiKey.trim() || !secretKey.trim()) return { error: "API key dan secret key wajib diisi." };

  const api_key_encrypted = encryptSecret(apiKey.trim());
  const secret_key_encrypted = encryptSecret(secretKey.trim());
  const { error } = await sb
    .from("bn_credentials")
    .upsert({ id: 1, api_key_encrypted, secret_key_encrypted, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function clearCredentials(): Promise<{ ok: true } | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase belum dikonfigurasi." };
  const { error } = await sb.from("bn_credentials").delete().eq("id", 1);
  if (error) return { error: error.message };
  return { ok: true };
}
