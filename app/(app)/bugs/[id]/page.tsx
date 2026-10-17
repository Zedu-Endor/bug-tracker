import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/auth-helpers";
import { resolveSessionUserId } from "@/lib/session-user";
import { LocalTime } from "@/components/local-time";
import { formatIssueNumber } from "@/lib/issue-number";
import { buildCommentTree, countVisibleComments, type FlatComment } from "@/lib/comments";
import {
  bugLinkPreviewDescription,
} from "@/lib/link-preview";
import { absoluteUrl } from "@/lib/site-url";
import { SHARE_IMAGE } from "@/lib/share-image";
import {
  severityClass,
  severityLabels,
  statusClass,
  statusLabels,
} from "@/lib/labels";
import { ActivityTimeline, type ActivityEntry } from "@/components/activity-timeline";
import { Badge } from "@/components/ui/badge";
import { VoteButton } from "@/components/vote-button";
import { WatchButton } from "@/components/watch-button";
import { isWatchingIssue } from "@/lib/watch";
import { UpdateBugForm } from "@/components/update-bug-form";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentList, type AttachmentView } from "@/components/attachment-list";
import { UserNameWithBadges } from "@/components/user-name-with-badges";
import { getActiveIssueTypes } from "@/lib/issue-types";
import { getIssueTypeBadgeClass } from "@/lib/issue-type-styles";
import { fetchVoterSummary } from "@/lib/voter-summaries";
import { createEmptyVoterSummary } from "@/lib/voters";
import { canDeleteTicket } from "@/lib/ticket-deletion";
import { canEditTicket } from "@/lib/ticket-editing";
import { DeleteBugButton } from "@/components/delete-bug-button";
import { RestoreBugButton } from "@/components/restore-bug-button";
import { BoostTicketButton } from "@/components/boost-ticket-button";
import { canAssignTicket } from "@/lib/ticket-assignment";
import { SelfAssignButton } from "@/components/self-assign-button";
import { EditableIssueDescription } from "@/components/editable-issue-description";
import { withCurrentOption } from "@/lib/triage-options";

type BugPageProps = {
  params: Promise<{ id: string }>;
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

function issueLoadError(detail: string) {
  return (
    <div className="rounded-xl border border-red-200 bg-white px-6 py-10">
      <h1 className="text-xl font-semibold text-slate-900">This issue could not be loaded</h1>
      <p className="mt-2 text-sm text-slate-600">
        The issue query failed. The message below is the database error.
      </p>
      <pre className="mt-4 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
        {detail}
      </pre>
    </div>
  );
}

export async function generateMetadata({
  params,
}: BugPageProps): Promise<Metadata> {
  const { id } = await params;
  const bug = await prisma.bug.findUnique({
    where: { id },
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
  const canonical = absoluteUrl(`/bugs/${id}`);
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
      siteName: "Zedu Issues",
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

export default async function BugDetailPage({ params }: BugPageProps) {
  const { id } = await params;
  const resolved = await resolveSessionUserId();
  const userId = "userId" in resolved ? resolved.userId : undefined;

  // Unauthenticated link-preview bots get the title and status only (#117).
  // They're recognised by User-Agent, which anyone can fake, so nothing more
  // sensitive (reporter, severity, description) may appear here.
  if (!userId) {
    const bug = await prisma.bug.findUnique({
      where: { id },
      select: {
        title: true,
        status: true,
        isDeleted: true,
      },
    });
    if (!bug || bug.isDeleted) notFound();

    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <p className="text-sm text-slate-500">Zedu Issues</p>
        <h1 className="text-2xl font-semibold text-slate-900">{bug.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge className={statusClass[bug.status]}>
            {statusLabels[bug.status]}
          </Badge>
        </div>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/bugs/${id}`)}`}
          className="inline-flex text-sm font-medium text-teal-700 hover:underline"
        >
          Sign in to view full details
        </Link>
      </div>
    );
  }

  const user = await requireUser();
  const canTriage = isAdmin(user.role);
  const canDelete = canDeleteTicket(user.role);

  // The list page already proved the issue row itself can be read. Comments,
  // the activity log, watches and attachments are newer tables. One of them
  // missing used to reject this whole Promise and blank the page.
  const loadedBug = await prisma.bug
    .findUnique({
      where: { id },
      include: {
        type: { select: { id: true, name: true, isActive: true } },
        reporter: { select: { name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, role: true } },
        category: { select: { id: true, name: true, isActive: true } },
        votes: { where: { userId }, select: { id: true, value: true }, take: 1 },
      },
    })
    .then((bug) => ({ bug }))
    .catch((error: unknown) => {
      console.error("[issue] detail query failed", error);
      const detail = error instanceof Error ? error.message : "Could not load issue";
      return { detail };
    });
  if ("detail" in loadedBug) {
    return issueLoadError(loadedBug.detail);
  }
  const bug = loadedBug.bug;

  if (!bug) {
    notFound();
  }

  if (bug.isDeleted && !canDelete) {
    notFound();
  }

  const [users, categories, types, voterSummary, activities, activityCount, watchRow, comments, attachments] =
    await Promise.all([
      loadOptional("users", [], () =>
        prisma.user.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, role: true },
        }),
      ),
      loadOptional("platforms", [], () =>
        prisma.category.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ),
      canTriage ? loadOptional("types", [], () => getActiveIssueTypes()) : Promise.resolve([]),
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
      loadOptional<{ userId: string; watching: boolean } | null>("watch", null, () =>
        prisma.issueWatch.findUnique({
          where: { userId_bugId: { userId: user.id, bugId: id } },
          select: { userId: true, watching: true },
        }),
      ),
      loadOptional("comments", [] as FlatComment[], () =>
        prisma.comment.findMany({
          where: { bugId: id },
          include: {
            author: { select: { name: true, role: true } },
            parent: {
              select: {
                id: true,
                body: true,
                deletedAt: true,
                author: { select: { name: true, role: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
      ),
      // Files on the issue and on its comments (#215); never the file contents here.
      loadOptional("attachments", [], () =>
        prisma.attachment.findMany({
          where: { bugId: id },
          select: { id: true, filename: true, contentType: true, size: true, commentId: true },
          orderBy: { createdAt: "asc" },
        }),
      ),
    ]);
  const issueAttachments: AttachmentView[] = attachments.filter((a) => !a.commentId);
  const attachmentsByComment: Record<string, AttachmentView[]> = {};
  for (const a of attachments) {
    if (a.commentId) (attachmentsByComment[a.commentId] ??= []).push(a);
  }

  const isAssignee = !!userId && bug.assigneeId === userId;
  const canUpdateStatus = canTriage || isAssignee;
  const canEdit =
    canEditTicket({
      actorId: userId,
      actorRole: user.role,
      reporterId: bug.reporterId,
    }) && !bug.isDeleted;
  const canSelfAssign =
    !bug.isDeleted &&
    canAssignTicket({
      actorId: userId,
      actorRole: user.role,
      currentAssigneeId: bug.assigneeId,
      targetAssigneeId: isAssignee ? null : userId,
    });
  const userVote =
    Array.isArray(bug.votes) && bug.votes.length > 0
      ? (bug.votes[0].value ?? 1)
      : 0;
  const commentTree = buildCommentTree(comments);
  const proofLinks = bug.proofLinks ?? [];

  return (
    <div className="space-y-6">
      {bug.isDeleted ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-xl">🗑️</span>
              <div>
                <h3 className="text-sm font-semibold text-red-900">
                  This issue was deleted
                </h3>
                <p className="text-xs text-red-700">
                  It is currently hidden from regular users. Admins and super admins can restore it at any time.
                </p>
              </div>
            </div>
            <RestoreBugButton bugId={bug.id} bugTitle={bug.title} size="sm" />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link href="/bugs" className="text-sm text-teal-700 hover:underline">
            ← Back to issues
          </Link>
          <div className="mt-3 space-y-3">
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 break-words">
                <span className="font-normal text-slate-500 tabular-nums">
                  {formatIssueNumber(bug.number)}
                </span>{" "}
                {bug.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {bug.isDeleted ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-900 shadow-2xs">
                    🗑️ Deleted
                  </span>
                ) : null}
                {bug.isBoosted && !bug.isDeleted ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 shadow-2xs">
                    ⚡ Boosted
                  </span>
                ) : null}
                {bug.type ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getIssueTypeBadgeClass(
                      bug.type.name,
                    )}`}
                  >
                    {bug.type.name}
                  </span>
                ) : null}
                <Badge className={statusClass[bug.status]}>
                  {statusLabels[bug.status]}
                </Badge>
                <Badge className={severityClass[bug.severity]}>
                  {severityLabels[bug.severity]}
                </Badge>
                {bug.category ? (
                  <Badge className="border border-teal-200 bg-teal-50 text-teal-950">
                    {bug.category.name}
                  </Badge>
                ) : null}
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {bug.voteCount} score ({voterSummary.likes.count} like{voterSummary.likes.count === 1 ? "" : "s"}, {voterSummary.dislikes.count} dislike{voterSummary.dislikes.count === 1 ? "" : "s"})
                </span>
              </div>
            </div>

            {/* Reactions and larger avatars sitting under the title */}
            <div className="pt-1">
              <VoteButton
                bugId={bug.id}
                voteCount={bug.voteCount}
                userVote={userVote}
                likeCount={voterSummary.likes.count}
                dislikeCount={voterSummary.dislikes.count}
                likeVoters={voterSummary.likes.voters}
                dislikeVoters={voterSummary.dislikes.voters}
                size="md"
                showAvatars
                readOnly={bug.isDeleted}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:pt-6">
          {!bug.isDeleted ? (
            <WatchButton
              bugId={bug.id}
              watching={isWatchingIssue(user.id, [bug.reporterId, bug.assigneeId], watchRow)}
            />
          ) : null}
          {canTriage && !bug.isDeleted ? (
            <BoostTicketButton
              bugId={bug.id}
              isBoosted={bug.isBoosted}
              size="sm"
            />
          ) : null}
          {canDelete ? (
            bug.isDeleted ? (
              <RestoreBugButton
                bugId={bug.id}
                bugTitle={bug.title}
                size="sm"
              />
            ) : (
              <DeleteBugButton
                bugId={bug.id}
                bugTitle={bug.title}
                variant="danger-secondary"
                size="sm"
              />
            )
          ) : null}
        </div>
      </div>

      <EditableIssueDescription
        bugId={bug.id}
        initialTitle={bug.title}
        initialDescription={bug.description}
        canEdit={canEdit}
        users={users}
      >
        <dl className="mt-6 grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-2">
          {bug.type ? (
            <div>
              <dt className="font-medium text-slate-500">Type</dt>
              <dd>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getIssueTypeBadgeClass(
                    bug.type.name,
                  )}`}
                >
                  {bug.type.name}
                </span>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium text-slate-500">Reporter</dt>
            <dd>
              <UserNameWithBadges
                name={bug.reporter.name}
                role={bug.reporter.role}
                userId={bug.reporterId}
                showAuthor
              />
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Assignee</dt>
            <dd className="flex items-center gap-2">
              {bug.assignee ? (
                <UserNameWithBadges
                  name={bug.assignee.name}
                  role={bug.assignee.role}
                  userId={bug.assigneeId}
                />
              ) : (
                <span className="text-slate-500">Unassigned</span>
              )}
              {canSelfAssign ? (
                <SelfAssignButton
                  bugId={bug.id}
                  isAssignedToMe={isAssignee}
                  variant="ghost"
                  size="xs"
                />
              ) : null}
            </dd>
          </div>
          {bug.category ? (
            <div>
              <dt className="font-medium text-slate-500">Platform</dt>
              <dd>{bug.category.name}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium text-slate-500">Created</dt>
            <dd><LocalTime date={bug.createdAt} /></dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Updated</dt>
            <dd><LocalTime date={bug.updatedAt} /></dd>
          </div>
        </dl>
      </EditableIssueDescription>

      {issueAttachments.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Attachments
          </h2>
          <AttachmentList attachments={issueAttachments} />
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Proof links
        </h2>
        {proofLinks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No proof links attached to this report.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {proofLinks.map((url, index) => (
              <li key={`${index}-${url}`}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 break-all text-sm font-medium text-teal-700 hover:underline"
                >
                  <svg
                    className="h-4 w-4 shrink-0 text-slate-600"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                  <span>{url}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canUpdateStatus && !bug.isDeleted ? (
        <UpdateBugForm
          bugId={bug.id}
          status={bug.status}
          severity={bug.severity}
          typeId={bug.typeId}
          assigneeId={bug.assigneeId}
          categoryId={bug.categoryId}
          users={users}
          categories={withCurrentOption(categories, bug.category)}
          types={withCurrentOption(types, bug.type)}
          canEditTriage={canTriage}
        />
      ) : null}

      <ActivityTimeline
        activities={[...activities].reverse()}
        totalCount={activityCount}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Comments ({countVisibleComments(comments)})
        </h2>
        <CommentThread
          bugId={bug.id}
          reporterId={bug.reporterId}
          comments={commentTree}
          attachmentsByComment={attachmentsByComment}
          users={users}
          currentUserId={user.id}
          currentUserRole={user.role}
          readOnly={bug.isDeleted}
        />
      </section>

      {canDelete && !bug.isDeleted ? (
        <section className="rounded-xl border border-red-200 bg-red-50/50 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700">
                Danger zone
              </h2>
              <p className="text-sm text-slate-600">
                Delete this issue. It will be hidden from everyone except admins, who can restore it.
              </p>
            </div>
            <DeleteBugButton
              bugId={bug.id}
              bugTitle={bug.title}
              variant="danger"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
