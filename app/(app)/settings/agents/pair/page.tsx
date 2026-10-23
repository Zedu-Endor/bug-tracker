import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { findPendingPairing } from "@/lib/agents/pairing";
import { AGENT_INSTRUCTIONS_MAX } from "@/lib/agent-messages";
import { projectContextFor } from "@/lib/project-context";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { PairForm } from "./pair-form";
import { isAgentPlatformEnabled } from "@/lib/feature-flags";

export const metadata = { title: "Approve an agent" };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const chip =
  "inline-flex items-center gap-1.5 rounded-full bg-chip px-3 py-1.5 text-xs font-bold text-ink-2";

/** Where an agent sends its owner to approve a request (#427). */
export default async function PairAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const user = await requireUser();
  if (!isAgentPlatformEnabled()) {
    // #505: nothing to approve while the platform is off.
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            Approve an agent
          </h1>
          <p className="text-sm text-muted">
            The agent platform feature is not enabled in this environment.
          </p>
        </div>
      </div>
    );
  }
  const tenantId = await currentTenantIdFor(user.id);
  const context = await projectContextFor(prisma, tenantId);
  const { code } = await searchParams;
  const initialCode = typeof code === "string" ? code.slice(0, 20) : "";
  const pending = initialCode ? await findPendingPairing(initialCode) : null;

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <Link
          href="/settings/agents"
          className={`inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-semibold text-accent transition-colors hover:text-electric-blue-strong ${focusRing}`}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to agents
        </Link>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          Approve an agent
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Your agent asked to join this account. Check its name and approve it.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={chip}>
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
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Lasts 15 minutes
        </span>
        <span className={chip}>
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
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Works once
        </span>
        <span className={chip}>
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
            <circle cx="7.5" cy="15.5" r="4.5" />
            <path d="m10.7 12.3 9.3-9.3M17 6l3 3" />
          </svg>
          Key goes to the agent, not this page
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-3 py-1.5 text-xs font-bold text-ok-fg">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          Signed in as {user.name ?? user.email ?? "you"}
        </span>
      </div>

      {!tenantId ? (
        <div className="rounded-3xl border border-dashed border-line bg-surface p-6 text-sm text-muted">
          <p>
            Join or create a workspace before you can approve an agent.{" "}
            <Link href="/tenants" className="font-semibold text-accent hover:underline">
              Workspaces
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-muted">
            Your agent asked to join this account. You have to be signed in. The request lasts 15
            minutes and works once. The key goes back to the agent, not to this page.
          </p>
          <PairForm
            initialCode={initialCode}
            pending={
              pending
                ? {
                    name: pending.proposedName,
                    model: pending.proposedModel,
                    level: pending.proposedLevel,
                    instructions: pending.proposedInstructions,
                  }
                : null
            }
            unknownCode={Boolean(initialCode) && !pending}
            projects={context.projects}
            activeProjectId={context.activeProjectId}
            instructionsMaxLength={AGENT_INSTRUCTIONS_MAX}
          />
        </>
      )}
    </div>
  );
}
