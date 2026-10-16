import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { resolveSessionUserId } from "@/lib/session-user";
import { LocalTime } from "@/components/local-time";
import { buildCommentTree } from "@/lib/comments";
import {
  bugLinkPreviewDescription,
  snippetText,
} from "@/lib/link-preview";
import { stripMarkdown } from "@/lib/rich-text";
import { absoluteUrl } from "@/lib/site-url";
import {
  severityClass,
  severityLabels,
  statusClass,
  statusLabels,
} from "@/lib/labels";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Badge } from "@/components/ui/badge";
import { VoteButton } from "@/components/vote-button";
import { UpdateBugForm } from "@/components/update-bug-form";
import { CommentThread } from "@/components/comment-thread";
import { RichText } from "@/components/rich-text";
import { UserNameWithBadges } from "@/components/user-name-with-badges";

type BugPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: BugPageProps): Promise<Metadata> {
  const { id } = await params;
  const bug = await prisma.bug.findUnique({
    where: { id },
    select: {
      title: true,
      description: true,
      status: true,
      updatedAt: true,
      reporter: { select: { name: true } },
    },
  });

  if (!bug) {
    return {
      title: "Bug not found",
      description: "This bug report could not be found.",
      robots: { index: false, follow: false },
    };
  }

  const description = bugLinkPreviewDescription({
    status: bug.status,
    authorName: bug.reporter.name,
    description: stripMarkdown(bug.description),
  });
  const canonical = absoluteUrl(`/bugs/${id}`);
  // Brand mark from public/; most unfurlers accept SVG, raster copy at /Zedu.png.
  const image = absoluteUrl("/zedu-mark.svg");
  const title = bug.title;

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
      siteName: "Zedu Bugs",
      authors: [bug.reporter.name],
      modifiedTime: bug.updatedAt.toISOString(),
      images: [{ url: image, alt: "Zedu Bugs" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    other: {
      "bug:status": statusLabels[bug.status],
      "bug:author": bug.reporter.name,
    },
  };
}

export default async function BugDetailPage({ params }: BugPageProps) {
  const { id } = await params;
  const resolved = await resolveSessionUserId();
  const userId = "userId" in resolved ? resolved.userId : undefined;

  // Unauthenticated crawlers only get a safe, limited preview (no comments,
  // emails, or proof links). Interactive UI stays behind auth.
  if (!userId) {
    const bug = await prisma.bug.findUnique({
      where: { id },
      select: {
        title: true,
        description: true,
        status: true,
        severity: true,
        reporter: { select: { name: true } },
      },
    });
    if (!bug) notFound();

    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <p className="text-sm text-slate-500">Zedu Bugs</p>
        <h1 className="text-2xl font-semibold text-slate-900">{bug.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge className={statusClass[bug.status]}>
            {statusLabels[bug.status]}
          </Badge>
          <Badge className={severityClass[bug.severity]}>
            {severityLabels[bug.severity]}
          </Badge>
        </div>
        <p className="text-sm text-slate-600">
          Reported by {bug.reporter.name}
        </p>
        <p className="text-slate-800">{snippetText(bug.description, 280)}</p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/bugs/${id}`)}`}
          className="inline-flex text-sm font-medium text-teal-700 hover:underline"
        >
          Sign in to view full details
        </Link>
      </div>
    );
  }

  const sessionUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const canTriage = isAdmin(sessionUser?.role);

  const [bug, users] = await Promise.all([
    prisma.bug.findUnique({
      where: { id },
      include: {
        reporter: { select: { name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, role: true } },
        comments: {
          include: {
            author: { select: { name: true, role: true } },
            parent: {
              select: {
                id: true,
                body: true,
                author: { select: { name: true, role: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        activities: {
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
        votes: { where: { userId }, select: { id: true, value: true }, take: 1 },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  if (!bug) {
    notFound();
  }

  const isAssignee = !!userId && bug.assigneeId === userId;
  const canUpdateStatus = canTriage || isAssignee;
  const userVote =
    Array.isArray(bug.votes) && bug.votes.length > 0
      ? (bug.votes[0].value ?? 1)
      : 0;
  const commentTree = buildCommentTree(bug.comments);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/bugs" className="text-sm text-teal-700 hover:underline">
          ← Back to bugs
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          <VoteButton
            bugId={bug.id}
            voteCount={bug.voteCount}
            userVote={userVote}
            size="md"
          />

          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              {bug.title}
            </h1>
            <div className="flex flex-wrap gap-2">
              <Badge className={statusClass[bug.status]}>
                {statusLabels[bug.status]}
              </Badge>
              <Badge className={severityClass[bug.severity]}>
                {severityLabels[bug.severity]}
              </Badge>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {Math.max(0, bug.voteCount)} like{Math.max(0, bug.voteCount) === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Description
        </h2>
        <RichText content={bug.description} />
        <dl className="mt-6 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-500">Reporter</dt>
            <dd>
              <UserNameWithBadges
                name={bug.reporter.name}
                role={bug.reporter.role}
                showAuthor
              />
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Assignee</dt>
            <dd>
              {bug.assignee ? (
                <UserNameWithBadges
                  name={bug.assignee.name}
                  role={bug.assignee.role}
                />
              ) : (
                "Unassigned"
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Created</dt>
            <dd><LocalTime date={bug.createdAt} /></dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Updated</dt>
            <dd><LocalTime date={bug.updatedAt} /></dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Proof links
        </h2>
        {bug.proofLinks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No proof links attached to this report.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bug.proofLinks.map((url, index) => (
              <li key={`${index}-${url}`}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-medium text-teal-700 hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canUpdateStatus ? (
        <UpdateBugForm
          bugId={bug.id}
          status={bug.status}
          severity={bug.severity}
          assigneeId={bug.assigneeId}
          users={users}
          canEditTriage={canTriage}
        />
      ) : null}

      <ActivityTimeline activities={bug.activities} />

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Comments ({bug.comments.length})
        </h2>
        <CommentThread
          bugId={bug.id}
          reporterId={bug.reporterId}
          comments={commentTree}
          users={users}
        />
      </section>
    </div>
  );
}
