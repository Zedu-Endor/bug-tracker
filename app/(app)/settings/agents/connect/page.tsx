import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { projectContextFor } from "@/lib/project-context";
import { getSiteUrl } from "@/lib/site-url";
import { isAgentPlatformEnabled } from "@/lib/feature-flags";
import { getAgentTemplates } from "@/lib/agents/templates";
import { ConnectAgentView } from "./connect-agent-view";

export const metadata = { title: "Connect your agent" };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/**
 * Connect your agent onboarding page (#610).
 * Ready-to-paste setups for Claude, ChatGPT, and Node/Python pollers.
 */
export default async function ConnectAgentPage() {
  const user = await requireUser();

  if (!isAgentPlatformEnabled()) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            Connect your agent
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

  const activeProject =
    context.projects.find((project) => project.id === context.activeProjectId) ??
    context.projects[0] ??
    null;

  const projectId = activeProject?.id ?? null;
  const projectName = activeProject?.name ?? null;
  const siteUrl = getSiteUrl();

  const templates = getAgentTemplates({
    origin: siteUrl,
    projectId,
    projectName,
  });

  // Check if an agent for this project has already made a call
  const initialKey = tenantId
    ? await prisma.agentApiKey.findFirst({
        where: {
          agent: { ownerUserId: user.id, tenantId, revokedAt: null },
          ...(projectId ? { projectId } : {}),
          lastUsedAt: { not: null },
        },
        include: { agent: { select: { name: true } } },
        orderBy: { lastUsedAt: "desc" },
      })
    : null;

  return (
    <div className="flex flex-col gap-5">
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[680px] flex-col gap-1.5">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
              Connect your agent
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              Connect a separate agent for each level you use. Pick your assistant, copy the setup
              block, approve the pairing request and test your connection.
            </p>
          </div>
          <Link
            href="/settings/agents/pair"
            className={`inline-flex h-[42px] items-center gap-2 rounded-full border border-line bg-surface px-[18px] text-sm font-bold text-ink transition-colors hover:bg-tint ${focusRing}`}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            Approve a pairing code
          </Link>
        </div>
      </div>

      {!tenantId ? (
        <div className="rounded-[20px] border border-dashed border-line bg-surface p-6 text-sm text-muted">
          <p>
            You are not currently in a workspace. Join or create a workspace before you can connect an agent.
          </p>
          <div className="mt-3">
            <Link
              href="/tenants"
              className={`inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-electric-blue-strong ${focusRing}`}
            >
              Workspaces →
            </Link>
          </div>
        </div>
      ) : (
        <ConnectAgentView
          templates={templates}
          siteUrl={siteUrl}
          projectId={projectId}
          projectName={projectName}
          initialConnected={Boolean(initialKey?.lastUsedAt)}
          initialAgentName={initialKey?.agent?.name ?? null}
        />
      )}
    </div>
  );
}
