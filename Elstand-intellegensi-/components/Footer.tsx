import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-5 text-center">
      <p className="text-[11px] text-ink-faint">
        <Link href="/methodology" className="underline decoration-line underline-offset-2 hover:text-ink-muted">
          Methodology
        </Link>
        <span className="mx-2">·</span>
        ELSTAND INTELLIGENCE is a signal aggregator, not financial advice.
      </p>
      <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Powered by Scridzy</p>
    </footer>
  );
}
