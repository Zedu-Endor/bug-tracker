"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editProofLinksAction } from "@/app/actions/issues";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatProofLinkLabel } from "@/lib/proof-links";

export type EditableProofLinksProps = {
  bugId: string;
  initialLinks: string[];
  /** The issue's attached pull request, shown here even when it is not in the link list. */
  linkedPullRequestUrl?: string | null;
  canEdit: boolean;
};

function ExternalLinkIcon({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

/** The issue's proof links, which the reporter or an admin can change after filing (#737). */
export function EditableProofLinks({ bugId, initialLinks, linkedPullRequestUrl, canEdit }: EditableProofLinksProps) {
  const router = useRouter();
  const links = linkedPullRequestUrl && !initialLinks.includes(linkedPullRequestUrl)
    ? [linkedPullRequestUrl, ...initialLinks]
    : initialLinks;
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(links.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleStartEdit = () => {
    setValue(links.join("\n"));
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setValue(links.join("\n"));
    setError(null);
    setIsEditing(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const formData = new FormData();
    formData.set("proofLinks", value);

    startTransition(async () => {
      const result = await editProofLinksAction(bugId, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setIsEditing(false);
        router.refresh();
      }
    });
  };

  return (
    <section className="rounded-[20px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
          GitHub PR
        </h2>
        {canEdit && !isEditing ? (
          <Button
            variant="ghost"
            className="px-2.5 py-1 text-xs text-ink-2 hover:text-ink"
            onClick={handleStartEdit}
          >
            Edit
          </Button>
        ) : null}
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          {error ? (
            <div
              className="rounded-lg border border-bad-bd bg-bad-bg p-3 text-sm text-bad-fg"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <label htmlFor="edit-proof-links" className="sr-only">
            GitHub PR
          </label>
          <Textarea
            id="edit-proof-links"
            name="proofLinks"
            rows={4}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            placeholder={
              "https://github.com/organization/repo/pull/123"
            }
          />
          <p className="text-xs text-muted">
            One GitHub link per line, at most 20. Leave empty to remove them all.
          </p>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </form>
      ) : links.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No GitHub PR attached to this report.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {links.map((url, index) => (
            <li key={`${index}-${url}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={url}
                className="inline-flex items-center gap-1.5 break-all text-sm font-bold text-accent hover:underline"
              >
                <ExternalLinkIcon className="h-4 w-4 shrink-0 text-muted" />
                <span>{formatProofLinkLabel(url)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
