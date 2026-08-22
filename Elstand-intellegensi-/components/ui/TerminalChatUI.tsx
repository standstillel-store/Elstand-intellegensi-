"use client";

/** The user's own message, shown "root@elvoid" terminal-style instead of a chat bubble. */
export function TerminalPromptLine({ text }: { text: string }) {
  return (
    <div className="mono-num text-[12px] leading-relaxed">
      <div className="text-ink-faint">root@elvoid</div>
      <div className="text-ink">«{text}»</div>
    </div>
  );
}

/** The staged "Connecting... / Checking Macro... / ..." sequence from the V3 brief, with a blinking cursor. */
export function TerminalLoadingLine({ label }: { label: string }) {
  return (
    <div className="mono-num flex items-center gap-2 text-[12px] text-ink-muted">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulseGlow rounded-full bg-signal" />
      <span>{label}</span>
      <span className="animate-blink text-signal-glow">▍</span>
    </div>
  );
}

/**
 * Terminal-style error state. `retrying` shows an honest "Retrying..." only
 * while a real automatic retry is in flight (see useElVoidChat) — once that
 * retry also fails, this switches to a manual "Coba lagi" action instead of
 * a fake perpetual retry loop.
 */
export function TerminalErrorLine({ reason, retrying, onRetry }: { reason: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div className="mono-num space-y-1 rounded-lg border border-down/30 bg-down/5 px-3 py-2.5 text-[12px]">
      <div className="text-ink-faint">root@elvoid</div>
      <div className="font-bold text-down">ERROR</div>
      <div className="text-ink-muted">{reason}</div>
      {retrying ? (
        <div className="flex items-center gap-1.5 text-ink-faint">
          <span>Retrying...</span>
          <span className="animate-blink text-signal-glow">▍</span>
        </div>
      ) : (
        <button onClick={onRetry} className="text-signal-glow underline underline-offset-2 hover:text-signal">
          Coba lagi
        </button>
      )}
    </div>
  );
}
