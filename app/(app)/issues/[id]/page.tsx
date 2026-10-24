import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { agentMentionId } from "@/lib/mentions";
import { requireUser } from "@/lib/auth-helpers";
import { bugInTenant, currentTenantIdFor } from "@/lib/tenant-context";
import { viewerBugScope } from "@/lib/tenant-viewer";
import { issuePath, parseIssueRef, queryString, resolveIssueRef } from "@/lib/issue-ref";
import { resolveSessionUserId } from "@/lib/session-user";
import { LocalTime } from "@/components/local-time";
import { ClearDuplicateButton, MarkDuplicateButton } from "@/components/duplicate-controls";
import { currentResolution, isFinishedStatus, type StatusChangeActivity } from "@/lib/resolution-note";
import { statusLabel as resolutionStatusLabel } from "@/lib/labels";
import { formatIssueNumber } from "@/lib/issue-number";
import { intakeDetail, openIssueStages, type IssueStage } from "@/lib/issue-stage";
import { buildCommentTree } from "@/lib/comments";
import {
  COMMENT_PARAM,
  COMMENT_THREADS_PER_PAGE,
  earlierThreadsHref,
  loadCommentWindow,
  parseCommentTarget,
  parseThreadWindow,
  type CommentWindow,
} from "@/lib/comment-window";
import { CommentPermalinkResolver } from "@/components/comment-permalink-resolver";
import {
  bugLinkPreviewDescription,
} from "@/lib/link-preview";
import { absoluteUrl } from "@/lib/site-url";
import { SHARE_IMAGE } from "@/lib/share-image";
import {
  severityLabels,
  statusLabels,
} from "@/lib/labels";
import { ActivityTimeline, type ActivityEntry } from "@/components/activity-timeline";
import { IssueAgentActivity, type AgentDecision } from "@/components/issue-agent-activity";
import { IssueEscalations, type TicketEscalation } from "@/components/issue-escalations";
import { listBugEscalations } from "@/lib/agent-questions";
import { IssueBids } from "@/components/issue-bids";
import { GoalBudgetSection } from "@/components/goal-budgets";
import { Badge } from "@/components/ui/badge";
import { VoteButton } from "@/components/vote-button";
import { UpdateIssueForm } from "@/components/update-issue-form";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentList, type AttachmentView } from "@/components/attachment-list";
import { ChooseRedesignButton } from "@/components/choose-redesign-button";
import { IssueApprovalBanner } from "@/components/issue-approval-banner";
import { isTenantAdminRole } from "@/lib/agents/membership";
import type { OrganizationRole } from "@/lib/organization-role";
import { getActiveIssueTypesCached, getActivePlatforms } from "@/lib/lookups";
import { fetchVoterSummary } from "@/lib/voter-summaries";
import { createEmptyVoterSummary } from "@/lib/voters";
import {
  canDeleteTicket,
  deletedSummary,
  deletionCounts,
  deleteSummary,
} from "@/lib/ticket-deletion";
import { currentTenantAccess } from "@/lib/tenant-access";
import { LoadError } from "@/components/load-error";
import { logLoadFailure } from "@/lib/load-error";
import { canEditTicket } from "@/lib/ticket-editing";
import { DeleteIssueButton } from "@/components/delete-issue-button";
import { RestoreIssueButton } from "@/components/restore-issue-button";
import { canAssignTicket } from "@/lib/ticket-assignment";
import { SelfAssignButton } from "@/components/self-assign-button";
import { UserNameWithBadges } from "@/components/user-name-with-badges";
import { EditableIssueDescription } from "@/components/editable-issue-description";
import { IssueMetadataCard } from "@/components/issue-metadata-card";
import { EditableProofLinks } from "@/components/editable-proof-links";
import { IssuePullRequest } from "@/components/issue-pull-request";
import { withCurrentOption } from "@/lib/triage-options";
import { issueTenantHintFor } from "@/lib/issue-tenant-hint";
import { IssueTenantSwitch } from "@/components/issue-tenant-hint";
import { tenantMemberWhere } from "@/lib/tenant-mentions";
import { readAgentResolution } from "@/lib/agent-resolution";
import { AgentResolvedNotice } from "@/components/agent-resolved-notice";
import { issueStageLabels } from "@/lib/issue-stage";
import { IssueSectionTabs } from "./issue-section-tabs";
import {
  issueChipBaseClass,
  issueSeverityChipClass,
  issueStageChipClass,
  issueStatusChipClass,
} from "./issue-ui";
import "./issue-detail.css";

type BugPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const NO_COMMENTS: CommentWindow = {
  comments: [],
  shownThreads: 0,
  hiddenThreads: 0,
  visibleCount: 0,
};

/** How much of the activity log a single page render is allowed to load. */
const ACTIVITY_PAGE_SIZE = 50;

async function loadOptional<T>(label: string, fallback: T, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[issue] ${label} failed`, error);
    return fallback;
  }
}

/** The database error stays in the server log under `reference`. */
function issueLoadError(reference: string) {
  return <LoadError title="This issue could not be loaded" reference={reference} />;
}

export async function generateMetadata({
  params,
}: BugPageProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const scope = await viewerBugScope();
  const ref = await resolveIssueRef(prisma, parseIssueRef(rawId), scope);
  const bug = ref && await prisma.bug.findUnique({
    where: { id: ref.id, ...scope },
    select: {
      number: true,
      title: true,
      status: true,
      updatedAt: true,
      isDeleted: true,
    },
  });

  if (!bug || bug.isDeleted) {
    return {
      title: "Issue not found",
      description: "This issue could not be found.",
      robots: { index: false, follow: false },
    };
  }

  // Title and status only: these tags are served to anyone with a preview-bot
  // User-Agent, signed in or not (#117).
  const description = bugLinkPreviewDescription({ status: bug.status });
  const canonical = absoluteUrl(issuePath(bug.number));
  const image = absoluteUrl(SHARE_IMAGE.url);
  // The reference goes in the tab title too: with several issues open, the
  // number is what tells two similar titles apart.
  const title = `${formatIssueNumber(bug.number)} ${bug.title}`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      siteName: "Ziki",
      modifiedTime: bug.updatedAt.toISOString(),
      images: [{ ...SHARE_IMAGE, url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    other: {
      "bug:status": statusLabels[bug.status],
    },
  };
}

/**
 * Renders the issue detail page including discussion threads, activity
 * timeline, attachment viewer, and triage controls.
 *
 * Performance optimization (#349): Gating the full user directory query behind
 * `canTriage` ensures non-triage viewers do not run unnecessary database queries.
 *
 * @param props.params - Route parameters containing the issue `id`.
 * @param props.searchParams - Optional query params for thread windowing or permalinks.
 */
export default async function BugDetailPage({ params, searchParams }: BugPageProps) {
  const { id: rawId } = await params;
  const ref = parseIssueRef(rawId);
  const query = (await searchParams) ?? {};
  const resolved = await resolveSessionUserId();
  const userId = "userId" in resolved ? resolved.userId : undefined;

  // Unauthenticated link-preview bots get the title and status only (#117).
  // They're recognised by User-Agent, which anyone can fake, so nothing more
  // sensitive (reporter, severity, description) may appear here.
  if (!userId) {
    // A bare number needs the viewer's organisation, so a signed-out preview
    // can only resolve the internal id (#457).
    const bug = ref.kind === "id" && await prisma.bug.findUnique({
      where: { id: ref.id },
      select: {
        title: true,
        status: true,
        isDeleted: true,
      },
    });
    if (!bug || bug.isDeleted) notFound();

    return (
      <div className="issue-detail-scope mx-auto max-w-2xl space-y-4 py-10">
        <p className="text-sm text-zk-muted">Ziki Issues</p>
        <h1 className="text-2xl font-extrabold text-zk-text">{bug.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge className={`${issueChipBaseClass} ${issueStatusChipClass[bug.status]}`}>
            {statusLabels[bug.status]}
          </Badge>
        </div>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/issues/${rawId}`)}`}
          className="inline-flex text-sm font-bold text-zk-accent hover:underline"
        >
          Sign in to view full details
        </Link>
      </div>
    );
  }

  const user = await requireUser();
  const access = await currentTenantAccess(user.id, user.role);
  const canTriage = access.admin;
  const canDelete = canDeleteTicket(user.role, access.membershipRole);
  const userTenantId = await currentTenantIdFor(userId);
  // #457: the address is the readable number. An old internal-id link redirects
  // to it, keeping comment permalinks and other query parameters.
  const found = await resolveIssueRef(prisma, ref, bugInTenant(userTenantId));
  if (found && ref.kind === "id") {
    // The page streams, so this redirect happens in the browser and can drop
    // the #fragment; a comment permalink gets its anchor back from the query.
    const comment = parseCommentTarget(query[COMMENT_PARAM]);
    permanentRedirect(`${issuePath(found.number)}${queryString(query)}${comment ? `#comment-${comment}` : ""}`);
  }
  const id = found?.id ?? (ref.kind === "id" ? ref.id : "");
  // #289: open milestones for the triage panel (admins only). Started here,
  // alongside the issue query, and awaited where the form needs them.
  const milestoneOptionsPromise: Promise<{ id: string; title: string; isClosed: boolean }[]> = canTriage
    ? loadOptional("milestones", [], () =>
        userTenantId
          ? prisma.milestone.findMany({
              where: { isClosed: false, tenantId: userTenantId },
              select: { id: true, title: true, isClosed: true },
              orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
            })
          : Promise.resolve([]),
      )
    : Promise.resolve([]);

  // The list page already proved the issue row itself can be read. Comments,
  // the activity log, watches and attachments are newer tables. One of them
  // missing used to reject this whole Promise and blank the page.
  let loadedBug = await prisma.bug
    .findUnique({
      where: { id, ...bugInTenant(await currentTenantIdFor(userId)) },
      include: {
        type: { select: { id: true, name: true, isActive: true } },
        reporter: { select: { name: true, email: true, role: true, image: true } },
        createdByAgent: { select: { id: true, name: true } },
        milestone: { select: { id: true, title: true, dueDate: true, isClosed: true } },
        assignee: { select: { id: true, name: true, role: true, image: true } },
        category: { select: { id: true, name: true, isActive: true } },
        area: { select: { id: true, name: true } },
        votes: { where: { userId }, select: { id: true, value: true }, take: 1 },
        // #285: both sides of a duplicate link.
        duplicateOf: { select: { id: true, number: true, title: true, status: true, isDeleted: true } },
        duplicates: {
          where: { isDeleted: false },
          select: { id: true, number: true, title: true, status: true },
          orderBy: { number: "asc" },
          take: 20,
        },
        _count: { select: { duplicates: { where: { isDeleted: false } } } },
      },
    })
    .then((bug) => ({ bug }))
    .catch((error: unknown) => ({
      // `detail` only decides the milestone retry below; it is never shown.
      detail: error instanceof Error ? error.message : "",
      reference: logLoadFailure("[issue] detail query failed", error),
    }));

  // If the query failed because Bug.milestoneId or Milestone does not exist in
  // the current database, retry without the milestone relation so the page
  // continues to load cleanly (#289).
  if ("detail" in loadedBug && /milestoneId|Milestone/i.test(loadedBug.detail)) {
    loadedBug = await prisma.bug
      .findUnique({
        where: { id, ...bugInTenant(await currentTenantIdFor(userId)) },
        include: {
          type: { select: { id: true, name: true, isActive: true } },
          reporter: { select: { name: true, email: true, role: true, image: true } },
          createdByAgent: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, role: true, image: true } },
          category: { select: { id: true, name: true, isActive: true } },
          area: { select: { id: true, name: true } },
          votes: { where: { userId }, select: { id: true, value: true }, take: 1 },
          duplicateOf: { select: { id: true, number: true, title: true, status: true, isDeleted: true } },
          duplicates: {
            where: { isDeleted: false },
            select: { id: true, number: true, title: true, status: true },
            orderBy: { number: "asc" },
            take: 20,
          },
          _count: { select: { duplicates: { where: { isDeleted: false } } } },
        },
      })
      .then((bug) => ({
        bug: bug
          ? {
              ...bug,
              milestoneId: null,
              milestone: null,
            }
          : null,
      }))
      .catch((error: unknown) => ({
        detail: error instanceof Error ? error.message : "",
        reference: logLoadFailure("[issue] fallback detail query without milestone failed", error),
      }));
  }

  if ("reference" in loadedBug) {
    return issueLoadError(loadedBug.reference);
  }
  const bug = loadedBug.bug;

  if (!bug) {
    // A link into another of the viewer's tenants should not dead-end (#519):
    // name the tenant and offer the switch. Non-members still get the 404.
    const hint = await issueTenantHintFor(prisma, {
      userId,
      activeTenantId: await currentTenantIdFor(userId),
      issueId: id,
    });
    if (!hint) notFound();
    return <IssueTenantSwitch issueId={id} tenant={hint} />;
  }

  if (bug.isDeleted && !canDelete) {
    notFound();
  }

  const tenantId = await currentTenantIdFor(userId);
  // These tables arrived after the issue row. A missing one must not blank the page.
  const [redesignProposals, membership] = tenantId ? await Promise.all([
    loadOptional("redesigns", [], () =>
      prisma.redesignProposal.findMany({
        where: { tenantId, bugId: bug.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true, body: true, previewUrl: true, status: true,
          authorAgent: { select: { name: true } }, attachments: { select: { id: true, filename: true, contentType: true } } },
      }),
    ),
    loadOptional("membership", null, () =>
      prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { role: true } }),
    ),
  ]) : [[], null] as const;
  const canChooseRedesign = isTenantAdminRole(membership?.role, user.role);
  const openBids = await loadOptional("bids", [], () =>
    prisma.issueBid.findMany({
      where: { bugId: bug.id, withdrawnAt: null, awardedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        note: true,
        createdAt: true,
        beneficiaryUserId: true,
        agent: { select: { name: true, areaPreferences: {
          where: { projectAreaId: bug.areaId ?? "" },
          select: { projectAreaId: true },
        } } },
        beneficiary: { select: { name: true } },
      },
    }),
  );
  const hasAreaMatch = (bid: { agent: { areaPreferences: unknown[] } }) =>
    Boolean(bug.areaId && bid.agent.areaPreferences.length);
  const canAwardBid = bug.status === "open" && !bug.isDeleted && (bug.reporterId === user.id || canChooseRedesign);

  const [users, categories, areas, types, voterSummary, activities, activityCount, comments, latestStatusChange, attachments, lastRevision, agentDecisions, escalations, volunteerCount, pendingApproval] =
    await Promise.all([
      canTriage
        ? loadOptional("users", [], () =>
            // #502: only the issue's tenant can be mentioned or assigned.
            prisma.user.findMany({
              where: tenantMemberWhere(bug.tenantId),
              orderBy: { name: "asc" },
              select: { id: true, name: true, role: true, image: true },
            }),
          )
        : Promise.resolve([]),
      loadOptional("platforms", [], () => getActivePlatforms(bug.tenantId)),
      canTriage
        ? loadOptional("project areas", [], () => prisma.projectArea.findMany({
            where: { projectId: bug.projectId },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: { id: true, name: true },
          }))
        : Promise.resolve([]),
      canTriage ? loadOptional("types", [], () => getActiveIssueTypesCached(bug.tenantId)) : Promise.resolve([]),
      loadOptional("votes", createEmptyVoterSummary(), () => fetchVoterSummary(id)),
      loadOptional("activity", [] as ActivityEntry[], () =>
        prisma.bugActivity.findMany({
          where: { bugId: id },
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: ACTIVITY_PAGE_SIZE,
        }),
      ),
      loadOptional("activity count", 0, () => prisma.bugActivity.count({ where: { bugId: id } })),
      // The newest threads only (#280); a permalink widens the window to
      // reach its comment.
      loadOptional("comments", NO_COMMENTS, () =>
        loadCommentWindow(prisma, id, {
          threads: parseThreadWindow(query.threads),
          target: parseCommentTarget(query.comment),
        }),
      ),
      // #316: the status change that put the issue in its current state,
      // read on its own so it is found even when the timeline is trimmed.
      isFinishedStatus(bug.status)
        ? loadOptional<StatusChangeActivity | null>("resolution note", null, () =>
            prisma.bugActivity.findFirst({
              where: { bugId: id, type: "status_changed" },
              orderBy: { createdAt: "desc" },
              select: { createdAt: true, metadata: true, actor: { select: { name: true } } },
            }),
          )
        : Promise.resolve(null),
      // Files on the issue and on its comments (#215); never the file contents here.
      loadOptional("attachments", [], () =>
        prisma.attachment.findMany({
          where: { bugId: id },
          select: { id: true, filename: true, contentType: true, size: true, commentId: true },
          orderBy: { createdAt: "asc" },
        }),
      ),
      // #303: only whether there is history, and when it last changed.
      loadOptional<{ editedAt: Date } | null>("revisions", null, () =>
        prisma.bugRevision.findFirst({
          where: { bugId: id },
          orderBy: { editedAt: "desc" },
          select: { editedAt: true },
        }),
      ),
      // #448: what agents decided on this issue — confirmations and rejections
      // (#1122), the claim, test verdicts, and whether an agent accepted the
      // fix. Sentences only; the raw audit payloads live on the audit page (#447).
      loadOptional<AgentDecision[]>("agent decisions", [], async () => {
        const [validations, claims, verdicts, accepted] = await Promise.all([
          prisma.issueValidation.findMany({
            where: { bugId: id, kind: "real" },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              createdAt: true,
              verdict: true,
              severity: true,
              notes: true,
              agent: { select: { name: true } },
              onBehalfOf: { select: { name: true } },
            },
          }),
          prisma.issueClaim.findMany({
            where: { bugId: id, status: "active", releasedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              createdAt: true,
              deliverBy: true,
              extendedAt: true,
              waitingOnOwnerSince: true,
              agent: { select: { name: true, owner: { select: { name: true } } } },
              beneficiary: { select: { name: true } },
            },
          }),
          prisma.testVerdict.findMany({
            where: { bugId: id },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              createdAt: true,
              goodToMerge: true,
              agent: { select: { name: true } },
              onBehalfOf: { select: { name: true } },
            },
          }),
          prisma.agentAuditEvent.findMany({
            where: { bugId: id, action: "issue.accepted" },
            orderBy: { createdAt: "asc" },
            select: { id: true, createdAt: true, agent: { select: { name: true } } },
          }),
        ]);
        return [
          ...validations.map<AgentDecision>((v) =>
            v.verdict === "reject"
              ? {
                  id: `validation-${v.id}`,
                  at: v.createdAt,
                  kind: "rejected",
                  agentName: v.agent.name,
                  personName: v.onBehalfOf.name,
                  notes: v.notes,
                }
              : {
                  id: `validation-${v.id}`,
                  at: v.createdAt,
                  kind: "confirmed",
                  agentName: v.agent.name,
                  personName: v.onBehalfOf.name,
                  severity: v.severity,
                },
          ),
          ...claims.map<AgentDecision>((c) => ({
            id: `claim-${c.id}`,
            at: c.createdAt,
            kind: "claimed",
            agentName: c.agent.name,
            personName: c.beneficiary.name,
            deliverBy: bug.pullRequestUrl ? null : c.deliverBy,
            extendedAt: c.extendedAt,
            waitingOnName: c.waitingOnOwnerSince ? c.agent.owner.name : null,
          })),
          ...verdicts.map<AgentDecision>((v) => ({
            id: `verdict-${v.id}`,
            at: v.createdAt,
            kind: "verdict",
            agentName: v.agent.name,
            personName: v.onBehalfOf.name,
            goodToMerge: v.goodToMerge,
          })),
          ...accepted.map<AgentDecision>((e) => ({
            id: `accepted-${e.id}`,
            at: e.createdAt,
            kind: "accepted",
            agentName: e.agent.name,
          })),
        ];
      }),
      loadOptional<TicketEscalation[]>("escalations", [], () =>
        tenantId ? listBugEscalations(id, tenantId) : Promise.resolve([]),
      ),
      loadOptional<number>("volunteers", 0, () =>
        prisma.issueInterest.count({
          where: { bugId: id, withdrawnAt: null },
        }),
      ),
      loadOptional("pendingApproval", null, () =>
        (typeof (prisma as { issueApproval?: unknown }).issueApproval !== "undefined"
          ? prisma.issueApproval.findFirst({
              where: { bugId: id, status: "pending" },
              include: { rule: { include: { issueType: { select: { name: true } } } } },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve(null)),
      ),
    ]);
  // #603: the tenant's active agents, offered in the comment @mention list
  // as "Mark's Claude · Mark Essien" alongside people.
  const mentionAgents = canTriage
    ? await loadOptional("mention agents", [], () =>
        prisma.agent.findMany({
          where: { tenantId: bug.tenantId, revokedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, owner: { select: { name: true } } },
        }),
      )
    : [];
  const commentMentionUsers = [
    ...users,
    ...mentionAgents.map((agent) => ({
      id: agentMentionId(agent.id),
      name: agent.name,
      agentOwner: agent.owner.name,
    })),
  ];
  const issueAttachments: AttachmentView[] = attachments.filter((a) => !a.commentId);
  const attachmentsByComment: Record<string, AttachmentView[]> = {};
  for (const a of attachments) {
    if (a.commentId) (attachmentsByComment[a.commentId] ??= []).push(a);
  }

  const milestoneOptions = await milestoneOptionsPromise;
  let intakeStage: IssueStage | null = null;
  if (!bug.isDeleted && bug.status === "open") {
    try {
      intakeStage = (await openIssueStages(prisma, { id: bug.id })).get(bug.id) ?? null;
    } catch (error) {
      console.error("[bugs] issue stage lookup failed", error);
    }
  }
  const isAssignee = !!userId && bug.assigneeId === userId;
  const canUpdateStatus = canTriage || isAssignee;
  const canEdit =
    canEditTicket({
      actorId: userId,
      actorRole: user.role,
      membershipRole: access.membershipRole,
      reporterId: bug.reporterId,
    }) && !bug.isDeleted;
  const canSelfAssign =
    !bug.isDeleted &&
    canAssignTicket({
      actorId: userId,
      actorRole: user.role,
      membershipRole: access.membershipRole,
      currentAssigneeId: bug.assigneeId,
      targetAssigneeId: isAssignee ? null : userId,
      voteCount: bug.voteCount,
    });
  const userVote =
    Array.isArray(bug.votes) && bug.votes.length > 0
      ? (bug.votes[0].value ?? 1)
      : 0;
  const commentTree = buildCommentTree(comments.comments);
  // #489: the Admin label follows each person's role in this issue's
  // organization, not their account-wide role, the same rule as admin powers.
  const namedUserIds = [
    ...new Set(
      [bug.reporterId, bug.assigneeId, ...comments.comments.map((c) => c.authorId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const organizationRoleRows = await loadOptional<{ userId: string; role: OrganizationRole }[]>(
    "organization roles",
    [],
    () =>
      prisma.membership.findMany({
        where: { tenantId: bug.tenantId, userId: { in: namedUserIds } },
        select: { userId: true, role: true },
      }),
  );
  const organizationRoles: Record<string, OrganizationRole> = Object.fromEntries(
    organizationRoleRows.map((row) => [row.userId, row.role]),
  );
  const pageQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") pageQuery.set(key, value);
  }
  const proofLinks = bug.proofLinks ?? [];

  const resolution = currentResolution(bug.status, latestStatusChange);
  const agentResolution =
    bug.status === "resolved" && !bug.isDeleted ? readAgentResolution(latestStatusChange?.metadata) : null;

  // Workflow badges that are always visible: status and severity. Anything
  // else (boost, volunteers) is supplementary and folds into the mobile +N
  // control, so status/severity never hide behind it (#687).
  const extraBadgeCount =
    (bug.isBoosted && !bug.isDeleted ? 1 : 0) + (volunteerCount > 0 ? 1 : 0);

  const headerActions = (
    <>
      {canSelfAssign ? (
        <SelfAssignButton
          bugId={bug.id}
          isAssignedToMe={isAssignee}
          size="sm"
        />
      ) : null}
      {canTriage && !bug.isDeleted && !bug.duplicateOf ? (
        <MarkDuplicateButton bugId={bug.id} />
      ) : null}
      {!bug.isDeleted && userId && (bug.reporterId === userId || bug.assigneeId === userId) ? (
        <Link
          href={`/points/disputes/new?bug=${bug.number}`}
          className="inline-flex min-h-10 items-center text-xs font-bold text-zk-accent hover:underline"
          title="Say your points award for this issue is missing or wrong"
        >
          Dispute award
        </Link>
      ) : null}
    </>
  );

  const bidList = [...openBids]
    .sort((a, b) => Number(hasAreaMatch(b)) - Number(hasAreaMatch(a)) || a.createdAt.getTime() - b.createdAt.getTime())
    .map((bid) => ({
      id: bid.id,
      agentName: bid.agent.name,
      personName: bid.beneficiary.name ?? "A member",
      note: bid.note,
      areaMatch: hasAreaMatch(bid),
    }));

  // What a delete keeps, shown the same way in every delete/restore message (#692).
  const keptCounts = deletionCounts(comments.visibleCount, voterSummary);

  return (
    <div className="issue-detail-scope flex flex-col gap-5 pb-10">
      {bug.isDeleted ? (
        <div className="rounded-[20px] border border-zk-bad-bd bg-zk-bad-bg p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zk-bad-fg">
                This issue was deleted
              </h3>
              <p className="text-xs text-zk-bad-fg/90">
                {deletedSummary(keptCounts)}
              </p>
            </div>
            <RestoreIssueButton
              bugId={bug.id}
              bugTitle={bug.title}
              counts={keptCounts}
              size="sm"
            />
          </div>
        </div>
      ) : null}

      {bug.duplicateOf ? (
        <section
          aria-label="Duplicate"
          className="flex flex-col gap-2 rounded-[20px] border border-zk-warn-bd bg-zk-warn-bg p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <p className="text-sm text-zk-warn-fg">
            <span className="font-semibold">This issue is a duplicate of </span>
            {bug.duplicateOf.isDeleted && !canDelete ? (
              <span>{formatIssueNumber(bug.duplicateOf.number)} (since deleted)</span>
            ) : (
              <Link href={issuePath(bug.duplicateOf.number)} className="font-semibold text-zk-accent underline-offset-2 hover:underline">
                {formatIssueNumber(bug.duplicateOf.number)} {bug.duplicateOf.title}
              </Link>
            )}{" "}
            <span>({statusLabels[bug.duplicateOf.status]})</span>.{" "}
            Follow and vote there instead. It&apos;s hidden from the issues list.
          </p>
          {canTriage ? (
            <div className="flex shrink-0 items-center gap-1 print:hidden">
              <MarkDuplicateButton bugId={bug.id} label="Change" />
              <ClearDuplicateButton bugId={bug.id} />
            </div>
          ) : null}
        </section>
      ) : null}

      {bug._count.duplicates > 0 ? (
        <section aria-label="Duplicates of this issue" className="rounded-[20px] border border-zk-border bg-zk-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-zk-text">
            {bug._count.duplicates} duplicate{bug._count.duplicates === 1 ? "" : "s"} of this issue
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {bug.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={issuePath(d.number)} className="text-zk-accent hover:underline">
                  <span className="tabular-nums text-zk-muted">{formatIssueNumber(d.number)}</span> {d.title}
                </Link>{" "}
                <span className="text-xs text-zk-muted">· {statusLabels[d.status]}</span>
              </li>
            ))}
          </ul>
          {bug._count.duplicates > bug.duplicates.length ? (
            <p className="mt-1 text-xs text-zk-muted">
              And {bug._count.duplicates - bug.duplicates.length} more.
            </p>
          ) : null}
        </section>
      ) : null}

      {pendingApproval ? (
        <IssueApprovalBanner
          approval={pendingApproval}
          canDecide={canChooseRedesign}
        />
      ) : null}

      {redesignProposals.length ? (
        <section aria-label="Redesign proposals" className="rounded-[20px] border border-zk-border bg-zk-surface p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-zk-text">Compare redesign proposals</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {redesignProposals.map((proposal) => (
              <article key={proposal.id} className="space-y-3 rounded-[16px] border border-zk-border bg-zk-chip/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-zk-text">{proposal.title}</h3>
                  <span className="shrink-0 text-xs capitalize text-zk-muted">{proposal.status}</span>
                </div>
                <p className="text-xs text-zk-muted">By {proposal.authorAgent.name}</p>
                <p className="whitespace-pre-wrap text-sm text-zk-text2">{proposal.body}</p>
                {proposal.previewUrl ? <a className="text-sm font-bold text-zk-accent underline" href={proposal.previewUrl} target="_blank" rel="noreferrer">Open live preview</a> : null}
                {proposal.attachments.length ? <div className="grid grid-cols-2 gap-2">
                  {proposal.attachments.map((file) => <a key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer" className="space-y-1 text-sm font-bold text-zk-accent underline">
                    <Image src={`/api/attachments/${file.id}`} alt={file.filename} width={480} height={320} unoptimized className="h-auto max-h-56 w-full rounded-xl border border-zk-border object-contain" />
                    <span className="block">{file.filename}</span>
                  </a>)}
                </div> : null}
                {canChooseRedesign && proposal.status === "proposed" ? <ChooseRedesignButton id={proposal.id} /> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {resolution ? (
        <section
          aria-label="Resolution note"
          className="rounded-[20px] border border-zk-border bg-zk-ok-bg p-4 sm:p-5"
        >
          <h2 className="text-sm font-semibold text-zk-ok-fg">
            {resolutionStatusLabel[resolution.status]} by {resolution.by}
            <span className="ml-2 text-xs font-normal">
              <LocalTime date={resolution.at} />
            </span>
          </h2>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zk-text">
            {resolution.note}
          </p>
        </section>
      ) : null}

      {/* Header: number + title, status language, vote */}
      <div className="flex flex-col gap-3.5">
        <Link
          href="/issues"
          aria-label="Back to issues"
          className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm font-semibold text-zk-accent hover:underline print:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to issues
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-[1_1_600px] space-y-3">
            <div className="flex items-start gap-2">
              <h1 className="min-w-0 break-words text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-zk-text">
                <span className="font-bold tabular-nums text-zk-muted">
                  {formatIssueNumber(bug.number)}
                </span>{" "}
                {bug.title}
              </h1>
            </div>

            {intakeStage ? (
              <p
                className={`rounded-xl border px-3 py-2 text-sm ${
                  intakeStage === "ready"
                    ? "border-zk-border bg-zk-ok-bg text-zk-ok-fg"
                    : "border-zk-warn-bd bg-zk-warn-bg text-zk-warn-fg"
                }`}
              >
                {intakeDetail(intakeStage, bug.voteCount)}
              </p>
            ) : null}
            {agentResolution ? (
              <AgentResolvedNotice bugId={bug.id} resolution={agentResolution} canReopen={canUpdateStatus} />
            ) : null}

            {/* On mobile (<sm): compact horizontal scroll action row pinned directly under the title (#698) */}
            <div
              data-testid="mobile-actions-row"
              className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:hidden print:hidden"
            >
              {headerActions}
            </div>

            {/* Row 1 — workflow state (#687). Status and severity stay visible. */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              {bug.isDeleted ? (
                <span className={`${issueChipBaseClass} bg-zk-bad-bg text-zk-bad-fg`}>
                  Deleted
                </span>
              ) : null}
              <Badge className={`${issueChipBaseClass} ${issueStatusChipClass[bug.status]}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                {statusLabels[bug.status]}
              </Badge>
              <Badge className={`${issueChipBaseClass} ${issueSeverityChipClass[bug.severity]}`}>
                {severityLabels[bug.severity]}
              </Badge>
              {intakeStage ? (
                <Badge className={`${issueChipBaseClass} ${issueStageChipClass[intakeStage]}`}>
                  {issueStageLabels[intakeStage]}
                </Badge>
              ) : null}
              {bug.isBoosted && !bug.isDeleted ? (
                <span className={`${issueChipBaseClass} border border-zk-warn-bd bg-zk-warn-bg text-zk-warn-fg`}>
                  Boosted
                </span>
              ) : null}
              {extraBadgeCount > 0 ? (
                <details className="group sm:contents">
                  <summary
                    aria-label={`${extraBadgeCount} more details`}
                    className="inline-flex cursor-pointer list-none select-none items-center gap-1 rounded-full border border-zk-border bg-zk-chip px-2 py-0.5 text-xs font-medium text-zk-text2 hover:bg-zk-seg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong sm:hidden"
                  >
                    +{extraBadgeCount}
                  </summary>
                  <span className="contents">
                    {volunteerCount > 0 ? (
                      <span className={`${issueChipBaseClass} bg-zk-info-bg text-zk-info-fg`}>
                        {volunteerCount} {volunteerCount === 1 ? "agent volunteered" : "agents volunteered"}
                      </span>
                    ) : null}
                  </span>
                </details>
              ) : null}
              <span className="font-medium text-zk-muted">
                Opened <LocalTime date={bug.createdAt} /> by {bug.reporter.name}
              </span>
            </div>

            {/* Row 2 — taxonomy (#687). */}
            {bug.type || bug.category ? (
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zk-muted">
                {bug.type ? (
                  <span className={`${issueChipBaseClass} bg-zk-chip text-zk-text2`}>{bug.type.name}</span>
                ) : null}
                {bug.category ? (
                  <span className={`${issueChipBaseClass} bg-zk-chip text-zk-text2`}>{bug.category.name}</span>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start print:hidden">
            <div className="hidden sm:contents">{headerActions}</div>
            <VoteButton
              bugId={bug.id}
              voteCount={bug.voteCount}
              userVote={userVote}
              likeCount={voterSummary.likes.count}
              likeVoters={voterSummary.likes.voters}
              size="md"
              showAvatars={false}
              showReadinessGate={false}
              readOnly={bug.isDeleted}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* MAIN COLUMN */}
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
          <EditableIssueDescription
            bugId={bug.id}
            initialTitle={bug.title}
            initialDescription={bug.description}
            canEdit={canEdit}
            users={users}
            createdAt={bug.createdAt}
            lastEditedAt={lastRevision?.editedAt ?? null}
            historyHref={issuePath(bug.number, "/history")}
          >
            {/* Scoped organization roles passed to metadata card (#489):
                organizationRole={organizationRoles[bug.reporterId]}
                organizationRole={bug.assigneeId ? organizationRoles[bug.assigneeId] : null} */}
            <IssueMetadataCard
              bug={bug}
              lastActivityAt={
                latestStatusChange?.createdAt && latestStatusChange.createdAt > bug.updatedAt
                  ? latestStatusChange.createdAt
                  : bug.updatedAt
              }
              organizationRoles={organizationRoles}
              canSelfAssign={canSelfAssign}
              isAssignee={isAssignee}
            />
          </EditableIssueDescription>

          {issueAttachments.length > 0 ? (
            <section className="rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">
                Attachments
              </h2>
              <AttachmentList attachments={issueAttachments} />
            </section>
          ) : null}

          <EditableProofLinks
            bugId={bug.id}
            initialLinks={proofLinks}
            linkedPullRequestUrl={bug.pullRequestUrl}
            canEdit={(canEdit || isAssignee) && !bug.isDeleted}
          />

          {canUpdateStatus && !bug.isDeleted ? (
            <UpdateIssueForm
              bugId={bug.id}
              status={bug.status}
              severity={bug.severity}
              typeId={bug.typeId}
              assigneeId={bug.assigneeId}
              categoryId={bug.categoryId}
              areaId={bug.areaId}
              users={users}
              categories={withCurrentOption(categories, bug.category)}
              areas={areas}
              types={withCurrentOption(types, bug.type)}
              milestoneId={bug.milestoneId}
              milestones={
                bug.milestone && !milestoneOptions.some((m) => m.id === bug.milestone?.id)
                  ? [...milestoneOptions, { id: bug.milestone.id, title: bug.milestone.title, isClosed: bug.milestone.isClosed }]
                  : milestoneOptions
              }
              canEditTriage={canTriage}
            />
          ) : null}

          <IssueEscalations escalations={escalations} />

          <Suspense fallback={null}>
            <GoalBudgetSection tenantId={bug.tenantId} projectId={bug.projectId} bugId={bug.id} />
          </Suspense>

          <IssueSectionTabs
            conversationCount={comments.visibleCount}
            decisionsCount={agentDecisions.length}
            conversation={
              <section
                id="conversation"
                className="scroll-mt-24 rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-[22px]"
              >
                <span id="comments" className="sr-only" aria-hidden="true" />
                <h2 className="sr-only">
                  Conversation ({comments.visibleCount})
                </h2>
                {comments.hiddenThreads > 0 ? (
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-zk-chip px-3 py-2 text-sm text-zk-text2 print:hidden">
                    <span>
                      {comments.hiddenThreads} earlier{" "}
                      {comments.hiddenThreads === 1 ? "thread" : "threads"} not shown.
                    </span>
                    <Link
                      href={earlierThreadsHref(pageQuery, comments.shownThreads)}
                      scroll={false}
                      className="font-bold text-zk-accent hover:underline"
                    >
                      Show {Math.min(comments.hiddenThreads, COMMENT_THREADS_PER_PAGE)} earlier
                    </Link>
                    {comments.hiddenThreads > COMMENT_THREADS_PER_PAGE ? (
                      <Link
                        href={earlierThreadsHref(pageQuery, comments.shownThreads, true)}
                        scroll={false}
                        className="font-bold text-zk-accent hover:underline"
                      >
                        Show all
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                <Suspense fallback={null}>
                  <CommentPermalinkResolver />
                </Suspense>
                <CommentThread
                  bugId={bug.id}
                  issueUrl={absoluteUrl(issuePath(bug.number))}
                  reporterId={bug.reporterId}
                  comments={commentTree}
                  attachmentsByComment={attachmentsByComment}
                  organizationRoles={organizationRoles}
                  users={commentMentionUsers}
                  currentUserId={user.id}
                  currentUserRole={user.role}
                  tenantAdmin={access.admin}
                  readOnly={bug.isDeleted}
                />
              </section>
            }
            decisions={
              agentDecisions.length > 0 ? (
                <IssueAgentActivity decisions={agentDecisions} />
              ) : (
                <section
                  aria-label="Agent decisions"
                  className="rounded-[20px] border border-dashed border-zk-border bg-zk-surface p-8 text-center text-sm text-zk-muted"
                >
                  <h2 className="sr-only">Agent decisions</h2>
                  No agent decisions yet.
                </section>
              )
            }
          />

          {canDelete && !bug.isDeleted ? (
            <section className="rounded-[20px] border border-zk-bad-bd bg-zk-bad-soft/60 p-4 sm:p-6 print:hidden">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-zk-bad-fg">
                    Danger zone
                  </h2>
                  <p className="text-sm text-zk-text2">
                    Delete this issue. {deleteSummary(keptCounts)}
                  </p>
                </div>
                <DeleteIssueButton
                  bugId={bug.id}
                  bugTitle={bug.title}
                  counts={keptCounts}
                  variant="danger"
                />
              </div>
            </section>
          ) : null}
        </div>

        {/* SIDE RAIL */}
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <section className="flex flex-col gap-3.5 rounded-[20px] border border-zk-border bg-zk-surface p-5">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">People</span>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zk-muted">Reporter</span>
              <UserNameWithBadges
                name={bug.reporter.name}
                role={bug.reporter.role}
                organizationRole={organizationRoles[bug.reporterId]}
                image={bug.reporter.image}
                avatar="sm"
                userId={bug.reporterId}
                agentName={bug.createdByAgent?.name}
                showAuthor
              />
            </div>
            <div className="h-px bg-zk-divider" />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zk-muted">Assignee</span>
              <div className="flex flex-wrap items-center gap-2">
                {bug.assignee ? (
                  <UserNameWithBadges
                    name={bug.assignee.name}
                    role={bug.assignee.role}
                    organizationRole={bug.assigneeId ? organizationRoles[bug.assigneeId] : null}
                    image={bug.assignee.image}
                    avatar="sm"
                    userId={bug.assigneeId}
                  />
                ) : (
                  <span className="text-sm text-zk-muted">Unassigned</span>
                )}
                {canSelfAssign ? (
                  <SelfAssignButton
                    bugId={bug.id}
                    isAssignedToMe={isAssignee}
                    variant="ghost"
                    size="xs"
                  />
                ) : null}
              </div>
            </div>
          </section>

          <IssuePullRequest pullRequestUrl={bug.pullRequestUrl} />

          <IssueBids
            bids={bidList}
            canAward={canAwardBid && intakeStage === "ready"}
          />

          <ActivityTimeline
            activities={[...activities].reverse()}
            totalCount={activityCount}
          />
        </aside>
      </div>
    </div>
  );
}
