import type { Prisma } from "@prisma/client";
import { severities } from "@/lib/validations/issue";
import {
  defaultStatusWhere,
  parseShowResolved,
  SHOW_RESOLVED_PARAM,
  statusFilterWhere,
} from "@/lib/issue-state";
import { parseIssueNumberQuery } from "@/lib/issue-number";
import { boundSearchTerm, escapeSearchQuery, toSingleQueryParam } from "@/lib/search";
import { MILESTONE_PARAM, milestoneWhere, parseMilestoneFilter } from "@/lib/milestones";
import {
  defaultSortFor,
  mineFilterWhere,
  parseMineFilter,
  type MineFilter,
} from "@/lib/mine-filter";
import { parseTagFilter, tagTypeIds } from "@/lib/tag-filter";
import { parseBugSort, type BugSortOption } from "@/lib/issues-sort";
import { DUPLICATES_PARAM, duplicatesWhere, parseShowDuplicates } from "@/lib/duplicates";
import { parseProjectAreaFilter, projectAreaFilterWhere, type ProjectAreaOption } from "@/lib/project-area-filter";

export type RawParams = Record<string, string | string[] | undefined>;

export type TagType = { id: string; name: string };
export type PlatformLike = { id: string };

/** Value of `?platform=` that selects issues with no platform set. */
export const PLATFORM_NONE = "none";

/**
 * `?project=all` widens the Issues list to the whole workspace. It is an
 * additive view override: when the param is absent (the normal case, and
 * everything the app itself links to) the list keeps filtering by the active
 * project exactly as before, and the active-project cookie/switcher is never
 * written by it.
 */
export const PROJECT_ALL_PARAM = "project";
export const PROJECT_ALL = "all";

/**
 * Determines whether the `?project=all` override is active, widening the view workspace-wide.
 *
 * @param raw - The raw query parameter value.
 * @returns True if the value matches the workspace-wide project override.
 */
export function showsAllProjects(
  raw: string | string[] | undefined,
): boolean {
  return toSingleQueryParam(raw) === PROJECT_ALL;
}

/**
 * The filters behind the issues list, as a Prisma `where` plus the sort.
 *
 * The CSV export has to return exactly what the list is showing, so both
 * read the query string through this rather than each assembling their own
 * conditions and drifting apart (#625).
 */
export type ParsedBugFilters = {
  where: Prisma.BugWhereInput;
  sort: BugSortOption;
  /** The "Show" filter, which also decides the default order (#312). */
  mine: MineFilter | null;
  /** True when the caller asked for deleted issues and is allowed to see them. */
  isDeletedView: boolean;
};

/**
 * Parses query parameters into Prisma where conditions and sort order for the issue list and CSV export.
 *
 * @param options - Options containing raw query parameters, permissions, and available taxonomies.
 * @returns Parsed Prisma where conditions, sort option, mine filter, and deleted view indicator.
 */
export function parseBugListFilters({
  params,
  userId,
  canSeeDeleted,
  tagTypes = [],
  platforms = [],
  areas = [],
  milestones = [],
}: {
  params: RawParams;
  userId: string | undefined;
  /** Only admins may list deleted issues; everyone else gets the live ones. */
  canSeeDeleted: boolean;
  tagTypes?: readonly TagType[];
  /** Known platforms, so an id that no longer exists falls back to no filter. */
  platforms?: readonly PlatformLike[];
  /** Areas belonging to the active project, so stale/foreign ids mean no filter. */
  areas?: readonly ProjectAreaOption[];
  /** Known milestones (#289); an unknown id means no filter, like platforms. */
  milestones?: readonly { id: string }[];
}): ParsedBugFilters {
  const q = toSingleQueryParam(params.q);
  const status = toSingleQueryParam(params.status);
  const severity = toSingleQueryParam(params.severity);
  const deleted = toSingleQueryParam(params.deleted);
  const mine = parseMineFilter(params.mine);

  const isDeletedView = canSeeDeleted && deleted === "true";

  const where: Prisma.BugWhereInput = {
    isDeleted: isDeletedView,
    ...mineFilterWhere(mine, userId),
    // #285: same rule as the list, so the export matches what's on screen.
    ...duplicatesWhere(parseShowDuplicates(params[DUPLICATES_PARAM])),
  };

  const selectedTags = parseTagFilter(params.tags, tagTypes);
  if (selectedTags.length > 0) {
    where.typeId = { in: tagTypeIds(selectedTags, tagTypes) };
  }

  // The same status parsing the list uses, so the export understands the
  // `finished` aggregate the stat grid links to (#685) and cannot drift from
  // what is on screen. With no status filter, only live work shows unless
  // resolved issues were asked for (#1058, #625).
  const statusWhere = statusFilterWhere(status);
  const showResolved = parseShowResolved(params[SHOW_RESOLVED_PARAM]);
  const hidesResolved = statusWhere === undefined && !isDeletedView && !showResolved;
  if (statusWhere !== undefined) {
    where.status = statusWhere;
  } else if (hidesResolved) {
    where.status = defaultStatusWhere(false);
  }
  if (severity && (severities as readonly string[]).includes(severity)) {
    where.severity = severity as Prisma.BugWhereInput["severity"];
  }

  // Platform filter. An id that no longer exists resolves to no filter
  // rather than an empty result, matching what the list does — a bookmark
  // pointing at a deleted platform should show issues, not a blank page.
  const platform = toSingleQueryParam(params.platform);
  if (platform === PLATFORM_NONE) {
    where.categoryId = null;
  } else if (platform && platforms.some((p) => p.id === platform)) {
    where.categoryId = platform;
  }

  Object.assign(where, projectAreaFilterWhere(parseProjectAreaFilter(params.area, areas)));

  Object.assign(where, milestoneWhere(parseMilestoneFilter(params[MILESTONE_PARAM], milestones)));

  if (q?.trim()) {
    const escaped = escapeSearchQuery(boundSearchTerm(q));
    where.OR = [
      { title: { contains: escaped, mode: "insensitive" } },
      { description: { contains: escaped, mode: "insensitive" } },
    ];
    // "42" or "#42" should also find issue #42, mirroring what the list does (#625).
    const asNumber = parseIssueNumberQuery(q);
    if (asNumber !== null) {
      where.OR.push({ number: asNumber });
    }
  }

  return { where, sort: parseBugSort(toSingleQueryParam(params.sort), defaultSortFor(mine)), mine, isDeletedView };
}
