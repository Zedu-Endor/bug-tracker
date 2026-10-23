import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { settableLevels, OWNER_REVIEW_LIMIT } from "@/lib/agents/levels";
import { MAX_ACTIVE_AGENTS_PER_OWNER } from "@/lib/agents/registry-limits";
import { isTenantAdminRole } from "@/lib/agents/membership";
import { projectContextFor } from "@/lib/project-context";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { isAgentPlatformEnabled } from "@/lib/feature-flags";
import { CreateAgentForm } from "../create-agent-form";

export const metadata = { title: "Create agent" };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-[38px] items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-tint ${focusRing}`}
    >
      {children}
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

/** The Create agent screen: registration and the rules that go with it. */
export default async function NewAgentPage() {
  if (!isAgentPlatformEnabled()) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            Create agent
          </h1>
          <p className="text-sm text-muted">
            The agent platform feature is not enabled in this environment.
          </p>
        </div>
      </div>
    );
  }

  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  const context = await projectContextFor(prisma, tenantId);
  const membership = tenantId
    ? await prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        select: { role: true },
      })
    : null;
  const isAdmin = isTenantAdminRole(membership?.role, user.role);
  const levels = settableLevels({ isOwner: true, isTenantAdmin: isAdmin });

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
          <div className="flex max-w-[640px] flex-col gap-1.5">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
              Create agent
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              Use a separate agent for each specialist role. You can keep{" "}
              {MAX_ACTIVE_AGENTS_PER_OWNER} active agents in this workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PillLink href="/settings/agents/connect">Connect your agent</PillLink>
            <PillLink href="/settings/audit">Agent audit log</PillLink>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-line bg-tint p-[18px] sm:px-5">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary text-white"
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
            <path d="m16 18 6-6-6-6" />
            <path d="m8 6-6 6 6 6" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
          <span className="text-[15px] font-bold text-ink">Developer documentation &amp; AI specs</span>
          <span className="text-[13px] text-ink-2">
            Learn how to integrate your API keys with Claude, ChatGPT, Cursor and custom scripts.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/docs"
            className={`inline-flex h-10 items-center rounded-full bg-primary px-[18px] text-sm font-bold text-white transition-colors hover:bg-electric-blue-strong ${focusRing}`}
          >
            View API docs
          </Link>
          <a
            href="/llms.txt"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 font-mono text-[13px] font-semibold text-ink transition-colors hover:bg-tint ${focusRing}`}
          >
            /llms.txt
            <svg
              aria-hidden="true"
              className="h-[13px] w-[13px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </a>
        </div>
      </div>

      {!tenantId ? (
        <div className="rounded-[20px] border border-dashed border-line bg-surface p-6 text-sm text-muted">
          <p>
            You aren&apos;t in a workspace yet, so you can&apos;t register agents. Join a workspace via an invite from your team, or create your own workspace to start managing agents.
          </p>
          <div className="mt-3">
            <Link
              href="/tenants"
              className={`inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-electric-blue-strong ${focusRing}`}
            >
              Create or join a workspace →
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <section
            aria-labelledby="register-heading"
            className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-[20px] border border-line bg-surface p-5 sm:p-6"
          >
            <div className="flex flex-col gap-1.5">
              <h2 id="register-heading" className="text-lg font-bold text-ink">
                Add an agent
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                Register a separate agent for a level you don&apos;t have yet, or approve one that
                asked to join on the{" "}
                <Link href="/settings/agents/pair" className="font-semibold text-accent underline">
                  approval page
                </Link>
                .
              </p>
            </div>
            <CreateAgentForm
              projects={context.projects}
              activeProjectId={context.activeProjectId}
              levels={levels}
            />
          </section>

          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-[22px]">
              <h2 className="text-base font-bold text-ink">Two ways to connect</h2>
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint text-[13px] font-extrabold text-accent">
                  1
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-ink">Copy Agent Key</span>
                  <span className="text-[13px] leading-relaxed text-ink-2">
                    Send a key that is already an account, together with this site.
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint text-[13px] font-extrabold text-accent">
                  2
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-ink">Copy only the site</span>
                  <span className="text-[13px] leading-relaxed text-ink-2">
                    The agent opens the approval page, you approve it while signed in, and the key comes back to the agent.
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-chip px-3 py-2.5 text-xs text-ink-2">
                A key works in one project only.
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[22px]">
              <h2 className="text-base font-bold text-ink">Independent review rules</h2>
              <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
                <InfoIcon />
                Multiple agents of one owner are not independent reviewers.
              </div>
              <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
                <InfoIcon />
                {OWNER_REVIEW_LIMIT}
              </div>
            </section>

            <section className="flex items-start gap-3 rounded-[20px] border border-bad-bd bg-bad-soft p-5 sm:px-[22px]">
              <svg
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-bad-fg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-bold text-bad-fg">Password resets revoke keys</h2>
                <p className="text-[13px] leading-relaxed text-ink-2">
                  Resetting your password signs you out and revokes every live agent key you own. The agents stay, but no key is replaced automatically — regenerate a key here, or add and reconnect the agent.
                </p>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
