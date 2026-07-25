import { lookupKnowledge } from "@/lib/elvoid/knowledge";

/** Wraps a label with a native title-attribute tooltip pulled from the knowledge glossary — falls back to plain text if the term isn't in the glossary, so it's always safe to wrap. */
export function KnowledgeTerm({ term, children }: { term: string; children: React.ReactNode }) {
  const entry = lookupKnowledge(term);
  if (!entry) return <>{children}</>;
  return (
    <span className="underline decoration-dotted decoration-ink-faint underline-offset-2" title={entry.short}>
      {children}
    </span>
  );
}
