import Link from "next/link";
import type { Metadata } from "next";
import type { Severity } from "@prisma/client";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import {
  EMPTY_OVERVIEW,
  loadOwnAgents,
  loadWorkspaceOverview,
  type OverviewAssignedIssue,
  type WorkspaceOverview,
} from "@/lib/dashboard-overview";
import { DashboardAgents, type DashboardAgentView } from "@/components/dashboard-agents";
import { PointsChart } from "@/components/points-chart";
import { RelativeTime } from "@/components/relative-time";
import { VoteButton } from "@/components/vote-button";
import { Pill } from "@/components/pill";
import { formatIssueNumber } from "@/lib/issue-number";
import { severityLabel, statusLabels } from "@/lib/labels";
import { severityTone, stageTone, statusTone } from "@/lib/issue-tone";
import { TARGET_POINTS } from "@/lib/points/rules";
import { formatDateParam, parseDateParam } from "@/lib/dashboard-range";
import {
  POINT_PERIOD_META,
  buildPointChart,
  parsePointPeriod,
  resolvePointChartRange,
} from "@/lib/point-periods";
import { loadPointChart } from "@/lib/dashboard-points";

export const metadata: Metadata = { title: "Overview" };

type SearchParams = Promise<{
  chart?: string | string[];
  from?: string | string[];
  to?: string | string[];
}>;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function severityOf(value: string | null): Severity | null {
  if (!value) return null;
  return value in severityLabel ? (value as Severity) : null;
}

/** One of the four summary cards, with the design's hover lift + top line. */
function StatCard({
  label,
  value,
  href,
  chip,
  chipTone,
  note,
}: {
  label: string;
  value: string;
  href: string;
  chip: string;
  chipTone: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col gap-[18px] overflow-hidden rounded-[20px] border border-line bg-surface p-[22px] transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_14px_32px_rgba(11,23,51,0.08)] motion-reduce:transform-none motion-reduce:transition-none ${focusRing}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-primary via-sky-tint to-primary opacity-0 transition duration-300 group-hover:scale-x-100 group-hover:opacity-100 motion-reduce:transition-none"
      />
      <span className="flex items-center justify-between gap-3">
        <span className="text-base font-bold text-ink">{label}</span>
        <span
          aria-hidden="true"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors group-hover:border-primary/40 group-hover:bg-tint group-hover:text-accent"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </span>
      </span>
      <span className="text-[30px] font-extrabold leading-none text-ink">{value}</span>
      <span className="flex items-center gap-2 text-[13px] text-muted">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${chipTone}`}>{chip}</span>
        {note}
      </span>
    </Link>
  );
}

function IssueGlyph() {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint text-accent"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20a6 6 0 0 0 6-6V10a6 6 0 0 0-12 0v4a6 6 0 0 0 6 6zM12 20v-9M4 13h2M18 13h2M5 7l2 2M19 7l-2 2" />
      </svg>
    </span>
  );
}

/** The Overview table: real issues assigned to this person, by votes. */
function AssignedIssues({
  issues,
  total,
}: {
  issues: OverviewAssignedIssue[];
  total: number;
}) {
  const countLabel = `${total} ${total === 1 ? "issue" : "issues"}`;
  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-lg font-bold text-ink">Issues assigned to me</h2>
          <span className="text-[13px] text-muted">{countLabel} · sorted by top votes</span>
        </div>
        <Link
          href="/issues?mine=assigned"
          className={`inline-flex h-9 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-bold text-accent transition-colors hover:bg-tint ${focusRing}`}
        >
          View all issues
        </Link>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[840px]">
          <div className="flex items-center gap-4 rounded-full bg-tint px-4 py-3 text-xs font-bold uppercase tracking-[0.05em] text-accent">
            <span className="w-[52px]">Votes</span>
            <span className="min-w-0 flex-1">Issue</span>
            <span className="w-[92px]">Type</span>
            <span className="w-[96px]">Priority</span>
            <span className="w-[76px]">Status</span>
            <span className="w-[104px]">Stage</span>
            <span className="w-[84px]">Reported</span>
          </div>

          {issues.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
              <p className="font-bold text-ink">Nothing assigned to you</p>
              <p className="text-muted">Issues assigned to you will show up here.</p>
            </div>
          ) : (
            <ul>
              {issues.map((issue) => {
                const severity = severityOf(issue.severity);
                return (
                  <li
                    key={issue.id}
                    className="flex items-center gap-4 border-b border-divider px-4 py-3.5 last:border-b-0 hover:bg-row-sel"
                  >
                    <div className="w-[52px] shrink-0">
                      <VoteButton
                        bugId={issue.id}
                        voteCount={issue.voteCount}
                        userVote={issue.userVote}
                        size="sm"
                      />
                    </div>
                    <Link
                      href={`/issues/${issue.id}`}
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-md ${focusRing}`}
                    >
                      <IssueGlyph />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="line-clamp-1 text-sm font-semibold leading-snug text-ink">
                          {issue.title}
                        </span>
                        <span className="text-xs font-mono font-semibold text-muted">
                          {formatIssueNumber(issue.number)}
                        </span>
                      </span>
                    </Link>
                    <span className="w-[92px] shrink-0 truncate text-[13px] text-ink-2">
                      {issue.typeName ?? "—"}
                    </span>
                    <span className="w-[96px] shrink-0">
                      {severity ? (
                        <Pill className={severityTone[severity]}>{severityLabel[severity]}</Pill>
                      ) : (
                        <span className="text-[13px] text-muted">—</span>
                      )}
                    </span>
                    <span className="w-[76px] shrink-0">
                      <Pill className={statusTone[issue.status]} dot>
                        {statusLabels[issue.status]}
                      </Pill>
                    </span>
                    <span className="w-[104px] shrink-0">
                      {issue.stage ? (
                        <Pill className={stageTone[issue.stage]} dot>
                          {issue.stage === "reported"
                            ? "Reported"
                            : issue.stage === "confirmed"
                              ? "Confirmed"
                              : "Ready"}
                        </Pill>
                      ) : (
                        <span className="text-[13px] text-muted">—</span>
                      )}
                    </span>
                    <span className="w-[84px] shrink-0 text-[13px] text-ink-2">
                      <RelativeTime date={issue.createdAt} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <span className="text-[13px] text-muted">
        Showing {issues.length} of {countLabel}
      </span>
    </section>
  );
}

const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const now = new Date();

  let tenantId: string | null = null;
  try {
    tenantId = await currentTenantIdFor(user.id);
  } catch (error) {
    console.error("[dashboard] tenant resolution failed", error);
  }

  let overview: WorkspaceOverview = EMPTY_OVERVIEW;
  try {
    overview = await loadWorkspaceOverview({ userId: user.id, tenantId, now });
  } catch (error) {
    console.error("[dashboard] overview queries failed", error);
  }

  let agentRows: Awaited<ReturnType<typeof loadOwnAgents>> = [];
  try {
    agentRows = await loadOwnAgents({ userId: user.id, tenantId, now });
  } catch (error) {
    console.error("[dashboard] agents query failed", error);
  }

  const agents: DashboardAgentView[] = agentRows.map((agent) => ({
    ...agent,
    lastSeenAt: agent.lastSeenAt ? agent.lastSeenAt.toISOString() : null,
  }));

  const period = parsePointPeriod(firstParam(params.chart));
  const rawFrom = firstParam(params.from);
  const rawTo = firstParam(params.to);
  const fromDate = parseDateParam(rawFrom);
  const toDate = parseDateParam(rawTo);
  const chartFrom = fromDate ? formatDateParam(fromDate) : "";
  const chartTo = toDate ? formatDateParam(toDate) : "";

  let chart = buildPointChart({
    period,
    entries: [],
    range: resolvePointChartRange(period, { from: rawFrom, to: rawTo }, now),
    now,
  });
  try {
    chart = await loadPointChart({
      userId: user.id,
      tenantId,
      period,
      from: rawFrom,
      to: rawTo,
      now,
    });
  } catch (error) {
    console.error("[dashboard] point chart failed", error);
  }

  const userName = user.name ?? user.email;
  const pointsToGo = Math.max(0, TARGET_POINTS - overview.weekPoints);
  const targetMet = overview.weekPoints >= TARGET_POINTS;
  const resolvedPercent =
    overview.assignedToMe > 0
      ? Math.round((overview.resolvedAssignedToMe / overview.assignedToMe) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            Welcome back, {userName}
          </h1>
          <p className="text-sm text-muted">Issues, votes and your points at a glance.</p>
        </div>
        <Link
          href="/issues/new"
          className={`inline-flex h-[42px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(46,111,239,0.35)] transition hover:bg-electric-blue-strong ${focusRing}`}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New issue
        </Link>
      </div>

      <section
        aria-label="Your workspace at a glance"
        className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
      >
        <StatCard
          label="Points"
          value={overview.points.points.toLocaleString("en-US")}
          href="/leaderboard"
          chip={targetMet ? "Target met" : `${pointsToGo} to go`}
          chipTone={targetMet ? "bg-ok-bg text-ok-fg" : "bg-tint text-accent"}
          note={`${TARGET_POINTS} required this week`}
        />
        <StatCard
          label="Created by me"
          value={overview.reportedByMe.toLocaleString("en-US")}
          href="/issues?mine=created"
          chip={`+${overview.reportedLast30Days}`}
          chipTone={
            overview.reportedLast30Days > 0 ? "bg-ok-bg text-ok-fg" : "bg-chip text-ink-2"
          }
          note="in the last 30 days"
        />
        <StatCard
          label="Assigned to me"
          value={overview.assignedToMe.toLocaleString("en-US")}
          href="/issues?mine=assigned"
          chip={`${overview.assignedHighPriority}`}
          chipTone={
            overview.assignedHighPriority > 0 ? "bg-bad-bg text-bad-fg" : "bg-chip text-ink-2"
          }
          note="high priority"
        />
        <StatCard
          label="Resolved issues"
          value={overview.resolvedCount.toLocaleString("en-US")}
          href="/issues?status=finished&resolved=1"
          chip={`${resolvedPercent}%`}
          chipTone="bg-chip text-ink-2"
          note="of issues assigned to me"
        />
      </section>

      <AssignedIssues issues={overview.assignedIssues} total={overview.assignedToMe} />

      <PointsChart
        period={period}
        buckets={chart.buckets.map((bucket) => ({
          label: bucket.label,
          points: bucket.points,
        }))}
        total={chart.total}
        caption={POINT_PERIOD_META[period].caption}
        from={chartFrom}
        to={chartTo}
        today={formatDateParam(now)}
        target={period === "weekly" ? TARGET_POINTS : null}
      />

      <DashboardAgents initial={agents} />
    </div>
  );
}
