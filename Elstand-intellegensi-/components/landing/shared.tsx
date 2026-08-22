import type { ReactNode } from "react";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-signal-glow">
      <span className="h-1 w-1 rounded-full bg-signal-glow" />
      {children}
    </p>
  );
}

// Phase 5 — same shape as Eyebrow above, but on `landing.violet` instead of
// the dashboard's runtime-swappable `signal` accent. New landing sections
// (Hero onward) use this one; sections not yet redesigned keep using the
// original Eyebrow until their turn, so nothing shifts color mid-migration.
export function LandingEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-landing-violet-glow">
      <span className="h-1 w-1 rounded-full bg-landing-violet-glow" />
      {children}
    </p>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{description}</p>}
    </div>
  );
}
