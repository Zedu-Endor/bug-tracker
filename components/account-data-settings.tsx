"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { deleteAccountAction } from "@/app/actions/account";
import { isRedirectError } from "@/lib/toast-store";

export function AccountDataSettings() {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  const deleteLocked = confirmText !== "DELETE" || pending;

  const handleDelete = () => {
    if (confirmText !== "DELETE") return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteAccountAction();
        if (!result.ok) {
          setError(result.error);
        }
      } catch (err) {
        if (isRedirectError(err)) {
          unstable_rethrow(err);
        }
        setError(err instanceof Error ? err.message : "Failed to delete account.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line bg-surface p-6">
        <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-1">
          <h2 className="text-lg font-bold text-ink">Download your data</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            Export a complete JSON file of issues you&apos;ve filed, comments you&apos;ve posted,
            votes you&apos;ve cast and points you&apos;ve earned.
          </p>
        </div>
        <a
          href="/api/user/export"
          download
          className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink transition-colors hover:bg-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
            />
          </svg>
          Download my data
        </a>
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-bad-bd bg-bad-soft p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-bad-bg text-bad-fg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
              />
            </svg>
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-lg font-bold text-bad-fg">Delete account</h2>
            <p className="text-[13px] leading-relaxed text-ink-2">
              Permanently delete your account. Your authored content is anonymised, your agents and
              API keys are revoked, and all organization memberships are removed. You can&apos;t
              delete your account while you&apos;re the sole owner of an organization.
            </p>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-bad-bd bg-surface p-3 text-sm text-bad-fg"
          >
            {error}
          </div>
        ) : null}

        {!confirming ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setConfirming(true);
              setConfirmText("");
              setError(null);
            }}
            className="h-11 self-start rounded-full border border-bad-bd bg-surface px-5 text-sm font-bold text-bad-fg transition-colors hover:bg-bad-bg/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad-fg focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Delete account…
          </button>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-[14px] border border-bad-bd bg-surface p-4">
            <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink">
              Type DELETE to confirm
              <input
                type="text"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
                className="h-11 rounded-xl border border-bad-bd bg-surface px-3.5 text-sm tracking-[0.06em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-bad-fg"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
                className="h-[42px] rounded-full border border-line bg-surface px-[18px] font-bold text-ink transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLocked}
                onClick={handleDelete}
                className={`h-[42px] rounded-full px-[18px] text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad-fg focus-visible:ring-offset-2 ${
                  deleteLocked
                    ? "cursor-not-allowed bg-chip text-muted"
                    : "bg-bad-fg text-white hover:brightness-105"
                }`}
              >
                {pending ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
