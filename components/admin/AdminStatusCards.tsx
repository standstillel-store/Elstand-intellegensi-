import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 section 7 — Dashboard Overview status cards.
//
// Spec: "Jangan membuat klaim ONLINE kalau backend tidak benar-benar
// melakukan health check." So each card below only claims ONLINE when a
// real check just ran and succeeded:
//   - Database: an actual Supabase query (not just "env var present").
//   - Web3 RPC: an actual JSON-RPC eth_blockNumber call to the configured
//     RPC endpoint, with a short timeout.
// Reward System and Wallet System don't get a live functional probe in
// this phase (that would mean reaching into lib/rewards/* and
// lib/web3/config.ts internals this phase is explicitly not allowed to
// modify or exercise — see spec sections 14/4/6.5) — they report
// CONFIGURED / NOT CONFIGURED based on whether the required secret/address
// is present, which is an honest, verifiable statement, never ONLINE.
// ---------------------------------------------------------------------------

type StatusLabel = "ONLINE" | "CONFIGURED" | "NOT CONFIGURED" | "UNKNOWN";

interface StatusCard {
  label: string;
  status: StatusLabel;
  detail: string;
}

async function checkDatabase(): Promise<StatusCard> {
  if (!isSupabaseConfigured()) {
    return { label: "Database", status: "NOT CONFIGURED", detail: "SUPABASE_SERVICE_ROLE_KEY not set." };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { label: "Database", status: "UNKNOWN", detail: "Client failed to initialize." };
  }
  try {
    const { error } = await supabase.from("admin_audit_log").select("id", { head: true, count: "exact" });
    if (error) return { label: "Database", status: "UNKNOWN", detail: error.message };
    return { label: "Database", status: "ONLINE", detail: "Query against admin_audit_log succeeded." };
  } catch (err) {
    return { label: "Database", status: "UNKNOWN", detail: err instanceof Error ? err.message : "Query failed." };
  }
}

async function checkWeb3Rpc(): Promise<StatusCard> {
  const rpcUrl = WALLET_NETWORK_CONFIG.rpcUrl;
  if (!rpcUrl) {
    return { label: "Web3 RPC", status: "NOT CONFIGURED", detail: "No RPC URL configured." };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return { label: "Web3 RPC", status: "UNKNOWN", detail: `HTTP ${res.status} from RPC endpoint.` };
    const body = await res.json();
    if (typeof body?.result === "string") {
      return { label: "Web3 RPC", status: "ONLINE", detail: `eth_blockNumber responded (BSC Testnet).` };
    }
    return { label: "Web3 RPC", status: "UNKNOWN", detail: "RPC responded but without a usable result." };
  } catch (err) {
    return { label: "Web3 RPC", status: "UNKNOWN", detail: err instanceof Error ? err.message : "RPC request failed or timed out." };
  }
}

function checkRewardSystem(): StatusCard {
  // Presence-only check — never imports lib/rewards/distributor.ts itself
  // (that module builds a real chain client / wallet at import time, which
  // this read-only status card has no business triggering).
  const hasOperatorKey = Boolean(process.env.REWARD_DISTRIBUTOR_OPERATOR_PRIVATE_KEY);
  return {
    label: "Reward System",
    status: hasOperatorKey ? "CONFIGURED" : "NOT CONFIGURED",
    detail: hasOperatorKey ? "Distributor operator key present." : "REWARD_DISTRIBUTOR_OPERATOR_PRIVATE_KEY not set.",
  };
}

function checkWalletSystem(): StatusCard {
  const hasElsContract = Boolean(WALLET_NETWORK_CONFIG.ELS_CONTRACT);
  return {
    label: "Wallet System",
    status: hasElsContract ? "CONFIGURED" : "NOT CONFIGURED",
    detail: hasElsContract ? "ELS token contract configured (BSC Testnet)." : "ELS_CONTRACT not set.",
  };
}

const STATUS_STYLES: Record<StatusLabel, string> = {
  ONLINE: "bg-up/15 text-up border-up/30",
  CONFIGURED: "bg-signal/15 text-signal border-signal/30",
  "NOT CONFIGURED": "bg-white/5 text-white/50 border-line",
  UNKNOWN: "bg-amber/15 text-amber border-amber/30",
};

export async function AdminStatusCards() {
  const [database, web3Rpc] = await Promise.all([checkDatabase(), checkWeb3Rpc()]);
  const cards = [database, web3Rpc, checkRewardSystem(), checkWalletSystem()];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-line bg-bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-white/50">{card.label}</p>
          <span className={`mt-2 inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[card.status]}`}>{card.status}</span>
          <p className="mt-2 text-xs leading-relaxed text-white/40">{card.detail}</p>
        </div>
      ))}
    </div>
  );
}
