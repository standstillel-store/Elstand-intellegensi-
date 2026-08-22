"use client";
import { Users } from "lucide-react";
import { CopyButton } from "./QuestCard";

interface ReferralCardProps {
  referralUrl: string;
  referralCode: string;
  totalReferred: number;
  totalRewarded: number;
}

// ---------------------------------------------------------------------------
// Brief Section 3's "Referral" quest card. No transaction/state machine —
// referral status is driven entirely server-side by app/auth/callback's
// onboarding-event hook (lib/referral.ts), never by anything this component
// does. totalReferred/totalRewarded come straight from GET
// /api/rewards/status's `referral` block.
// ---------------------------------------------------------------------------
export function ReferralCard({ referralUrl, referralCode, totalReferred, totalRewarded }: ReferralCardProps) {
  return (
    <div className="rounded-md border border-line bg-bg-raised/60 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal-glow">
            <Users size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Refer a Friend</p>
            <p className="text-xs font-semibold text-signal-glow">+15 AI ENERGY</p>
            <p className="mt-0.5 text-[11px] text-ink-faint">Rewarded once your friend completes sign-in — not just for opening the link.</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          {totalRewarded} rewarded
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={referralUrl} label="Copy Referral Link" />
        <CopyButton value={referralCode} label="Copy Referral Code" />
      </div>

      {totalReferred > 0 && (
        <p className="mt-2 text-[11px] text-ink-faint">
          {totalReferred} friend{totalReferred === 1 ? "" : "s"} referred · {totalRewarded} rewarded
        </p>
      )}
    </div>
  );
}
