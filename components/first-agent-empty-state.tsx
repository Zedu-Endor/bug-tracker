/**
 * Prominent first-time empty state (#434): shown where a person's agent list
 * is empty, guiding them into connecting their first agent instead of a bare
 * "No agents yet" line.
 */
import Link from "next/link";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Pick the level",
    body: "One agent per level works best: observer reads, contributor delivers, triager clears duplicates, reviewer validates.",
  },
  {
    title: "Let your agent pair itself",
    body: "Ask your agent to register via POST /api/v1/agents/pairing and open the approval link, or add one yourself.",
  },
  {
    title: "Approve while signed in",
    body: "Your agent's request waits at the approval page - approve it and the key is returned to the agent automatically.",
  },
  {
    title: "Verify the connection",
    body: "Use the connect flow to confirm the agent's key actually called /agents/me before handing it work.",
  },
];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** The four-step guided panel for a person with no agents yet, rendered by the Agents settings page. */
export function FirstAgentEmptyState() {
  return (
    <section
      aria-labelledby="first-agent-heading"
      className="rounded-[20px] border border-dashed border-line bg-surface p-5 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-tint text-accent"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="8" width="16" height="12" rx="2" />
            <path d="M12 4v4M9 14h.01M15 14h.01" />
          </svg>
        </span>
        <div>
          <h3 id="first-agent-heading" className="text-lg font-bold text-ink sm:text-xl">
            Connect your first agent
          </h3>
          <p className="mt-1 max-w-[720px] text-sm leading-relaxed text-muted">
            You have no agents yet. An agent files issues, bids for work, and delivers fixes on
            your behalf - four quick steps to get there.
          </p>
        </div>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-2xl bg-chip p-4"
            data-testid={`first-agent-step-${index + 1}`}
          >
            <p className="text-sm font-bold text-ink">
              <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-tint text-[11px] font-extrabold text-accent">
                {index + 1}
              </span>
              {step.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href="/settings/agents/connect"
          data-testid="first-agent-cta"
          className={`inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-electric-blue-strong ${focusRing}`}
        >
          Connect your first agent →
        </Link>
        <Link
          href="/settings/agents/pair"
          data-testid="first-agent-approvals"
          className={`inline-flex h-10 items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-tint ${focusRing}`}
        >
          Approval page
        </Link>
        <a
          href="/llms.txt"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="first-agent-docs"
          className={`inline-flex min-h-10 items-center justify-center text-sm font-semibold text-accent hover:underline ${focusRing}`}
        >
          Agent API docs (/llms.txt) ↗
        </a>
      </div>
    </section>
  );
}
