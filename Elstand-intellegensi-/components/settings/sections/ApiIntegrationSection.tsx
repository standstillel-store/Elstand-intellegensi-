"use client";
import { Plug, Check, X, HelpCircle } from "lucide-react";
import { BinanceCredentialsPanel } from "../BinanceCredentialsPanel";
import { SettingsCard } from "../SettingsCard";

interface Status {
  supabase: boolean;
  alchemy: boolean;
  newsapi: boolean;
  fred: boolean;
}

export function ApiIntegrationSection({ status }: { status: Status | null }) {
  const rows: { key: keyof Status | "defillama" | "twelvedata"; label: string }[] = [
    { key: "alchemy", label: "Alchemy — whale feed" },
    { key: "newsapi", label: "NewsAPI — news feed" },
    { key: "fred", label: "FRED — DXY proxy & M2 money supply" },
    { key: "twelvedata", label: "TwelveData — DXY & Gold sparkline" },
    { key: "defillama", label: "DefiLlama — stablecoin supply" },
    { key: "supabase", label: "Supabase — persistensi Paper Trader & AI Journal" },
  ];

  return (
    <SettingsCard
      id="api-integration"
      icon={Plug}
      title="API Integration"
      description="Status koneksi sumber data — tidak menampilkan key apapun."
    >
      <div className="space-y-2">
        {rows.map((row) => {
          if (row.key === "defillama") {
            return (
              <div key={row.key} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">
                <span>{row.label}</span>
                <span className="flex items-center gap-1 text-xs text-up">
                  <Check size={13} /> Tidak perlu API key
                </span>
              </div>
            );
          }
          if (row.key === "twelvedata") {
            return (
              <div key={row.key} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">
                <span>{row.label}</span>
                <span className="flex items-center gap-1 text-xs text-ink-faint" title="Health-check untuk TwelveData belum dipasang — perlu penambahan kecil di API status route.">
                  <HelpCircle size={13} /> Belum dimonitor
                </span>
              </div>
            );
          }
          const ok = status ? status[row.key] : undefined;
          return (
            <div key={row.key} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">
              <span>{row.label}</span>
              {ok === undefined ? (
                <span className="text-xs text-ink-faint">Memeriksa…</span>
              ) : ok ? (
                <span className="flex items-center gap-1 text-xs text-up">
                  <Check size={13} /> Terhubung
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-ink-faint">
                  <X size={13} /> Belum diset
                </span>
              )}
            </div>
          );
        })}
      </div>

      {status && !status.supabase && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Tambahkan <code className="rounded bg-bg-raised px-1 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
          <code className="rounded bg-bg-raised px-1 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code> di .env.local, lalu jalankan{" "}
          <code className="rounded bg-bg-raised px-1 py-0.5">supabase/schema.sql</code> di Supabase SQL editor.
        </p>
      )}
      {status && !status.fred && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Kartu DXY dan M2 di dashboard butuh <code className="rounded bg-bg-raised px-1 py-0.5">FRED_API_KEY</code> gratis dari
          fred.stlouisfed.org.
        </p>
      )}

      <div className="border-t border-line pt-4">
        <BinanceCredentialsPanel />
      </div>
    </SettingsCard>
  );
}
