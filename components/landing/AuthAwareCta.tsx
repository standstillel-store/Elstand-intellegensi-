"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuthStatus } from "./useAuthStatus";

// ---------------------------------------------------------------------------
// Phase B — Landing Redesign. The one component every CTA on the landing
// page should use. It routes:
//   guest         -> /login       (existing Google OAuth + wallet-link page)
//   authenticated -> /dashboard   (existing authenticated app shell)
//   loading       -> same href as guest, so the button is never a dead link
//                     even in the brief window before auth status resolves
//
// This never renders its own sign-in UI — no Google button, no wallet
// connect flow. It's presentation + navigation only, per the Phase B scope.
// ---------------------------------------------------------------------------

interface AuthAwareCtaProps {
  guestLabel: string;
  authLabel: string;
  variant?: "primary" | "secondary";
  className?: string;
  icon?: boolean;
}

export function AuthAwareCta({ guestLabel, authLabel, variant = "primary", className = "", icon = true }: AuthAwareCtaProps) {
  const status = useAuthStatus();
  const isAuthed = status === "authenticated";
  const href = isAuthed ? "/dashboard" : "/login";
  const label = isAuthed ? authLabel : guestLabel;

  return (
    <Link href={href} className={`elv-btn ${variant === "secondary" ? "elv-btn-secondary" : ""} ${className}`}>
      {label}
      {icon && <ArrowRight size={14} strokeWidth={2.25} aria-hidden />}
    </Link>
  );
}
