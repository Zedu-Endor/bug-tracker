import { IssueActionsDialog } from "./issue-actions-dialog";
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
import { CommentThread } from "@/components/comment-thread";
import { AttachmentList, type AttachmentView } from "@/components/attachment-list";
import { ChooseRedesignButton } from "@/components/choose-redesign-button";
import { IssueApprovalBanner } from "@/components/issue-approval-banner";
import { isTenantAdminRole } from "@/lib/agents/membership";
import type { OrganizationRole } from "@/lib/organization-role";
import { UserNameWithBadges } from "@/components/user-name-with-badges";
import { fetchVoterSummary } from "@/lib/voter-summaries";
import { createEmptyVoterSummary } from "@/lib/voters";
import {
  canDeleteTicket,
  deletedSummary,
  deletionCounts,
} from "@/lib/ticket-deletion";
import { currentTenantAccess } from "@/lib/tenant-access";
import { MilestoneDue } from "@/components/milestone-due";
import { LoadError } from "@/components/load-error";
import { logLoadFailure } from "@/lib/load-error";
import { dueDateValue, milestoneIssuesHref } from "@/lib/milestones";
import { canEditTicket } from "@/lib/ticket-editing";
import { RestoreIssueButton } from "@/components/restore-issue-button";
import { canAssignTicket } from "@/lib/ticket-assignment";
import { SelfAssignButton } from "@/components/self-assign-button";
import { EditableIssueDescription } from "@/components/editable-issue-description";
import { EditableProofLinks } from "@/components/editable-proof-links";
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

  const [users, voterSummary, activities, activityCount, comments, latestStatusChange, attachments, lastRevision, agentDecisions, escalations, volunteerCount, pendingApproval] =
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
          where: { OR: [{ bugId: id }, { comment: { bugId: id } }] },
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

  const descriptionContent = (<>
          <EditableIssueDescription
            bugId={bug.id}
            initialTitle={bug.title}
            initialDescription={bug.description}
            canEdit={canEdit}
            expandedByDefault
            users={users}
            createdAt={bug.createdAt}
            lastEditedAt={lastRevision?.editedAt ?? null}
            historyHref={issuePath(bug.number, "/history")}
          >
            {(bug.area || bug.milestone) ? (
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-zk-text2 sm:grid-cols-2">
                {bug.area ? (
                  <div>
                    <dt className="font-medium text-zk-muted">Area</dt>
                    <dd>{bug.area.name}</dd>
                  </div>
                ) : null}
                {bug.milestone ? (
                  <div>
                    <dt className="font-medium text-zk-muted">Milestone</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <Link href={milestoneIssuesHref(bug.milestone.id)} className="font-bold text-zk-accent hover:underline">
                        {bug.milestone.title}
                      </Link>
                      <MilestoneDue due={dueDateValue(bug.milestone.dueDate) || null} isClosed={bug.milestone.isClosed} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </EditableIssueDescription>
          {issueAttachments.length > 0 ? (
            <section id="issue-evidence" className="rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-6">
              <h2 className="text-xs font-semibold text-zk-muted">
                Attachments
              </h2>
              <AttachmentList attachments={issueAttachments} />
            </section>
          ) : null}
</>);
  const discussionContent = (
              <section
                id="conversation"
                className="issue-flat-panel scroll-mt-24 rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-[22px]"
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
);
  const decisionsContent = (
              agentDecisions.length > 0 ? (
                <IssueAgentActivity decisions={agentDecisions} />
              ) : (
                <section
                  aria-label="Agent decisions"
                  className="issue-flat-panel rounded-[20px] border border-dashed border-zk-border bg-zk-surface p-8 text-center text-sm text-zk-muted"
                >
                  <h2 className="sr-only">Agent decisions</h2>
                  No agent decisions yet.
                </section>
              )
);
  const activityContent = (
    <ActivityTimeline activities={[...activities].reverse()} totalCount={activityCount} expanded showConnector={false} />
  );

  return (
    <div className="issue-detail-scope issue-detail-page mx-auto flex w-full max-w-[1440px] flex-col gap-5">
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

      <div className="issue-detail-grid">
        <div className="issue-detail-main">
          <header className="issue-heading">
            <div className="issue-heading-row">
            <Link href="/issues" aria-label="Back to issues" className="issue-back-link print:hidden">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                <span>Back to issues</span>
            </Link>
            <details className="issue-heading-line"><summary aria-label="Expand or collapse full issue title"><h1 className="issue-heading-title"><span className="issue-heading-number">{formatIssueNumber(bug.number)}</span>{" "}{bug.title}</h1><svg className="issue-title-expand" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="m6 9 6 6 6-6" /></svg></summary>
              <p className="issue-full-title">{bug.title}</p>
            </details>
            </div>
            <div className="issue-heading-meta">
              <div className="issue-heading-chips">
                {bug.isDeleted ? <Badge className={`${issueChipBaseClass} bg-zk-bad-bg text-zk-bad-fg`}>Deleted</Badge> : null}
                <Badge className={`${issueChipBaseClass} ${issueStatusChipClass[bug.status]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{statusLabels[bug.status]}
                </Badge>
                <Badge className={`${issueChipBaseClass} ${issueSeverityChipClass[bug.severity]}`}>{severityLabels[bug.severity]}</Badge>
                {intakeStage ? <Badge className={`${issueChipBaseClass} ${issueStageChipClass[intakeStage]}`}>{issueStageLabels[intakeStage]}</Badge> : null}
                {bug.type ? <span className="issue-taxonomy">{bug.type.name}</span> : null}
                {bug.category ? <span className="issue-taxonomy">{bug.category.name}</span> : null}
                {extraBadgeCount > 0 ? <details className="issue-extra-details"><summary aria-label={`${extraBadgeCount} more details`}>+{extraBadgeCount}</summary><div>
                  {bug.isBoosted ? <span>Boosted</span> : null}
                  {volunteerCount > 0 ? <span>{volunteerCount} {volunteerCount === 1 ? "agent volunteered" : "agents volunteered"}</span> : null}
                </div></details> : null}
              </div>
              <p className="issue-opened">Opened <LocalTime date={bug.createdAt} /> by {bug.reporter.name}</p>
              {agentResolution ? <AgentResolvedNotice bugId={bug.id} resolution={agentResolution} canReopen={canUpdateStatus} /> : null}
            </div>
          </header>
          <IssueSectionTabs
            description={descriptionContent}
            conversationCount={comments.visibleCount}
            decisionsCount={agentDecisions.length}
            activityCount={activityCount}
            conversation={discussionContent}
            decisions={decisionsContent}
            activity={activityContent}
          />
          <IssueEscalations escalations={escalations} />

          <Suspense fallback={null}>
            <GoalBudgetSection tenantId={bug.tenantId} projectId={bug.projectId} bugId={bug.id} />
          </Suspense>
        </div>
        <aside className="issue-detail-aside" aria-label="Issue metadata">
          <div className="issue-sidebar-vote print:hidden">
            <VoteButton bugId={bug.id} voteCount={bug.voteCount} userVote={userVote} likeCount={voterSummary.likes.count} likeVoters={voterSummary.likes.voters} size="md" showAvatars={false} showReadinessGate={false} readOnly={bug.isDeleted} />
          </div>
          <section className="flex flex-col gap-3.5 rounded-[20px] border border-zk-border bg-zk-surface p-5">
            <span className="text-xs font-semibold text-zk-muted">People</span>
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
                    variant="secondary"
                    size="sm"
                    label={isAssignee ? "Unassign" : "Assign to me"}
                  />
                ) : null}
              </div>
            </div>
          </section>
          <div className="issue-sidebar-section issue-sidebar-proof">
          <EditableProofLinks
            bugId={bug.id}
            initialLinks={proofLinks}
            linkedPullRequestUrl={bug.pullRequestUrl}
            cardPresentation
            canEdit={(canEdit || isAssignee) && !bug.isDeleted}
          />
          </div>
          <section className="issue-sidebar-section">
            <h2>Evidence &amp; attachments</h2>
            {issueAttachments.length > 0 ? <a href="#issue-evidence" className="issue-evidence-link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8" /></svg>{issueAttachments.length} {issueAttachments.length === 1 ? "file attached" : "files attached"}</a> : <p>No screenshots, recordings or logs attached to this issue.</p>}
          </section>
          <section className="issue-sidebar-section">
            <h2>Workflow</h2>
            <p>{intakeStage ? intakeDetail(intakeStage, bug.voteCount) : statusLabels[bug.status]}</p>
            <a href="#decisions" className="issue-evidence-link">Agent decisions · {agentDecisions.length}</a>
          </section>
          <IssueBids
            bids={bidList}
            canAward={canAwardBid && intakeStage === "ready"}
          />
          <IssueActionsDialog />
        </aside>
      </div>
    </div>
  );
}
