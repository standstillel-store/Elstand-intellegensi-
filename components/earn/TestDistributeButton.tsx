"use client";
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";

/**
 * TEMPORARY — only renders when /api/rewards/status returns
 * testDistributeEnabled: true, itself gated on ENABLE_TEST_DISTRIBUTE
 * (see lib/rewards/config.ts). Remove this component + its route once
 * ELSTestnetSwap is deployed and the real "Buy ELS (Testnet)" quest flow
 * can exercise the distributor properly.
 */
export function TestDistributeButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/rewards/test-distribute", { method: "POST" }).then((r) => r.json());
      if (res.error) {
        setState("error");
        setMessage(res.error);
      } else {
        setState("done");
        setMessage(`Sent ${res.amount} ELS → ${res.to} (tx ${res.txHash.slice(0, 10)}…)`);
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Request failed.");
    }
  }

  return (
    <div className="rounded-md border border-dashed border-amber/40 bg-amber/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <FlaskConical size={14} className="text-ink-faint" />
          <span>TEST ONLY — sends 1 ELS via distributor, no quest/verification involved.</span>
        </div>
        <button
          onClick={handleClick}
          disabled={state === "loading"}
          className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-bg-raised disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "loading" ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Sending…
            </span>
          ) : (
            "Test distribute()"
          )}
        </button>
      </div>
      {message && <p className={`mt-2 text-[11px] ${state === "error" ? "text-down" : "text-up"}`}>{message}</p>}
    </div>
  );
}
