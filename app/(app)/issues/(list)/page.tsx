import Link from "next/link";
import { Suspense } from "react";
import type { Prisma, Severity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIssueTypes, getPlatforms } from "@/lib/lookups";
import { activeBulkOptions, loadBulkAssignees } from "@/lib/admin-list-lookups";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import type { AppRole } from "@/lib/roles";
import { IssueFilters } from "@/components/issue-filters";
import { RowAge, RowAssignee } from "@/components/issue-row-meta";
import { VoteButton } from "@/components/vote-button";
import { Pill } from "@/components/pill";
import {
  severityLabels,
  statusLabels,
} from "@/lib/labels";
import { severityTone, stageTone, statusTone } from "@/lib/issue-tone";
import { severities } from "@/lib/validations/issue";
import { boundSearchTerm, escapeSearchQuery, toSingleQueryParam } from "@/lib/search";
import {
  hasMatch,
  highlightSegments,
  markdownToPlain,
  matchSnippet,
  type Snippet,
} from "@/lib/search-snippet";
import { Highlighted, SearchSnippet } from "@/components/search-highlight";
import { formatIssueNumber, parseIssueNumberQuery } from "@/lib/issue-number";
import {
  SHOW_RESOLVED,
  SHOW_RESOLVED_PARAM,
  defaultStatusWhere,
  isDone,
  parseShowResolved,
  resultCountText,
  statusFilterWhere,
} from "@/lib/issue-state";
import { calculatePagination } from "@/lib/pagination";
import { issueListPaginationParams } from "@/lib/issue-list-pagination";
import { DUPLICATES_PARAM, SHOW_DUPLICATES, duplicatesWhere, parseShowDuplicates } from "@/lib/duplicates";
import { PaginationControls } from "@/components/pagination-controls";
import { fetchVoterSummaries } from "@/lib/voter-summaries";
import { dueDateValue, MILESTONE_PARAM, milestoneParamValue, milestoneWhere, parseMilestoneFilter } from "@/lib/milestones";
import { loadMilestoneSummaries } from "@/lib/milestone-stats";
import { MilestoneProgressBar } from "@/components/milestone-progress";
import { MilestoneDue } from "@/components/milestone-due";
import { createEmptyVoterSummary } from "@/lib/voters";
import {
  bugSortDescriptions,
  getBugOrderBy,
  parseBugSort,
} from "@/lib/issues-sort";
import { canDeleteTicket } from "@/lib/ticket-deletion";
import { currentTenantAccess } from "@/lib/tenant-access";
import type { OrganizationRole } from "@/lib/organization-role";
import { defaultSortFor, mineFilterWhere, parseMineFilter } from "@/lib/mine-filter";
import { finishedWatchedWhere } from "@/lib/watching";
import { UnwatchButton, UnwatchFinishedButton } from "@/components/unwatch-button";
import {
  BulkCheckbox,
  BulkSelectionProvider,
} from "@/components/bulk-selection";
import { parseTagFilter, serializeTags, tagTypeIds } from "@/lib/tag-filter";
import { bugInTenant, currentTenantIdFor, isMissingTenantColumnError } from "@/lib/tenant-context";
import { activeProjectIdFor } from "@/lib/project-context";
import { RichText } from "@/components/rich-text";
import { isOrganizationAdmin } from "@/lib/organization-role";
import { cookies } from "next/headers";
import { GettingStarted } from "@/components/getting-started";
import { GETTING_STARTED_COOKIE, gettingStartedFor, parseDismissed, type GettingStartedStep } from "@/lib/onboarding";
import {
  PLATFORM_PARAM,
  parsePlatformFilter,
  platformChoices,
  platformFilterWhere,
} from "@/lib/platform-filter";
import { PlatformTabs, type PlatformTab } from "@/components/platform-tabs";
import { LoadError } from "@/components/load-error";
import { logLoadFailure } from "@/lib/load-error";
import { AREA_PARAM, parseProjectAreaFilter, projectAreaFilterWhere } from "@/lib/project-area-filter";
import { intakeDetail, issueStageLabels, openIssueStages, parseIssueStageView, type IssueStage } from "@/lib/issue-stage";
import { issuePath } from "@/lib/issue-ref";
import { PROJECT_ALL_PARAM, showsAllProjects } from "@/lib/issue-list-filters";

/* Distinct browser-tab title; the root layout appends "· Ziki". */
export const metadata = { title: "Issues" };

type SearchParams = Promise<{
  q?: string | string[];
  status?: string | string[];
  severity?: string | string[];
  platform?: string | string[];
  area?: string | string[];
  sort?: string | string[];
  page?: string | string[];
  deleted?: string | string[];
  mine?: string | string[];
  tags?: string | string[];
  [key: string]: string | string[] | undefined;
}>;

function isSeverity(value: string | undefined): value is Severity {
  return !!value && (severities as readonly string[]).includes(value);
}

async function loadOrEmpty<T>(label: string, load: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[bugs] ${label} lookup failed`, error);
    return empty;
  }
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** The row's round type mark: shield for security, bug for fixes, a dot otherwise. */
function IssueGlyph({ typeName }: { typeName?: string | null }) {
  const name = (typeName ?? "").toLowerCase();
  const path = name.includes("security")
    ? "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
    : name.includes("bug") || name.includes("fix")
      ? "M12 20a6 6 0 0 0 6-6V10a6 6 0 0 0-12 0v4a6 6 0 0 0 6 6zM12 20v-9M4 13h2M18 13h2M5 7l2 2M19 7l-2 2"
      : "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16.5h.01";
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
        <path d={path} />
      </svg>
    </span>
  );
}

/** The database error stays in the server log under `reference` (#506). */
function issuesQueryError(reference: string, message?: string) {
  return (
    <LoadError title="Issues could not be loaded" reference={reference}>
      {message}
    </LoadError>
  );
}

export default async function BugsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  let userId: string | undefined;
  let effectiveRole: AppRole | null | undefined;
  let membershipRole: OrganizationRole | null = null;

  if (session?.user) {
    const user = await requireUser();
    userId = user.id;
    effectiveRole = user.role;
    membershipRole = (await currentTenantAccess(user.id, user.role)).membershipRole;
  }
  // #425: only issues in the viewer's tenant; none without a membership.
  let tenantId: string | null = null;
  let projectId: string | null = null;
  try {
    tenantId = await currentTenantIdFor(userId);
    projectId = await activeProjectIdFor(prisma, tenantId);
  } catch (error) {
    console.error("[bugs] tenant/project resolution failed", error);
  }
  const activeProject = tenantId && projectId
    ? await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { slug: true, name: true, goal: true } }).catch(() => null)
    : null;

  // #641: a short checklist for a new workspace's owner or admin, until it's
  // done or dismissed on this device.
  let gettingStarted: { tenantId: string; workspaceName: string; steps: GettingStartedStep[] } | null = null;
  if (tenantId && userId && membershipRole && isOrganizationAdmin(membershipRole, effectiveRole)) {
    try {
      const dismissed = parseDismissed((await cookies()).get(GETTING_STARTED_COOKIE)?.value);
      if (!dismissed.includes(tenantId)) {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } });
        if (tenant) {
          const checklist = await gettingStartedFor(prisma, tenantId, { tenantSlug: tenant.slug });
          if (!checklist.complete) gettingStarted = { tenantId, workspaceName: tenant.name, steps: checklist.steps };
        }
      }
    } catch (error) {
      console.error("[bugs] getting-started checklist failed", error);
    }
  }

  const canDelete = canDeleteTicket(effectiveRole, membershipRole);
  const params = await searchParams;
  const qParam = toSingleQueryParam(params.q);
  const statusParam = toSingleQueryParam(params.status);
  const severityParam = toSingleQueryParam(params.severity);
  const sortParam = toSingleQueryParam(params.sort);
  const pageParam = toSingleQueryParam(params.page);
  const deletedParam = toSingleQueryParam(params.deleted);
  const mineFilter = parseMineFilter(params.mine);
  const isDeletedView = canDelete && deletedParam === "true";
  // Workspace-wide view (dashboard links). Absent → unchanged project scope.
  const allProjects = showsAllProjects(params[PROJECT_ALL_PARAM]);

  const currentSort = parseBugSort(sortParam, defaultSortFor(mineFilter));
  const isWatchingView = mineFilter === "watching" && !!userId;
  // #285: duplicates are hidden unless asked for, and the count says so.
  const showDuplicates = parseShowDuplicates(params[DUPLICATES_PARAM]);
  const where: Prisma.BugWhereInput = {
    ...bugInTenant(tenantId),
    ...(projectId && !allProjects ? { projectId } : {}),
    isDeleted: isDeletedView,
    ...mineFilterWhere(mineFilter, userId),
    ...duplicatesWhere(showDuplicates),
  };

  // Tag filter (#102): issue types picked from the search box.
  // These lookups are filters only. Each one fails on its own: Promise.all
  // used to throw away the ones that succeeded when Milestone was missing,
  // and the admin path below then queried them again outside this catch.
  const [tagTypes, platforms, milestones, areas, userPrefs] = await Promise.all([
    // Cached, expired by the admin actions that change them (#297).
    loadOrEmpty("issue types", () => getIssueTypes(tenantId), []),
    // Every platform, not just active ones: a link filtered on a platform
    // that was since deactivated still has to resolve. BugFilters narrows
    // the dropdown itself.
    loadOrEmpty("platforms", () => getPlatforms(tenantId), []),
    // #289: few rows; closed ones too, so an old link still resolves.
    loadOrEmpty(
      "milestones",
      () =>
        tenantId
          ? prisma.milestone.findMany({
              where: { tenantId },
              select: { id: true, title: true, isClosed: true },
              orderBy: [{ isClosed: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
            })
          : Promise.resolve([]),
      [],
    ),
    loadOrEmpty(
      "project areas",
      () => projectId
        ? prisma.projectArea.findMany({ where: { projectId }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] })
        : Promise.resolve([]),
      [],
    ),
    userId && prisma.user?.findUnique
      ? prisma.user
          .findUnique({
            where: { id: userId },
            select: { keyboardShortcuts: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const shortcutsEnabled = userPrefs?.keyboardShortcuts ?? true;
  const selectedMilestone = parseMilestoneFilter(params[MILESTONE_PARAM], milestones);
  const milestoneParam = milestoneParamValue(selectedMilestone);
  const selectedTags = parseTagFilter(params.tags, tagTypes);
  if (selectedTags.length > 0) {
    where.typeId = { in: tagTypeIds(selectedTags, tagTypes) };
  }
  const tagsParam = serializeTags(selectedTags.map((t) => t.name));

  const statusWhere = statusFilterWhere(statusParam);
  // #1058: with no status filter, only live work shows unless resolved
  // issues were asked for. The deleted view keeps showing everything.
  const showResolved = parseShowResolved(params[SHOW_RESOLVED_PARAM]);
  const hidesResolved = statusWhere === undefined && !isDeletedView && !showResolved;
  if (statusWhere !== undefined) {
    where.status = statusWhere;
  } else if (hidesResolved) {
    where.status = defaultStatusWhere(false);
  }
  if (isSeverity(severityParam)) {
    where.severity = severityParam;
  }
  // Platform filter: one category, or the issues with none set.
  const selectedPlatform = parsePlatformFilter(params.platform, platforms);
  Object.assign(where, platformFilterWhere(selectedPlatform));
  const selectedArea = parseProjectAreaFilter(params[AREA_PARAM], areas);
  Object.assign(where, projectAreaFilterWhere(selectedArea));
  Object.assign(where, milestoneWhere(selectedMilestone));
  if (qParam?.trim()) {
    const q = escapeSearchQuery(boundSearchTerm(qParam));
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
    // "42" or "#42" should also find issue #42, which is how people quote an
    // issue to each other. Left as an OR so a title containing "42" still
    // matches too, rather than the number silently hijacking the search.
    const asNumber = parseIssueNumberQuery(qParam);
    if (asNumber !== null) where.OR.push({ number: asNumber });
  }

  // #1055: every tab counts what the other filters match, whatever platform
  // is picked, so switching tabs never surprises.
  const { categoryId: _platformClause, ...platformTabWhere } = where;
  void _platformClause;

  let totalCount = 0;
  try {
    totalCount = await prisma.bug.count({ where });
  } catch (error) {
    const reference = logLoadFailure("[bugs] list count failed", error);
    const missingColumn = isMissingTenantColumnError(error);
    if (!tenantId) {
      // No membership: nothing to show either way (#439).
      totalCount = 0;
      if (missingColumn) {
        delete where.tenantId;
        delete where.projectId;
        where.id = { in: [] };
      }
    } else if (missingColumn) {
      // #506: never retry without the tenant filter. That used to show every
      // tenant's issues to anyone whose query error mentioned the column.
      return issuesQueryError(
        reference,
        "The issue list is unavailable while the database finishes upgrading. Try again in a minute.",
      );
    } else {
      return issuesQueryError(reference);
    }
  }

  const stageView = isDeletedView ? null : parseIssueStageView(toSingleQueryParam(params.stage));
  let stages = new Map<string, IssueStage>();
  if (!isDeletedView) {
    try {
      stages = await openIssueStages(prisma, where);
    } catch (error) {
      console.error("[bugs] issue stage lookup failed", error);
    }
    if (stageView) {
      const ids = [...stages.entries()].filter(([, stage]) => stage === stageView).map(([id]) => id);
      where.id = { in: ids };
      try {
        totalCount = await prisma.bug.count({ where });
      } catch (error) {
        console.error("[bugs] stage count failed", error);
        totalCount = 0;
      }
    }
  }

  const isResolvedView = statusParam === "resolved";

  let platformTabs: PlatformTab[] = [];
  if (!isDeletedView) {
    try {
      const { status: _tabStatus, ...baseTabWhere } = platformTabWhere;
      void _tabStatus;
      const liveTabWhere: Prisma.BugWhereInput = {
        ...baseTabWhere,
        status: defaultStatusWhere(false),
      };

      const [grouped, resolvedCount] = await Promise.all([
        prisma.bug.groupBy({
          by: ["categoryId"],
          where: liveTabWhere,
          _count: { _all: true },
        }),
        prisma.bug.count({
          where: {
            ...baseTabWhere,
            status: "resolved",
          },
        }),
      ]);

      const counts = new Map(grouped.map((row) => [row.categoryId, row._count._all]));
      const all = grouped.reduce((sum, row) => sum + row._count._all, 0);

      const choices = platformChoices(platforms, selectedPlatform);
      if (choices.length > 0) {
        platformTabs = [
          { id: null, name: "All", count: all },
          // Active platforms, plus a deactivated one if a link picked it.
          ...choices.map((platform) => ({
            id: platform.id,
            name: platform.name,
            count: counts.get(platform.id) ?? 0,
          })),
          {
            id: "resolved",
            name: "Resolved",
            count: resolvedCount,
            icon: (
              <svg
                className="h-4 w-4 shrink-0 text-emerald-600"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ),
          },
        ];
      }
    } catch (error) {
      console.error("[bugs] platform tab counts failed", error);
    }
  }
  const platformHref = (id: string | null) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page" || key === PLATFORM_PARAM) continue;
      if (key === "status" && toSingleQueryParam(value) === "resolved") continue;
      if (key === SHOW_RESOLVED_PARAM) continue;
      const single = toSingleQueryParam(value);
      if (single) next.set(key, single);
    }
    if (id === "resolved") {
      next.set("status", "resolved");
    } else if (id) {
      next.set(PLATFORM_PARAM, id);
    }
    const qs = next.toString();
    return qs ? `/issues?${qs}` : "/issues";
  };

  // How many resolved/closed issues the default view hides (#1058).
  let hiddenResolved = 0;
  if (hidesResolved) {
    try {
      hiddenResolved = await prisma.bug.count({
        where: { ...platformTabWhere, ...platformFilterWhere(selectedPlatform), status: { in: ["resolved", "closed"] } },
      });
    } catch (error) {
      console.error("[bugs] resolved count failed", error);
    }
  }
  const resolvedHref = (() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = toSingleQueryParam(value);
      if (single && key !== SHOW_RESOLVED_PARAM && key !== "page") next.set(key, single);
    }
    if (!showResolved) next.set(SHOW_RESOLVED_PARAM, SHOW_RESOLVED);
    const qs = next.toString();
    return qs ? `/issues?${qs}` : "/issues";
  })();

  // How many the default view is hiding, so "Show duplicates" can say so.
  let hiddenDuplicates = 0;
  if (!showDuplicates) {
    try {
      hiddenDuplicates = await prisma.bug.count({
        where: { ...where, duplicateOfId: { not: null } },
      });
    } catch (error) {
      console.error("[bugs] duplicate count failed", error);
    }
  }
  const duplicatesHref = (() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = Array.isArray(value) ? value[0] : value;
      if (v && key !== DUPLICATES_PARAM && key !== "page") next.set(key, v);
    }
    if (!showDuplicates) next.set(DUPLICATES_PARAM, SHOW_DUPLICATES);
    const qs = next.toString();
    return qs ? `/issues?${qs}` : "/issues";
  })();

  const pagination = calculatePagination({
    page: pageParam,
    totalCount,
  });

  // Select only what the list shows: no `description` (up to 5000 chars
  // each), which the list never displays (#217).
  const listed = await prisma.bug
    .findMany({
      where,
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        severity: true,
        voteCount: true,
        isDeleted: true,
        isBoosted: true,
        duplicateOf: showDuplicates ? { select: { number: true } } : false,
        createdAt: true,
        updatedAt: true,
        type: { select: { name: true } },
        reporter: { select: { name: true, role: true, image: true } },
        assignee: { select: { name: true, role: true, image: true } },
        category: { select: { id: true, name: true } },
        area: { select: { id: true, name: true } },
        votes: userId
          ? { where: { userId }, select: { id: true, value: true }, take: 1 }
          : false,
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
      // A personal list reads newest-activity-first; boosts are for the shared one.
      orderBy: getBugOrderBy(currentSort, { boostFirst: !isWatchingView }),
      skip: pagination.skip,
      take: pagination.take,
    })
    .then((bugs) => ({ bugs }))
    .catch((error: unknown) => ({ reference: logLoadFailure("[bugs] list query failed", error) }));
  if ("reference" in listed) {
    return issuesQueryError(listed.reference);
  }
  const bugs = listed.bugs;

  // #301: when searching, show why a row matched. Only rows whose title
  // doesn't already contain the query need their description, so the list
  // query still never selects it (#217) and a search whose hits are all in
  // titles costs nothing extra. No search → no query at all.
  const searchText = qParam?.trim() ?? "";
  const snippets = new Map<string, Snippet>();
  if (searchText) {
    const needDescription = bugs
      .filter((bug) => !hasMatch(bug.title, searchText))
      .map((bug) => bug.id);
    if (needDescription.length > 0) {
      try {
        const rows = await prisma.bug.findMany({
          where: { id: { in: needDescription } },
          select: { id: true, description: true },
        });
        for (const row of rows) {
          const snippet = matchSnippet(markdownToPlain(row.description), searchText);
          if (snippet) snippets.set(row.id, snippet);
        }
      } catch (error) {
        // A snippet is a nicety; the results themselves are already loaded.
        console.error("[bugs] search snippets failed", error);
      }
    }
  }

  const bugIds = bugs.map((bug) => bug.id);

  // #289: filtering on one milestone shows its progress above the list.
  let milestoneSummary: Awaited<ReturnType<typeof loadMilestoneSummaries>>[number] | null = null;
  if (selectedMilestone && selectedMilestone !== "none") {
    try {
      [milestoneSummary] = await loadMilestoneSummaries({
        id: selectedMilestone.id,
        tenantId: tenantId ?? undefined,
      });
    } catch (error) {
      console.error("[bugs] milestone summary failed", error);
    }
  }

  // "No issues match" and "there are no issues yet" need different pages
  // (#292): filter advice on an empty tracker sends people looking for a
  // filter that is not there. The extra count only runs when the page is
  // already empty, so a populated list pays nothing for it. It counts the
  // same scope the list shows, including ?project=all, so an empty filter
  // across a busy workspace is "no issues match", not "no issues yet".
  let isFirstRun = false;
  if (totalCount === 0 && !isDeletedView) {
    try {
      isFirstRun = (await prisma.bug.count({
        where: {
          ...bugInTenant(tenantId),
          ...(projectId && !allProjects ? { projectId } : {}),
          isDeleted: false,
        },
      })) === 0;
    } catch {
      isFirstRun = false;
    }
  }

  // Only the watching view offers "stop watching the finished ones", and
  // only when there are some; everyone else pays for nothing (#312).
  let finishedWatched = 0;
  if (isWatchingView && userId) {
    try {
      finishedWatched = await prisma.bug.count({
        where: { ...finishedWatchedWhere(userId), ...bugInTenant(tenantId) },
      });
    } catch (error) {
      console.error("[bugs] finished watched count failed", error);
    }
  }

  // Only admins get bulk actions. The type and platform menus reuse the
  // lookups above, which already survived a missing table. The assignee
  // query is the one extra read, and it must not take the list down either.
  const bulkTypes = canDelete ? activeBulkOptions(tagTypes) : [];
  const bulkPlatforms = canDelete ? activeBulkOptions(platforms) : [];
  const bulkUsers = canDelete ? await loadBulkAssignees(tenantId) : [];

  let voterSummaries = new Map<string, ReturnType<typeof createEmptyVoterSummary>>();
  try {
    voterSummaries = await fetchVoterSummaries(bugIds);
  } catch (error) {
    console.error("[bugs] voter summaries failed", error);
    voterSummaries = new Map();
  }

  // The key is the current query string, so changing a filter or a page
  // remounts the provider and clears the selection — which is what the bar
  // tells the user will happen.
  const selectionKey = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => {
      const single = toSingleQueryParam(v);
      return single ? [[k, single] as [string, string]] : [];
    }),
  ).toString();

  const reportedCount = [...stages.values()].filter((stage) => stage === "reported").length;
  const confirmedCount = [...stages.values()].filter((stage) => stage === "confirmed").length;
  const readyCount = [...stages.values()].filter((stage) => stage === "ready").length;

  // The shell already provides the persistent sidebar; this page is one column.
  const page = (
    <div className="min-w-0 space-y-6">
      {gettingStarted ? <GettingStarted {...gettingStarted} /> : null}

      {activeProject?.goal ? (
        <section
          aria-labelledby="project-goal-heading"
          className="rounded-[20px] border border-line bg-surface px-5 py-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="project-goal-heading" className="text-sm font-bold text-ink">
              {activeProject.name} goal
            </h2>
            {membershipRole && isOrganizationAdmin(membershipRole, effectiveRole) ? (
              <Link
                href={`/projects/${encodeURIComponent(activeProject.slug)}/settings`}
                className={`text-xs font-bold text-accent underline ${focusRing}`}
              >
                Edit project settings
              </Link>
            ) : null}
          </div>
          <RichText content={activeProject.goal} className="mt-1 text-sm" />
        </section>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
              {/* #1063: the project is the heading; "Ziki" is in the header. */}
              {isDeletedView ? "Deleted Issues" : (activeProject?.name ?? "Issues")}
            </h1>
            {isDeletedView ? <Pill className="bg-bad-bg text-bad-fg">Admin view</Pill> : null}
            {allProjects && !isDeletedView ? (
              <Pill className="bg-tint text-accent">All projects</Pill>
            ) : null}
          </div>
          {isDeletedView ? null : (
            <p className="max-w-xl text-sm text-muted">
              {allProjects
                ? "Every issue in this workspace, across all projects."
                : `Every bug and security report for ${activeProject?.name ?? "this workspace"}, ranked by what the community votes up.`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {canDelete ? (
            <Link
              href={isDeletedView ? "/issues" : "/issues?deleted=true"}
              className={`inline-flex h-[42px] items-center justify-center rounded-full border px-4 text-sm font-bold transition-colors ${focusRing} ${
                isDeletedView
                  ? "border-line bg-surface text-ink hover:bg-tint"
                  : "border-bad-bd bg-bad-soft text-bad-fg hover:bg-bad-bg"
              }`}
            >
              {isDeletedView ? "← View active issues" : "View deleted issues"}
            </Link>
          ) : null}
          {finishedWatched > 0 ? <UnwatchFinishedButton count={finishedWatched} /> : null}
          <Link
            href="/issues/new"
            className={`inline-flex h-[42px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(46,111,239,0.35)] transition-colors hover:bg-electric-blue-strong ${focusRing}`}
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
      </div>

      <div className="flex flex-col gap-4">
        {isFirstRun ? null : (
          <Suspense fallback={<div className="h-[42px] animate-pulse rounded-full bg-chip" />}>
            <IssueFilters
              leading={
                <PlatformTabs
                  tabs={platformTabs}
                  current={isResolvedView ? "resolved" : selectedPlatform}
                  hrefFor={platformHref}
                />
              }
              tagTypes={tagTypes}
              platforms={platforms}
              milestones={milestones}
              areas={areas}
              shortcutsEnabled={shortcutsEnabled}
              stageCounts={isDeletedView ? undefined : { reported: reportedCount, confirmed: confirmedCount, ready: readyCount }}
            />
          </Suspense>
        )}

        {milestoneSummary ? (
          <section
            aria-label={`Milestone ${milestoneSummary.title}`}
            className="rounded-[20px] border border-line bg-surface p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-ink">{milestoneSummary.title}</h2>
              <MilestoneDue due={dueDateValue(milestoneSummary.dueDate) || null} isClosed={milestoneSummary.isClosed} />
              <Link href="/milestones" className={`ml-auto text-sm font-bold text-accent hover:underline ${focusRing}`}>
                All milestones
              </Link>
            </div>
            {milestoneSummary.description ? (
              <p className="mt-1 text-sm text-muted">{milestoneSummary.description}</p>
            ) : null}
            <div className="mt-3 max-w-md">
              <MilestoneProgressBar progress={milestoneSummary.progress} label={milestoneSummary.title} />
            </div>
          </section>
        ) : null}

        {isFirstRun ? (
          <FirstRunWelcome isAdmin={canDelete} hasTenant={Boolean(tenantId)} />
        ) : (
          <section className="flex flex-col min-w-0 gap-3.5 rounded-[20px] border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2.5">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h2 className="text-lg font-bold text-ink">
                  {isDeletedView ? "Deleted issues" : "All issues"}
                </h2>
                {/* #690: announce the result count so screen readers hear
                    "N results" after a search lands. */}
                <p role="status" aria-live="polite" className="text-[13px] text-muted">
                  {resultCountText(totalCount, statusWhere !== undefined ? statusParam ?? null : null)} · sorted by{" "}
                  {bugSortDescriptions[currentSort]}
                  {hiddenResolved > 0 || (showResolved && statusWhere === undefined && !isDeletedView) ? (
                    <>
                      {" · "}
                      <Link href={resolvedHref} className="font-bold text-accent hover:underline print:hidden">
                        {showResolved ? "Hide resolved" : `Show ${hiddenResolved} resolved`}
                      </Link>
                    </>
                  ) : null}
                  {hiddenDuplicates > 0 || showDuplicates ? (
                    <>
                      {" · "}
                      <Link href={duplicatesHref} className="font-bold text-accent hover:underline print:hidden">
                        {showDuplicates
                          ? "Hide duplicates"
                          : `Show ${hiddenDuplicates} duplicate${hiddenDuplicates === 1 ? "" : "s"}`}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto min-w-0">
              <div className="min-w-[900px]">
                {bugs.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
                    <p className="font-bold text-ink">
                      {isWatchingView && !qParam && !statusParam && !severityParam && !tagsParam && !selectedPlatform && !selectedMilestone
                        ? "You're not watching any issues."
                        : "No issues match these filters."}
                    </p>
                    <p className="text-muted">
                      {isWatchingView
                        ? "You watch issues you report, are assigned to or comment on, and any you choose to watch from the issue page."
                        : "Try clearing filters, or report it with New issue at the top."}
                    </p>
                    <Link
                      href="/issues"
                      className={`mt-2 text-sm font-bold text-accent hover:underline ${focusRing}`}
                    >
                      Clear filters
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-4 rounded-full bg-tint px-4 py-3 text-xs font-bold uppercase tracking-[0.05em] text-accent">
                      {canDelete && !isDeletedView ? <span aria-hidden="true" className="w-4" /> : null}
                      <span className="w-[52px]">Votes</span>
                      <span className="min-w-0 flex-1">Issue</span>
                      <span className="w-[92px]">Type</span>
                      <span className="w-[96px]">Priority</span>
                      <span className="w-[104px]">Status</span>
                      <span className="w-[104px]">Stage</span>
                      <span className="w-[84px]">Reported</span>
                      <span aria-hidden="true" className="w-8" />
                    </div>

                    <ul>
                      {bugs.map((bug) => {
                        const userVote =
                          Array.isArray(bug.votes) && bug.votes.length > 0
                            ? (bug.votes[0].value ?? 1)
                            : 0;
                        const voterSummary =
                          voterSummaries.get(bug.id) ?? createEmptyVoterSummary();
                        const stage = stages.get(bug.id);
                        // Category, area and relationship markers stay with
                        // the issue, after the columns (#686).
                        const extraPills = [
                          ...(bug.category
                            ? [{ key: "category", label: bug.category.name, className: "border border-line bg-chip text-ink-2" }]
                            : []),
                          ...(bug.area
                            ? [{ key: "area", label: bug.area.name, className: "border border-line bg-tint text-accent" }]
                            : []),
                          ...(bug.isDeleted
                            ? [{ key: "deleted", label: "Deleted", className: "border border-bad-bd bg-bad-bg text-bad-fg" }]
                            : []),
                          ...(bug.duplicateOf
                            ? [{
                                key: "duplicate",
                                label: `Duplicate of ${formatIssueNumber(bug.duplicateOf.number)}`,
                                className: "border border-warn-bd bg-warn-bg text-warn-fg",
                              }]
                            : []),
                        ];
                        return (
                          <li
                            key={bug.id}
                            className="group flex items-center gap-4 border-b border-divider px-4 py-4 transition-colors last:border-b-0 hover:bg-row-sel has-[a[data-issue-link]:focus-visible]:bg-row-sel"
                          >
                            {canDelete && !isDeletedView ? (
                              <div className="shrink-0">
                                <BulkCheckbox id={bug.id} title={bug.title} />
                              </div>
                            ) : null}
                            <div className="w-[52px] shrink-0">
                              <VoteButton
                                bugId={bug.id}
                                voteCount={bug.voteCount}
                                userVote={userVote}
                                likeCount={voterSummary.likes.count}
                                size="sm"
                                readOnly={isDeletedView}
                              />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                              <Link
                                href={issuePath(bug.number)}
                                data-issue-link=""
                                className={`flex min-w-0 items-start gap-3 rounded-lg scroll-mt-24 ${focusRing}`}
                              >
                                <IssueGlyph typeName={bug.type?.name} />
                                <span className="flex min-w-0 flex-col gap-1">
                                  <span
                                    className={`break-words text-sm font-semibold leading-snug transition-colors group-hover:text-accent ${
                                      isDone(bug.status) ? "text-muted" : "text-ink"
                                    }`}
                                  >
                                    {searchText ? (
                                      <Highlighted segments={highlightSegments(bug.title, searchText)} />
                                    ) : (
                                      bug.title
                                    )}
                                  </span>
                                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
                                    <span className="font-mono font-bold text-ink-2">
                                      {formatIssueNumber(bug.number)}
                                    </span>
                                    {(bug._count?.comments ?? 0) > 0 ? (
                                      <span
                                        className="inline-flex items-center gap-1"
                                        title={`Conversation: ${bug._count?.comments} item${bug._count?.comments === 1 ? "" : "s"}`}
                                      >
                                        <svg
                                          className="h-3.5 w-3.5"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                        </svg>
                                        <span className="sr-only">comments: </span>
                                        {bug._count?.comments}
                                      </span>
                                    ) : null}
                                    {(bug._count?.attachments ?? 0) > 0 ? (
                                      <span
                                        className="inline-flex items-center gap-1"
                                        title={`${bug._count?.attachments} attachments`}
                                      >
                                        <svg
                                          className="h-3.5 w-3.5"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                        </svg>
                                        <span className="sr-only">attachments: </span>
                                        {bug._count?.attachments}
                                      </span>
                                    ) : null}
                                  </span>
                                  {snippets.has(bug.id) ? (
                                    <SearchSnippet snippet={snippets.get(bug.id)!} />
                                  ) : null}
                                </span>
                              </Link>
                              {extraPills.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 pl-12">
                                  {extraPills.map((pill) => (
                                    <Pill key={pill.key} className={pill.className}>
                                      {pill.label}
                                    </Pill>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <span className="w-[92px] shrink-0 truncate text-[13px] text-ink-2">
                              {bug.type?.name ?? "—"}
                            </span>
                            <span className="w-[96px] shrink-0">
                              <Pill className={severityTone[bug.severity]}>
                                {severityLabels[bug.severity]}
                              </Pill>
                            </span>
                            <span className="w-[104px] shrink-0">
                              <Pill className={statusTone[bug.status]} dot>
                                {statusLabels[bug.status]}
                              </Pill>
                            </span>
                            <span className="w-[104px] shrink-0">
                              {stage ? (
                                <span title={intakeDetail(stage, bug.voteCount)}>
                                  <Pill className={stageTone[stage]} dot>
                                    {issueStageLabels[stage]}
                                  </Pill>
                                </span>
                              ) : (
                                <span className="text-[13px] text-muted">—</span>
                              )}
                            </span>
                            <span className="w-[84px] shrink-0 text-[13px] text-ink-2">
                              <RowAge
                                date={currentSort === "newest" ? bug.createdAt : bug.updatedAt}
                                sort={currentSort === "newest" ? "newest" : "updated"}
                              />
                            </span>
                            {bug.assignee ? (
                              <div className="w-8 shrink-0">
                                <RowAssignee name={bug.assignee.name} image={bug.assignee.image} />
                              </div>
                            ) : (
                              <span aria-hidden="true" className="w-8 shrink-0" />
                            )}
                            {isWatchingView ? (
                              <UnwatchButton
                                bugId={bug.id}
                                label={`${formatIssueNumber(bug.number)} ${bug.title}`}
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </div>

            {bugs.length > 0 ? (
              <div className="border-t border-divider pt-3.5">
                <PaginationControls
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalCount={totalCount}
                  from={pagination.from}
                  to={pagination.to}
                  queryParams={issueListPaginationParams({
                    status: statusParam,
                    severity: severityParam,
                    mine: mineFilter,
                    q: qParam,
                    sort: sortParam,
                    milestone: milestoneParam,
                    tags: tagsParam,
                    platform: selectedPlatform,
                    area: selectedArea,
                    stage: stageView,
                    deleted: isDeletedView,
                    showDuplicates,
                    showResolved,
                    allProjects,
                  })}
                />
              </div>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );

  if (!canDelete || isDeletedView) return page;

  return (
    <BulkSelectionProvider
      key={selectionKey}
      pageIds={bugIds}
      types={bulkTypes}
      platforms={bulkPlatforms}
      users={bulkUsers}
    >
      {page}
    </BulkSelectionProvider>
  );
}

/** What a brand-new tracker shows instead of an empty list (#292, #444). */
function FirstRunWelcome({
  isAdmin,
  hasTenant = true,
}: {
  isAdmin: boolean;
  hasTenant?: boolean;
}) {
  if (!hasTenant) {
    return (
      <section className="rounded-[20px] border border-warn-bd bg-warn-bg/60 px-5 py-6">
        <h2 className="text-lg font-bold text-ink">No workspace yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          You are not currently a member of any workspace. Join a workspace via an invite from your team,
          or create your own workspace to start filing issues.
        </p>
        <div className="mt-5">
          <Link
            href="/tenants"
            className={`inline-flex h-[42px] items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-white hover:bg-electric-blue-strong ${focusRing}`}
          >
            Create or join a workspace
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-line bg-surface px-6 py-10">
      <h2 className="text-lg font-bold text-ink">No issues yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        This is where reported issues will appear. A good report says what you
        expected, what happened instead, and how to make it happen again.
      </p>
      <div className="mt-5">
        <Link
          href="/issues/new"
          className={`inline-flex h-[42px] items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-white hover:bg-electric-blue-strong ${focusRing}`}
        >
          Report the first issue
        </Link>
      </div>
      {isAdmin ? (
        <p className="mx-auto mt-6 max-w-md text-sm text-muted">
          Before people start reporting, you may want to set up your{" "}
          <Link href="/projects" className="font-bold text-accent underline">
            projects
          </Link>
          , and the{" "}
          <Link href="/admin/categories" className="font-bold text-accent underline">
            platforms
          </Link>{" "}
          and{" "}
          <Link href="/admin/types" className="font-bold text-accent underline">
            issue types
          </Link>{" "}
          they will choose from.
        </p>
      ) : null}
    </section>
  );
}
