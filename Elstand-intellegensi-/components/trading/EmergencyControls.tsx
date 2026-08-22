"use client";
import { useState } from "react";
import { AlertTriangle, Power } from "lucide-react";

export function EmergencyControls({
  emergencyStopped,
  onCloseAll,
  onSetEmergencyStop,
}: {
  emergencyStopped: boolean;
  onCloseAll: (reason: string) => Promise<boolean>;
  onSetEmergencyStop: (stopped: boolean, reason?: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleCloseAll() {
    setBusy(true);
    const ok = await onCloseAll("Emergency Close All Positions — manual trigger dari dashboard");
    setResult(ok ? "Semua posisi ditutup. Auto Trading dijeda (Emergency Stop aktif)." : "Gagal — cek pesan error di atas.");
    setBusy(false);
    setConfirming(false);
  }

  async function handleClearStop() {
    setBusy(true);
    await onSetEmergencyStop(false);
    setResult("Emergency Stop dinonaktifkan — entry baru diizinkan lagi.");
    setBusy(false);
  }

  return (
    <div className="glow-card border-down/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-down" />
        <h2 className="text-sm font-semibold text-down">Emergency Controls</h2>
      </div>

      {emergencyStopped && (
        <div className="mb-3 rounded-md border border-down/40 bg-down/10 p-2.5 text-xs text-down">
          🛑 Emergency Stop aktif — AI Auto Trading tidak akan membuka posisi baru sampai dinonaktifkan.
        </div>
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-down/50 bg-down/10 py-2.5 text-sm font-bold text-down hover:bg-down/20"
        >
          <Power size={15} /> Emergency Close All Positions
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">
            Ini akan menutup <strong className="text-ink">SEMUA posisi terbuka</strong> di market dan membatalkan semua order tertunda. Auto Trading akan dijeda. Yakin?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirming(false)} className="rounded-md border border-line py-2 text-xs text-ink-muted hover:text-ink">
              Batal
            </button>
            <button onClick={handleCloseAll} disabled={busy} className="rounded-md bg-down py-2 text-xs font-bold text-bg disabled:opacity-50">
              {busy ? "Menutup…" : "Ya, Tutup Semua"}
            </button>
          </div>
        </div>
      )}

      {emergencyStopped && !confirming && (
        <button onClick={handleClearStop} disabled={busy} className="mt-2 w-full rounded-md border border-line py-2 text-xs text-ink-muted hover:text-ink disabled:opacity-50">
          Nonaktifkan Emergency Stop
        </button>
      )}

      {result && <p className="mt-2 text-center text-xs text-ink-muted">{result}</p>}
    </div>
  );
}
