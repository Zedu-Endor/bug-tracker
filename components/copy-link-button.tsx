"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copies the issue URL so it can be shared as a proof link (#337). The label
 * flips to "Copied!" for a moment, then goes back to "Copy link".
 */
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // The clipboard needs a secure origin and permission. When it is
      // blocked there is nothing useful to show, so leave the label alone
      // rather than claiming the link was copied.
      return;
    }
    setCopied(true);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      aria-label="Copy link to this issue"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
    >
      <span aria-live="polite">{copied ? "Copied!" : "Copy link"}</span>
    </button>
  );
}
