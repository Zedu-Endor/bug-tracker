"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  activityCreateData,
  assigneeChangedSummary,
  boostedSummary,
  categoryChangedSummary,
  commentedSummary,
  commentPreview,
  createdSummary,
  deletedSummary,
  restoredSummary,
  severityChangedSummary,
  statusChangedSummary,
  typeChangedSummary,
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
  newlyMentionedUserIds,
  normalizeMentions,
} from "@/lib/mentions";
import {
  commentSchema,
  createBugSchema,
  editBugContentSchema,
  updateBugSchema,
} from "@/lib/validations/bug";
import { calculateVoteChange, isValidVoteDirection } from "@/lib/voting";
import {
  canDeleteTicket,
  canRestoreTicket,
  TICKET_DELETION_ERRORS,
} from "@/lib/ticket-deletion";
import {
  canBoostTicket,
  shouldUnboostOnStatusChange,
  TICKET_BOOST_ERRORS,
} from "@/lib/ticket-boosting";
import { canAssignTicket, TICKET_ASSIGN_ERRORS } from "@/lib/ticket-assignment";
import { canChangeTicketStatus, TICKET_TRIAGE_ERRORS } from "@/lib/ticket-triage";
import {
  canEditTicket,
  formatEditSummary,
  getChangedEditFields,
  TICKET_EDIT_ERRORS,
} from "@/lib/ticket-editing";
import { Prisma, type ActivityType } from "@prisma/client";
import { notifyLater } from "@/lib/notify";
import { ensureWatching } from "@/lib/watch";
import type { NotificationEvent } from "@/lib/notifications";
import { getForeignKeyErrorMessage } from "@/lib/foreign-key-errors";
import { parseAttachmentIds } from "@/lib/attachments";
import { linkAttachments } from "@/lib/attachment-link";
import {
  checkRateLimit,
  ACTION_RATE_LIMITS,
  RATE_LIMIT_MESSAGE,
} from "@/lib/rate-limit";

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

  const limit = checkRateLimit(
    `create-bug:${userId}`,
    ACTION_RATE_LIMITS.createBug,
  );
  if (!limit.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

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

  if (typeId) {
    const issueType = await prisma.issueType.findUnique({
      where: { id: typeId },
      select: { id: true, isActive: true },
    });
    if (!issueType || !issueType.isActive) {
      return { error: "That type no longer exists. Please pick another." };
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
      return { error: "Platform not found or inactive" };
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
        // Reporter and assignee watch the issue from the start (#216).
        watches: {
          create: [...new Set([userId, assigneeId].filter((id): id is string => Boolean(id)))].map(
            (watcherId) => ({ userId: watcherId }),
          ),
        },
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
      return {
        error: getForeignKeyErrorMessage(
          error.meta as Record<string, unknown> | undefined,
        ),
      };
    }
    throw error;
  }

  // Files uploaded while writing the report (#215).
  await linkAttachments(prisma, {
    ids: parseAttachmentIds(formData.get("attachmentIds")),
    uploaderId: userId,
    bugId: bug.id,
  });

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
      type: { select: { id: true, name: true } },
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

  // #202: `status` is a triage field and must be gated on the issue's current
  // assignee (or an admin) - never on the assignee this request is trying to
  // set. Without this, a self-assignment satisfied the gate above and the same
  // request could also close/reopen the issue, letting any user close any
  // unassigned issue. Checked before schema parsing so the error is explicit.
  const requestedStatus = formData.get("status") || undefined;
  if (
    requestedStatus &&
    !canChangeTicketStatus({
      actorId: userId,
      actorRole: user.role,
      currentAssigneeId: existing.assigneeId,
    })
  ) {
    return { error: TICKET_TRIAGE_ERRORS.statusUnauthorized };
  }

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
    status: requestedStatus,
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

  // Claiming an issue doesn't also grant its status in the same request: a
  // normal user who isn't the assignee yet must assign themselves first
  // (#218, #175).
  if (
    !admin &&
    !isAssignee &&
    parsed.data.status &&
    parsed.data.status !== existing.status
  ) {
    return { error: TICKET_ASSIGN_ERRORS.statusNeedsAssignment };
  }

  const data: {
    status?: typeof parsed.data.status;
    severity?: typeof parsed.data.severity;
    typeId?: string | null;
    assigneeId?: string | null;
    categoryId?: string | null;
    isBoosted?: boolean;
    boostedAt?: Date | null;
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

  // #256: a resolved or closed issue shouldn't stay pinned above open work.
  if (
    shouldUnboostOnStatusChange({
      isBoosted: existing.isBoosted,
      from: existing.status,
      to: data.status,
    })
  ) {
    data.isBoosted = false;
    data.boostedAt = null;
    pending.push({
      type: "unboosted",
      summary: unboostedSummary(),
      metadata: { field: "isBoosted", to: "false" },
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

  if (data.typeId !== undefined && data.typeId !== existing.typeId) {
    let toName: string | null = null;
    if (data.typeId) {
      const nextType = await prisma.issueType.findUnique({
        where: { id: data.typeId },
        select: { id: true, name: true, isActive: true },
      });
      if (!nextType || !nextType.isActive) {
        return { error: "That type no longer exists. Please pick another." };
      }
      toName = nextType.name;
    }
    pending.push({
      type: "type_changed",
      summary: typeChangedSummary(existing.type?.name ?? null, toName),
      metadata: {
        field: "type",
        from: existing.type?.name ?? null,
        to: toName,
      },
    });
  }

  if (
    data.categoryId !== undefined &&
    data.categoryId !== existing.categoryId
  ) {
    let toName: string | null = null;
    if (data.categoryId) {
      const cat = await prisma.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true, name: true },
      });
      if (!cat) {
        return { error: "Platform not found" };
      }
      toName = cat.name;
    }
    pending.push({
      type: "category_changed",
      summary: categoryChangedSummary(existing.category?.name ?? null, toName),
      metadata: {
        field: "category",
        from: existing.category?.name ?? null,
        to: toName,
      },
    });
  } else if (data.categoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!cat) {
      return { error: "Platform not found" };
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
      if (data.assigneeId) {
        // The new assignee starts watching (#216).
        await ensureWatching(tx, bugId, [data.assigneeId]);
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
      return {
        error: getForeignKeyErrorMessage(
          error.meta as Record<string, unknown> | undefined,
        ),
      };
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

/** Allows the reporter or an admin to edit an issue's title and description. */
export async function editBugContentAction(
  bugId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const userId = user.id;

  const limit = checkRateLimit(
    `edit-bug:${userId}`,
    ACTION_RATE_LIMITS.editBug,
  );
  if (!limit.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  const existing = await prisma.bug.findUnique({
    where: { id: bugId },
    select: {
      id: true,
      title: true,
      description: true,
      reporterId: true,
      isDeleted: true,
    },
  });

  if (!existing || existing.isDeleted) {
    return { error: TICKET_EDIT_ERRORS.notFound };
  }

  if (
    !canEditTicket({
      actorId: userId,
      actorRole: user.role,
      reporterId: existing.reporterId,
    })
  ) {
    return { error: TICKET_EDIT_ERRORS.unauthorized };
  }

  const parsed = editBugContentSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const normalizedDescription = await normalizeMentionTags(parsed.data.description);
  const changedFields = getChangedEditFields(existing, {
    title: parsed.data.title,
    description: normalizedDescription,
  });

  if (changedFields.length === 0) {
    return { ok: true };
  }

  const summary = formatEditSummary(changedFields);

  await prisma.$transaction(async (tx) => {
    await tx.bug.update({
      where: { id: bugId },
      data: {
        title: parsed.data.title,
        description: normalizedDescription,
        updatedAt: new Date(),
      },
    });

    await tx.bugActivity.create({
      data: {
        bugId,
        actorId: userId,
        type: "edited",
        summary,
        metadata: {
          fields: changedFields,
        },
      },
    });
  });

  const newlyMentioned = newlyMentionedUserIds(
    existing.description,
    normalizedDescription,
  );
  if (newlyMentioned.length > 0) {
    notifyLater({
      kind: "mentioned",
      actorId: userId,
      actorName: user.name ?? "Someone",
      bugId,
      bugTitle: parsed.data.title,
      place: "description",
      recipientIds: newlyMentioned,
    });
  }

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

  const limit = checkRateLimit(
    `add-comment:${userId}`,
    ACTION_RATE_LIMITS.addComment,
  );
  if (!limit.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  const parsed = commentSchema.safeParse({
    body: formData.get("body"),
    parentId: formData.get("parentId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment" };
  }

  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { id: true, isDeleted: true, title: true, reporterId: true, assigneeId: true },
  });
  if (!bug || bug.isDeleted) {
    return { error: "Issue not found" };
  }

  const parentId = parsed.data.parentId;
  let parentAuthorId: string | null = null;

  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { id: true, bugId: true, parentId: true, deletedAt: true, authorId: true },
    });

    if (!parent || parent.bugId !== bugId) {
      return { error: "Parent comment not found on this issue" };
    }
    if (parent.deletedAt) {
      return { error: "You can't reply to a deleted comment" };
    }
    parentAuthorId = parent.authorId;

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

  const commentId = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        bugId,
        authorId: userId,
        body: normalizedBody,
        parentId: parentId ?? null,
      },
      select: { id: true },
    });
    // Files uploaded with the comment (#215).
    await linkAttachments(tx, {
      ids: parseAttachmentIds(formData.get("attachmentIds")),
      uploaderId: userId,
      bugId,
      commentId: created.id,
    });
    await tx.bugActivity.create({
      data: {
        bugId,
        actorId: userId,
        type: "commented",
        summary: commentedSummary(normalizedBody),
        metadata: {
          field: "comment",
          commentId: created.id,
          commentPreview: commentPreview(normalizedBody),
        } as Prisma.InputJsonValue,
      },
    });
    await tx.bug.update({
      where: { id: bugId },
      data: { updatedAt: new Date() },
    });
    // Commenting on an issue means you want to hear about replies (#216).
    await ensureWatching(tx, bugId, [userId]);
    return created.id;
  });

  const mentioned = extractMentionedUserIds(normalizedBody);
  const author = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const actor = {
    actorId: userId,
    actorName: author?.name ?? "Someone",
    bugId,
    bugTitle: bug.title,
  };
  const excerpt = commentPreview(normalizedBody);
  const events: NotificationEvent[] = [];
  if (mentioned.length > 0) {
    events.push({ ...actor, kind: "mentioned", place: "comment", recipientIds: mentioned, excerpt, commentId });
  }
  // Watchers hear about every new comment (#216). The reporter and assignee
  // are the default audience; delivery adds anyone else watching.
  events.push({
    ...actor,
    kind: "comment_added",
    commentId,
    excerpt,
    parentAuthorId,
    recipientIds: [bug.reporterId, bug.assigneeId].filter((id): id is string => Boolean(id)),
    excludeIds: mentioned,
  });
  notifyLater(...events);

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

  const limit = checkRateLimit(
    `toggle-vote:${userId}`,
    ACTION_RATE_LIMITS.toggleVote,
  );
  if (!limit.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { id: true, isDeleted: true },
  });
  if (!bug || bug.isDeleted) {
    return { error: "Issue not found" };
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.vote.findUnique({
      where: { userId_bugId: { userId, bugId } },
    });

    const currentVote = existing?.value ?? 0;
    const { nextVote, countDelta } = calculateVoteChange(currentVote, direction);

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
  });

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

  const limit = checkRateLimit(
    `self-assign:${userId}`,
    ACTION_RATE_LIMITS.selfAssign,
  );
  if (!limit.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

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
      // Taking an issue means watching it (#216).
      await ensureWatching(tx, bugId, [targetAssigneeId]);

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


