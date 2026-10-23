import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { IssueApiError } from "@/lib/agent-api/issues";
import { isConfirmed } from "@/lib/agent-api/validation";
import { publish } from "@/lib/agent-api/events";
import { parseIssueRef } from "@/lib/issue-ref";

export const INTEREST_NOTE_MAX = 500;
export const DEFAULT_VOLUNTEER_WINDOW_MS = 2 * 60 * 1000; // 2 minutes after confirmation

const id = z.string().trim().min(1).max(191);

export const interestSchema = z
  .object({
    projectId: id.optional(),
    note: z
      .string()
      .trim()
      .max(INTEREST_NOTE_MAX, `The note must be ${INTEREST_NOTE_MAX} characters or fewer.`)
      .optional(),
  })
  .strict();

export type InterestInput = z.infer<typeof interestSchema>;

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Registers an agent's interest (volunteer) to work on a confirmed issue (#589).
 * - Must be a confirmed, open issue.
 * - Idempotent: repeat calls return the existing interest record.
 * - Restores withdrawn interest if previously withdrawn.
 * - Publishes `issue.interest` event.
 */
export async function registerInterest(
  caller: AgentContext,
  projectId: string,
  bugId: string,
  note?: string,
) {
  const ref = parseIssueRef(bugId);
  return prisma.$transaction(async (tx) => {
    const locked = ref.kind === "number"
      ? await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Bug" WHERE "number" = ${ref.number} AND "tenantId" = ${caller.tenantId} AND "projectId" = ${projectId} AND "isDeleted" = false FOR NO KEY UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Bug" WHERE "id" = ${ref.id} AND "tenantId" = ${caller.tenantId} AND "projectId" = ${projectId} AND "isDeleted" = false FOR NO KEY UPDATE`;
    if (!locked.length) throw new IssueApiError(404, "Issue not found in this project.");

    const resolvedBugId = locked[0].id;
    const bug = await tx.bug.findFirst({
      where: { id: resolvedBugId, tenantId: caller.tenantId, projectId, isDeleted: false },
      select: { id: true, projectId: true, status: true },
    });
    if (!bug) throw new IssueApiError(404, "Issue not found in this project.");
    if (bug.status !== "open") throw new IssueApiError(409, "Only open issues can take volunteers.");
    if (!(await isConfirmed(resolvedBugId, tx))) {
      throw new IssueApiError(409, "The issue must be confirmed before an agent can volunteer.");
    }

    const activeClaim = await tx.issueClaim.findFirst({
      where: { bugId: resolvedBugId, status: "active", releasedAt: null },
      select: { id: true },
    });
    if (activeClaim) throw new IssueApiError(409, "This issue is already being worked.");

    const existing = await tx.issueInterest.findUnique({
      where: { bugId_agentId: { bugId: resolvedBugId, agentId: caller.agentId } },
    });

    if (existing && !existing.withdrawnAt) {
      // Idempotent: if note is unchanged or empty, return existing; otherwise update note
      if (note && note !== existing.note) {
        const updated = await tx.issueInterest.update({
          where: { id: existing.id },
          data: { note },
        });
        return { interest: updated, created: false as const };
      }
      return { interest: existing, created: false as const };
    }

    const interest = existing
      ? await tx.issueInterest.update({
          where: { id: existing.id },
          data: {
            note: note ?? null,
            withdrawnAt: null,
            beneficiaryUserId: caller.ownerId,
          },
        })
      : await tx.issueInterest.create({
          data: {
            bugId: resolvedBugId,
            agentId: caller.agentId,
            beneficiaryUserId: caller.ownerId,
            note: note ?? null,
          },
        });

    await publish(tx, {
      tenantId: caller.tenantId,
      type: "issue.interest",
      actorAgentId: caller.agentId,
      bugId: resolvedBugId,
      payload: {
        interestId: interest.id,
        issueId: resolvedBugId,
        projectId,
        agentId: caller.agentId,
        beneficiaryUserId: caller.ownerId,
        note: interest.note,
      },
    });

    return { interest, created: true as const };
  });
}

/**
 * Withdraws an agent's registered interest (#589).
 * Idempotent: calling again on an already withdrawn interest succeeds.
 */
export async function withdrawInterest(
  caller: AgentContext,
  projectId: string,
  bugId: string,
) {
  const ref = parseIssueRef(bugId);
  return prisma.$transaction(async (tx) => {
    const bug = await tx.bug.findFirst({
      where: {
        tenantId: caller.tenantId,
        projectId,
        isDeleted: false,
        ...(ref.kind === "number" ? { number: ref.number } : { id: ref.id }),
      },
      select: { id: true },
    });
    if (!bug) throw new IssueApiError(404, "Interest not found.");

    const interest = await tx.issueInterest.findUnique({
      where: { bugId_agentId: { bugId: bug.id, agentId: caller.agentId } },
      include: { bug: { select: { tenantId: true, projectId: true, isDeleted: true } } },
    });

    if (
      !interest ||
      interest.bug.tenantId !== caller.tenantId ||
      interest.bug.projectId !== projectId ||
      interest.bug.isDeleted
    ) {
      throw new IssueApiError(404, "Interest not found.");
    }

    if (interest.withdrawnAt) {
      return { interest, withdrawn: true as const };
    }

    const updated = await tx.issueInterest.update({
      where: { id: interest.id },
      data: { withdrawnAt: new Date() },
    });

    return { interest: updated, withdrawn: true as const };
  });
}

/**
 * Counts the active (non-withdrawn) volunteers for an issue (#589).
 */
export async function countVolunteers(bugId: string, db: Db = prisma): Promise<number> {
  if (typeof (db as { issueInterest?: unknown }).issueInterest === "undefined") {
    return 0;
  }
  return db.issueInterest.count({
    where: { bugId, withdrawnAt: null },
  });
}

/**
 * Lists active volunteers for an issue (#589).
 */
export async function listVolunteers(
  caller: AgentContext,
  projectId: string,
  bugId: string,
  db: Db = prisma,
) {
  const ref = parseIssueRef(bugId);
  const bug = await db.bug.findFirst({
    where: {
      tenantId: caller.tenantId,
      projectId,
      isDeleted: false,
      ...(ref.kind === "number" ? { number: ref.number } : { id: ref.id }),
    },
    select: { id: true },
  });
  if (!bug) throw new IssueApiError(404, "Issue not found in this project.");

  return db.issueInterest.findMany({
    where: { bugId: bug.id, withdrawnAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      agentId: true,
      beneficiaryUserId: true,
      note: true,
      createdAt: true,
      agent: { select: { name: true } },
    },
  });
}
