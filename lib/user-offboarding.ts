import "server-only";
import type { PrismaClient } from "@prisma/client";

/**
 * Internal offboarding operation for trusted administrative callers (#356).
 * Reassign reported bugs, authored comments, and activity history to an existing
 * retention account before deletion, all in one transaction.
 * Assignees are cleared and user-owned dependent rows follow their FK policies.
 * Callers must authorize offboarding before invoking this helper.
 *
 * Rejects with Error if both user IDs match, or Prisma P2025 if either user is
 * missing. Other database errors propagate; a failed transaction rolls back
 * all changes.
 */
export async function offboardUser(
  db: PrismaClient,
  userId: string,
  replacementUserId: string,
): Promise<void> {
  if (userId === replacementUserId) {
    throw new Error("The replacement user must be a different account");
  }

  await db.$transaction(async (tx) => {
    await tx.user.findUniqueOrThrow({ where: { id: replacementUserId } });

    await tx.bug.updateMany({
      where: { reporterId: userId },
      data: { reporterId: replacementUserId },
    });
    await tx.comment.updateMany({
      where: { authorId: userId },
      data: { authorId: replacementUserId },
    });
    await tx.bugActivity.updateMany({
      where: { actorId: userId },
      data: { actorId: replacementUserId },
    });

    await tx.user.delete({ where: { id: userId } });
  });
}
