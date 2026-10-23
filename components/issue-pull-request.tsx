import { formatProofLinkLabel } from "@/lib/proof-links";

interface IssuePullRequestProps {
  pullRequestUrl: string | null | undefined;
}

export function IssuePullRequest({ pullRequestUrl }: IssuePullRequestProps) {
  if (!pullRequestUrl) {
    return null;
  }

  return (
    <section
      className="rounded-[20px] border border-line bg-surface p-5"
      data-testid="attached-pr-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
          Pull request
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2.5 py-0.5 text-[11px] font-bold text-warn-fg">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          Pending review
        </span>
      </div>
      <a
        href={pullRequestUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={pullRequestUrl}
        className="mt-3 flex items-center gap-2.5 rounded-[14px] border border-line p-3 text-ink transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-tint text-accent">
          <svg className="h-[17px] w-[17px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <path d="M6 9v12M13 6h3a2 2 0 0 1 2 2v7" />
          </svg>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-bold">{formatProofLinkLabel(pullRequestUrl)}</span>
          <span className="truncate text-xs text-muted">{pullRequestUrl}</span>
        </span>
        <span aria-hidden className="ml-auto shrink-0 text-sm text-muted">↗</span>
      </a>
    </section>
  );
}
