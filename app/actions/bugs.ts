"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  activityCreateData,
  assigneeChangedSummary,
  boostedSummary,
  commentedSummary,
  commentPreview,
  createdSummary,
  deletedSummary,
  restoredSummary,
  severityChangedSummary,
  statusChangedSummary,
  unboostedSummary,
  type ActivityMetadata,
} from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/auth-helpers";
import {
  resolveSessionUserId,
  SESSION_EXPIRED_MESSAGE,
} from "@/lib/session-user";
import { MAX_COMMENT_DEPTH, commentDepth } from "@/lib/comments";
import {
  extractMentionedUserIds,
  normalizeMentions,
} from "@/lib/mentions";
import {
  commentSchema,
  createBugSchema,
  updateBugSchema,
} from "@/lib/validations/bug";
import {
  VOTE_CONFLICT_MESSAGE,
  VOTE_WRITE_ATTEMPTS,
  calculateVoteChange,
  isValidVoteDirection,
} from "@/lib/voting";
import {
  canDeleteTicket,
  canRestoreTicket,
  TICKET_DELETION_ERRORS,
} from "@/lib/ticket-deletion";
import { canBoostTicket, TICKET_BOOST_ERRORS } from "@/lib/ticket-boosting";
import { canAssignTicket, TICKET_ASSIGN_ERRORS } from "@/lib/ticket-assignment";
import { Prisma, type ActivityType } from "@prisma/client";
import { notifyLater } from "@/lib/notify";
import type { NotificationEvent } from "@/lib/notifications";

export type ActionResult = { error?: string; ok?: boolean };

/**
 * Resolves `@[Name](userId)` tags against real accounts: known ids are
 * rewritten to the current name, unknown ids degrade to plain `@Name`.
 */
async function normalizeMentionTags(text: string): Promise<string> {
  const mentionedIds = extractMentionedUserIds(text);
  if (mentionedIds.length === 0) return text;

  const validUsers = await prisma.user.findMany({
    where: { id: { in: mentionedIds } },
    select: { id: true, name: true },
  });
  const userMap = new Map(validUsers.map((user) => [user.id, user.name]));
  return normalizeMentions(text, userMap);
}

/** Redirects to login when the JWT is missing or no longer maps to a User row. */
async function requireUserId() {
  const resolved = await resolveSessionUserId();
  if ("error" in resolved) {
    redirect("/login");
  }
  return resolved.userId;
}

/** Creates a bug as the signed-in user; only admins may set severity/assignee. */
export async function createBugAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const userId = user.id;
  const admin = isAdmin(user.role);

  const rawAssignee = formData.get("assigneeId");
  const targetAssigneeId =
    rawAssignee === "" || rawAssignee === "unassigned" || rawAssignee === null || rawAssignee === undefined
      ? null
      : typeof rawAssignee === "string"
        ? rawAssignee.trim()
        : null;

  if (targetAssigneeId) {
    if (
      !canAssignTicket({
        actorId: userId,
        actorRole: user.role,
        currentAssigneeId: null,
        targetAssigneeId,
      })
    ) {
      return { error: TICKET_ASSIGN_ERRORS.unauthorized };
    }
  }

  // Non-admins cannot set severity at creation; assignee validated above.
  const parsed = createBugSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    severity: admin ? formData.get("severity") || "medium" : "medium",
    typeId: formData.get("typeId") || "",
    assigneeId: targetAssigneeId || "",
    categoryId: formData.get("categoryId") || "",
    proofLinks: formData.get("proofLinks") || "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const assigneeId =
    parsed.data.assigneeId && parsed.data.assigneeId.length > 0
      ? parsed.data.assigneeId
      : null;

  const typeId =
    parsed.data.typeId && parsed.data.typeId.length > 0
      ? parsed.data.typeId
      : null;

  if (assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true },
    });
    if (!assignee) {
      return { error: "Assignee not found" };
    }
  }

  const description = await normalizeMentionTags(parsed.data.description);

  const categoryId =
    parsed.data.categoryId && parsed.data.categoryId.length > 0
      ? parsed.data.categoryId
      : null;

  if (categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });
    if (!category || !category.isActive) {
      return { error: "Category not found or inactive" };
    }
  }

  // Always open at creation — createBugSchema rejects client status.
  let bug;
  try {
    bug = await prisma.bug.create({
      data: {
        title: parsed.data.title,
        description,
        severity: admin ? parsed.data.severity : "medium",
        status: "open",
        typeId,
        proofLinks: parsed.data.proofLinks,
        reporterId: userId,
        assigneeId,
        categoryId,
        activities: {
          create: {
            actorId: userId,
            type: "created",
            summary: createdSummary(parsed.data.title),
            metadata: {
              field: "title",
              to: parsed.data.title,
            } as Prisma.InputJsonValue,
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return { error: "Assignee not found" };
    }
    throw error;
  }

  const events: NotificationEvent[] = [];
  const actor = { actorId: userId, actorName: user.name ?? "Someone", bugId: bug.id, bugTitle: bug.title };
  const mentioned = extractMentionedUserIds(description);
  if (mentioned.length > 0) {
    events.push({ ...actor, kind: "mentioned", place: "description", recipientIds: mentioned });
  }
  if (assigneeId) {
    events.push({ ...actor, kind: "assignee_changed", fromUserId: null, toUserId: assigneeId });
  }
  if (events.length > 0) notifyLater(...events);

  revalidatePath("/bugs");
  redirect(`/bugs/${bug.id}`);
}

/** Updates status (assignee/admin) and severity/assignee (admin) and logs activity. */
export async function updateBugAction(
  bugId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const userId = user.id;
  const admin = isAdmin(user.role);

  const existing = await prisma.bug.findUnique({
    where: { id: bugId },
    include: {
      assignee: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
  });
  if (!existing || existing.isDeleted) {
    return { error: "Issue not found" };
  }

  const isAssignee = existing.assigneeId === userId;
  const assigneeRaw = formData.get("assigneeId");
  const hasAssigneeField = assigneeRaw !== null && assigneeRaw !== undefined;
  const targetAssigneeId = hasAssigneeField
    ? assigneeRaw === "" || assigneeRaw === "unassigned"
      ? null
      : typeof assigneeRaw === "string"
        ? assigneeRaw.trim()
        : null
    : undefined;

  const isSelfAssigning =
    targetAssigneeId !== undefined && targetAssigneeId === userId;

  if (!admin && !isAssignee && !isSelfAssigning) {
    return {
      error: "Only the assignee or an admin can update this issue",
    };
  }

  if (targetAssigneeId !== undefined && targetAssigneeId !== existing.assigneeId) {
    if (
      !canAssignTicket({
        actorId: userId,
        actorRole: user.role,
        currentAssigneeId: existing.assigneeId,
        targetAssigneeId,
      })
    ) {
      return { error: TICKET_ASSIGN_ERRORS.unauthorized };
    }
  }

  const categoryRaw = formData.get("categoryId");
  const typeRaw = formData.get("typeId");
  const parsed = updateBugSchema.safeParse({
    status: formData.get("status") || undefined,
    severity: admin ? formData.get("severity") || undefined : undefined,
    typeId: admin
      ? typeRaw === "" || typeRaw === "none"
        ? null
        : typeRaw || undefined
      : undefined,
    assigneeId: targetAssigneeId,
    categoryId: admin
      ? categoryRaw === "" || categoryRaw === "none"
        ? null
        : categoryRaw || undefined
      : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data: {
    status?: typeof parsed.data.status;
    severity?: typeof parsed.data.severity;
    typeId?: string | null;
    assigneeId?: string | null;
    categoryId?: string | null;
  } = {};

  if (parsed.data.status) data.status = parsed.data.status;
  if (admin) {
    if (parsed.data.severity) data.severity = parsed.data.severity;
    if (parsed.data.typeId !== undefined) {
      data.typeId = parsed.data.typeId === "" ? null : parsed.data.typeId;
    }
    if (parsed.data.categoryId !== undefined) {
      data.categoryId =
        parsed.data.categoryId === "" ? null : parsed.data.categoryId;
    }
  }
  if (parsed.data.assigneeId !== undefined) {
    data.assigneeId =
      parsed.data.assigneeId === "" ? null : parsed.data.assigneeId;
  }

  type PendingActivity = {
    type: ActivityType;
    summary: string;
    metadata?: ActivityMetadata;
  };
  const pending: PendingActivity[] = [];

  if (data.status && data.status !== existing.status) {
    pending.push({
      type: "status_changed",
      summary: statusChangedSummary(existing.status, data.status),
      metadata: {
        field: "status",
        from: existing.status,
        to: data.status,
      },
    });
  }

  if (data.severity && data.severity !== existing.severity) {
    pending.push({
      type: "severity_changed",
      summary: severityChangedSummary(existing.severity, data.severity),
      metadata: {
        field: "severity",
        from: existing.severity,
        to: data.severity,
      },
    });
  }

  if (
    data.assigneeId !== undefined &&
    data.assigneeId !== existing.assigneeId
  ) {
    let toName: string | null = null;
    if (data.assigneeId) {
      const nextAssignee = await prisma.user.findUnique({
        where: { id: data.assigneeId },
        select: { name: true },
      });
      if (!nextAssignee) {
        return { error: "Assignee not found" };
      }
      toName = nextAssignee.name ?? null;
    }
    pending.push({
      type: "assignee_changed",
      summary: assigneeChangedSummary(existing.assignee?.name ?? null, toName),
      metadata: {
        field: "assigneeId",
        from: existing.assigneeId,
        to: data.assigneeId,
      },
    });
  }

  if (data.categoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!cat) {
      return { error: "Category not found" };
    }
  }

  if (pending.length === 0 && Object.keys(data).length === 0) {
    return { ok: true };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.bug.update({
          where: { id: bugId },
          data,
        });
      }
      if (pending.length > 0) {
        await tx.bugActivity.createMany({
          data: activityCreateData(
            pending.map((entry) => ({
              bugId,
              actorId: userId,
              ...entry,
            })),
          ),
        });
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return { error: "Assignee not found" };
    }
    throw error;
  }

  const events: NotificationEvent[] = [];
  const actor = { actorId: userId, actorName: user.name ?? "Someone", bugId, bugTitle: existing.title };
  if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
    events.push({ ...actor, kind: "assignee_changed", fromUserId: existing.assigneeId, toUserId: data.assigneeId });
  }
  if (data.status && data.status !== existing.status) {
    events.push({ ...actor, kind: "status_changed", reporterId: existing.reporterId, from: existing.status, to: data.status });
  }
  if (events.length > 0) notifyLater(...events);

  revalidatePath("/bugs");
  revalidatePath(`/bugs/${bugId}`);
  return { ok: true };
}

/** Adds a (possibly threaded) comment to a bug and records the activity. */
export async function addCommentAction(
  bugId: string,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = commentSchema.safeParse({
    body: formData.get("body"),
    parentId: formData.get("parentId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment" };
  }

  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { id: true, isDeleted: true, title: true },
  });
  if (!bug || bug.isDeleted) {
    return { error: "Issue not found" };
  }

  const parentId = parsed.data.parentId;

  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { id: true, bugId: true, parentId: true },
    });

    if (!parent || parent.bugId !== bugId) {
      return { error: "Parent comment not found on this ticket" };
    }

    const threadComments = await prisma.comment.findMany({
      where: { bugId },
      select: { id: true, parentId: true },
    });
    const parentById = new Map(
      threadComments.map((c) => [c.id, c.parentId] as const),
    );
    const parentDepth = commentDepth(parent.id, parentById);

    if (parentDepth >= MAX_COMMENT_DEPTH) {
      return {
        error: `Replies are limited to ${MAX_COMMENT_DEPTH} levels of nesting`,
      };
    }
  }

  const normalizedBody = await normalizeMentionTags(parsed.data.body);

  await prisma.$transaction(async (tx) => {
    await tx.comment.create({
      data: {
        bugId,
        authorId: userId,
        body: normalizedBody,
        parentId: parentId ?? null,
      },
    });
    await tx.bugActivity.create({
      data: {
        bugId,
        actorId: userId,
        type: "commented",
        summary: commentedSummary(normalizedBody),
        metadata: {
          field: "comment",
          commentPreview: commentPreview(normalizedBody),
        } as Prisma.InputJsonValue,
      },
    });
    await tx.bug.update({
      where: { id: bugId },
      data: { updatedAt: new Date() },
    });
  });

  const mentioned = extractMentionedUserIds(normalizedBody);
  if (mentioned.length > 0) {
    const author = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    notifyLater({
      kind: "mentioned",
      actorId: userId,
      actorName: author?.name ?? "Someone",
      bugId,
      bugTitle: bug.title,
      place: "comment",
      recipientIds: mentioned,
      excerpt: commentPreview(normalizedBody),
    });
  }

  revalidatePath("/bugs");
  revalidatePath(`/bugs/${bugId}`);
  return { ok: true };
}

export type ToggleVoteResult = ActionResult & {
  voted?: boolean;
  userVote?: number;
  voteCount?: number;
  likeCount?: number;
  dislikeCount?: number;
};

/** Toggles the current user's reaction on a bug; rejects any direction other than 1 or -1. */
export async function toggleVoteAction(
  bugId: string,
  direction: unknown = 1,
): Promise<ToggleVoteResult> {
  if (!isValidVoteDirection(direction)) {
    return { error: "Invalid vote" };
  }

  // Do not redirect here — VoteButton needs a clear error for stale JWTs
  // after a DB reseed (old cuid no longer exists → Vote_userId_fkey).
  const resolved = await resolveSessionUserId();
  if ("error" in resolved) {
    return { error: SESSION_EXPIRED_MESSAGE };
  }
  const { userId } = resolved;

  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { id: true, isDeleted: true },
  });
  if (!bug || bug.isDeleted) {
    return { error: "Issue not found" };
  }

  // SERIALIZABLE so the read of the existing vote, the write, and the
  // voteCount increment are one atomic step. At the default READ COMMITTED,
  // two concurrent votes from the same user both read "no existing vote" and
  // both insert — one losing the race on the Vote(userId, bugId) unique
  // constraint with an unhandled P2002 — and a concurrent switch vote applies
  // countDelta twice, permanently skewing Bug.voteCount.
  //
  // Every vote also updates the same Bug row, so two people voting on one
  // issue at the same moment legitimately conflict. Retry those; only report
  // a conflict once the retries are exhausted.
  let result: ToggleVoteResult | undefined;
  for (let attempt = 1; attempt <= VOTE_WRITE_ATTEMPTS; attempt++) {
    try {
      result = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.vote.findUnique({
            where: { userId_bugId: { userId, bugId } },
          });

          const currentVote = existing?.value ?? 0;
          const { nextVote, countDelta } = calculateVoteChange(
            currentVote,
            direction,
          );

          if (nextVote === 0 && existing) {
            await tx.vote.delete({ where: { id: existing.id } });
          } else if (existing) {
            await tx.vote.update({
              where: { id: existing.id },
              data: { value: nextVote },
            });
          } else {
            await tx.vote.create({
              data: { userId, bugId, value: nextVote },
            });
          }

          const rows = await tx.$queryRaw<Array<{ voteCount: number }>>`
            UPDATE "Bug"
            SET "voteCount" = "voteCount" + ${countDelta}
            WHERE "id" = ${bugId}
            RETURNING "voteCount"
          `;

          const voteCount = rows[0]?.voteCount ?? 0;

          const voteCounts = await tx.vote.groupBy({
            by: ["value"],
            where: { bugId },
            _count: { _all: true },
          });

          let likeCount = 0;
          let dislikeCount = 0;
          for (const c of voteCounts) {
            if (c.value === 1) likeCount = c._count._all;
            if (c.value === -1) dislikeCount = c._count._all;
          }

          return {
            voted: nextVote === 1,
            userVote: nextVote,
            voteCount,
            likeCount,
            dislikeCount,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      // P2034 = serialization failure (the other transaction committed first).
      // P2002 = lost a race the serializable level did not cover.
      // Both mean the write was discarded whole, so retrying is safe.
      const isConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002");
      if (!isConflict) throw error;
      if (attempt === VOTE_WRITE_ATTEMPTS) {
        return { error: VOTE_CONFLICT_MESSAGE };
      }
    }
  }

  revalidatePath("/bugs");
  revalidatePath(`/bugs/${bugId}`);
  return { ok: true, ...result };
}

/**
 * Soft deletes a bug. Admins and super admins only.
 * The issue is hidden from normal views, but can be restored.
 */
export async function deleteBugAction(bugId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canDeleteTicket(user.role)) {
    return { error: TICKET_DELETION_ERRORS.unauthorized };
  }

  if (!bugId || typeof bugId !== "string" || bugId.trim().length === 0) {
    return { error: TICKET_DELETION_ERRORS.invalidId };
  }

  const existing = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { id: true, isDeleted: true },
  });

  if (!existing) {
    return { error: TICKET_DELETION_ERRORS.notFound };
  }

  if (existing.isDeleted) {
    return { error: TICKET_DELETION_ERRORS.alreadyDeleted };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bug.update({
        where: { id: bugId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      await tx.bugActivity.create({
        data: {
          bugId,
          actorId: user.id,
          type: "deleted",
          summary: deletedSummary(),
        },
      });
    });
  } catch (error) {
    console.error("Failed to delete bug:", error);
    return { error: TICKET_DELETION_ERRORS.failed };
  }

  revalidatePath("/bugs");
  revalidatePath(`/bugs/${bugId}`);
  redirect("/bugs");
}

/**
 * Restores a soft-deleted bug. Admins and super admins only.
 * Returns the issue back to active status in views and searches.
 */
export async function restoreBugAction(bugId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canRestoreTicket(user.role)) {
    return { error: TICKET_DELETION_ERRORS.unauthorizedRestore };
  }

  if (!bugId || typeof bugId !== "string" || bugId.trim().length === 0) {
    return { error: TICKET_DELETION_ERRORS.invalidId };
  }

  const existing = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { id: true, isDeleted: true },
  });

  if (!existing) {
    return { error: TICKET_DELETION_ERRORS.notFound };
  }

  if (!existing.isDeleted) {
    return { error: TICKET_DELETION_ERRORS.notDeleted };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bug.update({
        where: { id: bugId },
        data: {
          isDeleted: false,
          deletedAt: null,
        },
      });

      await tx.bugActivity.create({
        data: {
          bugId,
          actorId: user.id,
          type: "restored",
          summary: restoredSummary(),
        },
      });
    });
  } catch (error) {
    console.error("Failed to restore bug:", error);
    return { error: TICKET_DELETION_ERRORS.failedRestore };
  }

  revalidatePath("/bugs");
  revalidatePath(`/bugs/${bugId}`);
  return { ok: true };
}

/**
 * Toggles the boosted status of a bug. Admins and super admins only.
 * When boosted, the ticket appears pinned to the top of the list regardless of vote count.
 */
export async function toggleBoostBugAction(
  bugId: string,
): Promise<ActionResult & { isBoosted?: boolean }> {
  const user = await requireUser();
  if (!canBoostTicket(user.role)) {
    return { error: TICKET_BOOST_ERRORS.unauthorized };
  }

  if (!bugId || typeof bugId !== "string" || bugId.trim().length === 0) {
    return { error: TICKET_BOOST_ERRORS.invalidId };
  }

  const existing = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { id: true, isBoosted: true, isDeleted: true },
  });

  if (!existing || existing.isDeleted) {
    return { error: TICKET_BOOST_ERRORS.notFound };
  }

  const nextBoosted = !existing.isBoosted;
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bug.update({
        where: { id: bugId },
        data: {
          isBoosted: nextBoosted,
          boostedAt: nextBoosted ? now : null,
        },
      });

      await tx.bugActivity.create({
        data: {
          bugId,
          actorId: user.id,
          type: nextBoosted ? "boosted" : "unboosted",
          summary: nextBoosted ? boostedSummary() : unboostedSummary(),
          metadata: {
            field: "isBoosted",
            to: String(nextBoosted),
          } as Prisma.InputJsonValue,
        },
      });
    });
  } catch (error) {
    console.error("Failed to toggle bug boost:", error);
    return { error: TICKET_BOOST_ERRORS.failed };
  }

  revalidatePath("/bugs");
  revalidatePath(`/bugs/${bugId}`);
  return { ok: true, isBoosted: nextBoosted };
}

/**
 * Allows a user to assign an issue to themselves, or unassign if currently assigned.
 * Validates permission via canAssignTicket.
 */
export async function selfAssignBugAction(
  bugId: string,
  assign: boolean = true,
): Promise<ActionResult> {
  const user = await requireUser();
  const userId = user.id;

  if (!bugId || typeof bugId !== "string" || bugId.trim().length === 0) {
    return { error: TICKET_ASSIGN_ERRORS.invalidId };
  }

  const existing = await prisma.bug.findUnique({
    where: { id: bugId },
    select: {
      id: true,
      title: true,
      assigneeId: true,
      isDeleted: true,
      assignee: { select: { name: true } },
    },
  });

  if (!existing || existing.isDeleted) {
    return { error: TICKET_ASSIGN_ERRORS.notFound };
  }

  const targetAssigneeId = assign ? userId : null;

  if (
    !canAssignTicket({
      actorId: userId,
      actorRole: user.role,
      currentAssigneeId: existing.assigneeId,
      targetAssigneeId,
    })
  ) {
    return { error: TICKET_ASSIGN_ERRORS.unauthorized };
  }

  if (existing.assigneeId === targetAssigneeId) {
    return { ok: true };
  }

  const toName = targetAssigneeId ? user.name ?? null : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bug.update({
        where: { id: bugId },
        data: { assigneeId: targetAssigneeId },
      });

      await tx.bugActivity.create({
        data: {
          bugId,
          actorId: userId,
          type: "assignee_changed",
          summary: assigneeChangedSummary(
            existing.assignee?.name ?? null,
            toName,
          ),
          metadata: {
            field: "assigneeId",
            from: existing.assigneeId,
            to: targetAssigneeId,
          },
        },
      });
    });
  } catch (error) {
    console.error("Failed to self-assign issue:", error);
    return { error: TICKET_ASSIGN_ERRORS.failed };
  }

  notifyLater({
    kind: "assignee_changed",
    actorId: userId,
    actorName: user.name ?? "Someone",
    bugId,
    bugTitle: existing.title,
    fromUserId: existing.assigneeId,
    toUserId: targetAssigneeId,
  });

  revalidatePath(`/bugs/${bugId}`);
  revalidatePath("/bugs");
  return { ok: true };
}


