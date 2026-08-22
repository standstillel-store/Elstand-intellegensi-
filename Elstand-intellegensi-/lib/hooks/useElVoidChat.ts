"use client";
import { useEffect, useState } from "react";
import { buildGreetingTerminalReport } from "@/lib/analysis";
import type { TerminalReport } from "@/lib/terminalReport";

export type ChatMsg =
  | { role: "user"; text: string }
  | { role: "assistant"; report: TerminalReport }
  | { role: "error"; text: string; retrying: boolean };

// V3 brief's terminal loading sequence. Cycled while a fresh request is in
// flight; holds on the last step if the fetch runs long rather than looping
// back — a live "still working" read, not a decorative spinner.
const TERMINAL_LOADING_STEPS = [
  "Connecting...",
  "Loading Intelligence...",
  "Checking Macro...",
  "Checking News...",
  "Scanning Liquidity...",
  "Checking ETF...",
  "Reading Whale Wallet...",
  "Checking Funding...",
  "Reading Structure...",
  "Generating Probability...",
] as const;
const STEP_MS = 170;

/** Flattens a TerminalReport to one line of plain text — only used to build history for an LLM provider (see lib/ai/provider.ts); the rule-based engine itself stays stateless. */
function flattenReport(report: TerminalReport): string {
  return report.conclusion || report.emptyNote || report.title;
}

async function callChatApi(text: string, history: ChatMsg[]): Promise<TerminalReport> {
  const historyText = history
    .slice(-6)
    .map((m) => (m.role === "user" ? `User: ${m.text}` : m.role === "assistant" ? `ElVoid AI: ${flattenReport(m.report)}` : ""))
    .filter(Boolean)
    .join("\n");
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, history: historyText }),
  });
  const data = await res.json();
  if (!data?.report) throw new Error("empty response");
  return data.report as TerminalReport;
}

/**
 * One hook, three shells — components/AIChatDock.tsx (floating bubble, all
 * pages), components/right-rail/ElVoidChatPanel.tsx (inline panel, home
 * dashboard), and components/mobile/AskNocturnBar.tsx all call this instead
 * of duplicating fetch/loading-sequence/retry logic.
 */
export function useElVoidChat() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([{ role: "assistant", report: buildGreetingTerminalReport() }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setLoadingStep(TERMINAL_LOADING_STEPS.length - 1);
      return;
    }
    const id = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, TERMINAL_LOADING_STEPS.length - 1));
    }, STEP_MS);
    return () => clearInterval(id);
  }, [loading]);

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const report = await callChatApi(text, msgs);
      setMsgs((m) => [...m, { role: "assistant", report }]);
    } catch {
      // One honest automatic retry — "Retrying..." only shows while a real
      // second attempt is actually in flight, never as decoration.
      setMsgs((m) => [...m, { role: "error", text, retrying: true }]);
      setLoading(false);
      await new Promise((r) => setTimeout(r, 1400));
      await retryLast(text);
      return;
    }
    setLoading(false);
  }

  async function retryLast(text: string) {
    setMsgs((m) => m.map((msg) => (msg.role === "error" && msg.text === text ? { ...msg, retrying: true } : msg)));
    try {
      const report = await callChatApi(text, msgs);
      setMsgs((m) => [...m.filter((msg) => !(msg.role === "error" && msg.text === text)), { role: "assistant", report }]);
    } catch {
      setMsgs((m) => m.map((msg) => (msg.role === "error" && msg.text === text ? { ...msg, retrying: false } : msg)));
    }
  }

  return {
    msgs,
    input,
    setInput,
    loading,
    loadingLabel: TERMINAL_LOADING_STEPS[loadingStep],
    send,
    retry: retryLast,
  };
}
