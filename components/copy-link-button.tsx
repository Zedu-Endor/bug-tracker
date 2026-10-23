"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { useToast } from "@/components/ui/toast";

function LinkIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
      <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
    </svg>
  );
}

/**
 * Copies a link and confirms it (#279). The full button is for the issue
 * header; `compact` is the icon-sized one beside each comment's timestamp,
 * which still carries a real name for screen readers.
 */
export function CopyLinkButton({
  url,
  label,
  compact = false,
  iconOnly = false,
}: {
  url: string;
  /** What is being linked, for the accessible name: "issue", "comment". */
  label: string;
  compact?: boolean;
  /** A round icon button, for the issue header. */
  iconOnly?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function copy() {
    if (pending) return;
    setPending(true);
    try {
      const ok = await copyText(url);
      if (ok) {
        toast(`Link to this ${label} copied.`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Say what happened and hand over the link itself, rather than
        // pretending: the person can still select it from the message.
        toast(`Couldn't copy automatically. The link is: ${url}`, "error");
      }
    } finally {
      setPending(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={copy}
        aria-label={`Copy link to this ${label}`}
        title={`Copy link to this ${label}`}
        className="rounded-sm p-0.5 text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary print:hidden"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
    );
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={copy}
        aria-label={copied ? "Copied link" : `Copy link to this ${label}`}
        title={copied ? "Copied" : `Copy link to this ${label}`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface print:hidden"
      >
        <LinkIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink-2 transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary print:hidden"
    >
      <LinkIcon className="h-3.5 w-3.5" />
      <span>{copied ? "Copied" : "Copy link"}</span>
    </button>
  );
}
