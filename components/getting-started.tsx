import Link from "next/link";
import { dismissGettingStartedAction } from "@/app/actions/onboarding";
import type { GettingStartedStep } from "@/lib/onboarding";

/**
 * A short checklist for a new workspace's owner (#641): what to do in the
 * first five minutes, with each step linking to where it's done. It goes away
 * once every step is done, or when dismissed (remembered per workspace).
 */
export function GettingStarted({
  tenantId,
  workspaceName,
  steps,
}: {
  tenantId: string;
  workspaceName: string;
  steps: GettingStartedStep[];
}) {
  const done = steps.filter((step) => step.done).length;
  return (
    <section
      aria-labelledby="getting-started-heading"
      className="rounded-[20px] border border-line bg-surface p-5 print:hidden"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="getting-started-heading" className="text-base font-bold text-ink">
            Getting started with {workspaceName}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {done} of {steps.length} done. A workspace holds your projects; each project has its own issues.
          </p>
        </div>
        <form action={dismissGettingStartedAction}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <button
            type="submit"
            className="rounded-full px-3 py-1.5 text-sm font-bold text-muted transition-colors hover:bg-tint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Dismiss
          </button>
        </form>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step.done ? "bg-primary text-white" : "border border-line text-transparent"
              }`}
            >
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-sm">
                {step.done ? (
                  <span className="text-muted line-through decoration-line">{step.label}</span>
                ) : (
                  <Link href={step.href} className="font-bold text-accent hover:underline">
                    {step.label}
                  </Link>
                )}
                <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
              </p>
              {!step.done ? <p className="text-xs text-muted">{step.hint}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
