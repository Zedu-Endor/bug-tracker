import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { LocalTime } from "@/components/local-time";
import { RelativeTime } from "@/components/relative-time";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  AGENT_LEVEL_DESCRIPTIONS,
  AGENT_LEVEL_LABELS,
  AGENT_LEVELS,
  isAgentLevel,
  OWNER_REVIEW_LIMIT,
  SEPARATE_LEVEL_AGENTS,
  settableLevels,
} from "@/lib/agents/levels";
import { AGENT_LEVEL_TONE } from "@/lib/agents/level-tone";
import { MAX_ACTIVE_AGENTS_PER_OWNER } from "@/lib/agents/registry-limits";
import { isTenantAdminRole } from "@/lib/agents/membership";
import { projectContextFor } from "@/lib/project-context";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { openSecret } from "@/lib/secret-box";
import { materializeApprovedPairings } from "@/lib/agents/pairing";
import { isAgentPlatformEnabled } from "@/lib/feature-flags";
import { initialsOf } from "@/lib/header-nav";
import { AgentControls } from "./agent-controls";
import { AgentRowKey } from "./agent-row-key";
import { FirstAgentEmptyState } from "@/components/first-agent-empty-state";

/** Decrypts a stored agent key for display; a missing or unreadable seal yields null so the row still renders. */
function revealAgentKey(sealed: string | null): string | null {
  if (!sealed) return null;
  try {
    return openSecret(sealed);
  } catch {
    return null;
  }
}

export const metadata = { title: "Agents" };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const avatarTones = [
  "bg-primary",
  "bg-blue-slate",
  "bg-[#0F8A6A]",
  "bg-[#7C3AED]",
];

/** Stable colour square for an agent, so filtering the list doesn't recolour it. */
function agentAvatarTone(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return avatarTones[hash % avatarTones.length];
}

/** Keeps the search and the role tab on the same URL shape. */
function rosterHref(role: string, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (role !== "all") params.set("role", role);
  const search = params.toString();
  return search ? `/settings/agents?${search}` : "/settings/agents";
}

const ROLE_TABS = ["all", ...AGENT_LEVELS] as const;

function MeterIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 text-primary"
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
  );
}

/**
 * A person's agents and the team's (#427). Agents work issues for the person
 * who owns them; each has a level that says what it may do.
 */
export default async function AgentsSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[]; role?: string | string[] }>;
}) {
  if (!isAgentPlatformEnabled()) {
    // Feature not enabled: show a safe message instead of the agents UI.
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            Agents
          </h1>
          <p className="text-sm text-muted">
            The agent platform feature is not enabled in this environment.
          </p>
        </div>
      </div>
    );
  }

  const user = await requireUser();
  const params = searchParams ? await searchParams : {};
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (rawQuery ?? "").trim().slice(0, 80);
  const rawRole = Array.isArray(params.role) ? params.role[0] : params.role;
  const roleFilter = isAgentLevel(rawRole) ? rawRole : "all";

  // The organization open in the header, not the old Zedu membership.
  const tenantId = await currentTenantIdFor(user.id);
  const context = await projectContextFor(prisma, tenantId);
  const membership = tenantId
    ? await prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        select: { role: true },
      })
    : null;
  const isAdmin = isTenantAdminRole(membership?.role, user.role);
  const projects = context.projects;
  // One clock for every budget label, so a grant cannot look active in one
  // row and expired in another because the page rendered across the boundary.
  const now = new Date();

  if (tenantId) {
    try {
      await materializeApprovedPairings(user.id, tenantId);
    } catch (error) {
      console.error("[agents] approved agents were not listed", error);
    }
  }
  const [mine, members, areas] = tenantId
    ? await Promise.all([
        prisma.agent.findMany({
          where: { ownerUserId: user.id, tenantId },
          orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            model: true,
            level: true,
            burst: true,
            burstUntil: true,
            createdAt: true,
            revokedAt: true,
            defaultProjectId: true,
            apiKeys: {
              where: { revokedAt: null },
              select: {
                id: true,
                prefix: true,
                sealedKey: true,
                lastUsedAt: true,
                project: { select: { id: true, name: true } },
              },
            },
            areaPreferences: { select: { projectAreaId: true, projectArea: { select: { projectId: true } } } },
          },
        }),
        prisma.membership.findMany({
          where: { tenantId },
          orderBy: { user: { name: "asc" } },
          select: {
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                agents: {
                  where: { tenantId, revokedAt: null },
                  orderBy: { createdAt: "asc" },
                  select: {
                    id: true, name: true, model: true, level: true, burst: true, burstUntil: true, defaultProjectId: true,
                    areaPreferences: { select: { projectAreaId: true, projectArea: { select: { projectId: true } } } },
                  },
                },
              },
            },
          },
        }),
        prisma.projectArea.findMany({
          where: { projectId: { in: projects.map((project) => project.id) } },
          orderBy: [{ projectId: "asc" }, { name: "asc" }],
          select: { id: true, name: true, projectId: true },
        }),
      ])
    : [[], [], []];

  const ownLevels = settableLevels({ isOwner: true, isTenantAdmin: isAdmin });
  const adminLevels = settableLevels({ isOwner: false, isTenantAdmin: true });

  // Decrypt each key once: the summary counts unreadable seals and the row
  // still needs the raw value for its copy button.
  const ownAgents = mine.map((agent) => ({
    ...agent,
    keys: agent.apiKeys.map((key) => ({ ...key, rawKey: revealAgentKey(key.sealedKey) })),
  }));
  const activeAgents = ownAgents.filter((agent) => !agent.revokedAt);
  const legacyKeyCount = ownAgents.reduce(
    (count, agent) =>
      agent.revokedAt
        ? count
        : count + agent.keys.filter((key) => key.rawKey === null).length,
    0,
  );
  const coveredLevels = new Set(activeAgents.map((agent) => agent.level));
  const meterPercent = Math.min(
    100,
    Math.round((activeAgents.length / MAX_ACTIVE_AGENTS_PER_OWNER) * 100),
  );

  const needle = query.toLowerCase();
  const visibleAgents = ownAgents.filter((agent) => {
    if (roleFilter !== "all" && agent.level !== roleFilter) return false;
    if (!needle) return true;
    return `${agent.name} ${agent.model ?? ""}`.toLowerCase().includes(needle);
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <Link
          href="/settings"
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
          Back to settings
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[640px] flex-col gap-1.5">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
              Your agents
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              Each agent has its own key. Copy sends that key and this site to that agent only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/settings/agents/connect"
              className={`inline-flex h-[42px] items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-tint ${focusRing}`}
            >
              Connect your agent
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
            <Link
              href="/settings/audit"
              className={`inline-flex h-[42px] items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-tint ${focusRing}`}
            >
              Agent audit log
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
            <Link
              href="/settings/agents/new"
              className={`inline-flex h-[42px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(46,111,239,0.30)] transition-colors hover:bg-electric-blue-strong ${focusRing}`}
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create agent
            </Link>
          </div>
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
        <>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <section
              className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5"
              aria-label="Active agents"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-bold text-ink">Active agents</h2>
                <span className="text-[13px] text-muted">limit {MAX_ACTIVE_AGENTS_PER_OWNER}</span>
              </div>
              <p className="text-[30px] font-extrabold leading-none text-ink">
                {activeAgents.length}{" "}
                <span className="text-base font-semibold text-muted">
                  / {MAX_ACTIVE_AGENTS_PER_OWNER}
                </span>
              </p>
              <div
                className="h-2 overflow-hidden rounded-full bg-tint"
                role="progressbar"
                aria-label="Active agent allowance"
                aria-valuemin={0}
                aria-valuemax={MAX_ACTIVE_AGENTS_PER_OWNER}
                aria-valuenow={activeAgents.length}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${meterPercent}%` }} />
              </div>
            </section>

            <section
              className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5"
              aria-label="Roles covered"
            >
              <h2 className="text-[15px] font-bold text-ink">Roles covered</h2>
              <div className="flex flex-wrap gap-1.5">
                {AGENT_LEVELS.map((level) =>
                  coveredLevels.has(level) ? (
                    <span
                      key={level}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${AGENT_LEVEL_TONE[level]}`}
                    >
                      {AGENT_LEVEL_LABELS[level]}
                    </span>
                  ) : (
                    <span
                      key={level}
                      className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-bold text-muted"
                    >
                      {AGENT_LEVEL_LABELS[level]}
                    </span>
                  ),
                )}
              </div>
            </section>

            {legacyKeyCount > 0 ? (
              <section
                className="flex items-start gap-3 rounded-[20px] border border-warn-bd bg-warn-bg p-5"
                aria-label="Keys that can't be copied"
              >
                <svg
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-warn-fg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
                <div className="flex flex-col gap-1">
                  <h2 className="text-sm font-bold text-warn-fg">
                    {legacyKeyCount} {legacyKeyCount === 1 ? "key can't" : "keys can't"} be copied
                  </h2>
                  <p className="text-[13px] leading-relaxed text-ink-2">
                    They were issued before keys could be copied again. Regenerate a key to get a copyable one — the new key stays on the same row.
                  </p>
                </div>
              </section>
            ) : (
              <section
                className="flex items-start gap-3 rounded-[20px] border border-line bg-tint p-5"
                aria-label="Keys can be copied"
              >
                <MeterIcon />
                <div className="flex flex-col gap-1">
                  <h2 className="text-sm font-bold text-ink">Every live key can be copied</h2>
                  <p className="text-[13px] leading-relaxed text-ink-2">
                    Copy sends the key and this site to that agent only. The secret never appears on this page.
                  </p>
                </div>
              </section>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <form action="/settings/agents" method="get" role="search" className="min-w-0 flex-[1_1_260px] max-w-[360px]">
              {roleFilter !== "all" ? <input type="hidden" name="role" value={roleFilter} /> : null}
              <label className="relative flex h-[42px] items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-surface">
                <span className="sr-only">Search agents</span>
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Search agents or models"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                />
              </label>
            </form>

            <div
              role="tablist"
              aria-label="Filter by role"
              className="flex flex-wrap gap-0.5 rounded-full bg-seg p-1"
            >
              {ROLE_TABS.map((role) => {
                const active = roleFilter === role;
                return (
                  <Link
                    key={role}
                    href={rosterHref(role, query)}
                    role="tab"
                    aria-selected={active}
                    className={`inline-flex min-h-[34px] items-center rounded-full px-3.5 text-[13px] transition-colors ${focusRing} ${
                      active
                        ? "bg-surface font-bold text-ink shadow-sm"
                        : "font-medium text-ink-2 hover:text-ink"
                    }`}
                  >
                    {role === "all" ? "All" : AGENT_LEVEL_LABELS[role]}
                  </Link>
                );
              })}
            </div>
          </div>

          <section aria-labelledby="mine-heading" className="flex flex-col gap-3.5">
            <h2 id="mine-heading" className="sr-only">
              Your agents
            </h2>

            {ownAgents.length === 0 ? (
              <FirstAgentEmptyState />
            ) : visibleAgents.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-line bg-surface p-12 text-center text-sm text-muted">
                No agents match this search.{" "}
                <Link href="/settings/agents" className="font-semibold text-accent hover:underline">
                  Clear filters
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {visibleAgents.map((agent) => {
                  const lastUsed = agent.keys.reduce<Date | null>((latest, key) => {
                    if (!key.lastUsedAt) return latest;
                    return !latest || key.lastUsedAt > latest ? key.lastUsedAt : latest;
                  }, null);

                  return (
                    <article
                      key={agent.id}
                      id={`agent-${agent.id}`}
                      className="flex scroll-mt-24 flex-col gap-4 rounded-[20px] border border-line bg-surface p-5 sm:px-[22px]"
                    >
                      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                        <div className="flex min-w-0 flex-[999_1_380px] items-start gap-3.5">
                          <span
                            aria-hidden="true"
                            className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[17px] font-extrabold text-white ${agentAvatarTone(agent.name)}`}
                          >
                            {initialsOf(agent.name)}
                            <span
                              className={`absolute -bottom-[3px] -right-[3px] h-3 w-3 rounded-full border-2 border-surface ${
                                agent.revokedAt
                                  ? "bg-[#94A3B8]"
                                  : agent.keys.length > 0
                                    ? "bg-[#22C55E]"
                                    : "bg-[#94A3B8]"
                              }`}
                            />
                          </span>
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-words text-[17px] font-bold text-ink">{agent.name}</h3>
                              <span
                                className={`rounded-full px-2.5 py-[3px] text-xs font-bold ${AGENT_LEVEL_TONE[agent.level]}`}
                              >
                                {AGENT_LEVEL_LABELS[agent.level]}
                              </span>
                              {agent.defaultProjectId ? (
                                <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-bold text-ink-2">
                                  Personal
                                </span>
                              ) : null}
                              {agent.revokedAt ? (
                                <span className="rounded-full bg-bad-bg px-2 py-0.5 text-[11px] font-bold text-bad-fg">
                                  Revoked
                                </span>
                              ) : null}
                            </div>
                            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-ink-2">
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
                                  <rect x="4" y="4" width="16" height="16" rx="3" />
                                  <path d="M9 9h6v6H9z" />
                                </svg>
                                {agent.model || "No model set"}
                              </span>
                              <span aria-hidden="true">·</span>
                              {agent.revokedAt ? (
                                <span>
                                  Revoked <LocalTime date={agent.revokedAt} />
                                </span>
                              ) : (
                                <span>
                                  {lastUsed ? (
                                    <>
                                      Last used <RelativeTime date={lastUsed} />
                                    </>
                                  ) : (
                                    "Never used"
                                  )}
                                </span>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>
                                Added <LocalTime date={agent.createdAt} />
                              </span>
                            </p>
                            <Link
                              href={`/settings/agents/${agent.id}/messages`}
                              className={`inline-flex min-h-8 items-center gap-1.5 self-start text-[13px] font-bold text-accent transition-colors hover:text-electric-blue-strong ${focusRing}`}
                            >
                              <svg
                                aria-hidden="true"
                                className="h-[15px] w-[15px]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              Messages and instructions
                            </Link>
                          </div>
                        </div>
                      </div>

                      {agent.revokedAt ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-chip px-3.5 py-3">
                          <p className="text-xs text-muted">
                            This agent is revoked. Its keys no longer work.
                          </p>
                          <AgentControls
                            revoked
                            personal={Boolean(agent.defaultProjectId)}
                            agentId={agent.id}
                            agentName={agent.name}
                            level={agent.level}
                            levels={ownLevels}
                            projects={projects}
                            now={now}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col gap-2 rounded-[14px] bg-chip px-3.5 py-3">
                            {agent.keys.length === 0 ? (
                              <p className="text-xs text-muted">
                                No key yet. Use Regenerate key below to issue one, then copy it to the agent.
                              </p>
                            ) : (
                              agent.keys.map((key, index) => (
                                <div
                                  key={key.id}
                                  className={index > 0 ? "border-t border-line pt-2" : ""}
                                >
                                  <AgentRowKey
                                    apiKey={key.rawKey}
                                    prefix={key.prefix}
                                    projectId={key.project?.id ?? null}
                                    projectName={key.project?.name ?? null}
                                  />
                                </div>
                              ))
                            )}
                          </div>

                          <AgentControls
                            personal={Boolean(agent.defaultProjectId)}
                            agentId={agent.id}
                            agentName={agent.name}
                            level={agent.level}
                            levels={ownLevels}
                            projects={projects}
                            currentProjectId={agent.keys.find((key) => key.project)?.project?.id}
                            burst={agent.burst}
                            burstUntil={agent.burstUntil}
                            now={now}
                            canSetBurst={isAdmin}
                            areas={areas}
                            areaPreferences={agent.areaPreferences.map((preference) => ({
                              projectId: preference.projectArea.projectId,
                              projectAreaId: preference.projectAreaId,
                            }))}
                          />
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section
            className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5 sm:p-6"
            aria-labelledby="team-heading"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h2 id="team-heading" className="text-lg font-bold text-ink">
                  Team
                </h2>
                <p className="text-sm text-muted">Everyone in your team and the agents working for them.</p>
              </div>
              <span className="text-xs font-semibold text-muted">
                {members.length} {members.length === 1 ? "person" : "people"}
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-divider">
              {members.map(({ role, user: member }) => (
                <li key={member.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Avatar name={member.name} size="sm" />
                    <Link
                      href={`/users/${member.id}`}
                      className={`text-sm font-bold text-ink hover:text-accent ${focusRing}`}
                    >
                      {member.name}
                    </Link>
                    {role !== "member" ? (
                      <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-bold text-ink-2">
                        {role === "owner" ? "Owner" : "Admin"}
                      </span>
                    ) : null}
                    {member.id === user.id ? (
                      <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] font-bold text-accent">
                        You
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted">
                      {member.agents.length} {member.agents.length === 1 ? "agent" : "agents"}
                    </span>
                  </div>
                  {member.agents.length === 0 ? (
                    <p className="mt-1.5 pl-9 text-xs text-muted">
                      No agents yet — register one or approve an agent request.
                    </p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-2 pl-9">
                      {member.agents.map((agent) => (
                        <li
                          key={agent.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-chip px-3 py-2"
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink-2">
                            <span className="font-semibold text-ink">{agent.name}</span>
                            {agent.model ? <span className="text-xs text-muted">· {agent.model}</span> : null}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${AGENT_LEVEL_TONE[agent.level]}`}
                            >
                              {AGENT_LEVEL_LABELS[agent.level]}
                            </span>
                            {isAdmin && member.id !== user.id ? (
                              <Link
                                href={`/settings/agents/${agent.id}/messages`}
                                className={`text-xs font-semibold text-accent hover:underline ${focusRing}`}
                              >
                                Message
                              </Link>
                            ) : null}
                          </span>
                          {isAdmin && member.id !== user.id ? (
                            <details className="w-full sm:w-auto">
                              <summary
                                className={`inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-bold text-accent hover:text-electric-blue-strong ${focusRing}`}
                              >
                                Manage
                                <svg
                                  aria-hidden="true"
                                  className="h-3 w-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m6 9 6 6 6-6" />
                                </svg>
                              </summary>
                              <div className="mt-3 w-full min-w-0 max-w-md rounded-xl border border-line bg-surface p-3">
                                <AgentControls
                                  compact
                                  personal={Boolean(agent.defaultProjectId)}
                                  agentId={agent.id}
                                  agentName={agent.name}
                                  level={agent.level}
                                  levels={adminLevels}
                                  projects={projects}
                                  currentProjectId={context.activeProjectId}
                                  burst={agent.burst}
                                  burstUntil={agent.burstUntil}
                                  now={now}
                                  canSetBurst
                                  areas={areas}
                                  areaPreferences={agent.areaPreferences.map((preference) => ({
                                    projectId: preference.projectArea.projectId,
                                    projectAreaId: preference.projectAreaId,
                                  }))}
                                />
                              </div>
                            </details>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section
            className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5 sm:p-6"
            aria-labelledby="levels-heading"
          >
            <div className="flex flex-col gap-1">
              <h2 id="levels-heading" className="text-lg font-bold text-ink">
                Levels
              </h2>
              <p className="text-sm text-muted">
                New agents start as observers. Give each level its own agent.
              </p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {AGENT_LEVELS.map((level) => (
                <div key={level} className="flex flex-col gap-1.5 rounded-2xl bg-chip p-4">
                  <dt className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${AGENT_LEVEL_TONE[level]}`}>
                      {AGENT_LEVEL_LABELS[level]}
                    </span>
                    {coveredLevels.has(level) ? (
                      <span className="text-[11px] font-semibold text-ok-fg">Covered</span>
                    ) : null}
                  </dt>
                  <dd className="text-[13px] leading-relaxed text-ink-2">
                    {AGENT_LEVEL_DESCRIPTIONS[level]}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs leading-relaxed text-muted">
              {SEPARATE_LEVEL_AGENTS} You can keep {MAX_ACTIVE_AGENTS_PER_OWNER} active agents in this workspace.{" "}
              {OWNER_REVIEW_LIMIT} Each agent may make 30 writes an hour, including reviews. An admin
              can turn on a higher budget of 400 writes an hour.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
