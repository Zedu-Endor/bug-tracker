"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import { agentBootstrapMessage } from "@/lib/agents/bootstrap-message";

/** One live key on the agents list. The secret is copied, not printed. */
export function AgentRowKey({
  apiKey,
  prefix,
  projectId,
  projectName,
}: {
  apiKey: string | null;
  prefix: string;
  projectId: string | null;
  projectName: string | null;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const where = projectName ?? (projectId ? "This project" : "Every project");

  async function copy() {
    if (!apiKey) return;
    const origin = window.location.origin;
    const value = projectId
      ? agentBootstrapMessage({ origin, apiKey, projectName })
      : apiKey;
    const ok = await copyText(value);
    if (!ok) {
      toast("Couldn't copy the key.", "error");
      return;
    }
    toast(projectId ? "Agent setup copied. Paste it into that agent." : "Key copied.");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const keyMark = (
    <span className="inline-flex min-w-0 items-center gap-2 font-mono text-[13px] font-semibold text-ink">
      <svg
        aria-hidden="true"
        className="h-[15px] w-[15px] shrink-0 text-accent"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="7.5" cy="15.5" r="4.5" />
        <path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2" />
      </svg>
      <span className="truncate">{prefix}…</span>
    </span>
  );

  if (!apiKey) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {keyMark}
        <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-bold text-warn-fg">
          Not copyable
        </span>
        <span className="min-w-0 flex-1 basis-[240px] text-xs text-muted">
          Issued before it could be copied again. Regenerate it — the new key stays on this row.
        </span>
        <button
          type="button"
          disabled
          aria-label="Copy key (unavailable)"
          className="inline-flex h-[34px] cursor-not-allowed items-center rounded-full border border-line px-3 text-[13px] font-semibold text-muted opacity-60"
        >
          Copy
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {keyMark}
      <span className="text-xs text-muted">{where}</span>
      <button
        type="button"
        onClick={copy}
        className="ml-auto inline-flex h-[34px] items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <svg
          aria-hidden="true"
          className="h-[13px] w-[13px]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
        {copied ? "Copied" : "Copy key"}
      </button>
    </div>
  );
}
